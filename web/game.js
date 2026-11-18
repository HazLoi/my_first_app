"use strict";

(() => {
  const homeScreen = document.querySelector("#home-screen");
  const gameScreen = document.querySelector("#game-screen");
  const canvas = document.querySelector("#game-canvas");
  const context = canvas.getContext("2d");
  const startButton = document.querySelector("#start-button");
  const exitButton = document.querySelector("#exit-button");
  const fireButton = document.querySelector("#fire-button");
  const resultPanel = document.querySelector("#result-panel");
  const retryButton = document.querySelector("#retry-button");
  const homeButton = document.querySelector("#home-button");
  const resultTitle = document.querySelector("#result-title");
  const resultIcon = document.querySelector("#result-icon");
  const playerHealthBar = document.querySelector("#player-health-bar");
  const enemyHealthBar = document.querySelector("#enemy-health-bar");
  const playerHealthText = document.querySelector("#player-health-text");
  const enemyHealthText = document.querySelector("#enemy-health-text");
  const flightData = document.querySelector("#flight-data");

  const keys = new Set();
  const shots = [];
  const clouds = Array.from({ length: 9 }, (_, index) => ({
    x: index / 9,
    y: 0.19 + (index % 4) * 0.075,
    width: 65 + (index % 3) * 24,
  }));
  const game = {
    active: false,
    over: false,
    won: false,
    elapsed: 0,
    lastFrame: 0,
    player: { x: 0.5, y: 0.76, health: 100 },
    enemy: { x: 0.5, y: 0.2, health: 100 },
    playerFireCooldown: 0,
    enemyFireCooldown: 0.8,
    firing: false,
    pointerId: null,
    width: 0,
    height: 0,
    animationFrame: 0,
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function resizeCanvas() {
    const bounds = canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    game.width = bounds.width;
    game.height = bounds.height;
    canvas.width = Math.round(bounds.width * pixelRatio);
    canvas.height = Math.round(bounds.height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    if (game.active) draw();
  }

  function startGame() {
    cancelAnimationFrame(game.animationFrame);
    game.active = true;
    game.over = false;
    game.won = false;
    game.elapsed = 0;
    game.lastFrame = 0;
    game.player = { x: 0.5, y: 0.76, health: 100 };
    game.enemy = { x: 0.5, y: 0.2, health: 100 };
    game.playerFireCooldown = 0;
    game.enemyFireCooldown = 0.8;
    game.firing = false;
    shots.length = 0;
    keys.clear();
    resultPanel.hidden = true;
    homeScreen.hidden = true;
    gameScreen.hidden = false;
    resizeCanvas();
    updateHud();
    game.animationFrame = requestAnimationFrame(frame);
  }

  function returnHome() {
    game.active = false;
    game.over = false;
    game.firing = false;
    keys.clear();
    cancelAnimationFrame(game.animationFrame);
    gameScreen.hidden = true;
    homeScreen.hidden = false;
    resultPanel.hidden = true;
  }

  function frame(timestamp) {
    if (!game.active) return;
    const delta = game.lastFrame === 0
      ? 0
      : Math.min((timestamp - game.lastFrame) / 1000, 0.04);
    game.lastFrame = timestamp;
    update(delta);
    draw();
    if (game.active) game.animationFrame = requestAnimationFrame(frame);
  }

  function update(delta) {
    game.elapsed += delta;
    const player = game.player;
    const speed = 390 * delta;
    if (keys.has("ArrowLeft") || keys.has("KeyA")) player.x -= speed / game.width;
    if (keys.has("ArrowRight") || keys.has("KeyD")) player.x += speed / game.width;
    if (keys.has("ArrowUp") || keys.has("KeyW")) player.y -= speed / game.height;
    if (keys.has("ArrowDown") || keys.has("KeyS")) player.y += speed / game.height;
    player.x = clamp(player.x, 0.055, 0.945);
    player.y = clamp(player.y, 0.43, 0.91);

    game.enemy.x = clamp(
      0.5 + Math.sin(game.elapsed * 1.15) * 0.3,
      0.09,
      0.91,
    );

    game.playerFireCooldown -= delta;
    if ((game.firing || keys.has("Space")) && game.playerFireCooldown <= 0) {
      firePlayerShot();
      game.playerFireCooldown = 0.17;
    }

    game.enemyFireCooldown -= delta;
    if (game.enemyFireCooldown <= 0) {
      fireEnemyShot();
      game.enemyFireCooldown = 1.15;
    }

    for (const shot of shots) {
      shot.x += shot.vx * delta;
      shot.y += shot.vy * delta;
      if (shot.playerShot) {
        if (distance(shot.x, shot.y, game.enemy.x, game.enemy.y) < 0.055) {
          shot.hit = true;
          game.enemy.health = Math.max(0, game.enemy.health - 10);
        }
      } else if (distance(shot.x, shot.y, player.x, player.y) < 0.05) {
        shot.hit = true;
        player.health = Math.max(0, player.health - 10);
      }
    }
    for (let index = shots.length - 1; index >= 0; index--) {
      const shot = shots[index];
      if (shot.hit || shot.x < -0.1 || shot.x > 1.1 || shot.y < -0.1 || shot.y > 1.1) {
        shots.splice(index, 1);
      }
    }

    updateHud();
    if (game.enemy.health === 0 || player.health === 0) {
      finishGame(game.enemy.health === 0);
    }
  }

  function firePlayerShot() {
    shots.push({
      x: game.player.x,
      y: game.player.y - 0.035,
      vx: 0,
      vy: -0.92,
      playerShot: true,
      hit: false,
    });
  }

  function fireEnemyShot() {
    const dx = game.player.x - game.enemy.x;
    const dy = game.player.y - game.enemy.y;
    const length = Math.hypot(dx, dy) || 1;
    const speed = 0.47;
    shots.push({
      x: game.enemy.x,
      y: game.enemy.y + 0.035,
      vx: (dx / length) * speed,
      vy: (dy / length) * speed,
      playerShot: false,
      hit: false,
    });
  }

  function distance(x1, y1, x2, y2) {
    return Math.hypot(x1 - x2, y1 - y2);
  }

  function finishGame(won) {
    game.active = false;
    game.over = true;
    game.won = won;
    resultTitle.textContent = won ? "CHIẾN THẮNG!" : "MÁY BAY BỊ HẠ";
    resultIcon.textContent = won ? "✦" : "↻";
    resultPanel.hidden = false;
  }

  function updateHud() {
    const playerHealth = game.player.health;
    const enemyHealth = game.enemy.health;
    playerHealthBar.style.width = `${playerHealth}%`;
    enemyHealthBar.style.width = `${enemyHealth}%`;
    playerHealthText.textContent = `${playerHealth}%`;
    enemyHealthText.textContent = `${enemyHealth}%`;
    flightData.textContent =
      `TỌA ĐỘ ${String(Math.round(game.player.x * 100)).padStart(2, "0")} / ` +
      `${String(Math.round(game.player.y * 100)).padStart(2, "0")}`;
  }

  function draw() {
    const width = game.width;
    const height = game.height;
    if (width <= 0 || height <= 0) return;

    const sky = context.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#163451");
    sky.addColorStop(0.55, "#4f8291");
    sky.addColorStop(1, "#142a35");
    context.fillStyle = sky;
    context.fillRect(0, 0, width, height);

    drawSun(width, height);
    drawMountains(width, height);
    drawClouds(width, height);
    drawGrid(width, height);

    drawPlane(game.enemy.x * width, game.enemy.y * height, width * 0.12, "#ff776d", Math.PI);
    drawPlane(
      game.player.x * width,
      game.player.y * height,
      width * 0.17,
      "#62e6d0",
      0,
    );
    drawShots(width, height);
  }

  function drawSun(width, height) {
    const x = width * 0.75;
    const y = height * 0.3;
    const glow = context.createRadialGradient(x, y, 2, x, y, width * 0.28);
    glow.addColorStop(0, "rgb(255 221 168 / 34%)");
    glow.addColorStop(1, "rgb(255 221 168 / 0%)");
    context.fillStyle = glow;
    context.beginPath();
    context.arc(x, y, width * 0.28, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "rgb(255 221 168 / 78%)";
    context.beginPath();
    context.arc(x, y, width * 0.055, 0, Math.PI * 2);
    context.fill();
  }

  function drawMountains(width, height) {
    context.beginPath();
    context.moveTo(0, height * 0.53);
    context.lineTo(width * 0.13, height * 0.37);
    context.lineTo(width * 0.24, height * 0.52);
    context.lineTo(width * 0.4, height * 0.32);
    context.lineTo(width * 0.55, height * 0.53);
    context.lineTo(width * 0.7, height * 0.4);
    context.lineTo(width * 0.86, height * 0.52);
    context.lineTo(width, height * 0.36);
    context.lineTo(width, height * 0.67);
    context.lineTo(0, height * 0.67);
    context.closePath();
    context.fillStyle = "rgb(37 72 89 / 76%)";
    context.fill();
  }

  function drawClouds(width, height) {
    context.fillStyle = "rgb(213 231 228 / 13%)";
    for (const cloud of clouds) {
      const x = ((cloud.x + game.elapsed * 0.018) % 1.2 - 0.1) * width;
      context.beginPath();
      context.ellipse(
        x,
        cloud.y * height,
        cloud.width / 2,
        6,
        0,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  }

  function drawGrid(width, height) {
    const horizon = height * 0.58;
    context.strokeStyle = "rgb(128 220 202 / 18%)";
    context.lineWidth = 1;
    for (let index = 0; index < 10; index++) {
      const t = index / 9;
      const y = horizon + (height - horizon) * t * t;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    for (let index = -7; index <= 7; index++) {
      context.beginPath();
      context.moveTo(width * 0.5, horizon);
      context.lineTo(width * (0.5 + index * 0.24), height);
      context.stroke();
    }
  }

  function drawPlane(x, y, width, color, rotation) {
    context.save();
    context.translate(x, y);
    context.rotate(rotation);
    context.scale(width / 100, width / 100);
    context.shadowColor = "rgb(2 8 13 / 70%)";
    context.shadowBlur = 9;
    context.shadowOffsetY = 4;
    context.beginPath();
    context.moveTo(0, -42);
    context.lineTo(7, -7);
    context.lineTo(42, 16);
    context.lineTo(40, 23);
    context.lineTo(8, 15);
    context.lineTo(5, 37);
    context.lineTo(18, 45);
    context.lineTo(17, 49);
    context.lineTo(0, 45);
    context.lineTo(-17, 49);
    context.lineTo(-18, 45);
    context.lineTo(-5, 37);
    context.lineTo(-8, 15);
    context.lineTo(-40, 23);
    context.lineTo(-42, 16);
    context.lineTo(-7, -7);
    context.closePath();
    context.fillStyle = color;
    context.fill();
    context.shadowColor = "transparent";
    context.strokeStyle = "#10222d";
    context.lineWidth = 1.5;
    context.stroke();
    context.beginPath();
    context.moveTo(0, -32);
    context.lineTo(4, -11);
    context.lineTo(0, -5);
    context.lineTo(-4, -11);
    context.closePath();
    context.fillStyle = "rgb(255 255 255 / 54%)";
    context.fill();
    context.restore();
  }

  function drawShots(width, height) {
    for (const shot of shots) {
      const x = shot.x * width;
      const y = shot.y * height;
      const color = shot.playerShot ? "#b7fff3" : "#ffb28c";
      context.strokeStyle = shot.playerShot
        ? "rgb(183 255 243 / 48%)"
        : "rgb(255 178 140 / 48%)";
      context.lineWidth = 5;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x, y + (shot.playerShot ? 15 : -15));
      context.stroke();
      context.fillStyle = color;
      context.beginPath();
      context.arc(x, y, 3.5, 0, Math.PI * 2);
      context.fill();
    }
  }

  const controlKeys = new Set([
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "KeyA",
    "KeyD",
    "KeyW",
    "KeyS",
    "Space",
  ]);

  window.addEventListener("keydown", (event) => {
    if (!controlKeys.has(event.code) || !game.active) return;
    event.preventDefault();
    keys.add(event.code);
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.code);
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (!game.active) return;
    game.pointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    movePlayerToPointer(event);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId === game.pointerId) movePlayerToPointer(event);
  });

  function movePlayerToPointer(event) {
    const bounds = canvas.getBoundingClientRect();
    game.player.x = clamp((event.clientX - bounds.left) / bounds.width, 0.055, 0.945);
    game.player.y = clamp((event.clientY - bounds.top) / bounds.height, 0.43, 0.91);
  }

  canvas.addEventListener("pointerup", (event) => {
    if (event.pointerId === game.pointerId) game.pointerId = null;
  });
  canvas.addEventListener("pointercancel", () => {
    game.pointerId = null;
  });

  fireButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    game.firing = true;
    fireButton.setPointerCapture(event.pointerId);
  });
  fireButton.addEventListener("pointerup", () => {
    game.firing = false;
  });
  fireButton.addEventListener("pointercancel", () => {
    game.firing = false;
  });
  fireButton.addEventListener("click", () => {
    if (game.active) firePlayerShot();
  });

  startButton.addEventListener("click", startGame);
  retryButton.addEventListener("click", startGame);
  exitButton.addEventListener("click", returnHome);
  homeButton.addEventListener("click", returnHome);
  window.addEventListener("resize", resizeCanvas);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      keys.clear();
      game.firing = false;
    }
  });
})();
