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
  npcFeed: document.getElementById('npcFeed'),
  quest: document.getElementById('questBox'),
  hint: document.getElementById('hint'),
  restBtn: document.getElementById('restBtn'),
};

const TILE = 48;
const MAP_W = 52;
const MAP_H = 32;
const WORLD_W = MAP_W * TILE;
const WORLD_H = MAP_H * TILE;

const ITEMS = [
  { key: 'flower', icon: '🌸', label: '꽃', value: 5 },
  { key: 'berry', icon: '🫐', label: '열매', value: 6 },
  { key: 'wood', icon: '🪵', label: '목재', value: 4 },
  { key: 'shell', icon: '🐚', label: '조개', value: 8 },
  { key: 'fish', icon: '🐟', label: '물고기', value: 12 },
];

const AI_LABELS = {
  idle: '휴식',
  wander: '산책',
  gather: '채집',
  fish: '낚시',
  social: '대화',
};

const state = {
  keys: new Set(),
  player: { x: 420, y: 430, speed: 2.5, energy: 100, mood: 100, anim: 0 },
  camera: { x: 0, y: 0 },
  weather: 'sunny',
  worldTime: 0,
  dayTick: 0,
  coins: 0,
  xp: 0,
  level: 1,
  inventory: Object.fromEntries(ITEMS.map((i) => [i.key, 0])),
  objects: [],
  fish: [],
  particles: [],
  hint: 'NPC들이 AI로 스스로 움직입니다. 가까이 가서 E로 대화해보세요!',
  hintTimer: 320,
  aiFeed: [],
  npcs: [],
  quest: {
    title: '마을 잔치 준비',
    needs: { flower: 8, fish: 3, wood: 5 },
    reward: 220,
    complete: false,
  },
};

const CAMP = { x: 360, y: 440, w: 220, h: 210 };
const WATER_BOX = { x1: 30, x2: 46, y1: 8, y2: 23 };

const biomes = Array.from({ length: MAP_H }, (_, gy) =>
  Array.from({ length: MAP_W }, (_, gx) => {
    const noise = Math.sin(gx * 0.27) + Math.cos(gy * 0.31) + Math.random() * 0.7;
    if (gx > WATER_BOX.x1 && gx < WATER_BOX.x2 && gy > WATER_BOX.y1 && gy < WATER_BOX.y2) return 'water';
    if (noise > 1.2) return 'meadow';
    if (noise > 0.35) return 'grass';
    return 'grove';
  })
);

