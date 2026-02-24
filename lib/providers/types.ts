import type { Sport } from '@/types/database';

export type { Sport };

export interface BoxScoreColumnDef {
  key: string;
  label: string;
  width: number;
  format?: 'fraction' | 'plusMinus' | 'string' | 'number';
  /** For format: 'fraction', the keys to use for made/attempted */
  fractionKeys?: { made: string; attempted: string };
}

export interface TeamComparisonStatDef {
  key: string;
  label: string;
  /** If true, lower is better (e.g. turnovers) */
  lowerIsBetter?: boolean;
  /** If provided, format as percentage from made/attempted keys */
  pctKeys?: { made: string; attempted: string };
}

export interface ProviderGame {
  id: number | string;
  date: string;
  homeTeamProviderId: number | string;
  awayTeamProviderId: number | string;
  homeScore: number;
  awayScore: number;
  status: string;
  period: number;
  clock: string;
  postseason: boolean;
  datetime: string | null;
  season: number;
}

export interface BoxScoreCategory {
  key: string;
  label: string;
  columns: BoxScoreColumnDef[];
  /** Key in stats JSONB used to determine if a player belongs to this category */
  filterKey: string;
  /** Key used for default sort (descending) */
  sortKey: string;
}

export interface SportProvider {
  sport: Sport;

  /** Fetch today's games from the external API */
  fetchTodaysGames(): Promise<ProviderGame[]>;

  /** Map raw status string to scheduled/live/final */
  mapStatus(status: string): 'scheduled' | 'live' | 'final';

  /** Format live status into human-readable label (e.g. "Q3 5:42", "Halftime") */
  formatLiveStatus(status: string, period: number, clock: string): string | null;

  /** Get ESPN CDN logo URL for a team */
  getTeamLogoUrl(abbreviation: string): string;

  /** Period labels: ['Q1','Q2','Q3','Q4'] for both NBA/NFL */
  getPeriodLabels(): string[];

  /** Human-readable label for a playoff round string */
  getPlayoffRoundLabel(round: string): string;

  /** Column definitions for box score table (flat, used by NBA) */
  getBoxScoreColumns(): BoxScoreColumnDef[];

  /** Category-grouped box score columns (used by NFL). Returns null for sports that use flat layout. */
  getBoxScoreCategories?(): BoxScoreCategory[];

  /** Stat definitions for team comparison section */
  getTeamComparisonStats(): TeamComparisonStatDef[];

  /** Conferences for this sport (used in team filtering) */
  getConferences(): string[];
}
