// Regresiones de los issues #21, #24 y #26–28. Ejecutar con Node y Playwright: node --test tools/test-gameplay.cjs
// PLAYWRIGHT_CHANNEL=msedge usa Edge instalado. TEST_OUTPUT_DIR guarda las capturas de revisión.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
let server, browser, origin;
before(async () => {
  server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    try {
      const data = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
async function withPages(n, run) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 950 } }), errors = [];
  // Sin Firebase ni cuentas reales. La simulación avanza manualmente para reproducir los límites exactos.
  await context.route('https://**/*', route => route.abort());
  try {
    const pages = [];
    for (let i = 0; i < n; i++) {
      const page = await context.newPage(); pages.push(page);
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (/Error en la simulación|Error al dibujar/.test(m.text())) errors.push(m.text()); });
      await page.goto(origin);
      await page.waitForFunction(() => typeof Progress !== 'undefined' && Progress.data && Bosses.data && Enemies.data && CREATURES.every(c => CreatureLoader.cache[c.id]));
      await page.evaluate(() => { requestAnimationFrame = () => 0; bgStart = () => {}; selected = '001_guilmon'; });
    }
    await run(...pages);
    assert.deepEqual(errors, [], 'Sin excepciones en la simulación ni en el dibujo');
  } finally { await context.close(); }
}
const localStart = (page, n) => page.evaluate(n => start(n, Array(n).fill('001_guilmon')), n);
async function screenshot(page, name) {
  if (!process.env.TEST_OUTPUT_DIR) return;
  await fs.mkdir(process.env.TEST_OUTPUT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(process.env.TEST_OUTPUT_DIR, name + '.png') });
}
for (const n of [1, 2]) test(`#26: las barras Royal Knights no vuelven al menú en ${n}J`, () => withPages(1, async page => {
  await localStart(page, n);
  await page.evaluate(() => { Finale.royals(); Bosses.hud(); });
  assert.equal(await page.locator('#bossbar .bb-one').count(), 6);
  assert.equal(await page.locator('#bossbar').isVisible(), true);
  await page.evaluate(() => { P.forEach(q => { q.dead = true; q.hp = 0; }); endRun('Run terminada'); hudBars(); draw(); });
  assert.equal(await page.locator('#bossbar').isVisible(), false);
  assert.equal(await page.evaluate(() => document.body.matches('.boss2,.bossN')), false);
  await screenshot(page, `menu-sin-barras-${n}J`);
  await localStart(page, n);
  assert.equal(await page.locator('#bossbar').isVisible(), false);
}));

for (const n of [1, 2]) test(`#28: cuatro saltos por reloj y élite un escalón arriba en ${n}J`, () => withPages(1, async page => {
  await localStart(page, n);
  const result = await page.evaluate(() => {
    const cases = [[0,0,1],[149.99,0,1],[150,1,2],[299.99,1,2],[300,2,3],[449.99,2,3],[450,3,4],[599.99,3,4],[600,4,5],[899,4,5]], results = [];
    for (const stage of [0, 5]) for (const [secs, normal, elite] of cases) {
      P.forEach(q => q.stage = stage); t = secs + 180; arT = 180; en = [];
      for (let j = 0; j < 20; j++) spawn(Enemies.tier(), 1);
      Enemies.chT = 0; Enemies.champ(.01);
      results.push({ secs, stage, normal, elite, tiers: [...new Set(en.filter(e => !e.cp).map(e => Enemies.def(e.et).tier))], elites: en.filter(e => e.cp).map(e => Enemies.def(e.et).tier) });
    }
    Enemies.chT = 1; Enemies.newRun();
    return { results, timer: Enemies.chT, roster: Enemies.roster.map(a => [...new Set(a.map(i => Enemies.def(i).tier))]), babiesII: Enemies.data.list.filter(d=>d.tier===1).map(d=>d.id).sort() };
  });
  for (const r of result.results) { assert.deepEqual(r.tiers, [r.normal], JSON.stringify(r)); assert.deepEqual(r.elites, [r.elite], JSON.stringify(r)); }
  assert.deepEqual(result.roster, [[0],[1],[2],[3],[4],[5]]);
  assert.deepEqual(result.babiesII, ['bosamon','caprimon','pagumon','yaamon']);
  assert.equal(result.timer, 60);
  const labels = await page.evaluate(() => {
    t = 450; arT = 0; en = []; P.forEach(q => q.stage = 0); Enemies.chT = 0; Enemies.champ(1);
    en[0].x = cam.x + W; en[0].y = cam.y;
    update(0);
    const labels = [], fill = cx.fillText; cx.fillText = function(text, ...args) { labels.push(text); return fill.call(this, text, ...args); };
    draw(); cx.fillText = fill; return labels;
  });
  assert.ok(labels.some(s => s.startsWith('Élite ·'))); assert.ok(!labels.some(s => s.startsWith('Campeón')));
  assert.equal(await page.locator('#tm').textContent(), '7:30');
  await screenshot(page, `enemigos-7m30-${n}J`);
}));

