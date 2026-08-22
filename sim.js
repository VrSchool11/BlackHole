(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else { root.BLACKHOLE_SIM = api; Object.assign(root, api); }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
"use strict";


const CFG = {
  // bumped to 8000² when multiplayer landed — density held via COUNTS below
  WORLD: { w: 8000, h: 8000 },
  COUNTS: { dust: 1300, asteroids: 135, planets: 22, bots: 12 },

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

  BOOST: {
    SPEED_MUL: 1.7,
    DRAIN: 50,
    MIN_MASS: 170,      // floor sits below spawn size so holding shift keeps working
    PELLET_RATE: 0.10,
    PELLET_MASS: 5,
    PELLET_LIFE: 22
  },

  ROGUE: {
    // only ever shows up to pressure a runaway #1
    MASS_MUL: 1.15,
    RATIO_LEAD: 1.7,
    MIN_LEADER: 4000,
    CHECK_EVERY: 0.5,
    COOLDOWN: 25,
    LIFETIME: 22,
    SPAWN_DIST: 1600,
    SPEED_MUL: 0.8
  },

  NET: {
    VIEW_RADIUS: 2800,
    VIEW_R_MUL: 30
  },

  POWERUP: {
    SPAWN_EVERY: 14,
    LIFETIME: 22,
    RADIUS: 15,
    PICKUP_PAD: 20,
    SPEED_MUL: 1.6,
    SPEED_DUR: 6,
    MAGNET_MUL: 2.1,
    MAGNET_DUR: 7,
    SHIELD_DUR: 5
  },

  CAMERA: { VIEW_REF: 620, VIEW_PAD: 46, MIN_ZOOM: 0.16, MAX_ZOOM: 1.5, LERP: 2.4 },

  DASH: { COST_RATIO: 0.22, MIN_MASS: 260, DISTANCE: 340, COOLDOWN: 4 },
  WORMHOLE: { RADIUS: 34, COOLDOWN: 3, RESPAWN_EVERY: 45 },
  SUPERNOVA: { EVERY: 40, RADIUS: 1400, FORCE: 2400 },
  SLINGSHOT: { BAND_MIN_MUL: 1.3, BAND_MAX_MUL: 2.2, DUR: 2.5, COOLDOWN: 1.5, MIN_SPEED: 120 },
  DECAY: { LEAD_RATIO: 1.6, MIN_LEADER: 3000, RATE: 6 },
  SHOCKWAVE: { RATIO: 2.2, RADIUS_MUL: 3.2, FORCE: 900 },
  BOUNTY: { MIN_MASS: 3000, BASE: 200, PER_MASS: 0.05 },

  MATCH: { TIMED_DURATION: 180 },

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
const FOOD_TYPES = { dust: 0, asteroid: 1, planet: 2, rogue: 3, power: 4, wormhole: 5 };
const FOOD_TYPES_REV = ["dust", "asteroid", "planet", "rogue", "power", "wormhole"];
const POWER_KINDS = ["speed", "magnet", "shield"];

function encodePlayer(p) {
  return [p.id, Math.round(p.x), Math.round(p.y), Math.round(p.r), r2(p.stretch), r3(p.stretchAng),
          p.color, p.name, p.isBot ? 1 : 0, r2(p.shield), r2(p.eatFlash), r3(p.diskAngle), r3(p.pulse),
          r2(p.speedT || 0), r2(p.magnetT || 0), p.team == null ? -1 : p.team];
}
function decodePlayer(a) {
  return { id: a[0], kind: "player", x: a[1], y: a[2], r: a[3], stretch: a[4], stretchAng: a[5],
           color: a[6], name: a[7], isBot: !!a[8], shield: a[9], eatFlash: a[10],
           diskAngle: a[11], pulse: a[12], speedT: a[13] || 0, magnetT: a[14] || 0,
           team: a[15] == null || a[15] === -1 ? null : a[15], mass: massFromRadius(a[3]) };
}
function encodeFood(f) {
  if (f.type === "dust")     return [f.id, 0, Math.round(f.x), Math.round(f.y), Math.round(f.r), r2(f.stretch), r3(f.stretchAng), f.tint];
  if (f.type === "asteroid") return [f.id, 1, Math.round(f.x), Math.round(f.y), Math.round(f.r), r2(f.stretch), r3(f.stretchAng), f.tint, r3(f.angle), f.lumps];
  if (f.type === "rogue")    return [f.id, 3, Math.round(f.x), Math.round(f.y), Math.round(f.r), r2(f.stretch), r3(f.stretchAng), f.tint, f.name];
  if (f.type === "power")    return [f.id, 4, Math.round(f.x), Math.round(f.y), Math.round(f.r), r2(f.stretch), r3(f.stretchAng), f.tint, f.powerKind];
  if (f.type === "wormhole") return [f.id, 5, Math.round(f.x), Math.round(f.y), Math.round(f.r), r2(f.stretch), r3(f.stretchAng), f.tint, f.linkId];
  return [f.id, 2, Math.round(f.x), Math.round(f.y), Math.round(f.r), r2(f.stretch), r3(f.stretchAng), f.tint, r3(f.angle), f.hasRing ? 1 : 0, r3(f.ringTilt), f.pal];
}
function decodeFood(a) {
  const kind = FOOD_TYPES_REV[a[1]];
  if (kind === "dust")     return { id: a[0], kind, x: a[2], y: a[3], r: a[4], stretch: a[5], stretchAng: a[6], tint: a[7] };
  if (kind === "asteroid") return { id: a[0], kind, x: a[2], y: a[3], r: a[4], stretch: a[5], stretchAng: a[6], tint: a[7], angle: a[8], lumps: a[9] };
  if (kind === "rogue")    return { id: a[0], kind, x: a[2], y: a[3], r: a[4], stretch: a[5], stretchAng: a[6], tint: a[7], name: a[8] };
  if (kind === "power")    return { id: a[0], kind, x: a[2], y: a[3], r: a[4], stretch: a[5], stretchAng: a[6], tint: a[7], powerKind: a[8] };
  if (kind === "wormhole") return { id: a[0], kind, x: a[2], y: a[3], r: a[4], stretch: a[5], stretchAng: a[6], tint: a[7], linkId: a[8] };
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

class Rogue extends Entity {
  constructor(x, y, mass, target) {
    super(x, y, mass);
    this.type = "rogue";
    this.target = target;
    this.life = CFG.ROGUE.LIFETIME * rand(0.85, 1.15);
    this.tint = pick(["#ff4a5a", "#ff5a8a", "#ff3a6a"]);
    this.name = pick(["VOID WALKER", "CARRION", "RED DRIFT", "HARVESTER", "FATEFUL"]);
    this.spin = rand(-0.9, 0.9);
  }
  step(dt, game) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    let tx = this.x, ty = this.y;
    if (this.target && !this.target.dead) { tx = this.target.x; ty = this.target.y; }
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const base = this.target && !this.target.dead ? this.target.maxSpeed * CFG.ROGUE.SPEED_MUL : 90;
    const sp = Math.max(55, base);
    this.vx = damp(this.vx, dx / d * sp, 1.2, dt);
    this.vy = damp(this.vy, dy / d * sp, 1.2, dt);
    this.vx += Math.sin(game.time * 1.4 + this.id) * 26;
    this.vy += Math.cos(game.time * 1.1 + this.id) * 26;
    this.integrate(dt, game.world);
  }
}


class PowerUp extends Entity {
  constructor(x, y, powerKind) {
    super(x, y, massFromRadius(CFG.POWERUP.RADIUS));
    this.type = "power";
    this.powerKind = powerKind;
    this.ttl = CFG.POWERUP.LIFETIME;
    this.vx = 0; this.vy = 0;
    this.tint = powerKind === "speed" ? "#5ef0d8" : powerKind === "magnet" ? "#c98fff" : "#9fd8ff";
  }
}

class Wormhole extends Entity {
  constructor(x, y, linkId) {
    super(x, y, massFromRadius(CFG.WORMHOLE.RADIUS));
    this.type = "wormhole";
    this.linkId = linkId;
    this.vx = 0; this.vy = 0;
    this.tint = "#a06cff";
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
    this.speedT = 0;
    this.magnetT = 0;
    this.team = null;
    this.dashCooldown = 0;
    this.wormholeCooldown = 0;
    this.slingshotCooldown = 0;

    this.absorbed = 0;
    this.rivalsEaten = 0;
    this.peakMass = this.mass;
    this.bestRank = 99;
    this.spawnTime = 0;
    this.boost = false;
    this.boostTimer = 0;
  }

  get maxSpeed() {
    const s = CFG.PLAYER.BASE_SPEED * Math.pow(20 / (20 + this.r), CFG.PLAYER.SPEED_FALLOFF);
    return Math.max(CFG.PLAYER.MIN_SPEED, s);
  }
  get influence() {
    const base = this.r * CFG.PHYSICS.INFLUENCE_MUL + CFG.PHYSICS.INFLUENCE_BASE;
    return this.magnetT > 0 ? base * CFG.POWERUP.MAGNET_MUL : base;
  }

  step(dt, game) {
    const world = game.world;
    const dx = this.intentX - this.x, dy = this.intentY - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ease = clamp(dist / (this.r * 1.6 + 26), 0, 1);
    const boosting = this.boost && this.mass > CFG.BOOST.MIN_MASS;
    let sp = this.maxSpeed;
    if (boosting) sp *= CFG.BOOST.SPEED_MUL;
    if (this.speedT > 0) { sp *= CFG.POWERUP.SPEED_MUL; this.speedT = Math.max(0, this.speedT - dt); }
    if (this.magnetT > 0) this.magnetT = Math.max(0, this.magnetT - dt);
    if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (this.wormholeCooldown > 0) this.wormholeCooldown = Math.max(0, this.wormholeCooldown - dt);
    if (this.slingshotCooldown > 0) this.slingshotCooldown = Math.max(0, this.slingshotCooldown - dt);
    const desiredVX = (dx / dist) * sp * ease;
    const desiredVY = (dy / dist) * sp * ease;
    const k = CFG.PLAYER.ACCEL_LERP * (24 / (24 + this.r * 0.30));
    this.vx = damp(this.vx, desiredVX, k, dt);
    this.vy = damp(this.vy, desiredVY, k, dt);

    this.integrate(dt, world);

    this.pulse += dt * 2.1;
    this.diskAngle += dt * (0.55 + 26 / (this.r + 26));
    this.eatFlash = Math.max(0, this.eatFlash - dt * 2.6);
    if (this.shield > 0) this.shield = Math.max(0, this.shield - dt);
    if (this.mass > this.peakMass) this.peakMass = this.mass;

    if (boosting) {
      this.setMass(Math.max(CFG.BOOST.MIN_MASS, this.mass - CFG.BOOST.DRAIN * dt));
      this.boostTimer -= dt;
      if (this.boostTimer <= 0) {
        this.boostTimer = CFG.BOOST.PELLET_RATE;
        const ang = Math.atan2(this.vy, this.vx) + Math.PI + rand(-0.3, 0.3);
        // spawn behind the hole, not at its center — it would eat its own trail
        const pellet = new Dust(this.x + Math.cos(ang) * (this.r * 0.9 + 4), this.y + Math.sin(ang) * (this.r * 0.9 + 4));
        pellet.setMass(CFG.BOOST.PELLET_MASS);
        pellet.vx = Math.cos(ang) * 130 + this.vx * 0.35;
        pellet.vy = Math.sin(ang) * 130 + this.vy * 0.35;
        pellet.tint = this.color;
        pellet.ttl = CFG.BOOST.PELLET_LIFE * rand(0.8, 1.2);
        game.food.push(pellet);
      }
    }
    if (this.boost && this.mass <= CFG.BOOST.MIN_MASS) this.boost = false;

    if (this.boost) {
      this.trail.push(this.x, this.y);
      while (this.trail.length > 52) this.trail.splice(0, 2);
    } else if (this.trail.length) {
      this.trail.length = 0;   // only leave a trail while boosting
    }
  }

  consume(other) {
    this.setMass(this.mass + other.mass);
    this.absorbed++;
    if (other.type === "player") this.rivalsEaten++;
    this.eatFlash = 1;
    if (other.type === "player") this.shield = 0;
  }

  // instant burst forward, costs mass, on a cooldown — the "thread the gap" move
  tryDash(game) {
    if (this.dashCooldown > 0) return false;
    if (this.mass < CFG.DASH.MIN_MASS) return false;
    const dx = this.intentX - this.x, dy = this.intentY - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    const cost = this.mass * CFG.DASH.COST_RATIO;
    this.setMass(Math.max(CFG.DASH.MIN_MASS * 0.6, this.mass - cost));
    const world = game.world;
    this.x = clamp(this.x + nx * CFG.DASH.DISTANCE, this.r, world.w - this.r);
    this.y = clamp(this.y + ny * CFG.DASH.DISTANCE, this.r, world.h - this.r);
    this.vx = nx * this.maxSpeed * 1.4;
    this.vy = ny * this.maxSpeed * 1.4;
    this.dashCooldown = CFG.DASH.COOLDOWN;
    for (let i = 0; i < 8; i++) {
      const a = Math.atan2(ny, nx) + Math.PI + rand(-0.5, 0.5);
      const pellet = new Dust(this.x + Math.cos(a) * (this.r * 0.6), this.y + Math.sin(a) * (this.r * 0.6));
      pellet.setMass(cost / 10);
      pellet.vx = Math.cos(a) * 160; pellet.vy = Math.sin(a) * 160;
      pellet.tint = this.color;
      pellet.ttl = 1.4;
      game.food.push(pellet);
    }
    game.events.push({ type: "dash", hole: this, x: this.x, y: this.y });
    return true;
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
    this.speedT = 0;
    this.magnetT = 0;
    this.dashCooldown = 0;
    this.wormholeCooldown = 0;
    this.slingshotCooldown = 0;
    this.boost = false;
    this.boostTimer = 0;
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
    this.stuckT = 0;
    this.breakT = 0;
    this.boostUntil = 0;
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
      const W = CFG.WORLD.w, H = CFG.WORLD.h, M = 300;
      const dx = player.x - this.threat.x, dy = player.y - this.threat.y;
      const d = Math.hypot(dx, dy) || 1;
      const panic = Math.sin(this.jt * 4.2 + this.seed) * (1 - this.p.skill) * 0.5;
      let a = Math.atan2(dy, dx) + panic;
      const nearWall = player.x < M || player.x > W - M || player.y < M || player.y > H - M;
      if (d < 750 && nearWall) a += Math.sin(this.jt * 3.5 + this.seed) * 0.9;
      let gx = player.x + Math.cos(a) * 1100;
      let gy = player.y + Math.sin(a) * 1100;
      if (gx < M || gx > W - M || gy < M || gy > H - M) {
        let ta;
        if (player.x < M || player.x > W - M) {
          const dir = this.threat.y > player.y ? -1 : 1;
          ta = dir * (Math.PI / 2 + rand(-0.28, 0.28));
        } else {
          const dir = this.threat.x > player.x ? -1 : 1;
          ta = dir > 0 ? Math.PI + rand(-0.28, 0.28) : rand(-0.28, 0.28);
        }
        gx = clamp(player.x + Math.cos(ta) * 1100, M, W - M);
        gy = clamp(player.y + Math.sin(ta) * 1100, M, H - M);
      }
      this.goalX = gx; this.goalY = gy;
    } else if (this.state === "hunt" && this.target && !this.target.dead) {
      urgency = 0.55 + this.p.aggression * 0.45;

      const lead = this.p.skill * 0.35;
      this.goalX = this.target.x + this.target.vx * lead;
      this.goalY = this.target.y + this.target.vy * lead;
    } else {
      urgency = 0.35;
    }


    if (this.hesitate > 0) { this.goalX = player.x; this.goalY = player.y; urgency = 0.2; }


    const spd = Math.hypot(player.vx, player.vy);
    const nearWall = player.x < 300 || player.x > CFG.WORLD.w - 300 || player.y < 300 || player.y > CFG.WORLD.h - 300;
    if (nearWall || spd < 34) this.stuckT += dt; else this.stuckT = 0;
    if (this.stuckT > 2.5) { this.breakT = 1.2; this.stuckT = 0; }
    if (this.breakT > 0) {
      this.breakT -= dt;
      const cell = this.game.bestDensityCell(player.x, player.y, 1);
      const tx = cell ? cell.x : CFG.WORLD.w / 2;
      const ty = cell ? cell.y : CFG.WORLD.h / 2;
      this.goalX = clamp(player.x + (tx - player.x) * 0.9, 300, CFG.WORLD.w - 300);
      this.goalY = clamp(player.y + (ty - player.y) * 0.9, 300, CFG.WORLD.h - 300);
    }


    this.boostUntil -= dt;
    let wantsBoost = false;
    if (this.state === "flee" && this.threat) {
      const td = Math.hypot(this.threat.x - player.x, this.threat.y - player.y);
      if (this.boostUntil <= 0 && td < 900 && chance(0.45 + this.p.skill * 0.35)) this.boostUntil = rand(0.3, 0.85);
      wantsBoost = this.boostUntil > 0;
    } else if (this.state === "hunt" && this.target && !this.target.dead) {
      const hd = Math.hypot(this.target.x - player.x, this.target.y - player.y);
      if (this.boostUntil <= 0 && hd > 620 && hd < 1500 && chance(this.p.aggression * 0.22)) this.boostUntil = rand(0.25, 0.7);
      wantsBoost = this.boostUntil > 0;
    }
    player.boost = wantsBoost && player.mass > CFG.BOOST.MIN_MASS;

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
    this.rogueTimer = 0;
    this.lastRogueAt = -999;
    this.powerupTimer = CFG.POWERUP.SPAWN_EVERY * 0.5;
    this.wormholeTimer = 2;
    this.supernovaTimer = CFG.SUPERNOVA.EVERY * 0.5;
    this.matchMode = "classic";
    this.matchEndAt = null;


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
    this.rogueTimer = 0;
    this.lastRogueAt = -999;
    this.powerupTimer = CFG.POWERUP.SPAWN_EVERY * 0.5;
    this.wormholeTimer = 2;
    this.supernovaTimer = CFG.SUPERNOVA.EVERY * 0.5;
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
      matchEnd: false, won: false,
      peakMass: me.peakMass,
      rank: me.bestRank,
      time: this.time - me.spawnTime,
      absorbed: me.absorbed,
      rivalsEaten: me.rivalsEaten
    };
    this.events.push({ type: "death", hole: me, killer });
  }

  // timed match ran out, or you're the last one alive in elimination
  endMatchFor(player, rankOverride) {
    if (player.dead) return;
    // pass rankOverride when ending several players at once, ranks have to be
    // grabbed before anyone gets marked dead or they throw each other off
    const rank = rankOverride != null ? rankOverride : this.rankOf(player);
    player.bestRank = Math.min(player.bestRank, rank);
    player.dead = true;
    const won = rank === 1;
    this.events.push({ type: "matchend", hole: player, rank: player.bestRank, won });
    if (player === this.local) {
      this.state = "dead";
      this.deathCam = null;
      this.deathInfo = {
        killer: null, matchEnd: true, won,
        peakMass: player.peakMass,
        rank: player.bestRank,
        time: this.time - player.spawnTime,
        absorbed: player.absorbed,
        rivalsEaten: player.rivalsEaten
      };
    }
  }

  checkMatchEnd() {
    if (this.matchMode === "timed") {
      if (this.matchEndAt != null && this.time >= this.matchEndAt) {
        const survivors = this.players.filter(p => !p.dead);
        const ranks = new Map(survivors.map(p => [p, this.rankOf(p)]));
        for (const p of survivors) this.endMatchFor(p, ranks.get(p));
        this.matchEndAt = null;
      }
    } else if (this.matchMode === "elimination") {
      const alive = this.players.filter(p => !p.dead);
      if (alive.length === 1) this.endMatchFor(alive[0]);
    }
  }

  step(dt) {
    this.time += dt;


    this.gridTimer -= dt;
    if (this.gridTimer <= 0) { this.gridTimer = 0.5; this.rebuildGrid(); }

    for (const p of this.players) { if (!p.dead && p.controller) p.controller.update(p, dt); }
    for (const p of this.players) { if (!p.dead) p.step(dt, this); }

    this.buildSpatial();
    this.applyGravity(dt);
    this.applySlingshots(dt);

    for (const e of this.food) {
      if (e.dead) continue;
      if (e.type === "rogue") continue;
      if (e.ttl !== undefined && (e.ttl -= dt) <= 0) { e.dead = true; continue; }
      const d = Math.exp(-CFG.PHYSICS.DRAG * dt);
      e.vx *= d; e.vy *= d;
      e.integrate(dt, this.world);
    }

    this.buildSpatial();
    this.resolveEating();
    this.resolvePowerups();
    this.resolveWormholes();
    for (const p of this.particles) p.step(dt);

    this.rogueTimer -= dt;
    if (this.rogueTimer <= 0) { this.rogueTimer = CFG.ROGUE.CHECK_EVERY; this.maybeSpawnRogue(); }
    this.stepRogues(dt);

    this.powerupTimer -= dt;
    if (this.powerupTimer <= 0) { this.powerupTimer = CFG.POWERUP.SPAWN_EVERY * rand(0.8, 1.3); this.spawnPowerup(); }

    this.wormholeTimer -= dt;
    if (this.wormholeTimer <= 0) { this.wormholeTimer = CFG.WORMHOLE.RESPAWN_EVERY; this.spawnWormholePair(); }

    this.supernovaTimer -= dt;
    if (this.supernovaTimer <= 0) { this.supernovaTimer = CFG.SUPERNOVA.EVERY * rand(0.85, 1.2); this.triggerSupernova(); }

    this.checkMatchEnd();
    this.updateRanks();
    this.applyLeaderDecay(dt);
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


  // one cell per bucket; gravity + eating only touch what's inside the query circle
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
        if (B.type === "rogue") return;
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

  // graze a planet at speed and get a free burst, like a gravity assist
  applySlingshots(dt) {
    const { BAND_MIN_MUL, BAND_MAX_MUL, DUR, COOLDOWN, MIN_SPEED } = CFG.SLINGSHOT;
    for (const H of this.players) {
      if (H.dead || H.slingshotCooldown > 0) continue;
      const speed = Math.hypot(H.vx, H.vy);
      if (speed < MIN_SPEED) continue;
      for (const e of this.food) {
        if (e.type !== "planet") continue;
        const d = Math.hypot(e.x - H.x, e.y - H.y);
        if (d < e.r * BAND_MIN_MUL || d > e.r * BAND_MAX_MUL) continue;
        H.speedT = Math.max(H.speedT, DUR);
        H.slingshotCooldown = COOLDOWN;
        this.events.push({ type: "slingshot", hole: H, x: H.x, y: H.y });
        break;
      }
    }
  }

  applyLeaderDecay(dt) {
    const leader = this.ranked[0];
    if (!leader || leader.mass < CFG.DECAY.MIN_LEADER) return;
    const runnerUp = this.ranked[1];
    if (runnerUp && leader.mass < runnerUp.mass * CFG.DECAY.LEAD_RATIO) return;
    leader.setMass(Math.max(CFG.DECAY.MIN_LEADER, leader.mass - CFG.DECAY.RATE * dt));
  }

  triggerShockwave(H) {
    const R = H.r * CFG.SHOCKWAVE.RADIUS_MUL;
    this.queryCircle(H.x, H.y, R, (e) => {
      if (e === H || e.dead || e.type !== "player") return;
      if (e.mass >= H.mass) return;
      const dx = e.x - H.x, dy = e.y - H.y;
      const d = Math.hypot(dx, dy) || 1;
      const falloff = clamp(1 - d / R, 0, 1);
      const force = CFG.SHOCKWAVE.FORCE * falloff;
      e.vx += (dx / d) * force;
      e.vy += (dy / d) * force;
    });
    this.events.push({ type: "shockwave", x: H.x, y: H.y, r: R, hole: H });
  }


  resolveEating() {
    const { EAT_RATIO, EAT_OVERLAP } = CFG.PHYSICS;
    const holes = this.players.slice().sort((a, b) => b.mass - a.mass); // big holes eat first

    for (const H of holes) {
      if (H.dead) continue;

      const tryEat = (B) => {
        if (B === H || B.dead) return;
        if (B.type === "rogue" || B.type === "power" || B.type === "wormhole") return;
        if (B.type === "player" && H.team != null && B.team != null && H.team === B.team) return;
        if (B.shield > 0) return;
        if (H.mass < B.mass * EAT_RATIO) return;
        const d = Math.hypot(B.x - H.x, B.y - H.y);
        if (d > H.r * EAT_OVERLAP + B.r * 0.25) return;

        const lopsided = B.type === "player" && H.mass > B.mass * CFG.SHOCKWAVE.RATIO;

        B.dead = true;
        H.consume(B);
        this.spawnAbsorption(B, H);
        this.events.push({ type: "absorb", x: B.x, y: B.y, r: B.r, hole: H, victim: B });

        if (B.type === "player") {
          this.feed.unshift({ a: H.name, b: B.name, mine: H === this.local, victimIsMe: B === this.local, t: 6 });
          if (this.feed.length > 6) this.feed.length = 6;
          if (B === this.local) this.killLocal(H);
        }

        if (lopsided) this.triggerShockwave(H);
      };


      this.queryCircle(H.x, H.y, H.r * 1.6, tryEat);
    }
  }

  resolvePowerups() {
    for (const H of this.players) {
      if (H.dead) continue;
      const pad = H.r + CFG.POWERUP.RADIUS + CFG.POWERUP.PICKUP_PAD;
      this.queryCircle(H.x, H.y, pad, (e) => {
        if (e.type !== "power" || e.dead) return;
        const d = Math.hypot(e.x - H.x, e.y - H.y);
        if (d > H.r + CFG.POWERUP.RADIUS) return;
        e.dead = true;
        if (e.powerKind === "speed") H.speedT = CFG.POWERUP.SPEED_DUR;
        else if (e.powerKind === "magnet") H.magnetT = CFG.POWERUP.MAGNET_DUR;
        else if (e.powerKind === "shield") H.shield = Math.max(H.shield, CFG.POWERUP.SHIELD_DUR);
        this.events.push({ type: "power", kind: e.powerKind, hole: H, x: e.x, y: e.y });
      });
    }
  }

  spawnPowerup() {
    const x = rand(300, this.world.w - 300), y = rand(300, this.world.h - 300);
    this.food.push(new PowerUp(x, y, pick(POWER_KINDS)));
  }

  resolveWormholes() {
    for (const H of this.players) {
      if (H.dead || H.wormholeCooldown > 0) continue;
      this.queryCircle(H.x, H.y, CFG.WORMHOLE.RADIUS, (e) => {
        if (e.type !== "wormhole" || e.dead || H.wormholeCooldown > 0) return;
        const d = Math.hypot(e.x - H.x, e.y - H.y);
        if (d > CFG.WORMHOLE.RADIUS) return;
        const dest = this.food.find(f => f.type === "wormhole" && f.id === e.linkId);
        if (!dest) return;
        H.x = dest.x; H.y = dest.y;
        H.intentX = dest.x; H.intentY = dest.y;
        H.wormholeCooldown = CFG.WORMHOLE.COOLDOWN;
        H.shield = Math.max(H.shield, 1.2);
        this.events.push({ type: "wormhole", hole: H, x: dest.x, y: dest.y });
      });
    }
  }

  spawnWormholePair() {
    for (const f of this.food) if (f.type === "wormhole") f.dead = true;
    const pad = 500;
    const a = new Wormhole(rand(pad, this.world.w - pad), rand(pad, this.world.h - pad), 0);
    const b = new Wormhole(rand(pad, this.world.w - pad), rand(pad, this.world.h - pad), a.id);
    a.linkId = b.id;
    this.food.push(a, b);
  }

  triggerSupernova() {
    const x = rand(600, this.world.w - 600), y = rand(600, this.world.h - 600);
    const R = CFG.SUPERNOVA.RADIUS;
    const blast = (e) => {
      if (e.dead) return;
      const dx = e.x - x, dy = e.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > R) return;
      const falloff = clamp(1 - d / R, 0, 1);
      const force = CFG.SUPERNOVA.FORCE * falloff * falloff;
      e.vx += (dx / d) * force;
      e.vy += (dy / d) * force;
    };
    this.queryCircle(x, y, R, blast);
    this.events.push({ type: "supernova", x, y, r: R });
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


  maybeSpawnRogue() {
    if (this.state !== "playing") return;
    if (this.time - this.lastRogueAt < CFG.ROGUE.COOLDOWN) return;
    for (const e of this.food) if (e.type === "rogue" && !e.dead) return;
    const leader = this.ranked[0];
    if (!leader || leader.dead || leader.mass < CFG.ROGUE.MIN_LEADER) return;
    const runnerUp = this.ranked[1];
    if (!runnerUp || runnerUp.dead || leader.mass < runnerUp.mass * CFG.ROGUE.RATIO_LEAD) return;
    if (!chance(0.5)) return;
    const a = rand(0, TAU);
    const x = clamp(leader.x + Math.cos(a) * CFG.ROGUE.SPAWN_DIST, 300, this.world.w - 300);
    const y = clamp(leader.y + Math.sin(a) * CFG.ROGUE.SPAWN_DIST, 300, this.world.h - 300);
    this.food.push(new Rogue(x, y, leader.mass * CFG.ROGUE.MASS_MUL, leader));
    this.lastRogueAt = this.time;
  }

  stepRogues(dt) {
    for (const rg of this.food) {
      if (rg.type !== "rogue" || rg.dead) continue;
      rg.step(dt, this);
      if (rg.dead) continue;
      if (rg.target && !rg.target.dead && rg.target.mass < CFG.ROGUE.MIN_LEADER) { rg.dead = true; continue; }
      for (const H of this.players) {
        if (H.dead || H.shield > 0) continue;
        const d = Math.hypot(H.x - rg.x, H.y - rg.y);
        if (d > rg.r * 0.85 + H.r * 0.25) continue;
        if (rg.mass <= H.mass * CFG.PHYSICS.EAT_RATIO) continue;
        H.dead = true;
        this.spawnAbsorption(H, rg);
        this.events.push({ type: "absorb", x: H.x, y: H.y, r: H.r, hole: rg, victim: H });
        this.feed.unshift({ a: rg.name, b: H.name, mine: H === this.local, victimIsMe: H === this.local, t: 6 });
        if (this.feed.length > 6) this.feed.length = 6;
        if (H === this.local) this.killLocal(rg);
      }
    }
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
    for (const e of this.food) { if (e.type === "rogue") continue; counts[e.type]++; }

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

    if (this.matchMode !== "elimination") {
      const wanted = CFG.COUNTS.bots + (this.state === "playing" ? 1 : 0);
      const used = new Set(this.players.map(p => p.name));
      let guard = 0;
      while (this.players.length < wanted && guard++ < 4) this.spawnBot(used);
    }
  }
}

return {
  CFG, Game, Player, Rogue, Dust, Asteroid, Planet, Particle, PowerUp, Wormhole,
  HumanlikeController, RemoteIntentController,
  encodePlayer, decodePlayer, encodeFood, decodeFood, FOOD_TYPES, FOOD_TYPES_REV, POWER_KINDS,
  nextId, clamp, lerp, damp, rand, randi, pick, chance,
  radiusFromMass, massFromRadius, fmt, mmss, TAU, HANDLES, HUES
};
});
