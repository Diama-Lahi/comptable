"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { loadProfile, type AuthProfile } from "@/lib/auth";
import AppShell from "./AppShell";

const PUBLIC_PATHS = ["/login", "/signup"];

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<AuthProfile | null>(null);

  useEffect(() => {
    let mounted = true;

    async function check() {
      const p = await loadProfile();
      if (!mounted) return;
      setProfile(p);
      setReady(true);
      if (!p && !PUBLIC_PATHS.includes(pathname)) {
        router.replace("/login");
      }
      if (p && PUBLIC_PATHS.includes(pathname)) {
        router.replace("/");
      }
    }
    check();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      check();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (PUBLIC_PATHS.includes(pathname)) return <>{children}</>;

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm" style={{ color: "var(--muted)" }}>
        Chargement…
      </div>
    );
  }

  if (!profile) return null;

  return <AppShell userEmail={profile.email}>{children}</AppShell>;
}
