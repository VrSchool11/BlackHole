

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else { root.BLACKHOLE_SIM = api; Object.assign(root, api); }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
"use strict";



const CFG = {
  WORLD: { w: 5000, h: 5000 },
  COUNTS: { dust: 520, asteroids: 54, planets: 9, bots: 9 },

  PHYSICS: {
    FIXED_DT: 1 / 60,           
    MAX_FRAME_DT: 0.10,
    G: 26.0,                    
    INFLUENCE_MUL: 15,
    INFLUENCE_BASE: 140,
    SWIRL: 0.62,                
    MAX_ACCEL: 5200,
    DRAG: 0.55,
    EAT_RATIO: 1.06,            
    EAT_OVERLAP: 0.72
  },

  PLAYER: {
    START_MASS: Math.PI * 9 * 9,
    BASE_SPEED: 430,
    SPEED_FALLOFF: 0.42,
    MIN_SPEED: 74,
    ACCEL_LERP: 3.1,
    SPAWN_SHIELD: 3.0           
  },

  CAMERA: { VIEW_REF: 620, VIEW_PAD: 46, MIN_ZOOM: 0.16, MAX_ZOOM: 1.5, LERP: 2.4 },

  RENDER: {
    TRAIL_FADE: 0.30,
    STAR_LAYERS: [
      { count: 420, speed: 0.14, size: 0.9,  alpha: 0.42 },
      { count: 260, speed: 0.34, size: 1.35, alpha: 0.62 },
      { count: 140, speed: 0.62, size: 2.0,  alpha: 0.92 }
    ],
    SPAGHETTI_MAX: 4.6,
    MAX_PARTICLES: 300          
  }
};




const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp  = (a, b, t) => a + (b - a) * t;


const damp  = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const rand  = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick  = arr => arr[(Math.random() * arr.length) | 0];
const chance = p => Math.random() < p;



const radiusFromMass = m => Math.sqrt(m / Math.PI);
const massFromRadius = r => Math.PI * r * r;

const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(2) + "M"
              : n >= 1e3 ? (n / 1e3).toFixed(1) + "k"
              : Math.round(n).toString();
const mmss = s => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");

let __id = 1;
const nextId = () => __id++;




const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
const FOOD_TYPES = { dust: 0, asteroid: 1, planet: 2 };
const FOOD_TYPES_REV = ["dust", "asteroid", "planet"];

function encodePlayer(p) {
  return [p.id, Math.round(p.x), Math.round(p.y), Math.round(p.r), r2(p.stretch), r3(p.stretchAng),
          p.color, p.name, p.isBot ? 1 : 0, r2(p.shield), r2(p.eatFlash), r3(p.diskAngle), r3(p.pulse)];
}
function decodePlayer(a) {
  return { id: a[0], kind: "player", x: a[1], y: a[2], r: a[3], stretch: a[4], stretchAng: a[5],
           color: a[6], name: a[7], isBot: !!a[8], shield: a[9], eatFlash: a[10],
           diskAngle: a[11], pulse: a[12], mass: massFromRadius(a[3]) };
}
function encodeFood(f) {
  if (f.type === "dust")     return [f.id, 0, Math.round(f.x), Math.round(f.y), Math.round(f.r), r2(f.stretch), r3(f.stretchAng), f.tint];
  if (f.type === "asteroid") return [f.id, 1, Math.round(f.x), Math.round(f.y), Math.round(f.r), r2(f.stretch), r3(f.stretchAng), f.tint, r3(f.angle), f.lumps];
  return [f.id, 2, Math.round(f.x), Math.round(f.y), Math.round(f.r), r2(f.stretch), r3(f.stretchAng), f.tint, r3(f.angle), f.hasRing ? 1 : 0, r3(f.ringTilt), f.pal];
}
function decodeFood(a) {
  const kind = FOOD_TYPES_REV[a[1]];
  if (kind === "dust")     return { id: a[0], kind, x: a[2], y: a[3], r: a[4], stretch: a[5], stretchAng: a[6], tint: a[7] };
  if (kind === "asteroid") return { id: a[0], kind, x: a[2], y: a[3], r: a[4], stretch: a[5], stretchAng: a[6], tint: a[7], angle: a[8], lumps: a[9] };
  return { id: a[0], kind, x: a[2], y: a[3], r: a[4], stretch: a[5], stretchAng: a[6], tint: a[7], angle: a[8], hasRing: !!a[9], ringTilt: a[10], pal: a[11] };
}



