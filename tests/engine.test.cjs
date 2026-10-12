const test = require('node:test');
const assert = require('node:assert/strict');
const FruitEngine = require('../engine.js');

function running(mode = 'arcade', random = () => 0.5) {
  const game = new FruitEngine({ random });
  game.start(mode); game.update(3); game.drainEvents();
  game.waveIn = game.specialIn = Infinity;
  return game;
}
function fruit(game, options = {}) {
  return game.spawn({ type: 0, x: 400, y: 300, vx: 0, vy: 0, radius: 40, ...options });
}
function combo(game) {
  for (let i = 0; i < 3; i++) game.cut(fruit(game));
  game.endStroke();
}

test('all three modes start with their own duration; invalid mode preserves state', () => {
  for (const [mode, duration] of [['classic', Infinity], ['arcade', 60], ['zen', 90]]) {
    const game = running(mode);
    assert.equal(game.phase, 'playing'); assert.equal(game.remaining, duration);
    assert.throws(() => game.start('unknown'));
    assert.equal(game.mode, mode);
  }
});
test('a swipe through three fruit doubles their base score and never cuts them twice', () => {
  const game = running('classic');
  for (let i = 0; i < 3; i++) fruit(game, { x: 300 + i * 90 });
  game.swipe({ x: 220, y: 300 }, { x: 580, y: 300 }); game.endStroke();
  assert.equal(game.score, 18); assert.equal(game.stats.maxCombo, 3);
  game.swipe({ x: 220, y: 300 }, { x: 580, y: 300 });
  assert.equal(game.score, 18);
});
test('swipes outside the collision radius do not score', () => {
  const game = running(); fruit(game);
  game.swipe({ x: 300, y: 200 }, { x: 500, y: 200 });
  assert.equal(game.score, 0);
});
test('critical adds ten extra points; double banana multiplies critical and combo score', () => {
  const game = running('arcade', () => 0);
  game.cut(fruit(game, { type: 6, special: 'double' }));
  game.cut(fruit(game));
  assert.equal(game.score, 26); assert.equal(game.stats.criticals, 1);
  game.cut(fruit(game)); game.cut(fruit(game)); game.endStroke();
  assert.equal(game.score, 96);
});
test('banana effects stack, refresh and expire independently', () => {
  const game = running();
  for (const effect of ['double', 'freeze', 'frenzy']) game.activate(effect, fruit(game));
  assert.equal(game.multiplier, 2); assert.ok(game.events.some(e => e.type === 'stack'));
  game.update(4); assert.equal(game.effects.double, 4);
  game.activate('double', fruit(game)); game.update(4.1);
  assert.ok(game.effects.double > 0); assert.equal(game.effects.freeze, 0); assert.equal(game.effects.frenzy, 0);
});
test('freeze slows fruit motion and countdown; pause freezes effect expiry too', () => {
  const game = running(); const f = fruit(game, { vx: 100 });
  game.activate('freeze', f); game.update(1);
  assert.ok(Math.abs(game.remaining - 59.57) < 0.001);
  assert.ok(Math.abs(f.x - 443) < 0.001);
  game.togglePause(); const snapshot = game.snapshot(); game.update(5);
  assert.deepEqual(game.snapshot(), snapshot); game.togglePause(); assert.equal(game.phase, 'playing');
});
test('frenzy removes bombs and spawns seven-fruit waves without new bombs', () => {
  const game = running(); const bomb = fruit(game, { type: 5, bomb: true });
  game.activate('frenzy', fruit(game)); assert.equal(bomb.dead, true);
  game.elapsed = 20; game.spawnWave();
  assert.equal(game.entities.filter(f => !f.dead && f.bomb).length, 0);
  assert.equal(game.entities.filter(f => !f.dead && !f.bomb).length, 8);
});
test('arcade bombs subtract ten, reset Blitz and effects, and never produce a negative score', () => {
  const game = running(); combo(game); combo(game); assert.equal(game.blitz, 1);
  game.activate('double', fruit(game)); game.cut(fruit(game, { type: 5, bomb: true }));
  assert.equal(game.score, 31); assert.equal(game.blitz, 0); assert.equal(game.multiplier, 1);
  game.score = 4; game.cut(fruit(game, { type: 5, bomb: true })); assert.equal(game.score, 0); assert.equal(game.phase, 'playing');
});
test('continuous combos reach MEGA BLITZ; six seconds without combo resets it', () => {
  const game = running(); for (let i = 0; i < 6; i++) combo(game);
  assert.equal(game.blitz, 3); assert.ok(game.stats.bonus > 18);
  game.update(6.1); assert.equal(game.blitz, 0); assert.equal(game.comboChain, 0);
});
test('classic bomb ends the round after explosion delay', () => {
  const game = running('classic'); game.cut(fruit(game, { type: 5, bomb: true }));
  assert.equal(game.phase, 'ending'); game.update(0.81); assert.equal(game.phase, 'over');
});
test('three missed fruits end Classic; missed bananas and bombs do not count', () => {
  const game = running('classic');
  for (let i = 0; i < 3; i++) { const f = fruit(game, { y: 900, vy: 100 }); f.entered = true; }
  game.update(0.1); assert.equal(game.phase, 'over'); assert.equal(game.misses, 3);
});
test('Zen has no bombs or critical hits and ends at 90 seconds', () => {
  const game = running('zen', () => 0); game.elapsed = 30; game.spawnWave();
  assert.ok(game.entities.every(f => !f.bomb)); game.cut(fruit(game));
  assert.equal(game.score, 3); assert.equal(game.stats.criticals, 0);
  game.update(90); assert.equal(game.phase, 'over');
});
test('arcade finale counts distinct slashes, rejects duplicate samples and grants awards once', () => {
  const game = running(); game.remaining = 3; game.update(0.01);
  assert.equal(game.phase, 'finale'); const boss = game.entities[0];
  game.cut(boss); game.cut(boss); assert.equal(game.stats.bossHits, 1);
  game.update(0.08); game.cut(boss); assert.equal(game.stats.bossHits, 2);
  game.update(4.5); assert.equal(game.phase, 'over');
  assert.equal(game.awards.length, 3); assert.equal(game.score, 36);
  const final = game.score; game.update(10); assert.equal(game.score, final);
});
test('countdown and finale both support pause/resume', () => {
  const game = new FruitEngine(); game.start('arcade'); game.togglePause(); game.update(10);
  assert.equal(game.countdown, 3); game.togglePause(); assert.equal(game.phase, 'countdown');
  game.update(3); game.startFinale(); game.togglePause(); game.update(10);
  assert.equal(game.bossRemaining, 4.5); game.togglePause(); assert.equal(game.phase, 'finale');
});

