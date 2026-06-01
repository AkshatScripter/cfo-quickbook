const STATUS_MAP: Record<string, { cls: string; label: string }> = {
  Paid:             { cls: "b-positive",  label: "Paid"        },
  Unpaid:           { cls: "b-info",      label: "Unpaid"      },
  Overdue:          { cls: "b-negative",  label: "Overdue"     },
  Connected:        { cls: "b-positive",  label: "Connected"   },
  "Reauth needed":  { cls: "b-warning",   label: "Reauth"      },
  Disconnected:     { cls: "b-negative",  label: "Disconnected"},
};

export function StatusPill({ status }: { status: string }) {
  const m = STATUS_MAP[status] ?? { cls: "", label: status };
  return (
    <span className={`badge ${m.cls}`}>
      <span className="dot" />
      {m.label}
    </span>
  );
}