class Entity {
  constructor(x, y, mass) {
    this.id = nextId();
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.mass = mass;
    this.r = radiusFromMass(mass);
    this.dead = false;
    this.stretch = 1;        
    this.stretchAng = 0;     
    this.spin = rand(-1.6, 1.6);
    this.angle = rand(0, TAU);
    this.tint = "#8fa6c8";
    this.type = "entity";
  }

  setMass(m) { this.mass = m; this.r = radiusFromMass(m); }

  integrate(dt, world) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle += this.spin * dt;
    const pad = this.r;
    if (this.x < pad)           { this.x = pad;           this.vx =  Math.abs(this.vx) * 0.5; }
    if (this.x > world.w - pad) { this.x = world.w - pad; this.vx = -Math.abs(this.vx) * 0.5; }
    if (this.y < pad)           { this.y = pad;           this.vy =  Math.abs(this.vy) * 0.5; }
    if (this.y > world.h - pad) { this.y = world.h - pad; this.vy = -Math.abs(this.vy) * 0.5; }
  }
}

class Dust extends Entity {
  constructor(x, y) {
    super(x, y, massFromRadius(rand(1.6, 3.4)));
    this.vx = rand(-14, 14); this.vy = rand(-14, 14);
    this.type = "dust";
    this.tint = pick(["#9fd8ff", "#c9b6ff", "#ffe6a8", "#a9ffe4", "#ffb9d8"]);
    this.twinkle = rand(0, TAU);
  }
}

class Asteroid extends Entity {
  constructor(x, y) {
    const r = rand(7, 21);
    super(x, y, massFromRadius(r));
    this.vx = rand(-30, 30); this.vy = rand(-30, 30);
    this.type = "asteroid";
    this.tint = pick(["#8b8375", "#6f7c8c", "#94836e", "#77706b"]);
    this.lumps = [];                       
    const n = randi(7, 11);
    for (let i = 0; i < n; i++) this.lumps.push(rand(0.74, 1.2));
  }
}

class Planet extends Entity {
  constructor(x, y) {
    const r = rand(46, 132);
    super(x, y, massFromRadius(r));
    this.vx = rand(-8, 8); this.vy = rand(-8, 8);
    this.spin = rand(-0.22, 0.22);
    this.type = "planet";
    this.pal = pick([
      ["#3f6fa8", "#7fb2d8", "#254a72"], ["#a8703f", "#d8a97f", "#6f4425"],
      ["#4b8f6a", "#8fd8b0", "#2c5a41"], ["#8a4b8f", "#c98fd8", "#4f2c5a"],
      ["#a83f4f", "#d87f8f", "#722530"]
    ]);
    this.tint = this.pal[0];
    this.hasRing = chance(0.34);
    this.ringTilt = rand(-0.6, 0.6);
  }
}



class Player extends Entity {
  constructor(x, y, name, color) {
    super(x, y, CFG.PLAYER.START_MASS);
    this.type = "player";
    this.name = name;
    this.color = color;
    this.intentX = x; this.intentY = y;    
    this.isLocal = false;
    this.isBot = false;
    this.controller = null;
    this.pulse = rand(0, TAU);
    this.diskAngle = rand(0, TAU);
    this.eatFlash = 0;
    this.shield = 0;                       
    this.trail = [];
    
    this.absorbed = 0;
    this.rivalsEaten = 0;                    
    this.peakMass = this.mass;
    this.bestRank = 99;
    this.spawnTime = 0;
  }

