"use strict";

const http = require("node:http");
const { randomBytes, randomUUID } = require("node:crypto");
const mysql = require("mysql2/promise");
const { WebSocketServer, WebSocket } = require("ws");
const {
  hashPassword,
  hashToken,
  normalizePhone,
  newAccessToken,
  readBearerToken,
  validPassword,
  verifyPassword,
} = require("./auth");
const { compareResults, createDeck, validateArrangement } = require("./rules");

const PORT = Number(process.env.PORT || 8787);
const MAX_ROOMS = 200;
const ROOM_TTL_MS = 3 * 60 * 60 * 1000;
const FINISHED_ROOM_TTL_MS = 10 * 60 * 1000;
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_HTTP_BODY = 16 * 1024;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

for (const name of ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"]) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  charset: "utf8mb4",
  timezone: "Z",
});
const rooms = new Map();
const connections = new Map();

function isAllowedOrigin(origin) {
  if (!origin) return true;
  const localOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return localOrigin || ALLOWED_ORIGINS.includes(origin);
}

function jsonResponse(response, status, payload, origin) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...(origin ? {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Vary": "Origin",
    } : {}),
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_HTTP_BODY) {
      const error = new Error("Request body is too large.");
      error.status = 413;
      throw error;
    }
  }
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Expected an object.");
    }
    return parsed;
  } catch {
    const error = new Error("Yêu cầu JSON không hợp lệ.");
    error.status = 400;
    throw error;
  }
}

function publicUser(row) {
  return { id: row.id, phone: row.phone, displayName: row.display_name };
}

function parseJsonColumn(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function findSession(token) {
  if (!token) return null;
  const [rows] = await pool.execute(
    `SELECT users.id, users.phone, users.display_name
       FROM sessions
       JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > UTC_TIMESTAMP()
      LIMIT 1`,
    [hashToken(token)],
  );
  return rows[0] || null;
}

function tokenFromRequest(request) {
  return readBearerToken(request.headers.authorization);
}

async function createSession(userId) {
  const token = newAccessToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await pool.execute(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
    [hashToken(token), userId, expiresAt],
  );
  return { token, expiresAt: expiresAt.toISOString() };
}

async function handleApi(request, response) {
  const origin = request.headers.origin;
  if (!isAllowedOrigin(origin)) return jsonResponse(response, 403, { error: "Origin không được phép." });
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "600",
      "Vary": "Origin",
    });
    return response.end();
  }

  const url = new URL(request.url, "http://localhost");
  if (url.pathname === "/api/health" && request.method === "GET") {
    await pool.query("SELECT 1");
    return jsonResponse(response, 200, { status: "ok", service: "api_zingplay" }, origin);
  }

  if (url.pathname === "/api/auth/register" && request.method === "POST") {
    const body = await readJsonBody(request);
    const phone = normalizePhone(body.phone);
    if (!phone) {
      return jsonResponse(response, 400, { error: "Số điện thoại cần có mã quốc gia và 8–15 chữ số." }, origin);
    }
    if (!validPassword(body.password)) {
      return jsonResponse(response, 400, { error: "Mật khẩu cần dài từ 8 đến 128 ký tự." }, origin);
    }

    const id = randomUUID();
    const displayName = `Người chơi ${id.slice(0, 4).toUpperCase()}`;
    const credentials = await hashPassword(body.password);
    try {
      await pool.execute(
        `INSERT INTO users (id, phone, display_name, password_salt, password_hash)
         VALUES (?, ?, ?, ?, ?)`,
        [id, phone, displayName, credentials.salt, credentials.hash],
      );
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return jsonResponse(response, 409, { error: "Số điện thoại này đã được đăng ký." }, origin);
      }
      throw error;
    }

    const user = { id, phone, display_name: displayName };
    const session = await createSession(id);
    return jsonResponse(response, 201, {
      accessToken: session.token,
      expiresAt: session.expiresAt,
      user: publicUser(user),
    }, origin);
  }

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    const body = await readJsonBody(request);
    const phone = normalizePhone(body.phone);
    if (!phone || !validPassword(body.password)) {
      return jsonResponse(response, 400, { error: "Số điện thoại hoặc mật khẩu không hợp lệ." }, origin);
    }
    const [rows] = await pool.execute(
      "SELECT id, phone, display_name, password_salt, password_hash FROM users WHERE phone = ? LIMIT 1",
      [phone],
    );
    const user = rows[0];
    const passwordMatches = await verifyPassword(
      body.password,
      user?.password_salt,
      user?.password_hash,
    );
    if (!user || !passwordMatches) {
      return jsonResponse(response, 401, { error: "Số điện thoại hoặc mật khẩu không đúng." }, origin);
    }
    const session = await createSession(user.id);
    return jsonResponse(response, 200, {
      accessToken: session.token,
      expiresAt: session.expiresAt,
      user: publicUser(user),
    }, origin);
  }

  if (url.pathname === "/api/auth/me" && request.method === "GET") {
    const user = await findSession(tokenFromRequest(request));
    if (!user) return jsonResponse(response, 401, { error: "Phiên đăng nhập đã hết hạn." }, origin);
    return jsonResponse(response, 200, { user: publicUser(user) }, origin);
  }

  if (url.pathname === "/api/matches" && request.method === "GET") {
    const user = await findSession(tokenFromRequest(request));
    if (!user) return jsonResponse(response, 401, { error: "Phiên đăng nhập đã hết hạn." }, origin);
    const requestedLimit = url.searchParams.get("limit");
    const limit = requestedLimit === null ? 20 : Number(requestedLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      return jsonResponse(response, 400, { error: "limit cần là số nguyên từ 1 đến 50." }, origin);
    }
    const [rows] = await pool.execute(
      `SELECT matches.id, matches.room_code, matches.player_count,
              matches.started_at, matches.finished_at, match_players.display_name,
              match_players.points, match_players.hands_json, match_players.chi_results_json
         FROM matches
         JOIN match_players ON match_players.match_id = matches.id
        WHERE match_players.user_id = ?
        ORDER BY matches.finished_at DESC
        LIMIT ?`,
      [user.id, limit],
    );
    return jsonResponse(response, 200, {
      matches: rows.map((match) => ({
        id: match.id,
        roomCode: match.room_code,
        playerCount: match.player_count,
        startedAt: match.started_at,
        finishedAt: match.finished_at,
        displayName: match.display_name,
        points: match.points,
        hands: parseJsonColumn(match.hands_json),
        chiResults: parseJsonColumn(match.chi_results_json),
      })),
    }, origin);
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    const token = tokenFromRequest(request);
    if (token) await pool.execute("DELETE FROM sessions WHERE token_hash = ?", [hashToken(token)]);
    return jsonResponse(response, 200, { status: "ok" }, origin);
  }

  return jsonResponse(response, 404, { error: "Không tìm thấy API." }, origin);
}

