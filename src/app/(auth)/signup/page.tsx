"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { I } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";

type SignupRole = "company" | "customer";

const ROLE_OPTIONS: { value: SignupRole; label: string; sub: string }[] = [
  { value: "company",  label: "Company",  sub: "I run a business" },
  { value: "customer", label: "Customer", sub: "I was invited by a company" },
];

export default function SignupPage() {
  const [role, setRole] = useState<SignupRole>("company");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name, role },
          emailRedirectTo: `${globalThis.location.origin}/api/auth/callback`,
        },
      });

      if (signUpError) throw new Error(signUpError.message);

      toast.success("Account created — check your email to confirm");
      setDone(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="auth-screen">
        <aside className="auth-aside">
          <div className="brand">
            <span className="brand-mark">L</span>
            <span className="brand-name">Ledger<span style={{ fontStyle: "italic" }}>·</span>AI</span>
          </div>
          <div className="deco" />
        </aside>
        <div className="auth-form-wrap">
          <div className="auth-form" style={{ textAlign: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--positive-bg)", display: "grid", placeItems: "center", margin: "0 auto 20px" }}>
              <I.Check size={22} style={{ color: "var(--positive)" }} />
            </div>
            <h1>Check your email</h1>
            <p className="sub">
              We sent a confirmation link to <strong>{email}</strong>.
              Click it to activate your account and sign in.
            </p>
            <Link href="/login" className="btn btn-primary btn-lg btn-block" style={{ marginTop: 24, display: "flex" }}>
              Back to login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <aside className="auth-aside">
        <div>
          <div className="brand">
            <span className="brand-mark">L</span>
            <span className="brand-name">Ledger<span style={{ fontStyle: "italic" }}>·</span>AI</span>
          </div>
        </div>
        <div style={{ position: "relative", zIndex: 1 }}>
          <p className="quote">
            A virtual <span className="em">CFO</span> sitting inside your QuickBooks.
          </p>
        </div>
        <div className="footnote">© 2026 Ledger AI · Phase 1</div>
        <div className="deco" />
      </aside>

      <div className="auth-form-wrap">
        <form className="auth-form" onSubmit={handleSubmit}>
          <h1>Get started</h1>
          <p className="sub">Create your account — takes about 2 minutes.</p>

          <label className="field-label" htmlFor="signup-role">I&apos;m signing up as a…</label>
          <div id="signup-role" className="role-picker" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 18 }}>
            {ROLE_OPTIONS.map((r) => (
              <button
                key={r.value}
                type="button"
                className={`role-pick ${role === r.value ? "active" : ""}`}
                onClick={() => setRole(r.value)}
              >
                <span className="role-name">{r.label}</span>
                <span className="role-sub">{r.sub}</span>
              </button>
            ))}
          </div>

          <label className="field-label" htmlFor="signup-name">Full name</label>
          <input
            id="signup-name"
            className="input"
            placeholder="Jane Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{ marginBottom: 12 }}
          />

          <label className="field-label" htmlFor="signup-email">Work email</label>
          <input
            id="signup-email"
            className="input"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ marginBottom: 12 }}
          />

          <label className="field-label" htmlFor="signup-password">Password</label>
          <div style={{ position: "relative", marginBottom: 18 }}>
            <input
              id="signup-password"
              className="input"
              type={showPw ? "text" : "password"}
              placeholder="At least 8 characters"
              minLength={8}
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
            {loading ? <><Spinner size="sm" /> Creating account…</> : <>Create account <I.Arrow size={14} /></>}
          </button>

          <p style={{ marginTop: 16, fontSize: 13, color: "var(--fg-3)", textAlign: "center" }}>
            Already have an account?{" "}
            <Link href="/login" style={{ color: "var(--fg)", fontWeight: 500 }}>
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
