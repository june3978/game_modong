import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const SPRITE_CELL = 16;
const SPRITE_SCALE = 3;

const spriteAtlas = {
  tiles: { img: null, loaded: false, failed: false, src: 'assets/tiles.png' },
  characters: { img: null, loaded: false, failed: false, src: 'assets/characters.png' },
  items: { img: null, loaded: false, failed: false, src: 'assets/items.png' },
};

function loadAtlasImage(key) {
  const atlas = spriteAtlas[key];
  if (!atlas || atlas.loaded || atlas.failed || atlas.img) return;
  const img = new Image();
  atlas.img = img;
  img.onload = () => { atlas.loaded = true; atlas.failed = false; };
  img.onerror = () => { atlas.failed = true; atlas.loaded = false; atlas.img = null; };
  img.src = atlas.src;
}

function initSpriteAtlases() {
  loadAtlasImage('tiles');
  loadAtlasImage('characters');
  loadAtlasImage('items');
}

function drawSprite(ctx2d, img, sx, sy, sw, sh, dx, dy, dw, dh) {
  if (!img) return false;
  try {
    ctx2d.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    return true;
  } catch {
    return false;
  }
}

const ui = {
  game3d: document.getElementById('game3d'),
  stats: document.getElementById('statsBar'),
  inventory: document.getElementById('inventory'),
  quest: document.getElementById('quest'),
  relations: document.getElementById('relations'),
  achievements: document.getElementById('achievements'),
  log: document.getElementById('log'),
  worldMapMini: document.getElementById('worldMapMini'),
  message: document.getElementById('message'),
  dialogueUi: document.getElementById('dialogueUi'),
  fishingUi: document.getElementById('fishingUi'),
  modal: document.getElementById('modal'),
  modalTitle: document.getElementById('modalTitle'),
  modalBody: document.getElementById('modalBody'),
  modalClose: document.getElementById('modalClose'),
  btnRender: document.getElementById('btnRender'),
  btnCraft: document.getElementById('btnCraft'),
  btnShop: document.getElementById('btnShop'),
  btnBuild: document.getElementById('btnBuild'),
  btnTown: document.getElementById('btnTown'),
  btnMuseum: document.getElementById('btnMuseum'),
  btnMap: document.getElementById('btnMap'),
  btnStyle: document.getElementById('btnStyle'),
};

const TILE = 48;
const MAP_W = 96;
const MAP_H = 96;
const WORLD_W = MAP_W * TILE;
const WORLD_H = MAP_H * TILE;

// TODO(v2.3-visual): explicit inventory/resource icons for immediate readability
const ITEMS = [['wood', '🪵'], ['flower', '🌸'], ['berry', '🫐'], ['shell', '🐚'], ['fish', '🐟'], ['bug', '🐞'], ['seed', '🌱'], ['furniture', '🪑']];
const SEASONS = ['봄', '여름', '가을', '겨울'];
const EVENTS = ['낚시 대잔치', '꽃 축제', '시장 오픈', '고요한 밤'];

const WATER = { x1: 31, x2: 46, y1: 8, y2: 23 };
const BRIDGE = { x1: 32, x2: 44, y: 15 };
const HOUSE_PLOT = { x: 900, y: 1180, w: 180, h: 140 };
const FARM = { x: 640, y: 1240, w: 220, h: 140 };
const SHOP_PLOT = { x: 1480, y: 1140, w: 190, h: 140 };
const MUSEUM_PLOT = { x: 1700, y: 900, w: 240, h: 150 };
const FOUNTAIN = { x: 1240, y: 1140 };
const CAMPFIRE = { x: 1140, y: 1340 };
const LOOKOUT = { x: 2060, y: 980 };
const PIER = { x: (WATER.x1 + 1) * TILE, y: BRIDGE.y * TILE + 60 };
const WORLD_RADIUS = Math.min(WORLD_W, WORLD_H) * 0.46;

const NPC_HOMES = [
  { id: 'luna', x: 1120, y: 1060, color: '#ef9a6f' },
  { id: 'bomi', x: 1360, y: 1240, color: '#6cb0f3' },
  { id: 'maru', x: 1860, y: 1320, color: '#8fd18b' },
  { id: 'nari', x: 940, y: 1460, color: '#d7a5f6' },
  { id: 'toto', x: 1620, y: 1480, color: '#f4cc6a' },
  { id: 'pipi', x: 2080, y: 1160, color: '#95e2d4' },
];


const NPC_TRAITS = {
  luna: { poi: ['fountain', 'house', 'campfire'], socialBias: 0.68, rainyHomeBias: 0.78 },
  bomi: { poi: ['farm', 'campfire', 'house'], socialBias: 0.45, rainyHomeBias: 0.42 },
  maru: { poi: ['pier', 'water', 'lookout'], socialBias: 0.36, rainyHomeBias: 0.2 },
  nari: { poi: ['museum', 'fountain', 'house'], socialBias: 0.56, rainyHomeBias: 0.5 },
  toto: { poi: ['shop', 'campfire', 'lookout'], socialBias: 0.62, rainyHomeBias: 0.46 },
  pipi: { poi: ['fountain', 'shop', 'pier'], socialBias: 0.54, rainyHomeBias: 0.4 },
};

const NPC_POI_POINTS = {
  house: { x: HOUSE_PLOT.x + 90, y: HOUSE_PLOT.y + 90 },
  farm: { x: FARM.x + FARM.w / 2, y: FARM.y + FARM.h / 2 },
  shop: { x: SHOP_PLOT.x + 92, y: SHOP_PLOT.y + 102 },
  museum: { x: MUSEUM_PLOT.x + 106, y: MUSEUM_PLOT.y + 110 },
  fountain: FOUNTAIN,
  campfire: CAMPFIRE,
  lookout: LOOKOUT,
  pier: PIER,
};


const NPC_ROUTINES = {
  morning: { stateWeight: { idle: 0.34, wander: 0.32, farm: 0.2, social: 0.14 }, poiWeight: { house: 0.44, fountain: 0.22, farm: 0.2, lookout: 0.14 } },
  noon: { stateWeight: { wander: 0.28, farm: 0.36, social: 0.2, fish: 0.16 }, poiWeight: { farm: 0.38, fountain: 0.16, shop: 0.16, pier: 0.18, lookout: 0.12 } },
  evening: { stateWeight: { social: 0.36, wander: 0.26, idle: 0.14, fish: 0.24 }, poiWeight: { campfire: 0.32, fountain: 0.22, pier: 0.22, house: 0.14, museum: 0.1 } },
  night: { stateWeight: { idle: 0.48, social: 0.2, wander: 0.14, fish: 0.18 }, poiWeight: { house: 0.56, campfire: 0.18, lookout: 0.14, pier: 0.12 } },
};

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
  msg: 'v2.2: 대화 100+ 바리에이션 + 물물교환 시스템',
  msgTimer: 280,
  prompt: '',
  logs: ['게임 시작'],
  coins: 110,
  level: 1,
  xp: 0,
  player: { x: 960, y: 1120, speed: 2.4, energy: 100, mood: 100, facing: 'down', pause: false, lastSafeX: 960, lastSafeY: 1120 },
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
    doorX: HOUSE_PLOT.x + 90,
    doorY: HOUSE_PLOT.y + 84,
    editor: { selected: 0 },
    interiorPlayer: { x: 640, y: 560 },
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
  renderMode: '2d',
  camera3d: { yaw: 0.75, dist: 560, height: 300 },
  version: 'v2.2',
  buffs: { fish: 0, bug: 0, harvest: 0, discount: 0 },
  interactionFlags: {},
  barterOffers: {},
  dialoguePools: {},
  debugPaths: false,
  renderStyle: 'pbr',
};

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function rnd(min, max) { return Math.random() * (max - min) + min; }
function dist(a, b) { return worldDistance(a, b); }

function wrapAxis(v, max) {
  const m = ((v % max) + max) % max;
  return m;
}

function wrapWorldPoint(p) {
  p.x = wrapAxis(p.x, WORLD_W);
  p.y = wrapAxis(p.y, WORLD_H);
}

function circularDelta(v, ref, max) {
  let d = v - ref;
  if (d > max / 2) d -= max;
  if (d < -max / 2) d += max;
  return d;
}

function worldDistance(a, b) {
  const dx = circularDelta(a.x, b.x, WORLD_W);
  const dy = circularDelta(a.y, b.y, WORLD_H);
  return Math.hypot(dx, dy);
}

function worldToScreen(x, y) {
  return {
    x: circularDelta(x, state.camera.x, WORLD_W) + canvas.width / 2,
    y: circularDelta(y, state.camera.y, WORLD_H) + canvas.height / 2,
  };
}

function wrappedPointNear(ref, pt) {
  return {
    x: ref.x + circularDelta(pt.x, ref.x, WORLD_W),
    y: ref.y + circularDelta(pt.y, ref.y, WORLD_H),
  };
}



function buildDialoguePool(name, traits = []) {
  const moods = ['반짝이는', '포근한', '고요한', '싱그러운', '은은한', '설레는'];
  const places = ['광장', '해안', '연못', '숲길', '농장', '전망대'];
  const actions = ['산책하고', '낚시하고', '꽃을 돌보고', '장작을 모으고', '별을 보고', '차를 마시고'];
  const endings = ['기분이 좋아졌어.', '하루가 꽉 찬 느낌이야.', '오늘은 행운이 따를 것 같아.', '마을이 더 사랑스러워 보여.', '네가 있어서 든든해.', '조금 더 용기가 생겼어.'];
  const topics = ['집 꾸미기', '새 이웃 이야기', '시장 소식', '박물관 전시', '계절 이벤트', '비밀 스팟'];
  const pool = [];

  for (const mood of moods) {
    for (const place of places) {
      for (const action of actions) {
        const end = endings[(pool.length + action.length + place.length) % endings.length];
        const topic = topics[(pool.length + name.length) % topics.length];
        const trait = traits[pool.length % Math.max(1, traits.length)] || '따뜻한';
        pool.push(`${name}: ${mood} ${place}에서 ${action} 보니까 ${end} (${trait} 취향 / ${topic})`);
      }
    }
  }
  // 6*6*6 = 216 lines
  return pool;
}

function initDialoguePools() {
  const traitMap = {
    luna: ['음악', '꽃', '산책', '디자인'],
    bomi: ['농사', '수집', '요리', '정원'],
    maru: ['낚시', '연못', '캠핑', '파도'],
    nari: ['책', '박물관', '사진', '공예'],
    toto: ['장난감', '시장', '요리', '모험'],
    pipi: ['날씨', '해안', '패션', '잡화'],
  };
  state.dialoguePools = {};
  state.npcs.forEach((n) => {
    state.dialoguePools[n.id] = buildDialoguePool(n.name, traitMap[n.id] || ['일상']);
  });
}

function getDialogueLine(npc) {
  const pool = state.dialoguePools[npc.id] || [];
  if (!pool.length) return `${npc.name}: 무슨 이야기 할까?`;
  const idx = (state.day * 17 + Math.floor(state.time / 40) + npc.name.length * 13 + Math.floor(Math.random() * 11)) % pool.length;
  return pool[idx];
}

function rollDailyBarterOffers() {
  const recipes = [
    { give: 'wood', giveAmt: 3, take: 'seed', takeAmt: 2, mood: 3 },
    { give: 'flower', giveAmt: 4, take: 'furniture', takeAmt: 1, mood: 4 },
    { give: 'shell', giveAmt: 3, take: 'berry', takeAmt: 3, mood: 3 },
    { give: 'fish', giveAmt: 2, take: 'wood', takeAmt: 5, mood: 5 },
    { give: 'bug', giveAmt: 2, take: 'flower', takeAmt: 4, mood: 4 },
    { give: 'berry', giveAmt: 4, take: 'seed', takeAmt: 3, mood: 2 },
  ];
  const ids = (state.npcs || []).map((n) => n.id);
  if (!ids.length) return;
  state.barterOffers = {};
  ids.forEach((id, idx) => {
    const r = recipes[(state.day + idx * 3 + state.season) % recipes.length];
    state.barterOffers[id] = { ...r };
  });
}

function tryNpcBarter(npc) {
  const offer = state.barterOffers[npc.id];
  if (!offer) return { ok: false, msg: '오늘 교환 제안이 없어요.' };
  if ((state.inv[offer.give] || 0) < offer.giveAmt) {
    return { ok: false, msg: `${offer.give} ${offer.giveAmt}개가 필요해요.` };
  }
  state.inv[offer.give] -= offer.giveAmt;
  state.inv[offer.take] = (state.inv[offer.take] || 0) + offer.takeAmt;
  state.relationships[npc.id] = clamp((state.relationships[npc.id] || 0) + offer.mood, 0, 100);
  state.xp += 7;
  addLog(`${npc.name}와 물물교환: ${offer.give} -${offer.giveAmt}, ${offer.take} +${offer.takeAmt}`);
  return { ok: true, msg: `${npc.name}와 교환 완료! ${offer.take} +${offer.takeAmt}` };
}

// TODO(v2.3-visual): stabilize 2D text readability across UI/map/object labels
ctx.font = '14px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
ctx.textAlign = 'left';
ctx.textBaseline = 'alphabetic';

const render3d = {
  ready: false,
  loading: false,
  canvas: null,
  ctx: null,
  props: [],
  rain: null,
  clock: null,
  playerMixer: null,
  npcMixers: [],
  composer: null,
  bloomPass: null,
  usePostFX: false,
  modelRoot: 'assets/models',
  textureStats: { loaded: 0, failed: 0 },
  modelStats: { loaded: 0, failed: 0 },
  debugGroup: null,
  fxGroup: null,
  fxParticles: [],
};

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
  const gx = Math.floor(wrapAxis(x, WORLD_W) / TILE);
  const gy = Math.floor(wrapAxis(y, WORLD_H) / TILE);
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


function nearWaterEdge(x, y) {
  const t = tileAt(x, y);
  if (t.b === 'water') return false;
  const around = [
    tileAt(x + TILE * 0.55, y).b,
    tileAt(x - TILE * 0.55, y).b,
    tileAt(x, y + TILE * 0.55).b,
    tileAt(x, y - TILE * 0.55).b,
  ];
  return around.includes('water');
}


function calcDailyShopStock() {
  const roll = Math.abs(Math.sin(state.day * 1.73 + state.season * 0.31));
  state.shopStock.seedpackPrice = 16 + Math.floor(roll * 12);
  state.shopStock.furniturePrice = 45 + Math.floor(roll * 25);
  state.shopStock.fishPrice = 12 + Math.floor(roll * 10);
}

