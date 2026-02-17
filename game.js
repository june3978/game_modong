const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const ui = {
  time: document.getElementById('timeLabel'),
  weather: document.getElementById('weatherLabel'),
  energy: document.getElementById('energyLabel'),
  mood: document.getElementById('moodLabel'),
  coins: document.getElementById('coinsLabel'),
  level: document.getElementById('levelLabel'),
  inventory: document.getElementById('inventory'),
  quest: document.getElementById('questBox'),
  hint: document.getElementById('hint'),
  restBtn: document.getElementById('restBtn'),
};

const TILE = 48;
const MAP_W = 48;
const MAP_H = 30;

const ITEMS = [
  { key: 'flower', icon: '🌸', label: '꽃', value: 5 },
  { key: 'shell', icon: '🐚', label: '조개', value: 8 },
  { key: 'berry', icon: '🫐', label: '열매', value: 6 },
  { key: 'fish', icon: '🐟', label: '물고기', value: 12 },
  { key: 'wood', icon: '🪵', label: '나무', value: 4 },
];

const state = {
  keys: new Set(),
  player: { x: 420, y: 420, speed: 2.4, energy: 100, mood: 100, anim: 0 },
  camera: { x: 0, y: 0 },
  worldTime: 0,
  weather: 'sunny',
  coins: 0,
  xp: 0,
  level: 1,
  hint: '숲의 주민 루나를 찾아 말을 걸어보세요. (E)',
  hintTimer: 260,
  inventory: Object.fromEntries(ITEMS.map((i) => [i.key, 0])),
  objects: [],
  particles: [],
  fish: [],
  npcs: [
    { id: 'luna', x: 780, y: 690, name: '루나', color: '#f59e0b', pulse: 0 },
  ],
  quest: {
    id: 1,
    title: '루나의 피크닉 준비',
    needs: { flower: 6, berry: 4, fish: 2 },
    reward: 120,
    complete: false,
  },
};

const biomes = Array.from({ length: MAP_H }, (_, gy) =>
  Array.from({ length: MAP_W }, (_, gx) => {
    const n = Math.sin(gx * 0.25) + Math.cos(gy * 0.33) + Math.random() * 0.7;
    if (gx > 28 && gx < 42 && gy > 8 && gy < 21) return 'water';
    if (n > 1.2) return 'meadow';
    if (n > 0.4) return 'grass';
    return 'grove';
  })
);

function rnd(min, max) { return Math.random() * (max - min) + min; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function worldToScreen(x, y) {
  return { x: x - state.camera.x, y: y - state.camera.y };
}

function spawnWorldObjects() {
  const next = [];
  for (let y = 1; y < MAP_H - 1; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      const biome = biomes[y][x];
      if (biome === 'water') continue;
      const chance = biome === 'meadow' ? 0.13 : biome === 'grass' ? 0.09 : 0.12;
      if (Math.random() < chance) {
        const key = biome === 'grove' ? (Math.random() > 0.65 ? 'wood' : 'berry') : (Math.random() > 0.45 ? 'flower' : 'berry');
        next.push({
          kind: key,
          x: x * TILE + rnd(10, TILE - 10),
          y: y * TILE + rnd(10, TILE - 10),
          bob: rnd(0, Math.PI * 2),
        });
      }
    }
  }
  state.objects = next;
}

function spawnFish() {
  state.fish = Array.from({ length: 14 }, () => ({
    x: rnd(29 * TILE, 41 * TILE),
    y: rnd(9 * TILE, 20 * TILE),
    dir: Math.random() > 0.5 ? 1 : -1,
    speed: rnd(0.35, 1.1),
  }));
}

function setHint(text, t = 160) {
  state.hint = text;
  state.hintTimer = t;
}

function addParticle(x, y, text, color = '#fff') {
  state.particles.push({ x, y, text, color, life: 65 });
}

function itemMeta(key) {
  return ITEMS.find((i) => i.key === key);
}

