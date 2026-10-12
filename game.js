const cv=document.getElementById('c'),cx=cv.getContext('2d');
let W,H;function rs(){W=cv.width=innerWidth;H=cv.height=innerHeight}addEventListener('resize',rs);rs();
const keys={};
let P=[],p,cam={x:0,y:0},en=[],sh=[],pt=[],gems=[],fx=[],ef=[],eb=[],t=0,kills=0,running=false,spawnT=0,last=0,xp=0,lvl=1,need=5,paused=false,evo=null,pending=[],cardMode='cards',mode=1,lastMode=1,cur=[],treeOpen=false;
const PC=['#2ee6c8','#ff7ad9'],ELC=['#4db8ff','#c05bff','#ffb02e'],$=id=>document.getElementById(id);

// Multijugador Online
let peer = null, conn = null, isHost = false, isOnline = false, remoteKeys = {};
let hostDone = false, clientDone = false;

window.initPeer = function(name) {
  if (peer) return;
  const shortId = 'digi-' + Math.floor(1000 + Math.random() * 9000);
  peer = new Peer(shortId);
  peer.on('open', id => {
    if ($('my-peer-code')) $('my-peer-code').textContent = 'Tu código de amigo: ' + id;
  });
  peer.on('connection', c => {
    conn = c;
    isHost = true;
    setupConn();
  });
};

function setupConn() {
  if ($('party-status')) $('party-status').textContent = '¡Amigo conectado!';
  if (isHost && $('go-online')) $('go-online').style.display = 'inline-block';
  conn.on('data', data => {
    if (data.type === 'input') {
      remoteKeys = data.keys || {};
    } else if (data.type === 'start') {
      isOnline = true;
      isHost = false;
      start(2);
    } else if (data.type === 'sync') {
      applyOnlineSync(data);
    } else if (data.type === 'trigger_levelup') {
      paused = true;
      hostDone = false; clientDone = false;
      pending = [P[1]];
      showCards();
    } else if (data.type === 'trigger_line') {
      paused = true;
      hostDone = false; clientDone = false;
      pending = [P[1]];
      chooseLine();
    } else if (data.type === 'trigger_evo') {
      $('up').style.display = 'none';
      startEvo(data.stage);
    } else if (data.type === 'client_choice') {
      if (isHost && P[1]) {
        applyCardOp(P[1], data);
        clientDone = true;
        if (hostDone) {
          if (cardMode === 'line') {
            if (conn) conn.send({ type: 'trigger_evo', stage: 3 });
            $('up').style.display = 'none';
            startEvo(3);
          } else {
            $('up').style.display = 'none';
            paused = false;
            last = performance.now();
            if (conn) conn.send({ type: 'resume_game' });
          }
        }
      }
    } else if (data.type === 'host_choice') {
      if (!isHost && P[0]) {
        applyCardOp(P[0], data);
        hostDone = true;
      }
    } else if (data.type === 'resume_game') {
      $('up').style.display = 'none';
      paused = false;
      last = performance.now();
    }
  });
}

function applyCardOp(targetP, data) {
  if (data.c) targetP.st[data.c]++;
  if (data.op === 'dmg') targetP.dmg++;
  else if (data.op === 'rate') targetP.rate *= .8;
  else if (data.op === 'multi') targetP.multi++;
  else if (data.op === 'pierce') targetP.pierce++;
  else if (data.op === 'sp') targetP.sp *= 1.15;
  else if (data.op === 'hp') { targetP.max += 25; targetP.hp = Math.min(targetP.max, targetP.hp + 25); }
  else if (data.op === 'mag') targetP.mag *= 1.6;
  else if (data.op === 'wp' && data.wpKey) targetP.wp[data.wpKey]++;
  else if (data.op === 'line') { targetP.line = data.lineIdx; targetP.weak = data.weak; }
}

if ($('btn-connect')) {
  $('btn-connect').onclick = () => {
    const code = $('friend-code').value.trim();
    if (!code || !peer) return;
    conn = peer.connect(code);
    isHost = false;
    setupConn();
  };
}

if ($('go-online')) {
  $('go-online').onclick = () => {
    if (conn) conn.send({ type: 'start' });
    isOnline = true;
    isHost = true;
    start(2);
  };
}

function applyOnlineSync(data) {
  if (isHost) return;
  t = data.t; kills = data.kills; lvl = data.lvl; need = data.need; xp = data.xp;
  if (data.P && P.length === data.P.length) {
    data.P.forEach((sq, i) => { if (P[i]) Object.assign(P[i], sq); });
  }
  if (data.en) en = data.en;
  if (data.gems) gems = data.gems;
  if (data.sh) sh = data.sh;
  if (data.eb) eb = data.eb;
  if (data.ef) ef = data.ef;
}

addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=1;if(e.key.startsWith('Arrow'))e.preventDefault();
 if(e.key==='Enter'&&!running&&!treeOpen)start(lastMode);
 if(e.key==='Escape'){if(treeOpen)$('tx').click();else if(running)endRun('Run terminada')}
 if(paused&&!evo&&/^[1-3]$/.test(e.key)&&cur[e.key-1]&&!cur[e.key-1].lock)choose(cur[e.key-1])});
