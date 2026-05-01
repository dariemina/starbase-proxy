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

    // ── Beach status ──────────────────────────────────────────────────────
    // Find h2 that contains "Beach Access" and get next sibling text
    let beach = '';
    $('h2, h3').each((_, el) => {
      if (/beach access/i.test($(el).text())) {
        beach = $(el).next().text().trim() || $(el).nextAll('p,div').first().text().trim();
      }
    });

    // ── Road updates ──────────────────────────────────────────────────────
    // The page has cards with: title "Road Delay", description, and date
    // Strategy: find the h2 "Road Updates", then collect ALL content until next h2
    let roadCards = [];
    let inRoadSection = false;

    $('h2, h3').each((_, el) => {
      const txt = $(el).text().trim().toLowerCase();
      if (txt.includes('road update')) {
        inRoadSection = true;
        // Collect siblings after this h2
        let node = $(el).next();
        while (node.length) {
          if (node[0].name === 'h2' || node[0].name === 'h3') break;

          const nodeText = node.text().trim();

          // "No Road Delay" → simple text node
          if (/no road delay/i.test(nodeText)) {
            roadCards.push({ type: 'none', text: nodeText });
          }

          // Card structure: look for elements containing "Road Delay" title
          // The card has nested divs — find by scanning inner structure
          node.find('*').addBack().each((__, inner) => {
            const innerText = $(inner).text().trim();
            // Title line is just "Road Delay" (short)
            if (/^road delay$/i.test(innerText)) {
              // Now get description and date from siblings or parent
              const parent = $(inner).parent();
              const fullCardText = parent.text().trim();
              // Parse: "Road Delay DESCRIPTION: X DATE: Y TO Z"
              const descMatch = fullCardText.match(/description[:\s]+([^\n]+?)(?=date[:\s]|$)/i);
              const dateMatch = fullCardText.match(/date[:\s]+([^\n]+)/i);
              if (descMatch || dateMatch) {
                roadCards.push({
                  type:  'delay',
                  desc:  descMatch ? descMatch[1].trim() : '',
                  date:  dateMatch ? dateMatch[1].trim() : ''
                });
              }
            }
          });

          node = node.next();
        }
      }
    });

    // Deduplicate cards (same desc+date)
    const seen = new Set();
    roadCards = roadCards.filter(c => {
      const key = JSON.stringify(c);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // If nothing found, try raw text fallback
    if (roadCards.length === 0) {
      const bodyText = $('body').text();
      if (/no road delay/i.test(bodyText)) {
        roadCards.push({ type: 'none', text: 'No Road Delay.' });
      } else if (/road delay/i.test(bodyText)) {
        const m = bodyText.match(/road delay[\s\S]{0,300}/i);
        roadCards.push({ type: 'raw', text: m ? m[0].trim().substring(0,200) : 'Road Delay activo' });
      }
    }

    console.log('beach:', beach);
    console.log('roadCards:', JSON.stringify(roadCards));

    res.json({
      beach:     beach     || 'No disponible',
      roadCards: roadCards,
      source:    'https://www.starbase.texas.gov/beach-road-access',
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