for (const n of [1, 2]) test(`#27: Renacer conserva recursos y la progresión de los demás en ${n}J`, () => withPages(1, async page => {
  await localStart(page, n);
  await page.evaluate(() => {
    lvl = 22; P.forEach(q => { for (let s = 1; s <= 2; s++) { q.stage = s; Stats.evolve(q, s); } q.vp.rc = 2; });
    window.beforeRebirth = P.map(q => ({ wp: {...q.wp}, st: {...q.st}, bs: {...q.bs}, m: {...q.m} })); togglePause(); draw();
  });
  await screenshot(page, `renacer-local-${n}J`);
  await page.locator(n === 1 ? '#preb' : '#preb1').click();
  const after = await page.evaluate(() => ({ stages: P.map(q => q.stage), chips: P.map(q => q.vp.rc), level: lvl, before: beforeRebirth, after: P.map(q => ({ wp: {...q.wp}, st: {...q.st}, bs: {...q.bs}, m: {...q.m} })) }));
  assert.deepEqual(after.stages, n === 1 ? [0] : [2,0]);
  assert.deepEqual(after.chips, n === 1 ? [1] : [2,1]);
  assert.equal(after.level, 22); assert.deepEqual(after.after, after.before);
  const steps = await page.evaluate(() => {
    const steps = [];
    while (lvl < 40) {
      xp = need; levelUp();
      let guard = 0;
      while ((evo || pending.length) && guard++ < 20) {
        if (evo) { draw(); stepEvo(10); }
        else { cardsAt = -10000; choose(cur.find(u => !u.lock && (cardMode === 'line' || u.c)) || cur.find(u => !u.lock)); }
      }
      if (paused) throw Error('La partida quedó pausada en ' + lvl);
      steps.push([lvl, P.map(q => q.stage)]);
    }
    return steps;
  });
  const at = level => steps.find(s => s[0] === level)[1];
  assert.deepEqual(at(24), n === 1 ? [1] : [3,1]);
  assert.deepEqual(at(26), n === 1 ? [2] : [3,2]);
  assert.deepEqual(at(28), n === 1 ? [3] : [3,3]);
  assert.deepEqual(at(32), Array(n).fill(4));
  assert.deepEqual(at(40), Array(n).fill(5));
  assert.equal(await page.evaluate(() => rebirth(P[P.length-1])), false);
}));