addEventListener('keyup',e=>keys[e.key.toLowerCase()]=0);
function mult(a,d){return d===(a+1)%3?1.5:a===(d+1)%3?.5:1}
function dmgNum(x,y,v,col,sz){fx.push({x:x+(Math.random()-.5)*12,y:y-8,txt:String(Math.max(1,Math.round(v*10))),col,sz,l:.8})}
function hit(e,d){const m=mult(0,e.el),v=d*m;e.hp-=v;e.fl=.1;dmgNum(e.x,e.y-e.r,v,m>1?'#43ff7a':m<1?'#ff4a4a':'#fff',m>1?30:m<1?14:18)}
function hurt(q,d,el){if(q.dead)return;const m=mult(el,0),v=d*m*(1-q.arm);q.hp-=v;q.inv=.45;burst(q.x,q.y,'#ff3d81');dmgNum(q.x,q.y-q.r-6,v,m>1?'#ff4a4a':m<1?'#43ff7a':'#ffb0b0',20);if(q.hp<=0){q.dead=true;q.hp=0;for(let i=0;i<20;i++)burst(q.x,q.y,PC[q.id])}}
function permS(k){return {FUE:L('tf'),VEL:L('tv'),INT:L('ti'),VIT:L('th')}[k]|0}
function tot(q,k){return permS(k)+q.st[k]}
function np(i){return{id:i,x:0,y:0,hp:100,max:100,r:16,sp:210,face:1,inv:0,dmg:1,rate:.6,multi:1,pierce:0,mag:70,stage:0,line:0,weak:false,dead:false,atkT:0,arm:0,xpm:1,coin:1,st:{FUE:0,VEL:0,VIT:0,INT:0},wp:{onda:0,orbe:0,rafaga:0,rayo:0},wt:{onda:0,rafaga:0,rayo:0},oa:0}}
function start(m){mode=lastMode=m;P=[];for(let i=0;i<m;i++){const q=np(i);q.x=m===1?0:(i?40:-40);applyTree(q);P.push(q)}
 p=P[0];cam={x:P[0].x,y:0};en=[];sh=[];pt=[];gems=[];fx=[];ef=[];eb=[];pending=[];xp=0;lvl=1;need=5;paused=false;evo=null;t=0;kills=0;spawnT=0;running=true;
 $('ov').style.display='none';$('up').style.display='none';$('evt').style.display='none';
 $('bar2').style.display=$('l2').style.display=m===2?'block':'none';$('l1').textContent=m===2?'J1':'';$('l2').textContent=m===2?'J2':'';
 last=performance.now();requestAnimationFrame(loop)}
$('go').onclick=()=>{isOnline=false;start(1)};$('go2').onclick=()=>{isOnline=false;start(2)};

