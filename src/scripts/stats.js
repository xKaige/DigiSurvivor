// Motor de stats de los Digimon (0.6). Se carga ANTES que game.js y usa sus globals en tiempo de ejecución
// (P, en, ef, fx, t, hit, burst, dmgNum, CR, SkillSys, Items, Bosses).
//
// Cada jugador tiene:
// - q.bs  puntos base de su especie (FUE/INT/VEL/VIT, "stats" en el JSON de la criatura), que crecen al evolucionar
// - q.st  puntos que suma en la partida con las cartas (son los que cuentan para los requisitos de las ramas)
// - q.m   bolsa de modificadores: cartas, evoluciones, árbol, vínculo, ítems… (todo suma acá; ver blank())
// - q.fam familia de su forma actual (Fields de Wikimon: da una pasiva) y q.tr su rasgo único (trait del JSON)
// Stats.calc(q) arma con todo eso los valores que usa el juego: q.dmg, q.rate, q.sp, q.max, q.arm, q.mag, q.xpm,
// q.crit, q.critD, q.cdr, q.area, q.dur, q.luck, q.regen, q.leech… Hay que llamarla cada vez que cambia algo.
// Lo que depende del momento (vida baja, enemigos cerca, moverse) se aplica en cada golpe (onHit) o en tick.
const Stats = {
  KEYS: ['FUE', 'INT', 'VEL', 'VIT'],
  NAME: { FUE: 'Fuerza', INT: 'Inteligencia', VEL: 'Velocidad', VIT: 'Vitalidad' },
  // lo que da cada punto de stat
  PT: { FUE: '+3% de daño', INT: '-1,5% de recarga, +2% de XP y +4% de SP', VEL: '+2% de velocidad y de ataque', VIT: '+4% de vida' },
  // Familias (Fields de Wikimon): la de la forma actual da su pasiva
  FAM: {
    NSp: { n: 'Nature Spirits',     d: '+6% de velocidad y +0,4 de vida por segundo', m: { spP: 0.06, regen: 0.4 } },
    DS:  { n: 'Deep Savers',        d: '+0,8 de vida por segundo',                    m: { regen: 0.8 } },
    NSo: { n: 'Nightmare Soldiers', d: 'Roba un 2% del daño que hace',                m: { leech: 0.02 } },
    WG:  { n: 'Wind Guardians',     d: '+5% de velocidad y +5% de área',              m: { spP: 0.05, area: 0.05 } },
    ME:  { n: 'Metal Empire',       d: '-6% de daño recibido',                        m: { arm: 0.06 } },
    VB:  { n: 'Virus Busters',      d: '+10% de daño contra Virus y +0,3 de vida por segundo', m: { vs1: 0.1, regen: 0.3 } },
    DR:  { n: "Dragon's Roar",      d: '+5% de crítico y +15% de daño crítico',       m: { crit: 0.05, critD: 0.15 } },
    JT:  { n: 'Jungle Troopers',    d: '+15% de duración de efectos',                 m: { dur: 0.15 } },
    DA:  { n: 'Dark Area',          d: '+10% de daño, -8% de vida',                   m: { dmgP: 0.1, hpP: -0.08 } },
    UK:  { n: 'Unknown',            d: '+15% de suerte',                              m: { luck: 0.15 } }
  },
  // rasgos que se resuelven solos con modificadores (el resto tiene código propio en los hooks)
  TRAIT_M: { kitsune: { dodge: 0.12 }, curioso: { xp: 0.12 }, filo: { crit: 0.1, critD: 0.25 }, arsenal: { multi: 1, rateP: 0.1 },
    kabuto: { shield: 12 }, puas: { thorns: 3 } },
  STAGE: { dmg: 1.5, hp: 30 },                       // cada evolución (etapas 1 a 4)
  DARK: { dmg: 7, multi: 1, spP: 0.08, hp: 40 },     // evolución oscura (si la línea no trae "bonus" en "dark")
  DP_NEED: [25, 60, 110, 170],                       // virus para una evolución perfecta (etapas 1 a 4)

  blank() {
    return {
      dmg: 0, dmgP: 0, dmgX: 1, rateP: 0, multi: 0, pierce: 0, spP: 0, hp: 0, hpP: 0, hpX: 1, arm: 0, magP: 0, xp: 0, coin: 0,
      crit: 0, critD: 0, cdr: 0, area: 0, dur: 0, luck: 0, regen: 0, leech: 0, spg: 0, dodge: 0, revSpd: 0, revHP: 0,
      vs0: 0, vs1: 0, vs2: 0, healP: 0, acoin: 0, slots: 0, cards: 0, reroll: 0, bulletRes: 0, rcChance: 0, bossCoin: 0,
      FUE: 0, INT: 0, VEL: 0, VIT: 0,
      // banderas de pasivas grandes (0/1 o un valor): ver los hooks
      shield: 0, lastStand: 0, backup: 0, purify: 0, aura: 0, berserk: 0, execute: 0, moveDmg: 0, killSpeed: 0, infect: 0,
      corrupt: 0, darkMaster: 0, overload: 0, slowAura: 0, moveCdr: 0, lowRegen: 0, thorns: 0, quick: 0, itemStart: 0
    };
  },
  // suma una bolsa de modificadores (las de multiplicar, dmgX/hpX, se multiplican; las banderas de recarga, el mínimo)
  add(m, o, k = 1) {
    for (const key in o) {
      const v = o[key]; if (typeof v !== 'number') continue;
      if (key === 'dmgX' || key === 'hpX') m[key] *= Math.pow(v, k);
      else if (key === 'shield') m[key] = m[key] ? Math.min(m[key], v) : v;
      else m[key] = (m[key] || 0) + v * k;
    }
    return m;
  },

  // ---------- Al empezar la partida ----------
  // lo = "loadout" del jugador (árbol + vínculo, lo arma trees.js con el guardado de SU navegador)
  init(q, lo) {
    const C = CR(q), M = C && C.meta;
    q.m = this.blank();
    q.bs = Object.assign({ FUE: 2, INT: 2, VEL: 3, VIT: 3 }, (M && M.stats) || {});
    q.prof = Object.assign({}, q.bs);
    q.tr = (M && M.trait && M.trait.id) || null;
    q.fam = (M && M.stages[0] && M.stages[0].family) || null;
    if (this.TRAIT_M[q.tr]) this.add(q.m, this.TRAIT_M[q.tr]);
    if (lo && lo.m) this.add(q.m, lo.m);
    q.bond = (lo && lo.bond) | 0;
    // contadores de la partida (evoluciones estilo V-Pet) y estado de las pasivas
    q.vp = { k: 0, bo: 0, care: 0, nh: 0, nhb: 0, dp: 0, rc: 0 };
    q.spv = 0; q.emp = 0; q.casts = 0; q.shT = 0; q.valT = 0; q.ksT = 0; q.puT = 3; q.calm = 0; q.low = 0; q.near = 0; q.nearT = 0;
    q.ls = 0; q.bk = 0; q.rr = q.m.reroll | 0;   // rr: re-sorteos de cartas que quedan (árbol de Tamer)
    this.calc(q, true);
  },

  pts(q, k) { return ((q.bs && q.bs[k]) | 0) + ((q.st && q.st[k]) | 0) + ((q.m && q.m[k]) | 0); },

  calc(q, fresh) {
    if (!q.m) return;
    const m = q.m, F = this.FAM[q.fam], f = F ? F.m : {}, g = k => (m[k] || 0) + (f[k] || 0);
    const FUE = this.pts(q, 'FUE'), INT = this.pts(q, 'INT'), VEL = this.pts(q, 'VEL'), VIT = this.pts(q, 'VIT');
    const xa = q.xa ? (q.tr === 'prototipo' ? 1.5 : 1.25) : 1, bond = q.bond | 0;
    const oldMax = q.max || 0;
    q.dmg = (1 + g('dmg')) * (1 + g('dmgP') + 0.03 * FUE + 0.015 * bond) * m.dmgX * xa;
    q.rate = 0.6 / (1 + g('rateP') + 0.02 * VEL);
    q.multi = 1 + g('multi'); q.pierce = g('pierce');
    q.sp = 210 * Math.max(0.4, 1 + g('spP') + 0.02 * VEL) * (q.xa ? 1.1 : 1);
    q.max = Math.max(10, (100 + g('hp')) * Math.max(0.2, 1 + g('hpP') + 0.04 * VIT + 0.02 * bond) * m.hpX);
    q.arm = Math.min(0.6, g('arm'));
    q.mag = 70 * (1 + g('magP'));
    q.xpm = 1 + g('xp') + 0.02 * INT;
    q.coin = 1 + g('coin');
    q.crit = Math.min(0.75, 0.05 + g('crit')); q.critD = 1.5 + g('critD');
    q.cdr = Math.max(0.4, 1 - g('cdr') - 0.015 * INT);
    q.area = 1 + g('area'); q.dur = 1 + g('dur'); q.luck = g('luck');
    q.regen = g('regen'); q.leech = Math.min(0.25, g('leech')); q.dodge = Math.min(0.5, g('dodge'));
    q.spg = 1 + g('spg') + 0.04 * INT;
    q.revSpd = 1 + g('revSpd');
    // la vida: si sube el máximo, sube igual la actual (una carta de +25 cura 25); si baja, se recorta
    if (fresh || !oldMax) q.hp = q.max;
    else if (q.max > oldMax) q.hp = Math.min(q.max, q.hp + (q.max - oldMax));
    else q.hp = Math.min(q.hp, q.max);
  },

  // ---------- Cartas de mejora (las mismas en local y online: op) ----------
  CARDS: [
    { c: 'FUE', n: 'Más daño',        d: '+1 de daño por disparo',              op: 'dmg',   m: { dmg: 1 } },
    { c: 'FUE', n: 'Golpe certero',   d: '+5% de chance de crítico',            op: 'crit',  m: { crit: 0.05 } },
    { c: 'VEL', n: 'Patas veloces',   d: '+15% de velocidad',                   op: 'sp',    m: { spP: 0.15 } },
    { c: 'VEL', n: 'Disparo rápido',  d: 'Ataca un 15% más seguido',            op: 'rate',  m: { rateP: 0.15 } },
    { c: 'VIT', n: 'Reparación',      d: '+25 de vida máxima y cura 25',        op: 'hp',    m: { hp: 25 } },
    { c: 'VIT', n: 'Regeneración',    d: '+0,6 de vida por segundo',            op: 'regen', m: { regen: 0.6 } },
    { c: 'INT', n: 'Imán de datos',   d: 'Atrae el XP desde más lejos',         op: 'mag',   m: { magP: 0.6 } },
    { c: 'INT', n: 'Procesador',      d: '-6% de recarga de las skills',        op: 'cdr',   m: { cdr: 0.06 } },
    { c: 'INT', n: 'Expansión',       d: '+8% de área de las skills',           op: 'area',  m: { area: 0.08 } }
  ],
  cardOf(op) { return this.CARDS.find(c => c.op === op); },
  // aplica una carta de stat a q (suma el punto de su stat y su efecto)
  card(q, op) {
    const c = this.cardOf(op); if (!c || !q.m) return;
    this.add(q.m, c.m); this.calc(q);
  },

  // ---------- Evolución ----------
  // s = etapa nueva. Crece el perfil de la especie (la mitad de sus puntos, redondeando para arriba) y suma el bono.
  evolve(q, s) {
    const C = CR(q), M = C && C.meta; if (!q.m) return;
    if (s < 5) {
      this.add(q.m, this.STAGE);
      for (const k of this.KEYS) q.bs[k] += Math.ceil((q.prof[k] | 0) / 2);
      const st = M && M.stages[s]; if (st && st.family) q.fam = st.family;
      // evolución perfecta (V-Pet): juntaste suficientes virus desde la anterior → +2 en su mejor stat
      const need = this.DP_NEED[s - 1] || 999;
      q.perfect = q.vp.dp >= need ? 1 : 0; if (q.perfect) q.pfc = (q.pfc | 0) + 1;   // pfc: evoluciones perfectas en la partida (logro Perfección)
      if (q.perfect) { const top = this.KEYS.slice().sort((a, b) => q.prof[b] - q.prof[a])[0]; q.bs[top] += 2; }
      q.vp.dp = 0;
    } else if (q.dark) {
      this.add(q.m, (M && M.dark && M.dark.bonus) || this.DARK);
      if (M && M.dark && M.dark.family) q.fam = M.dark.family;
    } else {
      const b = M && (M.branches.find(x => x.id === q.branchId) || M.branches[q.line || 0]);
      if (b) {
        const B = b.bonus || {};
        this.add(q.m, { dmg: B.dmg || 0, hp: B.hp || 0, pierce: B.pierce || 0, multi: B.multi || 0, spP: B.spP || 0 });
        if (b.family) q.fam = b.family;
      }
    }
    this.calc(q); q.hp = q.max;
  },

  // ---------- Requisitos de las ramas finales (puntos de la partida + condiciones V-Pet) ----------
  VPN: { kills: 'Digimon eliminados', nohit: 'Segundos seguidos sin daño', care: 'Veces al borde (bajo 30% de vida)', bosses: 'Jefes derrotados' },
  vpVal(q, k) { const v = q.vp || {}; return k === 'kills' ? v.k | 0 : k === 'nohit' ? Math.floor(Math.max(v.nhb || 0, v.nh || 0)) : k === 'care' ? v.care | 0 : k === 'bosses' ? v.bo | 0 : 0; },

  // ---------- Combate: hooks ----------
  // daño que hace q a e (antes del crítico)
  onHit(q, e, v) {
    const m = q.m, F = this.FAM[q.fam], f = (F && F.m) || {};
    let k = 1 + (m['vs' + e.el] || 0) + (f['vs' + e.el] || 0);
    const hpf = q.hp / q.max;
    if (q.tr === 'hazard') k += 0.4 * (1 - hpf);
    if (q.tr === 'valor' && q.valT > 0) k += 0.25;
    if (q.tr === 'manada') k += Math.min(0.32, 0.04 * q.near);
    if (m.berserk && hpf < 0.3) k += 0.4;
    if (m.moveDmg && q.moving) k += m.moveDmg;
    v *= k;
    if (m.execute && e.bo == null && e.hp - v < (e.mh || e.hp0 || e.hp) * m.execute) v = Math.max(v, e.hp);   // remata a los que quedan con poca vida
    return v;
  },
  // después de golpear: robo de vida, SP, ralentizar, infectar, chispa
  afterHit(q, e, v) {
    if (q.leech) q.hp = Math.min(q.max, q.hp + v * q.leech);
    if (!q.emp) { q.spv = Math.min(100, q.spv + 0.25 * q.spg); if (q.spv >= 100) { q.emp = 1; } }
    if (q.tr === 'hilo') this.slow(e, 0.3, 1.5 * q.dur);
    if (q.m.infect && e.bo == null) { e.inf = Math.max(e.inf || 0, 3 * q.dur); e.infD = Math.max(e.infD || 0, v * 0.2 / 3); e.infQ = q.id; }
    if (q.tr === 'chispa' && !this.chain && Math.random() < 0.15) {
      let b = null, bd = 160;
      for (const o of en) { if (o === e || o.hp <= 0) continue; const d = Math.hypot(o.x - e.x, o.y - e.y); if (d < bd) { bd = d; b = o; } }
      if (b) { this.chain = 1; ef.push({ k: 'ray', x: e.x, y: e.y, a: Math.atan2(b.y - e.y, b.x - e.x), Lg: bd, w: 5, col: '#ffe14d', l: .18, m: .18 }); hit(b, v * 0.5, q.el, q); this.chain = 0; }
    }
  },
  slow(e, f, s) { e.slw = Math.max(e.slw || 0, s); e.slf = Math.max(e.slf || 0, f); },
  // un enemigo murió: a quién se le cuenta y pasivas que se activan con la muerte
  onKill(q, e) {
    if (!q || !q.vp) return;
    q.vp.k++; q.vp.dp++;
    if (!q.emp) { q.spv = Math.min(100, q.spv + 3 * q.spg); if (q.spv >= 100) q.emp = 1; }
    if (q.m.purify && e.el === 1) q.hp = Math.min(q.max, q.hp + q.max * 0.01);
    if (q.m.killSpeed) q.ksT = 2;
    if (q.m.corrupt && e.inf > 0) {   // corrupción: los infectados explotan
      ef.push({ k: 'ring', x: e.x, y: e.y, R: 80 * q.area, col: '#c05bff', l: .3, m: .3 });
      for (const o of en) if (o !== e && o.hp > 0 && Math.hypot(o.x - e.x, o.y - e.y) < 80 * q.area + o.r) hit(o, q.dmg * 2, q.el, q);
    }
  },
  // q recibe daño v (ya con el atributo). Devuelve el daño final (0 = lo evitó). src: 'b' = bala
  onHurt(q, v, src) {
    const m = q.m; if (!m) return v;
    if (q.dodge && Math.random() < q.dodge) { dmgNum(q.x, q.y - q.r - 6, 0, '#bfe6ff', 16, 'Esquivó'); q.inv = 0.3; return 0; }
    if (m.shield && q.shT <= 0) { q.shT = m.shield; q.inv = 0.4; dmgNum(q.x, q.y - q.r - 6, 0, '#ffe14d', 16, 'Bloqueó'); ef.push({ k: 'ring', x: q.x, y: q.y, R: 60, col: '#ffe14d', l: .3, m: .3 }); return 0; }
    if (src === 'b' && m.bulletRes) v *= Math.max(0.2, 1 - m.bulletRes);
    q.valT = 3; q.calm = 0; q.vp.nhb = Math.max(q.vp.nhb, q.vp.nh); q.vp.nh = 0;
    if (m.thorns && this.lastTouch) hit(this.lastTouch, q.dmg * m.thorns, q.el, q);
    return v;
  },
  // q se queda sin vida: pasivas que lo salvan (una vez por partida)
  onDeath(q) {
    if (q.m && q.m.lastStand && !q.ls) { q.ls = 1; q.hp = 1; q.dead = false; q.inv = 3; this.flash(q, 'Último Bastión', '#ffe14d'); return true; }
    if (q.m && q.m.backup && !q.bk) { q.bk = 1; q.hp = q.max * 0.5; q.dead = false; q.inv = 3; this.flash(q, 'Respaldo', '#5cf2ff'); return true; }
    return false;
  },
  flash(q, txt, col) { fx.push({ x: q.x, y: q.y - (q.dh || 96) + 20, txt, col, sz: 22, l: 1.4 }); for (let i = 0; i < 24; i++) burst(q.x, q.y, col); },

  // ---------- Cada cuadro (solo anfitrión / local) ----------
  tick(q, dt) {
    if (!q.m || q.dead) return;
    const m = q.m;
    q.shT -= dt; q.valT -= dt; q.ksT -= dt; q.calm += dt;
    q.vp.nh += dt;
    // "al borde" (V-Pet: errores de cuidado): cuenta cada vez que baja del 30% (vuelve a contar al pasar del 50%)
    const f = q.hp / q.max;
    if (f < 0.3 && !q.low) { q.low = 1; q.vp.care++; } else if (f > 0.5) q.low = 0;
    let rg = q.regen;
    if (m.lowRegen && f < 0.3) rg += m.lowRegen;
    if (q.tr === 'bendicion' && q.calm > 4) rg += q.max * 0.01;
    if (rg) q.hp = Math.min(q.max, q.hp + rg * dt);
    // enemigos cerca (Manada, Campo de datos): se cuentan cada 0,25 s
    if ((q.nearT -= dt) <= 0 && (q.tr === 'manada' || m.slowAura)) {
      q.nearT = 0.25; let n = 0;
      for (const e of en) if (Math.abs(e.x - q.x) < 180 && Math.abs(e.y - q.y) < 180 && Math.hypot(e.x - q.x, e.y - q.y) < 170) { n++; if (m.slowAura) this.slow(e, 0.2, 0.35); }
      q.near = n;
    }
    // Pulso (Pulsemon): descarga alrededor cada 3 s mientras se mueve
    if (q.tr === 'pulso' && q.moving && (q.puT -= dt) <= 0) {
      q.puT = 3; const R = 110 * q.area;
      ef.push({ k: 'ring', x: q.x, y: q.y, R, col: '#ffe14d', l: .3, m: .3 });
      for (const e of en) if (Math.hypot(e.x - q.x, e.y - q.y) < R + e.r) hit(e, q.dmg * 2, q.el, q);
    }
    // Aura curativa (Vacuna): cura a los compañeros cerca
    if (m.aura) for (const o of P) if (o !== q && !o.dead && Math.hypot(o.x - q.x, o.y - q.y) < 200) o.hp = Math.min(o.max, o.hp + 1.5 * dt);
    // la oscuridad lo va consumiendo, hasta el 35% de la vida (dominada: hasta el 60%)
    if (q.dark && (q.stage | 0) >= 5) { const fl = m.darkMaster ? 0.6 : 0.35; if (q.hp > q.max * fl) q.hp = Math.max(q.max * fl, q.hp - q.max * 0.004 * dt); }
  },
  // enemigos: ralentizados e infectados
  enemyTick(e, dt) {
    if (e.slw > 0) { e.slw -= dt; if (e.slw <= 0) e.slf = 0; }
    if (e.inf > 0) { e.inf -= dt; e.hp -= e.infD * dt; if (e.inf <= 0) e.infD = 0; }
  },
  // multiplicador de velocidad de un enemigo (lo usa Enemies.move)
  slowOf(e) { return e.slw > 0 ? 1 - (e.slf || 0) : 1; },
  // velocidad de movimiento del momento (Cazador: +15% un rato después de matar)
  speedOf(q) { return q.sp * (q.m && q.m.killSpeed && q.ksT > 0 ? 1.15 : 1); },
  // SP: cuando la barra está llena, la próxima skill sale potenciada (x2 daño, +30% de área)
  useEmp(q, S) { if (!q.emp) return; S.dmg *= 2; S.area *= 1.3; S.size *= 1.2; q.emp = 0; q.spv = 0; this.flash(q, '¡SP!', '#5cf2ff'); }
};
