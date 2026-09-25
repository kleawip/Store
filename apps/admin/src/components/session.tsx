"use client";

import type { StaffSession } from "@kleawip/contract";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiProblem, setCsrfToken } from "@/lib/api";

type SessionState = {
  staff: StaffSession["staff"];
  can: (permission: string) => boolean;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside <RequireSession>");
  return session;
}

/** Loads the staff session; sends anyone signed out to /login and back here afterwards. */
export function RequireSession({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<StaffSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<StaffSession>("/v1/admin/auth/me")
      .then((result) => {
        setCsrfToken(result.csrfToken);
        setSession(result);
      })
      .catch((problem) => {
        if (problem instanceof ApiProblem && problem.status === 401) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        else setError("The admin API is not reachable. Start it with `npm run api:dev`.");
      });
  }, [router, pathname]);

  const signOut = useCallback(async () => {
    await api("/v1/admin/auth/logout", { method: "POST" }).catch(() => undefined);
    setCsrfToken(null);
    router.replace("/login");
  }, [router]);

  if (error) return <div className="center-state"><p>{error}</p></div>;
  if (!session) return <div className="center-state"><div className="spinner" aria-label="Loading" /></div>;

  const value: SessionState = { staff: session.staff, can: (permission) => session.staff.permissions.includes(permission), signOut };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
