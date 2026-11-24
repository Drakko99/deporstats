import type { Market, Settlement } from '../shared/types';
import { TOTAL_LINES, TEAM_LINES, ASIAN_LINES, EUROPEAN_LINES } from '../shared/market-catalog';

type ScorePredicate = (home: number, away: number) => boolean;
const clamp = (p: number) => Math.min(1, Math.max(0, p));
const signed = (n: number) => n > 0 ? `+${n}` : `${n}`;

/** Liquida una apuesta asiática en un marcador concreto; un cuarto divide el importe en dos líneas. */
export function asianSettlement(value: number, line: number, direction: 1 | -1 = 1): keyof Settlement {
  const legs = Number.isInteger(line * 2) ? [line] : [Math.floor(line * 2) / 2, Math.ceil(line * 2) / 2];
  const results = legs.map(l => Math.sign(direction * (value - l)));
  const wins = results.filter(r => r > 0).length / results.length, refunds = results.filter(r => r === 0).length / results.length;
  return wins === 1 ? 'win' : wins === .5 ? 'halfWin' : refunds === 1 ? 'push' : refunds === .5 ? 'halfLoss' : 'loss';
}

/** Todos los eventos se integran sobre la MISMA matriz; las combinaciones no multiplican marginales. */
export function buildMarkets(matrix: number[][], expanded = true): Market[] {
  const cells = matrix.flatMap((row, h) => row.map((p, a) => ({ h, a, p })));
  const sum = (predicate: ScorePredicate) => clamp(cells.reduce((s, c) => s + (predicate(c.h, c.a) ? c.p : 0), 0));
  const markets: Market[] = [];
  const add = (key: string, label: string, group: string, probability: number, pushProbability = 0, note?: string) => {
    const p = clamp(probability), refund = Math.min(clamp(pushProbability), 1 - p);
    markets.push({ key, label, group, probability: p, pushProbability: refund, fairOdds: p > 1e-14 ? (1 - refund) / p : null, ...(note ? { note } : {}) });
  };
  const event = (key: string, label: string, group: string, predicate: ScorePredicate) => add(key, label, group, sum(predicate));
  const binary = (key: string, label: string, group: string, predicate: ScorePredicate) => { const p = sum(predicate); add(key + ':yes', label + ' · Sí', group, p); add(key + ':no', label + ' · No', group, 1 - p); };
  const asian = (key: string, label: string, group: string, value: (h: number, a: number) => number, line: number, direction: 1 | -1) => {
    const s: Settlement = { win: 0, halfWin: 0, push: 0, halfLoss: 0, loss: 0 };
    for (const c of cells) s[asianSettlement(value(c.h, c.a), line, direction)] += c.p;
    const winWeight = s.win + s.halfWin / 2, refundWeight = s.push + (s.halfWin + s.halfLoss) / 2;
    const split = !Number.isInteger(line * 2);
    markets.push({ key, label, group, probability: clamp(s.win + s.halfWin), pushProbability: clamp(s.push), fairOdds: winWeight > 1e-14 ? (1 - refundWeight) / winWeight : null, ...(split ? { settlement: s, note: 'Línea de cuarto: posible media ganancia o media pérdida' } : Number.isInteger(line) ? { note: 'Devolución si el resultado coincide con la línea' } : {}) });
  };
  const win = sum((h, a) => h > a), draw = sum((h, a) => h === a), lose = sum((h, a) => h < a);
  // La evaluación 1X2 usa estas tres selecciones y omite el catálogo ampliado para ahorrar CPU.
  add('home', 'Local', 'Resultado · 90 minutos', win);
  add('draw', 'Empate', 'Resultado · 90 minutos', draw);
  add('away', 'Visitante', 'Resultado · 90 minutos', lose);
  if (!expanded) return markets;
  add('1x', 'Local o empate', 'Doble oportunidad', win + draw);
  add('x2', 'Empate o visitante', 'Doble oportunidad', draw + lose);
  add('12', 'Local o visitante', 'Doble oportunidad', win + lose);
  add('dnb:home', 'Local · empate devuelve', 'Empate devuelve', win, draw, 'Devolución si el partido termina en empate');
  add('dnb:away', 'Visitante · empate devuelve', 'Empate devuelve', lose, draw, 'Devolución si el partido termina en empate');
  for (const line of TOTAL_LINES) for (const direction of [1, -1] as const) asian(`${direction === 1 ? 'over' : 'under'}:${line}`, `${direction === 1 ? 'Más' : 'Menos'} de ${line} goles`, 'Total de goles', (h, a) => h + a, line, direction);
  binary('btts', 'Ambos marcan', 'Ambos equipos marcan', (h, a) => h > 0 && a > 0);
  for (const [side, name] of [['home', 'Local'], ['away', 'Visitante']] as const) {
    const own = (h: number, a: number) => side === 'home' ? h : a, other = (h: number, a: number) => side === 'home' ? a : h;
    for (const line of TEAM_LINES) for (const direction of [1, -1] as const) asian(`team:${side}:${direction === 1 ? 'over' : 'under'}:${line}`, `${name} · ${direction === 1 ? 'más' : 'menos'} de ${line} goles`, `Goles del ${side === 'home' ? 'local' : 'visitante'}`, own, line, direction);
    binary(`score:${side}`, `${name} marca`, 'Equipos que marcan', (h, a) => own(h, a) > 0);
    binary(`clean:${side}`, `${name} deja su portería a cero`, 'Portería a cero', (h, a) => other(h, a) === 0);
    binary(`wintonil:${side}`, `${name} gana sin encajar`, 'Gana sin encajar', (h, a) => own(h, a) > 0 && other(h, a) === 0);
    for (const line of ASIAN_LINES) asian(`ah:${side}:${line}`, `${name} ${signed(line)}`, 'Hándicap asiático', (h, a) => own(h, a) - other(h, a), -line, 1);
  }
  for (const line of EUROPEAN_LINES) for (const [outcome, name, predicate] of [['home', 'Local', (h: number, a: number) => h + line > a], ['draw', 'Empate', (h: number, a: number) => h + line === a], ['away', 'Visitante', (h: number, a: number) => h + line < a]] as const) event(`eh:${line}:${outcome}`, `${name} · hándicap local ${signed(line)}`, 'Hándicap europeo · 3 vías', predicate);
  for (let h = 0; h <= 8; h++) for (let a = 0; a <= 8; a++) event(`correct:${h}:${a}`, `Marcador ${h} – ${a}`, 'Marcador exacto', (x, y) => x === h && y === a);
  for (const [side, name, total] of [['match', 'Partido', (h: number, a: number) => h + a], ['home', 'Local', (h: number) => h], ['away', 'Visitante', (_h: number, a: number) => a]] as const) {
    const group = side === 'match' ? 'Número exacto de goles' : 'Goles exactos por equipo';
    for (let n = 0; n <= 8; n++) event(`exact:${side}:${n}`, `${name} · exactamente ${n} goles`, group, (h, a) => total(h, a) === n);
    for (const n of [5, 6, 7, 8, 9]) event(`exact:${side}:${n}+`, `${name} · ${n} o más goles`, group, (h, a) => total(h, a) >= n);
    event(`parity:${side}:odd`, `${name} · goles impares`, 'Goles pares o impares', (h, a) => total(h, a) % 2 === 1);
    event(`parity:${side}:even`, `${name} · goles pares (incluye 0)`, 'Goles pares o impares', (h, a) => total(h, a) % 2 === 0);
  }
  for (const [side, label, diff] of [['home', 'Local', (h: number, a: number) => h - a], ['away', 'Visitante', (h: number, a: number) => a - h]] as const) {
    for (let n = 1; n <= 5; n++) event(`margin:${side}:${n}`, `${label} gana por ${n}`, 'Margen de victoria', (h, a) => diff(h, a) === n);
    event(`margin:${side}:6+`, `${label} gana por 6 o más`, 'Margen de victoria', (h, a) => diff(h, a) >= 6);
  }
  add('margin:draw', 'Empate (incluye 0 – 0)', 'Margen de victoria', draw);
  event('margin:no-goal', 'Sin goles · 0 – 0', 'Margen de victoria', (h, a) => h + a === 0);
  event('margin:scoring-draw', 'Empate con goles', 'Margen de victoria', (h, a) => h === a && h > 0);
  add('nobet:home:draw', 'Empate · victoria local devuelve', 'Victoria de un equipo devuelve', draw, win);
  add('nobet:home:away', 'Visitante · victoria local devuelve', 'Victoria de un equipo devuelve', lose, win);
  add('nobet:away:home', 'Local · victoria visitante devuelve', 'Victoria de un equipo devuelve', win, lose);
  add('nobet:away:draw', 'Empate · victoria visitante devuelve', 'Victoria de un equipo devuelve', draw, lose);
  const results: [string, string, ScorePredicate][] = [['home', 'Local', (h, a) => h > a], ['draw', 'Empate', (h, a) => h === a], ['away', 'Visitante', (h, a) => h < a]];
  for (const [key, name, result] of results) {
    for (const yes of [true, false]) event(`result-btts:${key}:${yes ? 'yes' : 'no'}`, `${name} y ambos marcan · ${yes ? 'Sí' : 'No'}`, 'Resultado y ambos marcan', (h, a) => result(h, a) && (h > 0 && a > 0) === yes);
    for (const line of [1.5, 2.5, 3.5, 4.5]) for (const over of [true, false]) event(`result-total:${key}:${over ? 'over' : 'under'}:${line}`, `${name} y ${over ? 'más' : 'menos'} de ${line} goles`, 'Resultado y total de goles', (h, a) => result(h, a) && (over ? h + a > line : h + a < line));
  }
  for (const line of [1.5, 2.5, 3.5, 4.5]) for (const yes of [true, false]) for (const over of [true, false]) event(`btts-total:${yes ? 'yes' : 'no'}:${over ? 'over' : 'under'}:${line}`, `Ambos marcan ${yes ? 'sí' : 'no'} y ${over ? 'más' : 'menos'} de ${line} goles`, 'Ambos marcan y total de goles', (h, a) => (h > 0 && a > 0) === yes && (over ? h + a > line : h + a < line));
  // Se omiten eventos imposibles: por ejemplo empate y menos de 1.5 con ambos marcando.
  return markets.filter(m => m.probability > 1e-14);
}