const UP=[
{c:'FUE',n:'Más daño',d:'+1 de daño por disparo',op:'dmg',f:()=>p.dmg++},
{c:'VEL',n:'Disparo rápido',d:'Ataca un 20% más seguido',op:'rate',f:()=>p.rate*=.8},
{c:'VEL',n:'Disparo doble',d:'+1 proyectil por ataque',op:'multi',f:()=>p.multi++},
{c:'FUE',n:'Perforante',d:'Los disparos atraviesan 1 enemigo más',op:'pierce',f:()=>p.pierce++},
{c:'VEL',n:'Patas veloces',d:'+15% de velocidad',op:'sp',f:()=>p.sp*=1.15},
{c:'VIT',n:'Reparación',d:'+25 de vida máxima y cura 25',op:'hp',f:()=>{p.max+=25;p.hp=Math.min(p.max,p.hp+25)}},
{c:'INT',n:'Imán de datos',d:'Atrae el XP desde más lejos',op:'mag',f:()=>p.mag*=1.6}];
const WP=[{k:'onda',n:'Onda de datos',d:'Pulso en área alrededor tuyo'},{k:'orbe',n:'Orbitales',d:'Esferas que giran a tu alrededor y dañan al tocar'},{k:'rafaga',n:'Ráfaga multidireccional',d:'Dispara en 4, 8 o 12 direcciones a la vez'},{k:'rayo',n:'Rayo perforante',d:'Línea de energía hacia el enemigo más cercano'}];
const TREE=[
{c:'Ataque',n:[{k:'a1',n:'Poder',d:'+20% de daño',m:5,b:30},{k:'a2',n:'Cadencia',d:'Ataca un 6% más rápido',m:5,b:40,r:'a1'},{k:'a3',n:'Disparo extra',d:'+1 proyectil desde el inicio',m:1,b:150,r:'a2'}]},
{c:'Defensa',n:[{k:'d1',n:'Vitalidad',d:'+15 de vida máxima',m:5,b:25},{k:'d2',n:'Agilidad',d:'+5% de velocidad',m:5,b:35,r:'d1'},{k:'d3',n:'Coraza',d:'-8% de daño recibido',m:3,b:60,r:'d2'}]},
{c:'Datos',n:[{k:'x1',n:'Imán',d:'+20% de alcance para juntar XP',m:3,b:25},{k:'x2',n:'Sintonía',d:'+15% de XP recibida',m:5,b:50,r:'x1'},{k:'x3',n:'Botín',d:'+20% de monedas por partida',m:3,b:60,r:'x2'}]},
{c:'Entrenamiento',n:[{k:'tf',n:'Fuerza',d:'+1 punto permanente y +4% de daño',m:5,b:40},{k:'tv',n:'Velocidad',d:'+1 punto permanente y +3% de velocidad',m:5,b:40},{k:'ti',n:'Inteligencia',d:'+1 punto permanente y +6% de XP',m:5,b:40},{k:'th',n:'Vitalidad',d:'+1 punto permanente y +8 de vida',m:5,b:40}]}];
let save={coins:0,lv:{}};
try{const s=JSON.parse(localStorage.getItem('digisurvivor'));if(s&&s.lv)save=s}catch(e){}
function persist(){try{localStorage.setItem('digisurvivor',JSON.stringify(save))}catch(e){}if(window.onSave)window.onSave(save)}
window.getSave=()=>save;
window.loadSave=s=>{save=s;try{localStorage.setItem('digisurvivor',JSON.stringify(save))}catch(e){}wal()};
function L(k){return save.lv[k]|0}
function applyTree(q){q.dmg*=(1+.2*L('a1'))*(1+.04*L('tf'));q.rate*=Math.pow(.94,L('a2'));q.multi+=L('a3');q.max+=15*L('d1')+8*L('th');q.hp=q.max;q.sp*=(1+.05*L('d2'))*(1+.03*L('tv'));q.arm=.08*L('d3');q.mag*=1+.2*L('x1');q.xpm=(1+.15*L('x2'))*(1+.06*L('ti'));q.coin=1+.2*L('x3')}
function wal(){$('wal').textContent='Monedas: '+save.coins;$('tw').textContent='Monedas: '+save.coins}
function renderTree(){const c=$('cols');c.innerHTML='';
 TREE.forEach(br=>{const col=document.createElement('div');col.className='col';col.innerHTML='<h3>'+br.c+'</h3>';
  br.n.forEach(n=>{const lv=L(n.k),maxed=lv>=n.m,locked=n.r&&!L(n.r),cost=n.b*(lv+1);
   const b=document.createElement('button');b.className='node';b.disabled=maxed||!!locked||save.coins<cost;
   b.innerHTML='<b>'+n.n+' '+lv+'/'+n.m+'</b>'+n.d+'<i>'+(maxed?'Máximo':locked?'Requiere mejorar la anterior':cost+' monedas')+'</i>';
   b.onclick=()=>{save.coins-=cost;save.lv[n.k]=lv+1;persist();wal();renderTree()};col.appendChild(b)});c.appendChild(col)})}
$('tb').onclick=()=>{treeOpen=true;renderTree();wal();$('tree').style.display='flex'};
$('tx').onclick=()=>{treeOpen=false;$('tree').style.display='none'};
function endRun(title){if(!running)return;running=false;paused=false;evo=null;pending=[];
 $('evt').style.display='none';$('up').style.display='none';
 const m=Math.floor(t/60),s=Math.floor(t%60),c=Math.floor((kills*.5+t/6+lvl*8)*P[0].coin);save.coins+=c;persist();
 $('t').textContent=title;
 $('m').textContent='Aguantaste '+m+':'+String(s).padStart(2,'0')+' y eliminaste '+kills+' virus. Ganaste '+c+' monedas.';
 wal();$('ov').style.display='flex'}
const NAMES=['Cría','Bebé','Novato','Campeón'],LINEAS=['Línea Cuernos','Línea Garras'];
function drawBuddy(q,s,x,y,f,a){const S=SPR[['baby','train','rookie',q.line?'champB':'champA'][s]],h=[40,46,56,68][s],w=S.w*h/S.h;
 cx.save();cx.globalAlpha=a;cx.imageSmoothingEnabled=false;cx.translate(x,y);
 cx.fillStyle='rgba(0,0,0,.35)';cx.beginPath();cx.ellipse(0,h/2-2,w*.35,5,0,0,6.283);cx.fill();
 if(mode===2){cx.strokeStyle=PC[q.id];cx.lineWidth=3;cx.beginPath();cx.ellipse(0,h/2-2,w*.4,7,0,0,6.283);cx.stroke()}
 if(f>0&&s>=2)cx.scale(-1,1);
 cx.drawImage(S.im,-w/2,-h/2,w,h);cx.restore()}