async function onlineStart(host, ...guests) {
  const channel = `qa-${Date.now()}`, pages = [host,...guests];
  for (const [i, page] of pages.entries()) await page.evaluate(({i,channel,n}) => {
    const connection = index => {
      const bc = new BroadcastChannel(channel+'-'+index), handlers = {};
      const c = { open:true, pi:index, send:m=>bc.postMessage(JSON.parse(JSON.stringify(m))), on:(event,fn)=>(handlers[event] ||= []).push(fn), close:()=>{} };
      bc.onmessage = e => (handlers.data || []).forEach(fn => fn(e.data));return c;
    };
    me = { uid: 'qa'+i, nick: i ? 'Invitado' : 'Anfitrión' }; isHost = !i; myIdx = i;
    if(i){conn=connection(i);setupConn(conn)}else{gs=Array.from({length:n-1},(_,j)=>({c:connection(j+1),i:j+1,uid:'qa'+(j+1),nick:'Invitado '+(j+1),cid:selected}));gs.forEach(g=>setupConn(g.c))}
  }, {i,channel,n:pages.length});
  await host.evaluate(() => Lobby.startOnline());
  await Promise.all(pages.map(page => page.waitForFunction(n => running && P.length === n, pages.length)));
  // start carga sprites y alternativas después de running=true; esta espera verifica que terminó la preparación.
  await Promise.all(pages.map(page => page.waitForFunction(() => document.getElementById('ov').style.display === 'none')));
}
async function sync(host, guest) {
  await host.evaluate(() => { syncT = slowT = 0; hostSync(0); });
  const state = await host.evaluate(() => P.map(q => [q.stage,q.vp.rc,q.rbL == null ? null : q.rbL]));
  await guest.waitForFunction(state => JSON.stringify(P.map(q => [q.stage,q.vp.rc,q.rbL == null ? null : q.rbL])) === JSON.stringify(state), state);
}
async function finishOnlineRound(host, ...guests) {
  for (let guard = 0; guard < 20; guard++) {
    // El invitado termina primero su animación: el anfitrión envía el paso siguiente.
    if (await host.evaluate(() => !!evo)) {
      for(const guest of guests){await guest.waitForFunction(() => !!evo);await guest.evaluate(() => { if(!window.testLagAnimation)stepEvo(10) })}
      await host.evaluate(() => stepEvo(10));
    } else {
      const round = await host.evaluate(() => ({rnd,open:rndOpen}));
      if (!round.open) return;
      for(const guest of guests)await guest.waitForFunction(rnd => gRnd === rnd, round.rnd);
      for (const page of [host,...guests]) await page.evaluate(() => { if (pending.length) { cardsAt = -10000; choose(cur.find(u => !u.lock && (cardMode === 'line' || u.c)) || cur.find(u => !u.lock)); } });
      await host.waitForFunction(expected => !rndOpen || rnd !== expected, round.rnd);
    }
    if (await host.evaluate(() => !paused && !evo)) { for(const guest of guests)await guest.waitForFunction(() => !paused && !evo);return; }
  }
  throw Error('La ronda online quedó trabada');
}

test('#27 online: chip del invitado, etapas independientes, formas finales y chip del anfitrión', () => withPages(2, async (host, guest) => {
  await onlineStart(host, guest);
  await host.evaluate(() => { lvl = 32; P.forEach((q,i) => { for (let s=1;s<=(i?3:4);s++) { q.stage=s;Stats.evolve(q,s); } q.vp.rc=2; }); });
  await sync(host,guest);
  await guest.evaluate(() => { togglePause();draw(); });
  assert.equal(await guest.locator('#preb').isEnabled(), true);
  await screenshot(guest, 'renacer-online-invitado');
  await guest.locator('#preb').click();
  await host.waitForFunction(() => P[1].stage === 0);
  await sync(host,guest);
  assert.deepEqual(await host.evaluate(() => P.map(q => [q.stage,q.vp.rc])), [[4,2],[0,1]]);
  // Solicitudes duplicadas, incluso con un índice ajeno: nunca consumen el chip del anfitrión.
  await guest.evaluate(() => { sendTo(conn,{type:'rebirth',i:0});sendTo(conn,{type:'rebirth',i:0}); });
  await guest.waitForFunction(() => document.getElementById('evt').textContent.startsWith('No podés renacer'));
  assert.deepEqual(await host.evaluate(() => P.map(q => q.vp.rc)), [2,1]);
  for (let level = 33; level <= 40; level++) {
    await host.evaluate(() => { xp=need;levelUp(); });
    await finishOnlineRound(host,guest); await sync(host,guest);
    const expectedGuest = level < 34 ? 0 : level < 36 ? 1 : level < 38 ? 2 : level < 40 ? 3 : 4;
    assert.deepEqual(await guest.evaluate(() => P.map(q=>q.stage)), [level<40?4:5,expectedGuest]);
  }
  await host.evaluate(() => togglePause()); await host.locator('#preb').click();
  await sync(host,guest);
  assert.deepEqual(await guest.evaluate(() => P.map(q=>[q.stage,q.vp.rc,q.rbL])), [[0,1,40],[4,1,32]]);
  await host.evaluate(() => { Finale.royals();Bosses.hud(); }); await sync(host,guest);
  await guest.evaluate(() => hudBars()); assert.equal(await guest.locator('#bossbar').isVisible(), true);
  await host.evaluate(() => endRun('Run terminada')); await guest.waitForFunction(() => !running);
  await guest.evaluate(() => { hudBars();draw(); });
  assert.equal(await guest.locator('#bossbar').isVisible(), false);
  assert.equal(await guest.evaluate(() => { applyOnlineSync({type:'sync',t:999,fn:{rk:1}});return t===999; }), false);
}));

