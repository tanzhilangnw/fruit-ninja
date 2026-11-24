const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function forge(fail=false) {
  class Image {constructor(){this.naturalWidth=1200;this.naturalHeight=400;}set src(value){this.file=value;queueMicrotask(()=>fail?this.onerror():this.onload());}}
  const window={};vm.runInNewContext(fs.readFileSync(require.resolve('../legendary.js'),'utf8'),{window,Image});return window.LegendaryForge;
}
test('three legendary weapons load distinct bundled sprites and preserve aspect ratio',async()=>{
  const f=forge();await f.ready;
  assert.equal(new Set(Object.values(f.skins).map(s=>s.file)).size,3);
  for(const key of Object.keys(f.skins)) {
    assert.ok(fs.existsSync(require('node:path').join(__dirname,'..',f.skins[key].file)));
    let drawing;const c={save(){},restore(){},translate(){},rotate(){},drawImage(...a){drawing=a;}};
    f.draw(c,key,10,20,300);assert.equal(drawing[3],300);assert.equal(drawing[4],100);
  }
});
test('hit effects have distinct geometry; missing sprites reject resource readiness',async()=>{
  const f=forge();await f.ready;const signatures=[];
  for(const key of Object.keys(f.skins)) {
    const operations=[];const ctx=new Proxy({}, {get:(_,name)=>(...args)=>operations.push([name,...args]),set:()=>true});
    f.hit(ctx,{x:10,y:20,size:110,life:.5,skin:key});
    assert.equal(operations[0][0],'save');assert.equal(operations.at(-1)[0],'restore');
    signatures.push(JSON.stringify(operations));
  }
  assert.equal(new Set(signatures).size,3);
  await assert.rejects(forge(true).ready,/Knife asset failed/);
});
test('equipped blade anchors its cutting tip exactly to the pointer at every size',async()=>{
  const f=forge();await f.ready;
  const tips={void:[.98,.49],dragon:[.98,.27],quantum:[.98,.86]};
  for(const key of Object.keys(tips))for(const size of [72,100,132]){
    let imageArgs,position;
    const ctx={save(){},restore(){},translate(x,y){position=[x,y];},rotate(){},drawImage(...args){imageArgs=args;}};
    f.equipped(ctx,key,40,80,size,Math.PI/2);
    assert.deepEqual(position,[40,80]);
    assert.equal(imageArgs[1]+size*tips[key][0],0);
    assert.equal(imageArgs[2]+size/3*tips[key][1],0);
  }
});
