'use strict';

/** Deterministic game rules. Rendering, audio and browser storage live in game.js. */
class FruitEngine {
  static MODES = {
    classic: { name: '经典', duration: Infinity, bombs: true },
    arcade: { name: '街机', duration: 60, bombs: true },
    zen: { name: '禅境', duration: 90, bombs: false },
  };

  constructor({ width = 1280, height = 720, random = Math.random } = {}) {
    this.width = width;
    this.height = height;
    this.random = random;
    this.phase = 'menu';
    this.mode = 'classic';
    this.entities = [];
    this.events = [];
    this.effects = { double: 0, freeze: 0, frenzy: 0 };
    this.score = 0;
    this.misses = 0;
    this.remaining = Infinity;
    this.blitz = 0;
    this.blitzRemaining = 0;
    this.stats = this.emptyStats();
    this.nextId = 1;
  }

  emptyStats() {
    return { cut: 0, criticals: 0, bombs: 0, combos: 0, maxCombo: 0, bonus: 0, bossHits: 0 };
  }

  range(min, max) { return min + this.random() * (max - min); }
  emit(type, payload = {}) { this.events.push({ type, ...payload }); }
  drainEvents() { return this.events.splice(0); }
  get multiplier() { return this.effects.double > 0 ? 2 : 1; }

  start(mode) {
    if (!Object.hasOwn(FruitEngine.MODES, mode)) throw new Error('Invalid game mode');
    this.mode = mode;
    this.phase = 'countdown';
    this.score = this.misses = this.elapsed = 0;
    this.remaining = FruitEngine.MODES[mode].duration;
    this.countdown = 3;
    this.countdownNumber = 3;
    this.waveIn = 0.2;
    this.specialIn = 3.5;
    this.specialIndex = Math.floor(this.random() * 3);
    this.blitz = this.comboChain = this.blitzRemaining = 0;
    this.stroke = { count: 0, age: 0, x: 0, y: 0, multiplier: 1 };
    this.effects = { double: 0, freeze: 0, frenzy: 0 };
    this.stats = this.emptyStats();
    this.awards = [];
    this.entities = [];
    this.events = [];
    this.bossStarted = false;
    this.emit('countdown', { number: 3 });
  }

  home() {
    this.phase = 'menu';
    this.entities = [];
    this.effects = { double: 0, freeze: 0, frenzy: 0 };
    this.events = [];
  }

  togglePause() {
    if (this.phase === 'paused') {
      this.phase = this.beforePause;
      this.emit('resume');
    } else if (['countdown', 'playing', 'finale'].includes(this.phase)) {
      this.endStroke();
      this.beforePause = this.phase;
      this.phase = 'paused';
      this.emit('pause');
    }
  }

  snapshot() {
    return {
      phase: this.phase, mode: this.mode, score: this.score, misses: this.misses,
      seconds: Number.isFinite(this.remaining) ? Math.ceil(this.remaining) : null,
      effects: { ...this.effects }, blitz: this.blitz,
      fruitCount: this.entities.filter(f => !f.dead && !f.bomb).length,
      stats: { ...this.stats },
    };
  }

  spawn({ type, x, y, vx, vy, radius, special, bomb = false, boss = false } = {}) {
    const r = radius || Math.max(28, Math.min(this.width * 0.047, 53));
    const px = x ?? this.range(r, this.width - r);
    const gravity = this.height * 0.9;
    const apex = Math.max(180, Math.min(this.height * 0.64, 570));
    const fruit = {
      id: this.nextId++, type: type ?? Math.floor(this.random() * 5),
      x: px, y: y ?? this.height + r * 1.5, r,
      vx: vx ?? (this.width / 2 - px) * 0.17 + this.range(-50, 50),
      vy: vy ?? -Math.sqrt(2 * gravity * apex) + this.range(-35, 20),
      angle: this.range(-0.6, 0.6), spin: this.range(-1.5, 1.5),
      special, bomb, boss, dead: false, entered: false, cooldown: 0,
    };
    this.entities.push(fruit);
    return fruit;
  }