const server = http.createServer((request, response) => {
  handleApi(request, response).catch((error) => {
    console.error("Xử lý API thất bại:", error);
    if (response.headersSent) return response.destroy();
    jsonResponse(response, error.status || 500, {
      error: error.status ? error.message : "Máy chủ không thể xử lý yêu cầu. Vui lòng thử lại.",
    }, isAllowedOrigin(request.headers.origin) ? request.headers.origin : undefined);
  });
});
const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024, perMessageDeflate: false });

server.on("upgrade", (request, socket, head) => {
  if (!isAllowedOrigin(request.headers.origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
    webSocketServer.emit("connection", webSocket, request);
  });
});

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    started: room.started,
    finished: room.finished,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      submitted: Boolean(player.arrangement),
    })),
  };
}

function broadcast(room, payload) {
  const message = JSON.stringify(payload);
  for (const player of room.players) {
    if (player.socket.readyState === WebSocket.OPEN) player.socket.send(message);
  }
}

function notifyRoom(room) {
  for (const player of room.players) {
    send(player.socket, { type: "room", room: publicRoom(room), playerId: player.id });
  }
}

function error(socket, message) {
  send(socket, { type: "error", message });
}

function generateCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from(randomBytes(5), (byte) => alphabet[byte % alphabet.length]).join("");
  } while (rooms.has(code));
  return code;
}

function roomFor(socket) {
  const playerId = connections.get(socket)?.playerId;
  const roomCode = connections.get(socket)?.roomCode;
  const room = rooms.get(roomCode);
  const player = room?.players.find((entry) => entry.id === playerId);
  return room && player ? { room, player } : null;
}

function createRoom(socket) {
  const connection = connections.get(socket);
  if (connection.roomCode) return error(socket, "Bạn đang ở trong một phòng.");
  if (rooms.size >= MAX_ROOMS) return error(socket, "Máy chủ đã đầy phòng, vui lòng thử lại sau.");
  const room = {
    code: generateCode(),
    createdAt: Date.now(),
    hostId: null,
    players: [],
    started: false,
    finished: false,
  };
  const player = {
    id: randomUUID(),
    userId: connection.userId,
    name: connection.name,
    socket,
    hand: [],
    arrangement: null,
  };
  room.hostId = player.id;
  room.players.push(player);
  rooms.set(room.code, room);
  connection.roomCode = room.code;
  connection.playerId = player.id;
  notifyRoom(room);
}

