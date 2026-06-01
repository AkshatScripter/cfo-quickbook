interface Annotation {
  i: number;
  label: string;
  placement?: "above" | "below";
}

interface LineChartProps {
  points: { x?: string | number; m?: string; d?: string; y?: number; v?: number; balance?: number }[];
  height?: number;
  accent?: boolean;
  showDots?: boolean;
  formatY?: (v: number) => string;
  annotations?: Annotation[];
  threshold?: { y: number; label: string } | null;
}

export function LineChart({
  points,
  height = 200,
  accent = false,
  showDots = true,
  formatY = (v) => `$${Math.round(v).toLocaleString()}`,
  annotations = [],
  threshold = null,
}: LineChartProps) {
  const w = 800, h = height, pad = { l: 48, r: 16, t: 16, b: 28 };
  const xs = points.map(p => p.x ?? p.m ?? p.d);
  const ys = points.map(p => (p.y ?? p.v ?? p.balance) as number);
  let minY = Math.min(...ys) * 0.9;
  let maxY = Math.max(...ys) * 1.08;
  if (threshold) {
    minY = Math.min(minY, threshold.y * 0.9);
    maxY = Math.max(maxY, threshold.y * 1.05);
  }
  const X = (i: number) => pad.l + (i / (points.length - 1)) * (w - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - (v - minY) / (maxY - minY)) * (h - pad.t - pad.b);
  const path = ys.map((v, i) => `${i === 0 ? "M" : "L"} ${X(i)} ${Y(v)}`).join(" ");
  const area = path + ` L ${X(points.length - 1)} ${h - pad.b} L ${X(0)} ${h - pad.b} Z`;
  const ticks = 4;

  return (
    <div className="linechart">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="lc-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent ? "#CFF53C" : "#0A0A0A"} stopOpacity="0.16" />
            <stop offset="100%" stopColor={accent ? "#CFF53C" : "#0A0A0A"} stopOpacity="0" />
          </linearGradient>
        </defs>
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const y = pad.t + (i / ticks) * (h - pad.t - pad.b);
          const v = maxY - (i / ticks) * (maxY - minY);
          return (
            <g key={i}>
              <line x1={pad.l} y1={y} x2={w - pad.r} y2={y} stroke="rgba(10,10,10,0.06)" strokeWidth="1" />
              <text x={pad.l - 8} y={y + 4} fontSize="10" textAnchor="end" fill="#A8A29E" fontFamily="var(--font-mono)">{formatY(v)}</text>
            </g>
          );
        })}
        {threshold && (
          <g>
            <line x1={pad.l} y1={Y(threshold.y)} x2={w - pad.r} y2={Y(threshold.y)} stroke="#B91C1C" strokeWidth="1.2" strokeDasharray="4 4" />
            <rect x={w - pad.r - 130} y={Y(threshold.y) - 22} width="130" height="18" rx="4" fill="#FEF2F2" stroke="#FECACA" strokeWidth="1" />
            <text x={w - pad.r - 65} y={Y(threshold.y) - 9} fontSize="10.5" textAnchor="middle" fill="#B91C1C" fontFamily="var(--font-mono)">{threshold.label}</text>
          </g>
        )}
        <path d={area} fill="url(#lc-fill)" />
        <path d={path} fill="none" stroke="#0A0A0A" strokeWidth="1.8" strokeLinejoin="round" />
        {showDots && ys.map((v, i) => (
          <g key={i}>
            <circle cx={X(i)} cy={Y(v)} r="3.5" fill={accent && i === ys.length - 1 ? "#CFF53C" : "#0A0A0A"} stroke="white" strokeWidth="2" />
            <text x={X(i)} y={h - 10} fontSize="10.5" textAnchor="middle" fill="#A8A29E" fontFamily="var(--font-mono)">{xs[i]}</text>
          </g>
        ))}
        {annotations.map((a, idx) => {
          const cx = X(a.i);
          const cy = Y(ys[a.i]);
          const above = a.placement !== "below";
          const labelY = above ? cy - 18 : cy + 26;
          const width = Math.max(60, a.label.length * 6.2);
          return (
            <g key={idx}>
              <line x1={cx} y1={cy} x2={cx} y2={labelY + (above ? 10 : -10)} stroke="#0A0A0A" strokeWidth="1" strokeDasharray="2 3" opacity="0.4" />
              <rect x={cx - width / 2} y={labelY - 9} width={width} height="18" rx="9" fill="#0A0A0A" />
              <text x={cx} y={labelY + 4} fontSize="10.5" textAnchor="middle" fill="#CFF53C" fontFamily="var(--font-mono)" letterSpacing="0.02em">{a.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