test('#27: Renacer rechaza caídos, sin chips, bebés y cartas en curso', () => withPages(1, async page => {
  await localStart(page, 2);
  assert.deepEqual(await page.evaluate(() => {
    const q=P[1], results=[];q.stage=3;q.vp.rc=1;
    q.dead=true;results.push(rebirth(q));q.dead=false;q.vp.rc=0;results.push(rebirth(q));q.vp.rc=1;
    q.stage=1;results.push(rebirth(q));q.stage=3;paused=true;results.push(rebirth(q));paused=false;
    q.gone=true;results.push(rebirth(q));q.gone=false;Finale.on=true;results.push(rebirth(q));Finale.on=false;
    return { results, chips:q.vp.rc,stage:q.stage };
  }), { results:Array(6).fill(false),chips:1,stage:3 });
}));

test('#27 online de 4: tres etapas distintas, pestaña lenta y desconexión durante una elección', () => withPages(4, async (host,...guests) => {
  await onlineStart(host,...guests);
  // Un invitado no dibuja cuadros de la animación: igual debe completar cada evolución al recibir el siguiente paso.
  await guests[0].evaluate(()=>window.testLagAnimation=true);
  await host.evaluate(() => {
    lvl=37;
    P.forEach(q=>{for(let s=1;s<=4;s++){q.stage=s;Stats.evolve(q,s)}q.vp.rc=1});
    Object.assign(P[1],{stage:2,rbL:32,rbFrom:3});Object.assign(P[3],{stage:0,rbL:36,rbFrom:4});
  });
  for(const guest of guests)await sync(host,guest);
  await host.evaluate(()=>{xp=need;levelUp()});
  await finishOnlineRound(host,...guests);
  assert.deepEqual(await host.evaluate(()=>P.map(q=>q.stage)),[4,3,4,1]);
  await host.evaluate(()=>{lvl=39;xp=need;levelUp()});
  await finishOnlineRound(host,...guests);
  for(const page of [host,...guests])assert.deepEqual(await page.evaluate(()=>P.map(q=>q.stage)),[5,4,5,2]);
  // El único jugador de una ronda pierde conexión: el anfitrión (que no evoluciona) debe seguir.
  await host.evaluate(()=>{lvl=41;xp=need;levelUp();connClosed(gs.find(g=>g.i===3).c,'prueba')});
  await finishOnlineRound(host,...guests.slice(0,2));
  assert.equal(await host.evaluate(()=>paused||!!evo||rndOpen),false);
}));

