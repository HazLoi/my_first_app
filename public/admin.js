"use strict";

(() => {
  const $ = (selector) => document.querySelector(selector);
  const token = sessionStorage.getItem("zingplay_access_token");
  const numberFormat = new Intl.NumberFormat("vi-VN");
  const typeLabels = {
    admin_credit: "Admin cộng",
    admin_debit: "Admin trừ",
    match_result: "Kết quả ván",
    signup_bonus: "Quà đăng ký",
  };
  let selectedUser = null;
  let ledgerUser = null;

  const apiBaseUrl = (["localhost", "127.0.0.1"].includes(location.hostname)
    ? "http://127.0.0.1:8787/api_zingplay"
    : `${location.origin}/api_zingplay`);

  function setStatus(message, isError = false) {
    const status = $("#admin-status");
    status.textContent = message;
    status.classList.toggle("error", isError);
  }

  function setMessage(message, isError = false) {
    const element = $("#admin-message");
    element.textContent = message;
    element.classList.toggle("error", isError);
  }

  async function api(path, body) {
    let response;
    try {
      response = await fetch(`${apiBaseUrl}${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new Error("Không kết nối được API.");
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error("API không trả về JSON.");
    }
    if (!response.ok) throw new Error(payload.error || `API trả về lỗi ${response.status}.`);
    return payload;
  }

  function cell(text, className = "") {
    const element = document.createElement("td");
    element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function signed(value) {
    return value > 0 ? `+${numberFormat.format(value)}` : numberFormat.format(value);
  }

  function renderStats(stats) {
    const items = [
      ["Tài khoản", stats.users],
      ["Đang bị khóa", stats.lockedUsers],
      ["Tổng xu lưu hành", stats.totalBalance],
      ["Bàn đang mở", stats.activeRooms],
      ["Ván hôm nay (UTC)", stats.matchesToday],
      ["Tổng số ván", stats.matches],
    ];
    $("#admin-stats").replaceChildren(...items.map(([label, value]) => {
      const box = document.createElement("div");
      box.className = "admin-stat";
      const number = document.createElement("strong");
      number.textContent = numberFormat.format(value);
      const caption = document.createElement("span");
      caption.textContent = label;
      box.append(number, caption);
      return box;
    }));
  }

  function selectUser(user) {
    selectedUser = user;
    $("#selected-user").textContent = `${user.displayName} · ${user.phone} · ${numberFormat.format(user.balance)} xu`;
    $("#credit-button").disabled = false;
    $("#debit-button").disabled = false;
  }

  function renderUsers(users) {
    $("#user-rows").replaceChildren(...users.map((user) => {
      const row = document.createElement("tr");
      row.append(
        cell(user.displayName),
        cell(user.phone),
        cell(user.role === "admin" ? "Admin" : "Người chơi"),
        cell(user.status === "locked" ? "Đã khóa" : "Hoạt động", user.status === "locked" ? "loss" : "win"),
        cell(numberFormat.format(user.balance)),
      );
      const actions = document.createElement("td");
      actions.className = "row-actions";
      const pick = document.createElement("button");
      pick.type = "button";
      pick.className = "text-button";
      pick.textContent = "CHỌN";
      pick.addEventListener("click", () => selectUser(user));
      const history = document.createElement("button");
      history.type = "button";
      history.className = "text-button";
      history.textContent = "SỔ XU";
      history.addEventListener("click", () => loadLedger(user));
      const lock = document.createElement("button");
      lock.type = "button";
      lock.className = "text-button";
      lock.textContent = user.status === "locked" ? "MỞ KHÓA" : "KHÓA";
      lock.addEventListener("click", () => changeStatus(user));
      actions.append(pick, history, lock);
      row.append(actions);
      return row;
    }));
  }

  function renderLedger(transactions) {
    $("#ledger-rows").replaceChildren(...transactions.map((item) => {
      const row = document.createElement("tr");
      row.append(
        cell(item.createdAt),
        cell(`${item.displayName} · ${item.phone}`),
        cell(typeLabels[item.type] || item.type),
        cell(signed(item.amount), item.amount >= 0 ? "win" : "loss"),
        cell(numberFormat.format(item.balanceAfter)),
        cell([item.note, item.adminPhone && `bởi ${item.adminPhone}`].filter(Boolean).join(" · ")),
      );
      return row;
    }));
  }

  function renderMatches(matches) {
    $("#match-rows").replaceChildren(...matches.map((match) => {
      const row = document.createElement("tr");
      row.append(
        cell(match.finishedAt),
        cell(match.roomCode),
        cell(`${numberFormat.format(match.stake)} xu`),
        cell(match.players.map((player) => `${player.displayName} ${signed(player.chips)}`).join(" · ")),
      );
      return row;
    }));
  }

  async function loadUsers() {
    const search = $("#user-search").value.trim();
    const { users } = await api(`/admin/users?limit=100${search ? `&search=${encodeURIComponent(search)}` : ""}`);
    renderUsers(users);
  }

  async function loadLedger(user = null) {
    ledgerUser = user;
    $("#ledger-title").textContent = user ? `Sổ xu của ${user.displayName}` : "Giao dịch gần đây";
    const query = user ? `&userId=${user.id}` : "";
    renderLedger((await api(`/admin/transactions?limit=50${query}`)).transactions);
  }

  async function loadAll() {
    const [stats, matches] = await Promise.all([api("/admin/stats"), api("/admin/matches")]);
    renderStats(stats.stats);
    renderMatches(matches.matches);
    await Promise.all([loadUsers(), loadLedger(ledgerUser)]);
  }

  async function adjust(action) {
    if (!selectedUser) return;
    const amount = Number($("#adjust-amount").value);
    if (!Number.isInteger(amount) || amount < 1) {
      setMessage("Số xu phải là số nguyên dương.", true);
      return;
    }
    try {
      const { user } = await api(`/admin/users/${selectedUser.id}/${action}`, {
        amount,
        note: $("#adjust-note").value.trim() || null,
      });
      selectUser(user);
      $("#adjust-amount").value = "";
      $("#adjust-note").value = "";
      setMessage(`${action === "credit" ? "Đã cộng" : "Đã trừ"} ${numberFormat.format(amount)} xu cho ${user.displayName}.`);
      await loadAll();
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  async function changeStatus(user) {
    const status = user.status === "locked" ? "active" : "locked";
    if (status === "locked" && !confirm(`Khóa tài khoản ${user.displayName}?`)) return;
    try {
      const { user: updated } = await api(`/admin/users/${user.id}/status`, { status });
      if (selectedUser?.id === updated.id) selectUser(updated);
      setMessage(`${status === "locked" ? "Đã khóa" : "Đã mở khóa"} ${updated.displayName}.`);
      await loadUsers();
    } catch (error) {
      setMessage(error.message, true);
    }
  }

  async function init() {
    if (!token) {
      setStatus("Bạn cần đăng nhập bằng tài khoản admin ở trang game trước.", true);
      return;
    }
    try {
      const { user } = await api("/auth/me");
      if (user.role !== "admin") {
        setStatus("Tài khoản này không có quyền quản trị.", true);
        return;
      }
      $("#admin-content").hidden = false;
      setStatus(`Xin chào ${user.displayName}.`);
      await loadAll();
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  $("#user-search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    loadUsers().catch((error) => setMessage(error.message, true));
  });
  $("#adjust-form").addEventListener("submit", (event) => event.preventDefault());
  $("#credit-button").addEventListener("click", () => adjust("credit"));
  $("#debit-button").addEventListener("click", () => adjust("debit"));
  $("#admin-refresh").addEventListener("click", () => loadAll().catch((error) => setMessage(error.message, true)));
  init();
})();
