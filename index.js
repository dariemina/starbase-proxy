const express  = require('express');
const fetch    = require('node-fetch');
const cheerio  = require('cheerio');

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
    const $    = cheerio.load(html);

    // ── Dump full visible text (for debugging) ────────────────────────────
    const fullText = $('body').text().replace(/\s+/g, ' ').trim();
    console.log('=== FULL PAGE TEXT ===');
    console.log(fullText.substring(0, 2000));
    console.log('=== END ===');

    // ── Beach: look for "Boca Chica Beach is" anywhere in page ───────────
    const beachMatch = fullText.match(/Boca Chica Beach[^.!]*[.!]/i);
    const beach = beachMatch ? beachMatch[0].trim() : '';
    console.log('beach extracted:', beach);

    // ── Road: extract everything between "Road Updates" and next section ──
    // Collapse the full text and slice the Road Updates section
    const roadSectionMatch = fullText.match(/Road Updates?\s*([\s\S]*?)(?:Public Notice|Previous Orders|Other Beaches|Surf Report|$)/i);
    const roadSection = roadSectionMatch ? roadSectionMatch[1].trim() : '';
    console.log('road section raw:', roadSection.substring(0, 500));

    // Parse road cards from the section text
    // Format: "Road Delay DESCRIPTION: X DATE: Y TO Z"
    // Or just: "No Road Delay."
    const roadCards = [];

    if (/no road delay/i.test(roadSection)) {
      roadCards.push({ type: 'none' });
    } else if (/road delay/i.test(roadSection)) {
      // Extract all Road Delay cards
      // Each card looks like: "Road Delay DESCRIPTION: ... DATE: ..."
      const cardPattern = /Road Delay\s+(?:DESCRIPTION:\s*([^\n]*?)\s*)?(?:DATE:\s*([^\n]*?))?(?=Road Delay|$)/gi;
      let m;
      while ((m = cardPattern.exec(roadSection)) !== null) {
        roadCards.push({
          type: 'delay',
          desc: (m[1] || '').trim(),
          date: (m[2] || '').trim()
        });
      }
      // Fallback if pattern didn't match
      if (roadCards.length === 0) {
        const descM = roadSection.match(/DESCRIPTION:\s*([^\n]+)/i);
        const dateM = roadSection.match(/DATE:\s*([^\n]+)/i);
        roadCards.push({
          type: 'delay',
          desc: descM ? descM[1].trim() : '',
          date: dateM ? dateM[1].trim() : ''
        });
      }
    }

    console.log('roadCards:', JSON.stringify(roadCards));

    res.json({
      beach,
      roadCards,
      debug: { roadSection: roadSection.substring(0, 300) },
      fetchedAt: new Date().toISOString()
    });

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
