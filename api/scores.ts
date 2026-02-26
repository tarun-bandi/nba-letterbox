import type { VercelRequest, VercelResponse } from '@vercel/node';

const ESPN_SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';

function getDefaultDateET(): string {
  return new Date()
    .toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    .replace(/-/g, '');
}

function getRequestedDate(req: VercelRequest): string {
  const raw = Array.isArray(req.query.date) ? req.query.date[0] : req.query.date;
  if (raw && /^\d{8}$/.test(raw)) return raw;
  return getDefaultDateET();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const date = getRequestedDate(req);

  try {
    const espnRes = await fetch(`${ESPN_SCOREBOARD_URL}?dates=${date}`);

    if (!espnRes.ok) {
      return res.status(espnRes.status).json({ error: `ESPN API error: ${espnRes.status}` });
    }

    const json = await espnRes.json();

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(json);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch from ESPN API' });
  }
}