function rollResidentRequests() {
  const pool = ['flower', 'wood', 'berry', 'fish', 'shell'];
  NPC_HOMES.forEach((home, idx) => {
    const pick = pool[(state.day + idx + state.season) % pool.length];
    const need = pick === 'fish' ? 2 : 3;
    const reward = 35 + need * 10 + idx * 4;
    state.residentRequests[home.id] = { item: pick, need, reward, doneDay: 0 };
  });
}

function catchBugAction() {
  const chance = 0.55 + (state.dailyEvent === '꽃 축제' ? 0.2 : 0) + state.buffs.bug * 0.06;
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
      if (b === 'water') continue;

      if (nearWaterEdge(x * TILE + TILE * 0.5, y * TILE + TILE * 0.5) && Math.random() < 0.06) {
        list.push({ type: 'shell', x: x * TILE + rnd(8, TILE - 8), y: y * TILE + rnd(8, TILE - 8), bob: rnd(0, 6.28) });
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
  const names = {
    luna: '루나',
    bomi: '보미',
    maru: '마루',
    nari: '나리',
    toto: '토토',
    pipi: '피피',
  };
  state.relationships = NPC_HOMES.reduce((acc, h) => {
    acc[h.id] = state.relationships[h.id] ?? 20;
    return acc;
  }, {});
  state.npcs = NPC_HOMES.map((h, idx) => ({
    id: h.id,
    name: names[h.id] || h.id,
    x: h.x + rnd(-18, 18),
    y: h.y + rnd(32, 56),
    home: { x: h.x, y: h.y },
    color: h.color,
    mood: 80 + (idx % 3) * 3,
    state: h.id === 'maru' ? 'fish' : 'wander',
    target: null,
    pause: false,
    talk: '',
    talkTimer: 0,
    stuckFrames: 0,
    stuckTimer: 0,
    path: null,
    pathIndex: 0,
    lastProgressDist: 0,
    actionTimer: 0,
    lastMutterAt: 0,
    nextMutterGap: 180 + Math.floor(Math.random() * 180),
    recentTalks: [],
    poiVisitDay: state.day,
    poiVisitsToday: 0,
    visitedPoiToday: {},
    traits: NPC_TRAITS[h.id] || NPC_TRAITS.nari,
    routineSlot: null,
    gesture: 'idle',
    gestureTimer: 0,
    lookYaw: 0,
  }));

  state.npcs.forEach((n) => {
    if (tileAt(n.x, n.y).b === 'water' && n.id !== 'maru') {
      n.x = n.home.x;
      n.y = n.home.y + 40;
    }
    n.vx = 0;
    n.vy = 0;
  });
}

function drawWorld() {
  const day = (Math.sin(state.time * 0.0023) + 1) / 2;
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, `rgb(${70 + day * 100},${120 + day * 80},${185 - day * 70})`);
  sky.addColorStop(1, `rgb(${75 + day * 45},${170 + day * 40},${116 + day * 40})`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const halfX = Math.ceil(canvas.width / TILE / 2) + 2;
  const halfY = Math.ceil(canvas.height / TILE / 2) + 2;
  const centerGX = Math.floor(state.camera.x / TILE);
  const centerGY = Math.floor(state.camera.y / TILE);

  for (let oy = -halfY; oy <= halfY; oy++) {
    for (let ox = -halfX; ox <= halfX; ox++) {
      const gx = wrapAxis(centerGX + ox, MAP_W);
      const gy = wrapAxis(centerGY + oy, MAP_H);
      const b = biomes[gy][gx];
      const wx = (centerGX + ox) * TILE;
      const wy = (centerGY + oy) * TILE;
      const p = worldToScreen(wx, wy);
      drawTile2D(p.x, p.y, b);
    }
  }

  drawFarmArea();
  if (state.bridgeBuilt) drawBridge();
  drawHouseExterior();
  drawNpcHomes2D();
  drawInteractionPOIs();
  if (state.debugPaths) drawNpcPaths2D();

  const horizon = Math.min(canvas.width, canvas.height) * 0.52;
  const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, horizon * 0.82, canvas.width / 2, canvas.height / 2, horizon * 1.25);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(1, "rgba(9,14,23,0.46)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawNpcHomes2D() {
  NPC_HOMES.forEach((h) => {
    const p = worldToScreen(h.x, h.y);
    const sx = p.x - 28;
    const sy = p.y - 34;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(sx, sy, 56, 42);
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(sx - 4, sy);
    ctx.lineTo(sx + 28, sy - 18);
    ctx.lineTo(sx + 60, sy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#334155';
    ctx.fillRect(sx + 22, sy + 20, 12, 22);
  });
}

function drawNpcPaths2D() {
  ctx.save();
  ctx.strokeStyle = 'rgba(37, 99, 235, 0.9)';
  ctx.lineWidth = 2;
  state.npcs.forEach((n) => {
    if (!n.path || n.pathIndex >= n.path.length) return;
    const start = worldToScreen(n.x, n.y);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    for (let i = n.pathIndex; i < n.path.length; i += 1) {
      const node = n.path[i];
      const wx = node.gx * TILE + TILE * 0.5;
      const wy = node.gy * TILE + TILE * 0.5;
      const p = worldToScreen(wx, wy);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    if (n.target) {
      const tp = worldToScreen(n.target.x, n.target.y);
      ctx.fillStyle = 'rgba(14,165,233,0.92)';
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.fillText(`${n.name}:${n.state}`, tp.x + 6, tp.y - 6);
    }
  });
  ctx.restore();
}

function drawInteractionPOIs() {
  // TODO(v2.3-visual): high-contrast POI pictograms (no blank dot fallback)
  const pois = [
    { p: FOUNTAIN, icon: '⛲' },
    { p: CAMPFIRE, icon: '🔥' },
    { p: LOOKOUT, icon: '🔭' },
    { p: PIER, icon: '🎣' },
  ];
  pois.forEach(({ p, icon }) => {
    const sp = worldToScreen(p.x, p.y);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(sp.x - 16, sp.y - 34, 32, 20);
    ctx.fillStyle = '#0f172a';
    ctx.fillText(icon, sp.x - 7, sp.y - 20);
  });
}


function getTileColor(biome) {
  if (biome === 'water') return '#5fa6f4';
  if (biome === 'grove') return '#5ca663';
  if (biome === 'meadow') return '#7fd26f';
  return '#70be67';
}

function drawTile2D(x, y, biome) {
  const atlas = spriteAtlas.tiles;
  const tileMap = {
    water: { tx: 0, ty: 0 },
    grass: { tx: 1, ty: 0 },
    grove: { tx: 2, ty: 0 },
    meadow: { tx: 3, ty: 0 },
  };
  const t = tileMap[biome] || tileMap.grass;
  const ok = atlas.loaded && drawSprite(
    ctx,
    atlas.img,
    t.tx * SPRITE_CELL,
    t.ty * SPRITE_CELL,
    SPRITE_CELL,
    SPRITE_CELL,
    x,
    y,
    TILE + 1,
    TILE + 1,
  );
  if (!ok) {
    ctx.fillStyle = getTileColor(biome);
    ctx.fillRect(x, y, TILE + 1, TILE + 1);
  }
}

function drawTile3D(x, y, biome) {
  const h = biome === 'water' ? 5 : biome === 'grove' ? 16 : biome === 'meadow' ? 12 : 10;
  const baseColor = getTileColor(biome);
  ctx.fillStyle = baseColor;
  ctx.fillRect(x, y - h, TILE + 1, TILE + 1);

  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(x, y + TILE - h, TILE + 1, h);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(x, y - h, TILE + 1, 6);
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
    // TODO(v2.3-visual): crop growth readability (stage icon ladder)
    const icon = c.stage >= 3 ? '🌸' : c.stage === 2 ? '🍀' : c.stage === 1 ? '🌿' : '🌱';
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

  drawCharacterScreen(state.house.interiorPlayer.x, state.house.interiorPlayer.y, '#3b82f6', state.player.facing, 'player', state.keys.size ? 0.1 : 0);
}

function drawResource(o) {
  const p = worldToScreen(o.x, o.y + Math.sin(state.time * 0.05 + o.bob) * 2);
  if (p.x < -20 || p.y < -20 || p.x > canvas.width + 20 || p.y > canvas.height + 20) return;

  const atlas = spriteAtlas.items;
  const itemMap = {
    wood: { tx: 0, ty: 0 },
    flower: { tx: 1, ty: 0 },
    berry: { tx: 2, ty: 0 },
    shell: { tx: 3, ty: 0 },
    fish: { tx: 4, ty: 0 },
    bug: { tx: 5, ty: 0 },
    seed: { tx: 6, ty: 0 },
    furniture: { tx: 7, ty: 0 },
  };
  const t = itemMap[o.type];
  const iconSize = 22;
  const ok = t && atlas.loaded && drawSprite(
    ctx,
    atlas.img,
    t.tx * SPRITE_CELL,
    t.ty * SPRITE_CELL,
    SPRITE_CELL,
    SPRITE_CELL,
    p.x - iconSize / 2,
    p.y - iconSize / 2,
    iconSize,
    iconSize,
  );
  if (!ok) {
    const emoji = ITEMS.find(([k]) => k === o.type)?.[1] || '•';
    ctx.fillText(emoji, p.x - 8, p.y + 6);
  }
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

function drawCharacter(x, y, color, facing = 'down', charKey = 'player', velocity = 0) {
  const p = worldToScreen(x, y);
  drawCharacterScreen(p.x, p.y, color, facing, charKey, velocity);
}

function drawCharacterScreen(x, y, color, facing = 'down', charKey = 'player', velocity = 0) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y + 16, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  const atlas = spriteAtlas.characters;
  const facingRow = { down: 0, left: 1, right: 2, up: 3 };
  const charColBase = { player: 0, luna: 4, bomi: 8, maru: 12, nari: 16, toto: 20, pipi: 24 };
  const row = facingRow[facing] ?? 0;
  const moving = velocity > 0.04;
  const walk = moving ? Math.floor((state.time / 12) % 4) : 0;
  const col = (charColBase[charKey] ?? 0) + walk;
  const sw = SPRITE_CELL;
  const sh = SPRITE_CELL;
  const dw = sw * SPRITE_SCALE;
  const dh = sh * SPRITE_SCALE;

  const ok = atlas.loaded && drawSprite(
    ctx,
    atlas.img,
    col * sw,
    row * sh,
    sw,
    sh,
    x - dw / 2,
    y - dh * 0.78,
    dw,
    dh,
  );

  if (!ok) {
    ctx.fillStyle = color;
    ctx.fillRect(x - 9, y - 6, 18, 23);
    ctx.fillStyle = '#ffedd5';
    ctx.beginPath();
    ctx.arc(x, y - 12, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#111827';
    if (facing === 'left') ctx.fillRect(x - 8, y - 13, 2, 2);
    if (facing === 'right') ctx.fillRect(x + 6, y - 13, 2, 2);
    if (facing === 'down') { ctx.fillRect(x - 5, y - 13, 2, 2); ctx.fillRect(x + 3, y - 13, 2, 2); }
  }
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
    drawCharacter(n.x, n.y, n.color, n.facing || 'down', n.id, Math.hypot(n.vx || 0, n.vy || 0));
    drawSpeechBubble(n, n.talk);
  });
  drawCharacter(state.player.x, state.player.y, '#2563eb', state.player.facing, 'player', state.keys.size ? 0.1 : 0);
  if (state.dialogue) drawDialogueChoices();
}

function facingTo(a, b) {
  if (Math.abs(a.x - b.x) > Math.abs(a.y - b.y)) return a.x < b.x ? 'right' : 'left';
  return a.y < b.y ? 'down' : 'up';
}

function facingToYaw(facing = 'down') {
  if (facing === 'up') return Math.PI;
  if (facing === 'left') return Math.PI * 0.5;
  if (facing === 'right') return -Math.PI * 0.5;
  return 0;
}

function updateCamera() {
  state.camera.x = wrapAxis(state.player.x, WORLD_W);
  state.camera.y = wrapAxis(state.player.y, WORLD_H);
}

function updateFish() {
  state.fishes.forEach((f) => {
    f.x += f.spd * f.dir;
    if (f.x < (WATER.x1 + 1) * TILE || f.x > (WATER.x2 - 1) * TILE) f.dir *= -1;
  });
}

function getDayProgress() {
  return (state.time % 2600) / 2600;
}

function getDaySlot() {
  const p = getDayProgress();
  if (p < 0.25) return 'morning';
  if (p < 0.5) return 'noon';
  if (p < 0.75) return 'evening';
  return 'night';
}

function pickWeighted(weightMap, fallback = null) {
  const entries = Object.entries(weightMap || {});
  if (!entries.length) return fallback;
  const sum = entries.reduce((acc, [, v]) => acc + Math.max(0, v), 0);
  if (sum <= 0) return fallback || entries[0][0];
  let r = Math.random() * sum;
  for (const [k, v] of entries) {
    r -= Math.max(0, v);
    if (r <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

function npcScheduledState(npc) {
  const rainy = state.weather === 'rainy';
  const slot = getDaySlot();
  const routine = NPC_ROUTINES[slot] || NPC_ROUTINES.noon;
  const trait = npc.traits || {};

  if (npc.routineSlot !== slot) {
    npc.routineSlot = slot;
    npc.target = null;
  }

  const stateWeight = { ...routine.stateWeight };
  if (trait.poi?.includes('farm')) stateWeight.farm = (stateWeight.farm || 0) + 0.14;
  if (trait.poi?.includes('pier') || trait.poi?.includes('water')) stateWeight.fish = (stateWeight.fish || 0) + 0.18;
  if (trait.poi?.includes('fountain')) stateWeight.social = (stateWeight.social || 0) + 0.12;

  if (npc.id === 'maru') stateWeight.fish = (stateWeight.fish || 0) + 0.22;
  if (npc.id === 'bomi' && slot === 'noon') stateWeight.farm = (stateWeight.farm || 0) + 0.3;
  if (npc.id === 'bomi' && slot === 'evening') stateWeight.social = (stateWeight.social || 0) + 0.22;
  if (npc.id === 'luna' && slot !== 'night') stateWeight.social = (stateWeight.social || 0) + 0.16;

  if (rainy) {
    const homeBias = clamp((trait.rainyHomeBias || 0.35) * 0.9, 0, 0.95);
    stateWeight.idle = (stateWeight.idle || 0.1) + homeBias;
    stateWeight.wander = Math.max(0.05, (stateWeight.wander || 0.1) - homeBias * 0.35);
    if (npc.id !== 'maru') stateWeight.fish = Math.max(0, (stateWeight.fish || 0) - homeBias * 0.5);
  }

  const picked = pickWeighted(stateWeight, npc.state || 'wander');
  if (npc.id !== 'maru' && picked === 'fish') return 'wander';
  return picked;
}

function pushRecentTalk(npc, line) {
  if (!line) return;
  if (!Array.isArray(npc.recentTalks)) npc.recentTalks = [];
  npc.recentTalks.unshift(line);
  npc.recentTalks = npc.recentTalks.slice(0, 6);
}

function setNpcTalk(npc, line, duration = 80) {
  if (!line) return;
  if (npc.recentTalks?.includes(line)) return;
  npc.talk = line;
  npc.talkTimer = duration;
  pushRecentTalk(npc, line);
}

function pickPoiTarget(npc, poiKey) {
  const poi = NPC_POI_POINTS[poiKey];
  if (!poi) return null;
  const ring = poiKey === 'farm' ? 55 : poiKey === 'pier' ? 70 : 86;
  for (let i = 0; i < 14; i += 1) {
    const cand = {
      x: wrapAxis(poi.x + rnd(-ring, ring), WORLD_W),
      y: wrapAxis(poi.y + rnd(-ring, ring), WORLD_H),
    };
    if (poiKey === 'pier' || poiKey === 'water') {
      const near = nearWaterEdge(cand.x, cand.y) || tileAt(cand.x, cand.y).b === 'water';
      if (near) return cand;
    } else if (tileAt(cand.x, cand.y).b !== 'water' && isWalkable(cand.x, cand.y)) {
      return cand;
    }
  }
  return null;
}


let navCache = { key: '', grid: null };

function buildNavGrid() {
  const grid = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => false));
  for (let gy = 0; gy < MAP_H; gy += 1) {
    for (let gx = 0; gx < MAP_W; gx += 1) {
      const isWater = biomes[gy]?.[gx] === 'water';
      const bridgeWalk = state.bridgeBuilt && gy === BRIDGE.y && gx >= BRIDGE.x1 && gx <= BRIDGE.x2;
      grid[gy][gx] = !isWater || bridgeWalk;
    }
  }
  return grid;
}

function getNavGrid() {
  const key = `${state.bridgeBuilt ? 1 : 0}`;
  if (navCache.key !== key || !navCache.grid) {
    navCache = { key, grid: buildNavGrid() };
  }
  return navCache.grid;
}

function astar(start, goal, grid) {
  const keyOf = (gx, gy) => `${gx},${gy}`;
  const h = (gx, gy) => Math.abs(gx - goal.gx) + Math.abs(gy - goal.gy);
  const open = [{ gx: start.gx, gy: start.gy, f: h(start.gx, start.gy), g: 0 }];
  const came = new Map();
  const gScore = new Map([[keyOf(start.gx, start.gy), 0]]);
  const closed = new Set();

  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift();
    const curKey = keyOf(cur.gx, cur.gy);
    if (closed.has(curKey)) continue;
    if (cur.gx === goal.gx && cur.gy === goal.gy) {
      const path = [{ gx: cur.gx, gy: cur.gy }];
      let stepKey = curKey;
      while (came.has(stepKey)) {
        const prev = came.get(stepKey);
        path.push({ gx: prev.gx, gy: prev.gy });
        stepKey = keyOf(prev.gx, prev.gy);
      }
      return path.reverse();
    }

    closed.add(curKey);
    const neigh = [
      { gx: wrapAxis(cur.gx + 1, MAP_W), gy: cur.gy },
      { gx: wrapAxis(cur.gx - 1, MAP_W), gy: cur.gy },
      { gx: cur.gx, gy: wrapAxis(cur.gy + 1, MAP_H) },
      { gx: cur.gx, gy: wrapAxis(cur.gy - 1, MAP_H) },
    ];

    for (const nb of neigh) {
      if (!grid[nb.gy]?.[nb.gx]) continue;
      const nk = keyOf(nb.gx, nb.gy);
      const tentative = (gScore.get(curKey) ?? Infinity) + 1;
      if (tentative < (gScore.get(nk) ?? Infinity)) {
        came.set(nk, { gx: cur.gx, gy: cur.gy });
        gScore.set(nk, tentative);
        open.push({ gx: nb.gx, gy: nb.gy, g: tentative, f: tentative + h(nb.gx, nb.gy) });
      }
    }
  }
  return null;
}

function setNpcPathToTarget(npc) {
  if (!npc.target) return false;
  const grid = getNavGrid();
  const s = tileAt(npc.x, npc.y);
  const g = tileAt(npc.target.x, npc.target.y);
  const path = astar({ gx: s.gx, gy: s.gy }, { gx: g.gx, gy: g.gy }, grid);
  if (!path || path.length === 0) {
    npc.path = null;
    npc.pathIndex = 0;
    return false;
  }
  npc.path = path;
  npc.pathIndex = Math.min(1, path.length - 1);
  return true;
}

function markPoiVisit(npc, key) {
  if (npc.poiVisitDay !== state.day) {
    npc.poiVisitDay = state.day;
    npc.poiVisitsToday = 0;
    npc.visitedPoiToday = {};
  }
  if (!npc.visitedPoiToday[key]) {
    npc.visitedPoiToday[key] = true;
    npc.poiVisitsToday += 1;
  }
}

function pickLandTarget(npc, stateName = 'wander') {
  const centers = [
    { x: npc.home.x, y: npc.home.y + 38 },
    NPC_POI_POINTS.house,
    NPC_POI_POINTS.farm,
    NPC_POI_POINTS.shop,
    NPC_POI_POINTS.museum,
    NPC_POI_POINTS.fountain,
    NPC_POI_POINTS.campfire,
    NPC_POI_POINTS.lookout,
  ];

  const traitPois = npc.traits?.poi || [];
  for (const poiKey of traitPois) {
    if (poiKey !== 'pier' && poiKey !== 'water') {
      const p = pickPoiTarget(npc, poiKey);
      if (p && Math.random() < 0.52) return p;
    }
  }

  const ring = stateName === 'idle' ? 28 : stateName === 'social' ? 90 : stateName === 'farm' ? 64 : 280;
  for (let i = 0; i < 18; i += 1) {
    const c = centers[(i + state.day + npc.name.length) % centers.length];
    const cand = {
      x: wrapAxis(c.x + rnd(-ring, ring), WORLD_W),
      y: wrapAxis(c.y + rnd(-ring, ring), WORLD_H),
    };
    if (tileAt(cand.x, cand.y).b !== 'water' && isWalkable(cand.x, cand.y)) return cand;
  }

  return { x: npc.home.x, y: npc.home.y + 36 };
}

function chooseNpcTargetByState(npc, stateName) {
  const p = getDayProgress();
  const rainy = state.weather === 'rainy';

  if (npc.poiVisitDay !== state.day) {
    npc.poiVisitDay = state.day;
    npc.poiVisitsToday = 0;
    npc.visitedPoiToday = {};
  }

  const slot = getDaySlot();
  const routine = NPC_ROUTINES[slot] || NPC_ROUTINES.noon;
  const mustVisitPoiSoon = npc.poiVisitsToday < 1 && p > 0.58;

  const poiWeight = { ...(routine.poiWeight || {}) };
  (npc.traits?.poi || []).forEach((k, idx) => {
    if (!poiWeight[k]) poiWeight[k] = 0;
    poiWeight[k] += 0.22 - idx * 0.03;
  });
  if (rainy) {
    const rb = (npc.traits?.rainyHomeBias || 0.3) * 1.2;
    poiWeight.house = (poiWeight.house || 0) + rb;
    poiWeight.campfire = (poiWeight.campfire || 0) + rb * 0.24;
    poiWeight.pier = Math.max(0, (poiWeight.pier || 0) - rb * 0.45);
    poiWeight.lookout = Math.max(0, (poiWeight.lookout || 0) - rb * 0.2);
  }
  if (stateName === 'fish') {
    if (npc.id === 'maru' && Math.random() < 0.6) {
      const pier = pickPoiTarget(npc, 'pier');
      if (pier && tileAt(pier.x, pier.y).b !== 'water') return { target: pier, poiKey: 'pier' };
    }
    for (let i = 0; i < 16; i += 1) {
      const cand = {
        x: rnd((WATER.x1 + 1) * TILE, (WATER.x2 - 1) * TILE),
        y: rnd((WATER.y1 + 1) * TILE, (WATER.y2 - 1) * TILE),
      };
      if (nearWaterEdge(cand.x, cand.y) && tileAt(cand.x, cand.y).b !== 'water') {
        return { target: cand, poiKey: 'water' };
      }
    }
    return { target: pickLandTarget(npc, 'wander'), poiKey: 'water' };
  }

  if (!mustVisitPoiSoon && Math.random() < 0.72) {
    const poiKey = pickWeighted(poiWeight, null);
    if (poiKey) {
      const pickedPoi = pickPoiTarget(npc, poiKey);
      if (pickedPoi && (poiKey === 'pier' || poiKey === 'water' || tileAt(pickedPoi.x, pickedPoi.y).b !== 'water')) {
        return { target: pickedPoi, poiKey };
      }
    }
  }

  if (mustVisitPoiSoon) {
    const ordered = (npc.traits?.poi || ['fountain', 'house', 'farm']).filter((k) => k !== 'water' && k !== 'pier');
    for (const poiKey of ordered) {
      if (!npc.visitedPoiToday[poiKey]) {
        const t = pickPoiTarget(npc, poiKey);
        if (t) return { target: t, poiKey };
      }
    }
  }

  if (npc.id === 'luna' && rainy) {
    return { target: pickLandTarget(npc, 'idle'), poiKey: 'house' };
  }
  if (npc.id === 'bomi' && stateName === 'farm') {
    const farm = pickPoiTarget(npc, 'farm');
    if (farm) return { target: farm, poiKey: 'farm' };
  }
  if (npc.id === 'bomi' && stateName === 'social' && p > 0.72) {
    const fire = pickPoiTarget(npc, 'campfire');
    if (fire) return { target: fire, poiKey: 'campfire' };
  }

  if (stateName === 'social' && Math.random() < (npc.traits?.socialBias || 0.45)) {
    const others = state.npcs.filter((x) => x !== npc);
    if (others.length) {
      const mate = others[(state.day + Math.floor(state.time / 90) + npc.name.length) % others.length];
      return {
        target: pickLandTarget({ ...npc, home: { x: mate.x, y: mate.y } }, 'social'),
        mate,
      };
    }
  }

  return { target: pickLandTarget(npc, stateName) };
}


function chooseGestureForNpc(npc) {
  if (npc.state === 'fish' && (dist(npc, PIER) < 110 || nearWaterEdge(npc.x, npc.y))) return 'fishPose';
  if (npc.state === 'social' && dist(npc, FOUNTAIN) < 120) return Math.random() < 0.5 ? 'clap' : 'wave';
  if (npc.state === 'social' && dist(npc, CAMPFIRE) < 120) return Math.random() < 0.45 ? 'sit' : 'wave';
  if (npc.state === 'idle') {
    const pool = ['nod', 'stretch', 'wave'];
    if (dist(npc, CAMPFIRE) < 110) pool.push('sit');
    return pool[Math.floor(Math.random() * pool.length)];
  }
  return 'idle';
}

function spawnNpcReactionEffect(npc, kind = 'heart') {
  if (!render3d.ready || !render3d.world) return;
  if (!render3d.fxGroup) {
    render3d.fxGroup = new THREE.Group();
    render3d.world.add(render3d.fxGroup);
  }
  const color = kind === 'heart' ? '#fb7185' : '#fef08a';
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
  for (let i = 0; i < 7; i += 1) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.06 + Math.random() * 0.03, 8, 8), mat.clone());
    mesh.position.set(npc.x / TILE - MAP_W / 2 + rnd(-0.2, 0.2), 2.0 + rnd(0, 0.35), npc.y / TILE - MAP_H / 2 + rnd(-0.2, 0.2));
    render3d.fxGroup.add(mesh);
    render3d.fxParticles.push({ mesh, vy: 0.012 + Math.random() * 0.01, vx: rnd(-0.004, 0.004), vz: rnd(-0.004, 0.004), life: 60 });
  }
}

