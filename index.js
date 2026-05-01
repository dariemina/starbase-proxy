const express = require('express');
const fetch   = require('node-fetch');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CORS — allow any origin (Squarespace needs this) ──────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── PROXY endpoint ────────────────────────────────────────────────────────
app.get('/cierres', async (req, res) => {
  try {
    const r    = await fetch('https://starbase.nerdpg.live/api/json/roadClosures');
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error('Error fetching closures:', err.message);
    res.status(502).json({ error: 'No se pudieron obtener los datos de Starbase.' });
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Explorando el Espacio — Proxy Starbase' });
});

app.listen(PORT, () => {
  console.log(`Proxy corriendo en puerto ${PORT}`);
});
