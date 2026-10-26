// Regresiones de los issues #26–28. Ejecutar con Node y Playwright: node --test tools/test-gameplay.cjs
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
      res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream' });
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
  assert.deepEqual(result.babiesII, ['caprimon','pagumon','yaamon']);
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
    if(i){conn=connection(i);setupConn(conn)}else{gs=Array.from({length:n-1},(_,j)=>({c:connection(j+1),i:j+1,uid:'qa'+(j+1),nick:'Invitado '+(j+1),cid:'001_guilmon'}));gs.forEach(g=>setupConn(g.c))}
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