  get maxSpeed() {
    const s = CFG.PLAYER.BASE_SPEED * Math.pow(20 / (20 + this.r), CFG.PLAYER.SPEED_FALLOFF);
    return Math.max(CFG.PLAYER.MIN_SPEED, s);
  }
  get influence() { return this.r * CFG.PHYSICS.INFLUENCE_MUL + CFG.PHYSICS.INFLUENCE_BASE; }

  step(dt, world) {
    
    const dx = this.intentX - this.x, dy = this.intentY - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    
    const ease = clamp(dist / (this.r * 1.6 + 26), 0, 1);
    const desiredVX = (dx / dist) * this.maxSpeed * ease;
    const desiredVY = (dy / dist) * this.maxSpeed * ease;
    
    const k = CFG.PLAYER.ACCEL_LERP * (24 / (24 + this.r * 0.30));
    this.vx = damp(this.vx, desiredVX, k, dt);
    this.vy = damp(this.vy, desiredVY, k, dt);

    this.integrate(dt, world);

    this.pulse += dt * 2.1;
    this.diskAngle += dt * (0.55 + 26 / (this.r + 26));
    this.eatFlash = Math.max(0, this.eatFlash - dt * 2.6);
    if (this.shield > 0) this.shield = Math.max(0, this.shield - dt);
    if (this.mass > this.peakMass) this.peakMass = this.mass;

    this.trail.push(this.x, this.y);
    while (this.trail.length > 52) this.trail.splice(0, 2);
  }

  consume(other) {
    this.setMass(this.mass + other.mass);   
    this.absorbed++;
    if (other.type === "player") this.rivalsEaten++;
    this.eatFlash = 1;
    if (other.type === "player") this.shield = 0;   
  }

  reset(x, y) {
    this.dead = false;
    this.setMass(CFG.PLAYER.START_MASS);
    this.x = this.intentX = x;
    this.y = this.intentY = y;
    this.vx = this.vy = 0;
    this.trail.length = 0;
    this.absorbed = 0;
    this.rivalsEaten = 0;
    this.peakMass = this.mass;
    this.bestRank = 99;
    this.shield = CFG.PLAYER.SPAWN_SHIELD;
    this.eatFlash = 0;
  }
}

class Particle {
  constructor(x, y, vx, vy, life, size, color) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life;
    this.size = size; this.color = color; this.dead = false;
  }
  step(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vx *= 1 - 2.0 * dt; this.vy *= 1 - 2.0 * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
}


class HumanlikeController {
  constructor(game) {
    this.game = game;

    
    const skill = rand(0.18, 0.95);
    this.p = {
      skill,
      reaction:   rand(0.13, 0.22) + (1 - skill) * 0.28,  
      aggression: rand(0.15, 0.95),
      greed:      rand(0.2, 1.0),
      caution:    rand(0.2, 1.0),
      patience:   rand(0.5, 2.4),                          
      tremor:     (1 - skill) * 30 + 5,                    
      handSpeed:  700 + skill * 1700                       
    };

    this.seed = rand(0, 100);
    this.state = "wander";
    this.cx = 0; this.cy = 0;          
    this.cursorInit = false;
    this.goalX = 0; this.goalY = 0;
    this.target = null;
    this.threat = null;
    this.noticeTimer = 0;              
    this.decisionTimer = 0;
    this.glanceTimer = 0;
    this.hesitate = 0;
    this.jt = rand(0, 50);
    this.view = { prey: [], threats: [] };
  }

  

  perception(player) { return player.r * 14 + 850; }

