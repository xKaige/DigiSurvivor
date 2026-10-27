// Issue #29: ranking, habilidades y guardado. node --test tools/test-ranking.cjs
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
let browser, server, origin;
before(async () => {
  server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    try {
      const data = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': ({ '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp' })[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless:true, channel:process.env.PLAYWRIGHT_CHANNEL || undefined });
});
after(async () => { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); });
async function withGame(run, mobile = false) {
  const context = await browser.newContext({ viewport:mobile ? { width:390, height:844 } : { width:1440, height:950 } });
  await context.route('https://**/*', route => route.abort());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(origin);
    await page.waitForFunction(() => typeof Ranking !== 'undefined' && SkillSys.cat && Progress.data && Bosses.data && Enemies.data && CREATURES.every(c => CreatureLoader.cache[c.id]));
    await page.evaluate(() => { requestAnimationFrame = () => 0; bgStart = () => {}; });
    await run(page); assert.deepEqual(errors, []);
  } finally { await context.close(); }
}
async function screenshot(page, name) {
  if (!process.env.TEST_OUTPUT_DIR) return;
  await fs.mkdir(process.env.TEST_OUTPUT_DIR, { recursive:true });
  await page.screenshot({ path:path.join(process.env.TEST_OUTPUT_DIR, name + '.png') });
}
async function fixture(page) {
  await page.evaluate(() => {
    const sk = (id, level) => ({ id, name:SkillSys.def(id).name, level });
    const solo = [
      { nick:'Kaige', score:12480, form:'Dukemon', cid:'001_guilmon', kills:9180, bosses:10, lvl:46, secs:900, players:1, skills:[sk('royal_saber',10),sk('final_elysion',8),sk('atomic_blaster',5),sk('rock_breaker',5)], me:true },
      { nick:'RenaPlayer', score:11320, form:'Sakuyamon', cid:'002_renamon', kills:8320, bosses:8, lvl:43, secs:900, players:1, skills:[['Fireball',5],['Royal Slash',10],['Bubble Blow',3]] },
      { nick:'DigiTamer', score:9700, form:'Siriusmon', cid:'006_gammamon', kills:6700, bosses:8, lvl:41, secs:900, players:1, skills:[sk('photon_blaster',9),sk('cosmo_blade',7),sk('breaquasar',6)] },
      { nick:'ViejaGuardia', score:7450, form:'WarGrowlmon', kills:4990, bosses:6, lvl:35, secs:780, players:1, skills:[] }
    ];
    window.rankCloud = { top:async tab => tab === 'solo' ? solo : [{ ...solo[2],nick:'EquipoDigital',players:4,score:25400 }] };
    Ranking.open();
  });
  await page.locator('.rk-entry').first().waitFor();
  await page.locator('.rk-sk img').evaluateAll(imgs => Promise.all(imgs.map(img => img.decode())));
}

for (const mobile of [false,true]) test(`#29: Tamer, puntaje, estadísticas y previews visibles en ${mobile ? 'celular' : 'escritorio'}`, () => withGame(async page => {
  await fixture(page);
  const first = page.locator('.rk-entry').first();
  assert.equal(await first.locator('.rk-tamer>b').textContent(), 'Kaige');
  assert.equal(await first.locator('.rk-score strong').textContent(), '12.480');
  assert.ok((await first.locator('.rk-dig').textContent()).includes('Dukemon'));
  assert.deepEqual(await first.locator('dt').allTextContents(), ['Eliminados','Jefes','Nivel','Tiempo']);
  assert.deepEqual(await first.locator('dd').allTextContents(), ['9.180','10','46','15:00']);
  assert.equal(await first.locator('.rk-sk li').count(), 4);
  assert.equal(await first.locator('.rk-sk b').first().isVisible(), true);
  assert.equal(await first.locator('.rk-sk small').first().textContent(), 'Nv 10');
  assert.equal(await page.locator('.rk-entry').nth(1).locator('.rk-sk img').count(), 3, 'Se recuperan íconos de nombres antiguos');
  assert.equal(await page.locator('#rk-list').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, 'Sin desborde horizontal');
  await screenshot(page, mobile ? 'ranking-celular' : 'ranking-escritorio');
  await first.locator('.rk-sk li').first().focus();
  assert.equal(await first.locator('.rk-tip').first().isVisible(), true);
  assert.ok((await first.locator('.rk-tip').first().textContent()).length > 20);
  await page.locator('[data-t="party"]').click();
  await page.waitForFunction(() => document.querySelector('.rk-tamer>b')?.textContent === 'EquipoDigital');
  assert.ok((await page.locator('.rk-tamer').innerText()).includes('4 jugadores'));
  assert.equal(await page.locator('.rk-score strong').textContent(), '25.400');
  assert.equal(await page.locator('.rk-sk img').count(), 3);
}, mobile));