function updateNPCs() {
  state.npcs.forEach((n) => {
    if (n.pause) return;
    const prevState = n.state;
    n.state = npcScheduledState(n);
    if (n.id !== 'maru' && n.state === 'fish') n.state = 'wander';
    if (n.talkTimer > 0) n.talkTimer -= 1;
    if (n.actionTimer > 0) n.actionTimer -= 1;
    if (n.gestureTimer > 0) n.gestureTimer -= 1;

    if (prevState !== n.state || n.gestureTimer <= 0) {
      n.gesture = chooseGestureForNpc(n);
      n.gestureTimer = 45 + Math.floor(Math.random() * 80);
    }

    const needNewTarget = !n.target || dist(n, n.target) < 20;
    if (needNewTarget) {
      let pick = chooseNpcTargetByState(n, n.state);
      n.target = pick.target;
      if (pick.poiKey) markPoiVisit(n, pick.poiKey);
      if (!setNpcPathToTarget(n)) {
        pick = { target: pickLandTarget(n, 'wander') };
        n.target = pick.target;
        setNpcPathToTarget(n);
      }
      if (pick.mate && n.state === 'social') {
        setNpcTalk(n, `${pick.mate.name} 어디 갔지? 같이 얘기하자!`, 72);
      }
      n.stuckFrames = 0;
      n.stuckTimer = 0;

      if (n.state === 'farm' && Math.random() < 0.45) n.actionTimer = 60 + Math.floor(Math.random() * 70);
      if (n.state === 'idle' && Math.random() < 0.35) n.actionTimer = 24 + Math.floor(Math.random() * 50);
      if (n.state === 'fish' && Math.random() < 0.4) n.actionTimer = 35 + Math.floor(Math.random() * 50);
    }

    if (n.id !== 'maru' && n.target && tileAt(n.target.x, n.target.y).b === 'water') {
      n.target = pickLandTarget(n, n.state);
      setNpcPathToTarget(n);
      n.stuckFrames = 0;
      n.stuckTimer = 0;
    }

    let wx = n.target?.x ?? n.x;
    let wy = n.target?.y ?? n.y;
    if (n.path && n.path.length > 0 && n.pathIndex < n.path.length) {
      const node = n.path[n.pathIndex];
      wx = node.gx * TILE + TILE * 0.5;
      wy = node.gy * TILE + TILE * 0.5;
    }

    const dx = circularDelta(wx, n.x, WORLD_W);
    const dy = circularDelta(wy, n.y, WORLD_H);
    const d = Math.hypot(dx, dy);

    if (d < 12 && n.path && n.pathIndex < n.path.length - 1) n.pathIndex += 1;

    if (d > 1) {
      const baseSpd = n.state === 'idle' ? 0.62 : n.state === 'social' ? 1.05 : 1.15;
      const spd = n.actionTimer > 0 ? 0.08 : baseSpd;
      const nx = n.x + (dx / Math.max(d, 0.0001)) * spd;
      const ny = n.y + (dy / Math.max(d, 0.0001)) * spd;
      const walkable = isWalkable(nx, ny) || (n.state === 'fish' && nearWaterEdge(nx, ny));

      if (walkable) {
        n.vx = nx - n.x;
        n.vy = ny - n.y;
        n.x = wrapAxis(nx, WORLD_W);
        n.y = wrapAxis(ny, WORLD_H);
      } else {
        n.vx = 0;
        n.vy = 0;
      }
      n.facing = facingTo(n, { x: wx, y: wy });

      const moved = Math.hypot(n.vx, n.vy);
      if (d > 26 && moved < 0.05) {
        n.stuckFrames += 1;
        n.stuckTimer += 1;
      } else {
        n.stuckFrames = 0;
        n.stuckTimer = 0;
      }

      if (n.stuckTimer > 120) {
        if (!setNpcPathToTarget(n)) {
          const repick = chooseNpcTargetByState(n, n.state);
          n.target = repick.target;
          setNpcPathToTarget(n);
        }
        n.gesture = 'stretch';
        n.gestureTimer = 50;
        n.stuckFrames = 0;
        n.stuckTimer = 0;
      }
    } else {
      n.vx = 0;
      n.vy = 0;
      n.stuckFrames = 0;
      n.stuckTimer = 0;
    }

    if (n.id !== 'maru' && tileAt(n.x, n.y).b === 'water') {
      n.x = n.home.x + rnd(-40, 40);
      n.y = n.home.y + rnd(24, 72);
      n.target = pickLandTarget(n, 'idle');
      setNpcPathToTarget(n);
      n.vx = 0;
      n.vy = 0;
      n.stuckFrames = 0;
      n.stuckTimer = 0;
      n.talk = '물은 싫어! 뭍으로 돌아왔어.';
      n.talkTimer = 60;
      n.gesture = 'wave';
      n.gestureTimer = 50;
    }

    const rel = state.relationships[n.id] || 0;
    const nearPlayer = dist(state.player, n) < 100;
    if (nearPlayer && n.talkTimer <= 0) {
      const emo = rel > 75 ? '😊' : rel < 35 ? '😶' : '🙂';
      const weatherHint = state.weather === 'rainy'
        ? (n.id === 'maru' ? '비 오는 날 낚시는 손맛이 좋아!' : '비 피해서 천천히 걷는 중이야.')
        : (n.state === 'social' ? '수다 떨기 딱 좋은 날이야.' : '오늘도 마을을 돌보는 중!');
      setNpcTalk(n, `E로 대화! ${emo} ${weatherHint} (호감 ${rel})`, 54);
    } else if (!nearPlayer && n.talkTimer <= 0) {
      const since = state.time - (n.lastMutterAt || 0);
      if (since > (n.nextMutterGap || 220) && Math.random() < 0.16) {
        const mutters = [
          '오늘 동선 괜찮네.',
          '여기 바람이 좋다.',
          state.weather === 'rainy' ? '빗소리 들으니 마음이 차분해.' : '해가 좋아서 산책하기 딱이야.',
          n.state === 'farm' ? '작물이 잘 자라길!' : '조금만 더 둘러보고 쉬어야지.',
          n.id === 'maru' ? '피어 쪽에서 물고기 그림자 봤어.' : '다음엔 어디로 가볼까?',
        ];
        const line = mutters[(state.day + n.name.length + Math.floor(state.time / 140)) % mutters.length];
        if (!n.recentTalks?.includes(line)) {
          setNpcTalk(n, line, 70);
          n.lastMutterAt = state.time;
          n.nextMutterGap = 180 + Math.floor(Math.random() * 180);
        }
      }
    }
  });
}