  update(player, dt) {
    if (!this.cursorInit) { this.cx = player.x; this.cy = player.y; this.cursorInit = true; }

    this.jt += dt;
    this.glanceTimer -= dt;
    this.decisionTimer -= dt;
    this.noticeTimer -= dt;
    this.hesitate -= dt;

    
    if (this.glanceTimer <= 0) {
      this.glanceTimer = rand(0.09, 0.17);
      this.look(player);
    }

    
    const t = this.view.threats[0] || null;
    if (t && t !== this.threat) {
      this.threat = t;
      this.noticeTimer = this.p.reaction;      
    } else if (!t) {
      this.threat = null;
    }

    if (this.threat && this.noticeTimer <= 0) {
      this.state = "flee";
    } else if (this.state === "flee" && !this.threat) {
      this.state = "wander";
      this.decisionTimer = 0;
    }

    
    if (this.state !== "flee" && this.decisionTimer <= 0) this.decide(player);

    
    let urgency = 0.5;
    if (this.state === "flee" && this.threat) {
      urgency = 1;
      
      const dx = player.x - this.threat.x, dy = player.y - this.threat.y;
      const d = Math.hypot(dx, dy) || 1;
      const panic = Math.sin(this.jt * 4.2 + this.seed) * (1 - this.p.skill) * 0.5;
      const a = Math.atan2(dy, dx) + panic;
      this.goalX = player.x + Math.cos(a) * 1100;
      this.goalY = player.y + Math.sin(a) * 1100;
    } else if (this.state === "hunt" && this.target && !this.target.dead) {
      urgency = 0.55 + this.p.aggression * 0.45;
      
      const lead = this.p.skill * 0.35;
      this.goalX = this.target.x + this.target.vx * lead;
      this.goalY = this.target.y + this.target.vy * lead;
    } else {
      urgency = 0.35;
    }

    
    if (this.hesitate > 0) { this.goalX = player.x; this.goalY = player.y; urgency = 0.2; }

    this.moveHand(player, dt, urgency);
  }

  

  look(player) {
    const g = this.game;
    const R = this.perception(player);
    const R2 = R * R;
    const prey = [], threats = [];
    
    const noise = () => 1 + rand(-0.3, 0.3) * (1 - this.p.skill);

    for (const p of g.players) {
      if (p === player || p.dead) continue;
      const dx = p.x - player.x, dy = p.y - player.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > R2) continue;                                  
      const est = p.mass * noise();
      if (est > player.mass * CFG.PHYSICS.EAT_RATIO) threats.push({ e: p, d2 });
      else if (player.mass > est * CFG.PHYSICS.EAT_RATIO && p.shield <= 0) prey.push({ e: p, d2, w: 2.4 });
    }
    for (const e of g.food) {
      const dx = e.x - player.x, dy = e.y - player.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > R2) continue;
      if (e.mass * noise() > player.mass / CFG.PHYSICS.EAT_RATIO) continue;
      prey.push({ e, d2, w: 1 });
    }

    threats.sort((a, b) => a.d2 - b.d2);
    this.view.threats = threats.map(x => x.e);
    this.view.prey = prey;
  }

  

  decide(player) {
    this.decisionTimer = this.p.patience * rand(0.7, 1.4);

    
    if (chance(0.07 * (1 - this.p.skill) + 0.02)) {
      this.hesitate = rand(0.2, 0.75);
    }

    let best = null, bestScore = -Infinity;
    for (const c of this.view.prey) {
      const e = c.e;
      if (e.dead) continue;
      const d = Math.sqrt(c.d2);
      
      let score = (e.mass * c.w * (c.w > 1 ? this.p.aggression * 2 : this.p.greed)) / (d + 120);
      
      if (e.type === "planet") score *= 0.6 + (1 - this.p.caution) * 0.9;
      score *= rand(0.82, 1.18);                        
      if (score > bestScore) { bestScore = score; best = e; }
    }

    if (best) {
      this.state = "hunt";
      this.target = best;
      return;
    }

    
    this.state = "wander";
    this.target = null;
    const cell = this.game.bestDensityCell(player.x, player.y, this.p.greed);
    if (cell && chance(0.75)) {
      this.goalX = cell.x + rand(-160, 160);
      this.goalY = cell.y + rand(-160, 160);
    } else {
      this.goalX = clamp(player.x + rand(-1500, 1500), 80, CFG.WORLD.w - 80);
      this.goalY = clamp(player.y + rand(-1500, 1500), 80, CFG.WORLD.h - 80);
    }
  }

  

  moveHand(player, dt, urgency) {
    const p = this.p;
    const dx = this.goalX - this.cx, dy = this.goalY - this.cy;
    const d = Math.hypot(dx, dy) || 1;
    const speed = p.handSpeed * (0.55 + urgency * 0.9);
    const step = Math.min(d, speed * dt);
    this.cx += dx / d * step;
    this.cy += dy / d * step;

    
    const tr = p.tremor;
    const jx = Math.sin(this.jt * 2.9 + this.seed) * tr + Math.sin(this.jt * 8.1 + this.seed * 2) * tr * 0.35;
    const jy = Math.cos(this.jt * 2.3 + this.seed) * tr + Math.cos(this.jt * 7.3 + this.seed * 3) * tr * 0.35;

    player.intentX = clamp(this.cx + jx, 0, CFG.WORLD.w);
    player.intentY = clamp(this.cy + jy, 0, CFG.WORLD.h);
  }
}



