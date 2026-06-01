export function Avatar({ name, size = "" }: { name: string; size?: string }) {
  const init = (name || "?").split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase();
  return <div className={`avatar ${size}`}>{init}</div>;
}
