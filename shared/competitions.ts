export const competitions = [
  { id: 'spain:laliga', name: 'LaLiga', country: 'España', code: 'SP1', color: '#ff875f' },
  { id: 'england:premier-league', name: 'Premier League', country: 'Inglaterra', code: 'E0', color: '#b79bff' },
  { id: 'germany:bundesliga', name: 'Bundesliga', country: 'Alemania', code: 'D1', color: '#ff748d' },
  { id: 'italy:serie-a', name: 'Serie A', country: 'Italia', code: 'I1', color: '#78a9ff' },
  { id: 'france:ligue-1', name: 'Ligue 1', country: 'Francia', code: 'F1', color: '#86dfc6' },
  { id: 'international-clubs:uefa-champions-league', name: 'Champions League', country: 'Europa', code: '', color: '#efcf89' },
] as const;
/** Normaliza grafía; no aplica coincidencias aproximadas entre equipos distintos. */
export const teamKey = (name: string) => name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
