interface Slice {
  pct: number;
  color: string;
}

export function Donut({ slices, size = 130 }: { slices: Slice[]; size?: number }) {
  let offset = 0;
  const segs = slices.map(s => {
    const start = offset;
    offset += s.pct;
    return `${s.color} ${start * 3.6}deg ${offset * 3.6}deg`;
  }).join(", ");

  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `conic-gradient(${segs})`,
      position: "relative",
    }}>
      <div style={{
        position: "absolute", inset: "22%", borderRadius: "50%", background: "var(--surface)",
        display: "grid", placeItems: "center",
      }}>
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>{slices.length}</div>
      </div>
    </div>
  );
}
