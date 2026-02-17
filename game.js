const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const ui = {
  stats: document.getElementById('statsBar'),
  inventory: document.getElementById('inventory'),
  quest: document.getElementById('quest'),
  message: document.getElementById('message'),
  fishingUi: document.getElementById('fishingUi'),
  modal: document.getElementById('modal'),
  modalTitle: document.getElementById('modalTitle'),
  modalBody: document.getElementById('modalBody'),
  modalClose: document.getElementById('modalClose'),
  btnCraft: document.getElementById('btnCraft'),
  btnShop: document.getElementById('btnShop'),
  btnBuild: document.getElementById('btnBuild'),
};

const TILE = 48;
const MAP_W = 54;
const MAP_H = 32;
const WORLD_W = MAP_W * TILE;
const WORLD_H = MAP_H * TILE;

const ITEMS = [
  ['wood', '🪵'], ['flower', '🌸'], ['berry', '🫐'], ['shell', '🐚'], ['fish', '🐟'], ['furniture', '🪑']
];

const state = {
  keys: new Set(),
  camera: { x: 0, y: 0 },
  time: 0,
  weather: 'sunny',
  msg: '연못에 다리를 건설해서 그 위에서 낚시해보세요.',
  msgTimer: 300,
  coins: 90,
  level: 1,
  xp: 0,
  player: { x: 420, y: 420, speed: 2.4, energy: 100, mood: 100, facing: 'down', pause: false },
  inv: { wood: 0, flower: 0, berry: 0, shell: 0, fish: 0, furniture: 0 },
  objects: [],
  fishes: [],
  npcs: [],
  dialogue: null,
  bridgeBuilt: false,
  house: { tier: 0, inside: false, furniture: [], doorX: 520, doorY: 560 },
  fishing: { active: false, phase: 'idle', timer: 0, biteWindow: 0, cursor: 0.1, dir: 1, zoneStart: 0.45, zoneWidth: 0.2, progress: 0, actor: null },
  quest: { title: '마을 낚시대회 준비', needs: { fish: 5, wood: 8 }, reward: 220, done: false },
};

const WATER = { x1: 31, x2: 46, y1: 8, y2: 23 };
const BRIDGE = { x1: 36, x2: 40, y: 15 };
const HOUSE_PLOT = { x: 470, y: 520, w: 180, h: 140 };

const biomes = Array.from({ length: MAP_H }, (_, gy) =>
  Array.from({ length: MAP_W }, (_, gx) => {
    if (gx > WATER.x1 && gx < WATER.x2 && gy > WATER.y1 && gy < WATER.y2) return 'water';
    const v = Math.sin(gx * 0.3) + Math.cos(gy * 0.27) + Math.random() * 0.6;
    if (v > 1.2) return 'meadow';
    if (v > 0.4) return 'grass';
    return 'grove';
  })
);

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function rnd(min, max) { return Math.random() * (max - min) + min; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function worldToScreen(x, y) { return { x: x - state.camera.x, y: y - state.camera.y }; }

function setMsg(text, t = 170) {
  state.msg = text;
  state.msgTimer = t;
}

function tileAt(x, y) {
  const gx = Math.floor(clamp(x, 0, WORLD_W - 1) / TILE);
  const gy = Math.floor(clamp(y, 0, WORLD_H - 1) / TILE);
  return { gx, gy, b: biomes[gy]?.[gx] || 'grass' };
}

function onBridge(x, y) {
  const t = tileAt(x, y);
  return state.bridgeBuilt && t.gy === BRIDGE.y && t.gx >= BRIDGE.x1 && t.gx <= BRIDGE.x2;
}

function isWalkable(x, y) {
  const t = tileAt(x, y);
  if (t.b !== 'water') return true;
  return onBridge(x, y);
}

function spawnResources() {
  const list = [];
  for (let y = 1; y < MAP_H - 1; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      const b = biomes[y][x];
      if (b === 'water') {
        if (Math.random() < 0.03) list.push({ type: 'shell', x: x * TILE + rnd(8, TILE - 8), y: y * TILE + rnd(8, TILE - 8), bob: rnd(0, 6.28) });
        continue;
      }
      const c = b === 'grove' ? 0.12 : 0.1;
      if (Math.random() < c) {
        const type = b === 'grove' ? (Math.random() > 0.5 ? 'wood' : 'berry') : (Math.random() > 0.5 ? 'flower' : 'berry');
        list.push({ type, x: x * TILE + rnd(8, TILE - 8), y: y * TILE + rnd(8, TILE - 8), bob: rnd(0, 6.28) });
      }
    }
  }
  state.objects = list;
}

