export type Triple = [number, number, number];
export interface HistoricalMatch {
  id: string; date: string; availableAt: string; home: string; away: string;
  homeGoals: number; awayGoals: number; homeXg?: number; awayXg?: number;
  closingOdds?: Triple;
}
export interface Parameters { intercept: number; homeAdvantage: number; attack: Record<string, number>; defence: Record<string, number> }
export interface FitOptions { halfLifeDays: number; ridge: number; xgWeight: number }
export interface GoalModel {
  version: 'dc-2'; options: FitOptions; parameters: Parameters; xgParameters?: Parameters;
  rho: number; asOf: string; lastResultAt: string; sampleSize: number;
  effectiveSampleSize: number; teamCounts: Record<string, number>; trainingSource: string;
}
export interface Settlement { win: number; halfWin: number; push: number; halfLoss: number; loss: number }
export interface Market { key: string; label: string; probability: number; pushProbability: number; fairOdds: number | null; group?: string; settlement?: Settlement; note?: string }
export interface Prediction { homeRate: number; awayRate: number; rho: number; rhoAdjusted: boolean; matrix: number[][]; markets: Market[]; warnings: string[] }
export interface Evaluation {
  selected: FitOptions; validationMatches: number; testMatches: number; skipped: number;
  logLoss: number; brier: number; baselineLogLoss: number; baselineBrier: number;
  marketLogLoss: number | null; marketMatches: number;
  bins: { low: number; high: number; count: number; forecast: number; observed: number }[];
  testFrom: string; testTo: string; folds: { asOf: string; trainedThrough: string; count: number }[];
  candidates: { options: FitOptions; logLoss: number; count: number }[];
}
export interface ModelArtifact { competition: string; model: GoalModel; evaluation: Evaluation; savedAt: string; source: string; aliases: Record<string, string> }
export interface Fixture { id: string; home: string; away: string; startsAt: string; competition: string; competitionName: string; tournamentId?: number; demo: boolean; status: number }
export interface Quote { marketKey: string; odds: number; changedAt: string | null; retrievedAt: string; bookmaker: string; demo: boolean }
export interface Analysis { fixture: Fixture; prediction: Prediction | null; quotes: Quote[]; comparisonEligible: boolean; modelInfo: { sampleSize: number; effectiveSampleSize: number; lastResultAt: string; options: FitOptions; evaluated: number } | null; messages: string[] }
