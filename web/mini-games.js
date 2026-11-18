"use strict";

(() => {
  const homeScreen = document.querySelector("#home-screen");
  const shooterScreen = document.querySelector("#game-screen");
  const screen = document.querySelector("#mini-game-screen");
  const title = document.querySelector("#mini-game-title");
  const status = document.querySelector("#mini-game-status");
  const scoreText = document.querySelector("#mini-game-score");
  const help = document.querySelector("#mini-game-help");
  const content = document.querySelector("#mini-game-content");
  const backButton = document.querySelector("#mini-back-button");
  const restartButton = document.querySelector("#mini-restart-button");

  const games = {
    "time-trial": {
      title: "ĐUA NÉ CHƯỚNG NGẠI",
      help: "Dùng ← / → hoặc nút điều khiển. Né vật cản trong 60 giây.",
      bestKey: "khong-chien-time-trial-best",
    },
    puzzle: {
      title: "GIẢI ĐỐ 2048",
      help: "Dùng phím mũi tên hoặc nút bên dưới để ghép các ô số giống nhau.",
      bestKey: "khong-chien-puzzle-best",
    },
    tactics: {
      title: "CHIẾN THUẬT THEO LƯỢT",
      help: "Chọn ô liền kề để di chuyển; chọn kẻ địch liền kề để tấn công.",
      bestKey: "khong-chien-tactics-wins",
    },
    cards: {
      title: "THẺ BÀI SINH TỒN",
      help: "Mỗi lượt chọn một lá bài. Hạ 3 đợt địch trước khi hết máu.",
      bestKey: "khong-chien-cards-best",
    },
  };

  let selectedGame = null;
  let stopGame = () => {};
  let animationFrame = 0;

  function readBest(key) {
    try {
      return Number(localStorage.getItem(key)) || 0;
    } catch (error) {
      console.warn("Không thể đọc kỷ lục đã lưu trên thiết bị.", error);
      return 0;
    }
  }

  function saveBest(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch (error) {
      console.warn("Không thể lưu kỷ lục trên thiết bị.", error);
    }
  }

  function updateScore(value) {
    scoreText.textContent = String(value).padStart(6, "0");
  }

  function setStatus(message) {
    status.textContent = message;
  }

  function openGame(gameId) {
    if (!games[gameId]) return;
    selectedGame = gameId;
    homeScreen.hidden = true;
    shooterScreen.hidden = true;
    screen.hidden = false;
    title.textContent = games[gameId].title;
    help.textContent = games[gameId].help;
    startGame();
  }

  function closeGame() {
    stopGame();
    cancelAnimationFrame(animationFrame);
    selectedGame = null;
    screen.hidden = true;
    homeScreen.hidden = false;
  }

  function startGame() {
    stopGame();
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    content.replaceChildren();
    updateScore(0);
    setStatus("SẴN SÀNG");

    if (selectedGame === "time-trial") startTimeTrial();
    if (selectedGame === "puzzle") startPuzzle();
    if (selectedGame === "tactics") startTactics();
    if (selectedGame === "cards") startCards();
  }

  function finishScore(score, message) {
    const key = games[selectedGame].bestKey;
    if (score > readBest(key)) saveBest(key, score);
    setStatus(message);
    help.textContent = `Kỷ lục trên thiết bị: ${Math.max(score, readBest(key))}. Chọn CHƠI LẠI để bắt đầu lượt mới.`;
  }

  function startTimeTrial() {
    const duration = 60;
    const state = {
      lane: 1,
      obstacles: [],
      elapsed: 0,
      spawnIn: 0.6,
      lastFrame: 0,
      lives: 3,
      passed: 0,
      running: true,
    };
    content.innerHTML = `
      <div class="race-hud">
        <span id="race-time">60 GIÂY</span>
        <span id="race-lives">MẠNG ♥ ♥ ♥</span>
      </div>
      <div class="race-track" aria-label="Đường đua ba làn">
        <span class="race-lane-line" aria-hidden="true"></span>
        <span class="race-lane-line" aria-hidden="true"></span>
        <div id="race-obstacles" class="race-obstacles"></div>
        <div id="race-car" class="race-car" aria-label="Xe của bạn"></div>
      </div>
      <div class="game-controls">
        <button type="button" data-lane="-1" aria-label="Sang trái">← TRÁI</button>
        <button type="button" data-lane="1" aria-label="Sang phải">PHẢI →</button>
      </div>
      <p class="game-instructions">Đổi làn để tránh các chướng ngại vật đang lao tới.</p>
    `;
    const obstaclesElement = content.querySelector("#race-obstacles");
    const car = content.querySelector("#race-car");
    const timeLabel = content.querySelector("#race-time");
    const livesLabel = content.querySelector("#race-lives");

    function moveLane(amount) {
      if (!state.running) return;
      state.lane = Math.max(0, Math.min(2, state.lane + amount));
      car.style.left = `${state.lane * 33.333}%`;
    }

    content.querySelectorAll("[data-lane]").forEach((button) => {
      button.addEventListener("click", () => moveLane(Number(button.dataset.lane)));
    });

    function handleTrialKeys(event) {
      if (selectedGame !== "time-trial" || screen.hidden) return;
      if (event.code === "ArrowLeft" || event.code === "KeyA") {
        event.preventDefault();
        moveLane(-1);
      } else if (event.code === "ArrowRight" || event.code === "KeyD") {
        event.preventDefault();
        moveLane(1);
      }
    }

    function finish() {
      if (!state.running) return;
      state.running = false;
      window.removeEventListener("keydown", handleTrialKeys);
      finishScore(state.passed * 100, state.elapsed >= duration ? "HOÀN THÀNH" : "HẾT MẠNG");
      help.textContent = `Đã vượt ${state.passed} vật cản. Kỷ lục: ${readBest(games[selectedGame].bestKey)}.`;
    }

    function frame(timestamp) {
      if (!state.running) return;
      const delta = state.lastFrame === 0
        ? 0
        : Math.min((timestamp - state.lastFrame) / 1000, 0.08);
      state.lastFrame = timestamp;
      state.elapsed += delta;
      state.spawnIn -= delta;
      if (state.spawnIn <= 0) {
        state.obstacles.push({ lane: Math.floor(Math.random() * 3), position: 0 });
        state.spawnIn = Math.max(0.52, 1.15 - state.elapsed * 0.008);
      }

      const speed = 26 + Math.min(state.elapsed * 0.25, 16);
      for (const obstacle of state.obstacles) obstacle.position += speed * delta;
      for (const obstacle of state.obstacles) {
        if (!obstacle.hit && obstacle.lane === state.lane && obstacle.position >= 84 && obstacle.position <= 96) {
          obstacle.hit = true;
          state.lives--;
        }
        if (!obstacle.hit && obstacle.position > 100) {
          obstacle.hit = true;
          state.passed++;
        }
      }
      state.obstacles = state.obstacles.filter((obstacle) => obstacle.position <= 102);
      obstaclesElement.innerHTML = state.obstacles
        .filter((obstacle) => !obstacle.hit)
        .map((obstacle) =>
          `<span class="race-obstacle" style="left:${obstacle.lane * 33.333}%;top:${obstacle.position}%" aria-hidden="true"></span>`,
        )
        .join("");
      timeLabel.textContent = `${Math.max(0, Math.ceil(duration - state.elapsed))} GIÂY`;
      livesLabel.textContent = `MẠNG ${"♥ ".repeat(Math.max(0, state.lives)).trim() || "—"}`;
      updateScore(state.passed * 100);

      if (state.elapsed >= duration || state.lives <= 0) {
        finish();
        return;
      }
      animationFrame = requestAnimationFrame(frame);
    }

    stopGame = () => {
      state.running = false;
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("keydown", handleTrialKeys);
    };
    window.addEventListener("keydown", handleTrialKeys);
    animationFrame = requestAnimationFrame(frame);
  }

  function startPuzzle() {
    const state = { board: Array(16).fill(0), score: 0, finished: false };
    const best = readBest(games.puzzle.bestKey);
    content.innerHTML = `
      <p class="game-instructions">KỶ LỤC ${best}</p>
      <div id="puzzle-board" class="puzzle-board" role="grid" aria-label="Bàn chơi 2048"></div>
      <div class="direction-controls" aria-label="Di chuyển ô số">
        <button type="button" data-direction="up" aria-label="Lên">↑</button>
        <button type="button" data-direction="left" aria-label="Trái">←</button>
        <button type="button" data-direction="down" aria-label="Xuống">↓</button>
        <button type="button" data-direction="right" aria-label="Phải">→</button>
      </div>
      <p class="game-instructions">Ghép hai ô cùng số để tạo ô lớn hơn.</p>
    `;
    const boardElement = content.querySelector("#puzzle-board");

    function drawBoard() {
      boardElement.innerHTML = state.board
        .map((value) =>
          `<div class="puzzle-tile" role="gridcell" data-value="${value}" aria-label="${value || "trống"}">${value || ""}</div>`,
        )
        .join("");
      updateScore(state.score);
    }

    function addTile() {
      const empty = state.board
        .map((value, index) => value === 0 ? index : -1)
        .filter((index) => index >= 0);
      if (empty.length === 0) return;
      const index = empty[Math.floor(Math.random() * empty.length)];
      state.board[index] = Math.random() < 0.9 ? 2 : 4;
    }

    function indexFor(line, offset, direction) {
      if (direction === "left") return line * 4 + offset;
      if (direction === "right") return line * 4 + (3 - offset);
      if (direction === "up") return offset * 4 + line;
      return (3 - offset) * 4 + line;
    }

    function hasMove() {
      if (state.board.includes(0)) return true;
      for (let row = 0; row < 4; row++) {
        for (let column = 0; column < 4; column++) {
          const value = state.board[row * 4 + column];
          if (column < 3 && value === state.board[row * 4 + column + 1]) return true;
          if (row < 3 && value === state.board[(row + 1) * 4 + column]) return true;
        }
      }
      return false;
    }

    function move(direction) {
      if (state.finished) return;
      const next = Array(16).fill(0);
      let moved = false;
      for (let line = 0; line < 4; line++) {
        const values = Array.from({ length: 4 }, (_, offset) =>
          state.board[indexFor(line, offset, direction)]).filter(Boolean);
        const merged = [];
        for (let offset = 0; offset < values.length; offset++) {
          if (values[offset] === values[offset + 1]) {
            const value = values[offset] * 2;
            merged.push(value);
            state.score += value;
            offset++;
          } else {
            merged.push(values[offset]);
          }
        }
        for (let offset = 0; offset < merged.length; offset++) {
          next[indexFor(line, offset, direction)] = merged[offset];
        }
      }
      moved = next.some((value, index) => value !== state.board[index]);
      if (!moved) return;
      state.board = next;
      addTile();
      const currentBest = readBest(games.puzzle.bestKey);
      if (state.score > currentBest) saveBest(games.puzzle.bestKey, state.score);
      drawBoard();
      if (state.board.includes(2048)) setStatus("ĐÃ TẠO Ô 2048!");
      if (!hasMove()) {
        state.finished = true;
        window.removeEventListener("keydown", handlePuzzleKeys);
        finishScore(state.score, "HẾT NƯỚC ĐI");
      }
    }

    content.querySelectorAll("[data-direction]").forEach((button) => {
      button.addEventListener("click", () => move(button.dataset.direction));
    });
    stopGame = () => {
      state.finished = true;
      window.removeEventListener("keydown", handlePuzzleKeys);
    };
    addTile();
    addTile();
    drawBoard();
    window.addEventListener("keydown", handlePuzzleKeys);

    function handlePuzzleKeys(event) {
      if (selectedGame !== "puzzle" || screen.hidden) return;
      const directions = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
      };
      const direction = directions[event.code];
      if (!direction) return;
      event.preventDefault();
      move(direction);
    }
  }

  function startTactics() {
    const size = 5;
    const state = { player: 21, enemy: 3, playerHp: 5, enemyHp: 3, over: false };
    const best = readBest(games.tactics.bestKey);
    content.innerHTML = `
      <p class="game-instructions">PHI ĐỘI ${"♥ ".repeat(state.playerHp)} · ĐỊCH ${"◆ ".repeat(state.enemyHp)} · KỶ LỤC ${best} THẮNG</p>
      <div id="tactics-board" class="tactics-board" role="grid" aria-label="Bản đồ chiến thuật 5 nhân 5"></div>
      <p id="tactics-hint" class="game-instructions">Di chuyển và hạ kẻ địch trước khi hết máu.</p>
    `;
    const boardElement = content.querySelector("#tactics-board");
    const hint = content.querySelector("#tactics-hint");

    function adjacent(first, second) {
      return Math.abs(Math.floor(first / size) - Math.floor(second / size)) +
        Math.abs((first % size) - (second % size)) === 1;
    }

    function drawBoard() {
      boardElement.innerHTML = Array.from({ length: size * size }, (_, index) => {
        const isPlayer = index === state.player;
        const isEnemy = index === state.enemy;
        const unit = isPlayer ? "✈" : isEnemy ? "◆" : "";
        const label = isPlayer ? "Phi đội" : isEnemy ? `Địch, ${state.enemyHp} máu` : "Ô trống";
        return `<button type="button" class="tactics-cell${isPlayer ? " player-unit" : ""}${isEnemy ? " enemy-unit" : ""}" data-cell="${index}" role="gridcell" aria-label="${label}"${state.over ? " disabled" : ""}>${unit}</button>`;
      }).join("");
      content.querySelector(".game-instructions").textContent =
        `PHI ĐỘI ${"♥ ".repeat(Math.max(0, state.playerHp)) || "—"} · ĐỊCH ${"◆ ".repeat(Math.max(0, state.enemyHp)) || "—"} · KỶ LỤC ${readBest(games.tactics.bestKey)} THẮNG`;
      updateScore(state.enemyHp > 0 ? state.enemyHp : 0);
    }

    function endGame(won) {
      state.over = true;
      const wins = readBest(games.tactics.bestKey) + (won ? 1 : 0);
      if (won) saveBest(games.tactics.bestKey, wins);
      if (won) state.enemy = -1;
      setStatus(won ? "CHIẾN THẮNG" : "PHI ĐỘI BỊ HẠ");
      hint.textContent = won ? "Địch đã bị đánh bại. Chọn CHƠI LẠI để đấu tiếp." : "Phi đội đã hết máu. Hãy thử một chiến thuật khác.";
      drawBoard();
    }

    function enemyTurn() {
      if (state.over) return;
      if (adjacent(state.player, state.enemy)) {
        state.playerHp--;
        if (state.playerHp <= 0) {
          endGame(false);
          return;
        }
      } else {
        const playerRow = Math.floor(state.player / size);
        const playerColumn = state.player % size;
        let enemyRow = Math.floor(state.enemy / size);
        let enemyColumn = state.enemy % size;
        if (enemyRow !== playerRow) enemyRow += Math.sign(playerRow - enemyRow);
        else if (enemyColumn !== playerColumn) enemyColumn += Math.sign(playerColumn - enemyColumn);
        const next = enemyRow * size + enemyColumn;
        if (next !== state.player) state.enemy = next;
      }
      drawBoard();
    }

    function chooseCell(index) {
      if (state.over) return;
      if (index === state.enemy && adjacent(state.player, state.enemy)) {
        state.enemyHp--;
        if (state.enemyHp <= 0) {
          endGame(true);
          return;
        }
        enemyTurn();
        return;
      }
      if (index !== state.enemy && adjacent(state.player, index)) {
        state.player = index;
        enemyTurn();
      }
    }

    boardElement.addEventListener("click", (event) => {
      const cell = event.target.closest("[data-cell]");
      if (cell) chooseCell(Number(cell.dataset.cell));
    });
    stopGame = () => { state.over = true; };
    drawBoard();
  }

  function startCards() {
    const state = {
      hp: 24,
      enemyHp: 12,
      wave: 1,
      score: 0,
      guard: 0,
      awaitingReward: false,
      over: false,
    };
    const cardPool = [
      { name: "Đạn năng lượng", text: "Gây sát thương lên kẻ địch.", type: "attack", value: 6, icon: "ϟ" },
      { name: "Loạt đạn", text: "Đòn đánh mạnh, gây sát thương lớn.", type: "attack", value: 9, icon: "✦" },
      { name: "Lá chắn", text: "Chặn đòn phản công của địch.", type: "guard", value: 7, icon: "⬡" },
      { name: "Sửa chữa", text: "Hồi máu cho phi đội.", type: "heal", value: 5, icon: "+" },
    ];
    const rewardCards = [cardPool[0], cardPool[2], cardPool[3]];
    state.deck = cardPool.slice();
    const best = readBest(games.cards.bestKey);
    content.innerHTML = `
      <p id="card-battle-status" class="game-instructions"></p>
      <div id="card-hand" class="card-hand" aria-label="Chọn một lá bài"></div>
    `;
    const battleStatus = content.querySelector("#card-battle-status");
    const hand = content.querySelector("#card-hand");
    setStatus(`KỶ LỤC ${best}`);

    function drawHand() {
      if (state.over) return;
      if (state.awaitingReward) {
        showReward();
        return;
      }
      battleStatus.textContent =
        `ĐỢT ${state.wave}/3 · PHI ĐỘI ${state.hp} ♥ · ĐỊCH ${state.enemyHp} ◆`;
      const cards = Array.from({ length: 3 }, () =>
        state.deck[Math.floor(Math.random() * state.deck.length)]);
      hand.innerHTML = cards.map((card, index) =>
        `<button type="button" class="battle-card" data-card="${index}">
          <strong>${card.name}</strong><span>${card.text}</span><em>${card.icon} ${card.value}</em>
        </button>`,
      ).join("");
      hand.querySelectorAll("[data-card]").forEach((button, index) => {
        button.addEventListener("click", () => playCard(cards[index]));
      });
    }

    function showReward() {
      battleStatus.textContent = `ĐỢT ${state.wave}/3 · CHỌN MỘT THẺ ĐỂ THÊM VÀO BỘ BÀI`;
      hand.innerHTML = rewardCards.map((card, index) =>
        `<button type="button" class="battle-card" data-reward="${index}">
          <strong>${card.name}</strong><span>${card.text}</span><em>${card.icon} ${card.value}</em>
        </button>`,
      ).join("");
      hand.querySelectorAll("[data-reward]").forEach((button, index) => {
        button.addEventListener("click", () => {
          state.deck.push(rewardCards[index]);
          state.awaitingReward = false;
          drawHand();
        });
      });
    }

    function endRun(won) {
      state.over = true;
      hand.replaceChildren();
      const score = won ? state.score + state.hp * 100 : state.score;
      if (score > readBest(games.cards.bestKey)) saveBest(games.cards.bestKey, score);
      updateScore(score);
      setStatus(won ? "3 ĐỢT ĐÃ THẮNG" : "PHI ĐỘI BỊ HẠ");
      battleStatus.textContent = won
        ? `Chiến thắng! Điểm lượt chơi: ${score}. Kỷ lục: ${readBest(games.cards.bestKey)}.`
        : `Đã vượt ${state.wave - 1} đợt. Chọn CHƠI LẠI để thử chiến thuật khác.`;
    }

    function playCard(card) {
      if (state.over) return;
      if (card.type === "attack") {
        state.enemyHp -= card.value;
        state.score += card.value * 10;
      } else if (card.type === "guard") {
        state.guard = card.value;
      } else if (card.type === "heal") {
        state.hp = Math.min(24, state.hp + card.value);
      }

      if (state.enemyHp <= 0) {
        if (state.wave === 3) {
          endRun(true);
          return;
        }
        state.wave++;
        state.enemyHp = 10 + state.wave * 3;
        state.hp = Math.min(24, state.hp + 3);
        state.score += 100;
        state.awaitingReward = true;
        drawHand();
        updateScore(state.score);
        return;
      } else {
        const damage = Math.max(0, 4 + state.wave - state.guard);
        state.guard = 0;
        state.hp -= damage;
        if (state.hp <= 0) {
          endRun(false);
          return;
        }
      }
      drawHand();
      updateScore(state.score);
    }

    stopGame = () => { state.over = true; };
    drawHand();
  }

  document.querySelectorAll("[data-mini-game]").forEach((button) => {
    button.addEventListener("click", () => openGame(button.dataset.miniGame));
  });
  backButton.addEventListener("click", closeGame);
  restartButton.addEventListener("click", startGame);
})();