function spawnFish() {
  state.fishes = Array.from({ length: 20 }, () => ({
    x: rnd((WATER.x1 + 1) * TILE, (WATER.x2 - 1) * TILE),
    y: rnd((WATER.y1 + 1) * TILE, (WATER.y2 - 1) * TILE),
    dir: Math.random() > 0.5 ? 1 : -1,
    spd: rnd(0.5, 1.1),
  }));
}

function initNPCs() {
  state.npcs = [
    { id: 'luna', name: '루나', x: 820, y: 690, color: '#f59e0b', mood: 84, state: 'wander', target: null, pause: false, talk: '' },
    { id: 'bomi', name: '보미', x: 1020, y: 620, color: '#22c55e', mood: 80, state: 'wander', target: null, pause: false, talk: '' },
    { id: 'maru', name: '마루', x: 1430, y: 760, color: '#60a5fa', mood: 82, state: 'fish', target: null, pause: false, talk: '' },
  ];
}

function drawWorld() {
  const day = (Math.sin(state.time * 0.0023) + 1) / 2;
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, `rgb(${70 + day * 100},${120 + day * 80},${185 - day * 70})`);
  sky.addColorStop(1, `rgb(${75 + day * 45},${170 + day * 40},${116 + day * 40})`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const sx = Math.floor(state.camera.x / TILE);
  const sy = Math.floor(state.camera.y / TILE);
  const ex = sx + Math.ceil(canvas.width / TILE) + 2;
  const ey = sy + Math.ceil(canvas.height / TILE) + 2;

  for (let gy = sy; gy < ey; gy++) {
    for (let gx = sx; gx < ex; gx++) {
      if (gx < 0 || gy < 0 || gx >= MAP_W || gy >= MAP_H) continue;
      const b = biomes[gy][gx];
      const p = worldToScreen(gx * TILE, gy * TILE);
      if (b === 'water') ctx.fillStyle = '#5fa6f4';
      else if (b === 'grove') ctx.fillStyle = '#5ca663';
      else if (b === 'meadow') ctx.fillStyle = '#7fd26f';
      else ctx.fillStyle = '#70be67';
      ctx.fillRect(p.x, p.y, TILE + 1, TILE + 1);
    }
  }

  if (state.bridgeBuilt) drawBridge();
  drawHouseExterior();
}

function drawBridge() {
  const x = BRIDGE.x1 * TILE;
  const y = BRIDGE.y * TILE;
  const p = worldToScreen(x, y);
  const w = (BRIDGE.x2 - BRIDGE.x1 + 1) * TILE;
  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(p.x, p.y + 8, w, TILE - 16);
  ctx.strokeStyle = '#5b3719';
  for (let i = 0; i <= w; i += 24) {
    ctx.beginPath();
    ctx.moveTo(p.x + i, p.y + 8);
    ctx.lineTo(p.x + i, p.y + TILE - 8);
    ctx.stroke();
  }
}

function drawHouseExterior() {
  const p = worldToScreen(HOUSE_PLOT.x, HOUSE_PLOT.y);
  if (state.house.tier === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(p.x, p.y, HOUSE_PLOT.w, HOUSE_PLOT.h);
    ctx.strokeStyle = '#64748b';
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(p.x, p.y, HOUSE_PLOT.w, HOUSE_PLOT.h);
    ctx.setLineDash([]);
    ctx.fillStyle = '#1f2937';
    ctx.fillText('집 부지 (건설 가능)', p.x + 24, p.y + 74);
    return;
  }

  const bodyColor = state.house.tier === 1 ? '#b45309' : '#7c3f11';
  const roofColor = state.house.tier === 1 ? '#92400e' : '#5b2d0d';
  ctx.fillStyle = bodyColor;
  ctx.fillRect(p.x + 20, p.y + 36, 140, 95);
  ctx.fillStyle = roofColor;
  ctx.beginPath();
  ctx.moveTo(p.x + 8, p.y + 38);
  ctx.lineTo(p.x + 90, p.y - 20);
  ctx.lineTo(p.x + 172, p.y + 38);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#fde68a';
  ctx.fillRect(p.x + 79, p.y + 86, 22, 45);
  state.house.doorX = HOUSE_PLOT.x + 90;
  state.house.doorY = HOUSE_PLOT.y + 120;
}

