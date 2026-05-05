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
    res.status(502).json({ error: 'No se pudieron obtener los datos.' });
  }
}

app.get('/estado', async (req, res) => {
  try {
    const r    = await fetch('https://www.starbase.texas.gov/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ExplorandoElEspacio/1.0)' }
    });
    const html = await r.text();
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    // ── Beach ─────────────────────────────────────────────────────────────
    // The header banner says "Boca Chica Beach is currently closed." or "open"
    // Also check "Beach Closure" in the notification bar
    let beach = '';
    const bannerClosed = /Boca Chica Beach is currently closed/i.test(text);
    const bannerOpen   = /Boca Chica Beach is (?:currently )?open/i.test(text);
    const hasBeachClosure = /Beach Closure/i.test(text);

    if (bannerClosed || (hasBeachClosure && !bannerOpen)) {
      beach = 'Boca Chica Beach is currently closed.';
    } else if (bannerOpen) {
      beach = 'Boca Chica Beach is open.';
    } else {
      beach = 'Boca Chica Beach is open.'; // default safe assumption
    }
    console.log('beach:', beach);

    // ── Road section ──────────────────────────────────────────────────────
    // From homepage "Beach & Road Access" section:
    // "Road Delay No road delays. Description: X Date: Y Description: Z Date: W"
    // OR active: "Road Delay Description: X Date: Y"
    const roadSectionM = text.match(/Beach\s*&\s*Road Access\s*([\s\S]*?)(?:View All|Building Permits)/i);
    const roadSection  = roadSectionM ? roadSectionM[1].trim() : '';
    console.log('roadSection:', roadSection.substring(0, 600));

    // Check if there's an ACTIVE delay right now (header banner)
    const activeDelayBanner = /Road Delay[\s\S]{0,200}?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.\s*\d+/i.test(
      text.substring(0, text.indexOf('function setupMarquee') > -1 ? text.indexOf('function setupMarquee') : 500)
    );
    console.log('activeDelayBanner:', activeDelayBanner);

    // Extract all Description/Date pairs from road section
    const scheduledDelays = [];
    const cardRegex = /Description[:\s]+([^\n]+?)\s+Date[:\s]+([^\n]+?)(?=Description|Road Delay|No road|View All|$)/gi;
    let m;
    while ((m = cardRegex.exec(roadSection)) !== null) {
      scheduledDelays.push({
        desc: m[1].trim(),
        date: m[2].trim()
      });
    }
    console.log('scheduledDelays:', JSON.stringify(scheduledDelays));

    // Active road delay = banner says so OR current time falls within a scheduled window
    // We pass both active status and scheduled list to the widget
    const roadDelayActive = activeDelayBanner || /Road Delay(?!\s*No road)/i.test(
      text.substring(text.search(/Beach\s*&\s*Road Access/i), text.search(/View All/i))
    );

    res.json({
      beach,
      roadDelayActive: scheduledDelays.length > 0 && activeDelayBanner,
      scheduledDelays,
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
