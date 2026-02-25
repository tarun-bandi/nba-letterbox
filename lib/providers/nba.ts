import {
  fetchTodaysGamesFromESPN,
  mapStatus as espnMapStatus,
  formatLiveStatus as espnFormatLiveStatus,
  getHomeCompetitor,
  getAwayCompetitor,
} from '@/lib/espn';
import type { SportProvider, ProviderGame, BoxScoreColumnDef, TeamComparisonStatDef } from './types';

const ESPN_ABBREVIATION_MAP: Record<string, string> = {
  NOP: 'no',
  UTA: 'utah',
};

const PLAYOFF_ROUND_LABELS: Record<string, string> = {
  first_round: 'Round 1',
  conf_semis: 'Conf Semis',
  conf_finals: 'Conf Finals',
  finals: 'Finals',
};

const BOX_SCORE_COLUMNS: BoxScoreColumnDef[] = [
  { key: 'minutes', label: 'MIN', width: 48, format: 'string' },
  { key: 'points', label: 'PTS', width: 40, format: 'number' },
  { key: 'rebounds', label: 'REB', width: 40, format: 'number' },
  { key: 'assists', label: 'AST', width: 40, format: 'number' },
  { key: 'steals', label: 'STL', width: 40, format: 'number' },
  { key: 'blocks', label: 'BLK', width: 40, format: 'number' },
  { key: 'turnovers', label: 'TO', width: 36, format: 'number' },
  { key: 'fgm', label: 'FG', width: 56, format: 'fraction', fractionKeys: { made: 'fgm', attempted: 'fga' } },
  { key: 'tpm', label: '3PT', width: 52, format: 'fraction', fractionKeys: { made: 'tpm', attempted: 'tpa' } },
  { key: 'ftm', label: 'FT', width: 48, format: 'fraction', fractionKeys: { made: 'ftm', attempted: 'fta' } },
  { key: 'plus_minus', label: '+/-', width: 40, format: 'plusMinus' },
];

const TEAM_COMPARISON_STATS: TeamComparisonStatDef[] = [
  { key: 'rebounds', label: 'Total Rebounds' },
  { key: 'assists', label: 'Assists' },
  { key: 'steals', label: 'Steals' },
  { key: 'blocks', label: 'Blocks' },
  { key: 'turnovers', label: 'Turnovers', lowerIsBetter: true },
  { key: 'fg_pct', label: 'FG%', pctKeys: { made: 'fgm', attempted: 'fga' } },
  { key: '3p_pct', label: '3P%', pctKeys: { made: 'tpm', attempted: 'tpa' } },
];

export const nbaProvider: SportProvider = {
  sport: 'nba',

  async fetchTodaysGames(): Promise<ProviderGame[]> {
    const events = await fetchTodaysGamesFromESPN();
    return events.map((event) => {
      const home = getHomeCompetitor(event);
      const away = getAwayCompetitor(event);
      const status = event.status;
      const state = status.type.state;

      return {
        id: parseInt(event.id, 10),
        date: event.date,
        homeTeamProviderId: home?.team.abbreviation ?? '',
        awayTeamProviderId: away?.team.abbreviation ?? '',
        homeScore: parseInt(home?.score ?? '0', 10),
        awayScore: parseInt(away?.score ?? '0', 10),
        status: state,
        period: status.period,
        clock: status.displayClock,
        postseason: event.season.type === 3,
        datetime: event.date,
        season: event.season.year,
      };
    });
  },

  mapStatus(status: string): 'scheduled' | 'live' | 'final' {
    // ESPN state strings: 'pre', 'in', 'post'
    return espnMapStatus(status as 'pre' | 'in' | 'post', status === 'post');
  },

  formatLiveStatus: espnFormatLiveStatus,

  getTeamLogoUrl(abbreviation: string): string {
    const espnAbbr = ESPN_ABBREVIATION_MAP[abbreviation.toUpperCase()] ?? abbreviation.toLowerCase();
    return `https://a.espncdn.com/i/teamlogos/nba/500/${espnAbbr}.png`;
  },

  getPeriodLabels(): string[] {
    return ['Q1', 'Q2', 'Q3', 'Q4'];
  },

  getPlayoffRoundLabel(round: string): string {
    return PLAYOFF_ROUND_LABELS[round] ?? round.replace(/_/g, ' ');
  },

  getBoxScoreColumns(): BoxScoreColumnDef[] {
    return BOX_SCORE_COLUMNS;
  },

  getTeamComparisonStats(): TeamComparisonStatDef[] {
    return TEAM_COMPARISON_STATS;
  },

  getConferences(): string[] {
    return ['East', 'West'];
  },
};
