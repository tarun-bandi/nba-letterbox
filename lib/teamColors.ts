const NBA_TEAM_COLORS: Record<string, string> = {
  ATL: '#E03A3E',   // Hawks red
  BOS: '#007A33',   // Celtics green
  BKN: '#FFFFFF',   // Nets white (black is invisible on dark bg)
  CHA: '#00788C',   // Hornets teal
  CHI: '#CE1141',   // Bulls red
  CLE: '#6F263D',   // Cavaliers wine
  DAL: '#00538C',   // Mavericks blue
  DEN: '#FEC524',   // Nuggets gold (navy too dark)
  DET: '#C8102E',   // Pistons red
  GSW: '#1D428A',   // Warriors royal blue
  HOU: '#CE1141',   // Rockets red
  IND: '#FDBB30',   // Pacers gold (navy too dark/duplicate)
  LAC: '#C8102E',   // Clippers red
  LAL: '#552583',   // Lakers purple
  MEM: '#5D76A9',   // Grizzlies beale street blue
  MIA: '#98002E',   // Heat red
  MIL: '#00471B',   // Bucks green
  MIN: '#236192',   // Timberwolves blue (navy too dark)
  NOP: '#B4975A',   // Pelicans gold
  NYK: '#F58426',   // Knicks orange
  OKC: '#007AC1',   // Thunder blue
  ORL: '#0077C0',   // Magic blue
  PHI: '#006BB6',   // 76ers blue
  PHX: '#E56020',   // Suns orange
  POR: '#E03A3E',   // Trail Blazers red
  SAC: '#5A2D81',   // Kings purple
  SAS: '#C4CED4',   // Spurs silver
  TOR: '#CE1141',   // Raptors red
  UTA: '#F9A01B',   // Jazz yellow
  WAS: '#002B5C',   // Wizards navy
};

const NFL_TEAM_COLORS: Record<string, string> = {
  // AFC East
  BUF: '#00338D',   // Bills blue
  MIA: '#008E97',   // Dolphins teal
  NE:  '#002244',   // Patriots navy
  NYJ: '#125740',   // Jets green
  // AFC North
  BAL: '#241773',   // Ravens purple
  CIN: '#FB4F14',   // Bengals orange
  CLE: '#FF3C00',   // Browns orange
  PIT: '#FFB612',   // Steelers gold
  // AFC South
  HOU: '#03202F',   // Texans navy
  IND: '#002C5F',   // Colts blue
  JAX: '#006778',   // Jaguars teal
  TEN: '#4B92DB',   // Titans blue
  // AFC West
  DEN: '#FB4F14',   // Broncos orange
  KC:  '#E31837',   // Chiefs red
  LV:  '#A5ACAF',   // Raiders silver
  LAC: '#0080C6',   // Chargers powder blue
  // NFC East
  DAL: '#041E42',   // Cowboys navy
  NYG: '#0B2265',   // Giants blue
  PHI: '#004C54',   // Eagles midnight green
  WAS: '#5A1414',   // Commanders burgundy
  // NFC North
  CHI: '#0B162A',   // Bears navy
  DET: '#0076B6',   // Lions blue
  GB:  '#203731',   // Packers green
  MIN: '#4F2683',   // Vikings purple
  // NFC South
  ATL: '#A71930',   // Falcons red
  CAR: '#0085CA',   // Panthers blue
  NO:  '#D3BC8D',   // Saints gold
  TB:  '#D50A0A',   // Buccaneers red
  // NFC West
  ARI: '#97233F',   // Cardinals red
  LAR: '#003594',   // Rams blue
  SF:  '#AA0000',   // 49ers red
  SEA: '#002244',   // Seahawks navy
};

const FALLBACK_PALETTE = [
  '#E03A3E',
  '#1D428A',
  '#007A33',
  '#5A2D81',
  '#0E2240',
  '#007AC1',
  '#C8102E',
  '#C9A84C',
];

/**
 * Lighten dark accent colors so abbreviation text stays readable on a dark background.
 * Blends toward white when relative luminance falls below the threshold.
 */
export function ensureTextContrast(hex: string): string {
  const clean = hex.replace('#', '');
  const normalized =
    clean.length === 3
      ? clean.split('').map((c) => c + c).join('')
      : clean.padEnd(6, '0');

  let r = Number.parseInt(normalized.slice(0, 2), 16);
  let g = Number.parseInt(normalized.slice(2, 4), 16);
  let b = Number.parseInt(normalized.slice(4, 6), 16);

  // sRGB relative luminance
  const toLinear = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

  // If luminance is already bright enough, return as-is
  if (luminance >= 0.08) return hex;

  // Blend toward white until we hit the target luminance
  const target = 0.08;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    const mr = r + (255 - r) * mid;
    const mg = g + (255 - g) * mid;
    const mb = b + (255 - b) * mid;
    const ml = 0.2126 * toLinear(mr) + 0.7152 * toLinear(mg) + 0.0722 * toLinear(mb);
    if (ml < target) lo = mid;
    else hi = mid;
  }

  const t = (lo + hi) / 2;
  const fr = Math.round(r + (255 - r) * t);
  const fg = Math.round(g + (255 - g) * t);
  const fb = Math.round(b + (255 - b) * t);

  return `#${fr.toString(16).padStart(2, '0')}${fg.toString(16).padStart(2, '0')}${fb.toString(16).padStart(2, '0')}`;
}


export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const normalized =
    clean.length === 3
      ? clean.split('').map((c) => c + c).join('')
      : clean.padEnd(6, '0');

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

export function getTeamAccentColor(abbreviation?: string, sport?: string): string {
  const abbr = (abbreviation ?? '').toUpperCase().trim();
  if (!abbr) return '#6B7280';
  if (sport === 'nfl' && abbr in NFL_TEAM_COLORS) return NFL_TEAM_COLORS[abbr];
  if (abbr in NBA_TEAM_COLORS) return NBA_TEAM_COLORS[abbr];
  if (abbr in NFL_TEAM_COLORS) return NFL_TEAM_COLORS[abbr];

  let hash = 0;
  for (let i = 0; i < abbr.length; i++) {
    hash = (hash << 5) - hash + abbr.charCodeAt(i);
    hash |= 0;
  }

  const idx = Math.abs(hash) % FALLBACK_PALETTE.length;
  return FALLBACK_PALETTE[idx];
}
