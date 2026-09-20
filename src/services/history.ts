import type { AnalysisResult } from '../types/document';
export const HISTORY_KEY = 'aclaradoc.history.v1';
export const HISTORY_LIMIT = 50;

// Allowlist excludes document names, URIs, attachments and original images.
export function encodeHistory(results: AnalysisResult[]): string {
  return JSON.stringify(results.slice(0, HISTORY_LIMIT).map(r => ({
    id: r.id, createdAt: r.createdAt, simulated: r.simulated,
    summary: r.summary, issuer: r.issuer, communicationType: r.communicationType,
    actions: r.actions.map(a => ({ id: a.id, description: a.description, priority: a.priority })),
    deadlines: r.deadlines.map(d => ({ id: d.id, description: d.description, date: d.date, requiresVerification: d.requiresVerification })),
    consequences: r.consequences, confidence: { level: r.confidence.level, explanation: r.confidence.explanation },
  })));
}
export function decodeHistory(raw: string | null): AnalysisResult[] {
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(isResult)) throw new Error('Historial local no válido. Puedes borrarlo para empezar de nuevo.');
  return JSON.parse(encodeHistory(parsed)) as AnalysisResult[];
}
function isResult(value: unknown): value is AnalysisResult {
  if (!value || typeof value !== 'object') return false;
  const r = value as AnalysisResult;
  return typeof r.id === 'string' && typeof r.createdAt === 'string' && Number.isFinite(Date.parse(r.createdAt)) && r.simulated === true &&
    [r.summary, r.issuer, r.communicationType, r.consequences].every(v => typeof v === 'string') &&
    Array.isArray(r.actions) && r.actions.every(a => a && typeof a.id === 'string' && typeof a.description === 'string' && ['high', 'normal'].includes(a.priority)) &&
    Array.isArray(r.deadlines) && r.deadlines.every(d => d && typeof d.id === 'string' && typeof d.description === 'string' && (d.date === null || typeof d.date === 'string') && typeof d.requiresVerification === 'boolean') &&
    r.confidence?.level === 'unavailable' && typeof r.confidence.explanation === 'string';
}
