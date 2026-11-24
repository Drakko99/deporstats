import type { HistoricalMatch, Triple } from '../shared/types';
import { competitions } from '../shared/competitions';
import { validateHistory } from './model';

/** CSV con comillas, comas escapadas y CRLF; las filas incompletas nunca equivalen a 0-0. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], value = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (ch === ',' && !quoted) { row.push(value); value = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(value); if (row.some(x => x.trim())) rows.push(row); row = []; value = ''; }
    else value += ch;
  }
  if (quoted) throw new Error('CSV con comillas sin cerrar.');
  row.push(value); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}
function dateFromCsv(value: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(value.trim());
  if (!m) throw new Error('Las fechas CSV deben usar dd/mm/aaaa.');
  let year = +m[3]; if (year < 100) year += year > 70 ? 1900 : 2000;
  const d = new Date(Date.UTC(year, +m[2] - 1, +m[1]));
  if (d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[1]) throw new Error('Fecha CSV inexistente.');
  return d.toISOString();
}
export function importHistory(text: string, competition: string): { matches: HistoricalMatch[]; skipped: number; warnings: string[] } {
  if (new TextEncoder().encode(text).length > 3_000_000) throw new Error('El histórico supera 3 MB.');
  if (text.trim().startsWith('[')) { const matches: HistoricalMatch[] = JSON.parse(text); validateHistory(matches); return { matches, skipped: 0, warnings: [] }; }
  const [header, ...rows] = parseCsv(text);
  if (!header || !['Date', 'HomeTeam', 'AwayTeam', 'FTHG', 'FTAG'].every(k => header.includes(k))) throw new Error('CSV esperado: Date, HomeTeam, AwayTeam, FTHG y FTAG.');
  const code = competitions.find(c => c.id === competition)?.code; let skipped = 0;
  const matches: HistoricalMatch[] = [];
  for (const row of rows) {
    const get = (key: string) => row[header.indexOf(key)]?.trim() ?? '';
    if (get('FTHG') === '' || get('FTAG') === '') { skipped++; continue; }
    if (code && get('Div') && get('Div') !== code) throw new Error('El CSV contiene una competición distinta de la seleccionada.');
    const date = dateFromCsv(get('Date')), home = get('HomeTeam'), away = get('AwayTeam');
    const r: HistoricalMatch = { id: `${date.slice(0, 10)}:${home}:${away}`, date, availableAt: new Date(Date.parse(date) + 36 * 3600_000).toISOString(), home, away, homeGoals: Number(get('FTHG')), awayGoals: Number(get('FTAG')) };
    if (get('HxG') && get('AxG')) { r.homeXg = Number(get('HxG')); r.awayXg = Number(get('AxG')); }
    const closing = ['B365CH', 'B365CD', 'B365CA'].map(k => Number(get(k))) as Triple;
    if (closing.every(x => Number.isFinite(x) && x > 1)) r.closingOdds = closing;
    matches.push(r);
  }
  validateHistory(matches);
  return { matches, skipped, warnings: ['El CSV no conserva la hora de disponibilidad original: se retrasa cada resultado 36 horas desde su fecha para una evaluación conservadora.', 'Las cuotas de cierre de Bet365, cuando existen, son solo una referencia posterior; no se usan para entrenar ni representan cuotas ejecutables a la hora del pronóstico.'] };
}
