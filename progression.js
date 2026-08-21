"use strict";

class Progression {
  static QUESTS = [
    { id: 1, name: "REACH 5000 MASS",      desc: "Grow to a peak mass of 5,000", track: "peakMass",    target: 5000, reward: 25 },
    { id: 2, name: "EAT 10 RIVALS",        desc: "Devour 10 rival holes",        track: "rivalsEaten", target: 10,   reward: 40 },
    { id: 3, name: "SURVIVE 2 MINUTES",    desc: "Stay alive for 2:00",          track: "time",         target: 120,  reward: 30 }
  ];

  static SHOP = {
    disk: [
      { id: "disk-cyan",    name: "CYAN DISK",     cost: 50, color: "#3ee8ff" },
      { id: "disk-gold",    name: "GOLD DISK",     cost: 50, color: "#ffcf5e" },
      { id: "disk-crimson", name: "CRIMSON DISK",  cost: 50, color: "#ff5e6c" },
      { id: "disk-violet",  name: "VIOLET DISK",   cost: 50, color: "#b06eff" }
    ],
    trail: [
      { id: "trail-emerald", name: "EMERALD TRAIL", cost: 40, color: "#54ff9f" },
      { id: "trail-magenta", name: "MAGENTA TRAIL", cost: 40, color: "#ff54d8" },
      { id: "trail-solar",   name: "SOLAR TRAIL",   cost: 40, color: "#ffb45e" }
    ],
    orb: [
      { id: "orb-diamond", name: "ORBITING DIAMOND", cost: 60, color: "#ffffff" },
      { id: "orb-twin",    name: "TWIN ORBITER",     cost: 60, color: "#7fd0ff" }
    ]
  };

  static CATEGORY_NAMES = { disk: "ACCRETION DISKS", trail: "PHOTON RING TRAILS", orb: "ORBITING SHAPES" };

  constructor() {
    this.tokens = 0;
    this.quests = {};
    this.best = {};
    this.unlocked = [];
    this.equipped = {};
    this._load();
  }


  _load() {
    try {
      this.tokens = parseInt(localStorage.getItem("bh_saved_tokens") || "0", 10) || 0;
      this.quests = JSON.parse(localStorage.getItem("bh_quests") || "null") || {};
      this.best = JSON.parse(localStorage.getItem("bh_quest_best") || "{}") || {};
      this.unlocked = JSON.parse(localStorage.getItem("bh_unlocked_cosmetics") || "[]") || [];
      this.equipped = JSON.parse(localStorage.getItem("bh_equipped_cosmetics") || "{}") || {};
    } catch (e) {}

    for (const q of Progression.QUESTS) if (!(q.id in this.quests)) this.quests[q.id] = false;
    for (const q of Progression.QUESTS) if (!(q.track in this.best)) this.best[q.track] = 0;
    this._saveAll();
  }
  _saveAll() {
    try {
      localStorage.setItem("bh_saved_tokens", String(this.tokens));
      localStorage.setItem("bh_quests", JSON.stringify(this.quests));
      localStorage.setItem("bh_quest_best", JSON.stringify(this.best));
      localStorage.setItem("bh_unlocked_cosmetics", JSON.stringify(this.unlocked));
      localStorage.setItem("bh_equipped_cosmetics", JSON.stringify(this.equipped));
    } catch (e) {}
  }


  addTokens(n) {
    if (n > 0) { this.tokens += n; this._saveAll(); }
    return this.tokens;
  }
  spendTokens(n) {
    if (this.tokens < n) return false;
    this.tokens -= n;
    this._saveAll();
    return true;
  }


  endRun(stats) {
    const runTokens = Math.floor((stats.peakMass || 0) / 500) + ((stats.rivalsEaten || 0) * 10);
    let questRewards = 0;
    const completed = [];
    for (const q of Progression.QUESTS) {
      const v = stats[q.track] || 0;
      if (v > this.best[q.track]) this.best[q.track] = v;
      if (!this.quests[q.id] && this.best[q.track] >= q.target) {
        this.quests[q.id] = true;
        questRewards += q.reward;
        completed.push(q);
      }
    }
    if (questRewards > 0) this.addTokens(questRewards);
    this._saveAll();
    return { runTokens, questRewards, completed };
  }

