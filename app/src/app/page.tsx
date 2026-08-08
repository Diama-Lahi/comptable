import Link from "next/link";

type Module = { href: string; label: string; desc: string };
type Group = { title: string; accent: string; modules: Module[] };

const GROUPS: Group[] = [
  {
    title: "Pilotage",
    accent: "var(--accent-gold)",
    modules: [
      { href: "/exceptions", label: "File d'exceptions", desc: "Tout ce qui attend une revue humaine" },
    ],
  },
  {
    title: "Opérations quotidiennes",
    accent: "var(--accent-blue)",
    modules: [
      { href: "/saisie", label: "Saisie manuelle", desc: "Écritures au débit/crédit" },
      { href: "/factures", label: "Factures — OCR", desc: "Upload, lecture auto, imputation" },
      { href: "/banque", label: "Banque & rapprochement", desc: "Import relevés, matching" },
      { href: "/lettrage", label: "Lettrage & balance âgée", desc: "Factures vs paiements" },
    ],
  },
  {
    title: "Trésorerie & comptes",
    accent: "var(--accent-emerald)",
    modules: [
      { href: "/comptes", label: "Comptes & caisses", desc: "Multi-comptes, multi-devises" },
      { href: "/devises", label: "Devises & taux", desc: "Conversion vers XOF" },
      { href: "/comptes-courants", label: "Comptes courants associés", desc: "Apports / retraits" },
      { href: "/acomptes", label: "Acomptes clients", desc: "Avances & TVA sur acompte" },
      { href: "/previsionnel", label: "Prévisionnel trésorerie", desc: "Projection encaissements/décaissements" },
    ],
  },
  {
    title: "Actifs, paie & charges",
    accent: "var(--accent-gold)",
    modules: [
      { href: "/immobilisations", label: "Immobilisations", desc: "Amortissements" },
      { href: "/paie", label: "Paie & personnel", desc: "Bulletins de salaire" },
      { href: "/stocks", label: "Stocks — valorisation", desc: "CMUP / valorisation" },
      { href: "/notes-de-frais", label: "Notes de frais", desc: "Avances & remboursements" },
    ],
  },
  {
    title: "Clôture & fiscalité",
    accent: "var(--accent-red)",
    modules: [
      { href: "/livres", label: "Livres comptables", desc: "Journal, grand livre, balance" },
      { href: "/cloture", label: "Clôture & TVA", desc: "Périodes fiscales, déclaration" },
      { href: "/regularisations", label: "Régularisations", desc: "Charges/produits à cheval" },
      { href: "/douane", label: "Douane & import", desc: "Droits, TVA à l'import" },
      { href: "/engagements", label: "Engagements hors bilan", desc: "Cautions, garanties, litiges" },
    ],
  },
  {
    title: "Pilotage & clients",
    accent: "var(--accent-blue)",
    modules: [
      { href: "/dashboard", label: "Tableau de bord", desc: "KPI & seuil d'audit" },
      { href: "/projets", label: "Analytique par projet", desc: "Centres de coût" },
      { href: "/produits", label: "Rentabilité produit", desc: "Marge par produit/service" },
      { href: "/consolidation", label: "Consolidation", desc: "Vue multi-entités" },
      { href: "/contrats", label: "Contrats récurrents", desc: "Facturation automatique" },
      { href: "/relances", label: "Relances clients", desc: "Suivi des impayés" },
    ],
  },
  {
    title: "Administration",
    accent: "var(--accent-gold)",
    modules: [
      { href: "/parametres", label: "Paramètres", desc: "Régime fiscal, entreprise" },
      { href: "/securite", label: "Sécurité & accès", desc: "Rôles & conformité" },
    ],
  },
];

export default function Home() {
  const total = GROUPS.reduce((n, g) => n + g.modules.length, 0);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 md:py-14 space-y-10">
      <section
        className="app-card relative overflow-hidden px-7 py-9 md:px-10 md:py-12"
        style={{
          background:
            "linear-gradient(135deg, rgba(91,141,239,0.16), rgba(212,175,106,0.10) 55%, var(--bg-card) 100%)",
        }}
      >
        <div
          className="absolute -right-24 -top-24 w-72 h-72 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(212,175,106,0.20), transparent 70%)" }}
          aria-hidden
        />
        <div className="relative space-y-3 max-w-2xl">
          <span className="app-badge">SYSCOHADA · OHADA</span>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Compta Sénégal
          </h1>
          <p style={{ color: "var(--muted)" }} className="text-sm md:text-base leading-relaxed">
            Plateforme comptable conforme OHADA — saisie, facturation, banque, paie,
            immobilisations, clôture fiscale et pilotage, réunis dans un seul espace de
            travail. {total} modules actifs.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link href="/exceptions" className="app-badge" style={{ color: "var(--accent-gold)" }}>
              Voir ce qui attend une action →
            </Link>
            <Link href="/aide" className="app-badge">
              Pas familier avec la compta ? Lexique ici
            </Link>
          </div>
        </div>
      </section>

      {GROUPS.map((group) => (
        <section key={group.title} className="space-y-3">
          <div className="flex items-center gap-2.5 px-1">
            <span
              className="inline-block rounded-full"
              style={{ width: 7, height: 7, background: group.accent }}
            />
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              {group.title}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {group.modules.map((m) => (
              <Link key={m.href} href={m.href} className="app-module-card group">
                <span
                  className="app-module-icon"
                  style={{ background: `color-mix(in srgb, ${group.accent} 18%, transparent)`, color: group.accent }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M4 6h16M4 12h16M4 18h10"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="font-medium text-[0.95rem]">{m.label}</span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {m.desc}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