function startEvo(s){evo={t:0,s,done:0};const v=$('evt');v.style.display='block';v.textContent='¡Tu compañero está digievolucionando!'}
function stepEvo(dt){evo.t+=dt;
 if(!evo.done&&evo.t>=1.3){evo.done=1;
  for(const q of P){const s=q.stage=evo.s;q.r=[14,16,19,22][s];
   if(s===1){q.dmg+=.5;q.max+=20}else if(s===2){q.dmg+=1;q.max+=30;q.sp*=1.1}
   else if(q.line===0){q.dmg+=q.weak?1.5:3;q.max+=q.weak?30:60;if(!q.weak)q.pierce++}else{q.dmg+=q.weak?.5:1;q.multi+=q.weak?1:2;q.sp*=q.weak?1.07:1.15}
   q.hp=q.max;for(let i=0;i<30;i++)burst(q.x,q.y,i%2?'#fff':'#ffd23f')}
  $('evt').textContent='¡'+(evo.s===3?P.map((q,i)=>(mode===2?'J'+(i+1)+': ':'')+LINEAS[q.line]).join(' · '):NAMES[evo.s])+'!'}
 if(evo.t>=2.8){
  const s=evo.s;evo=null;const v=$('evt');
  v.textContent='¡Los enemigos también evolucionaron: '+NAMES[s]+'!';
  setTimeout(()=>{if(!evo)v.style.display='none'},2600);
  if (isOnline) {
    if (isHost) {
      if (conn) conn.send({ type: 'trigger_levelup' });
      startCards();
    }
  } else {
    startCards();
  }
 }}
const LREQ=[[['FUE',3],['VIT',1]],[['VEL',4]]],SN={FUE:'Fuerza',VEL:'Velocidad',VIT:'Vitalidad',INT:'Inteligencia'};
function setHead(txt){const h=$('up').querySelector('h2');h.textContent=txt+(mode===2&&!txt.startsWith('ESPERANDO')?' · Jugador '+(p.id+1):'');h.style.color=mode===2?PC[p.id]:''}

function chooseLine(){
  hostDone = false; clientDone = false; paused = true;
  p = isOnline ? (isHost ? P[0] : P[1]) : pending[0];
  cardMode='line'; setHead('¡Elegí tu evolución!');
  const ok=LREQ.map(r=>r.every(([k,v])=>tot(p,k)>=v)),inest=!ok[0]&&!ok[1];
  $('up').querySelector('p').textContent='Tus stats (permanentes + partida): '+Object.keys(SN).map(k=>SN[k]+' '+tot(p,k)).join(' · ')+(inest?' — No cumplís ningún requisito: la evolución será inestable (bonos a la mitad)':'');
  cur=[0,1].map(i=>({k:['champA','champB'][i],n:LINEAS[i],lock:!ok[i]&&!inest,op:'line',lineIdx:i,weak:inest,
   d:['Pesado: +3 de daño, +60 de vida y ataques que perforan','Veloz: +2 proyectiles, +1 de daño y +15% de velocidad'][i],
   req:LREQ[i].map(([k,v])=>SN[k]+' '+Math.min(tot(p,k),v)+'/'+v+' ('+permS(k)+' perm. + '+p.st[k]+' partida)'+(tot(p,k)>=v?' ✓':'')).join(' · '),
   f:()=>{p.line=i;p.weak=inest}}));
  const c=$('cards');c.innerHTML='';
  cur.forEach((u,i)=>{const b=document.createElement('button');b.className='card';b.disabled=u.lock;b.innerHTML='<img src="'+SPR[u.k].im.src+'"><b>'+(i+1)+'. '+u.n+'</b>'+u.d+'<em>Requiere: '+u.req+'</em>';b.onclick=()=>choose(u);c.appendChild(b)});
  $('up').style.display='flex';
}

function levelUp(){
  xp-=need;lvl++;need=Math.round(need*1.3+2);paused=true;
  for(const q of P)if(q.dead){q.dead=false;q.hp=q.max*.5;q.inv=2}
  if(lvl===3||lvl===6){
    startEvo(lvl/3);
    if (isOnline && isHost && conn) conn.send({ type: 'trigger_evo', stage: lvl/3 });
    return;
  }
  if(lvl===10){
    if (isOnline) {
      pending = [isHost ? P[0] : P[1]];
      if (isHost && conn) conn.send({ type: 'trigger_line' });
    } else {
      pending = [...P];
    }
    chooseLine();
    return;
  }
  if (isOnline) {
    pending = [isHost ? P[0] : P[1]];
    if (isHost && conn) conn.send({ type: 'trigger_levelup' });
  } else {
    pending = [...P];
  }
  startCards();
}

function startCards(){
  hostDone = false; clientDone = false;
  if (isOnline) {
    pending = [isHost ? P[0] : P[1]];
  } else {
    pending = [...P];
  }
  showCards();
}

function showCards(){
  paused=true; p=pending[0]; cardMode='cards'; setHead('¡Subiste de nivel!');
  $('up').querySelector('p').textContent='Elegí con el mouse o con las teclas 1, 2 o 3';
  cur=[...UP,...WP.filter(w=>p.wp[w.k]<5).map(w=>({n:w.n,d:w.d,op:'wp',wpKey:w.k,tag:'Arma · '+(p.wp[w.k]?'sube a nivel '+(p.wp[w.k]+1)+' de 5':'NUEVA'),f:()=>p.wp[w.k]++}))].sort(()=>Math.random()-.5).slice(0,3);
  const c=$('cards');c.innerHTML='';
  cur.forEach((u,i)=>{const b=document.createElement('button');b.className='card';b.innerHTML='<b>'+(i+1)+'. '+u.n+'</b>'+u.d+(u.c?'<em>Suma a '+SN[u.c]+'</em>':u.tag?'<em>'+u.tag+'</em>':'');b.onclick=()=>choose(u);c.appendChild(b)});
  $('up').style.display='flex';
}