function rnd(min, max) { return Math.random() * (max - min) + min; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function worldToScreen(x, y) {
  return { x: x - state.camera.x, y: y - state.camera.y };
}

function timePhase() {
  const t = (Math.sin(state.worldTime * 0.0022) + 1) * 0.5;
  return t > 0.66 ? '아침' : t > 0.33 ? '노을' : '밤';
}

function addFeed(text) {
  state.aiFeed.unshift(`[${timePhase()}] ${text}`);
  state.aiFeed = state.aiFeed.slice(0, 4);
}

function setHint(text, ttl = 180) {
  state.hint = text;
  state.hintTimer = ttl;
}

function addParticle(x, y, text, color = 'rgba(255,255,255,ALPHA)') {
  state.particles.push({ x, y, text, color, life: 70 });
}

function tileAt(x, y) {
  const gx = Math.floor(clamp(x, 0, WORLD_W - 1) / TILE);
  const gy = Math.floor(clamp(y, 0, WORLD_H - 1) / TILE);
  return biomes[gy]?.[gx] || 'grass';
}

function isWalkable(x, y) {
  return tileAt(x, y) !== 'water';
}

function itemMeta(key) {
  return ITEMS.find((it) => it.key === key);
}

function randomLandPos() {
  let x = rnd(60, WORLD_W - 60);
  let y = rnd(60, WORLD_H - 60);
  let guard = 0;
  while (!isWalkable(x, y) && guard < 20) {
    x = rnd(60, WORLD_W - 60);
    y = rnd(60, WORLD_H - 60);
    guard += 1;
  }
  return { x, y };
}

function spawnWorldObjects() {
  const list = [];
  for (let gy = 1; gy < MAP_H - 1; gy++) {
    for (let gx = 1; gx < MAP_W - 1; gx++) {
      const biome = biomes[gy][gx];
      if (biome === 'water') {
        if (Math.random() < 0.025) {
          list.push({ kind: 'shell', x: gx * TILE + rnd(8, TILE - 8), y: gy * TILE + rnd(8, TILE - 8), bob: rnd(0, Math.PI * 2) });
        }
        continue;
      }
      const chance = biome === 'meadow' ? 0.13 : biome === 'grove' ? 0.11 : 0.09;
      if (Math.random() < chance) {
        const kind = biome === 'grove'
          ? (Math.random() > 0.52 ? 'wood' : 'berry')
          : (Math.random() > 0.4 ? 'flower' : 'berry');
        list.push({ kind, x: gx * TILE + rnd(8, TILE - 8), y: gy * TILE + rnd(8, TILE - 8), bob: rnd(0, Math.PI * 2) });
      }
    }
  }
  state.objects = list;
}

function spawnFish() {
  state.fish = Array.from({ length: 18 }, () => ({
    x: rnd((WATER_BOX.x1 + 1) * TILE, (WATER_BOX.x2 - 1) * TILE),
    y: rnd((WATER_BOX.y1 + 1) * TILE, (WATER_BOX.y2 - 1) * TILE),
    dir: Math.random() > 0.5 ? 1 : -1,
    speed: rnd(0.35, 1.1),
  }));
}

function createNPCs() {
  state.npcs = [
    {
      id: 'luna',
      name: '루나',
      color: '#f59e0b',
      x: 840,
      y: 660,
      speed: 1.25,
      mood: 86,
      energy: 84,
      sociability: 0.72,
      roleBias: { gather: 1.2, fish: 0.7, social: 1.6, wander: 1.0, idle: 0.8 },
      ai: { state: 'wander', thinkCooldown: 0, target: null, pulse: rnd(0, Math.PI * 2), talkCooldown: 0 },
    },
    {
      id: 'bomi',
      name: '보미',
      color: '#22c55e',
      x: 1100,
      y: 520,
      speed: 1.38,
      mood: 82,
      energy: 80,
      sociability: 0.45,
      roleBias: { gather: 1.5, fish: 0.6, social: 0.8, wander: 1.1, idle: 0.7 },
      ai: { state: 'gather', thinkCooldown: 0, target: null, pulse: rnd(0, Math.PI * 2), talkCooldown: 0 },
    },
    {
      id: 'maru',
      name: '마루',
      color: '#60a5fa',
      x: 1560,
      y: 720,
      speed: 1.3,
      mood: 78,
      energy: 88,
      sociability: 0.55,
      roleBias: { gather: 0.9, fish: 1.6, social: 1.0, wander: 1.0, idle: 0.9 },
      ai: { state: 'fish', thinkCooldown: 0, target: null, pulse: rnd(0, Math.PI * 2), talkCooldown: 0 },
    },
  ];
}

function chooseBehavior(npc) {
  const p = timePhase();
  const waterDist = Math.abs(npc.x - ((WATER_BOX.x1 + WATER_BOX.x2) * TILE * 0.5));

  const utility = {
    idle: (100 - npc.energy) * 0.5 + (p === '밤' ? 12 : 0),
    wander: npc.mood * 0.2 + npc.roleBias.wander * 8,
    gather: npc.energy * 0.14 + npc.roleBias.gather * 13 + (state.objects.length > 120 ? 8 : 0),
    fish: npc.energy * 0.12 + npc.roleBias.fish * 15 + (waterDist < 320 ? 8 : 0),
    social: npc.mood * npc.sociability * 0.3 + npc.roleBias.social * 12,
  };

  const entries = Object.entries(utility).sort((a, b) => b[1] - a[1]);
  const winner = entries[0][0];
  npc.ai.state = winner;

  if (winner === 'wander' || winner === 'social') {
    npc.ai.target = randomLandPos();
  }

  if (winner === 'gather') {
    npc.ai.target = nearestObject(npc, (o) => o.kind !== 'shell') || randomLandPos();
  }

  if (winner === 'fish') {
    npc.ai.target = {
      x: rnd((WATER_BOX.x1 + 1) * TILE, (WATER_BOX.x2 - 1) * TILE),
      y: rnd((WATER_BOX.y1 + 1) * TILE, (WATER_BOX.y2 - 1) * TILE),
      edge: true,
    };
  }

  if (winner === 'idle') {
    npc.ai.target = { x: CAMP.x + rnd(20, CAMP.w - 20), y: CAMP.y + rnd(20, CAMP.h - 20) };
  }

  addFeed(`${npc.name} AI → ${AI_LABELS[winner]}`);
}

function nearestObject(actor, predicate) {
  let best = null;
  let d = Infinity;
  state.objects.forEach((o) => {
    if (!predicate(o)) return;
    const nd = dist(actor, o);
    if (nd < d) {
      d = nd;
      best = o;
    }
  });
  return best;
}

function moveAgent(npc, target, speedMul = 1) {
  if (!target) return;
  const dx = target.x - npc.x;
  const dy = target.y - npc.y;
  const len = Math.hypot(dx, dy);
  if (len < 2) return;

  const vx = (dx / len) * npc.speed * speedMul;
  const vy = (dy / len) * npc.speed * speedMul;
  const nx = clamp(npc.x + vx, 16, WORLD_W - 16);
  const ny = clamp(npc.y + vy, 16, WORLD_H - 16);

  if (isWalkable(nx, ny) || npc.ai.state === 'fish') {
    npc.x = nx;
    npc.y = ny;
  }
}

function npcGather(npc) {
  const target = npc.ai.target;
  if (!target || !('kind' in target)) {
    npc.ai.target = nearestObject(npc, (o) => o.kind !== 'shell') || randomLandPos();
    return;
  }

  moveAgent(npc, target, 1.08);
  if (dist(npc, target) < 20) {
    const m = itemMeta(target.kind);
    state.objects = state.objects.filter((o) => o !== target);
    npc.energy = clamp(npc.energy - 4, 0, 100);
    npc.mood = clamp(npc.mood + 2.5, 0, 100);
    addParticle(npc.x, npc.y - 12, `${npc.name} +${m.icon}`, 'rgba(254, 240, 138, ALPHA)');
    npc.ai.target = nearestObject(npc, (o) => o.kind !== 'shell');
    if (!npc.ai.target) npc.ai.target = randomLandPos();
  }
}

function npcFish(npc) {
  if (!npc.ai.target) {
    npc.ai.target = {
      x: rnd((WATER_BOX.x1 + 1) * TILE, (WATER_BOX.x2 - 1) * TILE),
      y: rnd((WATER_BOX.y1 + 1) * TILE, (WATER_BOX.y2 - 1) * TILE),
    };
  }
  moveAgent(npc, npc.ai.target, 0.95);

  if (dist(npc, npc.ai.target) < 34 && Math.random() < 0.008) {
    npc.energy = clamp(npc.energy - 2.4, 0, 100);
    npc.mood = clamp(npc.mood + 1.5, 0, 100);
    addParticle(npc.x, npc.y - 10, `${npc.name} 낚시 성공 🐟`, 'rgba(191, 219, 254, ALPHA)');
    npc.ai.target = {
      x: rnd((WATER_BOX.x1 + 1) * TILE, (WATER_BOX.x2 - 1) * TILE),
      y: rnd((WATER_BOX.y1 + 1) * TILE, (WATER_BOX.y2 - 1) * TILE),
    };
  }
}

function npcSocial(npc) {
  let closest = null;
  let cd = Infinity;
  state.npcs.forEach((other) => {
    if (other.id === npc.id) return;
    const d = dist(npc, other);
    if (d < cd) {
      cd = d;
      closest = other;
    }
  });

  if (!closest) {
    npc.ai.target = randomLandPos();
    moveAgent(npc, npc.ai.target);
    return;
  }

  moveAgent(npc, closest, 1.03);
  if (cd < 44 && npc.ai.talkCooldown <= 0) {
    npc.mood = clamp(npc.mood + 3.8, 0, 100);
    closest.mood = clamp(closest.mood + 3.8, 0, 100);
    npc.ai.talkCooldown = 160;
    addFeed(`${npc.name} ↔ ${closest.name}: 오늘 기분 좋다!`);
    addParticle(npc.x, npc.y - 16, '💬', 'rgba(255,255,255,ALPHA)');
  }
}

function npcWander(npc) {
  if (!npc.ai.target || dist(npc, npc.ai.target) < 24) {
    npc.ai.target = randomLandPos();
  }
  moveAgent(npc, npc.ai.target, 0.95);
  npc.energy = clamp(npc.energy - 0.012, 0, 100);
  npc.mood = clamp(npc.mood + 0.02, 0, 100);
}

function npcIdle(npc) {
  if (!npc.ai.target || dist(npc, npc.ai.target) < 18) {
    npc.ai.target = { x: CAMP.x + rnd(24, CAMP.w - 24), y: CAMP.y + rnd(24, CAMP.h - 24) };
  }
  moveAgent(npc, npc.ai.target, 0.55);
  npc.energy = clamp(npc.energy + 0.06, 0, 100);
  npc.mood = clamp(npc.mood + 0.01, 0, 100);
}

function updateNPCs() {
  state.npcs.forEach((npc) => {
    npc.ai.pulse += 0.08;
    npc.ai.thinkCooldown -= 1;
    npc.ai.talkCooldown -= 1;

    if (npc.ai.thinkCooldown <= 0) {
      chooseBehavior(npc);
      npc.ai.thinkCooldown = 250 + Math.floor(Math.random() * 140);
    }

    if (npc.ai.state === 'gather') npcGather(npc);
    if (npc.ai.state === 'fish') npcFish(npc);
    if (npc.ai.state === 'social') npcSocial(npc);
    if (npc.ai.state === 'wander') npcWander(npc);
    if (npc.ai.state === 'idle') npcIdle(npc);

    npc.energy = clamp(npc.energy + (npc.ai.state === 'idle' ? 0.03 : -0.007), 0, 100);
    if (npc.energy < 18 && npc.ai.state !== 'idle') {
      npc.ai.state = 'idle';
      npc.ai.target = { x: CAMP.x + rnd(24, CAMP.w - 24), y: CAMP.y + rnd(24, CAMP.h - 24) };
      npc.ai.thinkCooldown = 120;
      addFeed(`${npc.name} 에너지가 부족해서 휴식 중`);
    }
  });
}

function drawWorld() {
  const day = (Math.sin(state.worldTime * 0.0022) + 1) * 0.5;
  const rain = state.weather === 'rainy' ? 1 : 0;

  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, `rgb(${68 + day * 110}, ${118 + day * 82}, ${198 - day * 74})`);
  sky.addColorStop(1, `rgb(${76 + day * 42}, ${175 + day * 48}, ${122 + day * 44})`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const sx = Math.floor(state.camera.x / TILE);
  const sy = Math.floor(state.camera.y / TILE);
  const ex = sx + Math.ceil(canvas.width / TILE) + 2;
  const ey = sy + Math.ceil(canvas.height / TILE) + 2;

  for (let gy = sy; gy < ey; gy++) {
    for (let gx = sx; gx < ex; gx++) {
      if (gx < 0 || gy < 0 || gx >= MAP_W || gy >= MAP_H) continue;
      const biome = biomes[gy][gx];
      const x = gx * TILE - state.camera.x;
      const y = gy * TILE - state.camera.y;
      const tint = day * 26 - rain * 10;

      if (biome === 'water') ctx.fillStyle = `rgb(${65 + tint}, ${128 + tint}, ${198 + tint})`;
      else if (biome === 'meadow') ctx.fillStyle = `rgb(${109 + tint}, ${206 + tint}, ${122 + tint})`;
      else if (biome === 'grove') ctx.fillStyle = `rgb(${84 + tint}, ${160 + tint}, ${95 + tint})`;
      else ctx.fillStyle = `rgb(${96 + tint}, ${184 + tint}, ${107 + tint})`;
      ctx.fillRect(x, y, TILE + 1, TILE + 1);

      if (biome === 'water') {
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.arc(x + TILE * 0.5, y + TILE * 0.5, 12 + Math.sin(state.worldTime * 0.06 + gx) * 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  drawCamp();
}

function drawCamp() {
  const c = worldToScreen(CAMP.x, CAMP.y);
  ctx.fillStyle = '#7b3f12';
  ctx.fillRect(c.x + 18, c.y + 34, 130, 100);
  ctx.fillStyle = '#5d2d0d';
  ctx.beginPath();
  ctx.moveTo(c.x + 8, c.y + 36);
  ctx.lineTo(c.x + 84, c.y - 20);
  ctx.lineTo(c.x + 160, c.y + 36);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(c.x + 182, c.y + 112, 10 + Math.sin(state.worldTime * 0.1) * 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawResource(o) {
  const p = worldToScreen(o.x, o.y + Math.sin(state.worldTime * 0.05 + o.bob) * 2);
  if (p.x < -30 || p.y < -30 || p.x > canvas.width + 30 || p.y > canvas.height + 30) return;
  const meta = itemMeta(o.kind);

  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 8, 10, 4.5, 0, 0, Math.PI * 2);
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
    ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-9, 0);
    ctx.lineTo(-15, -5);
    ctx.lineTo(-15, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
}

function drawAgentBody(x, y, color, bob) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x, y + 16, 13, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.fillRect(x - 9, y - 6 + bob, 18, 23);
  ctx.fillStyle = '#ffedd5';
  ctx.beginPath();
  ctx.arc(x, y - 12 + bob, 8, 0, Math.PI * 2);
  ctx.fill();
}

function drawNPC(npc) {
  const p = worldToScreen(npc.x, npc.y);
  const bob = Math.sin(npc.ai.pulse) * 1.4;
  drawAgentBody(p.x, p.y, npc.color, bob);

  if (dist(state.player, npc) < 95) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(p.x - 44, p.y - 48, 88, 22);
    ctx.fillStyle = '#111827';
    ctx.font = '12px sans-serif';
    ctx.fillText(`E 대화 · ${AI_LABELS[npc.ai.state]}`, p.x - 38, p.y - 33);
  }
}

function drawPlayer() {
  const p = worldToScreen(state.player.x, state.player.y);
  state.player.anim += state.keys.size ? 0.24 : 0.08;
  const bob = Math.sin(state.player.anim) * 2;
  drawAgentBody(p.x, p.y, '#2563eb', bob);
}

function drawParticles() {
  state.particles = state.particles.filter((p) => p.life > 0);
  state.particles.forEach((p) => {
    p.life -= 1;
    p.y -= 0.35;
    const s = worldToScreen(p.x, p.y);
    const alpha = (p.life / 70).toFixed(2);
    ctx.fillStyle = p.color.replace('ALPHA', alpha);
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(p.text, s.x - 8, s.y);
  });
}

function drawWeather() {
  if (state.weather !== 'rainy') return;
  ctx.strokeStyle = 'rgba(191, 219, 254, 0.58)';
  for (let i = 0; i < 140; i++) {
    const x = (i * 93 + state.worldTime * 3) % (canvas.width + 40);
    const y = (i * 47 + state.worldTime * 5) % (canvas.height + 40);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 4, y + 10);
    ctx.stroke();
  }
}

function updateFish() {
  state.fish.forEach((f) => {
    f.x += f.speed * f.dir;
    if (f.x < (WATER_BOX.x1 + 1) * TILE || f.x > (WATER_BOX.x2 - 1) * TILE) f.dir *= -1;
  });
}

function collectNearby() {
  let gain = 0;
  state.objects = state.objects.filter((o) => {
    if (dist(state.player, o) < 21) {
      const m = itemMeta(o.kind);
      state.inventory[o.kind] += 1;
      state.xp += m.value;
      gain += m.value;
      addParticle(o.x, o.y, `+1 ${m.icon}`);
      return false;
    }
    return true;
  });

  if (gain > 0) setHint(`채집 성공! 경험치 +${gain}`);
  if (state.objects.length < 130) spawnWorldObjects();
}

function nearWater(actor) {
  return tileAt(actor.x + 28, actor.y) === 'water' || tileAt(actor.x - 28, actor.y) === 'water';
}

function fishAction() {
  if (!nearWater(state.player)) {
    setHint('호수 가장자리에서 스페이스로 낚시할 수 있어요.');
    return;
  }

  if (Math.random() > 0.42) {
    state.inventory.fish += 1;
    const bonus = Math.floor(rnd(10, 20));
    state.xp += bonus;
    addParticle(state.player.x, state.player.y - 10, '+1 🐟', 'rgba(191, 219, 254, ALPHA)');
    setHint(`낚시 성공! 경험치 +${bonus}`);
  } else {
    state.player.energy = clamp(state.player.energy - 3, 0, 100);
    setHint('물고기가 도망갔어요. 다시 시도해보세요.');
  }
}

function inCamp(actor = state.player) {
  return actor.x > CAMP.x && actor.x < CAMP.x + CAMP.w && actor.y > CAMP.y && actor.y < CAMP.y + CAMP.h;
}

function rest() {
  if (!inCamp()) {
    setHint('캠프 근처에서만 휴식할 수 있어요.');
    return;
  }
  state.player.energy = 100;
  state.player.mood = clamp(state.player.mood + 15, 0, 100);
  state.worldTime += 480;
  setHint('푹 쉬었습니다. 마음이 한결 가벼워졌어요.');
}

function interact() {
  const nearest = state.npcs
    .map((n) => ({ n, d: dist(state.player, n) }))
    .sort((a, b) => a.d - b.d)[0];

  if (nearest && nearest.d < 90) {
    const npc = nearest.n;
    npc.mood = clamp(npc.mood + 6, 0, 100);
    state.player.mood = clamp(state.player.mood + 4, 0, 100);

    if (!state.quest.complete) {
      const needs = state.quest.needs;
      const done = Object.entries(needs).every(([k, v]) => state.inventory[k] >= v);
      if (done) {
        Object.entries(needs).forEach(([k, v]) => { state.inventory[k] -= v; });
        state.quest.complete = true;
        state.coins += state.quest.reward;
        state.xp += 100;
        setHint(`${npc.name}: 와! 완벽해! 잔치 준비 완료! 코인 +${state.quest.reward}`);
      } else {
        setHint(`${npc.name}: 재료를 조금만 더 부탁해!`);
      }
    } else {
      const tip = 8 + Math.floor(npc.mood / 18);
      state.coins += tip;
      setHint(`${npc.name}: 오늘도 반가워 😊 용돈 +${tip} 코인`);
    }

    addFeed(`${npc.name}와 대화했습니다. (기분 ${Math.floor(npc.mood)})`);
    return;
  }

  if (inCamp()) {
    state.player.energy = clamp(state.player.energy + 12, 0, 100);
    state.player.mood = clamp(state.player.mood + 8, 0, 100);
    setHint('캠프 정리를 하며 휴식을 취했습니다.');
  }
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

  const nx = clamp(p.x + dx, 16, WORLD_W - 16);
  const ny = clamp(p.y + dy, 16, WORLD_H - 16);
  if (isWalkable(nx, ny)) {
    p.x = nx;
    p.y = ny;
  }

  const moving = dx !== 0 || dy !== 0;
  if (moving) {
    p.energy = clamp(p.energy - (running ? 0.08 : 0.045), 0, 100);
    p.mood = clamp(p.mood + 0.013, 0, 100);
  } else {
    p.energy = clamp(p.energy + 0.036, 0, 100);
    p.mood = clamp(p.mood - 0.005, 0, 100);
  }
}

function updateCamera() {
  state.camera.x = clamp(state.player.x - canvas.width / 2, 0, WORLD_W - canvas.width);
  state.camera.y = clamp(state.player.y - canvas.height / 2, 0, WORLD_H - canvas.height);
}

function updateSystems() {
  state.worldTime += 1;
  state.dayTick += 1;

  if (state.dayTick % 2900 === 0) {
    state.weather = Math.random() > 0.68 ? 'rainy' : 'sunny';
    setHint(state.weather === 'rainy' ? '구름이 몰려오며 비가 시작됐어요 ☔' : '하늘이 맑게 개었어요 ☀️');
  }

  const goal = state.level * 140;
  if (state.xp >= goal) {
    state.level += 1;
    state.player.speed += 0.08;
    state.player.mood = clamp(state.player.mood + 8, 0, 100);
    setHint(`레벨 업! Lv.${state.level} · 이동 속도 증가`, 220);
  }

  if (state.hintTimer > 0) state.hintTimer -= 1;
}

function render() {
  drawWorld();
  state.objects.forEach(drawResource);
  drawFish();
  state.npcs.forEach(drawNPC);
  drawPlayer();
  drawParticles();
  drawWeather();
}

function updateUI() {
  ui.time.textContent = `🕒 ${timePhase()}`;
  ui.weather.textContent = state.weather === 'sunny' ? '☀️ 맑음' : '🌧️ 비';
  ui.energy.textContent = `⚡ ${Math.floor(state.player.energy)}`;
  ui.mood.textContent = `💖 ${Math.floor(state.player.mood)}`;
  ui.coins.textContent = `🪙 ${state.coins}`;
  ui.level.textContent = `⭐ ${state.level}`;
  ui.hint.textContent = state.hintTimer > 0 ? state.hint : '';

  ui.inventory.innerHTML = ITEMS.map((i) => `<div>${i.icon} ${i.label}: <b>${state.inventory[i.key]}</b></div>`).join('');

  const q = state.quest;
  ui.quest.innerHTML = q.complete
    ? `✅ <b>${q.title}</b><br>잔치 준비 완료! NPC와 대화해 소소한 보상을 받으세요.`
    : `📌 <b>${q.title}</b><br>꽃 ${state.inventory.flower}/${q.needs.flower}, 물고기 ${state.inventory.fish}/${q.needs.fish}, 목재 ${state.inventory.wood}/${q.needs.wood}<br>보상: 🪙 ${q.reward}`;

  ui.npcFeed.innerHTML = state.npcs
    .map((n) => `• <b>${n.name}</b> : ${AI_LABELS[n.ai.state]} (기분 ${Math.floor(n.mood)} / 에너지 ${Math.floor(n.energy)})`)
    .join('<br>') + '<hr style="border:none;border-top:1px solid #dbeafe;margin:8px 0">' + state.aiFeed.join('<br>');
}

function loop() {
  playerMove();
  updateFish();
  collectNearby();
  updateNPCs();
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
createNPCs();
state.npcs.forEach((npc) => chooseBehavior(npc));
updateCamera();
updateUI();
loop();
