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

// ── Scraper starbase.texas.gov ────────────────────────────────────────────
app.get('/estado', async (req, res) => {
  try {
    const r    = await fetch('https://www.starbase.texas.gov/beach-road-access', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ExplorandoElEspacio/1.0)' }
    });
    const html = await r.text();

    // Simple text extraction without cheerio — strip all HTML tags
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    console.log('PAGE TEXT:', text.substring(0, 2000));

    // Beach status
    const beachMatch = text.match(/Boca Chica Beach[^.!?]*/i);
    const beach = beachMatch ? beachMatch[0].trim() : '';
    console.log('beach:', beach);

    // Road section: grab everything between "Road Updates" and next section heading
    const roadSectionMatch = text.match(/Road Updates?\s*(.*?)(?:Public Notice|Previous Orders|Other Beaches|Surf Report)/i);
    const roadSection = roadSectionMatch ? roadSectionMatch[1].trim() : '';
    console.log('roadSection:', roadSection.substring(0, 400));

    const roadCards = [];
    if (/no road delay/i.test(roadSection)) {
      roadCards.push({ type: 'none' });
    } else if (/road delay/i.test(roadSection)) {
      const descM = roadSection.match(/DESCRIPTION[:\s]+([^D]+?)(?=DATE|$)/i);
      const dateM = roadSection.match(/DATE[:\s]+([^\n]+)/i);
      roadCards.push({
        type: 'delay',
        desc: descM ? descM[1].trim() : '',
        date: dateM ? dateM[1].trim() : ''
      });
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