class RemoteIntentController {
  constructor(x, y) { this.x = x; this.y = y; }
  update(player) { player.intentX = this.x; player.intentY = this.y; }
}

const HANDLES = [
  "kevin", "void_kitty", "xX_nova_Xx", "gg_ez", "mooncake", "not_a_bot", "sp4ce",
  "lurker", "TinyTim", "BIGSHRIMP", "orbital", "dave", "zzz", "404", "pixel",
  "hungrymoon", "yeet", "astro_j", "m1lk", "quasar_", "GARGANTUA", "M87*", "CYGNUS",
  "vela", "ur mom", "singularity", "noodle", "eepy", "banana", "TON618"
];
const HUES = ["#7ec8ff", "#ff7ec8", "#9cff7e", "#c89cff", "#ffe07e", "#7effe0", "#ff9c7e", "#8fa0ff", "#ffb0d0"];

class Game {
  constructor(audio) {
    this.world = { w: CFG.WORLD.w, h: CFG.WORLD.h };
    this.audio = audio;
    this.food = [];
    this.players = [];
    this.particles = [];
    this.local = null;
    this.time = 0;
    this.state = "menu";          
    this.events = [];             
    this.feed = [];               
    this.deathInfo = null;
    this.deathCam = null;

    
    
    this.gridCell = 400;
    this.gridCols = Math.ceil(this.world.w / this.gridCell);
    this.gridRows = Math.ceil(this.world.h / this.gridCell);
    this.grid = new Float32Array(this.gridCols * this.gridRows);
    this.gridTimer = 0;

    
    
    
    this.spaceCell = 320;
    this.spaceCols = Math.ceil(this.world.w / this.spaceCell);
    this.spaceRows = Math.ceil(this.world.h / this.spaceCell);
    this.space = new Array(this.spaceCols * this.spaceRows);
    for (let i = 0; i < this.space.length; i++) this.space[i] = [];
  }

  init() {
    const W = this.world.w, H = this.world.h;
    for (let i = 0; i < CFG.COUNTS.dust; i++)      this.food.push(new Dust(rand(0, W), rand(0, H)));
    for (let i = 0; i < CFG.COUNTS.asteroids; i++) this.food.push(new Asteroid(rand(0, W), rand(0, H)));
    for (let i = 0; i < CFG.COUNTS.planets; i++)   this.food.push(new Planet(rand(0, W), rand(0, H)));

    const used = new Set();
    for (let i = 0; i < CFG.COUNTS.bots; i++) this.spawnBot(used);
    this.rebuildGrid();
  }

  

  clearEntities() {
    this.food.length = 0;
    this.players.length = 0;
    this.particles.length = 0;
    this.feed.length = 0;
    this.events.length = 0;
    this.local = null;
    this.deathInfo = null;
    this.deathCam = null;
    this.ranked = [];
    this.time = 0;
    this.state = "menu";
  }