function joinRoom(socket, code) {
  const connection = connections.get(socket);
  if (connection.roomCode) return error(socket, "Bạn đang ở trong một phòng.");
  const room = rooms.get(code);
  if (!room) return error(socket, "Không tìm thấy phòng với mã này.");
  if (room.started || room.finished) return error(socket, "Ván đã bắt đầu; không thể vào phòng lúc này.");
  if (room.players.length >= 4) return error(socket, "Phòng đã đủ 4 người chơi.");
  if (room.players.some((player) => player.userId === connection.userId)) {
    return error(socket, "Tài khoản này đã có trong phòng.");
  }
  const player = {
    id: randomUUID(),
    userId: connection.userId,
    name: connection.name,
    socket,
    hand: [],
    arrangement: null,
  };
  room.players.push(player);
  connection.roomCode = room.code;
  connection.playerId = player.id;
  notifyRoom(room);
}

function startGame(socket) {
  const current = roomFor(socket);
  if (!current) return error(socket, "Bạn chưa ở trong phòng.");
  const { room, player } = current;
  if (room.hostId !== player.id) return error(socket, "Chỉ chủ phòng mới có thể chia bài.");
  if (room.started) return error(socket, "Ván này đã bắt đầu.");
  if (room.players.length < 2) return error(socket, "Cần ít nhất 2 người để bắt đầu.");

  const deck = createDeck();
  room.startedAt = Date.now();
  room.players.forEach((entry, playerIndex) => {
    entry.hand = deck.slice(playerIndex * 13, (playerIndex + 1) * 13);
    entry.arrangement = null;
    send(entry.socket, { type: "hand", room: publicRoom(room), cards: entry.hand });
  });
  room.started = true;
  broadcast(room, { type: "game", room: publicRoom(room) });
}

async function persistCompletedMatch(room, results) {
  const connection = await pool.getConnection();
  const matchId = randomUUID();
  const finishedAt = new Date();
  const resultsByPlayer = new Map(results.map((result) => [result.id, result]));
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO matches (id, room_code, player_count, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?)`,
      [matchId, room.code, room.players.length, new Date(room.startedAt), finishedAt],
    );
    for (const [seatNumber, player] of room.players.entries()) {
      const result = resultsByPlayer.get(player.id);
      if (!result) throw new Error(`Missing result for player ${player.id}`);
      await connection.execute(
        `INSERT INTO match_players
          (match_id, user_id, seat_number, display_name, points, hands_json, chi_results_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          matchId,
          player.userId,
          seatNumber + 1,
          player.name,
          result.points,
          JSON.stringify(player.arrangement),
          JSON.stringify(result.chi),
        ],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function submitArrangement(socket, arrangement) {
  const current = roomFor(socket);
  if (!current) return error(socket, "Bạn chưa ở trong phòng.");
  const { room, player } = current;
  if (!room.started || room.finished) return error(socket, "Hiện không có ván bài đang diễn ra.");
  if (player.arrangement) return error(socket, "Bạn đã chốt bài rồi.");

  const result = validateArrangement(player.hand, arrangement);
  if (!result.valid) return error(socket, result.message);
  player.arrangement = result.hands;

  if (room.players.every((entry) => entry.arrangement)) {
    room.finished = true;
    const completedRoom = {
      ...room,
      players: room.players.map((entry) => ({ ...entry })),
    };
    const results = compareResults(
      room.players.map((entry) => ({
        id: entry.id,
        name: entry.name,
        hands: entry.arrangement,
      })),
    );
    let historySaved = true;
    try {
      await persistCompletedMatch(completedRoom, results);
    } catch (saveError) {
      historySaved = false;
      console.error("Không lưu được lịch sử ván:", saveError);
    }
    broadcast(room, {
      type: "results",
      room: publicRoom(room),
      results: { players: results },
      historySaved,
    });
  } else {
    broadcast(room, { type: "game", room: publicRoom(room) });
  }
}

function leaveRoom(socket, announce = true) {
  const current = roomFor(socket);
  if (!current) return;
  const { room, player } = current;
  const connection = connections.get(socket);
  if (connection) {
    connection.roomCode = null;
    connection.playerId = null;
  }
  room.players = room.players.filter((entry) => entry.id !== player.id);

  if (room.started && !room.finished) {
    broadcast(room, {
      type: "error",
      message: `${player.name} đã rời phòng. Ván bị hủy; hãy tạo phòng mới.`,
    });
    for (const entry of room.players) {
      const otherConnection = connections.get(entry.socket);
      if (otherConnection) {
        otherConnection.roomCode = null;
        otherConnection.playerId = null;
      }
      entry.socket.close(1000, "Round cancelled");
    }
    rooms.delete(room.code);
  } else if (room.players.length === 0) {
    rooms.delete(room.code);
  } else {
    if (room.hostId === player.id) room.hostId = room.players[0].id;
    if (announce) notifyRoom(room);
  }
}

function handleMessage(socket, message) {
  const connection = connections.get(socket);
  if (!connection.authenticated) {
    if (message?.type !== "authenticate" || typeof message.token !== "string") {
      socket.close(4401, "Authentication required");
      return;
    }
    if (connection.authPending) return;
    connection.authPending = true;
    findSession(message.token).then((user) => {
      if (!user || socket.readyState !== WebSocket.OPEN) {
        socket.close(4401, "Invalid or expired token");
        return;
      }
      connection.authenticated = true;
      connection.userId = user.id;
      connection.name = user.display_name;
      clearTimeout(connection.authTimer);
      send(socket, { type: "authenticated", user: publicUser(user) });
    }).catch((authError) => {
      console.error("Xác thực kết nối realtime thất bại:", authError);
      socket.close(1011, "Authentication failed");
    });
    return;
  }
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return error(socket, "Yêu cầu không hợp lệ.");
  }
  if (message.type === "create") return createRoom(socket);
  if (message.type === "join") {
    const code = typeof message.code === "string" ? message.code.trim().toUpperCase() : "";
    if (!/^[A-Z2-9]{5}$/.test(code)) return error(socket, "Mã phòng cần có 5 ký tự.");
    return joinRoom(socket, code);
  }
  if (message.type === "start") return startGame(socket);
  if (message.type === "submit") {
    return submitArrangement(socket, message.arrangement).catch((requestError) => {
      console.error("Xử lý kết quả ván thất bại:", requestError);
      error(socket, "Máy chủ không thể lưu kết quả ván. Vui lòng thử lại.");
    });
  }
  if (message.type === "leave") {
    leaveRoom(socket);
    send(socket, { type: "left" });
    return;
  }
  error(socket, "Loại yêu cầu không được hỗ trợ.");
}

