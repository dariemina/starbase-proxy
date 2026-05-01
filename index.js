const express = require('express');
const fetch   = require('node-fetch');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CORS ──────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Helper ────────────────────────────────────────────────────────────────
async function proxyGet(url, res) {
  try {
    const r    = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(502).json({ error: 'No se pudieron obtener los datos.' });
  }
}

// ── Endpoints ─────────────────────────────────────────────────────────────
// Todos los cierres
app.get('/cierres',        (req, res) => proxyGet('https://starbase.nerdpg.live/api/json/roadClosures',       res));
// Solo los de hoy
app.get('/cierres/hoy',    (req, res) => proxyGet('https://starbase.nerdpg.live/api/json/roadClosures/today', res));
// Pruebas esperadas (Starship)
app.get('/pruebas',        (req, res) => proxyGet('https://starbase.nerdpg.live/api/json/expectedTest',       res));
// NOTAMs (espacio aéreo)
app.get('/notams',         (req, res) => proxyGet('https://starbase.nerdpg.live/api/json/notams',             res));

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Explorando el Espacio — Proxy Starbase' });
});

app.listen(PORT, () => console.log(`Proxy corriendo en puerto ${PORT}`));
