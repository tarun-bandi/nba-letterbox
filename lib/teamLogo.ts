import type { Sport } from '@/types/database';
import { getProvider } from '@/lib/providers';

export function getTeamLogoUrl(abbreviation: string, sport: Sport = 'nba'): string {
  return getProvider(sport).getTeamLogoUrl(abbreviation);
}
