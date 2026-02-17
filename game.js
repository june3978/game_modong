const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const energyEl = document.getElementById('energy');
const timeEl = document.getElementById('time');
const restBtn = document.getElementById('restBtn');

const state = {
  player: { x: 120, y: 420, size: 16, speed: 2.2 },
  score: 0,
  energy: 100,
  keys: new Set(),
  collectibles: [],
  fishes: [],
  fireflies: [],
  cycle: 0,
  msg: '평화로운 숲에 오신 걸 환영해요.',
  msgTimer: 240,
};

const homeArea = { x: 80, y: 360, w: 130, h: 120 };
const lakeArea = { x: 610, y: 180, w: 250, h: 190 };

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function spawnCollectibles() {
  state.collectibles = Array.from({ length: 18 }, () => ({
    x: rand(40, canvas.width - 40),
    y: rand(40, canvas.height - 40),
    type: Math.random() > 0.45 ? 'flower' : 'shell',
    size: Math.random() > 0.6 ? 12 : 10,
  }));
}

function spawnFish() {
  state.fishes = Array.from({ length: 7 }, () => ({
    x: rand(lakeArea.x + 20, lakeArea.x + lakeArea.w - 20),
    y: rand(lakeArea.y + 20, lakeArea.y + lakeArea.h - 20),
    dir: Math.random() > 0.5 ? 1 : -1,
    speed: rand(0.5, 1.3),
  }));
}

function spawnFireflies() {
  state.fireflies = Array.from({ length: 20 }, () => ({
    x: rand(20, canvas.width - 20),
    y: rand(30, canvas.height - 30),
    phase: rand(0, Math.PI * 2),
  }));
}

function setMessage(text) {
  state.msg = text;
  state.msgTimer = 180;
}

