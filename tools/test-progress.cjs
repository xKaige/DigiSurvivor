// Regresión del issue #25. Requiere Node.js y Playwright en el entorno de pruebas.
// Ejecutar: node --test tools/test-progress.cjs
// PLAYWRIGHT_CHANNEL=msedge permite usar Edge instalado; por defecto usa Chromium de Playwright.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const commandramon = '016_commandramon', veemon = '005_veemon';
let server, browser, origin;

before(async () => {
  server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
    try {
      const data = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
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

async function withGame(run, missingImage = false) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Cada prueba usa un perfil vacío y solo archivos locales: no se conecta a Firebase ni a cuentas reales.
  await page.route('https://**/*', route => route.abort());
  if (missingImage) await page.route('**/016_commandramon/fufumon_1.png', route => route.abort());
  try {
    await page.goto(origin);
    await page.waitForFunction(() => typeof Progress !== 'undefined' && Progress.data && CREATURES.every(c => CreatureLoader.cache[c.id]));
    await run(page);
    assert.deepEqual(errors, [], 'No debe haber excepciones en la página');
  } finally { await context.close(); }
}

async function eggs(page, ids) {
  await page.evaluate(ids => {
    const s = Progress.blank();
    for (const u of Progress.data.unlocks) s.unl[u.cid] = 1;
    for (const cid of ids) { delete s.unl[cid]; s.eggs[cid] = { left: 1 }; }
    s.bosses.piemon = 15;
    window.loadProg(s);
    window.setPick('014_herissmon');
  }, ids);
  await page.locator('#anb').click();
  await page.clock.install();
}

async function hatch(page, cid) {
  await page.locator(`.an-row.ready[data-cid="${cid}"] .an-hatch`).click();
  await page.clock.runFor(2200);
  assert.equal(await page.locator('#hatch .hok').isVisible(), true);
  assert.equal(await page.evaluate(cid => Progress.has(cid), cid), true);
}

test('15 jefes guardados entregan el huevo aunque las primeras misiones estén pendientes', () => withGame(async page => {
  await page.evaluate(() => {
    const s = Progress.blank(); s.bosses.piemon = 15;
    localStorage.setItem(Progress.KEY, JSON.stringify(s));
  });
  await page.reload();
  await page.waitForFunction(() => typeof Progress !== 'undefined' && Progress.data && CreatureLoader.cache['016_commandramon']);
  await page.locator('#anb').click();
  assert.equal(await page.locator(`[data-cid="${commandramon}"] .an-hatch`).count(), 1);
  assert.equal(await page.evaluate(() => Progress.state('005_veemon')), 'lock');
  assert.equal(await page.evaluate(() => Object.keys(Progress.read().eggs).length), 5);
  assert.doesNotMatch(await page.locator('#an-list').innerText(), /Misión bloqueada|primero cumplí|máximo .* por partida/);
  if (process.env.TEST_OUTPUT_DIR) {
    await fs.mkdir(process.env.TEST_OUTPUT_DIR, { recursive: true });
    await page.locator(`[data-cid="${commandramon}"]`).screenshot({ path: path.join(process.env.TEST_OUTPUT_DIR, 'mision-completa-entrega-huevo.png'), animations: 'disabled' });
  }
  await page.clock.install();
  await hatch(page, commandramon);
  await page.locator('#hatch .hno').click();
  assert.equal(await page.evaluate(() => Progress.claimDone(true)), 0);
  assert.equal(await page.evaluate(() => Progress.state('016_commandramon')), 'open');
}));

test('el progreso de la cuenta recupera todos los objetivos completos sin duplicar entregas', () => withGame(async page => {
  const result = await page.evaluate(() => {
    const s = Progress.blank(); s.bosses.piemon = 20; s.runs = 15;
    window.testSaves = [];
    window.onProgSave = st => window.testSaves.push(JSON.parse(JSON.stringify(st)));
    window.loadProg(s);
    const first = window.testSaves[0], writes = window.testSaves.length, again = Progress.claimDone(true);
    return { total: Object.keys(Progress.read().eggs).length, saved: first && Object.keys(first.eggs).length, again, extraWrites: window.testSaves.length - writes, firstMission: Progress.state('005_veemon') };
  });
  assert.deepEqual(result, { total: 7, saved: 7, again: 0, extraWrites: 0, firstMission: 'lock' });
}));

test('los récords históricos cuentan sin activación previa y se conservan los objetivos ya completados', () => withGame(async page => {
  const result = await page.evaluate(() => {
    const s = Progress.blank();
    s.bestStage = 5; s.bestSecs = 900; s.cidStage['002_renamon'] = 5;
    s.pv['012_jellymon'] = 4;
    window.loadProg(s);
    return ['005_veemon', '006_gammamon', '009_ryudamon', '020_biyomon', '026_lalamon', '015_kudamon', '012_jellymon', '017_agumon'].map(cid => Progress.state(cid));
  });
  assert.deepEqual(result, ['egg', 'egg', 'egg', 'egg', 'egg', 'egg', 'egg', 'lock']);
}));

test('los objetivos incompletos no dan huevo y los récords no se suman entre partidas', () => withGame(async page => {
  const result = await page.evaluate(() => {
    const s = Progress.blank(); s.bosses.piemon = 14; window.loadProg(s);
    const r = { kills: 0, secs: 300, pl: [{ cid: '001_guilmon', stage: 2 }], bosses: [] };
    Progress.onRunEnd(r); Progress.onRunEnd(r);
    return { boss: Progress.state('016_commandramon'), time: Progress.state('006_gammamon'), stage: Progress.state('005_veemon'), bestSecs: Progress.read().bestSecs };
  });
  assert.deepEqual(result, { boss: 'lock', time: 'lock', stage: 'lock', bestSecs: 300 });
}));

test('eclosionar un huevo entrega también el objetivo del Analyzer que acaba de completarse', () => withGame(async page => {
  await page.evaluate(() => {
    const s = Progress.blank(); s.eggs['016_commandramon'] = { left: 1 };
    for (let i = 0; i < 39; i++) s.seen['test:' + i] = 1;
    window.loadProg(s);
  });
  assert.equal(await page.evaluate(() => Progress.state('011_zubamon')), 'lock');
  await page.locator('#anb').click();
  await page.clock.install();
  await hatch(page, commandramon);
  await page.locator('#hatch .hno').click();
  assert.equal(await page.evaluate(() => Progress.seenCount()), 40);
  assert.equal(await page.locator('[data-cid="011_zubamon"] .an-hatch').count(), 1);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(Progress.KEY)).eggs['011_zubamon'].left), 1);
}));