webSocketServer.on("connection", (socket) => {
  const connection = { authenticated: false, authPending: false, roomCode: null, playerId: null, messageTimes: [] };
  connection.authTimer = setTimeout(() => socket.close(4401, "Authentication timeout"), 10_000);
  connections.set(socket, connection);
  socket.on("message", (data) => {
    const now = Date.now();
    connection.messageTimes = connection.messageTimes.filter((time) => now - time < 10_000);
    if (connection.messageTimes.length >= 60) {
      error(socket, "Bạn gửi yêu cầu quá nhanh.");
      return;
    }
    connection.messageTimes.push(now);

    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return error(socket, "Dữ liệu gửi lên không phải JSON hợp lệ.");
    }
    try {
      handleMessage(socket, message);
    } catch (requestError) {
      console.error("Xử lý yêu cầu game thất bại:", requestError);
      error(socket, "Máy chủ không thể xử lý yêu cầu. Vui lòng thử lại.");
    }
  });
  socket.on("close", () => {
    clearTimeout(connection.authTimer);
    leaveRoom(socket);
    connections.delete(socket);
  });
});

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const ttl = room.finished ? FINISHED_ROOM_TTL_MS : ROOM_TTL_MS;
    if (now - room.createdAt > ttl) {
      for (const player of room.players) {
        const connection = connections.get(player.socket);
        if (connection) {
          connection.roomCode = null;
          connection.playerId = null;
        }
        error(player.socket, "Phòng đã hết hạn.");
        player.socket.close(1000, "Room expired");
      }
      rooms.delete(code);
    }
  }
}, 60_000);
cleanupTimer.unref();

server.on("listening", () => {
  console.log(`ZingPlay API và WebSocket đang chạy tại http://localhost:${PORT}`);
  if (ALLOWED_ORIGINS.length) console.log(`Origin được phép: ${ALLOWED_ORIGINS.join(", ")}`);
});

function shutdown() {
  clearInterval(cleanupTimer);
  for (const socket of webSocketServer.clients) socket.close(1001, "Server shutting down");
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
server.listen(PORT);