function collectResources() {
  state.objects = state.objects.filter((o) => {
    const pickupR = o.type === 'shell' ? 34 : 22;
    if (dist(state.player, o) < pickupR) {
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
    const mul = 1 + Math.max(0, state.buffs.harvest * 0.5);
    state.inv.flower += Math.round(2 * mul);
    state.inv.berry += Math.round(1 * mul);
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
      state.inv.fish += 1 + (state.buffs.fish > 1 ? 1 : 0);
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
      spawnNpcReactionEffect(n, 'spark');
      state.relationships[n.id] = clamp((state.relationships[n.id] || 0) + 8, 0, 100);
      setMsg(`퀘스트 완료! 코인 +${q.reward}`);
      addLog(`퀘스트 완료: ${q.title}`);
    } else {
      n.mood = clamp(n.mood + 4, 0, 100);
      state.relationships[n.id] = clamp((state.relationships[n.id] || 0) + 2, 0, 100);
      n.talk = getDialogueLine(n);
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
    } else {
      const barter = tryNpcBarter(n);
      if (barter.ok) {
        n.talk = getDialogueLine(n);
        setMsg(barter.msg);
        spawnNpcReactionEffect(n, 'heart');
      } else if (state.inv.berry > 0) {
        state.inv.berry -= 1;
        n.mood = clamp(n.mood + 10, 0, 100);
        state.relationships[n.id] = clamp((state.relationships[n.id] || 0) + 4, 0, 100);
        n.talk = '열매 선물 고마워!';
        spawnNpcReactionEffect(n, 'heart');
        setMsg('선물 성공! 호감도 상승');
      } else {
        const tip = req ? `오늘 요청: ${req.item} ${req.need} / 교환 재료도 확인해보세요.` : barter.msg;
        setMsg(tip);
      }
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
    state.house.interiorPlayer = { x: canvas.width / 2, y: canvas.height - 110 };
    state.player.facing = 'up';
    setMsg('집 안으로 들어왔습니다. 이동 가능: WASD/방향키 · F 배치 · IJKL/T/Tab 편집');
    return;
  }

  const shopDoor = { x: SHOP_PLOT.x + 92, y: SHOP_PLOT.y + 102 };
  const museumDoor = { x: MUSEUM_PLOT.x + 106, y: MUSEUM_PLOT.y + 110 };
  if (dist(state.player, shopDoor) < 58) {
    openShop();
    setMsg('상점에 입장했습니다.');
    return;
  }
  if (dist(state.player, museumDoor) < 62) {
    openMuseum();
    setMsg('박물관 접수대로 이동했습니다.');
    return;
  }

  const oncePerDay = (key) => {
    if (state.interactionFlags[key] === state.day) return false;
    state.interactionFlags[key] = state.day;
    return true;
  };

  if (dist(state.player, FOUNTAIN) < 72 && oncePerDay('fountain')) {
    state.player.mood = clamp(state.player.mood + 14, 0, 100);
    state.buffs.discount = clamp(state.buffs.discount + 1, 0, 3);
    return setMsg('분수의 축복! 기분+할인 버프 획득');
  }
  if (dist(state.player, CAMPFIRE) < 78 && oncePerDay('campfire')) {
    state.player.energy = clamp(state.player.energy + 20, 0, 100);
    state.player.mood = clamp(state.player.mood + 10, 0, 100);
    return setMsg('모닥불 휴식 완료! 에너지/기분 회복');
  }
  if (dist(state.player, LOOKOUT) < 74 && oncePerDay('lookout')) {
    state.xp += 24;
    state.coins += 18;
    return setMsg('전망대 탐색 보상! XP+24, 코인+18');
  }
  if (dist(state.player, PIER) < 76 && oncePerDay('pier')) {
    state.buffs.fish = clamp(state.buffs.fish + 1, 0, 3);
    return setMsg('피어 포인트 발견! 오늘 낚시 보정 상승');
  }

  const nearest = state.npcs.map((n) => ({ n, d: dist(state.player, n) })).sort((a, b) => a.d - b.d)[0];
  if (nearest && nearest.d < 80) {
    const n = nearest.n;
    state.player.pause = true;
    n.pause = true;
    state.player.facing = facingTo(state.player, n);
    n.facing = facingTo(n, state.player);
    n.talk = getDialogueLine(n);
    state.dialogue = { npc: n, a: '잡담/퀘스트 전달', b: '요청/물물교환/선물' };
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
  const d = Math.max(0, state.buffs.discount);
  const discounted = (p) => Math.max(1, Math.floor(p * (1 - d * 0.08)));
  const html = `
  <div class="shop-item"><span>집 건축권 (${discounted(150)} 코인)</span><button data-shop="house">구매</button></div>
  <div class="shop-item"><span>집 업그레이드 (${discounted(250)} 코인)</span><button data-shop="upgrade">업그레이드</button></div>
  <div class="shop-item"><span>꽃씨 패키지 (${discounted(state.shopStock.seedpackPrice)} 코인)</span><button data-shop="seedpack">구매</button></div>
  <div class="shop-item"><span>프리미엄 씨앗 (${discounted(42)} 코인, seed+7)</span><button data-shop="seedpack2">구매</button></div>
  <div class="shop-item"><span>기성 가구 (${discounted(state.shopStock.furniturePrice)} 코인)</span><button data-shop="furniture">구매</button></div>
  <div class="shop-item"><span>디럭스 가구 (${discounted(88)} 코인, furniture+2)</span><button data-shop="furniture2">구매</button></div>
  <div class="shop-item"><span>미끼 박스 (${discounted(28)} 코인, 낚시 보정)</span><button data-shop="baitbox">구매</button></div>
  <div class="shop-item"><span>채집 장갑 (${discounted(24)} 코인, 곤충 보정)</span><button data-shop="bugkit">구매</button></div>
  <div class="shop-item"><span>수확 비료 (${discounted(30)} 코인, 수확 보정)</span><button data-shop="fertilizer">구매</button></div>
  <div class="shop-item"><span>에너지 드링크 (${discounted(18)} 코인)</span><button data-shop="energydrink">구매</button></div>
  <div class="shop-item"><span>무드 허브티 (${discounted(16)} 코인)</span><button data-shop="moodtea">구매</button></div>
  <div class="shop-item"><span>교환권 (${discounted(35)} 코인, 요청 리롤)</span><button data-shop="rerollrequest">구매</button></div>
  <div class="shop-item"><span>광고권 (${discounted(45)} 코인, 퀘스트 리롤)</span><button data-shop="rerollquest">구매</button></div>
  <div class="shop-item"><span>할인 스탬프 (${discounted(40)} 코인)</span><button data-shop="discountstamp">구매</button></div>
  <div class="shop-item"><span>날씨 부적(맑음) (${discounted(34)} 코인)</span><button data-shop="weatherclear">구매</button></div>
  <div class="shop-item"><span>날씨 부적(비) (${discounted(34)} 코인)</span><button data-shop="weatherrain">구매</button></div>
  <div class="shop-item"><span>박물관 패스 (${discounted(54)} 코인, 기증 보너스)</span><button data-shop="museumpass">구매</button></div>
  <div class="shop-item"><span>다리 보수 키트 (${discounted(48)} 코인)</span><button data-shop="bridgefix">구매</button></div>
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
  const barters = Object.entries(state.barterOffers)
    .slice(0, 3)
    .map(([id, b]) => `${id} ${b.give}x${b.giveAmt}→${b.take}x${b.takeAmt}`)
    .join(' / ');

  const html = `
  <div class="shop-item"><span>시즌</span><span>${SEASONS[state.season]}</span></div>
  <div class="shop-item"><span>텍스처 로드</span><span>${render3d.textureStats.loaded} 성공 / ${render3d.textureStats.failed} 실패</span></div>
  <div class="shop-item"><span>모델 로드</span><span>${render3d.modelStats.loaded} 성공 / ${render3d.modelStats.failed} 실패</span></div>
  <div class="shop-item"><span>현재 날짜</span><span>${state.day}일차</span></div>
  <div class="shop-item"><span>오늘 이벤트</span><span>${state.dailyEvent}</span></div>
  <div class="shop-item"><span>퀘스트</span><span>${state.questDone ? '완료/진행 전환 대기' : '진행 중'}</span></div>
  <div class="shop-item"><span style="font-weight:600">${questText}</span></div>
  <div class="shop-item"><span>상점 변동</span><span>매일 가격 변동</span></div>
  <div class="shop-item"><span>집 인테리어 점수</span><span>${state.decorScore}</span></div>
  <div class="shop-item"><span>주민 일일요청</span><span>${requests}</span></div>
  <div class="shop-item"><span>오늘의 물물교환</span><span>${barters || 'NPC와 대화해 확인'}</span></div>`;
  openModal('마을 보드', html);
}

function openWorldMap() {
  const size = 360;
  const toMap = (x, y) => ({ x: (wrapAxis(x, WORLD_W) / WORLD_W) * size, y: (wrapAxis(y, WORLD_H) / WORLD_H) * size });
  const center = size / 2;
  const radius = size * 0.48;

  const npcDots = state.npcs
    .map((n) => {
      const p = toMap(n.x, n.y);
      return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="${n.color}" /><text x="${(p.x + 6).toFixed(1)}" y="${(p.y + 3).toFixed(1)}" font-size="10" fill="#1e293b">${n.name}</text>`;
    })
    .join('');

  const homes = NPC_HOMES.map((h) => {
    const p = toMap(h.x, h.y);
    return `<rect x="${(p.x - 4).toFixed(1)}" y="${(p.y - 4).toFixed(1)}" width="8" height="8" fill="#f97316" />`;
  }).join('');

  const poiPoints = [
    { name: '내 집', pos: { x: HOUSE_PLOT.x, y: HOUSE_PLOT.y }, color: '#2563eb' },
    { name: '상점', pos: SHOP_PLOT, color: '#16a34a' },
    { name: '박물관', pos: MUSEUM_PLOT, color: '#7c3aed' },
    { name: '농장', pos: FARM, color: '#b45309' },
  ].map((poi) => {
    const p = toMap(poi.pos.x, poi.pos.y);
    return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5" fill="${poi.color}" /><text x="${(p.x + 8).toFixed(1)}" y="${(p.y + 3).toFixed(1)}" font-size="10" fill="#0f172a">${poi.name}</text>`;
  }).join('');

  const me = toMap(state.player.x, state.player.y);
  const mapSvg = `
    <svg viewBox="0 0 ${size} ${size}" class="map-svg" role="img" aria-label="월드 지도">
      <defs><clipPath id="globe"><circle cx="${center}" cy="${center}" r="${radius}"/></clipPath></defs>
      <rect width="${size}" height="${size}" fill="#dff7ea"/>
      <g clip-path="url(#globe)">
        <rect width="${size}" height="${size}" fill="#9fd39a"/>
        <rect x="${((WATER.x1 / MAP_W) * size).toFixed(1)}" y="${((WATER.y1 / MAP_H) * size).toFixed(1)}" width="${(((WATER.x2 - WATER.x1) / MAP_W) * size).toFixed(1)}" height="${(((WATER.y2 - WATER.y1) / MAP_H) * size).toFixed(1)}" fill="#63a7f9" rx="16"/>
        ${homes}
        ${poiPoints}
        ${npcDots}
        <circle cx="${me.x.toFixed(1)}" cy="${me.y.toFixed(1)}" r="5" fill="#ef4444"/>
      </g>
      <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="#0f172a" stroke-width="3"/>
      <text x="12" y="18" font-size="11" fill="#0f172a">🔄 토러스 월드: 가장자리 없이 계속 이어집니다</text>
    </svg>`;

  const html = `
    <div class="shop-item"><span>월드 규모</span><span>${MAP_W} x ${MAP_H} 타일</span></div>
    <div class="shop-item"><span>월드 형태</span><span>둥근 순환형 (끝없는 루프)</span></div>
    <div class="shop-item"><span>주민 주택 수</span><span>${NPC_HOMES.length}채 + 확장 여유</span></div>
    <div class="map-wrap">${mapSvg}</div>`;
  openModal('월드 지도', html);
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
  const discount = (p) => Math.max(1, Math.floor(p * (1 - Math.max(0, state.buffs.discount) * 0.08)));
  const spend = (cost) => {
    if (state.coins < cost) {
      setMsg('코인이 부족합니다.');
      return false;
    }
    state.coins -= cost;
    return true;
  };

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
        if (spend(discount(150))) { state.house.tier = 1; addLog('집 건축 완료'); setMsg('오두막 건축 완료! 문 앞에서 E로 입장.'); }
      }
      if (s === 'upgrade') {
        if (state.house.tier === 0) return setMsg('먼저 집을 구매하세요.');
        if (state.house.tier >= 2) return setMsg('최대 업그레이드입니다.');
        if (spend(discount(250))) { state.house.tier = 2; addLog('집 업그레이드 완료'); setMsg('집 업그레이드 완료!'); }
      }
      if (s === 'seedpack') {
        if (spend(discount(state.shopStock.seedpackPrice))) { state.inv.seed += 3; setMsg('꽃씨 패키지 구매 완료 (seed +3).'); }
      }
      if (s === 'seedpack2') {
        if (spend(discount(42))) { state.inv.seed += 7; state.xp += 8; setMsg('프리미엄 씨앗 구매 완료 (seed +7).'); }
      }
      if (s === 'furniture') {
        if (spend(discount(state.shopStock.furniturePrice))) { state.inv.furniture += 1; setMsg('기성 가구 구매 완료.'); }
      }
      if (s === 'furniture2') {
        if (spend(discount(88))) { state.inv.furniture += 2; state.decorScore = calcDecorScore(); setMsg('디럭스 가구 구매 완료 (furniture +2).'); }
      }
      if (s === 'baitbox') {
        if (spend(discount(28))) { state.buffs.fish = clamp(state.buffs.fish + 1, 0, 3); state.fishing.zoneWidth = clamp(state.fishing.zoneWidth + 0.03, 0.14, 0.38); setMsg('미끼 박스 사용! 오늘 낚시 보정 상승'); }
      }
      if (s === 'bugkit') {
        if (spend(discount(24))) { state.buffs.bug = clamp(state.buffs.bug + 1, 0, 3); setMsg('채집 장갑 장착! 곤충 채집 확률 상승'); }
      }
      if (s === 'fertilizer') {
        if (spend(discount(30))) { state.buffs.harvest = clamp(state.buffs.harvest + 1, 0, 3); setMsg('수확 비료 적용! 농사 수확량 상승'); }
      }
      if (s === 'energydrink') {
        if (spend(discount(18))) { state.player.energy = clamp(state.player.energy + 28, 0, 100); setMsg('에너지 회복!'); }
      }
      if (s === 'moodtea') {
        if (spend(discount(16))) { state.player.mood = clamp(state.player.mood + 24, 0, 100); setMsg('기분이 좋아졌어요!'); }
      }
      if (s === 'rerollrequest') {
        if (spend(discount(35))) { rollResidentRequests(); setMsg('주민 요청이 새로 갱신되었습니다.'); }
      }
      if (s === 'rerollquest') {
        if (spend(discount(45))) { state.questIndex = (state.questIndex + 1) % state.quests.length; state.questDone = false; setMsg(`퀘스트 리롤: ${state.quests[state.questIndex].title}`); }
      }
      if (s === 'discountstamp') {
        if (spend(discount(40))) { state.buffs.discount = clamp(state.buffs.discount + 1, 0, 3); setMsg('상점 할인 스탬프 적용!'); }
      }
      if (s === 'weatherclear') {
        if (spend(discount(34))) { state.weather = 'sunny'; setMsg('날씨가 맑아졌어요.'); }
      }
      if (s === 'weatherrain') {
        if (spend(discount(34))) { state.weather = 'rainy'; setMsg('비가 내리기 시작했어요.'); }
      }
      if (s === 'museumpass') {
        if (spend(discount(54))) { state.coins += 20; state.xp += 16; setMsg('박물관 패스 보너스: 코인 +20, XP +16'); }
      }
      if (s === 'bridgefix') {
        if (spend(discount(48))) { state.bridgeBuilt = true; setMsg('다리 보수가 완료되어 이동이 안정화되었습니다.'); }
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
  if (state.player.pause) return;

  let dx = 0;
  let dy = 0;
  const run = state.keys.has('Shift');
  const spd = (run ? 1.45 : 1) * (state.player.energy > 0 ? state.player.speed : 1.2);

  const up = state.keys.has('ArrowUp') || state.keys.has('w');
  const down = state.keys.has('ArrowDown') || state.keys.has('s');
  const left = state.keys.has('ArrowLeft') || state.keys.has('a');
  const right = state.keys.has('ArrowRight') || state.keys.has('d');

  if (state.renderMode === '3d' && !state.house.inside) {
    const fx = -Math.cos(state.camera3d.yaw);
    const fy = -Math.sin(state.camera3d.yaw);
    const rx = -fy;
    const ry = fx;

    if (up) { dx += fx * spd; dy += fy * spd; }
    if (down) { dx -= fx * spd; dy -= fy * spd; }
    if (left) { dx -= rx * spd; dy -= ry * spd; }
    if (right) { dx += rx * spd; dy += ry * spd; }
  } else {
    if (up) { dy -= spd; state.player.facing = 'up'; }
    if (down) { dy += spd; state.player.facing = 'down'; }
    if (left) { dx -= spd; state.player.facing = 'left'; }
    if (right) { dx += spd; state.player.facing = 'right'; }
  }

  if (state.house.inside) {
    const p = state.house.interiorPlayer;
    const nx = clamp(p.x + dx, 70, canvas.width - 70);
    const ny = clamp(p.y + dy, 96, canvas.height - 48);

    let blocked = false;
    state.house.furniture.forEach((f) => {
      const fx = 200 + f.gx * 80;
      const fy = 120 + f.gy * 70;
      if (nx > fx - 14 && nx < fx + 78 && ny > fy - 12 && ny < fy + 54) blocked = true;
    });

    if (!blocked) {
      p.x = nx;
      p.y = ny;
    }
  } else {
    const nx = wrapAxis(state.player.x + dx, WORLD_W);
    const ny = wrapAxis(state.player.y + dy, WORLD_H);
    if (isWalkable(nx, ny)) {
      state.player.x = nx; state.player.y = ny;
      if (tileAt(nx, ny).b !== 'water') { state.player.lastSafeX = nx; state.player.lastSafeY = ny; }
    } else if (tileAt(state.player.x, state.player.y).b === 'water' && !onBridge(state.player.x, state.player.y)) {
      state.player.x = state.player.lastSafeX;
      state.player.y = state.player.lastSafeY;
      setMsg('물이 너무 깊어요! 안전지대로 이동합니다.');
    }
  }

  if ((dx || dy) && state.renderMode === '3d' && !state.house.inside) {
    if (Math.abs(dx) > Math.abs(dy)) state.player.facing = dx > 0 ? 'right' : 'left';
    else state.player.facing = dy > 0 ? 'down' : 'up';
  }

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
    state.buffs = { fish: 0, bug: 0, harvest: 0, discount: 0 };
    state.interactionFlags = {};
    calcDailyShopStock();
    rollResidentRequests();
    rollDailyBarterOffers();
    state.npcs.forEach((n) => {
      n.poiVisitDay = state.day;
      n.poiVisitsToday = 0;
      n.visitedPoiToday = {};
    });
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


function createNoiseTexture(base = '#6fa86a', accent = '#4f7f49', size = 256, scale = 0.2) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < size * size * scale; i += 1) {
    const x = Math.floor(Math.random() * size);
    const y = Math.floor(Math.random() * size);
    const r = Math.floor(Math.random() * 3) + 1;
    g.fillStyle = Math.random() > 0.5 ? accent : 'rgba(255,255,255,0.08)';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18);
  tex.anisotropy = 8;
  return tex;
}

