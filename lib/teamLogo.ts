const ESPN_ABBREVIATION_MAP: Record<string, string> = {
  NOP: 'no',
  UTA: 'utah',
};

export function getTeamLogoUrl(abbreviation: string): string {
  const espnAbbr = ESPN_ABBREVIATION_MAP[abbreviation.toUpperCase()] ?? abbreviation.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/nba/500/${espnAbbr}.png`;
}
