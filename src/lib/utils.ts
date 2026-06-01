export function fmt(n: number, opts: { dp?: number; money?: boolean; signed?: boolean } = {}) {
  const { dp = 0, money = true, signed = false } = opts;
  const sign = signed && n > 0 ? "+" : "";
  const fmtd = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
  return `${n < 0 ? "−" : sign}${money ? "$" : ""}${fmtd}`;
}

export function pct(p: number, dp = 1, signed = false) {
  const sign = signed && p > 0 ? "+" : "";
  return `${sign}${(p * 100).toFixed(dp)}%`;
}
