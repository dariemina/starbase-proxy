const express  = require('express');
const fetch    = require('node-fetch');
const cheerio  = require('cheerio');

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

// ── Helper JSON proxy ──────────────────────────────────────────────────────
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

// ── Scraper: starbase.texas.gov ───────────────────────────────────────────
app.get('/estado', async (req, res) => {
  try {
    const r    = await fetch('https://www.starbase.texas.gov/beach-road-access', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ExplorandoElEspacio/1.0)' }
    });
    const html = await r.text();
    const $    = cheerio.load(html);

    // Strategy: find every h2, then grab ALL text nodes until the next h2
    const sections = {};
    $('h2').each((_, el) => {
      const heading = $(el).text().trim();
      // Collect text from all following siblings until next h2
      let content = '';
      let node = $(el).next();
      while (node.length && node[0].name !== 'h2') {
        const t = node.text().trim();
        if (t) content += (content ? ' ' : '') + t;
        node = node.next();
      }
      // Also try: text directly inside parent section/div after the h2
      if (!content) {
        content = $(el).parent().clone().children('h2').remove().end().text().trim();
      }
      sections[heading.toLowerCase()] = content || '';
    });

    console.log('Sections found:', JSON.stringify(sections, null, 2));

    // Match by partial key
    const findSection = (keyword) => {
      const key = Object.keys(sections).find(k => k.includes(keyword));
      return key ? sections[key] : '';
    };

    const beach  = findSection('beach access') || findSection('beach');
    const road   = findSection('road update')  || findSection('road');

    res.json({
      beach:     beach || 'No disponible',
      road:      road  || 'No disponible',
      source:    'https://www.starbase.texas.gov/beach-road-access',
      fetchedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Scrape error:', err.message);
    res.status(502).json({ error: 'No se pudo obtener el estado.' });
  }
});

// ── Endpoints nerdpg ──────────────────────────────────────────────────────
app.get('/cierres',     (req, res) => proxyGet('https://starbase.nerdpg.live/api/json/roadClosures',       res));
app.get('/cierres/hoy', (req, res) => proxyGet('https://starbase.nerdpg.live/api/json/roadClosures/today', res));
app.get('/pruebas',     (req, res) => proxyGet('https://starbase.nerdpg.live/api/json/expectedTest',       res));
app.get('/notams',      (req, res) => proxyGet('https://starbase.nerdpg.live/api/json/notams',             res));

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Explorando el Espacio — Proxy Starbase' });
});

app.listen(PORT, () => console.log(`Proxy corriendo en puerto ${PORT}`));
