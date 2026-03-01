export const WEB_BASE = 'https://know-ball.vercel.app';

export function gameUrl(gameId: string) {
  return `${WEB_BASE}/game/${gameId}`;
}

export function userUrl(handle: string) {
  return `${WEB_BASE}/user/${handle}`;
}

export function listUrl(listId: string) {
  return `${WEB_BASE}/list/${listId}`;
}

export function inviteUrl(handle: string) {
  return `${WEB_BASE}/user/${handle}?ref=invite`;
}