  spawnBot(used) {
    let name = pick(HANDLES), guard = 0;
    if (used) { while (used.has(name) && guard++ < 40) name = pick(HANDLES); used.add(name); }
    const spot = this.safeSpawn(null);
    const b = new Player(spot.x, spot.y, name, pick(HUES));
    b.isBot = true;
    b.setMass(CFG.PLAYER.START_MASS * rand(0.85, 2.4));
    b.shield = CFG.PLAYER.SPAWN_SHIELD;
    b.spawnTime = this.time;
    b.controller = new HumanlikeController(this);
    this.players.push(b);
    return b;
  }

  

  spawnLocal(name, controller) {
    if (!this.local) {
      this.local = new Player(0, 0, name, "#ffb45e");
      this.local.isLocal = true;
      this.local.controller = controller;
    }
    this.local.name = name || "YOU";
    const spot = this.safeSpawn(this.local);
    this.local.reset(spot.x, spot.y);
    this.local.spawnTime = this.time;
    if (!this.players.includes(this.local)) this.players.push(this.local);
    this.state = "playing";
    this.deathInfo = null;
    this.deathCam = null;
    this.events.push({ type: "spawn", hole: this.local });
  }

  killLocal(killer) {
    const me = this.local;
    const rank = this.rankOf(me);
    me.bestRank = Math.min(me.bestRank, rank);   
    this.state = "dead";
    this.deathCam = killer && !killer.dead ? killer : null;
    this.deathInfo = {
      killer: killer ? killer.name : "THE VOID",
      peakMass: me.peakMass,
      rank: me.bestRank,
      time: this.time - me.spawnTime,
      absorbed: me.absorbed,
      rivalsEaten: me.rivalsEaten
    };
    this.events.push({ type: "death", hole: me, killer });
  }

  step(dt) {
    this.time += dt;

    
    this.gridTimer -= dt;
    if (this.gridTimer <= 0) { this.gridTimer = 0.5; this.rebuildGrid(); }

    for (const p of this.players) { if (!p.dead && p.controller) p.controller.update(p, dt); }
    for (const p of this.players) { if (!p.dead) p.step(dt, this.world); }

    this.buildSpatial();           
    this.applyGravity(dt);

    for (const e of this.food) {
      if (e.dead) continue;
      const d = Math.exp(-CFG.PHYSICS.DRAG * dt);   
      e.vx *= d; e.vy *= d;
      e.integrate(dt, this.world);
    }

    this.buildSpatial();           
    this.resolveEating();
    for (const p of this.particles) p.step(dt);

    this.updateRanks();
    this.compact();
    this.repopulate();

    
    for (let i = this.feed.length - 1; i >= 0; i--) {
      this.feed[i].t -= dt;
      if (this.feed[i].t <= 0) this.feed.splice(i, 1);
    }
  }

  

  rankOf(p) {
    let rank = 1;
    for (const o of this.players) {
      if (o === p || o.dead) continue;
      if (o.mass > p.mass) rank++;
    }
    return rank;
  }

  updateRanks() {
    const sorted = this.players.filter(p => !p.dead).sort((a, b) => b.mass - a.mass);
    for (let i = 0; i < sorted.length; i++) {
      sorted[i].rank = i + 1;
      if (i + 1 < sorted[i].bestRank) sorted[i].bestRank = i + 1;
    }
    this.ranked = sorted;
  }

  rebuildGrid() {
    this.grid.fill(0);
    for (const e of this.food) {
      const cx = (e.x / this.gridCell) | 0, cy = (e.y / this.gridCell) | 0;
      if (cx < 0 || cy < 0 || cx >= this.gridCols || cy >= this.gridRows) continue;
      this.grid[cy * this.gridCols + cx] += e.mass;
    }
  }

  

