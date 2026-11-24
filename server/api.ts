import { authorize } from './auth';
import type { Analysis, Fixture, ModelArtifact, Quote } from '../shared/types';
import { competitions, teamKey } from '../shared/competitions';
import { demoAnalysis, demoFixtures, demoHistory } from './demo';
import { predict } from './model';
import { importHistory } from './importer';
import { trainAndEvaluate } from './evaluation';
import { getFixtures, getOdds } from './providers/oddspapi';
import { read, write, type Environment } from './store';

const artifactKey = (competition: string) => `models/${encodeURIComponent(competition)}.json`;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
function validCompetition(value: unknown): string { if (typeof value !== 'string' || !competitions.some(c => c.id === value)) throw new Error('Competición no válida.'); return value; }
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new Error('Se requiere JSON.');
  if (Number(request.headers.get('content-length')) > 3_300_000) throw new Error('La petición supera el límite.');
  const text = await request.text(); if (new TextEncoder().encode(text).length > 3_300_000) throw new Error('La petición supera el límite.');
  return JSON.parse(text);
}
async function analyze(env: Environment, fixture: Fixture, fetchQuotes: boolean): Promise<Analysis> {
  const artifact = await read<ModelArtifact>(env, artifactKey(fixture.competition)); const messages: string[] = [];
  let prediction: Analysis['prediction'] = null;
  if (artifact) {
    if (Date.parse(artifact.model.asOf) >= Date.parse(fixture.startsAt)) messages.push('El modelo no es anterior al partido. No se calcula un pronóstico retrospectivo.');
    else {
      try { prediction = predict(artifact.model, artifact.aliases[teamKey(fixture.home)] ?? fixture.home, artifact.aliases[teamKey(fixture.away)] ?? fixture.away); messages.push(...prediction.warnings); } catch (e) { messages.push((e as Error).message); }
      if (Date.now() - Date.parse(artifact.model.lastResultAt) > 60 * 86400000) messages.push('Histórico desactualizado: el último resultado tiene más de 60 días.');
      if (artifact.evaluation.testMatches < 150) messages.push('Evaluación limitada: menos de 150 partidos de prueba.');
      if (artifact.evaluation.logLoss >= artifact.evaluation.baselineLogLoss) messages.push('El modelo no supera la referencia de liga en la prueba reservada.');
    }
  } else messages.push('Importa el histórico de esta competición en Modelo para calcular cuotas.');
  let quotes: Quote[] = [];
  try { quotes = fetchQuotes ? await getOdds(env, fixture) : await read<Quote[]>(env, `quotes/${fixture.id}.json`) ?? []; } catch (e) { messages.push((e as Error).message); }
  quotes = quotes.filter(q => Date.now() - Date.parse(q.retrievedAt) < 10 * 60000 && Date.now() >= Date.parse(q.retrievedAt));
  if (!quotes.length) messages.push('Sin cuotas vigentes: abre o actualiza el detalle para consultar Winamax.');
  return { fixture, prediction, quotes, comparisonEligible: Boolean(prediction && !messages.length), modelInfo: artifact ? { sampleSize: artifact.model.sampleSize, effectiveSampleSize: artifact.model.effectiveSampleSize, lastResultAt: artifact.model.lastResultAt, options: artifact.model.options, evaluated: artifact.evaluation.testMatches } : null, messages };
}
/** API compartida por Node local/producción y Vercel Functions. */
export async function handleApi(request: Request, env: Environment): Promise<Response> {
  const url = new URL(request.url);
  try {
    const authorization = await authorize(request, env);
    if (authorization) return authorization;
    if (request.method !== 'GET') {
      const origin = request.headers.get('origin'); if (origin && origin !== url.origin) return json({ error: 'Origen no permitido.' }, 403);
      if (request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Origen no permitido.' }, 403);
    }
    const isDemo = url.searchParams.get('mode') !== 'real';
    if (url.pathname === '/api/status') return json({ oddsConfigured: Boolean(env.ODDSPAPI_API_KEY), storageConfigured: Boolean(env.BUCKET), version: '0.4.0' });
    if (url.pathname === '/api/fixtures' && request.method === 'GET') {
      const fixtures = isDemo ? demoFixtures() : (await getFixtures(env)).filter(f => competitions.some(c => c.id === f.competition));
      const analyses: Analysis[] = [];
      for (const fixture of fixtures.slice(0, 100)) analyses.push(isDemo ? demoAnalysis(fixture) : await analyze(env, fixture, false));
      return json({ analyses, total: fixtures.length, capped: fixtures.length > 100 });
    }
    if (url.pathname === '/api/analysis' && request.method === 'GET') {
      const id = url.searchParams.get('id'); const fixtures = isDemo ? demoFixtures() : await getFixtures(env);
      const fixture = fixtures.find(f => f.id === id); if (!fixture) return json({ error: 'Partido no disponible o ya iniciado.' }, 404);
      return json(isDemo ? demoAnalysis(fixture) : await analyze(env, fixture, true));
    }
    if (url.pathname === '/api/models' && request.method === 'GET') {
      const models: ModelArtifact[] = []; for (const c of competitions) { const model = await read<ModelArtifact>(env, artifactKey(c.id)); if (model) models.push(model); } return json(models);
    }
    if (url.pathname === '/api/train' && request.method === 'POST') {
      const input = await body(request), competition = validCompetition(input.competition);
      if (typeof input.text !== 'string') throw new Error('Selecciona un archivo CSV o JSON.');
      const source = typeof input.filename === 'string' ? input.filename.slice(0, 150) : 'Importación manual';
      const imported = importHistory(input.text, competition), now = new Date().toISOString();
      const artifact = trainAndEvaluate(imported.matches, competition, now, source);
      const prior = await read<ModelArtifact>(env, artifactKey(competition)); artifact.aliases = prior?.aliases ?? {};
      await write(env, `history/${encodeURIComponent(competition)}.json`, imported.matches);
      await write(env, artifactKey(competition), artifact);
      return json({ artifact, skipped: imported.skipped, warnings: imported.warnings });
    }
    if (url.pathname === '/api/aliases' && request.method === 'POST') {
      const input = await body(request), competition = validCompetition(input.competition);
      const artifact = await read<ModelArtifact>(env, artifactKey(competition)); if (!artifact) throw new Error('Entrena primero el modelo.');
      if (typeof input.providerName !== 'string' || input.providerName.length > 100 || !input.providerName.trim() || typeof input.trainingName !== 'string' || !Object.hasOwn(artifact.model.teamCounts, teamKey(input.trainingName))) throw new Error('Selecciona un equipo válido del histórico.');
      artifact.aliases[teamKey(input.providerName)] = teamKey(input.trainingName); await write(env, artifactKey(competition), artifact); return json(artifact);
    }
    if (url.pathname === '/api/demo-history' && request.method === 'GET') return json(demoHistory());
    return json({ error: 'Ruta no encontrada.' }, 404);
  } catch (e) { return json({ error: (e as Error).message || 'No se pudo completar la operación.' }, 400); }
}