function markAssetStats(type, ok = true) {
  const key = ok ? 'loaded' : 'failed';
  if (type === 'texture') render3d.textureStats[key] += 1;
  if (type === 'model') render3d.modelStats[key] += 1;
}

function createRemoteTexture(urlOrUrls, repeat = [1, 1], fallbackColor = '#8aa08a') {
  const urls = Array.isArray(urlOrUrls) ? urlOrUrls : [urlOrUrls];
  const fallback = createNoiseTexture(fallbackColor, '#6d826d', 128, 0.12);
  fallback.wrapS = fallback.wrapT = THREE.RepeatWrapping;
  fallback.repeat.set(repeat[0], repeat[1]);
  const loader = new THREE.TextureLoader();

  const tryLoad = (idx = 0) => {
    if (idx >= urls.length) {
      markAssetStats('texture', false);
      return;
    }
    loader.load(
      urls[idx],
      (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeat[0], repeat[1]);
        tex.colorSpace = THREE.SRGBColorSpace;
        fallback.image = tex.image;
        fallback.needsUpdate = true;
        markAssetStats('texture', true);
      },
      undefined,
      () => tryLoad(idx + 1),
    );
  };

  tryLoad(0);
  return fallback;
}

function createPBRTextureSet(basePath, repeat = [1, 1], fallbackColor = '#8aa08a') {
  return {
    map: createRemoteTexture(`${basePath}_diff_1k.jpg`, repeat, fallbackColor),
    normalMap: createRemoteTexture(`${basePath}_nor_gl_1k.jpg`, repeat, '#7f7fff'),
    roughnessMap: createRemoteTexture(`${basePath}_rough_1k.jpg`, repeat, '#bcbcbc'),
  };
}

function createToonGradientTexture(steps = 5) {
  const c = document.createElement('canvas');
  c.width = steps;
  c.height = 1;
  const g = c.getContext('2d');
  for (let i = 0; i < steps; i += 1) {
    const v = Math.floor(40 + (i / Math.max(1, steps - 1)) * 215);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(i, 0, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

function createWaterNormalCanvasTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#7f7fff';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < size * 6; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 1 + Math.random() * 2;
    g.fillStyle = Math.random() > 0.5 ? 'rgba(120,120,255,0.45)' : 'rgba(170,170,255,0.25)';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  return t;
}

function addOutlineToObject(object3d, scale = 1.03, color = '#1e293b') {
  object3d.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    const outline = new THREE.Mesh(
      obj.geometry,
      new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, transparent: true, opacity: 0.7 }),
    );
    outline.scale.setScalar(scale);
    outline.renderOrder = -1;
    outline.userData.isOutline = true;
    obj.add(outline);
  });
}

function createWorldMaterials(style = state.renderStyle || 'pbr') {
  const isToon = style === 'toon';
  const generatedToonRamp = createToonGradientTexture(6);
  const toonGrad = createRemoteTexture([
    'assets/stylized/toon_ramp.png',
    generatedToonRamp.image.toDataURL('image/png'),
  ], [1, 1], '#b8b8b8');
  toonGrad.minFilter = THREE.NearestFilter;
  toonGrad.magFilter = THREE.NearestFilter;
  toonGrad.generateMipmaps = false;
  const generatedWaterNormal = createWaterNormalCanvasTexture(128);
  const waterNormal = createRemoteTexture([
    'assets/stylized/water_normal.png',
    generatedWaterNormal.image.toDataURL('image/png'),
    'https://threejs.org/examples/textures/waternormals.jpg',
  ], [6, 6], '#7f7fff');

  const grassPBR = {
    map: createRemoteTexture([
      'assets/stylized/grass_color.png',
      'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/forest_ground_04/forest_ground_04_diff_1k.jpg',
      'https://threejs.org/examples/textures/terrain/grasslight-big.jpg',
    ], [12, 12], '#7ba06a'),
    normalMap: createRemoteTexture([
      'assets/stylized/water_normal.png',
      'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/forest_ground_04/forest_ground_04_nor_gl_1k.jpg',
      'https://threejs.org/examples/textures/terrain/grasslight-big-nm.jpg',
    ], [12, 12], '#7f7fff'),
    roughnessMap: createRemoteTexture([
      'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/forest_ground_04/forest_ground_04_rough_1k.jpg',
      'https://threejs.org/examples/textures/terrain/grasslight-big.jpg',
    ], [12, 12], '#bcbcbc'),
  };

  const woodPBR = {
    map: createRemoteTexture([
      'assets/stylized/wood_color.png',
      'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rough_wood/rough_wood_diff_1k.jpg',
      'https://threejs.org/examples/textures/hardwood2_diffuse.jpg',
    ], [4, 4], '#7a6149'),
    normalMap: createRemoteTexture([
      'assets/stylized/water_normal.png',
      'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rough_wood/rough_wood_nor_gl_1k.jpg',
      'https://threejs.org/examples/textures/hardwood2_bump.jpg',
    ], [4, 4], '#7f7fff'),
    roughnessMap: createRemoteTexture([
      'assets/stylized/dirt_color.png',
      'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rough_wood/rough_wood_rough_1k.jpg',
      'https://threejs.org/examples/textures/hardwood2_roughness.jpg',
    ], [4, 4], '#bcbcbc'),
  };

  const make = (pbrOpts, toonColor) => (isToon
    ? new THREE.MeshToonMaterial({ color: toonColor, gradientMap: toonGrad })
    : new THREE.MeshStandardMaterial(pbrOpts));

  return {
    grass: make({ ...grassPBR, roughness: 0.88, metalness: 0.02 }, '#92d88f'),
    meadow: make({ map: createRemoteTexture(['assets/stylized/grass_color.png'], [12, 12], '#a9e7a0'), color: '#a9e7a0', roughness: 0.9, metalness: 0.01 }, '#a9e7a0'),
    grove: make({ map: createRemoteTexture(['assets/stylized/grass_color.png'], [12, 12], '#7dc37a'), color: '#7dc37a', roughness: 0.9, metalness: 0.01 }, '#7dc37a'),
    dirt: make({ map: createRemoteTexture(['assets/stylized/dirt_color.png'], [10, 10], '#b7a58d'), color: '#b7a58d', roughness: 0.96, metalness: 0.01 }, '#c5b5a3'),
    wood: make({ ...woodPBR, roughness: 0.72, metalness: 0.06 }, '#bc8f6e'),
    bark: make({ color: '#85654d', roughness: 0.92 }, '#85654d'),
    leaf: make({ color: '#8fd48f', roughness: 0.84 }, '#8fd48f'),
    water: isToon
      ? new THREE.MeshToonMaterial({ color: '#8fd7ea', gradientMap: toonGrad, transparent: true, opacity: 0.9 })
      : new THREE.MeshPhysicalMaterial({
        color: '#6bb7d6', roughness: 0.22, metalness: 0.04, transmission: 0.3, transparent: true, opacity: 0.92,
        normalMap: waterNormal, normalScale: new THREE.Vector2(0.35, 0.35),
      }),
    waterNormal,
    bridge: make({ ...woodPBR, roughness: 0.7, metalness: 0.05 }, '#b58d70'),
    wall: make({ color: '#f4eadf', roughness: 0.78 }, '#f6eee7'),
    roof: make({ map: createRemoteTexture(['assets/stylized/roof_color.png'], [4, 4], '#d49aa1'), color: '#d49aa1', roughness: 0.7 }, '#d49aa1'),
    npc: make({ color: '#f2b18d', roughness: 0.64 }, '#f2b18d'),
    player: make({ color: '#9cb8f6', roughness: 0.6 }, '#9cb8f6'),
    toonGradient: toonGrad,
    style,
  };
}

