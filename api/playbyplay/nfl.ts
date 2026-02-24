import type { VercelRequest, VercelResponse } from '@vercel/node';

const ESPN_NFL_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

interface EspnPlay {
  id: string;
  sequenceNumber: string;
  clock: { displayValue: string };
  period: { number: number };
  team?: { abbreviation: string };
  text: string;
  type: { text: string };
  scoringPlay: boolean;
  homeScore: number;
  awayScore: number;
  participants?: Array<{ athlete?: { displayName: string } }>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { gameId } = req.query;

  if (!gameId || typeof gameId !== 'string') {
    return res.status(400).json({ error: 'Missing required query param: gameId' });
  }

  try {
    // ESPN game summary includes play-by-play
    const summaryRes = await fetch(
      `${ESPN_NFL_BASE}/summary?event=${gameId}`,
      { headers: { 'User-Agent': 'nba-letterbox/1.0' } },
    );

    if (!summaryRes.ok) {
      return res.status(502).json({ error: `ESPN summary returned ${summaryRes.status}` });
    }

    const summaryData = await summaryRes.json();

    // Extract drives → plays
    const drives = summaryData?.drives?.previous ?? [];
    const currentDrive = summaryData?.drives?.current;
    if (currentDrive) drives.push(currentDrive);

    const actions: any[] = [];
    let actionNumber = 0;

    for (const drive of drives) {
      for (const play of drive.plays ?? []) {
        actionNumber++;
        const playerName = play.participants?.[0]?.athlete?.displayName ?? '';

        actions.push({
          actionNumber,
          clock: play.clock?.displayValue ?? '',
          period: play.period?.number ?? 0,
          teamTricode: play.team?.abbreviation ?? '',
          playerName,
          description: play.text ?? '',
          actionType: play.type?.text ?? '',
          scoreHome: String(play.homeScore ?? 0),
          scoreAway: String(play.awayScore ?? 0),
          isFieldGoal: play.scoringPlay ?? false,
          shotResult: play.scoringPlay ? 'Made' : undefined,
        });
      }
    }

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json({ gameId, actions });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch NFL play-by-play data' });
  }
}
