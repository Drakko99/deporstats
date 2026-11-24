import type { Market } from './types';

export const TOTAL_LINES = Array.from({ length: 30 }, (_, i) => (i + 1) / 4);
export const TEAM_LINES = Array.from({ length: 18 }, (_, i) => (i + 1) / 4);
export const ASIAN_LINES = Array.from({ length: 33 }, (_, i) => (i - 16) / 4);
export const EUROPEAN_LINES = [-3, -2, -1, 0, 1, 2, 3];
const GROUP_ORDER = ['Resultado · 90 minutos', 'Doble oportunidad', 'Empate devuelve', 'Ambos equipos marcan', 'Total de goles', 'Goles del local', 'Goles del visitante', 'Equipos que marcan', 'Portería a cero', 'Gana sin encajar', 'Hándicap asiático', 'Hándicap europeo · 3 vías', 'Marcador exacto', 'Número exacto de goles', 'Goles exactos por equipo', 'Goles pares o impares', 'Margen de victoria', 'Victoria de un equipo devuelve', 'Resultado y ambos marcan', 'Resultado y total de goles', 'Ambos marcan y total de goles'];
export const normalizeSearch = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replaceAll(',', '.');
export function groupMarkets(markets: Market[], search = ''): { title: string; markets: Market[] }[] {
  const words = normalizeSearch(search).trim().split(/\s+/).filter(Boolean), groups = new Map<string, Market[]>();
  for (const market of markets) {
    const title = market.group || 'Otros mercados';
    const text = normalizeSearch(`${title} ${market.label}`);
    if (!words.every(word => text.includes(word))) continue;
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title)!.push(market);
  }
  return [...groups].map(([title, markets]) => ({ title, markets })).sort((a, b) => (GROUP_ORDER.indexOf(a.title) < 0 ? 999 : GROUP_ORDER.indexOf(a.title)) - (GROUP_ORDER.indexOf(b.title) < 0 ? 999 : GROUP_ORDER.indexOf(b.title)));
}