test('#21: catálogo completo contra fichas revisadas y etapas representativas', async () => {
  const json=async f=>JSON.parse(await fs.readFile(path.join(root,f),'utf8'));
  const ref=await json('tools/canon-reference.json'),enemy=(await json('src/data/enemies.json')).list,boss=(await json('src/data/bosses.json')).list;
  for(const [scope,list]of [['enemy',enemy],['boss',boss]])for(const d of list){const r=ref[scope][d.id];assert.ok(r,d.id);assert.equal(d.attribute,r.attribute,d.id);assert.equal(d.level,r.level,d.id);if(scope==='enemy')assert.equal(d.tier,r.tier,d.id);}
  for(const [id,tier]of [['devimon',3],['siriusmon',5],['bosamon',1],['coredramon',3],['gulusgammamon',3],['lamortmon',4],['kaisergreymon',5]])assert.equal(enemy.find(d=>d.id===id).tier,tier,id);
  for(const id of ['dukemon','lordknightmon','metaletemon'])assert.equal(boss.find(d=>d.id===id||d.id==='royal_'+id).attribute,'Virus',id);
  for(let s=0;s<6;s++)assert.ok(enemy.some(d=>d.tier===s),'Hay especies para la etapa '+s);
});

for(const n of [1,2])test(`#21: daño neutro, atributos visibles y líneas jugables fijas en ${n}J`,()=>withPages(1,async page=>{
  await localStart(page,n);
  const result=await page.evaluate(async()=>{
    const q=P[0];q.el=0;q.fam=null;q.tr='';q.crit=0;q.arm=0;q.dodge=0;q.leech=0;q.max=1000;q.m.shield=0;q.m.bulletRes=0;
    const matrix=ATTR.map((_,a)=>ATTR.map((_,d)=>mult(a,d))),hits=[],hurtBy=[];
    for(let el=0;el<ATTR.length;el++){const e={x:0,y:0,r:10,hp:1000,mh:1000,el};q.hp=1000;hit(e,10,q.el,q);hits.push(1000-e.hp);hurt(q,10,el,'b');hurtBy.push(1000-q.hp);}
    const reps=ATTR.map((_,el)=>Enemies.data.list.find(d=>Enemies.elOf(d)===el));await Promise.all(reps.filter(Boolean).map(d=>Enemies.loadSprite(d)));
    en=[];reps.forEach((d,el)=>{if(d)Enemies.make(Enemies.data.list.indexOf(d),d.tier,q.x-300+el*90,q.y-80)});
    await Promise.all(ATTR_IMG.map(img=>img.decode()));
    fx=[];pt=[];const icons=[],drawImage=cx.drawImage;cx.drawImage=function(img,...args){if(img.src?.includes('/sprites/attr/'))icons.push({src:img.src,w:args[2],h:args[3]});return drawImage.call(this,img,...args)};draw();cx.drawImage=drawImage;
    return {matrix,hits,hurtBy,icons,validColors:ELC.every(Boolean),bosses:Bosses.data.list.filter(b=>b.royal).map(b=>[b.name,ATTR[Bosses.elOf(b)]])};
  });
  for(let a=0;a<7;a++)for(let d=0;d<7;d++)assert.equal(result.matrix[a][d],a>2||d>2?1:d===(a+1)%3?1.5:a===(d+1)%3?.5:1);
  assert.deepEqual(result.hits,[10,15,5,10,10,10,10]);assert.deepEqual(result.hurtBy,[10,5,15,10,10,10,10]);assert.ok(result.validColors);
  const badges=result.icons.filter(s=>s.src.endsWith('/neutral.svg'));assert.equal(badges.length,4);
  assert.equal(result.icons.length,7);assert.ok(result.icons.every(s=>s.w===13&&s.h===13),'Todos los hexágonos tienen el mismo tamaño');
  assert.deepEqual(result.bosses.find(x=>x[0]==='Magnamon'),['Magnamon','Free']);
  await screenshot(page,`atributos-reales-${n}J`);
  await page.evaluate(()=>{Progress.open();Progress.tab='boss';Progress.render()});
  const recorded=page.locator('#analyzer small[title="Armor · Free"]');
  assert.equal(await recorded.textContent(),'Armor · ');assert.equal(await recorded.isVisible(),true);
  assert.equal(await recorded.locator('img').getAttribute('alt'),'Ne');await recorded.locator('img').evaluate(img=>img.decode());
  assert.equal(await recorded.evaluate(el=>getComputedStyle(el).color),'rgb(184, 193, 204)');
  await page.evaluate(()=>Progress.close());
}));

