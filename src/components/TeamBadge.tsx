/** Monograma decorativo: no representa un escudo oficial. */
export default function TeamBadge({ name, away = false }: { name: string; away?: boolean }) {
  const initials = name.replace(/^(Real |Manchester |Atlético de )/, '').slice(0, 3).toUpperCase();
  return <span className={`team-badge ${away ? 'away' : ''}`} aria-hidden="true">{initials}</span>;
}