function choose(u){
  const q=pending[0],modo=cardMode;p=q;u.f();if(modo==='cards'&&u.c)q.st[u.c]++;p=P[0];pending.shift();

  if (isOnline) {
    const payload = { type: isHost ? 'host_choice' : 'client_choice', op: u.op, c: u.c, wpKey: u.wpKey, lineIdx: u.lineIdx, weak: u.weak };
    if (conn) conn.send(payload);

    if (isHost) {
      hostDone = true;
      if (!clientDone) {
        setHead('ESPERANDO A JUGADOR 2');
        $('cards').innerHTML = '<p style="font-size:20px;color:var(--gold);padding:20px;">Jugador 1 listo. Esperando a que Jugador 2 elija...</p>';
        return;
      }
    } else {
      clientDone = true;
      if (!hostDone) {
        setHead('ESPERANDO A JUGADOR 1');
        $('cards').innerHTML = '<p style="font-size:20px;color:var(--gold);padding:20px;">Jugador 2 listo. Esperando a que Jugador 1 elija...</p>';
        return;
      }
    }
  }

  if(pending.length){modo==='line'?chooseLine():showCards();return}

  if (isOnline) {
    if (isHost && hostDone && clientDone) {
      if (modo === 'line') {
        if (conn) conn.send({ type: 'trigger_evo', stage: 3 });
        $('up').style.display = 'none';
        startEvo(3);
      } else {
        $('up').style.display = 'none';
        paused = false; last = performance.now();
        if (conn) conn.send({ type: 'resume_game' });
      }
    }
  } else {
    $('up').style.display = 'none';
    if (modo === 'line') startEvo(3);
    else { paused = false; last = performance.now(); }
  }
}

function spawn(ti){const a=Math.random()*6.283,d=Math.hypot(W,H)/2+40;
 const q=Math.random(),k=t>25&&q<.15?2:t>10&&q<.4?1:0,b=2+Math.floor(t/40);
 const HM=[1,1.8,3,4.5][ti],T=[{hp:b,sp:1,r:12,v:3},{hp:Math.max(1,Math.ceil(b/2)),sp:1.9,r:9,v:4},{hp:b*4,sp:.55,r:21,v:10}][k];
 en.push({x:cam.x+Math.cos(a)*d,y:cam.y+Math.sin(a)*d,k,ti,hp:T.hp*HM,sp:(55+Math.random()*25+t*.4)*T.sp*(1+.05*ti),r:T.r*(1+.12*ti),v:T.v*(1+.5*ti),dm:[1,1.3,1.7,2.2][ti],fl:0,ang:0,el:Math.floor(Math.random()*3),gun:k!==1&&t>15&&Math.random()<Math.min(.4,(t-15)/150)+.08*ti,cd:1+Math.random()*2})}
function burst(x,y,c){for(let i=0;i<8;i++){const a=Math.random()*6.283,s=60+Math.random()*120;pt.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,l:.4,c})}}
function wpn(q,dt){const wl=k=>q.wp[k],sc=k=>1+.3*(q.wp[k]-1);
 if(wl('onda')){q.wt.onda-=dt;if(q.wt.onda<=0){q.wt.onda=2.8-.2*wl('onda');const R=90+25*wl('onda');ef.push({k:'ring',x:q.x,y:q.y,R,l:.4,m:.4});for(const e of en)if(Math.hypot(e.x-q.x,e.y-q.y)<R+e.r)hit(e,q.dmg*1.2*sc('onda'))}}
 if(wl('orbe')){q.oa+=dt*3.2;const n=Math.min(5,wl('orbe')+1),key='oh'+q.id;for(let i=0;i<n;i++){const a=q.oa+i*6.283/n,ox=q.x+Math.cos(a)*64,oy=q.y+Math.sin(a)*64;for(const e of en)if(t-(e[key]||-9)>.45&&Math.hypot(e.x-ox,e.y-oy)<e.r+9){e[key]=t;hit(e,q.dmg*.9*sc('orbe'))}}}
 if(wl('rafaga')){q.wt.rafaga-=dt;if(q.wt.rafaga<=0){q.wt.rafaga=2.4;const n=[4,8,12,12,16][wl('rafaga')-1],o=Math.random()*6.283;for(let i=0;i<n;i++){const a=o+i*6.283/n;sh.push({x:q.x,y:q.y,vx:Math.cos(a)*340,vy:Math.sin(a)*340,l:1.1,pi:0,h:new Set(),d:q.dmg*.8*sc('rafaga')})}}}
 if(wl('rayo')){q.wt.rayo-=dt;if(q.wt.rayo<=0){let b=null,bd=520;for(const e of en){const d=Math.hypot(e.x-q.x,e.y-q.y);if(d<bd){bd=d;b=e}}
  if(b){q.wt.rayo=2.6-.15*wl('rayo');const a=Math.atan2(b.y-q.y,b.x-q.x),Lg=360,ca=Math.cos(a),sa=Math.sin(a);ef.push({k:'ray',x:q.x,y:q.y,a,Lg,l:.25,m:.25});
   for(const e of en){const px=e.x-q.x,py=e.y-q.y;if(px*ca+py*sa>0&&px*ca+py*sa<Lg&&Math.abs(-px*sa+py*ca)<e.r+9)hit(e,q.dmg*2.4*sc('rayo'))}}else q.wt.rayo=.3}}}