for(const n of [1,2])test(`#21: Gammamon recorre sus seis etapas y cada rama tiene salida en ${n}J`,()=>withPages(1,async page=>{
  await page.evaluate(n=>start(n,Array(n).fill('006_gammamon')),n);
  const paths=await page.evaluate(()=>{
    const q=P[0],C=CR(q),paths=[];
    for(const prev of ['main',...C.meta.stages[3].alts.map(a=>a.id)]){
      q.alt={3:prev==='main'?null:prev};const options=formOpts(q,4);if(!options.some(o=>o.xp))throw Error('Sin salida de '+prev);
      for(const o of options){q.alt[4]=o.id;const finals=formOpts(q,5);if(!finals.some(b=>b.xp))throw Error('Sin Mega para '+o.name);paths.push([prev,o.name,finals.map(b=>b.name)]);}
    }
    for(const st of C.meta.stages)for(const a of [st,...(st.alts||[])])for(const k of a.skills||[])if(SkillSys.maxOf(k)!==5)throw Error('Skill no final con 10 niveles: '+k);
    for(const b of C.meta.branches)for(const k of b.skills)if(SkillSys.maxOf(k)!==10)throw Error('Skill Mega sin 10 niveles: '+k);
    q.alt={};return paths;
  });
  assert.ok(paths.some(p=>p[0]==='wezengamma'&&p[1]==='Canoweissmon'));
  assert.ok(paths.some(p=>p[0]==='gulusgamma'&&p[1]==='Regulusmon'&&p[2].includes('Arcturusmon')));
  assert.ok(!paths.some(p=>p[1]==='Canoweissmon'&&p[2].includes('Canoweissmon')));
  const states=await page.evaluate(()=>{
    const out=[];
    for(let level=2;level<=40;level++){
      xp=need;levelUp();let guard=0;
      while((evo||pending.length)&&guard++<30){
        if(evo){draw();stepEvo(10)}else{cardsAt=-10000;const dark=p.id===P.length-1;const target=lineStage===3?'GulusGammamon':lineStage===4?'Regulusmon':'Arcturusmon';choose(cardMode==='line'?(dark&&cur.find(u=>u.n===target&&!u.lock)||cur.find(u=>!u.lock&&u.xp)||cur.find(u=>!u.lock)):(cur.find(u=>u.c)||cur[0]));}
      }
      if(paused)throw Error('Partida bloqueada en '+level);
      if([8,16,24,32,40].includes(level))out.push(P.map(q=>({name:formName(q,q.stage),attribute:ATTR[q.el],stage:q.stage,pool:SkillSys.pool(q)})));
      // Los requisitos de Gulus se cumplen antes de elegir Campeón; las demás salidas tienen opción por XP.
      P.forEach(q=>q.vp.k=200);
    }hudBars();draw();return out;
  });
  assert.deepEqual(states.map(a=>a.at(-1).name),['Gurimon','Gammamon','GulusGammamon','Regulusmon','Arcturusmon']);
  if(n===2)assert.deepEqual(states.map(a=>a[0].name),['Gurimon','Gammamon','BetelGammamon','Canoweissmon','Siriusmon']);
  for(const row of states)for(const q of row)assert.equal(q.attribute,'Virus');
  assert.ok(states[3].at(-1).pool.includes('genierce'));
  await screenshot(page,`gammamon-corregido-${n}J`);
}));