function drawHouseInterior() {
  ctx.fillStyle = '#eadfc7';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#d4c2a3';
  for (let y = 0; y < canvas.height; y += 40) ctx.fillRect(0, y, canvas.width, 2);

  ctx.fillStyle = '#7c3f11';
  ctx.fillRect(canvas.width / 2 - 40, canvas.height - 30, 80, 20);
  ctx.fillStyle = '#1f2937';
  ctx.fillText('E : 집 나가기', canvas.width / 2 - 45, canvas.height - 40);

  state.house.furniture.forEach((f) => {
    const x = 240 + f.gx * 120;
    const y = 140 + f.gy * 110;
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(x, y, 70, 42);
    ctx.fillStyle = '#fff';
    ctx.fillText('🪑', x + 20, y + 28);
  });
}

function drawResource(o) {
  const p = worldToScreen(o.x, o.y + Math.sin(state.time * 0.05 + o.bob) * 2);
  if (p.x < -20 || p.y < -20 || p.x > canvas.width + 20 || p.y > canvas.height + 20) return;
  const emoji = ITEMS.find(([k]) => k === o.type)?.[1] || '•';
  ctx.fillText(emoji, p.x - 8, p.y + 6);
}

function drawFish() {
  state.fishes.forEach((f) => {
    const p = worldToScreen(f.x, f.y);
    if (p.x < -20 || p.y < -20 || p.x > canvas.width + 20 || p.y > canvas.height + 20) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(f.dir, 1);
    ctx.fillStyle = '#fef3c7';
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-9, 0); ctx.lineTo(-15, -5); ctx.lineTo(-15, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  });
}

