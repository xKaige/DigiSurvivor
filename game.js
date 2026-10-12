const cv=document.getElementById('c'),cx=cv.getContext('2d');
let W,H;function rs(){W=cv.width=innerWidth;H=cv.height=innerHeight}addEventListener('resize',rs);rs();
const keys={};
let P=[],p,cam={x:0,y:0},en=[],sh=[],pt=[],gems=[],fx=[],ef=[],eb=[],t=0,kills=0,running=false,spawnT=0,last=0,xp=0,lvl=1,need=5,paused=false,evo=null,pending=[],cardMode='cards',mode=1,lastMode=1,cur=[],treeOpen=false;
const PC=['#2ee6c8','#ff7ad9'],ELC=['#4db8ff','#c05bff','#ffb02e'],$=id=>document.getElementById(id);

// Sprite Animado Agumon con remoción de fondo verde por muestra (0,0)
let agumonCanvas = null;
const agumonImg = new Image();
agumonImg.src = 'agumon.png';
agumonImg.onload = () => {
  const tempCv = document.createElement('canvas');
  tempCv.width = agumonImg.naturalWidth;
  tempCv.height = agumonImg.naturalHeight;
  const tempCx = tempCv.getContext('2d');
  tempCx.drawImage(agumonImg, 0, 0);
  const imgData = tempCx.getImageData(0, 0, tempCv.width, tempCv.height);
  const d = imgData.data;
  
  // Muestra del color verde del fondo (píxel superior izquierdo)
  const bgR = d[0], bgG = d[1], bgB = d[2];

  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i] - bgR) < 35 && Math.abs(d[i+1] - bgG) < 35 && Math.abs(d[i+2] - bgB) < 35) {
      d[i+3] = 0;
    }
  }
  tempCx.putImageData(imgData, 0, 0);
  agumonCanvas = tempCv;
};

// Multijugador Online
let peer = null, conn = null, isHost = false, isOnline = false, remoteKeys = {};
let hostDone = false, clientDone = false;

window.initPeer = function(name) {
  if (peer) return;
  const shortId = 'digi-' + Math.floor(1000 + Math.random() * 9000);
  peer = new Peer(shortId);
  peer.on('open', id => {
    if ($('my-peer-code'))$('my-peer-code').textContent = 'Tu código de amigo: ' + id;
  });
  peer.on('connection', c => {
    conn = c;
    isHost = true;
    setupConn();
  });
};

function setupConn() {
  if ($('party-status'))$('party-status').textContent = '¡Amigo conectado!';
  if (isHost && $('go-online'))$('go-online').style.display = 'inline-block';
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

if ($('btn-connect')) {$('btn-connect').onclick = () => {
    const code = $('friend-code').value.trim();
    if (!code || !peer) return;
    conn = peer.connect(code);
    isHost = false;
    setupConn();
  };
}

if ($('go-online')) {$('go-online').onclick = () => {
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
function np(i){return{id:i,x:0,y:0,hp:100,max:100,r:16,sp:210,face:1,inv:0,dmg:1,rate:.6,multi:1,pierce:0,mag:70,stage:0,line:0,weak:false,dead:false,moving:false,atkT:0,arm:0,xpm:1,coin:1,st:{FUE:0,VEL:0,VIT:0,INT:0},wp:{onda:0,orbe:0,rafaga:0,rayo:0},wt:{onda:0,rafaga:0,rayo:0},oa:0}}
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
try{const s=JSON.parse(localStorage.getItem('digisurvivor'));
