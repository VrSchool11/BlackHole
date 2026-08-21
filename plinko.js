"use strict";

class Plinko {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.W = canvas.width;
    this.H = canvas.height;

    this.SLOTS = [1, 1.2, 1.5, 2, 1.5, 1.2, 1];
    this.pegR = 5;
    this.ballR = 9;
    this.gravity = 1500;
    this.restitution = 0.34;
    this.onLanded = null;
    this.ball = null;
    this.landed = false;
    this.landedIdx = -1;
    this.raf = null;
    this.last = 0;
    this.timer = 0;
    this.buildPegs();
    this.drawIdle();
  }

  buildPegs() {
    const pegs = [];
    const rows = 12;
    const top = 46, bottom = this.H - 78;
    const left = 24, right = this.W - 24;
    for (let i = 0; i < rows; i++) {
      const n = i + 1;
      const y = top + (i * (bottom - top)) / (rows - 1);
      for (let j = 0; j < n; j++) {
        const x = n === 1 ? this.W / 2 : left + (j * (right - left)) / (n - 1);
        pegs.push({ x, y, r: this.pegR });
      }
    }
    this.pegs = pegs;
    this.floorY = this.H - 60;
    this.slotW = this.W / this.SLOTS.length;
  }


  reset() {
    this.ball = null;
    this.landed = false;
    this.landedIdx = -1;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.drawIdle();
  }

  drop() {
    if (this.landed || this.ball) return;
    this.ball = { x: this.W / 2 + (Math.random() - 0.5) * 10, y: 12, vx: 0, vy: 0 };
    this.landed = false;
    this.timer = 0;
    this.last = performance.now();
    const loop = now => {

      if (!this.ball) { this.raf = null; return; }
      const dt = Math.min((now - this.last) / 1000, 1 / 30);
      this.last = now;
      this.step(dt);
      this.draw();
      if (this.landed) { this.raf = null; return; }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }


  step(dt) {
    const b = this.ball;
    b.vy += this.gravity * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;


    if (b.x < this.ballR) { b.x = this.ballR; b.vx *= -0.5; }
    if (b.x > this.W - this.ballR) { b.x = this.W - this.ballR; b.vx *= -0.5; }


    for (const p of this.pegs) {
      const dx = b.x - p.x, dy = b.y - p.y;
      const d = Math.hypot(dx, dy);
      const min = this.ballR + p.r;
      if (d < min && d > 0) {
        const nx = dx / d, ny = dy / d;
        b.x = p.x + nx * min;
        b.y = p.y + ny * min;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx -= (1 + this.restitution) * vn * nx;
          b.vy -= (1 + this.restitution) * vn * ny;
        }
      }
    }


    if (b.y + this.ballR >= this.floorY) {
      b.y = this.floorY - this.ballR;
      b.vy = 0;
      b.vx *= 0.9;
      if (Math.abs(b.vx) < 6) this.land(b.x);
    }


    this.timer += dt;
    if (!this.landed && this.timer > 12) {
      b.y = this.floorY - this.ballR;
      b.vy = 0;
      b.vx = 0;
      this.land(b.x);
    }
  }


  land(slotX) {
    this.landed = true;
    this.landedIdx = Math.min(this.SLOTS.length - 1, Math.max(0, Math.floor(slotX / this.slotW)));
    if (this.onLanded) this.onLanded(this.SLOTS[this.landedIdx], this.landedIdx);
  }


  slotLabel(m) { return (m === Math.round(m) ? String(m) : m.toFixed(1)) + "x"; }

  drawIdle() { this.draw(); }

  draw() {
    const ctx = this.ctx, W = this.W, H = this.H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(4,10,18,0.55)";
    ctx.fillRect(0, 0, W, H);


    for (let i = 0; i < this.SLOTS.length; i++) {
      const x = i * this.slotW;
      const hot = this.landed && i === this.landedIdx;
      ctx.fillStyle = hot ? "rgba(120,222,255,0.55)" : "rgba(80,120,180,0.28)";
      ctx.fillRect(x + 2, this.floorY, this.slotW - 4, H - this.floorY);
      ctx.strokeStyle = "rgba(160,200,255,0.5)";
      ctx.strokeRect(x + 2, this.floorY, this.slotW - 4, H - this.floorY);
      ctx.fillStyle = hot ? "#ffffff" : "#a8d0f0";
      ctx.font = "bold 15px monospace";
      ctx.textAlign = "center";
      ctx.fillText(this.slotLabel(this.SLOTS[i]), x + this.slotW / 2, this.floorY + 28);
    }


    ctx.fillStyle = "rgba(170,200,240,0.75)";
    for (const p of this.pegs) {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }


    if (this.ball) {
      const b = this.ball;
      ctx.save();
      ctx.shadowBlur = 14; ctx.shadowColor = "#7fd0ff";
      ctx.fillStyle = "#eaf6ff";
      ctx.beginPath(); ctx.arc(b.x, b.y, this.ballR, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
}

if (typeof window !== "undefined") window.Plinko = Plinko;
if (typeof module !== "undefined" && module.exports) module.exports = Plinko;
