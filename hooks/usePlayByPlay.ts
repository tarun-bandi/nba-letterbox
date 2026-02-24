import { useQuery } from '@tanstack/react-query';

export interface PlayByPlayAction {
  actionNumber: number;
  clock: string;
  period: number;
  teamTricode: string;
  playerName: string;
  description: string;
  actionType: string;
  scoreHome: string;
  scoreAway: string;
  isFieldGoal: boolean;
  shotResult?: string;
}

interface PlayByPlayResponse {
  gameId: string;
  actions: PlayByPlayAction[];
}

async function fetchPlayByPlay(
  homeTeam: string,
  date: string,
): Promise<PlayByPlayResponse> {
  const res = await fetch(
    `/api/playbyplay?homeTeam=${encodeURIComponent(homeTeam)}&date=${encodeURIComponent(date)}`,
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Play-by-play fetch failed (${res.status})`);
  }
  return res.json();
}

export function usePlayByPlay(
  homeTeamAbbr: string | undefined,
  gameDate: string | undefined,
  gameStatus: string | undefined,
) {
  const isActiveGame = gameStatus === 'live' || gameStatus === 'final';

  return useQuery({
    queryKey: ['play-by-play', homeTeamAbbr, gameDate],
    queryFn: () => fetchPlayByPlay(homeTeamAbbr!, gameDate!),
    enabled: !!homeTeamAbbr && !!gameDate && isActiveGame,
    refetchInterval: gameStatus === 'live' ? 60_000 : false,
    staleTime: gameStatus === 'live' ? 0 : 5 * 60 * 1000,
  });
}