test('all eleven fruits carry distinct bounties and mixed combos reward variety', () => {
  const game = running('zen');
  assert.equal(FruitEngine.FRUITS.length, 11);
  for (const item of FruitEngine.FRUITS) {
    const before = game.score; game.cut(fruit(game, { type: item.type }));
    assert.equal(game.score - before, item.points); game.endStroke();
  }
  const mixed = running('zen');
  for (const type of [2, 10, 14]) mixed.cut(fruit(mixed, { type }));
  mixed.endStroke(); assert.equal(mixed.score, 33);
  assert.equal(mixed.events.find(e => e.type === 'combo').variety, 9);
  const doubled = running('zen'); doubled.effects.double = 8;
  for (const type of [2, 10, 14]) doubled.cut(fruit(doubled, { type }));
  doubled.endStroke(); assert.equal(doubled.score, 66);
});

test('fruit apex reaches the upper screen on portrait and landscape displays', () => {
  for (const [width, height] of [[390,844],[782,1091],[1280,720],[900,440]]) {
    const game = new FruitEngine({width,height,random:()=>0.5});
    game.start('classic'); game.update(3); game.waveIn = Infinity;
    const f = game.spawn({x:width/2,vx:0}); let top = f.y;
    for (let i=0;i<240;i++) { game.update(1/120); top = Math.min(top,f.y); }
    assert.ok(top < height * 0.42, `apex ${top} on ${width}x${height}`);
    assert.ok(top > 100, 'fruit must clear the top HUD');
  }
});

test('Classic starts gently then gradually increases waves and bomb frequency', () => {
  const game = running('classic',()=>0);
  game.elapsed = 10; game.spawnWave();
  assert.equal(game.entities.length,2); assert.ok(game.waveIn >= 2);
  assert.ok(game.entities.every(f=>!f.bomb));
  game.entities=[]; game.elapsed=120; game.spawnWave();
  assert.equal(game.entities.filter(f=>!f.bomb).length,5);
  assert.equal(game.entities.filter(f=>f.bomb).length,1);
  assert.ok(game.waveIn < 2);
});
