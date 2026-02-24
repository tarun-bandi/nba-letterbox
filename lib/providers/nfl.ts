import { Platform } from 'react-native';
import type { SportProvider, ProviderGame, BoxScoreColumnDef, TeamComparisonStatDef } from './types';

const ESPN_NFL_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

const PLAYOFF_ROUND_LABELS: Record<string, string> = {
  wild_card: 'Wild Card',
  divisional: 'Divisional',
  conf_championship: 'Championship',
  super_bowl: 'Super Bowl',
};

const BOX_SCORE_COLUMNS: BoxScoreColumnDef[] = [
  // Passing
  { key: 'passing_cmp', label: 'CMP', width: 44, format: 'number' },
  { key: 'passing_att', label: 'ATT', width: 44, format: 'number' },
  { key: 'passing_yds', label: 'P.YDS', width: 52, format: 'number' },
  { key: 'passing_tds', label: 'P.TD', width: 44, format: 'number' },
  { key: 'passing_int', label: 'INT', width: 40, format: 'number' },
  // Rushing
  { key: 'rushing_car', label: 'CAR', width: 44, format: 'number' },
  { key: 'rushing_yds', label: 'R.YDS', width: 52, format: 'number' },
  { key: 'rushing_tds', label: 'R.TD', width: 44, format: 'number' },
  // Receiving
  { key: 'receiving_rec', label: 'REC', width: 44, format: 'number' },
  { key: 'receiving_yds', label: 'REC.YDS', width: 60, format: 'number' },
  { key: 'receiving_tds', label: 'REC.TD', width: 52, format: 'number' },
  // Defense
  { key: 'tackles', label: 'TCKL', width: 48, format: 'number' },
  { key: 'sacks', label: 'SACK', width: 48, format: 'number' },
  { key: 'def_int', label: 'D.INT', width: 48, format: 'number' },
];

const TEAM_COMPARISON_STATS: TeamComparisonStatDef[] = [
  { key: 'total_yards', label: 'Total Yards' },
  { key: 'passing_yds', label: 'Passing Yards' },
  { key: 'rushing_yds', label: 'Rushing Yards' },
  { key: 'turnovers', label: 'Turnovers', lowerIsBetter: true },
  { key: 'first_downs', label: 'First Downs' },
  { key: 'third_down_pct', label: '3rd Down %', pctKeys: { made: 'third_down_conv', attempted: 'third_down_att' } },
  { key: 'penalties', label: 'Penalties', lowerIsBetter: true },
];

interface EspnCompetitor {
  id: string;
  homeAway: 'home' | 'away';
  team: { id: string; abbreviation: string };
  score: string;
}

interface EspnCompetition {
  id: string;
  date: string;
  status: {
    type: { name: string; completed: boolean; detail: string };
    period: number;
    displayClock: string;
  };
  competitors: EspnCompetitor[];
  season: { year: number; type: number };
}

interface EspnEvent {
  id: string;
  date: string;
  season: { year: number; type: number };
  competitions: EspnCompetition[];
}

export const nflProvider: SportProvider = {
  sport: 'nfl',

  async fetchTodaysGames(): Promise<ProviderGame[]> {
    try {
      const url = Platform.OS === 'web'
        ? '/api/scores/nfl'
        : `${ESPN_NFL_BASE}/scoreboard`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const json = await res.json();

      const events: EspnEvent[] = json.events ?? [];
      return events.map((event) => {
        const comp = event.competitions[0];
        const home = comp.competitors.find((c) => c.homeAway === 'home')!;
        const away = comp.competitors.find((c) => c.homeAway === 'away')!;
        const isPostseason = (event.season?.type ?? comp.season?.type) === 3;

        return {
          id: parseInt(event.id, 10),
          date: event.date,
          homeTeamProviderId: parseInt(home.team.id, 10),
          awayTeamProviderId: parseInt(away.team.id, 10),
          homeScore: parseInt(home.score, 10) || 0,
          awayScore: parseInt(away.score, 10) || 0,
          status: comp.status.type.detail,
          period: comp.status.period,
          clock: comp.status.displayClock,
          postseason: isPostseason,
          datetime: event.date,
          season: event.season?.year ?? comp.season?.year ?? new Date().getFullYear(),
        };
      });
    } catch (err) {
      console.warn('Failed to fetch NFL games:', err);
      return [];
    }
  },

  mapStatus(status: string): 'scheduled' | 'live' | 'final' {
    const s = status.toLowerCase();
    if (s.includes('final')) return 'final';
    if (s.includes('in progress') || /\d(st|nd|rd|th)/.test(s) || s.includes('halftime') || s.includes('overtime')) {
      return 'live';
    }
    return 'scheduled';
  },

  formatLiveStatus(status: string, period: number, clock: string): string | null {
    const mapped = this.mapStatus(status);
    if (mapped !== 'live') return null;

    const s = status.toLowerCase();
    if (s.includes('halftime')) return 'Halftime';
    if (s.includes('end') && period > 0) {
      const label = period <= 4 ? `Q${period}` : `OT${period - 4}`;
      return `End ${label}`;
    }

    if (period > 0) {
      const label = period <= 4 ? `Q${period}` : `OT${period - 4}`;
      return clock ? `${label} ${clock}` : label;
    }

    return 'In Progress';
  },

  getTeamLogoUrl(abbreviation: string): string {
    return `https://a.espncdn.com/i/teamlogos/nfl/500/${abbreviation.toLowerCase()}.png`;
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
    return ['AFC', 'NFC'];
  },
};