test('#21 online: atributos neutrales y forma de Gammamon se conservan al sincronizar',()=>withPages(2,async(host,guest)=>{
  await Promise.all([host,guest].map(page=>page.evaluate(()=>{selected='006_gammamon'})));
  await onlineStart(host,guest);
  await Promise.all([host,guest].map(page=>page.evaluate(async()=>{await CreatureLoader.loadAlts('006_gammamon')})));
  await host.evaluate(()=>{const q=P[1];q.stage=4;q.alt={3:'gulusgamma',4:'regulus'};const d=defaultEvolution(q,5);if(d.branchId!=='6_1')throw Error('Salida por experiencia inválida');applyCardOp(q,{op:'line',stage:5,lineIdx:3,branchId:'v_arcturus'});q.stage=5;Finale.royals();for(const attr of ['Free','Variable','Desconocido','Sin atributo']){const i=Enemies.data.list.findIndex(d=>d.attribute===attr);Enemies.make(i,Enemies.data.list[i].tier,q.x,q.y)}});
  await sync(host,guest);
  await guest.waitForFunction(()=>P[1].cid==='006_gammamon'&&P[1].stage===5&&en.some(e=>e.el>=3));
  assert.deepEqual(await guest.evaluate(()=>[formName(P[1],5),ATTR[P[1].el],SkillSys.pool(P[1])]),['Arcturusmon','Virus',['black_death','black_confession']]);
  const attrs=await guest.evaluate(()=>en.filter(e=>e.bo!=null).map(e=>ATTR[e.el]));assert.ok(attrs.includes('Free'));
  assert.deepEqual(await guest.evaluate(()=>en.filter(e=>e.bo==null).map(e=>ATTR[e.el]).sort()),['Desconocido','Free','Sin atributo','Variable']);
  await guest.evaluate(()=>{Bosses.hud();draw()});const badge=guest.locator('#bossbar .bb-neutral');
  assert.equal(await badge.locator('img').getAttribute('alt'),'Ne');await badge.locator('img').evaluate(img=>img.decode());
  assert.equal(await badge.isVisible(),true);assert.ok((await badge.getAttribute('title')).includes('Free'));
  assert.equal(await badge.evaluate(el=>getComputedStyle(el).color),'rgb(184, 193, 204)');
  await screenshot(guest,'neutral-online');
}));

test('#21: sprites y ataques de todas las formas de Gammamon',()=>withPages(1,async page=>{
  await page.evaluate(()=>start(1,['006_gammamon']));
  const checked=await page.evaluate(()=>{
    const q=P[0],C=CR(q),M=C.meta,keys=[],skills=new Set();
    for(const st of M.stages){keys.push('stage_'+st.stage);for(const a of [st,...(st.alts||[])]){if(a.id)keys.push('alt_'+st.stage+'_'+a.id);for(const k of a.skills||[])skills.add(k)}}
    for(const b of M.branches){keys.push('branch_'+b.id);for(const k of b.skills)skills.add(k)}
    for(const key of keys)if(!C.canvases[key]?.canvas.width)throw Error('Sprite ausente: '+key);
    q.stage=5;q.crit=0;en=[];const e=Enemies.make(0,0,q.x+40,q.y);e.x=q.x+40;e.y=q.y;e.hp=e.mh=1e9;
    for(const k of skills){
      if(!SkillSys.def(k))throw Error('Skill ausente: '+k);
      q.wp={[k]:SkillSys.maxOf(k)};q.wt={};q.casts=0;sh=[];ef=[];fx=[];pt=[];
      SkillSys.update(q,.02);if(q.casts<1)throw Error('No disparó '+k);
      for(const o of [...sh,...ef,e])for(const [field,v]of Object.entries(o))if(typeof v==='number'&&!Number.isFinite(v))throw Error(k+': '+field+' inválido');
      draw();
    }
    return {sprites:keys.length,skills:skills.size};
  });
  assert.ok(checked.sprites>=15);assert.ok(checked.skills>20);
}));

