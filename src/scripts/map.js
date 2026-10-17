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

  async load(id = 'boot_jungle') {
    if (this.data && this.data.id === id) return;
    const r = await fetch('src/data/maps/' + id + '.json');
    if (!r.ok) throw new Error('No se encontró src/data/maps/' + id + '.json (' + r.status + ')');
    const d = await r.json();
    await new Promise(res => { const i = new Image(); i.onload = () => { this.img = i; res(); }; i.onerror = () => { console.error('No se pudo cargar el mapa', d.image); res(); }; i.src = 'assets/maps/' + d.image; });
    this.data = d; this.size = d.w * d.scale; this.cs = this.CELL * d.scale;
    // grilla de paredes (1 = no se puede pasar)
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
  local(v, size) { const k = Math.floor(v / size), m = v - k * size; return (k & 1) ? size - 1e-6 - m : m; },
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
    for (const e of en) {
      const v = this.reach(e.x, e.y + this.foot(e));
      if (v !== 65535 && v !== -1) continue;   // tiene camino: queda donde está (65535 = encerrado, -1 = demasiado lejos)
      const sp = this.spawnPos(e); if (sp) { e.x = sp[0]; e.y = sp[1]; e.st = 0; }
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
  }
};