async function loadFreeWorldProps() {
  if (!render3d.world) return;

  const addFallbackProp = (geo, mat, pos, rot = 0, scale = 1) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.rotation.y = rot;
    mesh.scale.setScalar(scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    render3d.world.add(mesh);
    render3d.props.push(mesh);
    markAssetStats('model', true);
  };

  const fallbackPack = () => {
    const toon = state.renderStyle === 'toon';
    addFallbackProp(new THREE.ConeGeometry(0.42, 1.6, 8), toon ? new THREE.MeshToonMaterial({ color: '#5a8f53', gradientMap: render3d.mats?.toonGradient }) : new THREE.MeshStandardMaterial({ color: '#5a8f53', roughness: 0.9 }), [-10, 1.2, -6], 0.1, 1.2);
    addFallbackProp(new THREE.CylinderGeometry(0.14, 0.2, 1.0, 8), toon ? new THREE.MeshToonMaterial({ color: '#6d4c41', gradientMap: render3d.mats?.toonGradient }) : new THREE.MeshStandardMaterial({ color: '#6d4c41', roughness: 0.9 }), [-10, 0.5, -6], 0.1, 1.2);
    addFallbackProp(new THREE.BoxGeometry(1.2, 0.8, 0.8), toon ? new THREE.MeshToonMaterial({ color: '#f2c4a6', gradientMap: render3d.mats?.toonGradient }) : new THREE.MeshStandardMaterial({ color: '#f2c4a6', roughness: 0.72 }), [10, 0.45, -7], 0.4, 1.0);
  };

  const specs = [
    { url: `${render3d.modelRoot}/tree.glb`, pos: [-10, 0, -6], rotY: 0.4, scale: 1.4 },
    { url: `${render3d.modelRoot}/prop_house.glb`, pos: [10, 0, -7], rotY: -0.25, scale: 1.2 },
  ];

  const loader = new GLTFLoader();
  let loadedCount = 0;
  const loadOne = (spec) => new Promise((resolve) => {
    loader.load(spec.url, (gltf) => {
      const model = gltf.scene;
      model.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
      model.rotation.y = spec.rotY;
      model.scale.setScalar(spec.scale);
      model.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      render3d.world.add(model);
      render3d.props.push(model);
      markAssetStats('model', true);
      loadedCount += 1;
      resolve();
    }, undefined, () => {
      markAssetStats('model', false);
      resolve();
    });
  });

  await Promise.all(specs.map(loadOne));
  if (loadedCount === 0) fallbackPack();
}

async function applyEnvironmentMap(scene, renderer) {
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const hdr = await new RGBELoader().loadAsync('https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloppenheim_06_puresky_1k.hdr');
    const envMap = pmrem.fromEquirectangular(hdr).texture;
    scene.environment = envMap;
    hdr.dispose();
    pmrem.dispose();
    return true;
  } catch (err) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const fallbackEnv = pmrem.fromScene(new THREE.Scene(), 0.04).texture;
    scene.environment = fallbackEnv;
    pmrem.dispose();
    return false;
  }
}

function setupPostProcessing(renderer, scene, camera) {
  try {
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.17, 0.45, 0.88);
    composer.addPass(bloomPass);
    render3d.composer = composer;
    render3d.bloomPass = bloomPass;
    render3d.usePostFX = true;
  } catch (err) {
    render3d.composer = null;
    render3d.bloomPass = null;
    render3d.usePostFX = false;
  }
}

function createRigCharacter(primary = '#3b82f6', secondary = '#0f172a', scale = 1, mats = null) {
  const g = new THREE.Group();
  const toonGrad = mats?.toonGradient;
  const bodyMat = mats?.style === 'toon'
    ? new THREE.MeshToonMaterial({ color: primary, gradientMap: toonGrad })
    : new THREE.MeshStandardMaterial({ color: primary, roughness: 0.58, metalness: 0.05 });
  const clothMat = mats?.style === 'toon'
    ? new THREE.MeshToonMaterial({ color: secondary, gradientMap: toonGrad })
    : new THREE.MeshStandardMaterial({ color: secondary, roughness: 0.72, metalness: 0.02 });
  const skinMat = mats?.style === 'toon'
    ? new THREE.MeshToonMaterial({ color: '#f7d8bf', gradientMap: toonGrad })
    : new THREE.MeshStandardMaterial({ color: '#f3d1b3', roughness: 0.7 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32 * scale, 0.62 * scale, 6, 12), bodyMat);
  torso.position.y = 1.0 * scale;
  torso.castShadow = true;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42 * scale, 18, 18), skinMat);
  head.position.y = 1.95 * scale;
  head.castShadow = true;

  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.095 * scale, 0.42 * scale, 6, 10), clothMat);
  const armR = armL.clone();
  armL.position.set(-0.38 * scale, 1.05 * scale, 0);
  armR.position.set(0.38 * scale, 1.05 * scale, 0);

  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.12 * scale, 0.42 * scale, 6, 10), clothMat);
  const legR = legL.clone();
  legL.position.set(-0.16 * scale, 0.42 * scale, 0);
  legR.position.set(0.16 * scale, 0.42 * scale, 0);

  const eyeMat = new THREE.MeshBasicMaterial({ color: '#111827' });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04 * scale, 8, 8), eyeMat);
  const eyeR = eyeL.clone();
  eyeL.position.set(-0.13 * scale, 2.0 * scale, 0.34 * scale);
  eyeR.position.set(0.13 * scale, 2.0 * scale, 0.34 * scale);

  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.1 * scale, 0.02 * scale, 0.01 * scale), new THREE.MeshBasicMaterial({ color: '#7f1d1d' }));
  mouth.position.set(0, 1.86 * scale, 0.36 * scale);

  g.add(torso, head, armL, armR, legL, legR, eyeL, eyeR, mouth);
  g.userData.parts = { armL, armR, legL, legR, torso, eyeL, eyeR };
  g.userData.phase = Math.random() * Math.PI * 2;
  return g;
}

function addBuildingGroundShadow(group, w = 3, h = 2.2) {
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.04;
  group.add(shadow);
}

function createStyledBuilding({ mats, width = 3.6, depth = 2.8, wallH = 2.4, roofW = 2.5, roofH = 1.6, trim = '#4b5563' }) {
  const g = new THREE.Group();

  const foundation = new THREE.Mesh(new THREE.BoxGeometry(width + 0.24, 0.34, depth + 0.24), new THREE.MeshStandardMaterial({ color: '#616a74', roughness: 0.9, metalness: 0.03 }));
  foundation.position.y = 0.18;
  foundation.receiveShadow = true;
  foundation.castShadow = true;

  const body = new THREE.Mesh(new THREE.BoxGeometry(width, wallH, depth), mats.wall);
  body.position.y = wallH * 0.5 + 0.34;
  body.castShadow = true;
  body.receiveShadow = true;

  const roof = new THREE.Mesh(new THREE.ConeGeometry(roofW, roofH, 4), mats.roof);
  roof.position.y = wallH + roofH * 0.5 + 0.36;
  roof.rotation.y = Math.PI * 0.25;
  roof.castShadow = true;

  const trimMat = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.72, metalness: 0.08 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.1, 0.08), trimMat);
  door.position.set(0, 0.9, depth * 0.5 + 0.05);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), new THREE.MeshStandardMaterial({ color: '#f59e0b', roughness: 0.35, metalness: 0.8 }));
  knob.position.set(0.18, 0.9, depth * 0.5 + 0.1);

  const windowMat = new THREE.MeshPhysicalMaterial({ color: '#93c5fd', roughness: 0.06, metalness: 0.15, transmission: 0.68, transparent: true, opacity: 0.88 });
  const frameMat = new THREE.MeshStandardMaterial({ color: '#d1d5db', roughness: 0.5, metalness: 0.2 });
  [-1, 1].forEach((dir) => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.7, 0.09), frameMat);
    frame.position.set(dir * 0.88, 1.5, depth * 0.5 + 0.06);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.55, 0.04), windowMat);
    pane.position.set(dir * 0.88, 1.5, depth * 0.5 + 0.1);
    g.add(frame, pane);
  });

  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.9, 0.36), trimMat);
  chimney.position.set(-0.9, wallH + 0.7, -0.5);
  chimney.castShadow = true;

  g.add(foundation, body, roof, door, knob, chimney);
  addBuildingGroundShadow(g, width + 1.2, depth + 0.9);
  return g;
}

function animateRigCharacter(model, t, moving = true) {
  if (!model?.userData?.parts) return;
  const { armL, armR, legL, legR, torso, eyeL, eyeR } = model.userData.parts;
  const speed = moving ? 7.2 : 2.2;
  const amp = moving ? 0.72 : 0.16;
  const wave = Math.sin(t * speed + (model.userData.phase || 0));
  const sway = Math.cos(t * speed * 0.5 + (model.userData.phase || 0));

  armL.rotation.x = wave * amp;
  armR.rotation.x = -wave * amp;
  legL.rotation.x = -wave * amp * 0.9;
  legR.rotation.x = wave * amp * 0.9;
  torso.rotation.z = sway * 0.04;

  const blink = Math.sin((t + (model.userData.phase || 0)) * 1.7);
  const eyeScale = blink > 0.97 ? 0.1 : 1;
  if (eyeL && eyeR) {
    eyeL.scale.y = eyeScale;
    eyeR.scale.y = eyeScale;
  }
}

function createCharacterMesh(material, scale = 1) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45 * scale, 1.1 * scale, 6, 12), material);
  body.castShadow = true;
  body.position.y = 1.1 * scale;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42 * scale, 18, 18), new THREE.MeshStandardMaterial({ color: '#f6d3b5', roughness: 0.7 }));
  head.castShadow = true;
  head.position.y = 2.05 * scale;
  group.add(body, head);
  return group;
}