  buildSpatial() {
    for (const bucket of this.space) bucket.length = 0;
    const cell = this.spaceCell;
    const insert = e => {
      const cx = (e.x / cell) | 0, cy = (e.y / cell) | 0;
      if (cx < 0 || cy < 0 || cx >= this.spaceCols || cy >= this.spaceRows) return;
      this.space[cy * this.spaceCols + cx].push(e);
    };
    for (const e of this.food) if (!e.dead) insert(e);
    for (const p of this.players) if (!p.dead) insert(p);
  }

  

  queryCircle(x, y, r, fn) {
    const cell = this.spaceCell;
    const x0 = Math.max(0, ((x - r) / cell) | 0), x1 = Math.min(this.spaceCols - 1, ((x + r) / cell) | 0);
    const y0 = Math.max(0, ((y - r) / cell) | 0), y1 = Math.min(this.spaceRows - 1, ((y + r) / cell) | 0);
    for (let cy = y0; cy <= y1; cy++) {
      const base = cy * this.spaceCols;
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = this.space[base + cx];
        for (let i = 0; i < bucket.length; i++) fn(bucket[i]);
      }
    }
  }

  

  bestDensityCell(x, y, greed) {
    let best = null, bestScore = -Infinity;
    for (let cy = 0; cy < this.gridRows; cy++) {
      for (let cx = 0; cx < this.gridCols; cx++) {
        const m = this.grid[cy * this.gridCols + cx];
        if (m <= 0) continue;
        const px = (cx + 0.5) * this.gridCell, py = (cy + 0.5) * this.gridCell;
        const d = Math.hypot(px - x, py - y);
        if (d > 2600) continue;
        const score = (m * greed) / (d + 400);
        if (score > bestScore) { bestScore = score; best = { x: px, y: py }; }
      }
    }
    return best;
  }

  

  applyGravity(dt) {
    const { G, MAX_ACCEL, SWIRL } = CFG.PHYSICS;

    for (const H of this.players) {
      if (H.dead) continue;
      const R = H.influence, R2 = R * R, Hm = H.mass;

      const pullOne = (B) => {
        if (B === H || B.dead) return;
        if (B.type === "player" && B.mass >= Hm) return;   

        const dx = H.x - B.x, dy = H.y - B.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > R2 || d2 === 0) return;

        const dist = Math.sqrt(d2);
        const nx = dx / dist, ny = dy / dist;

        
        const soft = d2 + H.r * H.r * 0.55 + 40;
        let a = G * Hm / soft;
        if (a > MAX_ACCEL) a = MAX_ACCEL;

        const t = 1 - dist / R;
        const falloff = t * t;                    

        B.vx += nx * a * dt;                      
        B.vy += ny * a * dt;
        const swirl = a * SWIRL * falloff;        
        B.vx += -ny * swirl * dt;
        B.vy +=  nx * swirl * dt;

        

        const proximity = clamp(1 - (dist - H.r) / (H.r * 4 + 60), 0, 1);
        const s = 1 + (CFG.RENDER.SPAGHETTI_MAX - 1) * proximity * proximity;
        if (s > B.stretch) { B.stretch = s; B.stretchAng = Math.atan2(dy, dx); }
      };

      this.queryCircle(H.x, H.y, R, pullOne);
    }

    for (const B of this.food) B.stretch = damp(B.stretch, 1, 5.5, dt);
  }

  

  resolveEating() {
    const { EAT_RATIO, EAT_OVERLAP } = CFG.PHYSICS;
    const holes = this.players.slice().sort((a, b) => b.mass - a.mass);   

    for (const H of holes) {
      if (H.dead) continue;                                               

      const tryEat = (B) => {
        if (B === H || B.dead) return;                                    
        if (B.shield > 0) return;                                         
        if (H.mass < B.mass * EAT_RATIO) return;
        const d = Math.hypot(B.x - H.x, B.y - H.y);
        if (d > H.r * EAT_OVERLAP + B.r * 0.25) return;

        B.dead = true;
        H.consume(B);
        this.spawnAbsorption(B, H);
        this.events.push({ type: "absorb", x: B.x, y: B.y, r: B.r, hole: H, victim: B });

        if (B.type === "player") {
          this.feed.unshift({ a: H.name, b: B.name, mine: H === this.local, victimIsMe: B === this.local, t: 6 });
          if (this.feed.length > 6) this.feed.length = 6;
          if (B === this.local) this.killLocal(H);
        }
      };

      
      
      
      this.queryCircle(H.x, H.y, H.r * 1.6, tryEat);
    }
  }

  spawnAbsorption(victim, hole) {
    const max = CFG.RENDER.MAX_PARTICLES;
    const room = max - this.particles.length;
    if (room <= 0) return;                    
    let n = clamp(Math.round(6 + victim.r * 1.15), 6, 64);
    if (n > room) n = room;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(50, 60 + victim.r * 9);
      this.particles.push(new Particle(
        victim.x + Math.cos(a) * victim.r * 0.5,
        victim.y + Math.sin(a) * victim.r * 0.5,
        Math.cos(a) * sp + hole.vx * 0.5,
        Math.sin(a) * sp + hole.vy * 0.5,
        rand(0.25, 0.8),
        rand(1, 2.6) + victim.r * 0.06,
        victim.tint || victim.color || "#fff"
      ));
    }
  }

  compact() {
    if (this.food.some(e => e.dead)) this.food = this.food.filter(e => !e.dead);
    if (this.players.some(p => p.dead)) this.players = this.players.filter(p => !p.dead);
    if (this.particles.some(p => p.dead)) this.particles = this.particles.filter(p => !p.dead);
  }

  

  safeSpawn(who) {
    const W = this.world.w, H = this.world.h;
    let best = { x: W / 2, y: H / 2 }, bestD = -Infinity;
    for (let i = 0; i < 24; i++) {
      const x = rand(200, W - 200), y = rand(200, H - 200);
      let nearest = Infinity;
      for (const p of this.players) {
        if (p === who || p.dead) continue;
        if (who && p.mass < who.mass) continue;
        nearest = Math.min(nearest, Math.hypot(p.x - x, p.y - y) - p.influence);
      }
      if (nearest === Infinity || nearest > 700) return { x, y };
      if (nearest > bestD) { bestD = nearest; best = { x, y }; }
    }
    return best;
  }

  repopulate() {
    const counts = { dust: 0, asteroid: 0, planet: 0 };
    for (const e of this.food) counts[e.type]++;

    const away = () => {
      const anchor = this.state === "dead" ? this.deathCam : this.local;
      for (let i = 0; i < 8; i++) {
        const x = rand(0, this.world.w), y = rand(0, this.world.h);
        if (!anchor || Math.hypot(x - anchor.x, y - anchor.y) > anchor.influence * 1.6) return { x, y };
      }
      return { x: rand(0, this.world.w), y: rand(0, this.world.h) };
    };

    while (counts.dust < CFG.COUNTS.dust)          { const p = away(); this.food.push(new Dust(p.x, p.y)); counts.dust++; }
    while (counts.asteroid < CFG.COUNTS.asteroids) { const p = away(); this.food.push(new Asteroid(p.x, p.y)); counts.asteroid++; }
    while (counts.planet < CFG.COUNTS.planets)     { const p = away(); this.food.push(new Planet(p.x, p.y)); counts.planet++; }

    const wanted = CFG.COUNTS.bots + (this.state === "playing" ? 1 : 0);
    const used = new Set(this.players.map(p => p.name));   
    let guard = 0;
    while (this.players.length < wanted && guard++ < 4) this.spawnBot(used);
  }
}

return {
  CFG, Game, Player, Dust, Asteroid, Planet, Particle,
  HumanlikeController, RemoteIntentController,
  encodePlayer, decodePlayer, encodeFood, decodeFood, FOOD_TYPES, FOOD_TYPES_REV,
  nextId, clamp, lerp, damp, rand, randi, pick, chance,
  radiusFromMass, massFromRadius, fmt, mmss, TAU, HANDLES, HUES
};
});