  spawnWave() {
    const frenzy = this.effects.frenzy > 0;
    const count = frenzy ? 7 : Math.min(6, 3 + Math.floor(this.elapsed / 25) + Math.floor(this.random() * 2));
    const r = Math.max(28, Math.min(this.width * 0.047, 53));
    const center = this.range(this.width * 0.28, this.width * 0.72);
    for (let i = 0; i < count; i++) {
      const x = Math.max(r, Math.min(this.width - r, center + (i - (count - 1) / 2) * r * 1.3));
      this.spawn({ x, radius: r * this.range(0.86, 1.1) });
    }
    if (FruitEngine.MODES[this.mode].bombs && !frenzy && this.elapsed > 3 && this.random() < 0.34) {
      this.spawn({ type: 5, bomb: true, x: this.range(this.width * 0.2, this.width * 0.8), radius: r });
    }
    this.waveIn = frenzy ? 0.4 : this.range(1.2, 1.65) / (1 + this.blitz * 0.09);
  }

  spawnBanana() {
    const effect = ['double', 'freeze', 'frenzy'][this.specialIndex++ % 3];
    this.spawn({ type: { double: 6, freeze: 7, frenzy: 8 }[effect], special: effect,
      x: this.range(this.width * 0.25, this.width * 0.75), radius: Math.max(35, Math.min(this.width * 0.06, 65)) });
    this.specialIn = this.range(3.3, 4.1);
  }

  activate(effect, fruit) {
    this.effects[effect] = 8;
    if (effect === 'frenzy') {
      this.entities.forEach(f => { if (f.bomb) f.dead = true; });
      this.waveIn = 0;
    }
    this.emit('power', { effect, fruit: { ...fruit } });
    if (Object.values(this.effects).every(t => t > 0)) this.emit('stack');
  }

