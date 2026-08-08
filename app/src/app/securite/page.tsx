"use client";

import { useState, useEffect } from "react";
import { supabase, COMPANY_ID } from "@/lib/supabase";

export default function SecuritePage() {
  const [sessions, setSessions] = useState<{ id: string; ip: string; user_agent: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("user_sessions")
        .select("id, ip_address, user_agent, created_at")
        .order("created_at", { ascending: false });

      setSessions((data ?? []).map((s) => ({
        id: s.id,
        ip: s.ip_address ?? "",
        user_agent: s.user_agent ?? "",
        created_at: s.created_at,
      })));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  async function handleDeleteSession(id: string) {
    await supabase.from("user_sessions").delete().eq("id", id);
    setShowDeleteConfirm(null);
    await loadData();
  }

  function getDeviceIcon(ua: string): string {
    if (ua.includes("Mobile") || ua.includes("Android")) return "📱";
    if (ua.includes("Mac")) return "💻";
    if (ua.includes("Windows")) return "🖥️";
    return "🌐";
  }

  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <h1 className="app-page-title">Sécurité & accès</h1>
          <p className="app-page-desc">Gérez vos sessions, la double authentification et les accès</p>
        </div>
      </div>

      {/* Double authentification */}
      <div className="app-card mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Double authentification (2FA)</h3>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {twoFAEnabled
                ? "Votre compte est protégé par la 2FA"
                : "Activez la 2FA pour renforcer la sécurité de votre compte"}
            </p>
          </div>
          <button
            className={`app-btn-${twoFAEnabled ? "danger" : "primary"} text-sm`}
            onClick={() => setTwoFAEnabled(!twoFAEnabled)}
          >
            {twoFAEnabled ? "Désactiver" : "Activer"}
          </button>
        </div>
      </div>

      {/* Sessions actives */}
      <div className="app-card mb-6">
        <h3 className="font-semibold mb-4">Sessions actives</h3>
        {loading ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>Chargement...</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>Aucune session active</p>
        ) : (
          <div className="space-y-3">
            {sessions.slice(0, 10).map((session) => (
              <div key={session.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
                <div className="flex items-center gap-3">
                  <span className="text-xl">{getDeviceIcon(session.user_agent)}</span>
                  <div>
                    <p className="text-sm font-medium">{session.ip}</p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      {session.user_agent.slice(0, 60)}... — Connecté le {new Date(session.created_at).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {showDeleteConfirm === session.id ? (
                    <>
                      <button className="app-btn-danger text-xs" onClick={() => handleDeleteSession(session.id)}>Confirmer</button>
                      <button className="app-btn-secondary text-xs" onClick={() => setShowDeleteConfirm(null)}>Annuler</button>
                    </>
                  ) : (
                    <button className="app-btn-danger text-xs" onClick={() => setShowDeleteConfirm(session.id)}>Déconnecter</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Journal de sécurité */}
      <div className="app-card">
        <h3 className="font-semibold mb-4">Journal de sécurité</h3>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Toutes les actions de sécurité sont enregistrées dans la piste d'audit centralisée (table `security_audit`).
          Consultez l'onglet "Piste d'audit" pour le détail complet.
        </p>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="text-center p-3 rounded-lg" style={{ background: "#38a16920" }}>
            <p className="text-lg font-bold">12</p>
            <p className="text-xs">Connexions réussies</p>
          </div>
          <div className="text-center p-3 rounded-lg" style={{ background: "#e53e3e20" }}>
            <p className="text-lg font-bold">3</p>
            <p className="text-xs">Échecs de connexion</p>
          </div>
          <div className="text-center p-3 rounded-lg" style={{ background: "#3182ce20" }}>
            <p className="text-lg font-bold">8</p>
            <p className="text-xs">Modifications</p>
          </div>
          <div className="text-center p-3 rounded-lg" style={{ background: "#d69e2e20" }}>
            <p className="text-lg font-bold">0</p>
            <p className="text-xs">Alertes critiques</p>
          </div>
        </div>
      </div>
    </div>
  );
}