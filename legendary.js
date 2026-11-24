'use strict';
window.LegendaryForge = (() => {
  const skins = {
    void: {name:'虚空裂隙 · 蝴蝶刀',file:'knife-void.png',description:'黑曜石双柄与星云刃芯。紫色空间裂纹，命中形成旋转黑洞环。'},
    dragon: {name:'赤龙噬焰 · 龙牙匕首',file:'knife-dragon.png',description:'龙首护手、熔岩刃纹。烈焰拖尾与三重龙爪，命中迸发金红火芒。'},
    quantum: {name:'量子脉冲 · 战术爪刀',file:'knife-quantum.png',description:'悬浮机械骨架、青蓝能量刃。六边形电路拖尾，命中展开全息护环。'},
  };
  const images = {};
  const ready = Promise.all(Object.entries(skins).map(([key,skin]) => new Promise((resolve,reject) => {
    const image=new Image(); images[key]=image; image.onload=resolve; image.onerror=()=>reject(new Error('Knife asset failed: '+key)); image.src=skin.file;
  })));
  function draw(ctx,key,x,y,width,angle=0,alpha=1) {
    const image=images[key];if(!image?.naturalWidth)return;
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalAlpha=alpha;
    ctx.drawImage(image,-width/2,-width*image.naturalHeight/image.naturalWidth/2,width,width*image.naturalHeight/image.naturalWidth);ctx.restore();
  }
  // Sprite tip anchors are measured in normalized image coordinates.
  const tips = {void:[.98,.49],dragon:[.98,.27],quantum:[.98,.86]};
  function equipped(ctx,key,x,y,width,angle,alpha=1) {
    const image=images[key],tip=tips[key];if(!image?.naturalWidth||!tip)return;
    const height=width*image.naturalHeight/image.naturalWidth;
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalAlpha=alpha;
    ctx.drawImage(image,-width*tip[0],-height*tip[1],width,height);ctx.restore();
  }
  function hit(ctx,ring) {
    const r=15+ring.size*(1-ring.life),t=1-ring.life;
    ctx.save();ctx.translate(ring.x,ring.y);ctx.rotate(t*1.8);ctx.lineWidth=2;
    if(ring.skin==='void') {
      ctx.fillStyle='rgba(8,2,22,0.35)';ctx.beginPath();ctx.ellipse(0,0,r,r*.4,0,0,Math.PI*2);ctx.fill();ctx.stroke();
      for(let i=0;i<5;i++){const a=i*Math.PI*.4;ctx.beginPath();ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r*.4);ctx.lineTo(Math.cos(a)*(r+13),Math.sin(a)*(r+13));ctx.stroke();}
    } else if(ring.skin==='dragon') {
      ctx.lineWidth=3;
      for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(-r+i*12,r*.5);ctx.quadraticCurveTo(i*12,-r*.2,r+i*12,-r*.5);ctx.stroke();}
    } else {
      for(const radius of [r,r*.72]){ctx.beginPath();for(let i=0;i<=6;i++){const a=i*Math.PI/3;const x=Math.cos(a)*radius,y=Math.sin(a)*radius;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}
    }
    ctx.restore();
  }
  return {skins,ready,draw,equipped,hit};
})();
