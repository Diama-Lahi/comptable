import Link from "next/link";

type Term = { term: string; def: string };
type Group = { title: string; terms: Term[] };

const GROUPS: Group[] = [
  {
    title: "Les bases",
    terms: [
      {
        term: "Débit / Crédit",
        def: "Chaque écriture bouge au moins deux comptes : un débit, un crédit, toujours pour le même montant total. Pour un compte de charge (achat, salaire) ou d'actif (banque, stock), un débit l'augmente. Pour un compte de produit (vente) ou de passif (dette), c'est le crédit qui l'augmente.",
      },
      {
        term: "Écriture",
        def: "Un mouvement comptable complet : une date, une description, et au moins deux lignes (débit/crédit) qui s'équilibrent. Générée automatiquement par les modules (factures, paie...) ou saisie à la main dans /saisie.",
      },
      {
        term: "Journal",
        def: "Un classeur qui regroupe les écritures par origine : AC (achats), VE (ventes), BQ (banque), CA (caisse), OD (opérations diverses — tout le reste : paie, clôture, régularisations...).",
      },
      {
        term: "Grand livre / Balance",
        def: "Le grand livre montre toutes les écritures d'un compte précis avec le solde qui s'accumule. La balance résume le solde de tous les comptes en une seule page — le point de départ pour vérifier que tout est cohérent.",
      },
      {
        term: "SYSCOHADA / OHADA",
        def: "Le référentiel comptable commun à 17 pays d'Afrique de l'Ouest et Centrale, dont le Sénégal. Il fixe la liste des comptes (le \"plan comptable\") et les règles de présentation des états financiers.",
      },
    ],
  },
  {
    title: "Factures et paiements",
    terms: [
      {
        term: "TVA collectée / déductible",
        def: "Collectée : la TVA que tu factures à tes clients (tu la dois à l'État). Déductible : la TVA que tes fournisseurs t'ont facturée (l'État te la doit). La différence entre les deux, c'est ce qui se règle à la clôture.",
      },
      {
        term: "Lettrage",
        def: "Le fait de relier un paiement à la facture précise qu'il solde. Une facture non lettrée n'a reçu aucun paiement ; partielle, un paiement incomplet ; soldée, elle est intégralement payée.",
      },
      {
        term: "Écart de change",
        def: "Quand une facture est en devise étrangère (USD, EUR...), le montant en francs CFA dépend du taux de change. Si le taux a changé entre la facture et le règlement, la différence est un gain ou une perte de change — calculée automatiquement dans /lettrage.",
      },
      {
        term: "Numérotation légale",
        def: "Tes propres factures de vente doivent être numérotées dans l'ordre, sans trou, par année. L'application s'en charge automatiquement dans /factures — jamais à modifier à la main.",
      },
    ],
  },
  {
    title: "Clôture et fin d'exercice",
    terms: [
      {
        term: "Période fiscale / clôture",
        def: "Un mois (ou trimestre) est \"clôturé\" une fois vérifié et figé — plus aucune écriture ne peut y être ajoutée après coup (voir /cloture).",
      },
      {
        term: "Régularisation",
        def: "Un ajustement de fin de période pour rattacher une charge/produit au bon mois même si la facture arrive plus tard (charge à payer, produit constaté d'avance...).",
      },
      {
        term: "Immobilisation / amortissement",
        def: "Un bien durable (ordinateur, véhicule...) ne se comptabilise pas comme une charge immédiate : sa valeur est répartie (\"amortie\") sur plusieurs années.",
      },
      {
        term: "Variation de stock / CMV",
        def: "Le coût des marchandises vendues (CMV) : combien a réellement coûté ce qui a été vendu ce mois-ci. Calculé automatiquement dans /stocks en comparant la valeur du stock à deux dates.",
      },
      {
        term: "Seuil d'audit légal",
        def: "Au-delà d'un certain chiffre d'affaires ou effectif, la loi OHADA impose un commissaire aux comptes. Le tableau de bord affiche un simple indicateur — à confirmer auprès d'un professionnel.",
      },
    ],
  },
  {
    title: "Automatisation",
    terms: [
      {
        term: "Moteur de confiance",
        def: "Principe directeur de l'application : la plupart des écritures (factures reconnues, paie habituelle, bons de caisse sous un plafond...) sont enregistrées automatiquement. Seuls les cas inhabituels remontent pour une vérification humaine.",
      },
      {
        term: "File d'exceptions",
        def: "L'écran /exceptions rassemble tout ce qui n'a pas été jugé assez fiable pour passer automatiquement — une facture d'un nouveau fournisseur, un salaire inhabituel, un écart de douane... Le reste ne demande aucune action.",
      },
    ],
  },
];

export default function AidePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10 space-y-8">
      <div className="space-y-2">
        <span className="app-badge">Aide</span>
        <h1 className="text-2xl font-semibold tracking-tight">Comprendre l&apos;application</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Un lexique des termes comptables utilisés dans l&apos;interface. Pas besoin d&apos;être comptable pour
          utiliser l&apos;application — mais ça aide de savoir ce que chaque mot recouvre.
        </p>
      </div>

      <div className="app-card px-5 py-4 space-y-2 text-sm">
        <div className="font-medium">Comment naviguer</div>
        <p style={{ color: "var(--muted)" }}>
          La barre latérale regroupe les écrans par usage : <strong>Pilotage</strong> pour voir ce qui a besoin
          d&apos;attention, <strong>Opérations quotidiennes</strong> pour la saisie du jour, <strong>Trésorerie</strong>{" "}
          pour l&apos;argent qui rentre/sort, <strong>Clôture &amp; fiscalité</strong> pour la fin de mois. Si tu ne
          sais pas où commencer :{" "}
          <Link href="/exceptions" className="underline" style={{ color: "var(--accent-blue)" }}>
            /exceptions
          </Link>{" "}
          montre toujours ce qui attend réellement une action.
        </p>
      </div>

      {GROUPS.map((group) => (
        <section key={group.title} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            {group.title}
          </h2>
          <div className="space-y-2">
            {group.terms.map((t) => (
              <div key={t.term} className="app-panel px-4 py-3">
                <div className="font-medium text-sm">{t.term}</div>
                <p className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>
                  {t.def}
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
