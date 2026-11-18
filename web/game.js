"use strict";

(() => {
  const homeScreen = document.querySelector("#home-screen");
  const gameScreen = document.querySelector("#game-screen");
  const canvas = document.querySelector("#game-canvas");
  const context = canvas.getContext("2d");
  const previewCanvas = document.querySelector("#preview-canvas");
  const previewContext = previewCanvas.getContext("2d");
  const startButton = document.querySelector("#start-button");
  const exitButton = document.querySelector("#exit-button");
  const pauseButton = document.querySelector("#pause-button");
  const resumeButton = document.querySelector("#resume-button");
  const pauseHomeButton = document.querySelector("#pause-home-button");
  const fireButton = document.querySelector("#fire-button");
  const bombButton = document.querySelector("#bomb-button");
  const pausePanel = document.querySelector("#pause-panel");
  const resultPanel = document.querySelector("#result-panel");
  const retryButton = document.querySelector("#retry-button");
  const homeButton = document.querySelector("#home-button");
  const resultTitle = document.querySelector("#result-title");
  const resultIcon = document.querySelector("#result-icon");
  const resultEyebrow = document.querySelector("#result-eyebrow");
  const resultScore = document.querySelector("#result-score");
  const scoreText = document.querySelector("#score-text");
  const bestText = document.querySelector("#best-text");
  const waveText = document.querySelector("#wave-text");
  const waveProgress = document.querySelector("#wave-progress");
  const birdsLeft = document.querySelector("#birds-left");
  const livesText = document.querySelector("#lives-text");
  const bombCount = document.querySelector("#bomb-count");
  const flightData = document.querySelector("#flight-data");

  const keys = new Set();
  const shots = [];
  const chickens = [];
  const powerUps = [];
  const particles = [];
  const clouds = Array.from({ length: 11 }, (_, index) => ({
    x: (index * 0.137 + 0.03) % 1,
    y: 0.12 + (index % 5) * 0.085,
    width: 52 + (index % 4) * 26,
    speed: 0.006 + (index % 3) * 0.002,
    opacity: 0.08 + (index % 4) * 0.025,
  }));
  const game = {
    active: false,
    paused: false,
    elapsed: 0,
    lastFrame: 0,
    animationFrame: 0,
    width: 0,
    height: 0,
    player: { x: 0.5, y: 0.79, lives: 3, invulnerable: 0, bank: 0 },
    wave: 1,
    waveSize: 15,
    waveKills: 0,
    waveTransition: 0,
    enemyFireCooldown: 1.4,
    playerFireCooldown: 0,
    score: 0,
    best: loadBestScore(),
    kills: 0,
    combo: 0,
    comboTimer: 0,
    bombs: 2,
    firing: false,
    pointerId: null,
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function loadBestScore() {
    try {
      return Number(localStorage.getItem("khong-chien-best-score")) || 0;
    } catch (error) {
      console.warn("Không thể đọc điểm cao đã lưu trên thiết bị.", error);
      return 0;
    }
  }

  function saveBestScore() {
    try {
      localStorage.setItem("khong-chien-best-score", String(game.best));
    } catch (error) {
      console.warn("Không thể lưu điểm cao trên thiết bị.", error);
    }
  }

  function resizeCanvas() {
    const bounds = canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    game.width = bounds.width;
    game.height = bounds.height;
    canvas.width = Math.round(bounds.width * pixelRatio);
    canvas.height = Math.round(bounds.height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    if (game.active && game.width > 0 && game.height > 0) drawGame();
  }

  function resizePreview() {
    const bounds = previewCanvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    previewCanvas.width = Math.round(bounds.width * pixelRatio);
    previewCanvas.height = Math.round(bounds.height * pixelRatio);
    previewContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    if (bounds.width > 0 && bounds.height > 0) {
      drawPreview(bounds.width, bounds.height);
    }
  }

  function startGame() {
    cancelAnimationFrame(game.animationFrame);
    game.active = true;
    game.paused = false;
    game.elapsed = 0;
    game.lastFrame = 0;
    game.player = { x: 0.5, y: 0.79, lives: 3, invulnerable: 0, bank: 0 };
    game.wave = 1;
    game.waveKills = 0;
    game.waveTransition = 0;
    game.enemyFireCooldown = 1.4;
    game.playerFireCooldown = 0;
    game.score = 0;
    game.kills = 0;
    game.combo = 0;
    game.comboTimer = 0;
    game.bombs = 2;
    game.firing = false;
    game.pointerId = null;
    shots.length = 0;
    chickens.length = 0;
    powerUps.length = 0;
    particles.length = 0;
    spawnWave();
    keys.clear();
    pausePanel.hidden = true;
    resultPanel.hidden = true;
    homeScreen.hidden = true;
    gameScreen.hidden = false;
    resizeCanvas();
    updateHud();
    game.animationFrame = requestAnimationFrame(frame);
  }

  function spawnWave() {
    game.waveSize = 15 + Math.min((game.wave - 1) * 3, 18);
    game.waveKills = 0;
    const columns = 5;
    const rows = Math.ceil(game.waveSize / columns);
    for (let index = 0; index < game.waveSize; index++) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      chickens.push({
        column,
        row,
        phase: index * 1.31,
        x: 0.5 + (column - 2) * 0.13,
        y: 0.16 + row * Math.min(0.115, 0.35 / Math.max(rows, 1)),
        health: game.wave >= 3 && row === 0 ? 2 : 1,
        maxHealth: game.wave >= 3 && row === 0 ? 2 : 1,
        dead: false,
      });
    }
  }

  function returnHome() {
    game.active = false;
    game.paused = false;
    game.firing = false;
    keys.clear();
    cancelAnimationFrame(game.animationFrame);
    gameScreen.hidden = true;
    homeScreen.hidden = false;
    pausePanel.hidden = true;
    resultPanel.hidden = true;
    resizePreview();
  }

  function togglePause(forcePause = !game.paused) {
    if (!game.active) return;
    game.paused = forcePause;
    pausePanel.hidden = !game.paused;
    keys.clear();
    game.firing = false;
    if (game.paused) {
      cancelAnimationFrame(game.animationFrame);
    } else {
      game.lastFrame = 0;
      game.animationFrame = requestAnimationFrame(frame);
    }
  }

  function frame(timestamp) {
    if (!game.active || game.paused) return;
    const delta = game.lastFrame === 0
      ? 0
      : Math.min((timestamp - game.lastFrame) / 1000, 0.04);
    game.lastFrame = timestamp;
    update(delta);
    drawGame();
    if (game.active && !game.paused) {
      game.animationFrame = requestAnimationFrame(frame);
    }
  }

  function update(delta) {
    game.elapsed += delta;
    updatePlayer(delta);
    updateFormation();
    updateWeapons(delta);
    updateShots(delta);
    updatePowerUps(delta);
    updateParticles(delta);
    updateWave(delta);
    game.comboTimer -= delta;
    if (game.comboTimer <= 0) game.combo = 0;
    updateHud();
  }

  function updatePlayer(delta) {
    const player = game.player;
    const oldX = player.x;
    let moveX = 0;
    let moveY = 0;
    if (keys.has("ArrowLeft") || keys.has("KeyA")) moveX -= 1;
    if (keys.has("ArrowRight") || keys.has("KeyD")) moveX += 1;
    if (keys.has("ArrowUp") || keys.has("KeyW")) moveY -= 1;
    if (keys.has("ArrowDown") || keys.has("KeyS")) moveY += 1;
    const diagonalScale = moveX !== 0 && moveY !== 0 ? Math.SQRT1_2 : 1;
    player.x += (moveX * diagonalScale * 0.62 * delta) / game.width;
    player.y += (moveY * diagonalScale * 0.62 * delta) / game.height;
    player.x = clamp(player.x, 0.055, 0.945);
    player.y = clamp(player.y, 0.52, 0.9);
    player.bank = clamp((player.x - oldX) * game.width * 0.004, -0.42, 0.42);
    player.invulnerable = Math.max(0, player.invulnerable - delta);
  }

  function updateFormation() {
    const sway = Math.sin(game.elapsed * (0.72 + game.wave * 0.035)) * 0.15;
    for (const chicken of chickens) {
      chicken.x = clamp(
        0.5 + sway + (chicken.column - 2) * 0.125 +
          Math.sin(game.elapsed * 1.2 + chicken.phase) * 0.014,
        0.06,
        0.94,
      );
      chicken.y = 0.16 + chicken.row * 0.115 +
        Math.sin(game.elapsed * 1.7 + chicken.phase) * 0.009;
    }
  }

  function updateWeapons(delta) {
    game.playerFireCooldown = Math.max(0, game.playerFireCooldown - delta);
    if ((game.firing || keys.has("Space")) && game.playerFireCooldown === 0) {
      firePlayerShot();
    }

    game.enemyFireCooldown -= delta;
    if (game.enemyFireCooldown <= 0 && chickens.length > 0) {
      const attacker = chickens[Math.floor(Math.random() * chickens.length)];
      if (attacker) fireEgg(attacker);
      game.enemyFireCooldown = Math.max(0.58, 1.45 - game.wave * 0.055);
    }
  }

  function updateShots(delta) {
    for (const shot of shots) {
      shot.x += shot.vx * delta;
      shot.y += shot.vy * delta;
      if (shot.playerShot) {
        const target = chickens.find((chicken) =>
          !chicken.dead && pixelsBetween(shot.x, shot.y, chicken.x, chicken.y) <
            game.width * (0.034 + chicken.row * 0.002));
        if (target) {
          shot.hit = true;
          target.health--;
          addParticles(target.x * game.width, target.y * game.height, "#fff0bc", 5);
          if (target.health <= 0) defeatChicken(target);
        }
      } else if (
        game.player.invulnerable === 0 &&
        pixelsBetween(shot.x, shot.y, game.player.x, game.player.y) < game.width * 0.045
      ) {
        shot.hit = true;
        damagePlayer();
      }
    }
    removeExpired(shots, (shot) =>
      shot.hit || shot.x < -0.1 || shot.x > 1.1 || shot.y < -0.1 || shot.y > 1.1);
  }

  function updatePowerUps(delta) {
    for (const item of powerUps) {
      item.y += delta * 0.12;
      item.phase += delta * 3;
      if (pixelsBetween(item.x, item.y, game.player.x, game.player.y) < game.width * 0.06) {
        item.collected = true;
        game.bombs = Math.min(5, game.bombs + 1);
        addParticles(item.x * game.width, item.y * game.height, "#ffdda8", 14);
      }
    }
    removeExpired(powerUps, (item) => item.collected || item.y > 1.05);
  }

  function updateParticles(delta) {
    for (const particle of particles) {
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.life -= delta;
    }
    removeExpired(particles, (particle) => particle.life <= 0);
  }

  function updateWave(delta) {
    removeExpired(chickens, (chicken) => chicken.dead);
    if (chickens.length > 0) return;
    if (game.waveTransition === 0) {
      game.waveTransition = 1.8;
      game.enemyFireCooldown = 1.8;
    }
    game.waveTransition -= delta;
    if (game.waveTransition <= 0) {
      game.wave++;
      game.waveTransition = 0;
      spawnWave();
    }
  }

  function firePlayerShot() {
    if (!game.active || game.paused || game.playerFireCooldown > 0) return;
    shots.push({
      x: game.player.x,
      y: game.player.y - 0.035,
      vx: 0,
      vy: -1.08,
      playerShot: true,
      hit: false,
    });
    game.playerFireCooldown = 0.16;
  }

  function fireEgg(chicken) {
    const dx = (game.player.x - chicken.x) * game.width;
    const dy = (game.player.y - chicken.y) * game.height;
    const length = Math.hypot(dx, dy) || 1;
    const speed = 220 + Math.min(game.wave * 9, 100);
    shots.push({
      x: chicken.x,
      y: chicken.y + 0.025,
      vx: (dx / length * speed) / game.width,
      vy: (dy / length * speed) / game.height,
      playerShot: false,
      hit: false,
    });
  }

  function useBomb() {
    if (!game.active || game.paused || game.bombs === 0) return;
    game.bombs--;
    for (const chicken of chickens) {
      addParticles(chicken.x * game.width, chicken.y * game.height, "#ffe8a6", 12);
      defeatChicken(chicken, false);
    }
    for (const shot of shots) {
      if (!shot.playerShot) shot.hit = true;
    }
    updateHud();
  }

  function defeatChicken(chicken, allowPowerUp = true) {
    if (chicken.dead) return;
    chicken.dead = true;
    game.waveKills++;
    game.kills++;
    game.combo++;
    game.comboTimer = 2.4;
    game.score += 100 + Math.min(game.combo - 1, 20) * 25;
    if (allowPowerUp && game.kills % 8 === 0) {
      powerUps.push({ x: chicken.x, y: chicken.y, phase: 0, collected: false });
    }
  }

  function damagePlayer() {
    game.player.lives--;
    game.player.invulnerable = 1.25;
    game.combo = 0;
    game.comboTimer = 0;
    addParticles(game.player.x * game.width, game.player.y * game.height, "#ff9b83", 18);
    if (game.player.lives <= 0) finishGame();
  }

  function addParticles(x, y, color, count) {
    for (let index = 0; index < count; index++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 95;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.25 + Math.random() * 0.5,
        maxLife: 0.75,
        size: 1.5 + Math.random() * 3,
        color,
      });
    }
  }

  function removeExpired(items, shouldRemove) {
    for (let index = items.length - 1; index >= 0; index--) {
      if (shouldRemove(items[index])) items.splice(index, 1);
    }
  }

  function pixelsBetween(x1, y1, x2, y2) {
    return Math.hypot((x1 - x2) * game.width, (y1 - y2) * game.height);
  }

  function finishGame() {
    game.active = false;
    game.paused = false;
    game.firing = false;
    keys.clear();
    const isNewBest = game.score > game.best;
    if (isNewBest) {
      game.best = game.score;
      saveBestScore();
    }
    resultTitle.textContent = "PHI ĐỘI BỊ HẠ";
    resultIcon.textContent = "✦";
    resultEyebrow.textContent = isNewBest
      ? "KỶ LỤC MỚI!"
      : `SỐ ĐÀN GÀ ĐÃ HẠ: ${game.kills}`;
    resultScore.textContent = formatScore(game.score);
    pausePanel.hidden = true;
    resultPanel.hidden = false;
    updateHud();
  }

  function updateHud() {
    scoreText.textContent = formatScore(game.score);
    bestText.textContent = `KỶ LỤC ${formatScore(game.best)}`;
    waveText.textContent = String(game.wave).padStart(2, "0");
    const remaining = chickens.length;
    birdsLeft.textContent = game.waveTransition > 0
      ? `ĐỢT TIẾP THEO ${Math.ceil(game.waveTransition)}...`
      : `${remaining} MỤC TIÊU`;
    waveProgress.style.width = `${game.waveSize === 0 ? 0 : (game.waveKills / game.waveSize) * 100}%`;
    livesText.textContent = `${"♥ ".repeat(Math.max(0, game.player.lives)).trim()}${game.player.lives > 0 ? "" : "—"}`;
    livesText.setAttribute("aria-label", `${Math.max(0, game.player.lives)} mạng`);
    bombCount.textContent = `BOM × ${game.bombs}`;
    bombButton.disabled = game.bombs === 0;
    flightData.textContent =
      `TỌA ĐỘ ${String(Math.round(game.player.x * 100)).padStart(2, "0")} / ` +
      `${String(Math.round(game.player.y * 100)).padStart(2, "0")}` +
      (game.combo > 1 ? `   •   COMBO ×${game.combo}` : "");
  }

  function formatScore(score) {
    return String(score).padStart(6, "0");
  }

  function drawGame() {
    const width = game.width;
    const height = game.height;
    if (width <= 0 || height <= 0) return;
    drawWorld(context, width, height, game.elapsed);
    drawPowerUps(context);
    drawChickens(context, width);
    drawShots(context, width, height);
    drawPlane(
      context,
      game.player.x * width,
      game.player.y * height,
      Math.min(width * 0.18, height * 0.24),
      game.player.bank,
      game.player.invulnerable > 0,
      game.elapsed,
    );
    drawParticles(context);
    if (game.waveTransition > 0 && game.waveKills >= game.waveSize) {
      drawCenterLabel(context, width, height, `ĐỢT ${game.wave} ĐÃ BỊ ĐẨY LÙI`);
    }
  }

  function drawPreview(width, height) {
    drawWorld(previewContext, width, height, performance.now() / 10000);
    drawChicken(previewContext, width * 0.66, height * 0.28, Math.min(width * 0.1, 50), 0.7, 0);
    drawChicken(previewContext, width * 0.79, height * 0.34, Math.min(width * 0.08, 40), 1.8, 0.3);
    drawChicken(previewContext, width * 0.53, height * 0.38, Math.min(width * 0.07, 36), 0.1, 0.7);
    drawPlane(
      previewContext,
      width * 0.39,
      height * 0.72,
      Math.min(width * 0.29, height * 0.5),
      -0.18,
      false,
      performance.now() / 1000,
    );
  }

  function drawWorld(ctx, width, height, time) {
    const horizon = height * 0.55;
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#102e4b");
    sky.addColorStop(0.38, "#558ca0");
    sky.addColorStop(0.62, "#c3b58f");
    sky.addColorStop(1, "#243f3d");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const sunX = width * (0.72 + Math.sin(time * 0.04) * 0.025);
    const sunY = height * 0.28;
    const sunlight = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, width * 0.42);
    sunlight.addColorStop(0, "rgb(255 230 179 / 48%)");
    sunlight.addColorStop(0.25, "rgb(255 220 166 / 17%)");
    sunlight.addColorStop(1, "rgb(255 220 166 / 0%)");
    ctx.fillStyle = sunlight;
    ctx.fillRect(0, 0, width, height * 0.75);
    ctx.fillStyle = "rgb(255 236 195 / 84%)";
    ctx.beginPath();
    ctx.arc(sunX, sunY, Math.min(width, height) * 0.035, 0, Math.PI * 2);
    ctx.fill();

    drawRidges(ctx, width, height, horizon, time);
    drawClouds(ctx, width, height, time);
    drawPerspectiveGround(ctx, width, height, horizon, time);
  }

  function drawRidges(ctx, width, height, horizon, time) {
    const farShift = Math.sin(time * 0.06) * width * 0.012;
    const layers = [
      { color: "rgb(55 94 105 / 45%)", y: 0.48, height: 0.12, speed: 0.5 },
      { color: "rgb(39 83 82 / 64%)", y: 0.54, height: 0.15, speed: 0.8 },
      { color: "rgb(31 70 62 / 92%)", y: 0.61, height: 0.12, speed: 1.1 },
    ];
    for (const [layerIndex, layer] of layers.entries()) {
      const offset = farShift * layer.speed;
      const base = height * layer.y;
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      ctx.lineTo(width * 0.12 + offset, base - height * layer.height * 0.55);
      ctx.lineTo(width * 0.24 + offset, base);
      ctx.lineTo(width * 0.39 + offset, base - height * layer.height);
      ctx.lineTo(width * 0.54 + offset, base + height * 0.015);
      ctx.lineTo(width * 0.72 + offset, base - height * layer.height * 0.75);
      ctx.lineTo(width * 0.88 + offset, base);
      ctx.lineTo(width, base - height * layer.height * 0.5);
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fillStyle = layer.color;
      ctx.fill();
      if (layerIndex === 0) {
        ctx.strokeStyle = "rgb(236 225 190 / 15%)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  function drawClouds(ctx, width, height, time) {
    for (const cloud of clouds) {
      const x = ((cloud.x + time * cloud.speed) % 1.25 - 0.12) * width;
      const y = cloud.y * height;
      const cloudWidth = cloud.width * (width / 800);
      ctx.save();
      ctx.globalAlpha = cloud.opacity;
      ctx.fillStyle = "#edf8f5";
      ctx.shadowColor = "#e8fbff";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.ellipse(x, y, cloudWidth, cloudWidth * 0.12, 0, 0, Math.PI * 2);
      ctx.ellipse(x - cloudWidth * 0.25, y + 3, cloudWidth * 0.48, cloudWidth * 0.13, 0, 0, Math.PI * 2);
      ctx.ellipse(x + cloudWidth * 0.22, y + 2, cloudWidth * 0.42, cloudWidth * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPerspectiveGround(ctx, width, height, horizon, time) {
    const ground = ctx.createLinearGradient(0, horizon, 0, height);
    ground.addColorStop(0, "rgb(79 122 95 / 30%)");
    ground.addColorStop(1, "rgb(16 45 42 / 86%)");
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, width, height - horizon);

    const gridOffset = (time * 0.12) % 0.12;
    ctx.strokeStyle = "rgb(178 231 198 / 14%)";
    ctx.lineWidth = 1;
    for (let index = 0; index < 12; index++) {
      const depth = (index / 11 + gridOffset) % 1;
      const y = horizon + (height - horizon) * depth * depth;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    const vanishingX = width * 0.5 + Math.sin(time * 0.05) * width * 0.025;
    for (let index = -8; index <= 8; index++) {
      ctx.beginPath();
      ctx.moveTo(vanishingX, horizon);
      ctx.lineTo(width * (0.5 + index * 0.22), height);
      ctx.stroke();
    }
  }

  function drawChickens(ctx, width) {
    for (const chicken of chickens) {
      const depth = 0.72 + chicken.row * 0.13;
      const size = Math.min(width * 0.072, 62) * depth;
      const wingBeat = Math.sin(game.elapsed * 9 + chicken.phase);
      drawChicken(
        ctx,
        chicken.x * width,
        chicken.y * game.height,
        size,
        chicken.phase,
        wingBeat,
        chicken.health / chicken.maxHealth,
      );
    }
  }

  function drawChicken(ctx, x, y, size, phase, wingBeat, healthRatio = 1) {
    ctx.save();
    ctx.translate(x, y + Math.sin(phase * 2 + game.elapsed * 2) * size * 0.035);
    ctx.scale(size / 72, size / 72);
    ctx.shadowColor = "rgb(4 17 20 / 40%)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;

    ctx.fillStyle = "#3e5050";
    ctx.beginPath();
    ctx.ellipse(0, 30, 26, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createLinearGradient(-24, -23, 24, 27);
    body.addColorStop(0, healthRatio < 1 ? "#fff0bd" : "#fff8de");
    body.addColorStop(0.48, "#e9cda3");
    body.addColorStop(1, "#b78867");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 4, 25, 30, -0.08, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = "transparent";
    const wing = ctx.createLinearGradient(-25, -5, 23, 14);
    wing.addColorStop(0, "#d5b18a");
    wing.addColorStop(1, "#fff2d5");
    ctx.fillStyle = wing;
    ctx.save();
    ctx.translate(-12, 5);
    ctx.rotate(-0.15 + wingBeat * 0.12);
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 9 + Math.max(0, wingBeat) * 3, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#f7e6c6";
    for (let feather = 0; feather < 3; feather++) {
      ctx.beginPath();
      ctx.ellipse(-22 - feather * 3, -12 + feather * 8, 7, 3.5, -0.65, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#e9cda3";
    ctx.beginPath();
    ctx.ellipse(10, -20, 13, 15, 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f7e6c6";
    ctx.beginPath();
    ctx.arc(11, -25, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#d94e49";
    for (let bump = 0; bump < 3; bump++) {
      ctx.beginPath();
      ctx.arc(5 + bump * 5, -36 - (bump === 1 ? 3 : 0), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(17, -23);
    ctx.lineTo(30, -18);
    ctx.lineTo(17, -13);
    ctx.closePath();
    ctx.fillStyle = "#f4a940";
    ctx.fill();

    ctx.fillStyle = "#263a42";
    ctx.beginPath();
    ctx.arc(14, -27, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(14.7, -27.7, 0.75, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#d98a33";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    for (const footX of [-7, 8]) {
      ctx.beginPath();
      ctx.moveTo(footX, 26);
      ctx.lineTo(footX + 1, 34);
      ctx.lineTo(footX - 4, 36);
      ctx.moveTo(footX + 1, 34);
      ctx.lineTo(footX + 5, 36);
      ctx.stroke();
    }

    if (healthRatio < 1) {
      ctx.fillStyle = "#ff776d";
      ctx.fillRect(-18, -45, 36 * healthRatio, 3);
      ctx.strokeStyle = "rgb(20 30 35 / 60%)";
      ctx.lineWidth = 1;
      ctx.strokeRect(-18, -45, 36, 3);
    }
    ctx.restore();
  }

  function drawPlane(ctx, x, y, size, bank, flashing, time) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(bank);
    ctx.scale(size / 100, size / 100);

    const exhaust = ctx.createRadialGradient(0, 42, 1, 0, 42, 23);
    exhaust.addColorStop(0, "rgb(255 225 145 / 70%)");
    exhaust.addColorStop(1, "rgb(255 225 145 / 0%)");
    ctx.fillStyle = exhaust;
    ctx.beginPath();
    ctx.ellipse(0, 43, 18, 24 + Math.sin(time * 20) * 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgb(5 23 30 / 35%)";
    ctx.beginPath();
    ctx.ellipse(0, 16, 48, 29, 0, 0, Math.PI * 2);
    ctx.fill();

    const wing = ctx.createLinearGradient(-45, -5, 42, 25);
    wing.addColorStop(0, "#207b80");
    wing.addColorStop(0.45, "#69d7c8");
    wing.addColorStop(1, "#d0fff0");
    ctx.fillStyle = wing;
    ctx.beginPath();
    ctx.moveTo(0, -35);
    ctx.lineTo(9, -9);
    ctx.lineTo(48, 13);
    ctx.lineTo(45, 23);
    ctx.lineTo(9, 17);
    ctx.lineTo(6, 37);
    ctx.lineTo(20, 45);
    ctx.lineTo(18, 50);
    ctx.lineTo(0, 45);
    ctx.lineTo(-18, 50);
    ctx.lineTo(-20, 45);
    ctx.lineTo(-6, 37);
    ctx.lineTo(-9, 17);
    ctx.lineTo(-45, 23);
    ctx.lineTo(-48, 13);
    ctx.lineTo(-9, -9);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgb(11 52 61 / 76%)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-40, 17);
    ctx.lineTo(-10, 13);
    ctx.moveTo(40, 17);
    ctx.lineTo(10, 13);
    ctx.moveTo(-16, 43);
    ctx.lineTo(0, 40);
    ctx.lineTo(16, 43);
    ctx.stroke();

    const fuselage = ctx.createLinearGradient(-8, -38, 9, 42);
    fuselage.addColorStop(0, "#f7ffec");
    fuselage.addColorStop(0.32, "#9ef6df");
    fuselage.addColorStop(0.7, "#48bdb7");
    fuselage.addColorStop(1, "#236a79");
    ctx.fillStyle = fuselage;
    ctx.beginPath();
    ctx.moveTo(0, -47);
    ctx.quadraticCurveTo(7, -25, 8, -4);
    ctx.lineTo(5, 33);
    ctx.lineTo(0, 44);
    ctx.lineTo(-5, 33);
    ctx.lineTo(-8, -4);
    ctx.quadraticCurveTo(-7, -25, 0, -47);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const canopy = ctx.createLinearGradient(-5, -33, 5, -8);
    canopy.addColorStop(0, "#efffff");
    canopy.addColorStop(0.4, "#78cde0");
    canopy.addColorStop(1, "#234f70");
    ctx.fillStyle = canopy;
    ctx.beginPath();
    ctx.moveTo(0, -34);
    ctx.quadraticCurveTo(7, -22, 4, -11);
    ctx.lineTo(0, -7);
    ctx.lineTo(-4, -11);
    ctx.quadraticCurveTo(-7, -22, 0, -34);
    ctx.fill();

    ctx.fillStyle = "#f7d27f";
    ctx.beginPath();
    ctx.ellipse(0, -44, 3, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgb(236 255 245 / 90%)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -45);
    ctx.lineTo(-10, -51);
    ctx.moveTo(0, -45);
    ctx.lineTo(10, -51);
    ctx.stroke();

    if (flashing && Math.floor(time * 16) % 2 === 0) {
      ctx.fillStyle = "rgb(239 255 249 / 36%)";
      ctx.beginPath();
      ctx.ellipse(0, 0, 55, 59, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawShots(ctx, width, height) {
    for (const shot of shots) {
      const x = shot.x * width;
      const y = shot.y * height;
      if (shot.playerShot) {
        ctx.strokeStyle = "rgb(169 255 235 / 30%)";
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(x, y + 17);
        ctx.lineTo(x, y - 10);
        ctx.stroke();
        ctx.strokeStyle = "#e5fff4";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y + 14);
        ctx.lineTo(x, y - 11);
        ctx.stroke();
        ctx.fillStyle = "#caff8d";
        ctx.beginPath();
        ctx.arc(x, y - 12, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.atan2(shot.vy * height, shot.vx * width) + Math.PI / 2);
        const egg = ctx.createLinearGradient(-5, -10, 5, 10);
        egg.addColorStop(0, "#fff8ca");
        egg.addColorStop(0.55, "#ffc879");
        egg.addColorStop(1, "#d87145");
        ctx.fillStyle = egg;
        ctx.beginPath();
        ctx.ellipse(0, 0, 5, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawPowerUps(ctx) {
    for (const item of powerUps) {
      const x = item.x * game.width;
      const y = item.y * game.height;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(item.phase);
      ctx.shadowColor = "#ffdda8";
      ctx.shadowBlur = 18;
      ctx.fillStyle = "#ffdda8";
      ctx.beginPath();
      for (let point = 0; point < 10; point++) {
        const radius = point % 2 === 0 ? 13 : 6;
        const angle = (point * Math.PI) / 5 - Math.PI / 2;
        ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawParticles(ctx) {
    for (const particle of particles) {
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawCenterLabel(ctx, width, height, text) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "800 14px system-ui, sans-serif";
    ctx.fillStyle = "rgb(7 20 29 / 72%)";
    ctx.fillRect(width * 0.25, height * 0.45, width * 0.5, 44);
    ctx.fillStyle = "#d8fff1";
    ctx.fillText(text, width * 0.5, height * 0.45 + 27);
    ctx.restore();
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
    if (event.code === "Escape" || event.code === "KeyP") {
      if (game.active) togglePause();
      return;
    }
    if (!controlKeys.has(event.code) || !game.active || game.paused) return;
    event.preventDefault();
    keys.add(event.code);
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.code);
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (!game.active || game.paused) return;
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
    game.player.y = clamp((event.clientY - bounds.top) / bounds.height, 0.52, 0.9);
  }

  canvas.addEventListener("pointerup", (event) => {
    if (event.pointerId === game.pointerId) game.pointerId = null;
  });
  canvas.addEventListener("pointercancel", () => {
    game.pointerId = null;
  });

  fireButton.addEventListener("pointerdown", (event) => {
    if (!game.active || game.paused) return;
    event.preventDefault();
    game.firing = true;
    fireButton.setPointerCapture(event.pointerId);
    firePlayerShot();
  });
  fireButton.addEventListener("pointerup", () => {
    game.firing = false;
  });
  fireButton.addEventListener("pointercancel", () => {
    game.firing = false;
  });
  fireButton.addEventListener("click", (event) => {
    if (event.detail === 0) firePlayerShot();
  });

  startButton.addEventListener("click", startGame);
  exitButton.addEventListener("click", returnHome);
  pauseButton.addEventListener("click", () => togglePause());
  resumeButton.addEventListener("click", () => togglePause(false));
  pauseHomeButton.addEventListener("click", returnHome);
  fireButton.addEventListener("click", () => {
    if (game.active && !game.paused && game.playerFireCooldown === 0) {
      firePlayerShot();
    }
  });
  bombButton.addEventListener("click", useBomb);
  retryButton.addEventListener("click", startGame);
  homeButton.addEventListener("click", returnHome);
  window.addEventListener("resize", () => {
    resizeCanvas();
    resizePreview();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && game.active && !game.paused) togglePause(true);
  });

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Không thể bật chế độ chơi offline.", error);
    });
  }

  resizePreview();
  updateHud();
})();
