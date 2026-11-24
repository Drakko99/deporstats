import { DISPLAY_TIME_ZONE } from '../shared/comparisons';
export { opportunities, marketGroup as group } from '../shared/comparisons';
export const money = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : value >= 10000 ? new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 }).format(value) : value.toFixed(2);
export const pct = (value: number) => `${(value * 100).toFixed(1)} %`;
export const dateLabel = (value: string) => new Intl.DateTimeFormat('es-ES', { timeZone: DISPLAY_TIME_ZONE, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch('/api' + path, { credentials: 'same-origin', ...options });
  if (response.status === 401) window.dispatchEvent(new Event('deporstats:unauthorized'));
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error(`El servidor respondió con un error (${response.status}). Comprueba el despliegue.`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'No se pudo cargar la información.');
  return data;
}
export const post = <T>(path: string, body: unknown) => api<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
