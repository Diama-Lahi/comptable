"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  canResolveInline,
  fetchReviewQueue,
  REVIEW_SOURCE_LABELS,
  REVIEW_SOURCE_LINKS,
  resolveReviewItem,
  type ReviewQueueItem,
} from "@/lib/reviewQueue";

function timeAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  return `il y a ${days} j`;
}

const TONE_BY_TYPE: Record<string, string> = {
  facture: "var(--accent-blue)",
  rapprochement_bancaire: "var(--accent-blue)",
  regularisation_cloture: "var(--accent-gold)",
  bon_de_caisse: "var(--accent-red)",
  declaration_douane: "var(--accent-red)",
  paie: "var(--accent-emerald)",
};

export default function ExceptionsPage() {
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      setItems(await fetchReviewQueue());
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const key = (i: ReviewQueueItem) => `${i.source_type}:${i.source_id}`;

  const act = async (item: ReviewQueueItem, resolution: "confirme_tel_quel" | "rejete") => {
    setBusyKey(key(item));
    setErrorMsg(null);
    try {
      await resolveReviewItem(item, resolution);
      setItems((prev) => prev.filter((i) => key(i) !== key(item)));
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Échec de la mise à jour");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <span className="app-badge">Moteur de confiance</span>
          <h1 className="text-2xl font-semibold tracking-tight">File d&apos;exceptions</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Tout ce qui sort de l&apos;automatisation par défaut, tous modules confondus.
            Le reste est passé automatiquement en comptabilité.
          </p>
        </div>
        <button onClick={load} className="app-badge" disabled={loading}>
          {loading ? "Chargement…" : "Rafraîchir"}
        </button>
      </div>

      {errorMsg && (
        <div className="app-panel px-4 py-3 text-sm" style={{ color: "var(--accent-red)" }}>
          {errorMsg}
        </div>
      )}

      {!loading && items.length === 0 && !errorMsg && (
        <div className="app-card px-6 py-10 text-center space-y-1.5">
          <div className="text-lg font-medium">File vide</div>
          <div className="text-sm" style={{ color: "var(--muted)" }}>
            Rien n&apos;attend de revue pour le moment — tout est passé automatiquement.
          </div>
        </div>
      )}

      <div className="space-y-3">
        {items.map((item) => {
          const inline = canResolveInline(item.source_type);
          const busy = busyKey === key(item);
          return (
            <div key={key(item)} className="app-card px-5 py-4 flex items-start gap-4">
              <span
                className="mt-1.5 inline-block rounded-full shrink-0"
                style={{ width: 8, height: 8, background: TONE_BY_TYPE[item.source_type] ?? "var(--muted)" }}
              />
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                    {REVIEW_SOURCE_LABELS[item.source_type]}
                  </span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    · {timeAgo(item.created_at)}
                  </span>
                </div>
                <div className="text-sm">{item.reason}</div>
                <Link
                  href={REVIEW_SOURCE_LINKS[item.source_type]}
                  className="text-xs underline underline-offset-2"
                  style={{ color: "var(--accent-blue)" }}
                >
                  Ouvrir le module {REVIEW_SOURCE_LINKS[item.source_type]}
                </Link>
              </div>

              {inline && (
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => act(item, "confirme_tel_quel")}
                    disabled={busy}
                    className="text-xs font-medium rounded-lg px-3 py-1.5"
                    style={{ background: "var(--accent-gold-soft)", color: "var(--accent-gold)" }}
                  >
                    {busy ? "…" : "Confirmer"}
                  </button>
                  <button
                    onClick={() => act(item, "rejete")}
                    disabled={busy}
                    className="text-xs font-medium rounded-lg px-3 py-1.5"
                    style={{ background: "rgba(240,97,110,0.12)", color: "var(--accent-red)" }}
                  >
                    {busy ? "…" : "Rejeter"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