function update(dt){
 t+=dt;
 if (isOnline) {
   if (!isHost && conn) {
     conn.send({ type: 'input', keys: { w: keys.w||keys.arrowup, a: keys.a||keys.arrowleft, s: keys.s||keys.arrowdown, d: keys.d||keys.arrowright } });
   } else if (isHost && conn) {
     conn.send({
       type: 'sync',
       P: P.map(q => ({ x: q.x, y: q.y, hp: q.hp, max: q.max, stage: q.stage, face: q.face, dead: q.dead, line: q.line, wp: q.wp, oa: q.oa })),
       en: en.map(e => ({ x: e.x, y: e.y, r: e.r, k: e.k, ti: e.ti, el: e.el, fl: e.fl, ang: e.ang, gun: e.gun })),
       gems: gems.map(g => ({ x: g.x, y: g.y, v: g.v })),
       sh: sh.map(s => ({ x: s.x, y: s.y })),
       eb: eb.map(b => ({ x: b.x, y: b.y, el: b.el })),
       ef: ef.map(o => ({ k: o.k, x: o.x, y: o.y, R: o.R, l: o.l, m: o.m, a: o.a, Lg: o.Lg })),
       t, kills, lvl, need, xp
     });
   }
 }

 for(const q of P){if(q.dead)continue;let dx,dy;
  if(mode===1){dx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0);dy=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0)}
  else if(q.id===0){dx=(keys.d?1:0)-(keys.a?1:0);dy=(keys.s?1:0)-(keys.w?1:0)}
  else{
    const kSource = (isOnline && isHost) ? remoteKeys : keys;
    dx=(kSource.d||kSource.arrowright?1:0)-(kSource.a||kSource.arrowleft?1:0);
    dy=(kSource.s||kSource.arrowdown?1:0)-(kSource.w||kSource.arrowup?1:0);
  }
  if(dx||dy){const l=Math.hypot(dx,dy);q.x+=dx/l*q.sp*dt;q.y+=dy/l*q.sp*dt;if(dx)q.face=dx}
  q.inv-=dt}

 const al=P.filter(q=>!q.dead);
 if(al.length && mode===2){
   for(const q of al){
     q.x=Math.max(cam.x-W/2+40,Math.min(cam.x+W/2-40,q.x));
     q.y=Math.max(cam.y-H/2+40,Math.min(cam.y+H/2-40,q.y));
   }
 }

 if (isOnline && !isHost) {
   $('fill').style.width=Math.max(0,P[0].hp/P[0].max*100)+'%';
   if(mode===2)$('fill2').style.width=Math.max(0,P[1].hp/P[1].max*100)+'%';
   $('xpf').style.width=Math.min(100,xp/need*100)+'%';
   $('tm').textContent=Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');
   $('info').textContent='Nv '+lvl+' · '+kills+' virus';
   return;
 }

 spawnT-=dt;const iv=Math.max(.2,1.1-t*.008)/(mode===2?1.5:1),mt=Math.max(...P.map(q=>q.stage|0));
 while(spawnT<=0){for(let i=0,n=1+Math.floor(t/60);i<n&&en.length<(mode===2?340:260);i++)spawn(mt);spawnT+=iv}
 for(const q of al){q.atkT-=dt;
  if(q.atkT<=0){let b=null,bd=420;for(const e of en){const d=Math.hypot(e.x-q.x,e.y-q.y);if(d<bd){bd=d;b=e}}
   if(b){const a0=Math.atan2(b.y-q.y,b.x-q.x),n=q.multi;for(let i=0;i<n;i++){const a=a0+(i-(n-1)/2)*.22;sh.push({x:q.x,y:q.y,vx:Math.cos(a)*460,vy:Math.sin(a)*460,l:1,pi:q.pierce,h:new Set(),d:q.dmg})}q.atkT=q.rate}}}
 for(const s of sh){s.x+=s.vx*dt;s.y+=s.vy*dt;s.l-=dt;
  for(const e of en)if(s.l>0&&!s.h.has(e)&&Math.hypot(e.x-s.x,e.y-s.y)<e.r+6){hit(e,s.d);s.h.add(e);if(s.pi>0)s.pi--;else s.l=0;burst(s.x,s.y,'#ffd23f')}}
 sh=sh.filter(s=>s.l>0);
 for(const q of al)wpn(q,dt);
 for(const e of en){let tg=null,dd=1e9;for(const q of al){if(q.dead)continue;const d=Math.hypot(q.x-e.x,q.y-e.y);if(d<dd){dd=d;tg=q}}
  if(!tg)break;const a=Math.atan2(tg.y-e.y,tg.x-e.x);e.ang=a;
  if(!(e.gun&&dd<230)){e.x+=Math.cos(a)*e.sp*dt;e.y+=Math.sin(a)*e.sp*dt}e.fl-=dt;
  if(e.gun){e.cd-=dt;if(e.cd<=0&&dd<520){e.cd=2.2+Math.random();{const n=e.ti>=3?5:e.ti>=2?3:1,vb=230+25*e.ti;for(let j=0;j<n;j++){const aa=a+(j-(n-1)/2)*.28;eb.push({x:e.x,y:e.y,vx:Math.cos(aa)*vb,vy:Math.sin(aa)*vb,l:3,el:e.el,dm:e.dm})}}}}
  for(const q of al)if(!q.dead&&q.inv<=0&&Math.hypot(e.x-q.x,e.y-q.y)<e.r+q.r-4)hurt(q,[7,5,12][e.k]*e.dm,e.el)}
 for(const b of eb){b.x+=b.vx*dt;b.y+=b.vy*dt;b.l-=dt;for(const q of al)if(b.l>0&&!q.dead&&q.inv<=0&&Math.hypot(b.x-q.x,b.y-q.y)<q.r+4){hurt(q,6*b.dm,b.el);b.l=0}}eb=eb.filter(b=>b.l>0);
 for(let i=0;i<en.length;i++)for(let j=i+1;j<en.length;j++){const a=en[i],b=en[j],d=Math.hypot(a.x-b.x,a.y-b.y);
  if(d>0&&d<a.r*1.6){const k=(a.r*1.6-d)/2/d;a.x+=(a.x-b.x)*k;a.y+=(a.y-b.y)*k;b.x-=(a.x-b.x)*k;b.y-=(a.y-b.y)*k}}
 for(const e of en)if(e.hp<=0){kills++;gems.push({x:e.x,y:e.y,v:e.v});burst(e.x,e.y,ELC[e.el])}
 en=en.filter(e=>e.hp>0);
 const al2=P.filter(q=>!q.dead);
 for(const g of gems){let tg=null,td=1e9;for(const q of al2){const d=Math.hypot(q.x-g.x,q.y-g.y);if(d<td){td=d;tg=q}}
  if(tg){if(td<tg.mag){const a=Math.atan2(tg.y-g.y,tg.x-g.x);g.x+=Math.cos(a)*380*dt;g.y+=Math.sin(a)*380*dt}if(td<tg.r+8){xp+=g.v*tg.xpm;g.dead=1}}}
 gems=gems.filter(g=>!g.dead);
 if(xp>=need)levelUp();
 for(const f of fx){f.y-=45*dt;f.l-=dt}fx=fx.filter(f=>f.l>0);for(const o of ef)o.l-=dt;ef=ef.filter(o=>o.l>0);
 for(const q of pt){q.x+=q.vx*dt;q.y+=q.vy*dt;q.l-=dt}pt=pt.filter(q=>q.l>0);
 if(P.every(q=>q.dead))endRun('Fuiste borrado');
 $('fill').style.width=Math.max(0,P[0].hp/P[0].max*100)+'%';
 if(mode===2)$('fill2').style.width=Math.max(0,P[1].hp/P[1].max*100)+'%';
 $('xpf').style.width=Math.min(100,xp/need*100)+'%';
 $('tm').textContent=Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');$('tr').textContent='Enemigos: '+NAMES[mt];
 $('info').textContent='Nv '+lvl+' · '+kills+' virus';
 $('pst').textContent=Math.min(...P.map(q=>q.stage))<3?P.map(q=>(mode===2?'J'+(q.id+1)+' · ':'')+'FUE '+tot(q,'FUE')+' VEL '+tot(q,'VEL')+' INT '+tot(q,'INT')+' VIT '+tot(q,'VIT')).join('\n'):'';
}