test('#29: datos incompletos, habilidades retiradas y texto no confiable', () => withGame(async page => {
  await page.evaluate(() => {
    window.rankCloud = { top:async () => [{ nick:'<img src=x onerror="window.injected=1">', cid:'__proto__', score:4294967300, secs:-1, skills:[null, { name:'Técnica retirada',level:4 }, ['<script>malicioso</script>',2]] }] };
    Ranking.open();
  });
  await page.locator('.rk-entry').waitFor();
  assert.equal(await page.locator('.rk-score strong').textContent(), '4.294.967.300');
  assert.equal(await page.locator('.rk-tamer img').count(), 0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  assert.ok((await page.locator('.rk-tamer>b').textContent()).startsWith('<img'));
  assert.deepEqual(await page.locator('.rk-stats dd').allTextContents(), ['—','—','—','—']);
  assert.equal(await page.locator('.rk-sk b').first().textContent(), 'Técnica retirada');
  assert.equal(await page.locator('.rk-sk img').first().getAttribute('src'), 'assets/sprites/skills/el_neutral.webp');
}));

test('#29: sesión, tabla vacía, error y reintento', () => withGame(async page => {
  await page.evaluate(() => { window.rankCloud=null;Ranking.open(); });
  assert.ok((await page.locator('#rk-list').innerText()).includes('Iniciá sesión'));
  await page.evaluate(async () => { window.rankCloud={top:async()=>[]};await Ranking.render(); });
  assert.ok((await page.locator('#rk-list').innerText()).includes('Todavía no hay partidas'));
  await page.evaluate(async () => { let tries=0;window.rankCloud={top:async()=>{if(!tries++)throw Error('Prueba');return [{nick:'Recuperado',score:100}]}};await Ranking.render(); });
  assert.doesNotMatch(await page.locator('#rk-list').innerText(), /Firestore|reglas/);
  await page.locator('.rk-retry').click();
  await page.waitForFunction(() => document.querySelector('.rk-tamer>b')?.textContent === 'Recuperado');
}));

test('#29: respuestas atrasadas y cambio de cuenta no muestran datos de la selección anterior', () => withGame(async page => {
  await page.evaluate(() => {
    window.waiters={};window.rankCloud={top:tab=>new Promise((resolve,reject)=>waiters[tab]={resolve,reject})};Ranking.open();
  });
  await page.locator('[data-t="party"]').click();
  await page.evaluate(() => waiters.party.resolve([{nick:'PartyActual',score:500}]));
  await page.waitForFunction(() => document.querySelector('.rk-tamer>b')?.textContent === 'PartyActual');
  await page.evaluate(() => waiters.solo.reject(Error('Respuesta vieja')));
  assert.equal(await page.locator('.rk-tamer>b').textContent(),'PartyActual');
  await page.evaluate(async () => { window.rankCloud={top:async()=>[{nick:'OtraCuenta',score:200,me:true}]};await Ranking.render(); });
  assert.equal(await page.locator('.rk-tamer>b').textContent(),'OtraCuenta');
  assert.equal(await page.locator('.rk-you').textContent(),'Vos');
}));

// Adaptador en memoria: ejercita social.js sin conectar cuentas ni escribir datos reales.
async function memoryCloud(page) {
  await page.evaluate(async () => {
    window.records = new Map([['profiles/qa_tamer',{nick:'TamerPrueba'}]]);
    const snap = key => ({ id:key.split('/').at(-1), exists:()=>records.has(key), data:()=>records.get(key) });
    const fb = {
      doc:(_, ...p)=>p.join('/'), collection:(_, ...p)=>p.join('/'), query:key=>key, orderBy:()=>null,limit:()=>null,
      getDoc:async key=>snap(key),
      getDocs:async key=>({docs:[...records.keys()].filter(k=>k.startsWith(key+'/')).sort((a,b)=>(records.get(b).score||0)-(records.get(a).score||0)).map(snap)}),
      setDoc:async (key,value)=>{records.set(key,JSON.parse(JSON.stringify(value)))}
    };
    window.initPeer=()=>{};
    window.testSocial=await import('/src/scripts/social.js');
    await testSocial.initSocial({user:{uid:'qa_tamer'},db:{},fb});
  });
}

for (const [n,online] of [[1,false],[2,false],[2,true]]) test(`#29: guarda y recupera la partida propia (${n}J, online=${online})`, () => withGame(async page => {
  await memoryCloud(page);
  await page.evaluate(async ({n,online}) => {
    await start(n,Array(n).fill('001_guilmon'));P[0].wp={fireball:5};
    if(n>1)P[1].wp={bubble_blow:3,photon_blaster:10};
    if(online){isOnline=true;isHost=false;myIdx=1}
    t=600;kills=1200;lvl=32;endRun('Prueba de ranking');
  },{n,online});
  const table=n>1?'party':'solo';
  await page.waitForFunction(table=>records.has('ranking_'+table+'/qa_tamer'),table);
  const record=await page.evaluate(table=>records.get('ranking_'+table+'/qa_tamer'),table);
  assert.equal(record.nick,'TamerPrueba');assert.equal(record.score,2400);assert.equal(record.players,n);
  assert.deepEqual(record.skills.map(s=>s.id),online?['bubble_blow','photon_blaster']:['fireball']);
  assert.ok(record.skills.every(s=>!Array.isArray(s)&&typeof s.name==='string'&&Number.isInteger(s.level)));
  await page.evaluate(async table=>{Ranking.tab=table;Ranking.open();},table);
  await page.locator('.rk-entry').waitFor();
  assert.equal(await page.locator('.rk-tamer>b').textContent(),'TamerPrueba');
  assert.equal(await page.locator('.rk-you').textContent(),'Vos');
  const worse=await page.evaluate(async ({table,record})=>rankCloud.submit(table,{...record,score:record.score-1}),{table,record});
  assert.equal(worse,false);
  if(online&&process.env.TEST_OUTPUT_DIR){await fs.mkdir(process.env.TEST_OUTPUT_DIR,{recursive:true});await fs.writeFile(path.join(process.env.TEST_OUTPUT_DIR,'ranking-payload.json'),JSON.stringify(record,null,2));}
}));

test('#29: el ranking destaca solo la cuenta actual y conserva récords grandes',()=>withGame(async page=>{
  await memoryCloud(page);
  const result=await page.evaluate(async()=>{
    records.set('ranking_solo/qa_tamer',{nick:'Propio',score:4294967300});
    records.set('ranking_solo/otro',{nick:'Otro',score:200,me:true});
    return {saved:await rankCloud.submit('solo',{score:100}),rows:await rankCloud.top('solo')};
  });
  assert.equal(result.saved,false);assert.deepEqual(result.rows.map(r=>r.me),[true,false]);
}));
