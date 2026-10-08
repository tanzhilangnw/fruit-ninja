'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const game = new FruitEngine({ width: innerWidth, height: innerHeight });
  const atlas = new Image(), specials = new Image();
  atlas.src = 'fruits.png'; specials.src = 'specials.png';
  const crops = [[0,0,512,460],[512,0,512,460],[1024,0,512,460],[0,460,512,564],[512,460,512,564],[1024,460,512,564]];
  const juice = ['#f34853','#ffb52e','#f85735','#ffd94c','#ef3258','#f4a743','#78b9ff','#93eaff','#ff8143','#e82b57'];
  const effectNames = { double: '双倍得分', freeze: '冰冻时间', frenzy: '水果狂热' };
  const bladeColors = { frost: '#9ce8ff', ember: '#ffab55', violet: '#d5a9ff' };
  const halves = [], particles = [], stains = [], labels = [], rings = [], trail = [];
  let width = innerWidth, height = innerHeight, lastFrame = 0, activePointer = null, previous = null;
  let shake = 0, flash = 0, messageLife = 0, audio = null, loading = true, hudKey = '', ambient = 0;
  const random = (min,max) => min + Math.random() * (max-min);
  const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function read(key,fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
  function write(key,value) { try { localStorage.setItem(key,String(value)); } catch {} }
  function best(mode = game.mode) { return Number(read('dojo-best-'+mode,0)) || 0; }
  let blade = read('dojo-blade','frost'), background = read('dojo-background','wood'), sound = read('dojo-sound','on') !== 'off';
  if (!Object.hasOwn(bladeColors,blade)) blade = 'frost';
  if (!['wood','night'].includes(background)) background = 'wood';

  function resize() {
    width = canvas.clientWidth; height = canvas.clientHeight;
    const ratio = Math.min(devicePixelRatio || 1,2);
    canvas.width = Math.round(width*ratio); canvas.height = Math.round(height*ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0); game.width = width; game.height = height;
  }
  addEventListener('resize',resize); resize();
  function initAudio() {
    if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }
    if (audio?.state === 'suspended') audio.resume().catch(() => {});
  }
  function tone(frequency,duration,volume = .06,end = frequency) {
    if (!sound || !audio) return;
    const time = audio.currentTime, oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(frequency,time);
    oscillator.frequency.exponentialRampToValueAtTime(end,time+duration);
    gain.gain.setValueAtTime(volume,time); gain.gain.exponentialRampToValueAtTime(.001,time+duration);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(time); oscillator.stop(time+duration);
  }
  function noise(duration,volume,cutoff = 2200) {
    if (!sound || !audio) return;
    const buffer = audio.createBuffer(1,Math.ceil(audio.sampleRate*duration),audio.sampleRate), data = buffer.getChannelData(0);
    for (let i=0;i<data.length;i++) data[i] = (Math.random()*2-1)*(1-i/data.length);
    const source = audio.createBufferSource(), gain = audio.createGain(), filter = audio.createBiquadFilter();
    source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = cutoff; gain.gain.value = volume;
    source.connect(filter); filter.connect(gain); gain.connect(audio.destination); source.start();
  }
  function announce(text,duration = 1) {
    $('centerMessage').textContent = text; messageLife = duration;
    $('centerMessage').classList.remove('pop'); void $('centerMessage').offsetWidth; $('centerMessage').classList.add('pop');
  }
  function label(text,x,y,color = '#ffdfa0',size = 25,life = 1) {
    labels.push({text,x:clamp(x,90,width-90),y,color,size,life});
  }
  function clearVisuals() {
    halves.length = particles.length = stains.length = labels.length = rings.length = trail.length = 0;
    activePointer = previous = null; shake = flash = messageLife = 0; $('centerMessage').textContent = '';
  }
  function start(mode) {
    if (loading) return;
    initAudio(); clearVisuals(); game.start(mode); $('menu').hidden = true; $('overlay').hidden = true;
    $('effects').hidden = false; $('pause').hidden = false;
    $('footerTip').textContent = mode === 'arcade' ? '特殊香蕉可以叠加 · 持续连击触发 BLITZ' : mode === 'zen'
      ? '放松下来，等水果到最高点再划切' : '漏切三次或切中炸弹，修炼结束';
    handleEvents(); updateHud(); return game.snapshot();
  }
  function home() {
    game.home(); clearVisuals(); $('menu').hidden = false; $('overlay').hidden = true;
    $('pause').hidden = true; $('effects').hidden = true; $('footerTip').textContent = '按住鼠标划切 · 手机用手指滑动'; updateHud();
  }
  function pause() { game.togglePause(); handleEvents(); updateHud(); return game.snapshot(); }
  function showResult(event) {
    activePointer = previous = null; trail.length = 0;
    const old = best(); write('dojo-best-'+game.mode,Math.max(old,event.score));
    $('overlay').hidden = false; $('pause').hidden = true;
    $('resultLabel').textContent = FruitEngine.MODES[game.mode].name+'模式 · 修炼完成';
    $('resultTitle').textContent = event.score > old ? '新的最高纪录' : event.reason;
    $('resultScore').textContent = event.score; $('resultDetail').textContent = '个人最佳 '+best();
    $('resultStats').hidden = false; $('cutStat').textContent = event.stats.cut; $('comboStat').textContent = event.stats.maxCombo;
    $('criticalStat').textContent = event.stats.criticals; $('bossStat').textContent = event.stats.bossHits;
    $('awards').replaceChildren();
    for (const award of event.awards) {
      const item = document.createElement('div'), name = document.createElement('span'), points = document.createElement('b');
      item.className = 'award'; name.textContent = award.label; points.textContent = '+'+award.points;
      item.append(name,points); $('awards').append(item);
    }
    $('again').textContent = '再来一局'; tone(440,.25,.08); tone(660,.5,.06);
  }
  function splash(fruit,count = 26,color = juice[fruit.type]) {
    for (let i=0;i<(reducedMotion ? Math.min(count,12) : count);i++) {
      const angle = random(0,Math.PI*2), speed = random(90,460);
      particles.push({x:fruit.x,y:fruit.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,r:random(2,7),life:random(.45,1.1),color});
    }
    if (particles.length>850) particles.splice(0,particles.length-850);
    if (fruit.type<5 || fruit.type===9) {
      const stain = {x:fruit.x,y:fruit.y,r:fruit.r*.7,color,life:6,spots:[]};
      for (let i=0;i<12;i++) { const a = random(0,Math.PI*2), spread = random(.6,2.2)*fruit.r;
        stain.spots.push({x:Math.cos(a)*spread,y:Math.sin(a)*spread,r:random(3,10)}); }
      stains.push(stain); if (stains.length>25) stains.shift();
    }
  }
  function split(fruit) {
    for (const side of [-1,1]) halves.push({...fruit,part:side,vx:fruit.vx+side*random(90,160),
      vy:fruit.vy*.2-random(15,90),spin:side*random(1.5,3.5),life:2.2});
  }
  function handleEvents() {
    for (const event of game.drainEvents()) switch (event.type) {
      case 'countdown': announce(String(event.number),1.1); tone(330,.1); break;
      case 'start': announce('开切！',.7); tone(660,.15); break;
      case 'slice':
        split(event.fruit); splash(event.fruit); noise(.1,.13); tone(600+game.stroke.count*70,.06,.04,260);
        if (event.critical) { label('暴击！ +'+event.points,event.fruit.x,event.fruit.y-40,'#ffed85',32,1.1);
          rings.push({x:event.fruit.x,y:event.fruit.y,life:.5,color:'#ffde56',size:160}); shake = reducedMotion ? 0 : .13;
        } else if (event.points) label('+'+event.points,event.fruit.x,event.fruit.y-15); break;
      case 'combo': label(event.count+' 连击  +'+event.bonus,event.x,Math.max(150,event.y-65),
        event.count>=6 ? '#ff9c6c' : '#ffe088',clamp(width*.035,27,43),1.25); tone(880,.15,.1); tone(1175,.24,.06); break;
      case 'power': announce(effectNames[event.effect]+'！',1.15);
        rings.push({x:event.fruit.x,y:event.fruit.y,life:.8,color:juice[event.fruit.type],size:width});
        tone(event.effect==='freeze' ? 1300 : 720,.3,.09,1100); break;
      case 'stack': announce('三重力量！',1.25); break;
      case 'blitz': announce(['','BLITZ · 连击爆发','SUPER BLITZ','MEGA BLITZ'][event.level],1); break;
      case 'bomb': splash(event.fruit,70,'#ff9538'); noise(.55,.5,450); tone(80,.6,.12,25);
        shake = reducedMotion ? 0 : .65; flash = reducedMotion ? 0 : .35;
        announce(game.mode==='classic' ? '炸弹！' : '炸弹 −10',.9); break;
      case 'miss': label('漏切',event.x,height-100,'#ff8464'); tone(170,.12); break;
      case 'finale': announce('石榴连斩！',1); break;
      case 'bossHit': splash(event.fruit,10); label('+'+event.points,event.fruit.x+random(-65,65),event.fruit.y-50,'#ffb9c6',23,.6);
        tone(450+event.hits*20,.05,.045); rings.push({x:event.fruit.x,y:event.fruit.y,life:.25,color:'#ff6b97',size:120}); break;
      case 'bossBurst': splash(event.fruit,100); flash = reducedMotion ? 0 : .2; break;
      case 'pause': activePointer = previous = null; trail.length = 0; $('overlay').hidden = false;
        $('resultLabel').textContent = '稍作休息'; $('resultTitle').textContent = '刀锋暂歇'; $('resultScore').textContent = game.score;
        $('resultDetail').textContent = '继续你的'+FruitEngine.MODES[game.mode].name+'修炼'; $('resultStats').hidden = true;
        $('awards').replaceChildren(); $('again').textContent = '继续游戏'; break;
      case 'resume': $('overlay').hidden = true; break;
      case 'over': showResult(event); break;
    }
  }
  function updateHud() {
    const state = game.snapshot(), key = JSON.stringify([state.phase,state.mode,state.score,state.misses,state.seconds,state.blitz,best()]);
    if (key!==hudKey) {
      hudKey = key; $('score').textContent = state.score; $('best').textContent = best();
      $('status').textContent = state.phase==='menu' ? '选择你的修炼' : state.mode==='classic'
        ? Array.from({length:3},(_,i)=>i<state.misses?'✕':'◇').join(' ') : state.phase==='finale' ? '最终连斩' : state.seconds+' 秒';
      $('status').classList.toggle('danger',state.mode==='classic' ? state.misses>0 : state.seconds<=10);
      $('pause').textContent = state.phase==='paused' ? '▶' : 'Ⅱ';
      $('pause').setAttribute('aria-label',state.phase==='paused' ? '继续游戏' : '暂停游戏');
      $('footerMode').textContent = FruitEngine.MODES[state.mode].name+'模式';
      for (const mode of ['classic','arcade','zen']) $('best-'+mode).textContent = best(mode);
    }
    for (const effect of ['double','freeze','frenzy']) {
      $('dojo').dataset[effect] = String(game.effects[effect]>0);
      const badge = $('effect-'+effect); badge.hidden = game.effects[effect]<=0;
      badge.querySelector('b').textContent = Math.ceil(game.effects[effect])+'s';
      badge.style.setProperty('--remaining',game.effects[effect]/8*100+'%');
    }
    $('blitz').hidden = !game.blitz || !['playing','paused'].includes(game.phase);
    $('blitz').querySelector('b').textContent = ['','BLITZ','SUPER BLITZ','MEGA BLITZ'][game.blitz];
    $('blitz').style.setProperty('--remaining',game.blitzRemaining/6*100+'%');
    $('bossHint').hidden = game.phase!=='finale';
    if (game.phase==='finale') $('bossHint').textContent = '快速反复划切 · '+Math.ceil(game.bossRemaining)+'s · '+game.stats.bossHits+' 斩';
  }
  function sprite(fruit,part = 0) {
    const special = fruit.type>=6, image = special ? specials : atlas;
    if (!image.complete || !image.naturalWidth) return;
    const cell = image.naturalWidth/2;
    const crop = special ? [(fruit.type-6)%2*cell,Math.floor((fruit.type-6)/2)*image.naturalHeight/2,cell,image.naturalHeight/2] : crops[fruit.type];
    const w = fruit.r*2.25, h = w*crop[3]/crop[2];
    ctx.save(); ctx.translate(fruit.x,fruit.y); ctx.rotate(fruit.angle);
    if (part) { ctx.beginPath(); ctx.rect(part<0 ? -w/2 : 0,-h/2,w/2,h); ctx.clip(); }
    ctx.drawImage(image,...crop,-w/2,-h/2,w,h);
    if (part && fruit.type<5) { ctx.fillStyle = ['#ff6c7c','#ffd88a','#fff0b8','#ffe57c','#ff7796'][fruit.type];
      ctx.fillRect(part<0 ? -3 : 0,-fruit.r*.56,3,fruit.r*1.12); }
    ctx.restore();
  }
  function updateVisuals(dt) {
    if (game.phase==='paused') return;
    const step = dt*(game.effects.freeze>0 ? .43 : 1);
    for (let i=halves.length-1;i>=0;i--) { const f = halves[i]; f.x+=f.vx*step; f.vy+=height*.9*step; f.y+=f.vy*step;
      f.angle+=f.spin*step; f.life-=dt; if (f.life<=0 || f.y>height+160) halves.splice(i,1); }
    for (let i=particles.length-1;i>=0;i--) { const p = particles[i]; p.x+=p.vx*step; p.vy+=height*.5*step; p.y+=p.vy*step;
      p.life-=dt; if (p.life<=0) particles.splice(i,1); }
    for (const list of [stains,labels,rings]) for (let i=list.length-1;i>=0;i--) {
      list[i].life-=dt; if (list===labels) list[i].y-=32*dt; if (list[i].life<=0) list.splice(i,1); }
    shake = Math.max(0,shake-dt); flash = Math.max(0,flash-dt); messageLife-=dt;
    if (messageLife<=0) $('centerMessage').textContent = '';
  }
  function draw(now) {
    ctx.clearRect(0,0,width,height); ctx.save(); if (shake) ctx.translate(random(-10,10)*shake,random(-10,10)*shake);
    for (const s of stains) { ctx.globalAlpha = Math.min(.25,s.life*.13); ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.ellipse(s.x,s.y,s.r,s.r*.65,0,0,Math.PI*2); ctx.fill();
      for (const p of s.spots) { ctx.beginPath(); ctx.arc(s.x+p.x,s.y+p.y,p.r,0,Math.PI*2); ctx.fill(); } }
    ctx.globalAlpha = 1;
    for (const f of game.entities) {
      if (f.dead) continue;
      if (f.special || f.boss) { ctx.save(); ctx.shadowColor = juice[f.type]; ctx.shadowBlur = 28;
        ctx.strokeStyle = juice[f.type]+'99'; ctx.lineWidth = 2; ctx.beginPath();
        ctx.arc(f.x,f.y,f.r*(1.13+Math.sin(now/150)*.05),0,Math.PI*2); ctx.stroke(); ctx.restore(); }
      sprite(f);
      if (f.special) { ctx.font = 'bold 14px system-ui'; ctx.fillStyle = juice[f.type]; ctx.textAlign = 'center';
        ctx.shadowColor = '#0c0302'; ctx.shadowBlur = 7; ctx.fillText(effectNames[f.special],f.x,f.y+f.r+24); ctx.shadowBlur = 0; }
    }
    for (const f of halves) { ctx.globalAlpha = Math.min(1,f.life); sprite(f,f.part); }
    for (const p of particles) { ctx.globalAlpha = clamp(p.life*2,0,1); ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.ellipse(p.x,p.y,p.r,p.r*.7,Math.atan2(p.vy,p.vx),0,Math.PI*2); ctx.fill(); }
    for (const ring of rings) { ctx.globalAlpha = ring.life; ctx.strokeStyle = ring.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(ring.x,ring.y,ring.size*(1-ring.life)+10,0,Math.PI*2); ctx.stroke(); }
    for (const l of labels) { ctx.globalAlpha = Math.min(1,l.life*3); ctx.font = `900 ${l.size}px system-ui`; ctx.textAlign = 'center';
      ctx.lineJoin = 'round'; ctx.strokeStyle = '#301006'; ctx.lineWidth = 5; ctx.strokeText(l.text,l.x,l.y); ctx.fillStyle = l.color; ctx.fillText(l.text,l.x,l.y); }
    ctx.globalAlpha = 1; ctx.restore();
    while (trail.length && now-trail[0].t>160) trail.shift();
    if (trail.length>1) { ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.shadowColor = bladeColors[blade]; ctx.shadowBlur = 20;
      for (let i=1;i<trail.length;i++) { ctx.globalAlpha = clamp(1-(now-trail[i].t)/160,0,1); ctx.strokeStyle = bladeColors[blade];
        ctx.lineWidth = 2+7*i/trail.length; ctx.beginPath(); ctx.moveTo(trail[i-1].x,trail[i-1].y); ctx.lineTo(trail[i].x,trail[i].y); ctx.stroke(); }
      ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.beginPath();
      trail.forEach((p,i)=>i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y)); ctx.stroke(); ctx.restore(); }
    if (flash) { ctx.fillStyle = `rgba(255,190,105,${flash})`; ctx.fillRect(0,0,width,height); }
    if (game.phase==='menu' && !reducedMotion) { ambient+=.008; ctx.fillStyle = '#ffcc7180';
      for (let i=0;i<12;i++) { ctx.globalAlpha = .1+Math.sin(ambient+i)*.1; ctx.beginPath();
        ctx.arc((i*109+50)%width,height-((ambient*20+i*75)%height),1.8,0,Math.PI*2); ctx.fill(); } ctx.globalAlpha = 1; }
  }
  function point(event) { const rect = canvas.getBoundingClientRect(); return {x:event.clientX-rect.left,y:event.clientY-rect.top,t:performance.now()}; }
  canvas.addEventListener('pointerdown',event => {
    if (!['playing','finale'].includes(game.phase) || activePointer!==null) return;
    event.preventDefault(); initAudio(); activePointer = event.pointerId; previous = point(event); trail.push(previous); canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove',event => {
    if (activePointer!==event.pointerId || !['playing','finale'].includes(game.phase)) return;
    event.preventDefault(); const samples = event.getCoalescedEvents?.();
    for (const sample of samples?.length ? samples : [event]) { const next = point(sample);
      if (previous) game.swipe(previous,next); trail.push(next); previous = next; }
    if (trail.length>180) trail.splice(0,trail.length-180); handleEvents(); updateHud();
  });
  function release(event) { if (event && activePointer!==event.pointerId) return;
    game.endStroke(); activePointer = previous = null; handleEvents(); updateHud(); }
  for (const event of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(event,release);
  for (const mode of ['classic','arcade','zen']) $(mode).onclick = () => start(mode);
  $('again').onclick = () => game.phase==='paused' ? pause() : start(game.mode); $('home').onclick = home; $('pause').onclick = pause;
  $('blade').value = blade; $('background').value = background; $('dojo').dataset.background = background;
  $('blade').onchange = event => { blade = event.target.value; write('dojo-blade',blade); tone(880,.1); };
  $('background').onchange = event => { background = event.target.value; $('dojo').dataset.background = background; write('dojo-background',background); };
  function updateSound() { $('sound').textContent = sound ? '♫' : '♪̸'; $('sound').setAttribute('aria-label',sound ? '关闭声音' : '开启声音'); }
  updateSound(); $('sound').onclick = () => { initAudio(); sound = !sound; write('dojo-sound',sound ? 'on' : 'off'); updateSound(); if (sound) tone(660,.1); };
  $('help').onclick = () => $('guide').showModal(); $('closeGuide').onclick = () => $('guide').close();
  $('guide').addEventListener('click',event => { if (event.target===$('guide')) $('guide').close(); });
  addEventListener('keydown',event => {
    if ($('guide').open) return;
    const focusTag = document.activeElement.tagName;
    if ((event.code==='Escape' || event.code==='Space') && !['SELECT','INPUT','TEXTAREA'].includes(focusTag) && !(event.code==='Space' && focusTag==='BUTTON')) {
      if (['countdown','playing','finale','paused'].includes(game.phase)) { event.preventDefault(); pause(); }
    }
  });
  document.addEventListener('visibilitychange',() => { if (document.hidden && ['countdown','playing','finale'].includes(game.phase)) pause(); });
  function loadImage(image) { return new Promise((resolve,reject) => {
    if (image.complete) return image.naturalWidth ? resolve() : reject(new Error('Image load failed'));
    image.onload = resolve; image.onerror = () => reject(new Error('Image load failed')); }); }
  for (const mode of ['classic','arcade','zen']) $(mode).disabled = true;
  Promise.all([loadImage(atlas),loadImage(specials)]).then(() => {
    loading = false; $('loadStatus').hidden = true; for (const mode of ['classic','arcade','zen']) $(mode).disabled = false;
  }).catch(() => { $('loadStatus').textContent = '素材暂时加载失败，请刷新重试'; });
  function frame(now) { const dt = Math.min((now-lastFrame)/1000 || 0,.05); lastFrame = now;
    game.update(dt); handleEvents(); updateVisuals(dt); updateHud(); draw(now); requestAnimationFrame(frame); }
  updateHud(); requestAnimationFrame(frame);
  const model = document.modelContext;
  if (model?.registerTool) {
    const lifecycle = new AbortController();
    const tools = [
      {name:'read_game_state',description:'Read current phase, mode, score, timer and active effects.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>game.snapshot()},
      {name:'start_fruit_game',description:'Start a fresh Classic, Arcade or Zen game. Resets the score.',inputSchema:{type:'object',properties:{mode:{type:'string',enum:['classic','arcade','zen']}},required:['mode'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{
        if (!input || !Object.hasOwn(FruitEngine.MODES,input.mode)) throw new Error('Invalid mode'); if (loading) throw new Error('Assets still loading'); return start(input.mode); }},
      {name:'toggle_game_pause',description:'Pause or resume the game, countdown or finale.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false},execute:pause},
    ];
    for (const tool of tools) { try { Promise.resolve(model.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{}); } catch {} }
    addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  }
})();
