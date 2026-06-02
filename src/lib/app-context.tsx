"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type Role = "super_admin" | "company" | "customer";
export type Density = "comfortable" | "compact";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  qbConnected: boolean;
  companyName: string | null;
  lastSyncAt: string | null; // ISO 8601 string or null
}

interface PinnedInsight {
  id: string;
  body: string;
  source?: string;
}

interface PendingPrompt {
  text: string;
  ts: number;
  highlight?: string;
}

interface AppCtxValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  role: Role;
  chatOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
  density: Density;
  setDensity: (d: Density) => void;
  highlight: string | null;
  flashHighlight: (key: string) => void;
  pinned: PinnedInsight[];
  pinInsight: (item: PinnedInsight) => void;
  unpinInsight: (id: string) => void;
  pendingPrompt: PendingPrompt | null;
  askAI: (prompt: string, opts?: { highlight?: string }) => void;
  clearPendingPrompt: () => void;
  navigate: (path: string) => void;
}

const AppCtx = createContext<AppCtxValue | null>(null);

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

export function AppProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  // Create Supabase client once — not on every render
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  const [density, setDensity] = useState<Density>("comfortable");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [pinned, setPinned] = useState<PinnedInsight[]>([]);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);

  const role: Role = user?.role ?? "company";

  useEffect(() => {
    // Use dataset instead of setAttribute
    document.documentElement.dataset.density = density;
  }, [density]);

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && mounted) await fetchAndSetUser();
      if (mounted) setIsLoading(false);
    }

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event) => {
        if (event === "SIGNED_IN") await fetchAndSetUser();
        else if (event === "SIGNED_OUT") setUser(null);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchAndSetUser() {
    try {
      const res = await fetch("/api/me");
      if (res.ok) setUser(await res.json());
    } catch { /* ignore */ }
  }

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);

    const res = await fetch("/api/me");
    if (!res.ok) throw new Error("Failed to load profile");
    const profile = await res.json() as AuthUser;
    setUser(profile);

    if (profile.role === "super_admin") router.push("/admin");
    else if (profile.role === "customer") router.push("/customer");
    else router.push("/dashboard");
  }, [supabase, router]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    router.push("/login");
  }, [supabase, router]);

  const navigate = useCallback((path: string) => router.push(path), [router]);
  const openChat = useCallback(() => setChatOpen(true), []);
  const closeChat = useCallback(() => setChatOpen(false), []);

  const flashHighlight = useCallback((key: string) => {
    setHighlight(key);
    setTimeout(() => setHighlight(null), 2400);
  }, []);

  const askAI = useCallback((prompt: string, opts: { highlight?: string } = {}) => {
    setChatOpen(true);
    setPendingPrompt({ text: prompt, ts: Date.now(), highlight: opts.highlight });
  }, []);

  const clearPendingPrompt = useCallback(() => setPendingPrompt(null), []);

  const pinInsight = useCallback((item: PinnedInsight) => {
    setPinned((p) => (p.some((x) => x.id === item.id) ? p : [...p, item]));
  }, []);

  const unpinInsight = useCallback((id: string) => {
    setPinned((p) => p.filter((x) => x.id !== id));
  }, []);

  // Memoize context value to prevent unnecessary re-renders in consumers
  const value = useMemo<AppCtxValue>(
    () => ({
      user, isLoading, login, logout, role,
      chatOpen, openChat, closeChat,
      density, setDensity,
      highlight, flashHighlight,
      pinned, pinInsight, unpinInsight,
      pendingPrompt, askAI, clearPendingPrompt,
      navigate,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, isLoading, role, chatOpen, density, highlight, pinned, pendingPrompt]
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