  questProgress(q) {
    const v = this.best[q.track] || 0;
    return { value: v, done: !!this.quests[q.id] };
  }


  item(id) {
    for (const cat of Object.keys(Progression.SHOP)) {
      const found = Progression.SHOP[cat].find(i => i.id === id);
      if (found) return Object.assign({ cat }, found);
    }
    return null;
  }
  owns(id) { return this.unlocked.includes(id); }
  buy(id) {
    const item = this.item(id);
    if (!item || this.owns(id)) return "owned";
    if (!this.spendTokens(item.cost)) return "broke";
    this.unlocked.push(id);
    this._saveAll();
    return "ok";
  }
  equip(id) {
    const item = this.item(id);
    if (!item || !this.owns(id)) return false;
    this.equipped[item.cat] = id;
    this._saveAll();
    return true;
  }


  equippedColors() {
    const out = { disk: null, trail: null, orb: null };
    for (const cat of Object.keys(out)) {
      const id = this.equipped[cat];
      const item = id ? this.item(id) : null;
      if (item) out[cat] = item.color;
    }
    return out;
  }


  static fmt(n) { return Math.round(n).toLocaleString("en-US"); }

  updateTokenUI() {
    const el = document.getElementById("token-balance");
    if (el) el.textContent = Progression.fmt(this.tokens);
  }

  renderQuests() {
    const el = document.getElementById("quest-log");
    if (!el) return;
    let html = "";
    for (const q of Progression.QUESTS) {
      const p = this.questProgress(q);
      const pct = Math.min(1, p.value / q.target);
      const bar = "█".repeat(Math.round(pct * 10)).padEnd(10, "░");
      html +=
        '<div class="quest-entry">' +
          '<div class="quest-entry-head">' +
            '<span class="quest-name">' + q.name + '</span>' +
            '<span class="quest-reward">+' + q.reward + ' TOKENS</span>' +
          '</div>' +
          '<div class="quest-desc">' + q.desc + '</div>' +
          '<div class="quest-progress">' + bar + ' ' + Progression.fmt(p.value) + ' / ' + Progression.fmt(q.target) + '</div>' +
          '<div class="quest-status' + (p.done ? ' quest-status-done">DONE' : '">IN PROGRESS') + '</div>' +
        '</div>';
    }
    el.innerHTML = html;
  }

  renderShop() {
    const el = document.getElementById("cosmetics-shop");
    if (!el) return;
    let html = "";
    for (const cat of Object.keys(Progression.SHOP)) {
      html += '<div class="shop-category">' +
        '<div class="shop-category-name">' + Progression.CATEGORY_NAMES[cat] + '</div>';
      for (const item of Progression.SHOP[cat]) {
        const owned = this.owns(item.id);
        const equipped = this.equipped[cat] === item.id;
        html += '<div class="shop-item">' +
          '<span class="shop-item-name">' + item.name + '</span>' +
          '<span class="shop-item-cost">' + Progression.fmt(item.cost) + ' TOKENS</span>';
        if (equipped) {
          html += '<button class="shop-item-action shop-item-action-equipped" data-action="none" data-id="' + item.id + '" disabled>EQUIPPED</button>';
        } else if (owned) {
          html += '<button class="shop-item-action" data-action="equip" data-id="' + item.id + '">EQUIP</button>';
        } else {
          html += '<button class="shop-item-action" data-action="buy" data-id="' + item.id + '">BUY</button>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
    el.innerHTML = html;
  }

  refreshUI() { this.updateTokenUI(); this.renderQuests(); this.renderShop(); }
}

if (typeof window !== "undefined") window.Progression = Progression;
if (typeof module !== "undefined" && module.exports) module.exports = Progression;