function drawTile(gx, gy, biome, day, rain) {
  const sx = gx * TILE - state.camera.x;
  const sy = gy * TILE - state.camera.y;
  if (sx < -TILE || sy < -TILE || sx > canvas.width + TILE || sy > canvas.height + TILE) return;

  const tint = day * 25 - rain * 10;
  if (biome === 'water') {
    ctx.fillStyle = `rgb(${70 + tint}, ${130 + tint}, ${195 + tint})`;
  } else if (biome === 'meadow') {
    ctx.fillStyle = `rgb(${110 + tint}, ${205 + tint}, ${120 + tint})`;
  } else if (biome === 'grove') {
    ctx.fillStyle = `rgb(${85 + tint}, ${160 + tint}, ${92 + tint})`;
  } else {
    ctx.fillStyle = `rgb(${98 + tint}, ${185 + tint}, ${105 + tint})`;
  }
  ctx.fillRect(sx, sy, TILE + 1, TILE + 1);

  if (biome === 'water') {
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(sx + TILE * 0.5, sy + TILE * 0.5, 12 + Math.sin(state.worldTime * 0.05 + gx) * 4, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawWorld() {
  const day = (Math.sin(state.worldTime * 0.0025) + 1) * 0.5;
  const rain = state.weather === 'rainy' ? 1 : 0;

  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, `rgb(${70 + day * 100}, ${120 + day * 80}, ${190 - day * 70})`);
  sky.addColorStop(1, `rgb(${75 + day * 40}, ${170 + day * 50}, ${120 + day * 40})`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const sx = Math.floor(state.camera.x / TILE);
  const sy = Math.floor(state.camera.y / TILE);
  const ex = sx + Math.ceil(canvas.width / TILE) + 2;
  const ey = sy + Math.ceil(canvas.height / TILE) + 2;

  for (let y = sy; y < ey; y++) {
    for (let x = sx; x < ex; x++) {
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
      drawTile(x, y, biomes[y][x], day, rain);
    }
  }

  drawCamp();
}

function drawCamp() {
  const camp = worldToScreen(390, 500);
  ctx.fillStyle = '#7c3f11';
  ctx.fillRect(camp.x, camp.y, 170, 120);
  ctx.fillStyle = '#5b2e0d';
  ctx.beginPath();
  ctx.moveTo(camp.x - 8, camp.y + 12);
  ctx.lineTo(camp.x + 85, camp.y - 56);
  ctx.lineTo(camp.x + 178, camp.y + 12);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(camp.x + 200, camp.y + 92, 10 + Math.sin(state.worldTime * 0.1) * 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawResource(o) {
  const p = worldToScreen(o.x, o.y + Math.sin(state.worldTime * 0.05 + o.bob) * 2);
  if (p.x < -30 || p.y < -30 || p.x > canvas.width + 30 || p.y > canvas.height + 30) return;

  const meta = itemMeta(o.kind);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 8, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = '20px serif';
  ctx.fillText(meta.icon, p.x - 10, p.y + 6);
}

function drawFish() {
  state.fish.forEach((f) => {
    const p = worldToScreen(f.x, f.y);
    if (p.x < -30 || p.y < -30 || p.x > canvas.width + 30 || p.y > canvas.height + 30) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(f.dir, 1);
    ctx.fillStyle = '#fef3c7';
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(-18, -6);
    ctx.lineTo(-18, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
}

function drawNpc(npc) {
  const p = worldToScreen(npc.x, npc.y);
  npc.pulse += 0.06;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 16, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = npc.color;
  ctx.fillRect(p.x - 9, p.y - 8, 18, 24);
  ctx.fillStyle = '#fde68a';
  ctx.beginPath();
  ctx.arc(p.x, p.y - 12, 8, 0, Math.PI * 2);
  ctx.fill();

  if (dist(state.player, npc) < 90) {
    ctx.fillStyle = `rgba(255,255,255,${0.5 + Math.sin(npc.pulse) * 0.3})`;
    ctx.fillRect(p.x - 26, p.y - 44, 52, 20);
    ctx.fillStyle = '#111827';
    ctx.font = '12px sans-serif';
    ctx.fillText('E: 대화', p.x - 18, p.y - 30);
  }
}

function drawPlayer() {
  const p = worldToScreen(state.player.x, state.player.y);
  state.player.anim += state.keys.size ? 0.24 : 0.08;
  const bob = Math.sin(state.player.anim) * 2;

  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 16, 14, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2563eb';
  ctx.fillRect(p.x - 10, p.y - 6 + bob, 20, 24);
  ctx.fillStyle = '#ffedd5';
  ctx.beginPath();
  ctx.arc(p.x, p.y - 12 + bob, 8, 0, Math.PI * 2);
  ctx.fill();
}

function drawParticles() {
  state.particles = state.particles.filter((p) => p.life > 0);
  state.particles.forEach((p) => {
    const s = worldToScreen(p.x, p.y);
    p.y -= 0.35;
    p.life -= 1;
    ctx.fillStyle = p.color.replace('ALPHA', (p.life / 65).toFixed(2));
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(p.text, s.x, s.y);
  });
}

function drawWeather() {
  if (state.weather !== 'rainy') return;
  ctx.strokeStyle = 'rgba(191, 219, 254, 0.55)';
  for (let i = 0; i < 140; i++) {
    const x = (i * 97 + state.worldTime * 3) % (canvas.width + 50);
    const y = (i * 43 + state.worldTime * 5) % (canvas.height + 50);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 5, y + 11);
    ctx.stroke();
  }
}

function updateCamera() {
  state.camera.x = clamp(state.player.x - canvas.width / 2, 0, MAP_W * TILE - canvas.width);
  state.camera.y = clamp(state.player.y - canvas.height / 2, 0, MAP_H * TILE - canvas.height);
}

function playerMove() {
  const p = state.player;
  const running = state.keys.has('Shift');
  const speed = (running ? 1.45 : 1) * (p.energy > 0 ? p.speed : 1.2);

  let dx = 0;
  let dy = 0;
  if (state.keys.has('ArrowUp') || state.keys.has('w')) dy -= speed;
  if (state.keys.has('ArrowDown') || state.keys.has('s')) dy += speed;
  if (state.keys.has('ArrowLeft') || state.keys.has('a')) dx -= speed;
  if (state.keys.has('ArrowRight') || state.keys.has('d')) dx += speed;

  const nx = clamp(p.x + dx, 14, MAP_W * TILE - 14);
  const ny = clamp(p.y + dy, 14, MAP_H * TILE - 14);
  const tx = Math.floor(nx / TILE);
  const ty = Math.floor(ny / TILE);
  const onWater = biomes[ty]?.[tx] === 'water';
  if (!onWater) {
    p.x = nx;
    p.y = ny;
  }

  const moving = dx || dy;
  if (moving) {
    p.energy = clamp(p.energy - (running ? 0.07 : 0.04), 0, 100);
    p.mood = clamp(p.mood + 0.012, 0, 100);
  } else {
    p.energy = clamp(p.energy + 0.035, 0, 100);
    p.mood = clamp(p.mood - 0.004, 0, 100);
  }
}

function updateFish() {
  state.fish.forEach((f) => {
    f.x += f.speed * f.dir;
    if (f.x < 29 * TILE || f.x > 41 * TILE) f.dir *= -1;
  });
}

function collectNearby() {
  const p = state.player;
  let gain = 0;
  state.objects = state.objects.filter((o) => {
    if (dist(p, o) < 22) {
      const meta = itemMeta(o.kind);
      state.inventory[o.kind] += 1;
      gain += meta.value;
      addParticle(o.x, o.y, `+1 ${meta.icon}`, 'rgba(255,255,255,ALPHA)');
      return false;
    }
    return true;
  });

  if (gain) {
    state.xp += gain;
    setHint(`채집 성공! 경험치 +${gain}`);
  }

  if (state.objects.length < 80) spawnWorldObjects();
}

function interact() {
  const npc = state.npcs[0];
  if (dist(state.player, npc) < 86) {
    if (!state.quest.complete) {
      const needs = state.quest.needs;
      const done = Object.entries(needs).every(([k, v]) => state.inventory[k] >= v);
      if (done) {
        Object.entries(needs).forEach(([k, v]) => { state.inventory[k] -= v; });
        state.coins += state.quest.reward;
        state.xp += 80;
        state.quest.complete = true;
        setHint(`퀘스트 완료! 코인 +${state.quest.reward}, 경험치 +80 ✨`, 220);
      } else {
        setHint('루나: 피크닉 재료를 조금만 더 모아줘! 🌼');
      }
    } else {
      state.coins += 10;
      state.mood = clamp(state.player.mood + 6, 0, 100);
      setHint('루나와 담소를 나눴어요. 작은 팁 +10 코인 😊');
    }
    return;
  }

  if (inCamp()) {
    state.player.energy = clamp(state.player.energy + 16, 0, 100);
    state.player.mood = clamp(state.player.mood + 10, 0, 100);
    setHint('캠프 정리를 했어요. 마음이 평온해졌습니다.');
  }
}

function fishAction() {
  const nearWater = biomes[Math.floor(state.player.y / TILE)]?.[Math.floor((state.player.x + 26) / TILE)] === 'water' ||
    biomes[Math.floor(state.player.y / TILE)]?.[Math.floor((state.player.x - 26) / TILE)] === 'water';

  if (!nearWater) {
    setHint('호숫가 근처에서 스페이스를 눌러 낚시하세요.');
    return;
  }

  const luck = Math.random();
  if (luck > 0.45) {
    state.inventory.fish += 1;
    const bonus = Math.floor(rnd(9, 20));
    state.xp += bonus;
    addParticle(state.player.x, state.player.y - 10, '+1 🐟', 'rgba(191, 219, 254, ALPHA)');
    setHint(`낚시 성공! 경험치 +${bonus}`);
  } else {
    state.player.energy = clamp(state.player.energy - 3, 0, 100);
    setHint('물고기가 달아났어요. 타이밍을 다시 맞춰봐요!');
  }
}

function inCamp() {
  const p = state.player;
  return p.x > 360 && p.x < 580 && p.y > 430 && p.y < 660;
}

function rest() {
  if (!inCamp()) {
    setHint('캠프(집) 근처에서만 휴식할 수 있어요.');
    return;
  }
  state.player.energy = 100;
  state.player.mood = clamp(state.player.mood + 18, 0, 100);
  state.worldTime += 600;
  setHint('푹 쉬었습니다. 시간이 조금 흘렀어요. 💤', 220);
}

function updateSystems() {
  state.worldTime += 1;
  if (state.worldTime % 2600 === 0) {
    state.weather = Math.random() > 0.7 ? 'rainy' : 'sunny';
    setHint(state.weather === 'rainy' ? '비가 내리기 시작했어요 ☔' : '맑게 갰어요 ☀️');
  }

  const nextLevel = state.level * 120;
  if (state.xp >= nextLevel) {
    state.level += 1;
    state.player.speed += 0.08;
    state.player.mood = clamp(state.player.mood + 8, 0, 100);
    setHint(`레벨 업! Lv.${state.level} · 이동 속도 증가`, 220);
  }

  if (state.hintTimer > 0) state.hintTimer -= 1;
}

function updateUI() {
  const t = (Math.sin(state.worldTime * 0.0025) + 1) * 0.5;
  const timeLabel = t > 0.66 ? '아침' : t > 0.33 ? '노을' : '밤';

  ui.time.textContent = `🕒 ${timeLabel}`;
  ui.weather.textContent = ` ${state.weather === 'sunny' ? '☀️ 맑음' : '🌧️ 비'}`;
  ui.energy.textContent = `⚡ ${Math.floor(state.player.energy)}`;
  ui.mood.textContent = `💖 ${Math.floor(state.player.mood)}`;
  ui.coins.textContent = `🪙 ${state.coins}`;
  ui.level.textContent = `⭐ ${state.level}`;
  ui.hint.textContent = state.hintTimer > 0 ? state.hint : '';

  ui.inventory.innerHTML = ITEMS.map((i) => `<div>${i.icon} ${i.label}: <b>${state.inventory[i.key]}</b></div>`).join('');

  const needs = state.quest.needs;
  ui.quest.innerHTML = state.quest.complete
    ? `✅ <b>${state.quest.title}</b><br>루나와 계속 대화하면 소소한 보상을 받을 수 있어요.`
    : `📌 <b>${state.quest.title}</b><br>
       꽃 ${state.inventory.flower}/${needs.flower},
       열매 ${state.inventory.berry}/${needs.berry},
       물고기 ${state.inventory.fish}/${needs.fish}<br>
       보상: 🪙 ${state.quest.reward}`;
}

function render() {
  drawWorld();
  state.objects.forEach(drawResource);
  drawFish();
  state.npcs.forEach(drawNpc);
  drawPlayer();
  drawParticles();
  drawWeather();
}

function loop() {
  playerMove();
  updateFish();
  collectNearby();
  updateSystems();
  updateCamera();
  updateUI();
  render();
  requestAnimationFrame(loop);
}

window.addEventListener('keydown', (e) => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key === ' ') {
    fishAction();
    e.preventDefault();
    return;
  }
  if (key === 'e') {
    interact();
    return;
  }
  state.keys.add(key);
});

window.addEventListener('keyup', (e) => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  state.keys.delete(key);
});

ui.restBtn.addEventListener('click', rest);

spawnWorldObjects();
spawnFish();
updateCamera();
updateUI();
loop();