function drawCharacter(x, y, color, facing = 'down') {
  const p = worldToScreen(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 16, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.fillRect(p.x - 9, p.y - 6, 18, 23);
  ctx.fillStyle = '#ffedd5';
  ctx.beginPath();
  ctx.arc(p.x, p.y - 12, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#111827';
  if (facing === 'left') ctx.fillRect(p.x - 8, p.y - 13, 2, 2);
  if (facing === 'right') ctx.fillRect(p.x + 6, p.y - 13, 2, 2);
  if (facing === 'down') { ctx.fillRect(p.x - 5, p.y - 13, 2, 2); ctx.fillRect(p.x + 3, p.y - 13, 2, 2); }
}

function drawSpeechBubble(actor, text) {
  if (!text) return;
  const p = worldToScreen(actor.x, actor.y);
  const w = Math.max(120, Math.min(240, text.length * 10));
  const x = p.x - w / 2;
  const y = p.y - 62;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(x, y, w, 28);
  ctx.beginPath();
  ctx.moveTo(p.x - 6, y + 28); ctx.lineTo(p.x + 6, y + 28); ctx.lineTo(p.x, y + 36); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#111827';
  ctx.font = '12px sans-serif';
  ctx.fillText(text.slice(0, 24), x + 8, y + 18);
}

function drawDialogueChoices() {
  if (!state.dialogue) return;
  const p = worldToScreen(state.player.x, state.player.y);
  ctx.fillStyle = 'rgba(15,23,42,0.84)';
  ctx.fillRect(p.x - 180, p.y + 40, 360, 74);
  ctx.fillStyle = '#fff';
  ctx.fillText(`1) ${state.dialogue.a}`, p.x - 166, p.y + 62);
  ctx.fillText(`2) ${state.dialogue.b}`, p.x - 166, p.y + 88);
}

function facingTo(a, b) {
  if (Math.abs(a.x - b.x) > Math.abs(a.y - b.y)) return a.x < b.x ? 'right' : 'left';
  return a.y < b.y ? 'down' : 'up';
}

function drawAllCharacters() {
  state.npcs.forEach((n) => {
    drawCharacter(n.x, n.y, n.color, n.facing || 'down');
    drawSpeechBubble(n, n.talk);
  });
  drawCharacter(state.player.x, state.player.y, '#2563eb', state.player.facing);
  if (state.dialogue) drawDialogueChoices();
}

function updateCamera() {
  state.camera.x = clamp(state.player.x - canvas.width / 2, 0, WORLD_W - canvas.width);
  state.camera.y = clamp(state.player.y - canvas.height / 2, 0, WORLD_H - canvas.height);
}

function updateFish() {
  state.fishes.forEach((f) => {
    f.x += f.spd * f.dir;
    if (f.x < (WATER.x1 + 1) * TILE || f.x > (WATER.x2 - 1) * TILE) f.dir *= -1;
  });
}

function updateNPCs() {
  state.npcs.forEach((n) => {
    if (n.pause) return;
    if (!n.target || dist(n, n.target) < 20) {
      if (n.state === 'fish') n.target = { x: rnd((WATER.x1 + 1) * TILE, (WATER.x2 - 1) * TILE), y: rnd((WATER.y1 + 1) * TILE, (WATER.y2 - 1) * TILE) };
      else n.target = { x: rnd(80, WORLD_W - 80), y: rnd(80, WORLD_H - 80) };
    }
    const dx = n.target.x - n.x, dy = n.target.y - n.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      const nx = n.x + (dx / d) * 1.15;
      const ny = n.y + (dy / d) * 1.15;
      if (isWalkable(nx, ny) || n.state === 'fish') { n.x = nx; n.y = ny; }
      n.facing = facingTo(n, n.target);
    }
    if (Math.random() < 0.002) n.state = n.state === 'fish' ? 'wander' : 'fish';

    n.talk = dist(state.player, n) < 100 ? 'E로 대화!' : '';
  });
}

function collectResources() {
  state.objects = state.objects.filter((o) => {
    if (dist(state.player, o) < 22) {
      state.inv[o.type] += 1;
      state.xp += 3;
      setMsg(`${o.type} 획득!`);
      return false;
    }
    return true;
  });
  if (state.objects.length < 130) spawnResources();
}

function nearFishingSpot() {
  const p = state.player;
  const nearWater = tileAt(p.x + 28, p.y).b === 'water' || tileAt(p.x - 28, p.y).b === 'water' || tileAt(p.x, p.y + 28).b === 'water';
  return nearWater || onBridge(p.x, p.y);
}

function startFishing() {
  if (!nearFishingSpot()) {
    setMsg('연못 가장자리 또는 다리 위에서 낚시할 수 있어요.');
    return;
  }
  if (state.fishing.active) return;

  state.fishing.active = true;
  state.fishing.phase = 'cast';
  state.fishing.timer = 60 + Math.floor(Math.random() * 60);
  state.fishing.biteWindow = 0;
  state.fishing.cursor = 0.1;
  state.fishing.dir = 1;
  state.fishing.zoneStart = rnd(0.2, 0.65);
  state.fishing.zoneWidth = rnd(0.14, 0.22);
  state.fishing.progress = 0;
  ui.fishingUi.classList.remove('hidden');
}

function fishingInput() {
  if (!state.fishing.active) {
    startFishing();
    return;
  }

  if (state.fishing.phase === 'bite') {
    state.fishing.phase = 'reel';
    setMsg('훅! 타이밍 바를 맞춰 게이지를 채우세요!');
    return;
  }

  if (state.fishing.phase === 'reel') {
    const c = state.fishing.cursor;
    const z1 = state.fishing.zoneStart;
    const z2 = z1 + state.fishing.zoneWidth;
    if (c >= z1 && c <= z2) state.fishing.progress += 18;
    else state.fishing.progress -= 12;
  }
}

function updateFishing() {
  const f = state.fishing;
  if (!f.active) return;

  if (f.phase === 'cast') {
    f.timer -= 1;
    if (f.timer <= 0) {
      f.phase = 'bite';
      f.biteWindow = 45;
      setMsg('입질! 지금 스페이스를 눌러 훅!');
    }
  } else if (f.phase === 'bite') {
    f.biteWindow -= 1;
    if (f.biteWindow <= 0) {
      setMsg('타이밍을 놓쳤어요...');
      f.active = false;
      ui.fishingUi.classList.add('hidden');
    }
  } else if (f.phase === 'reel') {
    f.cursor += 0.02 * f.dir;
    if (f.cursor >= 1 || f.cursor <= 0) f.dir *= -1;
    f.progress -= 0.28;
    f.progress = clamp(f.progress, 0, 100);

    if (f.progress >= 100) {
      state.inv.fish += 1;
      state.xp += 16;
      setMsg('낚시 성공! 물고기 +1');
      f.active = false;
      ui.fishingUi.classList.add('hidden');
    }
    if (f.progress <= 0) {
      setMsg('물고기가 도망쳤어요!');
      f.active = false;
      ui.fishingUi.classList.add('hidden');
    }
  }

  let html = '';
  if (f.phase === 'cast') html = '찌를 드리웠습니다... 입질을 기다리는 중';
  if (f.phase === 'bite') html = '<span style="color:#fde047">!! 입질 !! 스페이스로 훅</span>';
  if (f.phase === 'reel') {
    const zL = Math.round(f.zoneStart * 100);
    const zW = Math.round(f.zoneWidth * 100);
    const c = Math.round(f.cursor * 100);
    html = `타이밍 바: [안전구간 ${zL}~${zL + zW}] 커서 ${c}%<br>진행도 ${Math.round(f.progress)}% (구간 안에서 Space)`;
  }
  ui.fishingUi.innerHTML = html;
}

function handleDialogueChoice(idx) {
  if (!state.dialogue) return;
  const n = state.dialogue.npc;
  if (idx === 1) {
    if (!state.quest.done && state.inv.fish >= state.quest.needs.fish && state.inv.wood >= state.quest.needs.wood) {
      state.inv.fish -= state.quest.needs.fish;
      state.inv.wood -= state.quest.needs.wood;
      state.quest.done = true;
      state.coins += state.quest.reward;
      n.talk = '대박! 고마워!';
      setMsg(`퀘스트 완료! 코인 +${state.quest.reward}`);
    } else {
      n.mood = clamp(n.mood + 4, 0, 100);
      n.talk = '오늘도 평화롭다 😊';
      state.coins += 5;
      setMsg(`${n.name}와 담소. 코인 +5`);
    }
  }
  if (idx === 2) {
    if (state.inv.berry > 0) {
      state.inv.berry -= 1;
      n.mood = clamp(n.mood + 10, 0, 100);
      n.talk = '열매 선물 고마워!';
      setMsg('선물 성공! 호감도 상승');
    } else {
      setMsg('열매가 없어요.');
    }
  }
  closeDialogue();
}

function closeDialogue() {
  if (!state.dialogue) return;
  state.player.pause = false;
  state.dialogue.npc.pause = false;
  state.dialogue = null;
}

function interact() {
  if (state.house.inside) {
    state.house.inside = false;
    setMsg('집 밖으로 나왔습니다.');
    return;
  }

  if (state.house.tier > 0 && dist(state.player, { x: state.house.doorX, y: state.house.doorY }) < 42) {
    state.house.inside = true;
    setMsg('집 안으로 들어왔습니다. F로 가구 배치');
    return;
  }

  const nearest = state.npcs.map((n) => ({ n, d: dist(state.player, n) })).sort((a, b) => a.d - b.d)[0];
  if (nearest && nearest.d < 80) {
    const n = nearest.n;
    state.player.pause = true;
    n.pause = true;
    state.player.facing = facingTo(state.player, n);
    n.facing = facingTo(n, state.player);
    n.talk = `${n.name}: 무슨 이야기 할까?`;
    state.dialogue = { npc: n, a: '잡담/퀘스트 전달', b: '열매 선물하기' };
    return;
  }

  if (state.house.tier === 0 && dist(state.player, { x: HOUSE_PLOT.x + 90, y: HOUSE_PLOT.y + 70 }) < 80) {
    setMsg('건축 메뉴에서 집을 지을 수 있어요.');
  }
}

function placeFurniture() {
  if (!state.house.inside) return;
  if (state.inv.furniture <= 0) {
    setMsg('배치할 가구가 없어요. 제작에서 가구를 만드세요.');
    return;
  }
  const gx = Math.floor(rnd(0, 4));
  const gy = Math.floor(rnd(0, 3));
  state.house.furniture.push({ gx, gy });
  state.inv.furniture -= 1;
  setMsg('가구를 배치했습니다!');
}

function openModal(title, html) {
  ui.modalTitle.textContent = title;
  ui.modalBody.innerHTML = html;
  ui.modal.classList.remove('hidden');
}

function closeModal() { ui.modal.classList.add('hidden'); }

function openCraft() {
  const html = `
  <div class="recipe"><span>🪑 기본 의자 (wood 4, flower 2)</span><button data-craft="chair">제작</button></div>
  <div class="recipe"><span>🌉 다리 키트 (wood 12, coins 80)</span><button data-craft="bridge">제작/설치</button></div>
  <div class="recipe"><span>🎣 고급 미끼 (berry 2, shell 1) - 낚시 성공보너스</span><button data-craft="bait">제작</button></div>`;
  openModal('제작', html);
  bindModalActions();
}

function openShop() {
  const html = `
  <div class="shop-item"><span>집 건축권 (150 코인)</span><button data-shop="house">구매</button></div>
  <div class="shop-item"><span>집 업그레이드 (250 코인)</span><button data-shop="upgrade">업그레이드</button></div>
  <div class="shop-item"><span>꽃씨 패키지 (20 코인)</span><button data-shop="seed">구매</button></div>`;
  openModal('상점', html);
  bindModalActions();
}

function openBuild() {
  const html = `
  <div class="shop-item"><span>현재 집 단계: ${state.house.tier}</span><span>${state.house.tier === 0 ? '없음' : state.house.tier === 1 ? '오두막' : '코지하우스'}</span></div>
  <div class="shop-item"><span>${state.bridgeBuilt ? '다리 설치 완료' : '다리 미설치'}</span><span>${state.bridgeBuilt ? '연못 가로지르기 가능' : '다리 키트 필요'}</span></div>`;
  openModal('건축 현황', html);
}

function bindModalActions() {
  ui.modalBody.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const c = btn.dataset.craft;
      const s = btn.dataset.shop;
      if (c === 'chair') {
        if (state.inv.wood >= 4 && state.inv.flower >= 2) {
          state.inv.wood -= 4; state.inv.flower -= 2; state.inv.furniture += 1;
          setMsg('가구 제작 완료! 집 안에서 F로 배치하세요.');
        } else setMsg('재료가 부족합니다.');
      }
      if (c === 'bridge') {
        if (state.bridgeBuilt) { setMsg('이미 다리가 있습니다.'); return; }
        if (state.inv.wood >= 12 && state.coins >= 80) {
          state.inv.wood -= 12; state.coins -= 80; state.bridgeBuilt = true;
          setMsg('연못 다리 완성! 이제 다리 위에서 낚시할 수 있어요.');
        } else setMsg('목재 또는 코인이 부족합니다.');
      }
      if (c === 'bait') {
        if (state.inv.berry >= 2 && state.inv.shell >= 1) {
          state.inv.berry -= 2; state.inv.shell -= 1;
          state.fishing.zoneWidth = clamp(state.fishing.zoneWidth + 0.04, 0.14, 0.35);
          setMsg('미끼 제작! 이번 낚시 타이밍 구간이 넓어집니다.');
        } else setMsg('재료가 부족합니다.');
      }

      if (s === 'house') {
        if (state.house.tier > 0) return setMsg('이미 집을 보유 중입니다.');
        if (state.coins >= 150) { state.coins -= 150; state.house.tier = 1; setMsg('오두막 건축 완료! 문 앞에서 E로 입장.'); }
        else setMsg('코인이 부족합니다.');
      }
      if (s === 'upgrade') {
        if (state.house.tier === 0) return setMsg('먼저 집을 구매하세요.');
        if (state.house.tier >= 2) return setMsg('최대 업그레이드입니다.');
        if (state.coins >= 250) { state.coins -= 250; state.house.tier = 2; setMsg('집 업그레이드 완료! 내부가 더 아늑해졌어요.'); }
        else setMsg('코인이 부족합니다.');
      }
      if (s === 'seed') {
        if (state.coins >= 20) { state.coins -= 20; state.inv.flower += 2; setMsg('꽃씨 구매 완료 (꽃 +2).'); }
        else setMsg('코인이 부족합니다.');
      }

      updateUI();
    });
  });
}

