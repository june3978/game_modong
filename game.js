const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const ui = {
  stats: document.getElementById('statsBar'),
  inventory: document.getElementById('inventory'),
  quest: document.getElementById('quest'),
  relations: document.getElementById('relations'),
  achievements: document.getElementById('achievements'),
  log: document.getElementById('log'),
  message: document.getElementById('message'),
  fishingUi: document.getElementById('fishingUi'),
  modal: document.getElementById('modal'),
  modalTitle: document.getElementById('modalTitle'),
  modalBody: document.getElementById('modalBody'),
  modalClose: document.getElementById('modalClose'),
  btnCraft: document.getElementById('btnCraft'),
  btnShop: document.getElementById('btnShop'),
  btnBuild: document.getElementById('btnBuild'),
  btnTown: document.getElementById('btnTown'),
  btnMuseum: document.getElementById('btnMuseum'),
};

const TILE = 48;
const MAP_W = 54;
const MAP_H = 32;
const WORLD_W = MAP_W * TILE;
const WORLD_H = MAP_H * TILE;

const ITEMS = [['wood', '🪵'], ['flower', '🌸'], ['berry', '🫐'], ['shell', '🐚'], ['fish', '🐟'], ['bug', '🦋'], ['seed', '🌱'], ['furniture', '🪑']];
const SEASONS = ['봄', '여름', '가을', '겨울'];
const EVENTS = ['낚시 대잔치', '꽃 축제', '시장 오픈', '고요한 밤'];

const WATER = { x1: 31, x2: 46, y1: 8, y2: 23 };
const BRIDGE = { x1: 32, x2: 44, y: 15 };
const HOUSE_PLOT = { x: 470, y: 520, w: 180, h: 140 };
const FARM = { x: 240, y: 560, w: 180, h: 120 };

const biomes = Array.from({ length: MAP_H }, (_, gy) =>
  Array.from({ length: MAP_W }, (_, gx) => {
    if (gx > WATER.x1 && gx < WATER.x2 && gy > WATER.y1 && gy < WATER.y2) return 'water';
    const v = Math.sin(gx * 0.3) + Math.cos(gy * 0.27) + Math.random() * 0.6;
    if (v > 1.2) return 'meadow';
    if (v > 0.4) return 'grass';
    return 'grove';
  })
);