function buildThreeWorld() {
  const mats = createWorldMaterials(state.renderStyle);
  render3d.mats = mats;
  render3d.world = new THREE.Group();
  render3d.scene.add(render3d.world);

  const tileGeo = new THREE.BoxGeometry(1, 0.5, 1);
  const grassCells = [];
  const meadowCells = [];
  const groveCells = [];
  const dirtCells = [];

  for (let gy = 0; gy < MAP_H; gy += 1) {
    for (let gx = 0; gx < MAP_W; gx += 1) {
      const biome = biomes[gy][gx];
      if (biome === 'water') {
        dirtCells.push({ gx, gy });
      } else if (biome === 'meadow') {
        meadowCells.push({ gx, gy });
      } else if (biome === 'grove') {
        groveCells.push({ gx, gy });
      } else {
        grassCells.push({ gx, gy });
      }
    }
  }

  const addTileInstances = (cells, material, tint = 0.05) => {
    const mesh = new THREE.InstancedMesh(tileGeo, material, cells.length);
    mesh.receiveShadow = true;
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    cells.forEach((cell, i) => {
      const tx = cell.gx - MAP_W / 2;
      const tz = cell.gy - MAP_H / 2;
      const curve = -((tx * tx + tz * tz) / (MAP_W * MAP_H)) * 1.2;
      m.makeTranslation(tx, curve, tz);
      mesh.setMatrixAt(i, m);
      if (mesh.instanceColor) {
        const v = 1 + (Math.random() - 0.5) * tint;
        color.setRGB(v, v, v);
        mesh.setColorAt(i, color);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    render3d.world.add(mesh);
    return mesh;
  };

  render3d.tileInstances = {
    grass: addTileInstances(grassCells, mats.grass, 0.08),
    meadow: addTileInstances(meadowCells, mats.meadow || mats.grass, 0.1),
    grove: addTileInstances(groveCells, mats.grove || mats.grass, 0.08),
    dirt: addTileInstances(dirtCells, mats.dirt, 0.06),
  };

  const pondW = WATER.x2 - WATER.x1 - 1;
  const pondH = WATER.y2 - WATER.y1 - 1;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(pondW, pondH), mats.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set((WATER.x1 + WATER.x2) / 2 - MAP_W / 2, 0.15, (WATER.y1 + WATER.y2) / 2 - MAP_H / 2);
  water.receiveShadow = true;
  render3d.water = water;
  render3d.world.add(water);

  const foamMat = new THREE.MeshBasicMaterial({ color: '#e8fbff', transparent: true, opacity: 0.35 });
  const foamGroup = new THREE.Group();
  const cx = (WATER.x1 + WATER.x2) / 2 - MAP_W / 2;
  const cz = (WATER.y1 + WATER.y2) / 2 - MAP_H / 2;
  const fx = (WATER.x2 - WATER.x1);
  const fz = (WATER.y2 - WATER.y1);
  const foamTop = new THREE.Mesh(new THREE.PlaneGeometry(fx, 0.2), foamMat);
  foamTop.position.set(cx, 0.17, cz - fz / 2);
  const foamBot = foamTop.clone(); foamBot.position.set(cx, 0.17, cz + fz / 2);
  const foamL = new THREE.Mesh(new THREE.PlaneGeometry(0.2, fz), foamMat); foamL.position.set(cx - fx / 2, 0.17, cz);
  const foamR = foamL.clone(); foamR.position.set(cx + fx / 2, 0.17, cz);
  [foamTop, foamBot, foamL, foamR].forEach((f) => { f.rotation.x = -Math.PI / 2; foamGroup.add(f); });
  render3d.waterFoam = foamGroup;
  render3d.world.add(foamGroup);

  const bridgeGroup = new THREE.Group();
  const bridgeLen = BRIDGE.x2 - BRIDGE.x1 + 1;
  for (let i = 0; i < bridgeLen; i += 1) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.2, 1.1), mats.bridge);
    plank.position.set(BRIDGE.x1 + i - MAP_W / 2, 0.48, BRIDGE.y - MAP_H / 2);
    plank.castShadow = true;
    plank.receiveShadow = true;
    bridgeGroup.add(plank);
  }
  bridgeGroup.visible = state.bridgeBuilt;
  render3d.bridge = bridgeGroup;
  render3d.world.add(bridgeGroup);
  if (state.renderStyle === 'toon') addOutlineToObject(bridgeGroup, 1.03, '#233042');

  const treeCount = 120;
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 1.4, 8);
  const leafGeo = new THREE.SphereGeometry(0.7, 10, 10);
  const trunks = new THREE.InstancedMesh(trunkGeo, mats.bark, treeCount);
  const leaves = new THREE.InstancedMesh(leafGeo, mats.leaf, treeCount);
  trunks.castShadow = true; leaves.castShadow = true;
  trunks.receiveShadow = true; leaves.receiveShadow = true;
  const m1 = new THREE.Matrix4();
  const m2 = new THREE.Matrix4();
  let ti = 0;
  while (ti < treeCount) {
    const x = rnd(2, MAP_W - 2) - MAP_W / 2;
    const z = rnd(2, MAP_H - 2) - MAP_H / 2;
    if (x > WATER.x1 - MAP_W / 2 && x < WATER.x2 - MAP_W / 2 && z > WATER.y1 - MAP_H / 2 && z < WATER.y2 - MAP_H / 2) continue;
    m1.makeTranslation(x, 0.9, z);
    m2.makeTranslation(x, 1.9, z);
    trunks.setMatrixAt(ti, m1);
    leaves.setMatrixAt(ti, m2);
    ti += 1;
  }
  trunks.count = ti; leaves.count = ti;
  trunks.instanceMatrix.needsUpdate = true; leaves.instanceMatrix.needsUpdate = true;
  render3d.world.add(trunks); render3d.world.add(leaves);

  const house = createStyledBuilding({ mats, width: 3.3, depth: 2.7, wallH: 2.3, roofW: 2.45, roofH: 1.7, trim: '#7c2d12' });
  house.position.set(HOUSE_PLOT.x / TILE - MAP_W / 2 + 1.8, 0, HOUSE_PLOT.y / TILE - MAP_H / 2 + 1.2);
  house.visible = state.house.tier > 0;
  render3d.house = house;
  render3d.world.add(house);

  const shop = createStyledBuilding({ mats, width: 3.8, depth: 3.0, wallH: 2.5, roofW: 2.6, roofH: 1.5, trim: '#78350f' });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.1), new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.6 }));
  sign.position.set(0, 2.2, 1.42);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 0.8), new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.6 }));
  awning.position.set(0, 1.9, 1.9);
  awning.castShadow = true;
  shop.add(sign, awning);
  shop.position.set(SHOP_PLOT.x / TILE - MAP_W / 2 + 1.8, 0, SHOP_PLOT.y / TILE - MAP_H / 2 + 1.2);
  render3d.shop = shop;
  render3d.world.add(shop);

  const museum = createStyledBuilding({ mats, width: 4.4, depth: 3.3, wallH: 2.8, roofW: 2.8, roofH: 1.65, trim: '#334155' });
  const pillarGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.4, 8);
  for (let i = -1; i <= 1; i += 1) {
    const col = new THREE.Mesh(pillarGeo, new THREE.MeshStandardMaterial({ color: '#d6d3d1', roughness: 0.85 }));
    col.position.set(i * 0.65, 0.8, 1.55);
    col.castShadow = true;
    museum.add(col);
  }
  const museumBadge = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.48, 22), new THREE.MeshStandardMaterial({ color: '#a78bfa', roughness: 0.38, metalness: 0.62 }));
  museumBadge.position.set(0, 2.25, 1.72);
  museumBadge.rotation.y = Math.PI;
  museum.add(museumBadge);
  museum.position.set(MUSEUM_PLOT.x / TILE - MAP_W / 2 + 2.1, 0, MUSEUM_PLOT.y / TILE - MAP_H / 2 + 1.2);
  render3d.museum = museum;
  render3d.world.add(museum);

  const npcVillage = new THREE.Group();
  NPC_HOMES.forEach((home, idx) => {
    const homeMesh = createStyledBuilding({ mats, width: 2.6 + (idx % 2) * 0.3, depth: 2.2 + (idx % 3) * 0.2, wallH: 2.0, roofW: 2.0, roofH: 1.2, trim: idx % 2 ? '#9a3412' : '#1d4ed8' });
    homeMesh.position.set(home.x / TILE - MAP_W / 2, 0, home.y / TILE - MAP_H / 2);
    npcVillage.add(homeMesh);
  });
  render3d.npcVillage = npcVillage;
  render3d.world.add(npcVillage);

  const poiMat = state.renderStyle === 'toon'
    ? new THREE.MeshToonMaterial({ color: '#9de6ea', gradientMap: mats.toonGradient })
    : new THREE.MeshStandardMaterial({ color: '#22d3ee', roughness: 0.4, metalness: 0.65, emissive: '#0ea5e9', emissiveIntensity: 0.35 });
  const to3DPoint = (pt) => ({ x: pt.x / TILE - MAP_W / 2, z: pt.y / TILE - MAP_H / 2 });
  const poiDefs = [
    { key: 'fountain', pt: FOUNTAIN, color: '#60a5fa' },
    { key: 'campfire', pt: CAMPFIRE, color: '#fb923c' },
    { key: 'lookout', pt: LOOKOUT, color: '#c4b5fd' },
    { key: 'pier', pt: PIER, color: '#34d399' },
  ];
  render3d.poiMeshes = poiDefs.map((d) => {
    const p = to3DPoint(d.pt);
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), poiMat.clone());
    m.material.color.set(d.color);
    m.position.set(p.x, 1.1, p.z);
    m.castShadow = true;
    render3d.world.add(m);
    return m;
  });

  render3d.player = createRigCharacter('#9cb8f6', '#5f7ec8', 1, mats);
  render3d.world.add(render3d.player);
  markAssetStats('model', true);

  render3d.npcMeshes = state.npcs.map((npc, idx) => {
    const palette = [
      ['#f6b18f', '#cc7a66'],
      ['#98ddb4', '#5e9877'],
      ['#c6b8f7', '#7f73c0'],
    ][idx % 3];
    const mesh = createRigCharacter(palette[0], palette[1], 0.98, mats);
    render3d.world.add(mesh);
    markAssetStats('model', true);
    return mesh;
  });

  render3d.resourceMeshes = state.objects.map((obj) => {
    const color = obj.type === 'wood' ? '#b08b6f' : obj.type === 'flower' ? '#f7a8c8' : obj.type === 'berry' ? '#9485f2' : obj.type === 'shell' ? '#e5e7eb' : '#fef08a';
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), state.renderStyle === 'toon' ? new THREE.MeshToonMaterial({ color, gradientMap: mats.toonGradient }) : new THREE.MeshStandardMaterial({ color, roughness: 0.65 }));
    mesh.castShadow = true;
    render3d.world.add(mesh);
    return mesh;
  });

  if (state.renderStyle === 'toon') {
    [render3d.player, ...render3d.npcMeshes, house, shop, museum, npcVillage].forEach((obj) => addOutlineToObject(obj, 1.03, '#2a3a4f'));
  }
}

async function ensure3DWorld() {
  if (render3d.ready || render3d.loading) return;
    render3d.loading = true;
  render3d.textureStats = { loaded: 0, failed: 0 };
  render3d.modelStats = { loaded: 0, failed: 0 };
  try {
    ui.game3d.innerHTML = '';
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#9ad2ff');
    scene.fog = new THREE.Fog('#a5d8ff', 26, 95);

    const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 220);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.physicallyCorrectLights = true;
    ui.game3d.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight('#dff4ff', '#445a44', 0.48);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight('#fff4df', 4.8);
    sun.position.set(25, 42, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.left = -35;
    sun.shadow.camera.right = 35;
    sun.shadow.camera.top = 35;
    sun.shadow.camera.bottom = -35;
    sun.shadow.bias = -0.00015;
    sun.shadow.normalBias = 0.028;
    sun.shadow.radius = 2.2;
    scene.add(sun);

    const bounce = new THREE.DirectionalLight('#9ec5ff', 1.35);
    bounce.position.set(-16, 12, -22);
    scene.add(bounce);

    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(120, 24, 16),
      new THREE.MeshBasicMaterial({ color: '#b9dcff', side: THREE.BackSide }),
    );
    scene.add(skyDome);

    const rainGeo = new THREE.BufferGeometry();
    const rainCount = 900;
    const rainPos = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i += 1) {
      rainPos[i * 3] = rnd(-34, 34);
      rainPos[i * 3 + 1] = rnd(2, 24);
      rainPos[i * 3 + 2] = rnd(-26, 26);
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: '#b9dcff', size: 0.055, transparent: true, opacity: 0.6 }));
    rain.visible = false;
    scene.add(rain);

    await applyEnvironmentMap(scene, renderer);

    render3d.scene = scene;
    render3d.camera = camera;
    render3d.renderer = renderer;
    render3d.sun = sun;
    render3d.hemi = hemi;
    render3d.bounce = bounce;
    render3d.skyDome = skyDome;
    render3d.rain = rain;
    render3d.clock = new THREE.Clock();
    setupPostProcessing(renderer, scene, camera);
    render3d.playerMixer = null;
    render3d.npcMixers = [];

    buildThreeWorld();
    await loadFreeWorldProps();
    render3d.ready = true;
    resize3DRenderer();
  } catch (err) {
    console.error(err);
    state.renderMode = '2d';
    setMsg('3D 렌더 초기화 실패로 2D로 전환됩니다.');
  } finally {
    render3d.loading = false;
  }
}

function resize3DRenderer() {
  if (!render3d.ready || !render3d.renderer || !render3d.camera) return;
  const w = Math.max(320, Math.floor(ui.game3d.clientWidth || 1280));
  const h = Math.max(180, Math.floor(ui.game3d.clientHeight || 720));
  render3d.renderer.setSize(w, h, false);
  if (render3d.composer) render3d.composer.setSize(w, h);
  render3d.camera.aspect = w / h;
  render3d.camera.updateProjectionMatrix();
}

function sync3DEntities() {
  if (!render3d.ready) return;
  const to3D = (x, y) => ({ x: x / TILE - MAP_W / 2, z: y / TILE - MAP_H / 2 });

  const p = to3D(state.player.x, state.player.y);
  render3d.player.position.set(p.x, 0.25, p.z);
  render3d.player.rotation.y = facingToYaw(state.player.facing);
  animateRigCharacter(render3d.player, state.time * 0.016, state.keys.size > 0);

  state.npcs.forEach((npc, i) => {
    const mesh = render3d.npcMeshes[i];
    if (!mesh) return;
    const n = to3D(npc.x, npc.y);
    mesh.position.set(n.x, 0.25, n.z);
    const nearPlayer = dist(state.player, npc) < 100;
    const facingYaw = facingToYaw(npc.facing || 'down');
    const lookYaw = Math.atan2(circularDelta(state.player.x, npc.x, WORLD_W), circularDelta(state.player.y, npc.y, WORLD_H));
    const targetYaw = nearPlayer ? lookYaw : facingYaw;
    npc.lookYaw = (npc.lookYaw ?? targetYaw) + (targetYaw - (npc.lookYaw ?? targetYaw)) * 0.14;
    mesh.rotation.y = npc.lookYaw;
    const npcMoving = Math.abs(npc.vx || 0) + Math.abs(npc.vy || 0) > 0.05;
    animateRigCharacter(mesh, state.time * 0.016 + i * 0.7, npcMoving);
    const parts = mesh.userData?.parts;
    if (parts && !npcMoving) {
      if (npc.gesture === 'nod') parts.torso.rotation.x = Math.sin(state.time * 0.08 + i) * 0.09;
      else if (npc.gesture === 'stretch') { parts.armL.rotation.x = -0.9; parts.armR.rotation.x = -0.9; }
      else if (npc.gesture === 'wave') parts.armR.rotation.x = -0.3 + Math.sin(state.time * 0.2 + i) * 0.8;
      else if (npc.gesture === 'fishPose') { parts.armL.rotation.x = -0.6; parts.armR.rotation.x = -1.0; }
      else if (npc.gesture === 'clap') { parts.armL.rotation.z = 0.25; parts.armR.rotation.z = -0.25; }
      else if (npc.gesture === 'sit') { parts.legL.rotation.x = 1.1; parts.legR.rotation.x = 1.1; }
    }
  });

  state.objects.forEach((obj, i) => {
    const mesh = render3d.resourceMeshes[i];
    if (!mesh) return;
    const o = to3D(obj.x, obj.y);
    mesh.position.set(o.x, 0.6 + Math.sin(state.time * 0.03 + i) * 0.08, o.z);
  });

  render3d.bridge.visible = state.bridgeBuilt;
  render3d.house.visible = state.house.tier > 0;

  if (render3d.water) {
    if ('roughness' in render3d.water.material) render3d.water.material.roughness = state.weather === 'rainy' ? 0.08 : 0.2;
    if (render3d.mats?.waterNormal) {
      render3d.mats.waterNormal.offset.x = state.time * 0.0007;
      render3d.mats.waterNormal.offset.y = state.time * 0.00045;
    }
    render3d.water.position.y = 0.13 + Math.sin(state.time * 0.02) * 0.03;
  }
}