for(const n of [1,2])test(`#24: hacen falta 5 minutos y una evolución propia en ${n}J`,()=>withPages(1,async page=>{
  await page.evaluate(()=>{const s=Progress.blank();s.runs=14;window.loadProg(s)});
  for(const [secs,stage]of [[0,0],[1,1],[299.99,1],[300,0],[300,1]]){
    await localStart(page,n);
    await page.evaluate(({secs,stage})=>{t=secs;kills=7;P.at(-1).stage=stage;togglePause();draw()},{secs,stage});
    await page.locator('#pquit').click();
    const expected=secs>=300&&stage>=1?15:14;
    assert.deepEqual(await page.evaluate(()=>({runs:Progress.read().runs,state:Progress.state('014_herissmon')})),{runs:expected,state:expected===15?'egg':'lock'});
    // Una segunda llamada de cierre no puede contar dos veces la misma partida.
    await page.evaluate(()=>endRun('Run terminada'));
    assert.equal(await page.evaluate(()=>Progress.read().runs),expected);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem(Progress.KEY)).runs),expected);
    if(secs===299.99){
      await page.evaluate(()=>{Progress.open();Progress.tab='egg';Progress.render()});
      const mission=page.locator('.an-row').filter({hasText:'Tamer constante'});
      assert.ok((await mission.innerText()).includes('14 / 15'));
      assert.doesNotMatch(await mission.innerText(),/5 min|300|cinco|primera evoluci/i);
      if(process.env.TEST_OUTPUT_DIR){await fs.mkdir(process.env.TEST_OUTPUT_DIR,{recursive:true});await mission.screenshot({path:path.join(process.env.TEST_OUTPUT_DIR,`mision-partidas-${n}J.png`)})}
      await page.evaluate(()=>Progress.close());
    }
  }
  assert.equal(await page.evaluate(()=>Progress.read().kills),35,'Los demás objetivos siguen contando en partidas cortas');
  assert.equal(await page.evaluate(()=>Progress.read().bestSecs),300);
  await localStart(page,n);
  assert.equal(await page.evaluate(()=>{t=300;const q=P.at(-1);q.stage=2;q.vp.rc=1;const ok=rebirth(q);if(q.stage!==0)throw Error('No volvió a Bebé');endRun('Run terminada');return ok}),true);
  assert.equal(await page.evaluate(()=>Progress.read().runs),16,'Renacer conserva la evolución alcanzada en esta partida');
  await localStart(page,n);
  await page.evaluate(()=>{t=301;endRun('Run terminada')});
  assert.equal(await page.evaluate(()=>Progress.read().runs),16,'La evolución anterior no vale para una partida nueva');
}));

for(const [secs,guestSecs]of [[299.99,300.1],[300,299.8],[301,300.8]])test(`#24 online: cierre a ${secs}s con reloj del invitado en ${guestSecs}s`,()=>withPages(2,async(host,guest)=>{
  await Promise.all([host,guest].map(page=>page.evaluate(()=>{const s=Progress.blank();s.runs=14;window.loadProg(s)})));
  await onlineStart(host,guest);
  await host.evaluate(()=>P.forEach(q=>q.stage=1));
  await guest.evaluate(secs=>{t=secs},guestSecs);
  await host.evaluate(secs=>{t=secs;endRun('Run terminada')},secs);
  await guest.waitForFunction(()=>!running);
  for(const page of [host,guest])assert.deepEqual(await page.evaluate(()=>({runs:Progress.read().runs,state:Progress.state('014_herissmon')})),{runs:secs>=300?15:14,state:secs>=300?'egg':'lock'});
}));

for(const stages of [[1,0],[0,1],[0,0]])test(`#24 online: cada cuenta usa su evolución (${stages.join(', ')})`,()=>withPages(2,async(host,guest)=>{
  await onlineStart(host,guest);
  // Estado final todavía no sincronizado: la etapa de un compañero nunca acredita una evolución propia.
  await host.evaluate(stages=>{P.forEach((q,i)=>q.stage=stages[i]);t=300;endRun('Run terminada')},stages);
  await guest.waitForFunction(()=>!running);
  for(const [i,page]of [host,guest].entries())assert.equal(await page.evaluate(()=>Progress.read().runs),stages[i]>=1?1:0);
}));

test('#24 online de 4: progreso independiente y Renacer antes del último sync',()=>withPages(4,async(host,...guests)=>{
  await onlineStart(host,...guests);
  await host.evaluate(()=>{
    t=300;P[1].stage=1;P[2].stage=2;P[2].vp.rc=1;if(!rebirth(P[2]))throw Error('Falló Renacer');
    P[3].stage=0;endRun('Run terminada');
  });
  await Promise.all(guests.map(page=>page.waitForFunction(()=>!running)));
  for(const [i,page]of [host,...guests].entries())assert.equal(await page.evaluate(()=>Progress.read().runs),[0,1,1,0][i]);
}));