  cut(fruit) {
    if (fruit.dead || !['playing', 'finale'].includes(this.phase)) return;
    if (fruit.boss) {
      if (fruit.cooldown > 0) return;
      fruit.cooldown = 0.075;
      this.stats.bossHits++;
      const points = this.multiplier;
      this.score += points;
      this.emit('bossHit', { fruit: { ...fruit }, points, hits: this.stats.bossHits });
      return;
    }
    fruit.dead = true;
    if (fruit.bomb) {
      this.stats.bombs++;
      this.stroke.count = 0;
      this.comboChain = this.blitz = this.blitzRemaining = 0;
      this.effects = { double: 0, freeze: 0, frenzy: 0 };
      this.entities.forEach(f => { f.dead = true; });
      this.emit('bomb', { fruit: { ...fruit } });
      if (this.mode === 'classic') {
        this.phase = 'ending';
        this.endingIn = 0.8;
        this.endReason = '碰到了炸弹';
      } else this.score = Math.max(0, this.score - 10);
      return;
    }
    if (fruit.special) {
      this.activate(fruit.special, fruit);
      this.emit('slice', { fruit: { ...fruit }, points: 0, critical: false });
      return;
    }
    const critical = this.mode !== 'zen' && this.random() < 0.08;
    const points = (critical ? 11 : 1) * this.multiplier;
    this.score += points;
    this.stats.cut++;
    if (critical) this.stats.criticals++;
    this.stroke.count++;
    this.stroke.age = 0;
    this.stroke.x = fruit.x;
    this.stroke.y = fruit.y;
    this.stroke.multiplier = Math.max(this.stroke.multiplier, this.multiplier);
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.stroke.count);
    this.emit('slice', { fruit: { ...fruit }, points, critical });
  }

  endStroke() {
    if (!this.stroke) return;
    const { count, x, y, multiplier } = this.stroke;
    if (count >= 3) {
      this.stats.combos++;
      let blitzBonus = 0;
      if (this.mode === 'arcade') {
        this.comboChain++;
        const oldLevel = this.blitz;
        this.blitz = Math.min(3, Math.floor(this.comboChain / 2));
        this.blitzRemaining = 6;
        blitzBonus = this.blitz * 5;
        if (this.blitz > oldLevel) this.emit('blitz', { level: this.blitz });
      }
      const bonus = (count + blitzBonus) * multiplier;
      this.score += bonus;
      this.stats.bonus += bonus;
      this.emit('combo', { count, bonus, x, y, blitz: this.blitz });
    }
    this.stroke = { count: 0, age: 0, x: 0, y: 0, multiplier: 1 };
  }

  static segmentDistance(x, y, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len)) : 0;
    return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
  }

  swipe(a, b) {
    if (!['playing', 'finale'].includes(this.phase) || Math.hypot(b.x - a.x, b.y - a.y) < 3) return;
    for (const fruit of this.entities) {
      if (!fruit.dead && FruitEngine.segmentDistance(fruit.x, fruit.y, a, b) < fruit.r * 0.88) {
        this.cut(fruit);
        if (!['playing', 'finale'].includes(this.phase)) break;
      }
    }
  }

  startFinale() {
    this.endStroke();
    this.phase = 'finale';
    this.bossStarted = true;
    this.bossRemaining = 4.5;
    this.entities = [];
    this.effects.freeze = this.effects.frenzy = 0;
    this.spawn({ type: 9, boss: true, x: this.width / 2, y: this.height * 0.5,
      vx: 0, vy: 0, radius: Math.max(58, Math.min(this.width * 0.12, 95)) });
    this.emit('finale');
  }

  finish(reason) {
    this.endStroke();
    this.phase = 'over';
    this.endReason = reason;
    if (this.mode === 'arcade') {
      this.awards = [
        { label: '连击大师', points: Math.min(60, this.stats.maxCombo * 3) },
        { label: this.stats.bombs ? '勇往直前' : '完美避弹', points: this.stats.bombs ? 0 : 30 },
        { label: '水果风暴', points: Math.min(60, Math.floor(this.stats.cut / 10) * 5) },
      ];
      this.score += this.awards.reduce((sum, award) => sum + award.points, 0);
    }
    this.entities = [];
    this.emit('over', { reason, score: this.score, stats: { ...this.stats }, awards: this.awards });
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt < 0) throw new Error('Invalid delta time');
    if (['menu', 'paused', 'over'].includes(this.phase)) return;
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      const number = Math.ceil(this.countdown);
      if (number > 0 && number !== this.countdownNumber) {
        this.countdownNumber = number;
        this.emit('countdown', { number });
      }
      if (this.countdown <= 0) { this.phase = 'playing'; this.emit('start'); }
      return;
    }
    if (this.phase === 'ending') {
      this.endingIn -= dt;
      if (this.endingIn <= 0) this.finish(this.endReason);
      return;
    }
    if (this.phase === 'finale') {
      this.bossRemaining -= dt;
      for (const f of this.entities) {
        f.cooldown = Math.max(0, f.cooldown - dt);
        f.y = this.height * 0.5 + Math.sin(this.bossRemaining * 3) * 12;
        f.angle = Math.sin(this.bossRemaining * 2) * 0.08;
      }
      if (this.bossRemaining <= 0) {
        const bonus = this.stats.bossHits * 2;
        this.score += bonus;
        this.stats.bonus += bonus;
        this.emit('bossBurst', { fruit: { ...this.entities[0] }, bonus });
        this.finish('时间到');
      }
      return;
    }

    const worldDt = dt * (this.effects.freeze > 0 ? 0.43 : 1);
    this.elapsed += dt;
    this.remaining = Math.max(0, this.remaining - worldDt);
    for (const key of Object.keys(this.effects)) this.effects[key] = Math.max(0, this.effects[key] - dt);
    this.blitzRemaining = Math.max(0, this.blitzRemaining - dt);
    if (!this.blitzRemaining) this.blitz = this.comboChain = 0;
    this.stroke.age += dt;
    if (this.stroke.count && this.stroke.age > 0.24) this.endStroke();
    if (this.mode === 'arcade' && this.remaining <= 3 && !this.bossStarted) {
      this.startFinale();
      return;
    }
    if (this.remaining <= 0) { this.finish('时间到'); return; }
    this.waveIn -= worldDt;
    if (this.waveIn <= 0) this.spawnWave();
    if (this.mode === 'arcade') {
      this.specialIn -= dt;
      if (this.specialIn <= 0) this.spawnBanana();
    }
    const gravity = this.height * 0.9;
    for (const f of this.entities) {
      if (f.dead) continue;
      f.x += f.vx * worldDt;
      f.vy += gravity * worldDt;
      f.y += f.vy * worldDt;
      f.angle += f.spin * worldDt;
      if (f.y < this.height - f.r) f.entered = true;
      if (f.y > this.height + f.r * 3 && f.vy > 0) {
        f.dead = true;
        if (!f.bomb && !f.special && f.entered && this.mode === 'classic') {
          this.misses++;
          this.emit('miss', { x: f.x });
          if (this.misses >= 3) { this.finish('漏切了三个水果'); return; }
        }
      }
    }
    this.entities = this.entities.filter(f => !f.dead);
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = FruitEngine;
else window.FruitEngine = FruitEngine;