function playerMove() {
  if (state.player.pause || state.house.inside) return;
  let dx = 0, dy = 0;
  const run = state.keys.has('Shift');
  const spd = (run ? 1.45 : 1) * (state.player.energy > 0 ? state.player.speed : 1.2);

  if (state.keys.has('ArrowUp') || state.keys.has('w')) { dy -= spd; state.player.facing = 'up'; }
  if (state.keys.has('ArrowDown') || state.keys.has('s')) { dy += spd; state.player.facing = 'down'; }
  if (state.keys.has('ArrowLeft') || state.keys.has('a')) { dx -= spd; state.player.facing = 'left'; }
  if (state.keys.has('ArrowRight') || state.keys.has('d')) { dx += spd; state.player.facing = 'right'; }

  const nx = clamp(state.player.x + dx, 16, WORLD_W - 16);
  const ny = clamp(state.player.y + dy, 16, WORLD_H - 16);
  if (isWalkable(nx, ny)) { state.player.x = nx; state.player.y = ny; }

  const moving = dx || dy;
  if (moving) {
    state.player.energy = clamp(state.player.energy - (run ? 0.08 : 0.04), 0, 100);
    state.player.mood = clamp(state.player.mood + 0.01, 0, 100);
  } else {
    state.player.energy = clamp(state.player.energy + 0.03, 0, 100);
    state.player.mood = clamp(state.player.mood - 0.003, 0, 100);
  }
}

