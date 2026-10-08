import type { CannonKind } from '../data/cannons';

export const COIN = `<svg class="ico" viewBox="0 0 32 32"><ellipse cx="16" cy="18" rx="13" ry="11" fill="#c98a12"/><ellipse cx="16" cy="15" rx="13" ry="11" fill="#ffcf3a"/><ellipse cx="16" cy="15" rx="8.5" ry="7" fill="none" stroke="#e8a91a" stroke-width="2.4"/><path d="M9 10q4-4 10-2" stroke="#fff6c4" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>`;

export const GEM = `<svg class="ico" viewBox="0 0 32 32"><path d="M4 12 10 5h12l6 7-12 16z" fill="#e0369f"/><path d="M4 12h24L16 28z" fill="#ff5fd2"/><path d="M10 5l-2 7h16l-2-7z" fill="#ff9be6"/><path d="M12 12l4 16 4-16" fill="#ff7ddc"/></svg>`;

const WOOD = '#7a4a2a';

export function cannonSvg(kind: CannonKind): string {
  switch (kind) {
    case 'havan':
      return `<svg viewBox="0 0 64 64"><ellipse cx="32" cy="50" rx="22" ry="7" fill="${WOOD}"/><rect x="12" y="40" width="40" height="10" rx="3" fill="#8a5a33"/><g transform="rotate(-35 32 38)"><rect x="18" y="22" width="28" height="22" rx="6" fill="#2a2a33"/><rect x="14" y="18" width="36" height="8" rx="3" fill="#3a3a44"/><ellipse cx="32" cy="18" rx="14" ry="4" fill="#111"/></g></svg>`;
    case 'zipkin':
      return `<svg viewBox="0 0 64 64"><rect x="10" y="38" width="26" height="14" rx="3" fill="${WOOD}"/><path d="M8 30 Q22 18 36 30" stroke="#5a3b22" stroke-width="4" fill="none"/><rect x="10" y="29" width="40" height="4" rx="2" fill="#ccb27a"/><path d="M50 24 L60 31 L50 38 Z" fill="#e2b23a"/><path d="M14 31 l-6 -5 M14 31 l-6 5" stroke="#d9c79a" stroke-width="2"/></svg>`;
    case 'zincir':
      return `<svg viewBox="0 0 64 64"><circle cx="18" cy="32" r="11" fill="#5f6770"/><circle cx="46" cy="32" r="11" fill="#5f6770"/><circle cx="15" cy="28" r="3.5" fill="#a9b2bc"/><circle cx="43" cy="28" r="3.5" fill="#a9b2bc"/><path d="M28 32 h8" stroke="#8a929c" stroke-width="5" stroke-dasharray="3 2"/></svg>`;
    case 'karronat':
      return `<svg viewBox="0 0 64 64"><rect x="8" y="38" width="34" height="14" rx="3" fill="${WOOD}"/><circle cx="16" cy="52" r="5" fill="#4b2c1a"/><circle cx="34" cy="52" r="5" fill="#4b2c1a"/><g transform="rotate(-18 30 34)"><rect x="14" y="22" width="34" height="20" rx="8" fill="#2b2b2f"/><rect x="44" y="21" width="8" height="22" rx="3" fill="#d4a43c"/></g></svg>`;
    case 'uzun':
      return `<svg viewBox="0 0 64 64"><rect x="6" y="40" width="28" height="12" rx="3" fill="${WOOD}"/><circle cx="12" cy="52" r="5" fill="#4b2c1a"/><circle cx="28" cy="52" r="5" fill="#4b2c1a"/><g transform="rotate(-22 24 36)"><rect x="8" y="30" width="52" height="11" rx="5" fill="#3b4654"/><rect x="55" y="29" width="6" height="13" rx="2" fill="#d4a43c"/></g></svg>`;
    default:
      return `<svg viewBox="0 0 64 64"><rect x="8" y="38" width="32" height="13" rx="3" fill="${WOOD}"/><circle cx="15" cy="52" r="5" fill="#4b2c1a"/><circle cx="33" cy="52" r="5" fill="#4b2c1a"/><g transform="rotate(-22 26 34)"><rect x="10" y="26" width="42" height="14" rx="6" fill="#2b2b30"/><rect x="48" y="25" width="7" height="16" rx="2" fill="#d4a43c"/><circle cx="12" cy="33" r="5" fill="#2b2b30"/></g></svg>`;
  }
}

export const ABILITY_ICON: Record<string, string> = {
  sprint: '💨', gust: '🌬️', broadside: '💥', ram: '🐏', barrels: '🛢️', repair: '🔧', fog: '🌫️',
};
