const express = require('express');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

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

app.get('/estado', async (req, res) => {
  try {
    // Scrape the HOMEPAGE — it has the full structured road delay data
    const r    = await fetch('https://www.starbase.texas.gov/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ExplorandoElEspacio/1.0)' }
    });
    const html = await r.text();
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    console.log('=== PAGE TEXT SAMPLE ===');
    // Find the Beach & Road section
    const idx = text.indexOf('Beach & Road Access');
    if (idx > -1) console.log('ROAD SECTION:', text.substring(idx, idx + 600));

    // ── Beach ─────────────────────────────────────────────────────────────
    // "Boca Chica Beach is open." or "Boca Chica Beach is closed."
    const beachM = text.match(/Boca Chica Beach[^.!?]*[.!?]/i);
    const beach  = beachM ? beachM[0].trim() : '';
    console.log('beach:', beach);

    // ── Road section from homepage ────────────────────────────────────────
    // Structure: "Beach & Road Access ... Road Delay ... Description: X Date: Y ... No road delays."
    const roadSectionM = text.match(/Beach\s*&\s*Road Access\s*([\s\S]*?)(?:View All|Building Permits)/i);
    const roadSection  = roadSectionM ? roadSectionM[1].trim() : '';
    console.log('roadSection:', roadSection.substring(0, 600));

    const roadCards = [];

    if (!roadSection || /no road delay/i.test(roadSection)) {
      roadCards.push({ type: 'none' });
    } else {
      // Extract each "Description: X Date: Y" pair
      // Format: "Description: Production to Pad Date: February 15 11:59 PM to February 16 4:00 AM"
      const cardRegex = /Description[:\s]+([^\n]+?)\s+Date[:\s]+([^\n]+?)(?=Description|Road Delay|No road|View All|$)/gi;
      let m;
      while ((m = cardRegex.exec(roadSection)) !== null) {
        roadCards.push({
          type: 'delay',
          desc: m[1].trim(),
          date: m[2].trim()
        });
      }

      // Fallback if regex didn't match
      if (roadCards.length === 0 && /road delay/i.test(roadSection)) {
        roadCards.push({ type: 'delay', desc: 'Demora en carretera', date: '' });
      }
    }

    console.log('roadCards:', JSON.stringify(roadCards));

    res.json({ beach, roadCards, fetchedAt: new Date().toISOString() });

  } catch (err) {
    console.error('Scrape error:', err.message);
    res.status(502).json({ error: 'No se pudo obtener el estado.' });
  }
});

app.get('/cierres',     (req, res) => proxyGet('https://starbase.nerdpg.live/api/json/roadClosures',       res));
app.get('/cierres/hoy', (req, res) => proxyGet('https://starbase.nerdpg.live/api/json/roadClosures/today', res));
app.get('/pruebas',     (req, res) => proxyGet('https://starbase.nerdpg.live/api/json/expectedTest',       res));
app.get('/notams',      (req, res) => proxyGet('https://starbase.nerdpg.live/api/json/notams',             res));

app.get('/', (req, res) => res.json({ status: 'ok', service: 'Explorando el Espacio — Proxy Starbase' }));

app.listen(PORT, () => console.log(`Proxy corriendo en puerto ${PORT}`));