function renderWorld3D() {
  if (!render3d.ready) return;
  sync3DEntities();

  const dt = render3d.clock ? render3d.clock.getDelta() : 0.016;
  const animTime = state.time * 0.016 + dt;

  const centerX = state.player.x / TILE - MAP_W / 2;
  const centerZ = state.player.y / TILE - MAP_H / 2;
  const yaw = state.camera3d.yaw;
  const distNorm = clamp((state.camera3d.dist - 300) / 600, 0, 1);
  const dist = 14 + distNorm * 12;
  const h = 8 + distNorm * 6;

  render3d.camera.position.set(
    centerX + Math.cos(yaw) * dist,
    h,
    centerZ + Math.sin(yaw) * dist,
  );
  render3d.camera.lookAt(centerX, 1.3, centerZ);

  const daylight = (Math.sin(state.time * 0.0023) + 1) / 2;
  const rainy = state.weather === 'rainy';
  const toon = state.renderStyle === 'toon';
  render3d.sun.intensity = (toon ? 2.0 : 2.3) + daylight * (toon ? 1.8 : 2.4);
  render3d.sun.color.set(toon ? '#fff2db' : '#ffffff');
  if (render3d.hemi) {
    render3d.hemi.intensity = (toon ? 0.42 : 0.3) + daylight * (toon ? 0.34 : 0.45);
    render3d.hemi.color.set(toon ? '#ffe5c1' : '#ffffff');
    render3d.hemi.groundColor.set(toon ? '#a4c8ff' : '#4f83b8');
  }
  if (render3d.bounce) {
    render3d.bounce.intensity = (toon ? 0.8 : 0.5) + daylight * (toon ? 0.35 : 0.55);
    render3d.bounce.color.set(toon ? '#d6e8ff' : '#9ec5ff');
  }

  render3d.scene.fog.color.set(rainy ? (toon ? '#a9b7c4' : '#8b9caf') : (toon ? '#c7e7ef' : '#a5d8ff'));
  render3d.scene.background.set(rainy ? (toon ? '#98aab8' : '#7f97ad') : (toon ? '#c6eef8' : '#9ad2ff'));
  render3d.scene.fog.near = rainy ? 16 : 26;
  render3d.scene.fog.far = rainy ? 68 : 95;
  render3d.renderer.toneMappingExposure = rainy ? (toon ? 1.02 : 0.96) : (toon ? 1.18 : 1.2);
  if (render3d.bloomPass) {
    render3d.bloomPass.strength = rainy ? 0.1 : (toon ? 0.2 : 0.14);
    render3d.bloomPass.radius = toon ? 0.42 : 0.34;
    render3d.bloomPass.threshold = rainy ? 0.9 : 0.86;
  }

  if (render3d.skyDome) {
    render3d.skyDome.material.color.set(rainy ? '#8ea9c0' : '#b9dcff');
  }

  if (render3d.rain) {
    render3d.rain.visible = rainy;
    if (rainy) {
      const arr = render3d.rain.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] -= 0.35;
        if (arr[i + 1] < 0.3) {
          arr[i + 1] = rnd(18, 24);
          arr[i] = centerX + rnd(-20, 20);
          arr[i + 2] = centerZ + rnd(-18, 18);
        }
      }
      render3d.rain.geometry.attributes.position.needsUpdate = true;
    }
  }

  if (render3d.waterFoam) {
    render3d.waterFoam.children.forEach((f, i) => {
      f.material.opacity = 0.24 + Math.sin(state.time * 0.03 + i) * 0.05;
    });
  }

  if (render3d.poiMeshes?.length) {
    render3d.poiMeshes.forEach((m, i) => {
      m.rotation.y += 0.02 + i * 0.002;
      m.position.y = 1.05 + Math.sin(state.time * 0.05 + i) * 0.18;
      m.material.emissiveIntensity = 0.25 + Math.sin(state.time * 0.04 + i) * 0.08;
    });
  }


  if (render3d.fxParticles?.length) {
    render3d.fxParticles = render3d.fxParticles.filter((p) => {
      p.mesh.position.y += p.vy;
      p.mesh.position.x += p.vx;
      p.mesh.position.z += p.vz;
      p.life -= 1;
      p.mesh.material.opacity = Math.max(0, p.life / 60);
      if (p.life <= 0) {
        render3d.fxGroup?.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        return false;
      }
      return true;
    });
  }

  if (state.debugPaths && render3d.world) {
    if (!render3d.debugGroup) {
      render3d.debugGroup = new THREE.Group();
      render3d.world.add(render3d.debugGroup);
    }
    render3d.debugGroup.visible = true;
    while (render3d.debugGroup.children.length) {
      const c = render3d.debugGroup.children.pop();
      c.geometry?.dispose?.();
      c.material?.dispose?.();
      render3d.debugGroup.remove(c);
    }
    state.npcs.forEach((n) => {
      if (!n.path || n.pathIndex >= n.path.length) return;
      const pts = [new THREE.Vector3(n.x / TILE - MAP_W / 2, 0.2, n.y / TILE - MAP_H / 2)];
      for (let i = n.pathIndex; i < n.path.length; i += 1) {
        const node = n.path[i];
        pts.push(new THREE.Vector3(node.gx + 0.5 - MAP_W / 2, 0.2, node.gy + 0.5 - MAP_H / 2));
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x38bdf8 }));
      render3d.debugGroup.add(line);
      if (n.target) {
        const marker = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshBasicMaterial({ color: 0x22d3ee }));
        marker.position.set(n.target.x / TILE - MAP_W / 2, 0.3, n.target.y / TILE - MAP_H / 2);
        render3d.debugGroup.add(marker);
      }
    });
  } else if (render3d.debugGroup) {
    render3d.debugGroup.visible = false;
  }

  if (render3d.usePostFX && render3d.composer) render3d.composer.render();
  else render3d.renderer.render(render3d.scene, render3d.camera);
}

function syncRenderSurface() {
  const enable3D = state.renderMode === '3d' && !state.house.inside;
  canvas.classList.toggle('hidden', enable3D);
  ui.game3d.classList.toggle('hidden', !enable3D);
}

function renderMiniMapHtml(size = 180) {
  const toMap = (x, y) => ({ x: (wrapAxis(x, WORLD_W) / WORLD_W) * size, y: (wrapAxis(y, WORLD_H) / WORLD_H) * size });
  const me = toMap(state.player.x, state.player.y);
  const npcs = state.npcs.map((n) => {
    const p = toMap(n.x, n.y);
    return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.8" fill="${n.color}"/>`;
  }).join('');
  const homes = NPC_HOMES.map((h) => {
    const p = toMap(h.x, h.y);
    return `<rect x="${(p.x - 1.8).toFixed(1)}" y="${(p.y - 1.8).toFixed(1)}" width="3.6" height="3.6" fill="#ea580c"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" class="map-mini-svg"><rect width="${size}" height="${size}" rx="14" fill="#bde5be"/>
  <rect x="${((WATER.x1 / MAP_W) * size).toFixed(1)}" y="${((WATER.y1 / MAP_H) * size).toFixed(1)}" width="${(((WATER.x2 - WATER.x1) / MAP_W) * size).toFixed(1)}" height="${(((WATER.y2 - WATER.y1) / MAP_H) * size).toFixed(1)}" fill="#5ca4f8" rx="8"/>${homes}${npcs}<circle cx="${me.x.toFixed(1)}" cy="${me.y.toFixed(1)}" r="3.4" fill="#dc2626"/></svg>`;
}

function updateUI() {
  window.__renderStats = {
    textures: { ...render3d.textureStats },
    models: { ...render3d.modelStats },
    mode: state.renderMode,
    note: 'PolyHaven 우선 로딩 + 백업 텍스처 체인 사용',
    player: { x: Number(state.player.x.toFixed(2)), y: Number(state.player.y.toFixed(2)), facing: state.player.facing },
  };

  const t = (Math.sin(state.time * 0.0023) + 1) / 2;
  const phase = t > 0.66 ? '아침' : t > 0.33 ? '노을' : '밤';
  state.decorScore = calcDecorScore();
  ui.stats.innerHTML = `🗓️ D${state.day} ${SEASONS[state.season]} · 🕒 ${phase} · 🎉 ${state.dailyEvent} · ⚡ ${Math.floor(state.player.energy)} · 💖 ${Math.floor(state.player.mood)} · 🪙 ${state.coins} · ⭐ ${state.level} · 🏠 ${state.decorScore} · ${state.renderMode.toUpperCase()}/${state.renderStyle.toUpperCase()} · TX ${render3d.textureStats.loaded}/${render3d.textureStats.failed} · MD ${render3d.modelStats.loaded}/${render3d.modelStats.failed} · ${state.version}`;
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
  if (ui.worldMapMini) ui.worldMapMini.innerHTML = renderMiniMapHtml();
  const shopDoor = { x: SHOP_PLOT.x + 92, y: SHOP_PLOT.y + 102 };
  const museumDoor = { x: MUSEUM_PLOT.x + 106, y: MUSEUM_PLOT.y + 110 };
  state.prompt = '';
  if (state.house.tier > 0 && dist(state.player, { x: state.house.doorX, y: state.house.doorY }) < 66) state.prompt = 'E: 집 출입';
  else if (dist(state.player, shopDoor) < 70) state.prompt = 'E: 상점 이용';
  else if (dist(state.player, museumDoor) < 74) state.prompt = 'E: 박물관 이용';
  else if (dist(state.player, FOUNTAIN) < 78) state.prompt = 'E: 분수 축복 받기';
  else if (dist(state.player, CAMPFIRE) < 82) state.prompt = 'E: 모닥불 휴식';
  else if (dist(state.player, LOOKOUT) < 78) state.prompt = 'E: 전망대 탐색';
  else if (dist(state.player, PIER) < 80) state.prompt = 'E: 피어 낚시 버프';
  else {
    const nearNpc = state.npcs.find((n) => dist(state.player, n) < 82);
    if (nearNpc) state.prompt = `E: ${nearNpc.name}와 대화`;
  }

  ui.message.textContent = state.prompt || (state.msgTimer > 0 ? state.msg : '');
  if (state.debugPaths) {
    const dbg = state.npcs.map((n) => `${n.name}:${n.state}`).join(' · ');
    ui.message.textContent = `${ui.message.textContent ? `${ui.message.textContent} | ` : ''}DBG ${dbg}`;
  }

  if (state.dialogue) {
    ui.dialogueUi.classList.remove('hidden');
    ui.dialogueUi.innerHTML = `
      <div class="name">💬 ${state.dialogue.npc.name}</div>
      <div class="line">${state.dialogue.npc.talk || `${state.dialogue.npc.name}: 무슨 이야기 할까?`}</div>
      <div class="choices">
        <button data-choice="1">1) ${state.dialogue.a}</button>
        <button data-choice="2">2) ${state.dialogue.b}</button>
        <button data-choice="0">Esc) 대화 종료</button>
      </div>`;
  } else {
    ui.dialogueUi.classList.add('hidden');
    ui.dialogueUi.innerHTML = '';
  }
}

function tick() {
  state.time += 1;
  if (state.msgTimer > 0) state.msgTimer -= 1;

  playerMove();
  if (!state.house.inside) {
    updateFish();
    updateNPCs();
    collectResources();
    updateCrops();
    updateCamera();

    if (state.renderMode === '3d' && render3d.ready) {
      renderWorld3D();
    } else {
      drawWorld();
      state.objects.forEach(drawResource);
      drawFish();
      drawAllCharacters();
    }
  } else {
    drawHouseInterior();
  }
  syncRenderSurface();

  updateFishing();
  updateEconomyAndLevel();
  maybeProgressQuest();
  updateCalendar();
  checkAchievements();
  updateUI();

  requestAnimationFrame(tick);
}


function rebuildThreeWorldForStyle() {
  if (!render3d.ready || !render3d.scene) return;
  if (render3d.world) {
    render3d.scene.remove(render3d.world);
  }
  buildThreeWorld();
}

function toggleRenderStyle() {
  state.renderStyle = state.renderStyle === 'pbr' ? 'toon' : 'pbr';
  if (state.renderMode === '3d' && render3d.ready) {
    rebuildThreeWorldForStyle();
  }
  if (ui.btnStyle) ui.btnStyle.textContent = state.renderStyle === 'toon' ? '🎨 PBR 스타일' : '🎨 동숲 스타일';
  setMsg(state.renderStyle === 'toon' ? '동숲 스타일 활성화' : 'PBR 스타일 활성화');
}

async function toggleRenderMode() {
  const next = state.renderMode === '2d' ? '3d' : '2d';
  if (next === '3d' && !render3d.ready) await ensure3DWorld();
  state.renderMode = next === '3d' && render3d.ready ? '3d' : '2d';
  ui.btnRender.textContent = state.renderMode === '3d' ? '🧱 2D뷰' : '🧊 3D뷰';
  syncRenderSurface();
  setMsg(state.renderMode === '3d' ? '풀 3D 월드 모드 활성화' : '2D 렌더 모드 활성화');
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

  if (state.renderMode === '3d') {
    if (key === 'q') { state.camera3d.yaw -= 0.08; return; }
    if (key === 'c') { state.camera3d.yaw += 0.08; return; }
    if (key === 'z') { state.camera3d.dist = clamp(state.camera3d.dist - 28, 300, 900); return; }
    if (key === 'x') { state.camera3d.dist = clamp(state.camera3d.dist + 28, 300, 900); return; }
  }

  if (key === ' ') { e.preventDefault(); fishingInput(); return; }
  if (key === 'm') { openWorldMap(); return; }
  if (key === 'p') { state.debugPaths = !state.debugPaths; setMsg(`NPC 디버그 ${state.debugPaths ? 'ON' : 'OFF'}`); return; }
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

ui.btnRender.addEventListener('click', toggleRenderMode);
ui.btnCraft.addEventListener('click', openCraft);
ui.btnShop.addEventListener('click', openShop);
ui.btnBuild.addEventListener('click', openBuild);
ui.btnTown.addEventListener('click', openTownBoard);
ui.btnMuseum.addEventListener('click', openMuseum);
ui.btnMap?.addEventListener('click', openWorldMap);
ui.btnStyle?.addEventListener('click', toggleRenderStyle);
ui.btnShop.textContent = '🛒 상점(E 근처 입장)';
ui.btnMuseum.textContent = '🏛️ 박물관(E 근처 입장)';
if (ui.btnMap) ui.btnMap.textContent = '🗺️ 지도';
if (ui.btnStyle) ui.btnStyle.textContent = '🎨 동숲 스타일';
ui.modalClose.addEventListener('click', closeModal);
ui.modal.addEventListener('click', (e) => { if (e.target === ui.modal) closeModal(); });
ui.dialogueUi.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-choice]');
  if (!btn) return;
  const c = btn.getAttribute('data-choice');
  if (c === '1') handleDialogueChoice(1);
  else if (c === '2') handleDialogueChoice(2);
  else closeDialogue();
});

initSpriteAtlases();
loadGame();
calcDailyShopStock();
rollResidentRequests();
spawnResources();
spawnFish();
initNPCs();
initDialoguePools();
rollDailyBarterOffers();
ui.btnRender.textContent = '🧊 3D뷰';
syncRenderSurface();
window.addEventListener('resize', resize3DRenderer);
updateUI();
tick();
