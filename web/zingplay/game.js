"use strict";

(() => {
  const $ = (selector) => document.querySelector(selector);
  const connectionPanel = $("#connection-panel");
  const authPanel = $("#auth-panel");
  const roomPanel = $("#room-panel");
  const gamePanel = $("#game-panel");
  const statusText = $("#connection-status");
  const authStatus = $("#auth-status");
  const setupForm = $("#setup-form");
  const authForm = $("#auth-form");
  const createButton = $("#create-button");
  const joinButton = $("#join-button");
  const startButton = $("#start-button");
  const leaveButton = $("#leave-button");
  const submitButton = $("#submit-button");
  const roomCodeInput = $("#room-code-input");
  const roomName = $("#room-code");
  const authToggle = $("#auth-toggle");
  let authMode = "login";
  const piles = {
    front: $("#front-cards"),
    middle: $("#middle-cards"),
    back: $("#back-cards"),
  };
  const capacities = { front: 3, middle: 5, back: 5 };
  const state = {
    socket: null,
    token: sessionStorage.getItem("zingplay_access_token"),
    user: null,
    room: null,
    playerId: null,
    hand: [],
    selectedCard: null,
    arranged: { front: [], middle: [], back: [] },
    submitted: false,
  };

  function setStatus(message, isError = false) {
    statusText.textContent = message;
    statusText.classList.toggle("error", isError);
  }

  function setGameStatus(message) {
    $("#game-status").textContent = message;
  }

  function defaultServerUrl() {
    if (location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      return "wss://blastbaal.id.vn/ws";
    }
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${location.hostname || "localhost"}:8787/ws`;
  }

  function defaultApiUrl() {
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      return "http://localhost:8787/api";
    }
    return "https://blastbaal.id.vn/api";
  }

  function setAuthStatus(message, isError = false) {
    authStatus.textContent = message;
    authStatus.classList.toggle("error", isError);
  }

  function setAuthMode(mode) {
    authMode = mode;
    const registering = authMode === "register";
    $("#confirm-password-field").hidden = !registering;
    $("#auth-password-confirm").required = registering;
    $("#auth-password").autocomplete = registering ? "new-password" : "current-password";
    $("#auth-submit").textContent = registering ? "TẠO TÀI KHOẢN" : "ĐĂNG NHẬP";
    authToggle.textContent = registering
      ? "Đã có tài khoản? Đăng nhập"
      : "Chưa có tài khoản? Đăng ký";
    setAuthStatus(registering ? "Đăng ký bằng số điện thoại và mật khẩu." : "Đăng nhập để bắt đầu chơi.");
  }

  async function apiRequest(path, { method = "GET", body, token = state.token } = {}) {
    const apiUrl = $("#api-url").value.trim().replace(/\/+$/, "");
    let apiAddress;
    try {
      apiAddress = new URL(apiUrl);
    } catch {
      throw new Error("Địa chỉ API không hợp lệ.");
    }
    const localApi = ["localhost", "127.0.0.1"].includes(apiAddress.hostname);
    if (apiAddress.protocol !== "https:" && !(localApi && apiAddress.protocol === "http:")) {
      throw new Error("API trên Internet phải dùng HTTPS.");
    }
    let response;
    try {
      response = await fetch(`${apiUrl}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new Error("Không kết nối được API. Kiểm tra địa chỉ máy chủ và kết nối mạng.");
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error("API trả về dữ liệu không hợp lệ.");
    }
    if (!response.ok) throw new Error(payload.error || `API trả về lỗi ${response.status}.`);
    return payload;
  }

  function enterGameAccount(user, token) {
    if (!user || typeof user.displayName !== "string" || typeof token !== "string") {
      throw new Error("API không trả về thông tin tài khoản hợp lệ.");
    }
    state.user = user;
    state.token = token;
    sessionStorage.setItem("zingplay_access_token", token);
    $("#account-name").textContent = `${user.displayName} · ${user.phone}`;
    authPanel.hidden = true;
    connectionPanel.hidden = false;
  }

  async function restoreSession() {
    if (!state.token) return;
    setAuthStatus("Đang kiểm tra phiên đăng nhập…");
    try {
      const { user } = await apiRequest("/auth/me");
      enterGameAccount(user, state.token);
    } catch (error) {
      state.token = null;
      sessionStorage.removeItem("zingplay_access_token");
      setAuthStatus(`${error.message} Vui lòng đăng nhập lại.`, true);
    }
  }

  function send(type, payload = {}) {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
      setStatus("Chưa kết nối được máy chủ.", true);
      return;
    }
    state.socket.send(JSON.stringify({ type, ...payload }));
  }

  function connect(action, payload) {
    const url = $("#server-url").value.trim();
    if (!state.token || !state.user) {
      setStatus("Bạn cần đăng nhập trước khi vào phòng.", true);
      return;
    }
    if (!url) {
      setStatus("Nhập địa chỉ máy chủ WebSocket trước khi tiếp tục.", true);
      return;
    }
    let socketAddress;
    try {
      socketAddress = new URL(url);
    } catch {
      setStatus("Địa chỉ WebSocket không hợp lệ.", true);
      return;
    }
    const localSocket = ["localhost", "127.0.0.1"].includes(socketAddress.hostname);
    if (socketAddress.protocol !== "wss:" && !(localSocket && socketAddress.protocol === "ws:")) {
      setStatus("Máy chủ online phải dùng WSS.", true);
      return;
    }
    if (action === "join" && !roomCodeInput.value.trim()) {
      setStatus("Nhập mã phòng để tham gia.", true);
      return;
    }

    state.pendingAction = { type: action, payload };
    createButton.disabled = true;
    joinButton.disabled = true;
    setStatus("Đang kết nối máy chủ…");
    try {
      state.socket = new WebSocket(url);
    } catch (error) {
      setStatus(`Địa chỉ WebSocket không hợp lệ: ${error.message}`, true);
      resetConnectionButtons();
      return;
    }

    state.socket.addEventListener("open", () => {
      send("authenticate", { token: state.token });
    });
    state.socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        setStatus("Máy chủ gửi dữ liệu không hợp lệ.", true);
        return;
      }
      handleMessage(message);
    });
    state.socket.addEventListener("error", () => {
      setStatus("Không thể kết nối. Kiểm tra địa chỉ và trạng thái máy chủ.", true);
    });
    state.socket.addEventListener("close", () => {
      if (!roomPanel.hidden || !gamePanel.hidden) {
        setGameStatus("Mất kết nối máy chủ. Hãy tải lại trang để kết nối lại.");
      } else {
        setStatus("Đã ngắt kết nối máy chủ.", true);
      }
      resetConnectionButtons();
    });
  }

  function resetConnectionButtons() {
    createButton.disabled = false;
    joinButton.disabled = false;
  }

  function handleMessage(message) {
    if (message.type === "authenticated") {
      state.user = message.user;
      send(state.pendingAction.type, state.pendingAction.payload);
      state.pendingAction = null;
      return;
    }
    if (message.type === "error") {
      setStatus(message.message, true);
      setGameStatus(message.message);
      resetConnectionButtons();
      return;
    }
    if (message.type === "room") {
      state.room = message.room;
      state.playerId = message.playerId;
      renderRoom();
      return;
    }
    if (message.type === "hand") {
      state.room = message.room;
      state.hand = message.cards;
      state.arranged = { front: [], middle: [], back: [] };
      state.selectedCard = null;
      state.submitted = false;
      $("#results-panel").hidden = true;
      $("#history-save-status").textContent = "";
      connectionPanel.hidden = true;
      roomPanel.hidden = true;
      gamePanel.hidden = false;
      $("#game-room-code").textContent = state.room.code;
      renderGame();
      return;
    }
    if (message.type === "game") {
      state.room = message.room;
      state.submitted = Boolean(
        state.room.players.find((player) => player.id === state.playerId)?.submitted,
      );
      renderGame();
      return;
    }
    if (message.type === "results") {
      state.room = message.room;
      state.submitted = true;
      renderGame();
      renderResults(message.results);
      const historyStatus = $("#history-save-status");
      historyStatus.textContent = message.historySaved
        ? "Kết quả ván đã được lưu vào lịch sử."
        : "Ván đã kết thúc nhưng chưa lưu được lịch sử. Hãy báo quản trị máy chủ.";
      historyStatus.classList.toggle("error", !message.historySaved);
    }
    if (message.type === "left") {
      state.socket?.close();
      state.room = null;
      state.hand = [];
      gamePanel.hidden = true;
      roomPanel.hidden = true;
      connectionPanel.hidden = false;
      setStatus("Bạn đã rời phòng.");
      resetConnectionButtons();
    }
  }

  function renderRoom() {
    connectionPanel.hidden = true;
    gamePanel.hidden = true;
    roomPanel.hidden = false;
    roomName.textContent = state.room.code;
    $("#room-message").textContent = state.room.started
      ? "Ván đã bắt đầu. Hãy hoàn tất ván đang chơi."
      : "Chia sẻ mã phòng với bạn bè để cùng vào bàn.";
    $("#player-count").textContent = `(${state.room.players.length}/4)`;
    const list = $("#player-list");
    list.replaceChildren();
    for (const player of state.room.players) {
      const item = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = player.name;
      item.append(name);
      if (player.id === state.room.hostId) {
        const host = document.createElement("span");
        host.className = "host-tag";
        host.textContent = "CHỦ PHÒNG";
        item.append(host);
      }
      list.append(item);
    }
    startButton.disabled =
      state.room.hostId !== state.playerId ||
      state.room.players.length < 2 ||
      state.room.started;
    startButton.textContent = state.room.started ? "ĐÃ CHIA BÀI" : "CHIA BÀI";
  }

  function makeCard(card, pile, disabled = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `card ${card.suit === "♥" || card.suit === "♦" ? "red" : ""}`;
    button.disabled = disabled;
    button.setAttribute("aria-label", `${card.label} ${pile ? `trong chi ${pile}` : "trên tay"}`);
    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = card.label;
    const suit = document.createElement("span");
    suit.className = "suit";
    suit.textContent = card.suit;
    button.append(rank, suit);
    if (state.selectedCard === card.id && !disabled) button.classList.add("selected");
    button.addEventListener("click", () => {
      if (state.submitted) return;
      if (pile) {
        state.arranged[pile] = state.arranged[pile].filter((item) => item.id !== card.id);
        state.hand.push(card);
      }
      state.selectedCard = state.selectedCard === card.id ? null : card.id;
      $("#arrangement-error").textContent = "";
      renderGame();
    });
    return button;
  }

  function renderGame() {
    $("#game-room-code").textContent = state.room?.code || "";
    $("#opponent-list").replaceChildren();
    for (const player of state.room.players) {
      if (player.id === state.playerId) continue;
      const opponent = document.createElement("div");
      opponent.className = "opponent";
      const name = document.createElement("span");
      name.textContent = player.name;
      const status = document.createElement("small");
      status.textContent = player.submitted ? "Đã chốt bài" : "Đang xếp bài";
      opponent.append(name, status);
      $("#opponent-list").append(opponent);
    }
    $("#hand-count").textContent = `(${state.hand.length} lá)`;
    $("#hand-cards").replaceChildren();
    for (const card of state.hand) $("#hand-cards").append(makeCard(card, null, state.submitted));
    for (const [pile, container] of Object.entries(piles)) {
      container.replaceChildren();
      for (const card of state.arranged[pile]) {
        container.append(makeCard(card, pile, state.submitted));
      }
    }
    submitButton.disabled = state.submitted;
    submitButton.textContent = state.submitted ? "ĐÃ CHỐT BÀI" : "CHỐT BÀI";
    setGameStatus(
      state.submitted
        ? "Đã chốt bài. Đang đợi những người chơi còn lại."
        : "Xếp đủ 13 lá, sau đó chốt bài.",
    );
    if (state.room.finished) $("#results-panel").hidden = false;
  }

  function moveSelectedCard(pile) {
    if (state.submitted || !state.selectedCard) return;
    if (state.arranged[pile].length >= capacities[pile]) {
      $("#arrangement-error").textContent = `${pileName(pile)} đã đủ số lá.`;
      return;
    }
    const index = state.hand.findIndex((card) => card.id === state.selectedCard);
    if (index < 0) return;
    state.arranged[pile].push(state.hand.splice(index, 1)[0]);
    state.selectedCard = null;
    $("#arrangement-error").textContent = "";
    renderGame();
  }

  function pileName(pile) {
    return { front: "Chi đầu", middle: "Chi giữa", back: "Chi cuối" }[pile];
  }

  function submitArrangement() {
    const complete = Object.entries(capacities).every(
      ([pile, count]) => state.arranged[pile].length === count,
    );
    if (!complete || state.hand.length !== 0) {
      $("#arrangement-error").textContent = "Cần xếp đủ 3 lá chi đầu và 5 lá cho mỗi chi giữa, chi cuối.";
      return;
    }
    send("submit", {
      arrangement: {
        front: state.arranged.front.map((card) => card.id),
        middle: state.arranged.middle.map((card) => card.id),
        back: state.arranged.back.map((card) => card.id),
      },
    });
  }

  function renderResults(results) {
    $("#results-panel").hidden = false;
    const table = document.createElement("table");
    table.className = "results-table";
    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const title of ["Người chơi", "Chi đầu", "Chi giữa", "Chi cuối", "Điểm"]) {
      const cell = document.createElement("th");
      cell.textContent = title;
      headerRow.append(cell);
    }
    head.append(headerRow);
    const body = document.createElement("tbody");
    for (const result of results.players) {
      const row = document.createElement("tr");
      const nameCell = document.createElement("td");
      nameCell.textContent = result.name;
      row.append(nameCell);
      for (const key of ["front", "middle", "back"]) {
        const cell = document.createElement("td");
        const outcome = result.chi[key];
        cell.className = outcome.outcome;
        cell.textContent = `${outcome.label} · ${outcome.hand}`;
        row.append(cell);
      }
      const score = document.createElement("td");
      score.textContent = String(result.points);
      row.append(score);
      body.append(row);
    }
    table.append(head, body);
    $("#results-content").replaceChildren(table);
  }

  setupForm.addEventListener("submit", (event) => event.preventDefault());
  $("#server-url").value = defaultServerUrl();
  $("#api-url").value = localStorage.getItem("zingplay_api_url") || defaultApiUrl();
  $("#api-url").addEventListener("change", () => {
    localStorage.setItem("zingplay_api_url", $("#api-url").value.trim());
  });
  authToggle.addEventListener("click", () => setAuthMode(authMode === "login" ? "register" : "login"));
  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = $("#auth-password").value;
    if (authMode === "register" && password !== $("#auth-password-confirm").value) {
      setAuthStatus("Mật khẩu nhập lại không khớp.", true);
      return;
    }
    const submit = $("#auth-submit");
    submit.disabled = true;
    setAuthStatus(authMode === "register" ? "Đang tạo tài khoản…" : "Đang đăng nhập…");
    try {
      const result = await apiRequest(`/auth/${authMode}`, {
        method: "POST",
        body: { phone: $("#auth-phone").value, password },
        token: null,
      });
      enterGameAccount(result.user, result.accessToken);
      authForm.reset();
    } catch (error) {
      setAuthStatus(error.message, true);
    } finally {
      submit.disabled = false;
    }
  });
  $("#logout-button").addEventListener("click", async () => {
    const token = state.token;
    state.socket?.close();
    state.socket = null;
    try {
      await apiRequest("/auth/logout", { method: "POST", token });
      setAuthStatus("Bạn đã đăng xuất.");
    } catch (error) {
      setAuthStatus(`Đã xóa phiên trên trình duyệt nhưng máy chủ chưa xác nhận đăng xuất: ${error.message}`, true);
    }
    sessionStorage.removeItem("zingplay_access_token");
    state.token = null;
    state.user = null;
    state.room = null;
    state.hand = [];
    authForm.reset();
    setAuthMode("login");
    connectionPanel.hidden = true;
    roomPanel.hidden = true;
    gamePanel.hidden = true;
    authPanel.hidden = false;
    resetConnectionButtons();
  });
  restoreSession();
  createButton.addEventListener("click", () => connect("create"));
  joinButton.addEventListener("click", () => {
    connect("join", { code: roomCodeInput.value.trim().toUpperCase() });
  });
  roomCodeInput.addEventListener("input", () => {
    roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });
  startButton.addEventListener("click", () => send("start"));
  leaveButton.addEventListener("click", () => send("leave"));
  submitButton.addEventListener("click", submitArrangement);
  for (const chi of document.querySelectorAll(".chi")) {
    chi.addEventListener("click", (event) => {
      if (!event.target.closest(".card")) moveSelectedCard(chi.dataset.pile);
    });
  }
})();
