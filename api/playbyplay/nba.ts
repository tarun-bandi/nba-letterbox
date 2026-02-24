import type { VercelRequest, VercelResponse } from '@vercel/node';

const SCOREBOARD_URL =
  'https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json';
const PBP_URL_PREFIX =
  'https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_';

interface NbaAction {
  actionNumber: number;
  clock: string;
  period: number;
  teamTricode: string;
  playerNameI: string;
  description: string;
  actionType: string;
  scoreHome: string;
  scoreAway: string;
  isFieldGoal: number;
  shotResult?: string;
}

function parseClock(iso: string): string {
  // "PT05M30.00S" → "5:30"
  const match = iso.match(/PT(\d+)M([\d.]+)S/);
  if (!match) return iso;
  const min = parseInt(match[1], 10);
  const sec = Math.floor(parseFloat(match[2]));
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { homeTeam, date } = req.query;

  if (!homeTeam || !date || typeof homeTeam !== 'string' || typeof date !== 'string') {
    return res.status(400).json({ error: 'Missing required query params: homeTeam, date' });
  }

  try {
    // 1. Fetch NBA.com scoreboard to find the game ID
    const scoreboardRes = await fetch(SCOREBOARD_URL, {
      headers: { 'User-Agent': 'nba-letterbox/1.0' },
    });

    if (!scoreboardRes.ok) {
      return res.status(502).json({ error: `NBA scoreboard returned ${scoreboardRes.status}` });
    }

    const scoreboard = await scoreboardRes.json();
    const games = scoreboard?.scoreboard?.games ?? [];

    // Match by home team tricode and date (gameCode starts with "YYYYMMDD/")
    const target = homeTeam.toUpperCase();
    const dateCompact = date.replace(/-/g, '');

    const matched = games.find(
      (g: any) =>
        g.homeTeam?.teamTricode === target &&
        g.gameCode?.startsWith(dateCompact + '/'),
    );

    if (!matched) {
      return res.status(404).json({
        error: 'Game not found on NBA.com scoreboard',
        hint: 'Play-by-play is only available for today\'s games',
      });
    }

    const nbaGameId: string = matched.gameId;

    // 2. Fetch play-by-play
    const pbpRes = await fetch(`${PBP_URL_PREFIX}${nbaGameId}.json`, {
      headers: { 'User-Agent': 'nba-letterbox/1.0' },
    });

    if (!pbpRes.ok) {
      return res.status(502).json({ error: `NBA play-by-play returned ${pbpRes.status}` });
    }

    const pbpData = await pbpRes.json();
    const rawActions: NbaAction[] = pbpData?.game?.actions ?? [];

    // 3. Simplify actions
    const actions = rawActions.map((a) => ({
      actionNumber: a.actionNumber,
      clock: parseClock(a.clock),
      period: a.period,
      teamTricode: a.teamTricode || '',
      playerName: a.playerNameI || '',
      description: a.description,
      actionType: a.actionType,
      scoreHome: a.scoreHome,
      scoreAway: a.scoreAway,
      isFieldGoal: !!a.isFieldGoal,
      shotResult: a.shotResult,
    }));

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json({ gameId: nbaGameId, actions });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch play-by-play data' });
  }
}
