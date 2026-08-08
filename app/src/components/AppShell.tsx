"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/auth";

type NavItem = { href: string; label: string; badge?: string };
type NavGroup = { title: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    title: "Pilotage",
    items: [
      { href: "/exceptions", label: "File d'exceptions" },
      { href: "/aide", label: "Aide & lexique" },
    ],
  },
  {
    title: "Opérations quotidiennes",
    items: [
      { href: "/saisie", label: "Saisie manuelle" },
      { href: "/factures", label: "Factures — OCR" },
      { href: "/banque", label: "Banque & rapprochement" },
      { href: "/lettrage", label: "Lettrage & balance âgée" },
    ],
  },
  {
    title: "Cycle Achats",
    items: [
      { href: "/bons-de-commande", label: "Bons de commande" },
      { href: "/factures", label: "Factures — OCR" },
      { href: "/controle-conformite", label: "Contrôle conformité" },
      { href: "/echeancier-fournisseurs", label: "Échéancier" },
      { href: "/paiements-fournisseurs", label: "Virements & paiements" },
    ],
  },
  {
    title: "Cycle Ventes",
    items: [
      { href: "/devis", label: "Devis" },
      { href: "/factures-clients", label: "Facturation clients" },
      { href: "/acomptes-clients", label: "Acomptes & TVA" },
      { href: "/relances", label: "Relances clients" },
      { href: "/avoirs", label: "Avoirs" },
    ],
  },
  {
    title: "Trésorerie & comptes",
    items: [
      { href: "/comptes", label: "Comptes & caisses" },
      { href: "/devises", label: "Devises & taux" },
      { href: "/comptes-courants", label: "Comptes courants associés" },
      { href: "/acomptes", label: "Acomptes clients" },
      { href: "/previsionnel", label: "Prévisionnel trésorerie" },
    ],
  },
  {
    title: "Actifs, paie & charges",
    items: [
      { href: "/immobilisations", label: "Immobilisations" },
      { href: "/paie", label: "Paie & personnel" },
      { href: "/stocks", label: "Stocks — valorisation" },
      { href: "/notes-de-frais", label: "Notes de frais" },
    ],
  },
  {
    title: "Clôture & fiscalité",
    items: [
      { href: "/livres", label: "Livres comptables" },
      { href: "/cloture", label: "Clôture & TVA" },
      { href: "/regularisations", label: "Régularisations" },
      { href: "/douane", label: "Douane & import" },
      { href: "/engagements", label: "Engagements hors bilan" },
    ],
  },
  {
    title: "Pilotage & clients",
    items: [
      { href: "/dashboard", label: "Tableau de bord" },
      { href: "/projets", label: "Analytique par projet" },
      { href: "/produits", label: "Rentabilité produit" },
      { href: "/consolidation", label: "Consolidation" },
      { href: "/contrats", label: "Contrats récurrents" },
      { href: "/relances", label: "Relances clients" },
    ],
  },
  {
    title: "Cabinet",
    items: [
      { href: "/cabinet", label: "Dashboard multi-entités" },
      { href: "/honoraires", label: "Honoraires & facturation" },
      { href: "/migration", label: "Import Sage/EBP" },
    ],
  },
  {
    title: "Fiscalité & déclarations",
    items: [
      { href: "/fiscalite/brs", label: "BRS — Retenues à la source" },
      { href: "/fiscalite/echeancier", label: "Échéancier fiscal" },
      { href: "/fiscalite/dsf", label: "DSF — Déclaration fiscale" },
    ],
  },
  {
    title: "Trésorerie avancée",
    items: [
      { href: "/tresorerie/mobile-money", label: "Mobile Money (Wave/OM)" },
      { href: "/tresorerie/cheques", label: "Chèques & traites" },
      { href: "/tresorerie/caisse", label: "Caisse & billetage" },
    ],
  },
  {
    title: "Pilotage avancé",
    items: [
      { href: "/budgets", label: "Budgets & écarts" },
      { href: "/conformite", label: "Score de conformité" },
      { href: "/audit-report", label: "Rapport d'audit" },
    ],
  },
  {
    title: "Gouvernance & sécurité",
    items: [
      { href: "/audit", label: "Piste d'audit" },
      { href: "/securite", label: "Sécurité & 2FA" },
    ],
  },
  {
    title: "Administration",
    items: [
      { href: "/parametres", label: "Paramètres" },
    ],
  },
];

function IconMark() {
  return (
    <span
      className="app-module-icon"
      style={{ width: 34, height: 34, borderRadius: 9 }}
      aria-hidden
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path
          d="M4 19V9l8-5 8 5v10M4 19h16M4 19v-6h4v6M14 19v-6h4v6M9 19v-4h2v4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export default function AppShell({
  children,
  userEmail,
}: {
  children: React.ReactNode;
  userEmail?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen flex">
      {/* Mobile top bar */}
      <div
        className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center justify-between px-4 py-3 app-panel"
        style={{ borderRadius: 0 }}
      >
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <IconMark />
          <span>Compta Sénégal</span>
        </Link>
        <button
          onClick={() => setOpen((v) => !v)}
          className="app-badge"
          aria-label="Ouvrir le menu"
        >
          Menu
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed md:static z-20 top-0 left-0 h-full md:h-auto w-72 shrink-0 border-r overflow-y-auto app-scrollarea transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
        style={{
          background:
            "linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-base) 100%)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="px-5 py-6 hidden md:flex items-center gap-2.5">
          <IconMark />
          <div className="leading-tight">
            <div className="font-semibold tracking-tight">Compta Sénégal</div>
            <div className="text-[11px]" style={{ color: "var(--muted)" }}>
              Gestion OHADA — SYSCOHADA
            </div>
          </div>
        </div>

        <div className="pt-16 md:pt-0 px-3 pb-8 space-y-5">
          {NAV.map((group) => (
            <div key={group.title}>
              <div
                className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--muted)" }}
              >
                {group.title}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors"
                      style={{
                        background: active ? "var(--accent-gold-soft)" : "transparent",
                        color: active ? "var(--accent-gold)" : "var(--foreground)",
                        fontWeight: active ? 600 : 450,
                      }}
                    >
                      <span
                        className="inline-block rounded-full"
                        style={{
                          width: 5,
                          height: 5,
                          background: active ? "var(--accent-gold)" : "var(--border-strong)",
                        }}
                      />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {userEmail && (
          <div
            className="px-5 py-4 border-t text-xs space-y-2"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div className="truncate" style={{ color: "var(--muted)" }}>
              {userEmail}
            </div>
            <button
              onClick={handleLogout}
              className="app-badge"
              style={{ cursor: "pointer" }}
            >
              Se déconnecter
            </button>
          </div>
        )}
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-10 md:hidden"
          style={{ background: "rgba(4, 8, 16, 0.6)" }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 pt-14 md:pt-0">
        <div className="min-h-screen">{children}</div>
      </div>
    </div>
  );
}
