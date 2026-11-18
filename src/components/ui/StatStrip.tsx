/** Figures in display type with mono labels, divided by vertical hairlines. */
export function StatStrip({ stats }: { stats: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="od-stats" data-od="stats" style={{ "--stat-count": stats.length } as React.CSSProperties}>
      {stats.map((s) => (
        <div key={s.label}>
          <dt className="meta">{s.label}</dt>
          <dd className="display">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}