test('un pendiente desconocido no bloquea los huevos nuevos', () => withGame(async page => {
  await eggs(page, [commandramon]);
  await page.evaluate(() => {
    const s = Progress.read(); s.hatchQ = ['retired_digimon']; s.unl.retired_digimon = 1;
    window.loadProg(s);
  });
  await hatch(page, commandramon);
  await page.locator('#hatch .hno').click();
  assert.deepEqual(await page.evaluate(() => Progress.read().hatchQ), []);
}));

test('una criatura que no cargó queda pendiente sin frenar otra eclosión', () => withGame(async page => {
  await eggs(page, [commandramon]);
  await page.evaluate(() => {
    window.testCreature = CreatureLoader.cache['005_veemon'];
    delete CreatureLoader.cache['005_veemon'];
    const s = Progress.read(); s.hatchQ = ['005_veemon']; window.loadProg(s);
  });
  await hatch(page, commandramon);
  assert.match(await page.locator('#hatch .hok').innerText(), /Commandramon/i);
  await page.locator('#hatch .hno').click();
  assert.deepEqual(await page.evaluate(() => Progress.read().hatchQ), [veemon]);
  await page.evaluate(() => { CreatureLoader.cache['005_veemon'] = window.testCreature; Progress.showHatch(); });
  await page.clock.runFor(2200);
  assert.match(await page.locator('#hatch .hok').innerText(), /V-MON/i);
  await page.locator('#hatch .hno').click();
  assert.deepEqual(await page.evaluate(() => Progress.read().hatchQ), []);
}));

test('una imagen ausente permite elegir al compañero, guardar y abrir otro huevo', () => withGame(async page => {
  await eggs(page, [commandramon, veemon]);
  await hatch(page, commandramon);
  assert.match(await page.locator('#hatch .hmsg').innerText(), /La imagen no pudo cargarse/);
  if (process.env.TEST_OUTPUT_DIR) {
    await fs.mkdir(process.env.TEST_OUTPUT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(process.env.TEST_OUTPUT_DIR, 'eclosion-sin-imagen.png'), animations: 'disabled' });
  }
  await page.locator('#hatch .hok').click();
  assert.equal(await page.evaluate(() => selected), commandramon);
  await hatch(page, veemon);
  await page.locator('#hatch .hno').click();
  await page.reload();
  await page.waitForFunction(() => typeof Progress !== 'undefined' && Progress.data);
  assert.deepEqual(await page.evaluate(() => ({ first: Progress.has('016_commandramon'), second: Progress.has('005_veemon'), queue: Progress.read().hatchQ, eggs: Object.keys(Progress.read().eggs) })), { first: true, second: true, queue: [], eggs: [] });
}, true));

