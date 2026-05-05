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

    // ── Beach ─────────────────────────────────────────────
    const beachClosed = /Boca Chica Beach is currently closed/i.test(text)
                     || /Beach Closure/i.test(text.substring(0, 1000));
    const beach = beachClosed
      ? 'Boca Chica Beach is currently closed.'
      : 'Boca Chica Beach is open.';
    console.log('beach:', beach);

    // ── Active delay banner (top of page, before nav) ─────
    // The top banner appears before "function setupMarquee"
    const topChunk = text.substring(0, 1500);
    const roadDelayActive = /Road Delay/i.test(topChunk) && !/Beach Closure/i.test(topChunk.substring(0, 200));
    console.log('roadDelayActive:', roadDelayActive, '| topChunk:', topChunk.substring(0, 300));

    // ── Scheduled delays ──────────────────────────────────
    // Find the "Beach & Road Access" widget section on homepage
    // It contains: "Road Delay No road delays. Description: X Date: Y ..."
    // After collapsing whitespace the text looks like:
    // "... Road Delay No road delays. Description: Production to Pad Date: May. 5 11:59 PM to May. 6 4:00 AM Description: Pad to Production Date: May. 6 11:59 PM to May. 7 4:00 AM View All ..."
    
    const roadWidgetM = text.match(/Road Delay\s+No road delays\.?\s*([\s\S]*?)View All/i)
                     || text.match(/Road Delay\s*([\s\S]*?)View All/i);
    const roadWidget  = roadWidgetM ? roadWidgetM[1].trim() : '';
    console.log('roadWidget:', roadWidget.substring(0, 400));

    const scheduledDelays = [];

    if (roadWidget) {
      // Match: "Description: <text> Date: <date until next Description or end>"
      // Date format: "May. 5 11:59 PM to May. 6 4:00 AM"
      const re = /Description:\s*(.+?)\s+Date:\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[^D]*?)(?=Description:|$)/gi;
      let m;
      while ((m = re.exec(roadWidget)) !== null) {
        const desc = m[1].trim();
        const date = m[2].trim().replace(/\s+/g, ' ');
        if (desc) scheduledDelays.push({ desc, date });
      }

      // Fallback: simpler split if above didn't work
      if (scheduledDelays.length === 0) {
        const descMatches = [...roadWidget.matchAll(/Description:\s*(.+?)(?=Date:|Description:|$)/gi)];
        const dateMatches = [...roadWidget.matchAll(/Date:\s*(.+?)(?=Description:|$)/gi)];
        for (let i = 0; i < descMatches.length; i++) {
          scheduledDelays.push({
            desc: descMatches[i][1].trim(),
            date: dateMatches[i] ? dateMatches[i][1].trim() : ''
          });
        }
      }
    }

    console.log('scheduledDelays:', JSON.stringify(scheduledDelays));

    res.json({ beach, roadDelayActive, scheduledDelays, fetchedAt: new Date().toISOString() });

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
