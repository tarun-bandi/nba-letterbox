import type { VercelRequest, VercelResponse } from '@vercel/node';

const BDL_BASE = 'https://api.balldontlie.io/nba/v1';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.BALLDONTLIE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'BALLDONTLIE_API_KEY not configured' });
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const url = `${BDL_BASE}/games?dates[]=${today}&per_page=100`;

  try {
    const bdlRes = await fetch(url, {
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!bdlRes.ok) {
      return res.status(bdlRes.status).json({ error: `BDL API error: ${bdlRes.status}` });
    }

    const json = await bdlRes.json();

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(json);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch from BDL API' });
  }
}
