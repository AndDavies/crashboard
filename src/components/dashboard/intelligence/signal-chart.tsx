const COLORS = ["#b6ff29", "#2f81f7", "#f0883e", "#d2a8ff"];

type SignalPoint = {
  trend_key: string;
  trend_label: string;
  period_end: string;
  mention_rate: number | string | null;
};

export function SignalComparisonChart({ rows }: { rows: SignalPoint[] }) {
  const keys = [...new Set(rows.map((row) => row.trend_key))];
  const periods = [...new Set(rows.map((row) => row.period_end))].sort();
  const width = 900;
  const height = 280;
  const pad = { left: 52, right: 20, top: 20, bottom: 34 };
  const max = Math.max(1, ...rows.map((row) => Number(row.mention_rate ?? 0)));
  const x = (period: string) =>
    pad.left + (periods.indexOf(period) / Math.max(1, periods.length - 1)) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + (1 - value / max) * (height - pad.top - pad.bottom);
  if (!rows.length) {
    return <p className="py-16 text-center text-sm text-muted-foreground">No complete weekly history is available for this selection.</p>;
  }
  return (
    <div>
      <div className="flex flex-wrap gap-4 pb-3 text-xs">
        {keys.map((key, index) => (
          <span key={key} className="inline-flex items-center gap-2">
            <span className="size-2" style={{ background: COLORS[index % COLORS.length] }} />
            {rows.find((row) => row.trend_key === key)?.trend_label ?? key}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="signal-chart-title signal-chart-desc" className="w-full border border-border bg-background">
        <title id="signal-chart-title">Weekly mention rate comparison</title>
        <desc id="signal-chart-desc">Mentions per 100 eligible evidence units across complete Monday-to-Sunday weeks.</desc>
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const tickY = y(max * tick);
          return <g key={tick}><line x1={pad.left} x2={width - pad.right} y1={tickY} y2={tickY} stroke="currentColor" opacity="0.12" /><text x={pad.left - 8} y={tickY + 4} textAnchor="end" fontSize="11" fill="currentColor" opacity="0.65">{(max * tick).toFixed(1)}</text></g>;
        })}
        {keys.map((key, index) => {
          const points = rows.filter((row) => row.trend_key === key).sort((a, b) => a.period_end.localeCompare(b.period_end));
          return <polyline key={key} fill="none" stroke={COLORS[index % COLORS.length]} strokeWidth="3" points={points.map((point) => `${x(point.period_end)},${y(Number(point.mention_rate ?? 0))}`).join(" ")} />;
        })}
        {periods.filter((_, index) => index === 0 || index === periods.length - 1 || index % Math.max(1, Math.ceil(periods.length / 5)) === 0).map((period) => <text key={period} x={x(period)} y={height - 10} textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.65">{period.slice(5)}</text>)}
      </svg>
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">Accessible chart data</summary>
        <div className="mt-2 overflow-x-auto"><table className="w-full border-collapse"><thead><tr><th className="border border-border p-2 text-left">Week ending</th>{keys.map((key) => <th key={key} className="border border-border p-2 text-right">{rows.find((row) => row.trend_key === key)?.trend_label}</th>)}</tr></thead><tbody>{periods.map((period) => <tr key={period}><td className="border border-border p-2">{period}</td>{keys.map((key) => <td key={key} className="border border-border p-2 text-right font-mono">{Number(rows.find((row) => row.period_end === period && row.trend_key === key)?.mention_rate ?? 0).toFixed(2)}</td>)}</tr>)}</tbody></table></div>
      </details>
    </div>
  );
}
