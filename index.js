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

    // Grab the text after each h2 heading
    let beach  = '';
    let road   = '';
    let notice = '';

    $('h2').each((_, el) => {
      const heading = $(el).text().trim().toLowerCase();
      // The content is the next sibling paragraph or the text directly after
      const next = $(el).next();
      const text = next.text().trim() || $(el).parent().text().replace($(el).text(), '').trim();

      if (heading.includes('beach access'))  beach  = text;
      if (heading.includes('road update'))   road   = text;
      if (heading.includes('public notice')) notice = text;
    });

    // Fallback: search all text nodes for known patterns
    if (!beach) {
      const bodyText = $('body').text();
      const beachMatch  = bodyText.match(/Boca Chica Beach[^\.\n]*/i);
      const roadMatch   = bodyText.match(/No Road Delay[^\.\n]*|Road Delay[^\.\n]*/i);
      const noticeMatch = bodyText.match(/No public notices[^\.\n]*|Public Notice[^\.\n]*/i);
      if (beachMatch)  beach  = beachMatch[0].trim();
      if (roadMatch)   road   = roadMatch[0].trim();
      if (noticeMatch) notice = noticeMatch[0].trim();
    }

    res.json({
      beach:  beach  || 'No disponible',
      road:   road   || 'No disponible',
      notice: notice || 'Sin avisos públicos',
      source: 'https://www.starbase.texas.gov/beach-road-access',
      fetchedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Scrape error:', err.message);
    res.status(502).json({ error: 'No se pudo obtener el estado de Starbase.' });
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