function draw(){
 const al=P.filter(q=>!q.dead);
 if(al.length){
   cam.x=al.reduce((a,q)=>a+q.x,0)/al.length;
   cam.y=al.reduce((a,q)=>a+q.y,0)/al.length;
 }

 cx.fillStyle='#050b1a';cx.fillRect(0,0,W,H);
 const ox=W/2-cam.x,oy=H/2-cam.y;
 cx.strokeStyle='#0e2a4a';cx.lineWidth=1;cx.beginPath();
 for(let x=-((cam.x%64)+64)%64;x<W;x+=64){cx.moveTo(x,0);cx.lineTo(x,H)}
 for(let y=-((cam.y%64)+64)%64;y<H;y+=64){cx.moveTo(0,y);cx.lineTo(W,y)}
 cx.stroke();
 cx.save();cx.translate(ox,oy);
 for(const q of pt){cx.globalAlpha=q.l*2.5;cx.fillStyle=q.c;cx.fillRect(q.x-2,q.y-2,4,4)}cx.globalAlpha=1;
 for(const g of gems){cx.fillStyle=g.v>5?'#ffd23f':'#5cf2ff';const s=g.v>5?7:4;cx.beginPath();cx.arc(g.x,g.y,s,0,6.283);cx.fill()}
 for(const e of en){const C=e.fl>0?'#fff':ELC[e.el],D='#050b1a';cx.fillStyle=C;
  if(e.k===1){cx.save();cx.translate(e.x,e.y);cx.rotate(e.ang);cx.beginPath();cx.moveTo(e.r*1.4,0);cx.lineTo(-e.r,-e.r);cx.lineTo(-e.r*.5,0);cx.lineTo(-e.r,e.r);cx.fill();cx.restore()}
  else if(e.k===2){cx.fillRect(e.x-e.r,e.y-e.r,e.r*2,e.r*2);cx.fillStyle=D;cx.fillRect(e.x-e.r+4,e.y-e.r+4,e.r*2-8,e.r*2-8);cx.fillStyle=C;cx.fillRect(e.x-8,e.y-7,5,6);cx.fillRect(e.x+3,e.y-7,5,6);cx.fillRect(e.x-8,e.y+4,16,3)}
  else{cx.fillRect(e.x-e.r,e.y-e.r,e.r*2,e.r*2);cx.fillStyle=D;cx.fillRect(e.x-7,e.y-4,5,5);cx.fillRect(e.x+2,e.y-4,5,5);cx.fillRect(e.x-6,e.y+4,12,3)}
  for(let i=0;i<e.ti;i++){cx.fillStyle='#ffd23f';cx.fillRect(e.x-(e.ti*5-1)+i*10,e.y-e.r-10,7,5)}
  if(e.gun){cx.strokeStyle='rgba(255,255,255,.75)';cx.lineWidth=2;cx.beginPath();cx.arc(e.x,e.y,e.r+5,0,6.283);cx.stroke()}}
 cx.fillStyle='#ffd23f';for(const s of sh){cx.beginPath();cx.arc(s.x,s.y,5,0,6.283);cx.fill()}
 for(const b of eb){cx.fillStyle=ELC[b.el];cx.strokeStyle='#fff';cx.lineWidth=2;cx.beginPath();cx.arc(b.x,b.y,6,0,6.283);cx.fill();cx.stroke()}
 for(const o of ef){const k=1-o.l/o.m;cx.globalAlpha=o.l/o.m;
  if(o.k==='ring'){cx.strokeStyle='#4db8ff';cx.lineWidth=6;cx.beginPath();cx.arc(o.x,o.y,o.R*k,0,6.283);cx.stroke()}
  else{cx.strokeStyle='#bfe6ff';cx.lineWidth=14;cx.lineCap='round';cx.beginPath();cx.moveTo(o.x,o.y);cx.lineTo(o.x+Math.cos(o.a)*o.Lg,o.y+Math.sin(o.a)*o.Lg);cx.stroke();cx.lineCap='butt'}
  cx.globalAlpha=1}
 for(const q of P)if(!q.dead&&q.wp.orbe){const n=Math.min(5,q.wp.orbe+1);cx.fillStyle='#4db8ff';cx.strokeStyle='#fff';cx.lineWidth=2;for(let i=0;i<n;i++){const a=q.oa+i*6.283/n;cx.beginPath();cx.arc(q.x+Math.cos(a)*64,q.y+Math.sin(a)*64,9,0,6.283);cx.fill();cx.stroke()}}
 for(const q of P){const s=q.stage|0,hh=[40,46,56,68][s];
  if(q.dead)drawBuddy(q,s,q.x,q.y,q.face,.25);
  else if(!evo&&(q.inv<=0||Math.floor(t*20)%2))drawBuddy(q,s,q.x,q.y,q.face,1);
  if(mode===2){cx.textAlign='center';cx.font='bold 13px Chakra Petch,system-ui,sans-serif';cx.fillStyle=PC[q.id];cx.fillText(q.dead?'J'+(q.id+1)+' ✝ (revive al subir de nivel)':'J'+(q.id+1),q.x,q.y-hh/2-8)}}
 if(evo){const e0=evo.t,sw=e0>=1.3,pul=Math.sin(e0*Math.PI/2.8);
  for(const q of P){
   drawBuddy(q,sw?evo.s:evo.s-1,q.x,q.y,q.face,sw?Math.min(1,(e0-1.3)*2):Math.max(0,1-e0*.9));
   cx.fillStyle='rgba(255,255,255,'+(.25+pul*.7)+')';cx.beginPath();cx.arc(q.x,q.y,18+pul*34,0,6.283);cx.fill();
   cx.strokeStyle='#ffd23f';cx.lineWidth=3;for(let i=0;i<3;i++){const r=(e0*1.2+i/3)%1;cx.globalAlpha=1-r;cx.beginPath();cx.arc(q.x,q.y,10+r*110,0,6.283);cx.stroke()}cx.globalAlpha=1}}
 cx.textAlign='center';cx.lineJoin='round';for(const f of fx){cx.globalAlpha=Math.min(1,f.l*2);cx.font='bold '+f.sz+'px Chakra Petch,system-ui,sans-serif';cx.lineWidth=4;cx.strokeStyle='#000';cx.strokeText(f.txt,f.x,f.y);cx.fillStyle=f.col;cx.fillText(f.txt,f.x,f.y)}cx.globalAlpha=1;
 cx.restore();
}

function loop(n){const dt=Math.min(.05,(n-last)/1000);last=n;if(evo)stepEvo(dt);else if(!paused)update(dt);draw();if(running)requestAnimationFrame(loop)}
P=[np(0)];p=P[0];draw();wal();
