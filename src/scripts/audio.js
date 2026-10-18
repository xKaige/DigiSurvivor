// Sound: música de la partida (main_theme en loop) y efectos cortos sintetizados con WebAudio.
// Volúmenes y mute en localStorage['digisurvivor_audio']. El parlante (#snd, arriba a la derecha en partida) abre el panel.
// Se carga antes que todo: game.js, items.js y gate.js llaman Sound.music(on) y Sound.play(efecto).
const Sound = {
  KEY: 'digisurvivor_audio',
  SRC: 'assets/audio/main_theme.mp3',
  MUSIC_BASE: 0.4,                       // la música suena más baja que los efectos (con el control al 100%)
  cfg: { mu: 0.6, sf: 0.7, off: false }, // mu = música, sf = sonidos (0..1), off = todo silenciado
  ctx: null, master: null, mg: null, sg: null, el: null, src: null, want: false, last: {},

  load() { try { Object.assign(this.cfg, JSON.parse(localStorage.getItem(this.KEY)) || {}); } catch (e) {} },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.cfg)); } catch (e) {} },

  // Se arma en el primer gesto del usuario (los navegadores, sobre todo iOS, no dejan sonar antes)
  init() {
    if (this.el) { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); return; }
    this.el = new Audio(this.SRC); this.el.loop = true; this.el.preload = 'auto';   // loop: dura lo que dure la partida
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
        this.mg = this.ctx.createGain(); this.mg.connect(this.master);
        this.sg = this.ctx.createGain(); this.sg.connect(this.master);
        this.src = this.ctx.createMediaElementSource(this.el); this.src.connect(this.mg);   // por WebAudio: en iOS el volumen del <audio> no se puede cambiar
      } catch (e) { console.error('Sin WebAudio:', e); this.ctx = null; this.src = null; }
    }
    this.apply();
    // "desbloquea" la música en este gesto; si todavía no hay partida, se pausa enseguida
    if (!this.want) this.el.muted = true;
    this.el.play().then(() => { if (!this.want) this.el.pause(); this.el.muted = false; }).catch(() => { this.el.muted = false; });
  },

  apply() {
    const c = this.cfg, m = c.off ? 0 : c.mu * this.MUSIC_BASE;
    if (this.ctx) { this.master.gain.value = c.off ? 0 : 1; this.mg.gain.value = c.mu * this.MUSIC_BASE; this.sg.gain.value = c.sf; }
    if (this.el && !this.src) this.el.volume = m;
    this.ui();
  },
  set(k, v) { this.cfg[k] = v; if (k !== 'off' && v > 0) this.cfg.off = false; this.save(); this.apply(); },

  music(on) {
    this.want = on; this.init(); if (!this.el) return;
    if (on) { this.el.currentTime = 0; this.el.play().catch(() => {}); } else this.el.pause();
  },

  // ---------- Efectos (sintetizados: no hay archivos) ----------
  GAP: { gem: 0.06, hurt: 0.22, item: 0.1, level: 0.3, evo: 1, gate: 1, win: 1 },   // mínimo entre dos iguales (s)
  tone(f, d, type, vol, f2, at) {
    const x = this.ctx, t0 = x.currentTime + (at || 0), o = x.createOscillator(), g = x.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + d);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g); g.connect(this.sg); o.start(t0); o.stop(t0 + d + 0.02);
  },
  play(k) {
    if (!this.ctx || this.cfg.off || this.cfg.sf <= 0 || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime; if (now - (this.last[k] || -9) < (this.GAP[k] || 0)) return; this.last[k] = now;
    switch (k) {
      case 'gem': this.tone(1100 + Math.random() * 300, 0.06, 'sine', 0.05); break;
      case 'hurt': this.tone(190, 0.16, 'sawtooth', 0.1, 70); break;
      case 'item': this.tone(660, 0.09, 'square', 0.06); this.tone(990, 0.14, 'square', 0.06, 0, 0.08); break;
      case 'level': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.16, 'square', 0.06, 0, i * 0.07)); break;
      case 'evo': this.tone(220, 1.1, 'triangle', 0.1, 1200); [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.3, 'square', 0.05, 0, 1.1 + i * 0.09)); break;
      case 'gate': for (let i = 0; i < 3; i++) { this.tone(440, 0.14, 'square', 0.06, 0, i * 0.3); this.tone(330, 0.14, 'square', 0.06, 0, i * 0.3 + 0.15); } break;
      case 'win': [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, i === 4 ? 0.5 : 0.14, 'square', 0.06, 0, i * 0.1)); break;
    }
  },

  // ---------- Botón del parlante y panel ----------
  ICON_ON: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  ICON_OFF: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  ui() {
    const b = document.getElementById('sndb'); if (!b) return;
    const c = this.cfg, mute = c.off || (c.mu <= 0 && c.sf <= 0);
    b.innerHTML = mute ? this.ICON_OFF : this.ICON_ON; b.classList.toggle('off', mute);
    document.getElementById('sndmu').value = Math.round(c.mu * 100); document.getElementById('sndsf').value = Math.round(c.sf * 100);
    document.getElementById('sndmut').textContent = c.off ? 'Activar sonido' : 'Silenciar todo';
  },
  bind() {
    const box = document.getElementById('snd'); if (!box) return;
    const b = document.getElementById('sndb');
    b.onclick = () => { this.init(); box.classList.toggle('open'); b.blur(); };
    document.getElementById('sndmu').oninput = e => this.set('mu', e.target.value / 100);
    document.getElementById('sndsf').oninput = e => { this.set('sf', e.target.value / 100); this.play('item'); };
    document.getElementById('sndmut').onclick = e => { this.init(); this.set('off', !this.cfg.off); e.target.blur(); };
    document.addEventListener('pointerdown', e => { if (!box.contains(e.target)) box.classList.remove('open'); });
    const first = () => { this.init(); removeEventListener('pointerdown', first, true); removeEventListener('keydown', first, true); };
    addEventListener('pointerdown', first, true); addEventListener('keydown', first, true);
    this.ui();
  },
};
Sound.load();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => Sound.bind()); else Sound.bind();