test('Seguir cancela la animación anterior antes de abrir el próximo huevo', () => withGame(async page => {
  await eggs(page, [commandramon, veemon]);
  await page.locator(`.an-row.ready[data-cid="${commandramon}"] .an-hatch`).click();
  await page.locator('#hatch .hno').click();
  await hatch(page, veemon);
  assert.match(await page.locator('#hatch .hok').innerText(), /V-MON/i);
  await page.locator('#hatch .hno').click();
  assert.equal(await page.evaluate(() => Progress.hatching), false);
  assert.deepEqual(await page.evaluate(() => Progress.read().hatchQ), []);
}));

test('cambiar de cuenta durante una animación no mezcla progreso ni bloquea nuevos huevos', () => withGame(async page => {
  await eggs(page, [commandramon]);
  await page.locator(`.an-row.ready[data-cid="${commandramon}"] .an-hatch`).click();
  await page.evaluate(() => {
    const s = Progress.blank(); s.eggs['005_veemon'] = { left: 1 }; window.loadProg(s);
  });
  assert.equal(await page.locator('#hatch').isVisible(), false);
  await hatch(page, veemon);
  await page.locator('#hatch .hno').click();
  assert.deepEqual(await page.evaluate(() => ({ previous: Progress.has('016_commandramon'), current: Progress.has('005_veemon'), queue: Progress.read().hatchQ, hatching: Progress.hatching })), { previous: false, current: true, queue: [], hatching: false });
}));

test('el guardado normaliza colas malformadas y duplicadas sin perder desbloqueos', () => withGame(async page => {
  for (const queue of [null, {}, '016_commandramon', [commandramon, commandramon, null, 'retired_digimon', veemon]]) {
    const result = await page.evaluate(queue => {
      const s = Progress.blank(); s.unl['016_commandramon'] = 1; s.hatchQ = queue;
      window.loadProg(s);
      return { unlocked: Progress.has('016_commandramon'), queue: Progress.read().hatchQ };
    }, queue);
    assert.deepEqual(result, { unlocked: true, queue: Array.isArray(queue) ? [commandramon] : [] });
  }
  await page.evaluate(() => Progress.reset());
  await page.clock.install();
  await page.clock.runFor(2500);
  assert.equal(await page.locator('#hatch').isVisible(), false);
  assert.equal(await page.evaluate(() => Progress.has('016_commandramon')), false);
}));

test('los 34 objetivos completos entregan sus Digitamas y se pueden eclosionar en secuencia', () => withGame(async page => {
  const ids = await page.evaluate(() => {
    const s = Progress.blank(); s.kills = 25000; s.runs = 100; s.bestStage = 5; s.bestSecs = 900; s.bosses.piemon = 40;
    for (const c of CREATURES) { s.cidStage[c.id] = 5; s.cidKills[c.id] = 3000; }
    for (let i = 0; i < 140; i++) s.seen['test:' + i] = 1;
    window.loadProg(s);
    return Progress.data.unlocks.map(u => u.cid);
  });
  assert.equal(await page.evaluate(() => Object.keys(Progress.read().eggs).length), 34);
  await page.locator('#anb').click();
  await page.clock.install();
  for (const cid of ids) {
    await hatch(page, cid);
    if (cid === commandramon && process.env.TEST_OUTPUT_DIR) {
      await fs.mkdir(process.env.TEST_OUTPUT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.TEST_OUTPUT_DIR, 'commandramon-eclosionado.png'), animations: 'disabled' });
    }
    await page.locator('#hatch .hno').click();
  }
  assert.deepEqual(await page.evaluate(() => ({ total: Object.keys(Progress.read().unl).length, eggs: Object.keys(Progress.read().eggs).length, queue: Progress.read().hatchQ })), { total: 34, eggs: 0, queue: [] });
}));

for (const players of [1, 2]) test(`varias misiones completadas en una partida de ${players} jugador(es) entregan todos sus huevos`, () => withGame(async page => {
  await page.evaluate(async players => {
    const s = Progress.blank();
    window.loadProg(s);
    await start(players, ['001_guilmon', '003_terriermon']);
    Bosses.down.push(...Array(15).fill('piemon'));
    endRun('Prueba de eclosión');
  }, players);
  assert.equal(await page.evaluate(() => Progress.state('016_commandramon')), 'egg');
  assert.equal(await page.evaluate(() => Object.keys(Progress.read().eggs).length), 5);
  await page.locator('#anb').click();
  await page.clock.install();
  await hatch(page, commandramon);
  await page.locator('#hatch .hok').click();
  assert.equal(await page.evaluate(() => selected), commandramon);
}));
