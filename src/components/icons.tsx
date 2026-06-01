import React, { SVGProps } from "react";

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
  d?: string;
}

function Icon({ d, size = 16, fill = "none", stroke = "currentColor", strokeWidth = 1.6, children, viewBox = "0 0 24 24", style, ...rest }: IconProps) {
  return (
    <svg
      className="ico"
      width={size}
      height={size}
      viewBox={viewBox}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      {...rest}
    >
      {d ? <path d={d} /> : children}
    </svg>
  );
}

type P = { size?: number; style?: React.CSSProperties };

export const I = {
  Home:        (p: P) => <Icon {...p}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></Icon>,
  Chat:        (p: P) => <Icon {...p}><path d="M21 12a8 8 0 1 1-3.6-6.7L21 4l-1.3 3.5A8 8 0 0 1 21 12z"/></Icon>,
  Revenue:     (p: P) => <Icon {...p}><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></Icon>,
  Cash:        (p: P) => <Icon {...p}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 10v4M18 10v4"/></Icon>,
  Kpi:         (p: P) => <Icon {...p}><rect x="3" y="13" width="4" height="8"/><rect x="10" y="9" width="4" height="12"/><rect x="17" y="5" width="4" height="16"/></Icon>,
  Risk:        (p: P) => <Icon {...p}><path d="M12 3L2 20h20L12 3z"/><path d="M12 10v4M12 17v.5"/></Icon>,
  Users:       (p: P) => <Icon {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/></Icon>,
  Invoice:     (p: P) => <Icon {...p}><path d="M14 3H6a2 2 0 0 0-2 2v16l3-2 2 2 2-2 2 2 3-2V5a2 2 0 0 0-2-2z"/><path d="M8 9h6M8 13h6M8 17h4"/></Icon>,
  Building:    (p: P) => <Icon {...p}><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 8h.01M9 12h.01M9 16h.01M15 8h.01M15 12h.01M15 16h.01"/></Icon>,
  Shield:      (p: P) => <Icon {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></Icon>,
  Search:      (p: P) => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></Icon>,
  Settings:    (p: P) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.65 1.65 0 0 0-1.8-.3 1.65 1.65 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.65 1.65 0 0 0-1-1.5 1.65 1.65 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.4 17l.1-.1a1.65 1.65 0 0 0 .3-1.8 1.65 1.65 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.65 1.65 0 0 0 1.5-1 1.65 1.65 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.4l.1.1a1.65 1.65 0 0 0 1.8.3H9a1.65 1.65 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.65 1.65 0 0 0 1 1.5 1.65 1.65 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.65 1.65 0 0 0-.3 1.8V9a1.65 1.65 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.65 1.65 0 0 0-1.5 1z"/></Icon>,
  Bell:        (p: P) => <Icon {...p}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></Icon>,
  Logout:      (p: P) => <Icon {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></Icon>,
  Plus:        (p: P) => <Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>,
  Send:        (p: P) => <Icon {...p}><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></Icon>,
  Attach:      (p: P) => <Icon {...p}><path d="m21 12-8.5 8.5a5 5 0 0 1-7-7L14 5a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 8"/></Icon>,
  Sparkle:     (p: P) => <Icon {...p}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2"/></Icon>,
  Refresh:     (p: P) => <Icon {...p}><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></Icon>,
  Check:       (p: P) => <Icon {...p}><path d="M20 6 9 17l-5-5"/></Icon>,
  Chevron:     (p: P) => <Icon {...p}><path d="m9 18 6-6-6-6"/></Icon>,
  ChevronDown: (p: P) => <Icon {...p}><path d="m6 9 6 6 6-6"/></Icon>,
  Arrow:       (p: P) => <Icon {...p}><path d="M5 12h14M13 5l7 7-7 7"/></Icon>,
  ArrowUp:     (p: P) => <Icon {...p}><path d="M7 17 17 7M7 7h10v10"/></Icon>,
  ArrowDown:   (p: P) => <Icon {...p}><path d="M7 7 17 17M17 7v10H7"/></Icon>,
  X:           (p: P) => <Icon {...p}><path d="M18 6 6 18M6 6l12 12"/></Icon>,
  Eye:         (p: P) => <Icon {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></Icon>,
  EyeOff:      (p: P) => <Icon {...p}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></Icon>,
  Download:    (p: P) => <Icon {...p}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M21 21H3"/></Icon>,
  Filter:      (p: P) => <Icon {...p}><path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3z"/></Icon>,
  More:        (p: P) => <Icon {...p}><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></Icon>,
  Warning:     (p: P) => <Icon {...p}><path d="M12 9v4M12 17v.5"/><path d="M10.3 3.7 1.8 18.3a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0z"/></Icon>,
  Clock:       (p: P) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Icon>,
  Lock:        (p: P) => <Icon {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></Icon>,
  Mail:        (p: P) => <Icon {...p}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></Icon>,
  Activity:    (p: P) => <Icon {...p}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></Icon>,
  Doc:         (p: P) => <Icon {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></Icon>,
  Trash:       (p: P) => <Icon {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></Icon>,
  Globe:       (p: P) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/></Icon>,
  Calendar:    (p: P) => <Icon {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></Icon>,
  Link:        (p: P) => <Icon {...p}><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></Icon>,
  Bank:        (p: P) => <Icon {...p}><path d="M3 21h18M5 21V10M19 21V10M9 21v-7M15 21v-7M2 10h20L12 3 2 10z"/></Icon>,
  Spark:       (p: P) => <Icon {...p}><path d="M12 2 14 9l7 1-5 4 2 8-6-4-6 4 2-8-5-4 7-1z"/></Icon>,
  Zap:         (p: P) => <Icon {...p}><path d="m13 2-9 12h7l-1 8 9-12h-7l1-8z"/></Icon>,
  Trend:       (p: P) => <Icon {...p}><path d="m23 6-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/></Icon>,
  TrendDown:   (p: P) => <Icon {...p}><path d="m23 18-9.5-9.5-5 5L1 6"/><path d="M17 18h6v-6"/></Icon>,
};
