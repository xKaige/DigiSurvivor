// Mapa del Digimundo con relieve: fondo pintado + paredes (barrancos, mesetas) contra las que se choca.
// Se carga ANTES que game.js y usa sus globals en tiempo de ejecución (cx, cam, W, H, P, t).
//
// - Datos en src/data/maps/<id>.json (paredes = rectángulos "block" sacados del room original de Digital Tamers,
//   "trunk" = base de los árboles) e imagen en assets/maps/<id>.webp.
// - El mundo es infinito: el mapa se repite EN ESPEJO (una copia sí, una copia invertida), así los bordes siempre
//   empalman. Se dibuja a escala `scale` (2 = cada píxel del mapa ocupa 2 en pantalla). Las paredes se espejan igual.
// - Colisión por grilla (celdas de CELL px del mapa). Se choca con los PIES: el punto (x, y + pie) con un radio chico.
// - Para que los enemigos rodeen las paredes hay un "mapa de distancias" (BFS) alrededor del jugador más cercano,
//   que se recalcula cada FLOW_EVERY segundos; cada enemigo va hacia la celda vecina más cercana al jugador.
const World = {
  CELL: 8,                 // tamaño de celda de colisión, en píxeles del mapa
  FLOW_R: 120,             // radio (en celdas del mundo, 16 px) del mapa de distancias alrededor del jugador (~1900 px)
  FLOW_EVERY: 0.25,
  data: null, img: null, grid: null, gw: 0, gh: 0, size: 0, cs: 0,
  flow: null, flowT: 0, fx0: 0, fy0: 0, fn: 0,

  async load(id = 'boot_jungle') {   // mapa fijo desde JSON (hoy las partidas usan gen())
    if (this.data && this.data.id === id) return;
    const r = await fetch('src/data/maps/' + id + '.json');
    if (!r.ok) throw new Error('No se encontró src/data/maps/' + id + '.json (' + r.status + ')');
    const d = await r.json();
    await new Promise(res => { const i = new Image(); i.onload = () => { this.img = i; res(); }; i.onerror = () => { console.error('No se pudo cargar el mapa', d.image); res(); }; i.src = 'assets/maps/' + d.image; });
    this.flow = null; this.setData(d);   // grilla de paredes (1 = no se puede pasar)
  },
  // ---------- Mapa procedural (bosque) ----------
  // Cada partida arma un bosque nuevo a partir de una semilla (en online la manda el host, así los dos ven el mismo).
  // Tiles: assets/maps/woods_tiles.png. Fila de arriba = 4 manchas en cruz (pasto, pasto oscuro, meseta, estanque) en
  // ventanas de 96×96 (celdas -1..4 de una cruz de 4×4 celdas de 16 px); abajo, el tileset original con los adornos.
  // De cada cruz se sacan cuartos de 8×8 según los vecinos (esquina, borde, esquina interior, relleno): autotile.
  N: 64,                   // celdas de 16 px por lado (mapa de 1024×1024, a escala 3)
  nextSeed: null,          // semilla para la próxima partida (online: la pone el mensaje 'start')
  BLOBS: ['grass', 'dark', 'cliff', 'pond'],
  CROSS: [0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0],
  // adornos: [x, y, w, h] en el tileset original (+96 en el atlas) y choque [dx, dy, w, h] en la base
  DEC: {
    treeBig: [275, 10, 59, 70, [20, 58, 20, 9]], tree: [275, 92, 28, 36, [9, 28, 10, 6]], pine: [308, 97, 25, 31, [8, 24, 9, 6]],
    rock: [224, 36, 16, 12, [1, 3, 14, 8]], stump: [231, 80, 19, 16, [3, 5, 13, 8]],
    bush: [225, 52, 14, 12], pebble: [241, 57, 7, 7], mushR: [228, 70, 10, 9], mushB: [243, 74, 10, 6], flowerP: [258, 54, 11, 10],
    leaf: [244, 41, 8, 5], branch: [260, 39, 9, 9], flowersY: [81, 84, 14, 10], flowersR: [97, 84, 14, 10],
    tuft: [99, 54, 11, 8], tuft2: [117, 68, 8, 7], tuft3: [103, 70, 6, 8], tuft4: [112, 80, 7, 8], dtuft: [121, 88, 15, 8], dtuft2: [136, 80, 8, 7],
    wRock: [240, 98, 16, 13], lily: [226, 132, 13, 12], lily2: [240, 132, 16, 12], reed: [258, 132, 13, 12], ripple: [227, 119, 12, 3]
  },
  TALL: { treeBig: 1, tree: 1, pine: 1 },   // adornos altos: no van en el piso, se dibujan encima de los personajes (drawTall)
  tiles: null, tilesV: null, quarters: null, tall: [],
  async loadTiles() {
    if (this.tiles) return;
    await new Promise((res, rej) => { const i = new Image(); i.onload = () => { this.tiles = i; res(); }; i.onerror = () => rej(new Error('No se pudo cargar woods_tiles.png')); i.src = 'assets/maps/woods_tiles.png'; });
    // copia con el mismo velo oscuro que el piso, para los árboles que se dibujan encima (drawTall)
    const v = this.tilesV = document.createElement('canvas'); v.width = this.tiles.width; v.height = this.tiles.height;
    const vg = v.getContext('2d'); vg.drawImage(this.tiles, 0, 0); vg.globalCompositeOperation = 'source-atop'; vg.fillStyle = 'rgba(5,11,26,.22)'; vg.fillRect(0, 0, v.width, v.height);
    // tabla de cuartos: para cada mancha, clave (esquina, propio, vecinos) -> origen [x, y] en el atlas
    const m = (c, r) => c >= 0 && r >= 0 && c < 4 && r < 4 ? this.CROSS[r * 4 + c] : 0;
    this.quarters = this.BLOBS.map((_, b) => {
      const Q = {};
      for (let r = -1; r <= 4; r++) for (let c = -1; c <= 4; c++) for (let q = 0; q < 4; q++) {
        const sx = q & 1 ? 1 : -1, sy = q & 2 ? 1 : -1;
        const k = this.qkey(q, m(c, r), m(c + sx, r), m(c, r + sy), m(c + sx, r + sy));
        if (!(k in Q)) Q[k] = [b * 96 + (c + 1) * 16 + (q & 1) * 8, (r + 1) * 16 + (q & 2 ? 8 : 0)];
      }
      return Q;
    });
  },
  // clave de un cuarto: 0 nada/esquina, 1 vecino horizontal, 2 vertical, 3 los dos (esquina interior), 4 todo, 5 solo diagonal
  qkey(q, s, h, v, d) { const k = h && v ? (s && d ? 4 : 3) : h ? 1 : v ? 2 : (!s && d ? 5 : 0); return q + 4 * (s + 2 * k); },
  rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; },
  // ruido suave (value noise de 2 octavas) sobre la grilla de celdas. Es periódico: empalma en los bordes del mapa.
  noise(R, f) {
    const N = this.N, out = new Float32Array(N * N), sm = x => x * x * (3 - 2 * x);
    for (const [fr, amp] of [[f, 0.65], [f * 2.3, 0.35]]) {
      const L = Math.max(2, Math.round(N * fr)), lat = Array.from({ length: L * L }, R), at = (i, j) => lat[(j % L) * L + (i % L)];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const gx = x * L / N, gy = y * L / N, ix = gx | 0, iy = gy | 0, tx = sm(gx - ix), ty = sm(gy - iy);
        const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx, b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx;
        out[y * N + x] += (a + (b - a) * ty) * amp;
      }
    }
    return out;
  },
  // celda con vuelta en los bordes (el bosque se repite tal cual, sin espejo)
  at(A, c, r) { const N = this.N; c = ((c % N) + N) % N; r = ((r % N) + N) % N; return A[r * N + c]; },
  // saca las celdas que no forman parte de ningún bloque de k×k (las puntas finitas quedan feas con el autotile)
  open(A, k = 2) {
    const N = this.N, B = new Uint8Array(N * N);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (A[r * N + c]) {
      let ok = false;
      for (let oy = 1 - k; oy <= 0 && !ok; oy++) for (let ox = 1 - k; ox <= 0 && !ok; ox++) {
        let all = true; for (let y = 0; y < k && all; y++) for (let x = 0; x < k && all; x++) all = !!this.at(A, c + ox + x, r + oy + y);
        ok = all;
      }
      B[r * N + c] = ok ? 1 : 0;
    }
    return B;
  },
  // suavizado tipo autómata celular
  smooth(A, n = 2) {
    const N = this.N;
    for (let k = 0; k < n; k++) {
      const B = new Uint8Array(N * N);
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) s += this.at(A, c + dx, r + dy);
        B[r * N + c] = s >= 5 ? 1 : s <= 3 ? 0 : A[r * N + c];
      }
      A = B;
    }
    return A;
  },
  // ¿hay alguna celda marcada en A a distancia d (cuadrada) de (c, r)?
  near(A, c, r, d) { for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) if (this.at(A, c + dx, r + dy)) return true; return false; },
  async gen(seed) {
    await this.loadTiles();
    const N = this.N, R = this.rng(seed), cen = N >> 1, T = 16, wr = v => ((Math.floor(v) % N) + N) % N;
    const nearStart = (c, r, rad) => Math.hypot(c - cen, r - cen) < rad;
    const mk = f => { const A = new Uint8Array(N * N); for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) A[r * N + c] = f(c, r, r * N + c) ? 1 : 0; return A; };
    const nl = this.noise(R, 0.09), nm = this.noise(R, 0.1), nd = this.noise(R, 0.14), nt = this.noise(R, 0.12);
    // ---- caminos de tierra: una red sin puntas muertas ----
    // nodos (uno por cuadrante) unidos en un circuito, el centro unido al circuito, y un camino que da la vuelta al mapa
    // en horizontal y otro en vertical (como el mapa se repite, empalman con la copia de al lado: la red sigue en todo el mundo)
    let path = new Uint8Array(N * N);
    const road = (x0, y0, x1, y1) => {
      const len = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(len * 2), nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
      const amp = 2 + R() * 3, fq = 1 + R() * 2, ph = R() * 6.283;
      for (let s = 0; s <= n; s++) {
        const u = s / n, o = Math.sin(u * Math.PI * fq + ph) * Math.sin(u * Math.PI) * amp;
        const x = x0 + (x1 - x0) * u + nx * o, y = y0 + (y1 - y0) * u + ny * o;
        for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) path[wr(y + dy) * N + wr(x + dx)] = 1;   // 2 celdas de ancho
      }
    };
    const nodes = [];
    for (const [qx, qy] of [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]]) nodes.push([N * qx + (R() - 0.5) * N * 0.2, N * qy + (R() - 0.5) * N * 0.2]);
    const any = () => nodes[(R() * 4) | 0];
    for (let k = 0; k < 4; k++) { const a = nodes[k], b = nodes[(k + 1) % 4]; road(a[0], a[1], b[0], b[1]); }   // circuito
    { const a = any(); road(cen, cen, a[0], a[1]); }               // el centro se une al circuito
    { const a = any(); road(a[0], a[1], a[0] + N, a[1]); }         // vuelta horizontal
    { const a = any(); road(a[0], a[1], a[0], a[1] + N); }         // vuelta vertical
    for (let r = cen - 2; r <= cen + 2; r++) for (let c = cen - 3; c <= cen + 3; c++) path[r * N + c] = 1;   // claro de tierra en el inicio
    path = this.open(path); path = this.open(path.map(v => 1 - v)).map(v => 1 - v);   // sin puntas finitas ni islitas de pasto
    // ---- lagos y mesetas (paredes): lejos del inicio, de los caminos y entre sí ----
    let lake = this.smooth(mk((c, r, i) => nl[i] > 0.62 && !nearStart(c, r, 7) && !this.near(path, c, r, 1)));
    lake = this.open(lake); lake = this.open(lake.map(v => 1 - v), 3).map(v => 1 - v);   // agua sin puntas; la tierra entre agua, de 3 o más
    for (let i = 0; i < N * N; i++) if (path[i]) lake[i] = 0;
    const cliff = this.open(this.smooth(mk((c, r, i) => nm[i] > 0.62 && !nearStart(c, r, 7) && !this.near(lake, c, r, 2) && !this.near(path, c, r, 1))));
    // todo lo que no se pueda alcanzar desde el inicio pasa a ser meseta o lago (así nadie queda encerrado)
    const seen = new Uint8Array(N * N), st = [cen * N + cen]; seen[st[0]] = 1;
    while (st.length) {
      const i = st.pop(), r = (i / N) | 0, c = i - r * N;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = wr(r + dy) * N + wr(c + dx); if (!seen[j] && !lake[j] && !cliff[j]) { seen[j] = 1; st.push(j); }
      }
    }
    for (let i = 0; i < N * N; i++) if (!seen[i] && !lake[i] && !cliff[i]) (this.near(lake, i % N, (i / N) | 0, 1) ? lake : cliff)[i] = 1;
    const wall = mk((c, r, i) => lake[i] || cliff[i]), land = mk((c, r, i) => !lake[i]);
    // pasto oscuro: manchas separadas de caminos, lagos y mesetas (si no, sus bordes se pisan)
    const dark = this.open(this.smooth(mk((c, r, i) => nd[i] > 0.6 && !this.near(path, c, r, 1) && !this.near(wall, c, r, 2))));
    // ---- dibujo ----
    const cv = document.createElement('canvas'); cv.width = cv.height = N * T;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    g.fillStyle = '#59c135'; g.fillRect(0, 0, cv.width, cv.height);   // pasto base (mismo verde que las manchas)
    g.fillStyle = '#c99a5e'; for (let i = 0; i < N * N; i++) if (path[i]) g.fillRect((i % N) * T, ((i / N) | 0) * T, T, T);
    g.fillStyle = '#24a0dc'; for (let i = 0; i < N * N; i++) if (lake[i]) g.fillRect((i % N) * T, ((i / N) | 0) * T, T, T);
    // capa autotile: A = celdas "llenas"; skipFill = no dibujar el relleno (ya está pintado abajo)
    const layer = (b, A, skipFill) => {
      const Q = this.quarters[b];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) for (let q = 0; q < 4; q++) {
        const sx = q & 1 ? 1 : -1, sy = q & 2 ? 1 : -1, s = A[r * N + c];
        const k = this.qkey(q, s, this.at(A, c + sx, r), this.at(A, c, r + sy), this.at(A, c + sx, r + sy));
        if (k === q || (skipFill && k === q + 4 * (1 + 8))) continue;   // vacío sin vecinos / relleno
        const o = Q[k] || Q[q + 4 * (s + 2 * (s ? 4 : 0))]; if (!o) continue;
        g.drawImage(this.tiles, o[0], o[1], 8, 8, c * T + (q & 1) * 8, r * T + (q & 2 ? 8 : 0), 8, 8);
      }
    };
    layer(0, mk((c, r, i) => !path[i]), true);   // pasto sobre la tierra (los caminos son los huecos)
    layer(1, dark, false);
    layer(3, land, true);                        // estanque: lo lleno es tierra firme, los huecos son agua
    layer(2, cliff, false);
    // ---- adornos ----
    const D = this.DEC, S = N * T, blocks = [], trunks = [], items = [];
    const used = new Uint8Array(N * N), mark = (c, r) => { used[wr(r) * N + wr(c)] = 1; };
    const put = (name, c, r) => {
      const d = D[name], x = Math.round(c * T + T / 2 - d[2] / 2 + (R() - 0.5) * 6), y = Math.round(r * T + T - d[3] + (R() - 0.5) * 4);
      items.push([name, x, y]);
      if (d[4]) for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) trunks.push([x + d[4][0] + ox, y + d[4][1] + oy, d[4][2], d[4][3]]);   // setData recorta lo que queda afuera
    };
    const pick = a => a[(R() * a.length) | 0];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const i = r * N + c; if (used[i]) continue;
      if (lake[i]) { if (R() < 0.05 && !this.near(land, c, r, 1)) { put(pick(['lily', 'lily2', 'lily', 'reed', 'ripple', 'wRock']), c, r); used[i] = 1; } continue; }
      if (wall[i] || nearStart(c, r, 5)) continue;
      const forest = nt[i], v = R();
      if (!path[i] && forest > 0.58 && v < 0.16 && !this.near(wall, c, r, 1) && !this.at(used, c, r - 1) && !this.at(used, c - 1, r)) {
        const big = forest > 0.66 && v < 0.07 && !this.near(wall, c, r, 2);
        put(big ? 'treeBig' : pick(['tree', 'pine', 'tree']), c, r);
        for (let dy = -3; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) mark(c + dx, r + dy);
      } else if (!path[i] && v < 0.012 && !this.near(wall, c, r, 1)) { put(pick(['rock', 'stump']), c, r); used[i] = 1; }
      else if (v < (path[i] ? 0.03 : 0.11)) { put(pick(dark[i] ? ['dtuft', 'dtuft2', 'bush'] : path[i] ? ['pebble', 'leaf', 'branch', 'tuft3'] : ['tuft', 'tuft2', 'tuft4', 'flowersY', 'flowersR', 'flowerP', 'mushR', 'mushB', 'bush', 'leaf', 'pebble']), c, r); used[i] = 1; }
    }
    items.sort((a, b) => (a[2] + D[a[0]][3]) - (b[2] + D[b[0]][3]));
    this.tall = [];
    for (const [name, x, y] of items) {   // lo que se pasa del borde se dibuja también del otro lado (el mapa se repite)
      const d = D[name];
      if (this.TALL[name]) { this.tall.push([d, x, y, y + d[3] - 4]); continue; }   // [adorno, x, y, base (pies del tronco)]
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        const X = x + ox, Y = y + oy; if (X + d[2] <= 0 || Y + d[3] <= 0 || X >= S || Y >= S) continue;
        g.drawImage(this.tiles, d[0], d[1] + 96, d[2], d[3], X, Y, d[2], d[3]);
      }
    }
    // ---- datos para el resto de World (paredes en píxeles del mapa, igual que los JSON) ----
    for (let i = 0; i < N * N; i++) if (wall[i]) blocks.push([(i % N) * T, ((i / N) | 0) * T, T, T]);
    const d = { id: 'woods_' + seed, name: 'Bosque', w: S, h: S, scale: 3, wrap: true, start: [cen * T, cen * T + 20], block: blocks, trunk: trunks };
    this.tall.sort((a, b) => a[3] - b[3]);
    this.data = null; this.img = cv; this.flow = null;
    this.setData(d);
  },
  // arma la grilla de paredes a partir de los datos de un mapa
  setData(d) {
    this.data = d; this.size = d.w * d.scale; this.cs = this.CELL * d.scale;
    this.gw = Math.ceil(d.w / this.CELL); this.gh = Math.ceil(d.h / this.CELL);
    const g = this.grid = new Uint8Array(this.gw * this.gh);
    for (const [x, y, w, h] of [...d.block, ...(d.trunk || [])]) {
      const c0 = Math.max(0, Math.floor(x / this.CELL)), c1 = Math.min(this.gw - 1, Math.floor((x + w - 1) / this.CELL));
      const r0 = Math.max(0, Math.floor(y / this.CELL)), r1 = Math.min(this.gh - 1, Math.floor((y + h - 1) / this.CELL));
      for (let ry = r0; ry <= r1; ry++) for (let cx_ = c0; cx_ <= c1; cx_++) g[ry * this.gw + cx_] = 1;
    }
  },
  ready() { return !!(this.data && this.grid); },
  // punto de inicio de la partida (en el mundo): "start" del JSON, en píxeles del mapa; si no hay, el centro
  startPos() { if (!this.data) return [0, 0]; const s = this.data.start || [this.data.w / 2, this.data.h / 2]; return [s[0] * this.data.scale, s[1] * this.data.scale - 40]; },

  // ---------- Coordenadas: mundo -> píxel del mapa (con espejo) ----------
  // (los mapas con wrap, como el bosque procedural, se repiten tal cual; los demás, en espejo)
  local(v, size) { const k = Math.floor(v / size), m = v - k * size; return this.data.wrap || !(k & 1) ? m : size - 1e-6 - m; },
  solid(wx, wy) {
    if (!this.grid) return false;
    const s = this.data.scale, mx = this.local(wx, this.size) / s, my = this.local(wy, this.size) / s;
    return this.grid[Math.floor(my / this.CELL) * this.gw + Math.floor(mx / this.CELL)] === 1;
  },
  // ¿entra un círculo de radio r (pies) en (x, y)?
  free(x, y, r) {
    return !this.solid(x, y) && !this.solid(x - r, y) && !this.solid(x + r, y) && !this.solid(x, y - r * 0.6) && !this.solid(x, y + r * 0.6);
  },
  // pie de cada entidad (los sprites se dibujan "parados" más abajo de su x,y)
  foot(e) { return e.bo != null ? Bosses.h(e) / 2 - 10 : e.et != null || e.k != null ? Math.max(50, e.r * 4.2) / 2 - 6 : 40; },
  footR(e) { return e.bo != null ? Math.min(26, e.r * 0.6) : e.k != null ? Math.min(12, e.r * 0.6) : 11; },
  // mueve con choque y deslizamiento (primero X, después Y). Devuelve true si chocó.
  move(e, dx, dy) {
    if (!this.grid) { e.x += dx; e.y += dy; return false; }
    const f = this.foot(e), r = this.footR(e); let hit = false;
    if (this.free(e.x + dx, e.y + f, r)) e.x += dx; else hit = true;
    if (this.free(e.x, e.y + dy + f, r)) e.y += dy; else hit = true;
    return hit;
  },
  // lugar libre cerca de (x, y) para que aparezca algo (espiral)
  freeSpot(x, y, e) {
    const f = e ? this.foot(e) : 40, r = e ? this.footR(e) : 12;
    if (!this.grid || this.free(x, y + f, r)) return [x, y];
    for (let d = this.cs; d < this.cs * 40; d += this.cs) for (let a = 0; a < 6.283; a += 0.5) {
      const nx = x + Math.cos(a) * d, ny = y + Math.sin(a) * d;
      if (this.free(nx, ny + f, r)) return [nx, ny];
    }
    return [x, y];
  },

  // ---------- Mapa de distancias para que los enemigos rodeen las paredes ----------
  updateFlow(dt) {
    if (!this.grid) return;
    this.flowT -= dt; if (this.flowT > 0 && this.flow) return;
    this.flowT = this.FLOW_EVERY;
    const al = P.filter(q => !q.dead); if (!al.length) return;
    const cs = this.cs, R = this.FLOW_R, n = this.fn = R * 2 + 1;
    const cxp = al.reduce((a, q) => a + q.x, 0) / al.length, cyp = al.reduce((a, q) => a + q.y + 40, 0) / al.length;
    this.fx0 = Math.floor(cxp / cs) - R; this.fy0 = Math.floor(cyp / cs) - R;
    const D = this.flow && this.flow.length === n * n ? this.flow : (this.flow = new Uint16Array(n * n));
    D.fill(65535);
    const qx = new Int32Array(n * n); let h = 0, tl = 0;
    for (const q of al) {   // arranca desde los pies de cada jugador vivo
      const c = Math.floor(q.x / cs) - this.fx0, r = Math.floor((q.y + 40) / cs) - this.fy0;
      if (c >= 0 && r >= 0 && c < n && r < n && D[r * n + c] !== 0) { D[r * n + c] = 0; qx[tl++] = r * n + c; }
    }
    while (h < tl) {
      const i = qx[h++], r = (i / n) | 0, c = i - r * n, dv = D[i] + 1;
      const nb = [i - 1, i + 1, i - n, i + n];
      for (let k = 0; k < 4; k++) {
        const j = nb[k]; if (j < 0 || j >= n * n) continue;
        const rr = (j / n) | 0, cc = j - rr * n; if (Math.abs(cc - c) + Math.abs(rr - r) !== 1) continue;
        if (D[j] <= dv) continue;
        if (this.solid((this.fx0 + cc + 0.5) * cs, (this.fy0 + rr + 0.5) * cs)) continue;
        D[j] = dv; qx[tl++] = j;
      }
    }
  },
  // distancia (en celdas) desde (x, y) hasta el jugador por el mapa de distancias: 65535 = no hay camino, -1 = fuera del mapa
  reach(x, y) {
    if (!this.flow) return -1;
    const n = this.fn, c = Math.floor(x / this.cs) - this.fx0, r = Math.floor(y / this.cs) - this.fy0;
    return c < 0 || r < 0 || c >= n || r >= n ? -1 : this.flow[r * n + c];
  },
  // lugar de aparición fuera de pantalla, libre y CONECTADO con el jugador (el mapa tiene niveles separados por barrancos)
  spawnPos(e) {
    const dist = Math.hypot(W, H) / 2 + 40;
    let best = null;
    for (let k = 0; k < 14; k++) {
      const a = Math.random() * 6.283, sp = this.freeSpot(cam.x + Math.cos(a) * dist, cam.y + Math.sin(a) * dist, e);
      const v = this.reach(sp[0], sp[1] + this.foot(e));
      if (v !== 65535) return sp;   // con camino (o fuera del mapa de distancias: se acerca en línea recta)
      best = best || sp;
    }
    return best;
  },
  // cada tanto, los enemigos que quedaron encerrados (sin camino al jugador) se mudan a un lugar conectado
  relocT: 0,
  relocate(dt) {
    if (!this.flow || (this.relocT -= dt) > 0) return;
    this.relocT = 1.5;
    let budget = 6;   // como mucho 6 mudanzas por vez (cada una busca lugar libre: es trabajo)
    for (const e of en) {
      if (budget <= 0) break;
      const v = this.reach(e.x, e.y + this.foot(e));
      if (v !== 65535 && v !== -1) continue;   // tiene camino: queda donde está (65535 = encerrado, -1 = demasiado lejos)
      const sp = this.spawnPos(e); budget--; if (sp) { e.x = sp[0]; e.y = sp[1]; e.st = 0; }
    }
  },
  // ángulo hacia el jugador siguiendo el mapa de distancias (o directo si está fuera del mapa o hay vista libre)
  steer(e, a) {
    if (!this.flow) return a;
    const cs = this.cs, n = this.fn, f = this.foot(e);
    const c = Math.floor(e.x / cs) - this.fx0, r = Math.floor((e.y + f) / cs) - this.fy0;
    if (c < 1 || r < 1 || c >= n - 1 || r >= n - 1) return a;
    const D = this.flow, here = D[r * n + c];
    if (here <= 2) return a;   // ya está al lado: directo
    let best = here, bx = 0, by = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      // en diagonal solo si los dos costados están libres (si no, se traba en la esquina de la pared)
      if (dx && dy && (D[r * n + c + dx] === 65535 || D[(r + dy) * n + c] === 65535)) continue;
      const v = D[(r + dy) * n + c + dx];
      if (v < best || (v === best && bx === 0 && by === 0 && v < 65535)) { best = v; bx = dx; by = dy; }
    }
    if (best >= here || best === 65535) return a;
    return Math.atan2(by, bx);
  },

  // ---------- Dibujo del fondo (mosaico en espejo) ----------
  draw() {
    if (!this.img || !this.data) return false;
    const S = this.size, s = this.data.scale;
    const x0 = Math.floor((cam.x - W / 2) / S), x1 = Math.floor((cam.x + W / 2) / S);
    const y0 = Math.floor((cam.y - H / 2) / S), y1 = Math.floor((cam.y + H / 2) / S);
    cx.imageSmoothingEnabled = false;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      // con wrap: copias derechas, 1 px más grandes para que no se vea la costura entre una y otra
      if (this.data.wrap) { cx.drawImage(this.img, 0, 0, this.img.width, this.img.height, tx * S, ty * S, S + 1, S + 1); continue; }
      const fx = tx & 1, fy = ty & 1;
      cx.save();
      cx.translate(tx * S + (fx ? S : 0), ty * S + (fy ? S : 0));
      cx.scale(fx ? -s : s, fy ? -s : s);
      cx.drawImage(this.img, 0, 0);
      cx.restore();
    }
    // velo oscuro para que los personajes y los efectos resalten sobre el fondo
    cx.fillStyle = 'rgba(5,11,26,.22)'; cx.fillRect(cam.x - W / 2 - 2, cam.y - H / 2 - 2, W + 4, H + 4);
    return true;
  },
  // Árboles por encima de los personajes, ordenados por profundidad: el que pasa por detrás (pies más arriba que la base del
  // tronco) queda tapado; al que está delante se lo vuelve a dibujar encima con redraw(e). ents = [{e, fy (pies), x0, x1, y0}].
  // Si un jugador vivo queda detrás, el árbol se pone medio transparente para no perderlo de vista.
  drawTall(ents, redraw) {
    if (!this.tall.length || !this.data || !this.data.wrap || !this.tilesV) return;
    const S = this.size, s = this.data.scale, m = 120 * s;
    const x0 = Math.floor((cam.x - W / 2 - m) / S), x1 = Math.floor((cam.x + W / 2 + m) / S);
    const y0 = Math.floor((cam.y - H / 2 - m) / S), y1 = Math.floor((cam.y + H / 2 + m) / S);
    const vl = cam.x - W / 2, vr = cam.x + W / 2, vt = cam.y - H / 2, vb = cam.y + H / 2;
    const list = [];
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) for (const t of this.tall) {
      const d = t[0], X = tx * S + t[1] * s, Y = ty * S + t[2] * s, w = d[2] * s, h = d[3] * s;
      if (X > vr || X + w < vl || Y > vb || Y + h < vt) continue;
      list.push([d, X, Y, w, h, ty * S + t[3] * s]);
    }
    list.sort((a, b) => a[5] - b[5]);
    cx.imageSmoothingEnabled = false;
    for (const [d, X, Y, w, h, base] of list) {
      const over = ents.filter(o => o.x1 > X && o.x0 < X + w && o.y0 < base && o.fy > Y);   // se tocan con el árbol
      cx.globalAlpha = over.some(o => o.pl && o.fy <= base) ? 0.55 : 1;
      cx.drawImage(this.tilesV, d[0], d[1] + 96, d[2], d[3], X, Y, w, h);
      cx.globalAlpha = 1;
      for (const o of over) if (o.fy > base) redraw(o.e);
    }
  }
};
