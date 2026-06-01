type Size = "sm" | "md" | "lg";

const SIZE_PX: Record<Size, number> = { sm: 16, md: 32, lg: 48 };
const BORDER_PX: Record<Size, number> = { sm: 2, md: 3, lg: 4 };

export function Spinner({ size = "md" }: { size?: Size }) {
  const px = SIZE_PX[size];
  const border = BORDER_PX[size];
  return (
    <span
      role="status"
      aria-label="Loading"
      style={{
        display: "inline-block",
        width: px,
        height: px,
        borderRadius: "50%",
        border: `${border}px solid var(--border-2)`,
        borderTopColor: "var(--fg)",
        animation: "spin 0.7s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

// Full-page centred loader
export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 320,
        gap: 14,
      }}
    >
      <Spinner size="md" />
      <span className="muted" style={{ fontSize: 13 }}>{label}</span>
    </div>
  );
}