function updateUI() {
  const t = (Math.sin(state.time * 0.0023) + 1) / 2;
  const phase = t > 0.66 ? '아침' : t > 0.33 ? '노을' : '밤';
  ui.stats.innerHTML = `🕒 ${phase} · ⚡ ${Math.floor(state.player.energy)} · 💖 ${Math.floor(state.player.mood)} · 🪙 ${state.coins} · ⭐ ${state.level}`;
  ui.inventory.innerHTML = ITEMS.map(([k, e]) => `<div>${e} ${k}: <b>${state.inv[k]}</b></div>`).join('');
  ui.quest.innerHTML = state.quest.done
    ? `✅ ${state.quest.title}<br>완료! 이제 집과 인테리어를 꾸며보세요.`
    : `물고기 ${state.inv.fish}/${state.quest.needs.fish}, 목재 ${state.inv.wood}/${state.quest.needs.wood}<br>보상: ${state.quest.reward} 코인`;

  ui.message.textContent = state.msgTimer > 0 ? state.msg : '';
}

function tick() {
  state.time += 1;
  if (state.msgTimer > 0) state.msgTimer -= 1;

  if (!state.house.inside) {
    playerMove();
    updateFish();
    updateNPCs();
    collectResources();
    updateCamera();

    drawWorld();
    state.objects.forEach(drawResource);
    drawFish();
    drawAllCharacters();
  } else {
    drawHouseInterior();
  }

  updateFishing();

  if (state.time % 3000 === 0) {
    state.weather = Math.random() > 0.7 ? 'rainy' : 'sunny';
    setMsg(state.weather === 'rainy' ? '비가 내리기 시작했어요.' : '하늘이 맑게 갰어요.');
  }

  updateUI();
  requestAnimationFrame(tick);
}

window.addEventListener('keydown', (e) => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (state.dialogue) {
    if (key === '1') return handleDialogueChoice(1);
    if (key === '2') return handleDialogueChoice(2);
    if (key === 'escape') return closeDialogue();
  }

  if (key === ' ') {
    e.preventDefault();
    fishingInput();
    return;
  }
  if (key === 'e') { interact(); return; }
  if (key === 'f') { placeFurniture(); return; }
  state.keys.add(key);
});
window.addEventListener('keyup', (e) => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  state.keys.delete(key);
});

ui.btnCraft.addEventListener('click', openCraft);
ui.btnShop.addEventListener('click', openShop);
ui.btnBuild.addEventListener('click', openBuild);
ui.modalClose.addEventListener('click', closeModal);
ui.modal.addEventListener('click', (e) => { if (e.target === ui.modal) closeModal(); });

spawnResources();
spawnFish();
initNPCs();
updateUI();
tick();
