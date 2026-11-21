"use strict";

// Đo tải API phòng thời gian thực: N client giả lập (mỗi phòng 4 người) poll với since_version ~1 lần/giây.
//   node tests/load_test.js http://127.0.0.1:8788/api_zingplay [clients=20] [seconds=60]
// Cần một server PHP đang chạy trên database thật (xem README mục "Đo tải").

const base = process.argv[2] || "http://127.0.0.1:8788/api_zingplay";
const clientCount = Number(process.argv[3] || 20);
const seconds = Number(process.argv[4] || 60);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const samples = { light: [], full: [] };
let errors = 0;
let total = 0;

async function call(route, token, body) {
  const started = performance.now();
  let response;
  try {
    response = await fetch(`${base}${route}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    errors++;
    return { status: 0, body: {}, ms: 0 };
  }
  const json = await response.json().catch(() => ({}));
  return { status: response.status, body: json, ms: performance.now() - started };
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function summarize(name, values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  return `${name.padEnd(8)} n=${String(values.length).padStart(6)}  mean=${mean.toFixed(1)}ms  p50=${percentile(values, 50).toFixed(1)}ms  `
    + `p95=${percentile(values, 95).toFixed(1)}ms  p99=${percentile(values, 99).toFixed(1)}ms  max=${Math.max(0, ...values).toFixed(1)}ms`;
}

async function main() {
  const run = String(Date.now()).slice(-6);
  const users = [];
  for (let index = 0; index < clientCount; index++) {
    const phone = `09${run}${String(index).padStart(2, "0")}`;
    const registered = await call("/auth/register", null, { phone, password: "load" });
    if (registered.status !== 201) throw new Error(`Đăng ký thất bại: ${JSON.stringify(registered.body)}`);
    users.push({ token: registered.body.accessToken, version: null, code: null });
  }
  for (let start = 0; start < users.length; start += 4) {
    const group = users.slice(start, start + 4);
    const created = await call("/rooms", group[0].token, { autoPlay: true, maxPlayers: group.length, stake: 50, isPublic: true });
    if (created.status !== 201) throw new Error(`Tạo phòng thất bại: ${JSON.stringify(created.body)}`);
    group[0].code = created.body.room.code;
    group[0].version = created.body.version;
    for (const member of group.slice(1)) {
      const joined = await call("/rooms/join", member.token, { code: group[0].code });
      if (joined.status !== 200) throw new Error(`Vào phòng thất bại: ${JSON.stringify(joined.body)}`);
      member.code = group[0].code;
    }
  }

  const deadline = Date.now() + seconds * 1000;
  const startedAt = Date.now();
  let rounds = 0;
  await Promise.all(users.map(async (user, index) => {
    await sleep((index * 997) % 1000);
    while (Date.now() < deadline) {
      const query = user.version === null ? "" : `?since_version=${user.version}`;
      const result = await call(`/rooms/${user.code}${query}`, user.token);
      total++;
      if (result.status === 200) {
        if (result.body.changed === false) {
          samples.light.push(result.ms);
        } else {
          samples.full.push(result.ms);
          user.version = result.body.version;
          if (index % 4 === 0 && result.body.room.phase === "summary" && result.body.results) rounds = Math.max(rounds, result.body.results.round);
        }
      } else {
        errors++;
      }
      await sleep(1000 + (index % 5) * 20);
    }
  }));
  const elapsed = (Date.now() - startedAt) / 1000;
  const all = [...samples.light, ...samples.full];
  console.log(`Client: ${clientCount}, thời gian: ${elapsed.toFixed(1)}s, request poll: ${total}, lỗi: ${errors}, số ván hoàn thành (phòng 1): ${rounds}`);
  console.log(`Thông lượng: ${(total / elapsed).toFixed(1)} request/giây`);
  console.log(summarize("poll nhẹ", samples.light));
  console.log(summarize("snapshot", samples.full));
  console.log(summarize("tất cả", all));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
