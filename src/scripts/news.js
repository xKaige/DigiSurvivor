// Botón de novedades en la esquina del menú: muestra la versión (GAME_VERSION de game.js) y, al tocarlo,
// los cambios de cada versión (src/data/changelog.json). Marca "NUEVO" hasta que abras la versión actual.
const News = {
  KEY: 'digisurvivor_news',
  list: [],
  async load() {
    const r = await fetch('src/data/changelog.json');
    if (r.ok) this.list = await r.json();
  },
  seen() { try { return localStorage.getItem(this.KEY); } catch (e) { return null; } },
  button() {
    const ov = document.getElementById('ov'); if (!ov || document.getElementById('news-btn')) return;
    const b = document.createElement('button'); b.id = 'news-btn';
    b.onclick = () => this.open();
    ov.appendChild(b);
    const gv = document.getElementById('gver'); if (gv) gv.style.display = 'none';   // la versión ahora va en el botón
    this.paint();
  },
  paint() {
    const b = document.getElementById('news-btn'); if (!b) return;
    b.innerHTML = 'v' + GAME_VERSION + ' · Novedades' + (this.seen() !== GAME_VERSION ? '<span class="nw">NUEVO</span>' : '');
  },
  open() {
    let w = document.getElementById('news');
    if (!w) {
      w = document.createElement('div'); w.id = 'news';
      w.onclick = e => { if (e.target === w) this.close(); };
      document.body.appendChild(w);
    }
    w.innerHTML = '<div class="box"><div class="head"><h2>Novedades</h2><button id="news-x" aria-label="Cerrar">X</button></div>' +
      this.list.map(v => '<div class="nv' + (v.v === GAME_VERSION ? ' cur' : '') + '"><b>Versión ' + v.v + (v.v === GAME_VERSION ? ' <small>actual</small>' : '') + '</b><ul>' +
        v.items.map(i => '<li>' + i + '</li>').join('') + '</ul></div>').join('') + '</div>';
    document.getElementById('news-x').onclick = () => this.close();
    w.style.display = 'flex';
    try { localStorage.setItem(this.KEY, GAME_VERSION); } catch (e) {}
    this.paint();
  },
  close() { const w = document.getElementById('news'); if (w) w.style.display = 'none'; },
  isOpen() { const w = document.getElementById('news'); return !!w && w.style.display === 'flex'; }
};
News.load().catch(e => console.error(e)).then(() => News.button());
addEventListener('keydown', e => { if (e.key === 'Escape' && News.isOpen()) News.close(); });