function drawBackground(dayFactor) {
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, `rgba(${80 + dayFactor * 80}, ${140 + dayFactor * 70}, ${220 - dayFactor * 120}, 1)`);
  grad.addColorStop(1, `rgba(${60 + dayFactor * 40}, ${170 + dayFactor * 40}, ${110 + dayFactor * 50}, 1)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(236, 253, 245, 0.8)';
  ctx.fillRect(0, canvas.height - 150, canvas.width, 150);

  ctx.fillStyle = '#60a5fa';
  ctx.beginPath();
  ctx.roundRect(lakeArea.x, lakeArea.y, lakeArea.w, lakeArea.h, 24);
  ctx.fill();

  ctx.fillStyle = '#92400e';
  ctx.fillRect(homeArea.x + 10, homeArea.y + 26, 96, 80);
  ctx.fillStyle = '#7c2d12';
  ctx.beginPath();
  ctx.moveTo(homeArea.x - 2, homeArea.y + 30);
  ctx.lineTo(homeArea.x + 58, homeArea.y - 8);
  ctx.lineTo(homeArea.x + 118, homeArea.y + 30);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(homeArea.x + 126, homeArea.y + 90, 10, 0, Math.PI * 2);
  ctx.fill();
}

function drawCollectible(item) {
  ctx.save();
  ctx.translate(item.x, item.y);

  if (item.type === 'flower') {
    ctx.fillStyle = '#f472b6';
    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 * i) / 5;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * 5, Math.sin(angle) * 5, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 5, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d97706';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0.6, 2.6);
    ctx.stroke();
  }

  ctx.restore();
}

function drawFish(fish) {
  ctx.save();
  ctx.translate(fish.x, fish.y);
  ctx.scale(fish.dir, 1);
  ctx.fillStyle = '#fef9c3';
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-9, 0);
  ctx.lineTo(-15, -5);
  ctx.lineTo(-15, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPlayer() {
  const { x, y } = state.player;
  ctx.fillStyle = '#2563eb';
  ctx.beginPath();
  ctx.arc(x, y - 12, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(x - 8, y - 4, 16, 22);

  ctx.fillStyle = '#fef3c7';
  ctx.beginPath();
  ctx.arc(x, y - 14, 7, 0, Math.PI * 2);
  ctx.fill();
}

function drawUI(dayFactor) {
  if (dayFactor < 0.4) {
    state.fireflies.forEach((f) => {
      const glow = (Math.sin(state.cycle * 0.04 + f.phase) + 1) * 0.5;
      ctx.fillStyle = `rgba(253, 224, 71, ${0.2 + glow * 0.8})`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 2 + glow * 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  if (state.msgTimer > 0) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(20, 20, 360, 36);
    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.fillText(state.msg, 32, 44);
    state.msgTimer -= 1;
  }
}

function updatePlayer() {
  const p = state.player;
  const speed = state.energy > 0 ? p.speed : 1.2;
  if (state.keys.has('ArrowUp') || state.keys.has('w')) p.y -= speed;
  if (state.keys.has('ArrowDown') || state.keys.has('s')) p.y += speed;
  if (state.keys.has('ArrowLeft') || state.keys.has('a')) p.x -= speed;
  if (state.keys.has('ArrowRight') || state.keys.has('d')) p.x += speed;

  p.x = Math.max(p.size, Math.min(canvas.width - p.size, p.x));
  p.y = Math.max(p.size, Math.min(canvas.height - p.size, p.y));

  if (state.keys.size > 0) {
    state.energy = Math.max(0, state.energy - 0.03);
  } else {
    state.energy = Math.min(100, state.energy + 0.02);
  }
}

function updateFishes() {
  state.fishes.forEach((fish) => {
    fish.x += fish.speed * fish.dir;
    if (fish.x < lakeArea.x + 15 || fish.x > lakeArea.x + lakeArea.w - 15) {
      fish.dir *= -1;
    }
  });
}

function tryCollect() {
  state.collectibles = state.collectibles.filter((item) => {
    const d = Math.hypot(item.x - state.player.x, item.y - state.player.y);
    if (d < 18) {
      state.score += item.type === 'flower' ? 8 : 12;
      state.energy = Math.min(100, state.energy + 3);
      setMessage(item.type === 'flower' ? '향긋한 꽃을 모았어요 🌸' : '반짝이는 조개를 주웠어요 🐚');
      return false;
    }
    return true;
  });

  if (state.collectibles.length < 8) {
    spawnCollectibles();
  }
}

function fishAction() {
  const { x, y } = state.player;
  const nearLake = x > lakeArea.x - 30 && x < lakeArea.x + lakeArea.w + 30 && y > lakeArea.y - 30 && y < lakeArea.y + lakeArea.h + 30;
  if (!nearLake) {
    setMessage('호수 근처에서 낚시할 수 있어요 🎣');
    return;
  }

  const luck = Math.random();
  if (luck > 0.5) {
    const bonus = Math.floor(rand(15, 36));
    state.score += bonus;
    setMessage(`월척! 점수 +${bonus} 🎉`);
  } else {
    state.energy = Math.min(100, state.energy + 8);
    setMessage('작은 물고기와 함께 마음도 차분해졌어요 🫧');
  }
}

function restAtHome() {
  const { x, y } = state.player;
  const inHome = x > homeArea.x && x < homeArea.x + homeArea.w && y > homeArea.y && y < homeArea.y + homeArea.h;
  if (!inHome) {
    setMessage('집 근처로 가서 쉬어보세요 🛖');
    return;
  }

  state.energy = Math.min(100, state.energy + 25);
  state.score += 5;
  setMessage('모닥불 앞에서 휴식! 에너지 회복 +25 🔥');
}

function updateTimeLabel(dayFactor) {
  const label = dayFactor > 0.66 ? '아침' : dayFactor > 0.33 ? '노을' : '밤';
  timeEl.textContent = `시간: ${label}`;
}

function tick() {
  state.cycle += 1;
  const dayFactor = (Math.sin(state.cycle * 0.003) + 1) / 2;

  drawBackground(dayFactor);
  updatePlayer();
  updateFishes();
  tryCollect();

  state.collectibles.forEach(drawCollectible);
  state.fishes.forEach(drawFish);
  drawPlayer();
  drawUI(dayFactor);

  scoreEl.textContent = `점수: ${Math.floor(state.score)}`;
  energyEl.textContent = `에너지: ${Math.floor(state.energy)}`;
  updateTimeLabel(dayFactor);

  requestAnimationFrame(tick);
}

window.addEventListener('keydown', (e) => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key === ' ') {
    fishAction();
    e.preventDefault();
    return;
  }

  state.keys.add(key);
});

window.addEventListener('keyup', (e) => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  state.keys.delete(key);
});

restBtn.addEventListener('click', restAtHome);

spawnCollectibles();
spawnFish();
spawnFireflies();
tick();
