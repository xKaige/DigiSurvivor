// Función de Vercel: recibe un reporte de error del juego (botón "Reportar un error") y lo carga como Issue en GitHub.
// Necesita en Vercel (Settings → Environment Variables) la variable GITHUB_TOKEN: un token "fine-grained" con acceso
// SOLO a este repositorio y el permiso "Issues: Read and write". Opcional: GITHUB_REPO (por defecto xKaige/DigiSurvivor).
// El token nunca llega al navegador: el juego le pega a /api/report y esta función habla con GitHub.
const recent = new Map();   // ip -> últimos envíos (freno simple contra spam; se pierde si la función se reinicia)

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usá POST' });
  const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPO || 'xKaige/DigiSurvivor';
  if (!token) return res.status(500).json({ error: 'Falta configurar GITHUB_TOKEN en Vercel' });

  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  if (b.web) return res.status(200).json({ ok: true });   // campo trampa: lo completan los bots, no las personas

  // como mucho 3 reportes cada 10 minutos por IP
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x', now = Date.now();
  const list = (recent.get(ip) || []).filter(x => now - x < 600000);
  if (list.length >= 3) return res.status(429).json({ error: 'Mandaste varios reportes seguidos: esperá unos minutos' });
  list.push(now); recent.set(ip, list);

  const text = String(b.text || '').trim().slice(0, 4000);
  if (text.length < 10) return res.status(400).json({ error: 'Contá un poco más (10 letras como mínimo)' });
  const kind = { bug: 'Error', idea: 'Idea', other: 'Otro' }[b.kind] || 'Error';
  const title = '[' + kind + '] ' + text.split('\n')[0].slice(0, 80);
  const info = b.info && typeof b.info === 'object' ? b.info : {};
  const lines = Object.entries(info).slice(0, 25).map(([k, v]) => '- **' + String(k).slice(0, 40) + '**: ' + String(v).replace(/[\r\n]+/g, ' ').slice(0, 300));
  const body = text + '\n\n---\n**Datos del juego**\n' + lines.join('\n') + '\n\n_Enviado con el botón "Reportar un error" del juego._';

  try {
    const r = await fetch('https://api.github.com/repos/' + repo + '/issues', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'DigiSurvivor-report', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body })
    });
    if (!r.ok) return res.status(502).json({ error: 'GitHub respondió ' + r.status });
    const j = await r.json();
    return res.status(200).json({ ok: true, n: j.number });
  } catch (e) {
    return res.status(502).json({ error: 'No se pudo hablar con GitHub' });
  }
};