const state = {
  keys: new Set(),
  camera: { x: 0, y: 0 },
  time: 0,
  day: 1,
  season: 0,
  weather: 'sunny',
  dailyEvent: EVENTS[0],
  msg: '고도화 5단계: 긴 다리 + 박물관 + 업적 + 곤충채집',
  msgTimer: 280,
  logs: ['게임 시작'],
  coins: 110,
  level: 1,
  xp: 0,
  player: { x: 420, y: 420, speed: 2.4, energy: 100, mood: 100, facing: 'down', pause: false },
  inv: { wood: 0, flower: 0, berry: 0, shell: 0, fish: 0, bug: 0, seed: 2, furniture: 0 },
  objects: [],
  fishes: [],
  crops: [],
  npcs: [],
  relationships: { luna: 20, bomi: 20, maru: 20 },
  residentRequests: {
    luna: { item: 'flower', need: 3, reward: 45, doneDay: 0 },
    bomi: { item: 'wood', need: 3, reward: 45, doneDay: 0 },
    maru: { item: 'fish', need: 2, reward: 55, doneDay: 0 },
  },
  dialogue: null,
  bridgeBuilt: false,
  house: {
    tier: 0,
    inside: false,
    furniture: [],
    doorX: 520,
    doorY: 560,
    editor: { selected: 0 },
  },
  fishing: { active: false, phase: 'idle', timer: 0, biteWindow: 0, cursor: 0.1, dir: 1, zoneStart: 0.45, zoneWidth: 0.2, progress: 0 },
  quests: [
    { id: 'fish_fest', title: '마을 낚시대회 준비', needs: { fish: 5, wood: 8 }, reward: 220 },
    { id: 'farm_week', title: '주말 장터용 작물 준비', needs: { flower: 8, berry: 8 }, reward: 260 },
    { id: 'cozy_home', title: '포근한 집 꾸미기', needs: { furniture: 3, wood: 10 }, reward: 340 },
  ],
  questIndex: 0,
  questDone: false,
  shopStock: { seedpackPrice: 20, furniturePrice: 55, fishPrice: 15 },
  museum: { fish: 0, bug: 0, shell: 0, flower: 0 },
  achievements: { bridgeMaster: false, museum10: false, relation90: false },
  decorScore: 0,
  version: 'v0.5',
};

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function rnd(min, max) { return Math.random() * (max - min) + min; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function worldToScreen(x, y) { return { x: x - state.camera.x, y: y - state.camera.y }; }

function setMsg(text, t = 170) { state.msg = text; state.msgTimer = t; }
function addLog(text) { state.logs.unshift(`[D${state.day}] ${text}`); state.logs = state.logs.slice(0, 7); }
function getQuest() { return state.quests[state.questIndex] || null; }

function calcDecorScore() {
  const furniture = state.house.furniture;
  if (!furniture.length) return 0;
  const uniqueCells = new Set(furniture.map((f) => `${f.gx},${f.gy}`)).size;
  const rotationVariety = new Set(furniture.map((f) => f.rot || 0)).size;
  const base = furniture.length * 8;
  const layout = uniqueCells * 2;
  const style = rotationVariety * 5;
  return base + layout + style + state.house.tier * 10;
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

function calcDailyShopStock() {
  const roll = Math.abs(Math.sin(state.day * 1.73 + state.season * 0.31));
  state.shopStock.seedpackPrice = 16 + Math.floor(roll * 12);
  state.shopStock.furniturePrice = 45 + Math.floor(roll * 25);
  state.shopStock.fishPrice = 12 + Math.floor(roll * 10);
}

function rollResidentRequests() {
  const pool = ['flower', 'wood', 'berry', 'fish', 'shell'];
  ['luna', 'bomi', 'maru'].forEach((id, idx) => {
    const pick = pool[(state.day + idx + state.season) % pool.length];
    const need = pick === 'fish' ? 2 : 3;
    const reward = 35 + need * 10 + idx * 5;
    state.residentRequests[id] = { item: pick, need, reward, doneDay: 0 };
  });
}

function catchBugAction() {
  const chance = 0.55 + (state.dailyEvent === '꽃 축제' ? 0.2 : 0);
  if (Math.random() < chance) {
    state.inv.bug += 1;
    state.xp += 9;
    setMsg('곤충 채집 성공! bug +1');
    addLog('곤충 채집 성공');
  } else {
    setMsg('곤충이 날아갔어요!');
  }
}

function donateToMuseum(kind) {
  if ((state.inv[kind] || 0) <= 0) {
    setMsg(`${kind} 기증할 재료가 부족해요.`);
    return;
  }
  state.inv[kind] -= 1;
  state.museum[kind] = (state.museum[kind] || 0) + 1;
  state.coins += 10;
  state.xp += 7;
  addLog(`박물관 기증: ${kind}`);
  setMsg(`박물관 기증 완료 (${kind}) +10 코인`);
}

function checkAchievements() {
  if (state.bridgeBuilt && !state.achievements.bridgeMaster) {
    state.achievements.bridgeMaster = true;
    state.coins += 40;
    addLog('업적 달성: 다리 장인 (+40)');
  }
  const museumTotal = Object.values(state.museum).reduce((a,b)=>a+b,0);
  if (museumTotal >= 10 && !state.achievements.museum10) {
    state.achievements.museum10 = true;
    state.coins += 70;
    addLog('업적 달성: 큐레이터 (+70)');
  }
  if (Object.values(state.relationships).some(v => v >= 90) && !state.achievements.relation90) {
    state.achievements.relation90 = true;
    state.coins += 60;
    addLog('업적 달성: 베스트 프렌드 (+60)');
  }
}

function saveGame() {
  const snapshot = {
    day: state.day,
    season: state.season,
    weather: state.weather,
    dailyEvent: state.dailyEvent,
    coins: state.coins,
    level: state.level,
    xp: state.xp,
    inv: state.inv,
    bridgeBuilt: state.bridgeBuilt,
    house: state.house,
    questIndex: state.questIndex,
    questDone: state.questDone,
    crops: state.crops,
    relationships: state.relationships,
    residentRequests: state.residentRequests,
    shopStock: state.shopStock,
    museum: state.museum,
    achievements: state.achievements,
    player: { x: state.player.x, y: state.player.y },
  };
  localStorage.setItem('healing_island_save_v3', JSON.stringify(snapshot));
}

function loadGame() {
  const raw = localStorage.getItem('healing_island_save_v3');
  if (!raw) return;
  try {
    const s = JSON.parse(raw);
    state.day = s.day ?? state.day;
    state.season = s.season ?? state.season;
    state.weather = s.weather ?? state.weather;
    state.dailyEvent = s.dailyEvent ?? state.dailyEvent;
    state.coins = s.coins ?? state.coins;
    state.level = s.level ?? state.level;
    state.xp = s.xp ?? state.xp;
    state.inv = { ...state.inv, ...(s.inv || {}) };
    state.bridgeBuilt = !!s.bridgeBuilt;
    state.house = { ...state.house, ...(s.house || {}) };
    state.questIndex = s.questIndex ?? state.questIndex;
    state.questDone = !!s.questDone;
    state.crops = Array.isArray(s.crops) ? s.crops : [];
    state.relationships = { ...state.relationships, ...(s.relationships || {}) };
    state.residentRequests = { ...state.residentRequests, ...(s.residentRequests || {}) };
    state.shopStock = { ...state.shopStock, ...(s.shopStock || {}) };
    state.museum = { ...state.museum, ...(s.museum || {}) };
    state.achievements = { ...state.achievements, ...(s.achievements || {}) };
    if (s.player) {
      state.player.x = s.player.x ?? state.player.x;
      state.player.y = s.player.y ?? state.player.y;
    }
    addLog('저장 데이터 불러오기 완료');
  } catch {
    addLog('저장 데이터가 손상되어 초기 상태로 시작');
  }
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
    { id: 'bomi', name: '보미', x: 1020, y: 620, color: '#22c55e', mood: 80, state: 'farm', target: null, pause: false, talk: '' },
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

  drawFarmArea();
  if (state.bridgeBuilt) drawBridge();
  drawHouseExterior();
}

function drawFarmArea() {
  const p = worldToScreen(FARM.x, FARM.y);
  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(p.x, p.y, FARM.w, FARM.h);
  ctx.fillStyle = '#6b3f1f';
  for (let i = 0; i <= FARM.w; i += 36) ctx.fillRect(p.x + i, p.y, 2, FARM.h);
  for (let i = 0; i <= FARM.h; i += 30) ctx.fillRect(p.x, p.y + i, FARM.w, 2);

  state.crops.forEach((c) => {
    const cp = worldToScreen(c.x, c.y);
    const icon = c.stage >= 3 ? '🌻' : c.stage === 2 ? '🌿' : '🌱';
    ctx.fillText(icon, cp.x - 8, cp.y + 6);
  });

  if (dist(state.player, { x: FARM.x + FARM.w / 2, y: FARM.y + FARM.h / 2 }) < 120) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(p.x + 30, p.y - 26, 120, 20);
    ctx.fillStyle = '#111827';
    ctx.fillText('R: 심기/수확', p.x + 42, p.y - 12);
  }
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
  ctx.fillText('E: 집 나가기 · IJKL 이동 · T 회전 · Tab 전환', canvas.width / 2 - 180, canvas.height - 40);

  state.house.furniture.forEach((f, i) => {
    const x = 200 + f.gx * 80;
    const y = 120 + f.gy * 70;
    ctx.save();
    ctx.translate(x + 34, y + 22);
    ctx.rotate((f.rot || 0) * (Math.PI / 2));
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(-30, -18, 60, 36);
    ctx.fillStyle = '#fff';
    ctx.fillText('🪑', -12, 8);
    ctx.restore();

    if (i === state.house.editor.selected) {
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 4, y - 4, 76, 50);
    }
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
  ctx.fillRect(p.x - 190, p.y + 40, 380, 80);
  ctx.fillStyle = '#fff';
  ctx.fillText(`1) ${state.dialogue.a}`, p.x - 176, p.y + 62);
  ctx.fillText(`2) ${state.dialogue.b}`, p.x - 176, p.y + 88);
}

function drawAllCharacters() {
  state.npcs.forEach((n) => {
    drawCharacter(n.x, n.y, n.color, n.facing || 'down');
    drawSpeechBubble(n, n.talk);
  });
  drawCharacter(state.player.x, state.player.y, '#2563eb', state.player.facing);
  if (state.dialogue) drawDialogueChoices();
}

function facingTo(a, b) {
  if (Math.abs(a.x - b.x) > Math.abs(a.y - b.y)) return a.x < b.x ? 'right' : 'left';
  return a.y < b.y ? 'down' : 'up';
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

function npcScheduledState(npc) {
  const phase = (Math.sin(state.time * 0.0023) + 1) / 2;
  if (phase < 0.28) return 'idle';
  if (phase < 0.45) return npc.id === 'maru' ? 'fish' : 'farm';
  if (phase < 0.75) return npc.id === 'maru' ? 'fish' : 'wander';
  return 'social';
}

function updateNPCs() {
  state.npcs.forEach((n) => {
    if (n.pause) return;
    n.state = npcScheduledState(n);

    if (!n.target || dist(n, n.target) < 20) {
      if (n.state === 'fish') n.target = { x: rnd((WATER.x1 + 1) * TILE, (WATER.x2 - 1) * TILE), y: rnd((WATER.y1 + 1) * TILE, (WATER.y2 - 1) * TILE) };
      else if (n.state === 'farm') n.target = { x: FARM.x + rnd(10, FARM.w - 10), y: FARM.y + rnd(10, FARM.h - 10) };
      else if (n.state === 'social') n.target = { x: HOUSE_PLOT.x + rnd(20, 160), y: HOUSE_PLOT.y + rnd(20, 120) };
      else if (n.state === 'idle') n.target = { x: HOUSE_PLOT.x + 90, y: HOUSE_PLOT.y + 90 };
      else n.target = { x: rnd(80, WORLD_W - 80), y: rnd(80, WORLD_H - 80) };
    }

    const dx = n.target.x - n.x;
    const dy = n.target.y - n.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      const spd = n.state === 'idle' ? 0.6 : 1.15;
      const nx = n.x + (dx / d) * spd;
      const ny = n.y + (dy / d) * spd;
      if (isWalkable(nx, ny) || n.state === 'fish') { n.x = nx; n.y = ny; }
      n.facing = facingTo(n, n.target);
    }

    const rel = state.relationships[n.id] || 0;
    n.talk = dist(state.player, n) < 100 ? `${n.state === 'social' ? '수다 떨래?' : 'E로 대화!'} (호감 ${rel})` : '';
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

function handleFarmAction() {
  const nearFarm = dist(state.player, { x: FARM.x + FARM.w / 2, y: FARM.y + FARM.h / 2 }) < 120;
  if (!nearFarm) return;

  const ready = state.crops.find((c) => c.stage >= 3);
  if (ready) {
    state.inv.flower += 2;
    state.inv.berry += 1;
    state.crops = state.crops.filter((c) => c !== ready);
    setMsg('작물 수확! 꽃 +2, 열매 +1');
    addLog('농사 수확 완료');
    return;
  }

  if (state.inv.seed <= 0) return setMsg('씨앗이 없습니다. 상점에서 구매하세요.');
  if (state.crops.length >= 8) return setMsg('밭이 가득 찼습니다.');

  state.inv.seed -= 1;
  state.crops.push({ x: FARM.x + rnd(14, FARM.w - 14), y: FARM.y + rnd(14, FARM.h - 14), stage: 0, grow: 0 });
  setMsg('씨앗을 심었습니다.');
}

function updateCrops() {
  state.crops.forEach((c) => {
    c.grow += state.weather === 'rainy' ? 1.2 : 0.8;
    if (c.grow > 420 && c.stage < 3) { c.stage += 1; c.grow = 0; }
  });
}

function nearFishingSpot() {
  const p = state.player;
  const nearWater = tileAt(p.x + 28, p.y).b === 'water' || tileAt(p.x - 28, p.y).b === 'water' || tileAt(p.x, p.y + 28).b === 'water';
  return nearWater || onBridge(p.x, p.y);
}

function startFishing() {
  if (!nearFishingSpot()) return setMsg('연못 가장자리 또는 다리 위에서 낚시할 수 있어요.');
  if (state.fishing.active) return;

  state.fishing.active = true;
  state.fishing.phase = 'cast';
  state.fishing.timer = 60 + Math.floor(Math.random() * 60);
  state.fishing.biteWindow = 0;
  state.fishing.cursor = 0.1;
  state.fishing.dir = 1;
  state.fishing.zoneStart = rnd(0.2, 0.65);
  state.fishing.zoneWidth = rnd(0.14, 0.22);
  state.fishing.progress = 42;
  ui.fishingUi.classList.remove('hidden');
}

function fishingInput() {
  if (!state.fishing.active) return startFishing();

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
      state.xp += 16 + (state.dailyEvent === '낚시 대잔치' ? 8 : 0);
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

  if (f.phase === 'reel') {
    const width = 34;
    const zL = Math.floor(f.zoneStart * width);
    const zW = Math.max(1, Math.floor(f.zoneWidth * width));
    const c = Math.floor(f.cursor * width);
    let bar = '';
    for (let i = 0; i < width; i++) {
      if (i === c) bar += '|';
      else if (i >= zL && i <= zL + zW) bar += '■';
      else bar += '·';
    }
    ui.fishingUi.innerHTML = `타이밍 바: ${bar}<br>진행도 ${Math.round(f.progress)}% (구간 안에서 Space)`;
  } else if (f.phase === 'cast') ui.fishingUi.innerHTML = '찌를 드리웠습니다... 입질을 기다리는 중';
  else ui.fishingUi.innerHTML = '<span style="color:#fde047">!! 입질 !! 스페이스로 훅</span>';
}

function handleDialogueChoice(idx) {
  if (!state.dialogue) return;
  const n = state.dialogue.npc;
  const q = getQuest();
  if (!q) return;

  if (idx === 1) {
    const met = Object.entries(q.needs).every(([k, v]) => (state.inv[k] || 0) >= v);
    if (!state.questDone && met) {
      Object.entries(q.needs).forEach(([k, v]) => { state.inv[k] -= v; });
      state.coins += q.reward;
      state.questDone = true;
      n.talk = '완벽해! 고마워!';
      state.relationships[n.id] = clamp((state.relationships[n.id] || 0) + 8, 0, 100);
      setMsg(`퀘스트 완료! 코인 +${q.reward}`);
      addLog(`퀘스트 완료: ${q.title}`);
    } else {
      n.mood = clamp(n.mood + 4, 0, 100);
      state.relationships[n.id] = clamp((state.relationships[n.id] || 0) + 2, 0, 100);
      n.talk = '오늘도 평화롭다 😊';
      state.coins += 5;
      setMsg(`${n.name}와 담소. 코인 +5`);
    }
  }

  if (idx === 2) {
    const req = state.residentRequests[n.id];
    if (req && req.doneDay !== state.day && (state.inv[req.item] || 0) >= req.need) {
      state.inv[req.item] -= req.need;
      state.coins += req.reward;
      req.doneDay = state.day;
      state.relationships[n.id] = clamp((state.relationships[n.id] || 0) + 6, 0, 100);
      n.talk = `고마워! 오늘 부탁 해결!`;
      setMsg(`${n.name} 요청 완료! +${req.reward} 코인`);
      addLog(`${n.name} 일일 요청 완료 (${req.item} ${req.need})`);
    } else if (state.inv.berry > 0) {
      state.inv.berry -= 1;
      n.mood = clamp(n.mood + 10, 0, 100);
      state.relationships[n.id] = clamp((state.relationships[n.id] || 0) + 4, 0, 100);
      n.talk = '열매 선물 고마워!';
      setMsg('선물 성공! 호감도 상승');
    } else {
      const tip = req ? `오늘 요청: ${req.item} ${req.need}` : '열매가 없어요.';
      setMsg(tip);
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
    setMsg('집 안으로 들어왔습니다. F 배치 / IJKL 이동 / T 회전 / Tab 전환');
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
  if (state.inv.furniture <= 0) return setMsg('배치할 가구가 없어요.');
  state.house.furniture.push({ gx: 2, gy: 2, rot: 0 });
  state.house.editor.selected = state.house.furniture.length - 1;
  state.inv.furniture -= 1;
  state.decorScore = calcDecorScore();
  setMsg('가구 배치 완료. IJKL/T/Tab으로 편집 가능');
}

function moveFurniture(dx, dy) {
  if (!state.house.inside || state.house.furniture.length === 0) return;
  const f = state.house.furniture[state.house.editor.selected] || state.house.furniture[0];
  if (!f) return;
  f.gx = clamp(f.gx + dx, 0, 8);
  f.gy = clamp(f.gy + dy, 0, 6);
  state.decorScore = calcDecorScore();
}

function rotateFurniture() {
  if (!state.house.inside || state.house.furniture.length === 0) return;
  const f = state.house.furniture[state.house.editor.selected] || state.house.furniture[0];
  if (!f) return;
  f.rot = ((f.rot || 0) + 1) % 4;
  state.decorScore = calcDecorScore();
}

function cycleFurnitureSelection() {
  if (!state.house.inside || state.house.furniture.length === 0) return;
  state.house.editor.selected = (state.house.editor.selected + 1) % state.house.furniture.length;
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
  <div class="recipe"><span>🎣 고급 미끼 (berry 2, shell 1)</span><button data-craft="bait">제작</button></div>
  <div class="recipe"><span>🌱 씨앗 묶음 (flower 2)</span><button data-craft="seed">제작</button></div>`;
  openModal('제작', html);
  bindModalActions();
}

function openShop() {
  const html = `
  <div class="shop-item"><span>집 건축권 (150 코인)</span><button data-shop="house">구매</button></div>
  <div class="shop-item"><span>집 업그레이드 (250 코인)</span><button data-shop="upgrade">업그레이드</button></div>
  <div class="shop-item"><span>꽃씨 패키지 (${state.shopStock.seedpackPrice} 코인)</span><button data-shop="seedpack">구매</button></div>
  <div class="shop-item"><span>기성 가구 (${state.shopStock.furniturePrice} 코인)</span><button data-shop="furniture">구매</button></div>
  <div class="shop-item"><span>물고기 판매 (${state.shopStock.fishPrice} 코인/개)</span><button data-shop="sellfish">판매</button></div>
  <div class="shop-item"><span>곤충 판매 (${Math.floor(state.shopStock.fishPrice*0.8)} 코인/개)</span><button data-shop="sellbug">판매</button></div>`;
  openModal('상점(일일 변동)', html);
  bindModalActions();
}

function openBuild() {
  const html = `
  <div class="shop-item"><span>현재 집 단계: ${state.house.tier}</span><span>${state.house.tier === 0 ? '없음' : state.house.tier === 1 ? '오두막' : '코지하우스'}</span></div>
  <div class="shop-item"><span>${state.bridgeBuilt ? '다리 설치 완료' : '다리 미설치'}</span><span>${state.bridgeBuilt ? '연못 이동 가능' : '다리 키트 필요'}</span></div>
  <div class="shop-item"><span>농장 작물 수</span><span>${state.crops.length} / 8</span></div>`;
  openModal('건축 현황', html);
}

function openTownBoard() {
  const q = getQuest();
  const questText = q
    ? `${q.title} / 요구: ${Object.entries(q.needs).map(([k, v]) => `${k} ${state.inv[k] || 0}/${v}`).join(', ')}`
    : '모든 기본 퀘스트 완료';

  const requests = Object.entries(state.residentRequests)
    .map(([id, r]) => `${id}: ${r.item} ${r.need} (${r.doneDay === state.day ? '완료' : '미완'})`)
    .join(' / ');

  const html = `
  <div class="shop-item"><span>시즌</span><span>${SEASONS[state.season]}</span></div>
  <div class="shop-item"><span>현재 날짜</span><span>${state.day}일차</span></div>
  <div class="shop-item"><span>오늘 이벤트</span><span>${state.dailyEvent}</span></div>
  <div class="shop-item"><span>퀘스트</span><span>${state.questDone ? '완료/진행 전환 대기' : '진행 중'}</span></div>
  <div class="shop-item"><span style="font-weight:600">${questText}</span></div>
  <div class="shop-item"><span>상점 변동</span><span>매일 가격 변동</span></div>
  <div class="shop-item"><span>집 인테리어 점수</span><span>${state.decorScore}</span></div>
  <div class="shop-item"><span>주민 일일요청</span><span>${requests}</span></div>`;
  openModal('마을 보드', html);
}

function openMuseum() {
  const total = Object.values(state.museum).reduce((a,b)=>a+b,0);
  const html = `
  <div class="shop-item"><span>기증 현황</span><span>총 ${total}점</span></div>
  <div class="shop-item"><span>fish ${state.museum.fish}</span><button data-museum="fish">기증</button></div>
  <div class="shop-item"><span>bug ${state.museum.bug}</span><button data-museum="bug">기증</button></div>
  <div class="shop-item"><span>shell ${state.museum.shell}</span><button data-museum="shell">기증</button></div>
  <div class="shop-item"><span>flower ${state.museum.flower}</span><button data-museum="flower">기증</button></div>`;
  openModal('박물관', html);
  bindModalActions();
}

function bindModalActions() {
  ui.modalBody.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const c = btn.dataset.craft;
      const s = btn.dataset.shop;
      const m = btn.dataset.museum;

      if (c === 'chair') {
        if (state.inv.wood >= 4 && state.inv.flower >= 2) {
          state.inv.wood -= 4; state.inv.flower -= 2; state.inv.furniture += 1;
          setMsg('가구 제작 완료! 집 안에서 F로 배치하세요.');
        } else setMsg('재료가 부족합니다.');
      }
      if (c === 'bridge') {
        if (state.bridgeBuilt) return setMsg('이미 다리가 있습니다.');
        if (state.inv.wood >= 12 && state.coins >= 80) {
          state.inv.wood -= 12; state.coins -= 80; state.bridgeBuilt = true;
          setMsg('연못 다리 완성! 이제 다리 위에서 낚시할 수 있어요.');
          addLog('다리 건설 완료');
        } else setMsg('목재 또는 코인이 부족합니다.');
      }
      if (c === 'bait') {
        if (state.inv.berry >= 2 && state.inv.shell >= 1) {
          state.inv.berry -= 2; state.inv.shell -= 1;
          state.fishing.zoneWidth = clamp(state.fishing.zoneWidth + 0.04, 0.14, 0.35);
          setMsg('미끼 제작! 이번 낚시 타이밍 구간이 넓어집니다.');
        } else setMsg('재료가 부족합니다.');
      }
      if (c === 'seed') {
        if (state.inv.flower >= 2) { state.inv.flower -= 2; state.inv.seed += 2; setMsg('씨앗 제작 완료 (seed +2).'); }
        else setMsg('꽃이 부족합니다.');
      }

      if (s === 'house') {
        if (state.house.tier > 0) return setMsg('이미 집을 보유 중입니다.');
        if (state.coins >= 150) { state.coins -= 150; state.house.tier = 1; addLog('집 건축 완료'); setMsg('오두막 건축 완료! 문 앞에서 E로 입장.'); }
        else setMsg('코인이 부족합니다.');
      }
      if (s === 'upgrade') {
        if (state.house.tier === 0) return setMsg('먼저 집을 구매하세요.');
        if (state.house.tier >= 2) return setMsg('최대 업그레이드입니다.');
        if (state.coins >= 250) { state.coins -= 250; state.house.tier = 2; addLog('집 업그레이드 완료'); setMsg('집 업그레이드 완료!'); }
        else setMsg('코인이 부족합니다.');
      }
      if (s === 'seedpack') {
        if (state.coins >= state.shopStock.seedpackPrice) { state.coins -= state.shopStock.seedpackPrice; state.inv.seed += 3; setMsg('꽃씨 패키지 구매 완료 (seed +3).'); }
        else setMsg('코인이 부족합니다.');
      }
      if (s === 'furniture') {
        if (state.coins >= state.shopStock.furniturePrice) { state.coins -= state.shopStock.furniturePrice; state.inv.furniture += 1; setMsg('기성 가구 구매 완료.'); }
        else setMsg('코인이 부족합니다.');
      }
      if (m) {
        donateToMuseum(m);
      }
      if (s === 'sellfish') {
        if (state.inv.fish <= 0) setMsg('판매할 물고기가 없습니다.');
        else {
          const earn = state.inv.fish * state.shopStock.fishPrice;
          state.coins += earn;
          state.inv.fish = 0;
          setMsg(`물고기 판매 완료! +${earn} 코인`);
        }
      }
      if (s === 'sellbug') {
        if (state.inv.bug <= 0) setMsg('판매할 곤충이 없습니다.');
        else {
          const unit = Math.floor(state.shopStock.fishPrice * 0.8);
          const earn = state.inv.bug * unit;
          state.coins += earn;
          state.inv.bug = 0;
          setMsg(`곤충 판매 완료! +${earn} 코인`);
        }
      }

      updateUI();
      saveGame();
    });
  });
}

function playerMove() {
  if (state.player.pause || state.house.inside) return;
  let dx = 0;
  let dy = 0;
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

function maybeProgressQuest() {
  if (!state.questDone) return;
  if (state.questIndex < state.quests.length - 1) {
    state.questIndex += 1;
    state.questDone = false;
    setMsg(`새 퀘스트 시작: ${state.quests[state.questIndex].title}`);
    addLog(`신규 퀘스트: ${state.quests[state.questIndex].id}`);
  }
}

function updateEconomyAndLevel() {
  const levelGoal = state.level * 140;
  if (state.xp >= levelGoal) {
    state.level += 1;
    state.player.speed += 0.08;
    setMsg(`레벨 업! Lv.${state.level}`);
    addLog(`레벨 ${state.level} 달성`);
  }
}

function applyDailyEventEffect() {
  if (state.dailyEvent === '꽃 축제' && state.day % 2 === 0) {
    state.inv.flower += 1;
    addLog('꽃 축제 보너스: 꽃 +1');
  }
  if (state.dailyEvent === '시장 오픈' && state.day % 2 === 1) {
    state.coins += 15;
    addLog('시장 오픈 보너스: 코인 +15');
  }
}

function updateCalendar() {
  if (state.time % 2600 === 0) {
    state.day += 1;
    if (state.day % 7 === 0) {
      state.season = (state.season + 1) % SEASONS.length;
      addLog(`계절 변경: ${SEASONS[state.season]}`);
      setMsg(`계절이 ${SEASONS[state.season]}(으)로 바뀌었습니다.`);
    }
    state.weather = Math.random() > 0.7 ? 'rainy' : 'sunny';
    state.dailyEvent = EVENTS[state.day % EVENTS.length];
    calcDailyShopStock();
    rollResidentRequests();
    applyDailyEventEffect();
    if (state.day % 5 === 0 && state.house.tier > 0) {
      const bonus = Math.floor(state.decorScore * 0.6);
      if (bonus > 0) {
        state.coins += bonus;
        addLog(`주택 평가 보너스: +${bonus} 코인`);
      }
    }
    addLog(`새로운 하루 (날씨: ${state.weather}, 이벤트: ${state.dailyEvent})`);
    saveGame();
  }
}

function updateUI() {
  const t = (Math.sin(state.time * 0.0023) + 1) / 2;
  const phase = t > 0.66 ? '아침' : t > 0.33 ? '노을' : '밤';
  state.decorScore = calcDecorScore();
  ui.stats.innerHTML = `🗓️ D${state.day} ${SEASONS[state.season]} · 🕒 ${phase} · 🎉 ${state.dailyEvent} · ⚡ ${Math.floor(state.player.energy)} · 💖 ${Math.floor(state.player.mood)} · 🪙 ${state.coins} · ⭐ ${state.level} · 🏠 ${state.decorScore} · ${state.version}`;
  ui.inventory.innerHTML = ITEMS.map(([k, e]) => `<div>${e} ${k}: <b>${state.inv[k]}</b></div>`).join('');

  const q = getQuest();
  if (!q) ui.quest.innerHTML = '모든 2단계 기본 퀘스트 완료!';
  else {
    const prog = Object.entries(q.needs).map(([k, v]) => `${k} ${state.inv[k]}/${v}`).join(', ');
    ui.quest.innerHTML = `${state.questDone ? '✅' : '📌'} ${q.title}<br>${prog}<br>보상: ${q.reward} 코인`;
  }

  ui.relations.innerHTML = Object.entries(state.relationships)
    .map(([k, v]) => `${k}: ${v}`)
    .join('<br>');
  const ach = state.achievements;
  ui.achievements.innerHTML = `다리장인: ${ach.bridgeMaster ? '✅' : '⬜'}<br>큐레이터: ${ach.museum10 ? '✅' : '⬜'}<br>베스트프렌드: ${ach.relation90 ? '✅' : '⬜'}`;
  ui.log.innerHTML = state.logs.map((l) => `• ${l}`).join('<br>');
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
    updateCrops();
    updateCamera();

    drawWorld();
    state.objects.forEach(drawResource);
    drawFish();
    drawAllCharacters();
  } else {
    drawHouseInterior();
  }

  updateFishing();
  updateEconomyAndLevel();
  maybeProgressQuest();
  updateCalendar();
  checkAchievements();
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

  if (state.house.inside) {
    if (key === 'i') return moveFurniture(0, -1);
    if (key === 'k') return moveFurniture(0, 1);
    if (key === 'j') return moveFurniture(-1, 0);
    if (key === 'l') return moveFurniture(1, 0);
    if (key === 't') return rotateFurniture();
    if (key === 'tab') { e.preventDefault(); return cycleFurnitureSelection(); }
  }

  if (key === ' ') { e.preventDefault(); fishingInput(); return; }
  if (key === 'e') { interact(); return; }
  if (key === 'f') { placeFurniture(); return; }
  if (key === 'r') { handleFarmAction(); return; }
  if (key === 'g') { catchBugAction(); return; }
  state.keys.add(key);
});

window.addEventListener('keyup', (e) => {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  state.keys.delete(key);
});

ui.btnCraft.addEventListener('click', openCraft);
ui.btnShop.addEventListener('click', openShop);
ui.btnBuild.addEventListener('click', openBuild);
ui.btnTown.addEventListener('click', openTownBoard);
ui.btnMuseum.addEventListener('click', openMuseum);
ui.modalClose.addEventListener('click', closeModal);
ui.modal.addEventListener('click', (e) => { if (e.target === ui.modal) closeModal(); });

loadGame();
calcDailyShopStock();
rollResidentRequests();
spawnResources();
spawnFish();
initNPCs();
updateUI();
tick();
