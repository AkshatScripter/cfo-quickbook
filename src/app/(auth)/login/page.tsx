"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { I } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { AppProvider, useApp } from "@/lib/app-context";

function LoginForm() {
  const { login } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Signed in successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <aside className="auth-aside">
        <div>
          <div className="brand">
            <span className="brand-mark">L</span>
            <span className="brand-name">
              Ledger<span style={{ fontStyle: "italic" }}>·</span>AI
            </span>
          </div>
        </div>
        <div style={{ position: "relative", zIndex: 1 }}>
          <p className="quote">
            A virtual <span className="em">CFO</span> sitting inside your
            QuickBooks, answering the question you were about to ask your
            accountant.
          </p>
          <div className="row gap-3" style={{ marginTop: 32, color: "rgba(250,250,249,0.7)", fontSize: 13 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <I.Check size={14} /> 90%+ response accuracy
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <I.Check size={14} /> Under 5s answers
            </span>
          </div>
        </div>
        <div className="footnote">© 2026 Ledger AI · Phase 1</div>
        <div className="deco" />
      </aside>

      <div className="auth-form-wrap">
        <form className="auth-form" onSubmit={handleSubmit}>
          <h1>Welcome...</h1>
          <p className="sub">Sign in to continue to your CFO assistant.</p>

          <label className="field-label" htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ marginBottom: 12 }}
          />

          <label className="field-label" htmlFor="password">Password</label>
          <div style={{ position: "relative", marginBottom: 18 }}>
            <input
              id="password"
              className="input"
              type={showPw ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ paddingRight: 42 }}
            />
            <button
              type="button"
              aria-label={showPw ? "Hide password" : "Show password"}
              onClick={() => setShowPw(v => !v)}
              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", display: "flex", alignItems: "center" }}
            >
              {showPw ? <I.EyeOff size={16} /> : <I.Eye size={16} />}
            </button>
          </div>

          <button
            className="btn btn-primary btn-lg btn-block"
            type="submit"
            disabled={loading}
            style={{ gap: 10 }}
          >
            {loading ? <><Spinner size="sm" /> Signing in…</> : <>Sign in <I.Arrow size={14} /></>}
          </button>

          <p style={{ marginTop: 24, fontSize: 13, color: "var(--fg-3)", textAlign: "center" }}>
            New here?{" "}
            <Link href="/signup" style={{ color: "var(--fg)", fontWeight: 500 }}>
              Create an account
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AppProvider>
      <LoginForm />
    </AppProvider>
  );
}
