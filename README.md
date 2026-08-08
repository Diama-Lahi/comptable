# Application de comptabilité — Sénégal

Projet : automatisation du travail comptable (usage personnel + future offre SaaS).

## Contenu

- `docs/cahier-des-charges-compta.docx` — cahier des charges initial (modules, architecture, modèle économique)
- `docs/plan-detaille-comptable.docx` — plan détaillé par activité (saisie, factures, banque, clôture, TVA, déclarations fiscales, bon de caisse)
- `sql/schema.sql` — schéma Supabase complet (15 tables) + fonctions `seed_default_chart_of_accounts()` et `seed_default_journals()` (plan comptable SYSCOHADA)
- `docs/gaps-comptabilite.md` — 9 zones identifiées comme manquantes du plan initial (immobilisations, paie, stocks, devises, régularisations, régime fiscal, analytique par projet, notes de frais, archivage légal), avec priorisation
- `sql/schema-extensions.sql` — tables correspondantes (partie 1), appliquées à la base réelle
- `docs/gaps-comptabilite-2.md` — approfondissement (partie 2) : lettrage clients/fournisseurs, facturation client conforme, comptes courants associés, acomptes clients, douane/import, engagements hors bilan, multi-comptes bancaires/caisses, seuil d'audit légal, consolidation multi-entités
- `sql/schema-extensions-2.sql` — tables correspondantes (partie 2), appliquées à la base réelle
- `docs/gaps-comptabilite-3.md` — approfondissement (partie 3) : sécurité des données/CDP, sauvegarde et continuité, relances clients automatisées, rentabilité par produit, prévisionnel de trésorerie, spécificités Wave/Orange Money, accès cabinet comptable externe, contrats et facturation récurrente
- `sql/schema-extensions-3.sql` — tables correspondantes (partie 3), appliquées à la base réelle
- `docs/architecture-automatisation-maximale.md` — principe directeur : automatisation totale par défaut, revue humaine uniquement sur exceptions (moteur de confiance + file d'exceptions unique)
- `sql/schema-extensions-4.sql` — moteur de confiance (`confidence_score`/`needs_review` sur factures, paie, amortissements, bons de caisse, douane) + vue `monthly_review_queue` + table `review_resolutions`, appliqués à la base réelle
- `sql/schema-extensions-5.sql` — comptes d'écart de change (676/776), variation de stock automatique (compte 603, table `stock_variation_closures`), et extension de `entries.source` pour l'import Excel, appliqués à la base réelle
- `sql/schema-extensions-6.sql` — **Module 6** : table `profiles` (lien auth.users ↔ entreprise), auto-provisioning d'une entreprise à l'inscription (trigger `handle_new_user`), fonction `auth_company_id()`, activation de Row Level Security avec policy d'isolation par entreprise sur les ~45 tables métier, appliqué à la base réelle

## État d'avancement

- [x] Cahier des charges
- [x] Plan détaillé par activité comptable
- [x] Schéma SQL (tables + seed SYSCOHADA)
- [x] Projet Supabase créé (org "xarala tech", projet "Xarala tech Project", région ca-central-1)
- [x] Application du schéma à une base réelle (entreprise créée, 48 comptes + 5 journaux SYSCOHADA chargés)
- [x] Écran de saisie manuelle (Module 1) — `app/src/app/saisie/page.tsx`
- [x] Upload + OCR des factures (Module 1) — `app/src/app/factures/page.tsx` (OCR client-side via tesseract.js, champs pré-remplis à vérifier par l'utilisateur)
- [x] Moteur d'imputation automatique (Module 1) — `app/src/lib/imputation.ts` : suggestion de compte par tiers (historique `imputation_rules`), génération automatique de l'écriture (journal AC/VE, TVA 4452/4431, collectif 401/411) et mise à jour du statut facture → `imputed`
- [x] **Module 1 terminé** (saisie manuelle, upload+OCR, imputation automatique)
- [x] Import bancaire + rapprochement (Module 2) — `app/src/app/banque/page.tsx` : import CSV (date, libellé, montant), dédoublonnage à l'import, rapprochement auto par montant/date (compte 521) avec niveau de confiance, choix manuel sinon
- [x] Livres comptables (Module 3) — `app/src/app/livres/page.tsx` : journal (filtrable par journal/période), grand livre par compte avec solde cumulé, balance générale (débit/crédit/solde par compte mouvementé)
- [x] Clôture, tableau de TVA, déclarations fiscales (Module 4) — `app/src/app/cloture/page.tsx` : création de périodes fiscales, calcul TVA collectée (4431) / déductible (4452) / nette, clôture avec génération de l'écriture de solde (journal OD) vers 4441
- [x] Tableau de bord KPI (Module 5) — `app/src/app/dashboard/page.tsx` : CA, charges, résultat net (période filtrable), trésorerie, créances clients, dettes fournisseurs, factures non soldées
- [x] Multi-entreprises / SaaS (Module 6) — authentification Supabase Auth (`/login`, `/signup`), isolation des données par entreprise via Row Level Security (`sql/schema-extensions-6.sql`)
- [x] Extensions du schéma (2026-07-16) — 11 tables ajoutées, RLS désactivé (cohérent avec le reste) : `fixed_assets`/`depreciation_schedule` (immobilisations), `employees`/`payslips` (paie), `stock_valuations`, `exchange_rates` (+ colonnes devise sur `invoices`), `period_adjustments` (régularisations), `tax_regime` sur `companies`, `cost_centers` (+ colonne sur `entry_lines`), `expense_reports`/`advances` (notes de frais), `document_archive_policy`.
- [x] Écrans pour les priorités hautes/moyennes du document `gaps-comptabilite.md` (2026-07-16) :
  - `/parametres` : régime fiscal de l'entreprise (réel normal / simplifié / CGU) ; `/cloture` s'adapte (pas de TVA affichée/générée en CGU)
  - `/regularisations` : détection des créances clients douteuses (factures non soldées échues depuis 60+ jours), régularisations manuelles (charge à payer / produit constaté d'avance), validation → écriture générée (journal OD)
  - `/immobilisations` : registre des immobilisations, dotation aux amortissements mensuelle générée à la demande (linéaire, 681/28x), sortie d'immobilisation → écriture de cession générée automatiquement (solde amort./actif, encaissement 571, plus/moins-value 654/754)
  - `/notes-de-frais` : soumission/approbation/remboursement de notes de frais (justificatif dans le bucket `invoices`, écriture générée au remboursement), avances données/réglées
  - `/projets` : création de centres de coût, résultat (produits − charges) par projet sur une période ; `/saisie` permet d'assigner un projet à chaque ligne d'écriture
  - Comptes SYSCOHADA ajoutés au plan comptable existant : `487` (produits constatés d'avance), `491` (provisions dépréciation clients), `659` (dotations aux provisions clients), `654`/`754` (valeurs comptables et produits des cessions d'immobilisations)
- [x] Écrans pour les priorités basses de `gaps-comptabilite.md` (2026-07-16) :
  - `/paie` : fiches employés, bulletins de paie (cotisations/retenues saisies manuellement — barèmes IPRES/IPM/CSS non calculés automatiquement), validation → écriture de charges de personnel (661/664/421/431/447), paiement → écriture de règlement (421/571)
  - `/stocks` : valorisation manuelle simplifiée (quantité × CMP) ; ne gère pas le stock opérationnel ni le calcul automatique du CMV — décision d'intégration avec le système de stock existant toujours en attente
  - `/devises` : gestion des taux de change ; `/factures` accepte une devise étrangère et convertit en XOF au taux du jour pour la comptabilisation (écart de change à l'encaissement pas encore automatisé)
- [x] Schéma étendu (parties 2 et 3, 2026-07-16) — récupéré depuis une autre session/IDE (`Desktop/ide/compta-senegal-project`) et intégré ici. 20 tables supplémentaires ajoutées, RLS désactivé (cohérent avec le reste) :
  - Partie 2 : `invoice_payment_links` + `invoices.lettering_status` (lettrage), `invoice_sequences` + fonction `next_invoice_number()` + `invoices.legal_number`/`is_cancelled` (facturation client conforme), `partners`/`partner_current_account_movements` (comptes courants associés), `customer_deposits` (acomptes clients), `customs_declarations` (douane/import), `off_balance_commitments` (engagements hors bilan), `cash_bank_accounts` + colonnes sur `bank_transactions`/`cash_vouchers` (multi-comptes), `companies.annual_revenue_estimate`/`employee_count_estimate` (indicateur seuil d'audit), `consolidation_groups`/`consolidation_group_members`
  - Partie 3 : `user_roles`, `data_processing_registry` (sécurité/CDP), `backup_log` (sauvegarde), `reminder_rules`/`customer_reminders_sent` (relances), `products_services` + `invoice_lines.product_id` (rentabilité par produit), `recurring_charges` + vue `cash_flow_forecast_inputs` (prévisionnel trésorerie), `cash_bank_accounts.provider`/`settlement_delay_days` + `mobile_money_fees` (Wave/Orange Money), `contracts`/`recurring_invoice_log` (facturation récurrente)
- [x] Écrans pour les priorités hautes des parties 2/3 (2026-07-16) :
  - `/comptes` : gestion des comptes bancaires/caisses multiples (`cash_bank_accounts`), avec fournisseur (banque classique / Wave / Orange Money) et délai de règlement
  - `/factures` : numérotation légale sans trou pour les factures clients (fonction `next_invoice_number()`, format `FAC-{année}-{numéro}`), annulation par avoir (facture miroir en négatif, liée via `cancelled_by_invoice_id`, ligne barrée dans la liste)
  - `/lettrage` : factures non soldées avec solde restant, enregistrement de paiements liés (`invoice_payment_links`) → écriture générée (journal BQ, 411/401) et mise à jour du statut de lettrage (non lettrée / partielle / soldée), balance âgée des créances clients (0-30/30-60/60-90/90+ jours)
  - `/contrats` : contrats client (montant, fréquence, compte de produit par défaut), génération de facture récurrente par période avec numérotation légale et imputation automatique (`recurring_invoice_log` empêche les doublons)
- [x] Écrans pour les priorités moyennes des parties 2/3 (2026-07-16) :
  - `/comptes-courants` : associés, mouvements (apport/retrait/intérêt) → écriture générée (455/571), solde courant par associé
  - `/acomptes` : acomptes clients reçus → encaissement + écriture (571/4191, avec TVA à l'encaissement si prestation de service), application à une facture finale (solde 4191 contre 411)
  - `/relances` : règles de relance (J+7/15/30, ton escaladant), détection des factures à relancer, suivi manuel de l'historique (`customer_reminders_sent`) — **aucun envoi automatique d'email/SMS/WhatsApp**, pas de fournisseur configuré
  - `/comptes` : section frais Wave/Orange Money ajoutée (`mobile_money_fees`) → écriture générée (631 Frais bancaires)
  - `/securite` : registre déclaratif des rôles/accès (`user_roles`) et des traitements de données personnelles CDP (`data_processing_registry`) — **déclaratif seulement, aucune authentification réelle ni application technique des permissions** (voir limites connues)
  - Comptes SYSCOHADA ajoutés : `455` (comptes courants associés), `4191` (clients — avances et acomptes reçus)
- [x] Écrans pour les priorités basses des parties 2/3 (2026-07-16) — **plan complet des deux documents de gaps désormais couvert par un écran** :
  - `/douane` : déclarations douanières liées à un achat fournisseur, coût de revient total calculé (`total_landed_cost`)
  - `/engagements` : registre manuel des engagements hors bilan (cautions, garanties, crédit-bail, litiges)
  - `/parametres` + `/dashboard` : indicateur de seuil d'audit légal (CA/effectif estimés vs seuils OHADA couramment cités — **à reconfirmer auprès d'un professionnel**, alerte informative seulement)
  - `/consolidation` : groupes d'entreprises, vue simple par addition des CA estimés (pas de consolidation comptable légale) — peu utile tant qu'une seule entreprise existe dans ce projet
  - `/produits` : produits/services, rattachement d'une ligne de vente à une facture existante (`invoice_lines.product_id`), marge par produit (CA − coût direct)
  - `/previsionnel` : charges récurrentes + vue `cash_flow_forecast_inputs`, projection de trésorerie avec alerte si négative — limité aux charges récurrentes tant que `invoices.due_date` n'est pas renseigné par `/factures`
  - `/securite` : mise en évidence des accès « cabinet externe » expirant sous 7 jours

## Stack prévue

- Frontend : Next.js (Vercel)
- Backend/DB : Supabase (Postgres + RLS)
- Paiements SaaS (phase 5) : Wave / Orange Money via PayTech ou Intouch

## Projet Supabase

- Organisation : `xarala tech` (org id `zyuqncywewcvzqmeuhbh`)
- Projet : `Xarala tech Project` (project id `bmbocbkylxmfefapglww`, région ca-central-1)
- Entreprise seed (`companies.id`) : `a2fde501-753e-4f05-8aca-7af4f9200690`

## Frontend

- `app/` — Next.js (App Router, TypeScript, Tailwind), client Supabase dans `app/src/lib/supabase.ts`
- Clés Supabase dans `app/.env.local` (non versionné)
- Page `/saisie` : formulaire de saisie manuelle d'écriture (journal, date, lignes débit/crédit équilibrées) → écrit dans `entries` + `entry_lines`
- Page `/factures` : upload facture + OCR, tiers auto-créé/rattaché, compte suggéré depuis l'historique du tiers ; si compte + montant + date renseignés, génère automatiquement l'écriture (journal AC pour fournisseur, VE pour client) et passe la facture en statut `imputed`
- Storage Supabase : bucket `invoices` (privé, policies anon read/write ajoutées avec confirmation explicite)
- Page `/banque` : import CSV de relevé bancaire → `bank_transactions`, rapprochement avec les écritures du compte 521 (Banques) → `reconciliations` ; confiance `certain` (même date), `probable` (±3 jours), sinon sélection manuelle
- Page `/livres` : onglets Journal / Grand livre / Balance, filtres journal + période, calcul du solde (débiteur pour actif/charge, créditeur pour passif/produit) — logique dans `app/src/lib/ledger.ts`
- Page `/cloture` : gestion des `fiscal_periods`, tableau de TVA (collectée − déductible = TVA à payer ou crédit de TVA) sur la période, clôture qui génère l'écriture de solde et passe la période à `closed` — logique dans `app/src/lib/closing.ts`. Pas d'enforcement bloquant la saisie sur une période déjà clôturée (à ajouter si besoin).
- Page `/dashboard` : tuiles KPI (CA, charges, résultat net sur une période choisie ; trésorerie 521/531/571/585, créances 411, dettes 401 à ce jour ; factures clients/fournisseurs non soldées) — logique dans `app/src/lib/dashboard.ts`
- Page `/parametres` : régime fiscal de l'entreprise — logique dans `app/src/lib/closing.ts` (`fetchTaxRegime`)
- Page `/regularisations` : régularisations de fin d'exercice — logique dans `app/src/lib/adjustments.ts`
- Page `/immobilisations` : immobilisations et amortissements — logique dans `app/src/lib/fixedAssets.ts`
- Page `/notes-de-frais` : notes de frais et avances — logique dans `app/src/lib/expenses.ts` (justificatifs stockés dans le bucket `invoices`, sous-dossier `expenses/`)
- Page `/projets` : comptabilité analytique par projet — logique dans `app/src/lib/costCenters.ts` ; `entry_lines.cost_center_id` assignable depuis `/saisie`
- Page `/paie` : paie et personnel — logique dans `app/src/lib/payroll.ts`
- Page `/stocks` : valorisation de stock simplifiée — logique dans `app/src/lib/stock.ts`
- Page `/devises` : taux de change — logique dans `app/src/lib/currency.ts`, utilisé par `/factures` pour la conversion en XOF
- Page `/comptes` : comptes bancaires/caisses — logique dans `app/src/lib/cashAccounts.ts` ; section bon de caisse — logique dans `app/src/lib/cashVouchers.ts`
- Page `/lettrage` : lettrage factures/paiements et balance âgée — logique dans `app/src/lib/lettering.ts` ; `/factures` génère un numéro légal sans trou et permet l'annulation par avoir — logique dans `app/src/lib/legalInvoicing.ts`
- Page `/contrats` : contrats et facturation récurrente — logique dans `app/src/lib/contracts.ts` (réutilise `imputation.ts` et `legalInvoicing.ts`)
- Page `/comptes-courants` : comptes courants associés — logique dans `app/src/lib/partners.ts`
- Page `/acomptes` : acomptes clients — logique dans `app/src/lib/deposits.ts`
- Page `/relances` : relances clients (suivi manuel) — logique dans `app/src/lib/reminders.ts`
- Section frais Wave/Orange Money dans `/comptes` — logique dans `app/src/lib/mobileMoneyFees.ts`
- Page `/securite` : registre déclaratif rôles/accès et traitements de données — logique dans `app/src/lib/roles.ts`
- Page `/douane` : déclarations douanières — logique dans `app/src/lib/customs.ts`
- Page `/engagements` : engagements hors bilan — logique dans `app/src/lib/commitments.ts`
- Page `/consolidation` : groupes multi-entités — logique dans `app/src/lib/consolidation.ts`
- Page `/produits` : rentabilité par produit — logique dans `app/src/lib/products.ts`
- Page `/previsionnel` : prévisionnel de trésorerie — logique dans `app/src/lib/forecast.ts`
- Indicateur de seuil d'audit légal sur `/dashboard` — logique dans `app/src/lib/dashboard.ts` (`fetchAuditThresholdCheck`)
- Page `/exceptions` : file d'exceptions unique (moteur de confiance) — logique dans `app/src/lib/reviewQueue.ts`, lit la vue `monthly_review_queue` ; résolution en un clic pour factures/bons de caisse/douane/paie/rapprochements, renvoie vers le module d'origine pour les régularisations de clôture (déjà son propre workflow validation/rejet)
- Refonte visuelle complète : thème sombre (bleu nuit/or), navigation latérale groupée par catégorie (`app/src/components/AppShell.tsx`), page d'accueil type dashboard avec cartes en relief

Pour lancer en local :

```bash
cd app
npm run dev
```

## Tests effectués (2026-07-16)

- Smoke test des 28 pages : 200 OK, pas d'erreur serveur.
- **Bug critique trouvé et corrigé** : RLS était activé sur les tables métier sans policies → la clé anon ne voyait aucune donnée (résultats vides silencieux, pas d'erreur). Corrigé en désactivant RLS explicitement sur toutes les tables, y compris les nouvelles (cohérent avec l'usage perso solo actuel — **à réactiver avec de vraies policies avant tout accès public/SaaS, Module 6**).
- Flux vérifiés bout en bout avec des données de test (créées puis nettoyées) : régularisation, immobilisation (création + dotation), bulletin de paie (écriture équilibrée 324 000/324 000), taux de change, valorisation de stock, numérotation légale (`next_invoice_number()` séquentiel, compteur remis à zéro après test), lettrage (paiement partiel → statut `partielle`), compte courant associé (apport → écriture 571/455), vue `cash_flow_forecast_inputs` (charge récurrente projetée correctement).
- Upload + URL signée sur le bucket `invoices` fonctionnels (fichier de test `smoke-test.txt` resté orphelin dans le bucket — la clé anon n'a pas les droits de suppression storage, à nettoyer manuellement si besoin).

## Limites connues

- Cotisations sociales et retenue à la source : calcul automatique disponible via des taux forfaitaires configurables (`/parametres`), mais ce ne sont pas les barèmes progressifs réels IPRES/IPM/CSS — à vérifier auprès d'un professionnel avant tout usage en paie réelle. Voir détail plus bas.
- Stock : valorisation par produit toujours manuelle (quantité × CMUP saisis à la main, pas de lien avec un système de gestion de stock), mais le coût des marchandises vendues global est maintenant dérivé automatiquement par variation de stock entre deux dates de valorisation — voir détail plus bas. Pas de suivi par mouvement (achat/vente unitaire), seulement une comparaison de deux photos périodiques.
- **Module 6 (SaaS/multi-comptes) terminé** : Row Level Security réactivé avec de vraies policies (`sql/schema-extensions-6.sql`) — chaque entreprise ne voit plus que ses propres données, isolation vérifiée par les tables directes (`company_id = auth_company_id()`) et par les tables enfants via jointure sur la table parente (ex. `entry_lines` via `entries`, `invoice_lines` via `invoices`). Authentification par email/mot de passe (Supabase Auth), une nouvelle inscription (`/signup`) crée automatiquement une entreprise + plan comptable SYSCOHADA vierges (trigger `handle_new_user`). `COMPANY_ID` (`app/src/lib/supabase.ts`) est passé d'une constante d'environnement à une variable définie dynamiquement après connexion (`setCompanyId`, liaison ES live — aucun des ~40 fichiers qui l'utilisaient n'a eu besoin d'être modifié). Testé bout en bout : inscription, isolation confirmée (nouvelle entreprise vide par défaut), rattachement manuel en SQL de l'entreprise existante au premier compte créé (migration ponctuelle, pas un mécanisme permanent), déconnexion/reconnexion.
- Module 6 ne couvre qu'un utilisateur par entreprise pour l'instant (pas d'invitation d'un deuxième utilisateur/collaborateur sur la même entreprise, pas de rôles différenciés au niveau technique — `/securite` reste déclaratif). Pas de fournisseur de paiement (Wave/Orange Money via PayTech) pour une éventuelle offre payante — resterait à faire si une vraie offre SaaS à plusieurs clients voit le jour.
- `/relances` : suivi manuel uniquement, aucun envoi automatique d'email/SMS/WhatsApp (pas de fournisseur configuré).
- `/securite` : registre déclaratif seulement — pas d'authentification réelle (Supabase Auth), donc aucune application technique des permissions décrites.
- Seuils d'audit légal (`/dashboard`) basés sur des valeurs couramment citées pour l'OHADA — **à reconfirmer auprès d'un professionnel**, non faisant foi.
- `/produits` : nécessite de rattacher manuellement les lignes de vente aux factures (`/factures` ne crée pas de lignes détaillées par défaut).
- `/consolidation` : vue simple par addition des CA estimés, pas de consolidation comptable légale ; peu utile tant qu'une seule entreprise existe dans ce projet.
- `/exceptions` : seul `/factures` calcule un vrai score de confiance pour l'instant (voir ci-dessous). Paie, amortissements, bons de caisse et douane n'écrivent pas encore `needs_review`, donc ces sources n'alimenteront jamais la file tant que ce calcul n'est pas ajouté à leur propre module. Le seuil configurable (`automation_settings`) n'a pas d'UI de réglage — modifiable uniquement en SQL direct pour l'instant.
- `/factures` : score de confiance = pondération de 3 facteurs (tiers déjà connu 25%, règle d'imputation stable — utilisée ≥ `min_rule_uses_for_trust` fois — 50%, qualité du texte OCR 25%), calculé uniquement pour les factures imputées automatiquement. C'est une heuristique simple, pas un calcul validé statistiquement — à ajuster une fois un historique réel accumulé.
- `/paie` : un bulletin dont le salaire brut correspond au salaire de base de l'employé (± 2 %) est désormais **validé automatiquement à la création** (écriture générée tout de suite, sans clic manuel) — conforme au principe "toujours automatique sauf écart" de l'architecture. Un écart au-delà de 2 % (prime, absence...) reste en brouillon et apparaît dans `/exceptions` ; le bouton "Valider" existant sert alors d'action de résolution manuelle. Testé bout en bout (cas conforme → écriture équilibrée 315 000/315 000 ; cas +50 % → visible dans `monthly_review_queue`).
- `/douane` : cohérence entre la valeur en douane déclarée et le montant HT de la facture d'achat liée (tolérance 10 %, plus large que la paie car fret/assurance/change expliquent une partie de l'écart) ; sans facture liée, la déclaration part systématiquement en revue faute de référence. Testé bout en bout (+3 % → OK ; +50 % → file d'exceptions).
- **Blocage des écritures en période clôturée** : `assertPeriodOpen()` dans `app/src/lib/closing.ts`, appelé avant toute création d'écriture (`/saisie`, `/factures`, `/paie`, bons de caisse dans `/comptes`) — jusqu'ici rien n'empêchait techniquement de saisir après coup dans un exercice fermé. Testé bout en bout (période de test clôturée → requête bloquée pour une date dedans, libre pour une date en dehors).
- **Écart de change à l'encaissement/paiement** (`/lettrage`) : pour une facture en devise étrangère, `recordPayment()` (`app/src/lib/lettering.ts`) demande le montant réglé en devise d'origine et le taux du jour du règlement (auto-suggéré via `getRateForDate`, éditable) ; l'écart entre le taux de facturation et le taux de règlement est posté automatiquement en 676 (perte) ou 776 (gain) — comptes ajoutés au plan comptable, absents jusqu'ici. Testé bout en bout (facture 100 USD à 600, réglée à 610 → gain de change 1 000 XOF, écriture équilibrée 61 000/61 000).
- **Compatibilité mobile** : la sidebar se replie déjà en menu hamburger sur petit écran (`AppShell.tsx`), mais les ~22 pages avec tableaux/formulaires n'étaient pas adaptées — les tableaux (jamais dans un conteneur scrollable) et les formulaires en grille fixe (`grid-cols-3`/`grid-cols-2`/`grid-cols-4`) auraient débordé ou été illisibles sur téléphone. Corrigé : tous les tableaux sont maintenant enveloppés dans `overflow-x-auto` (le tableau défile horizontalement au besoin, la page elle-même ne déborde plus), et toutes les grilles de formulaire passent à une seule colonne sous le point de rupture `sm:` (empilées sur mobile, grille normale à partir de ~640px). Fait par script (tables) + remplacement ciblé (grilles), vérifié par compilation sur toutes les pages touchées.
- **`/livres` : import du journal depuis Excel** (`.xlsx`/`.xls`/`.csv`) — colonnes attendues Date/Journal/Compte/Débit/Crédit (Référence et Libellé optionnels), lignes regroupées en écritures par date+journal+référence, écritures déséquilibrées détectées et exclues (signalées à l'utilisateur), comptes/journaux inconnus rejetés individuellement, doublons ignorés si une écriture identique (même journal+date+référence) existe déjà. Logique dans `app/src/lib/journalImport.ts`, dépendance `xlsx` (SheetJS) ajoutée. A nécessité d'étendre la contrainte `entries_source_check` (nouvelle valeur `excel_import`) — bug attrapé en testant, corrigé avant livraison. Testé bout en bout (fichier généré avec une écriture équilibrée + une déséquilibrée → seule la première importée, écriture 1000/1000 vérifiée ; détection de doublon vérifiée).
- **`/livres` : onglet Journal enrichi** — affiche désormais le libellé du compte à côté du code (pas seulement le numéro), et rappelle qu'aucun filtre n'est appliqué par défaut (donc "tout le journal" est bien la vue de base).
- **`/saisie` : pédagogie du double débit/crédit** — panneau d'explication avec un exemple concret (achat de fournitures 10 000 F en espèces → 605 débit / 571 crédit) ajouté en tête de page, suite à un retour indiquant que la nécessité de deux comptes par écriture n'était pas claire. Lien vers `/aide` pour le lexique complet.
- **`/factures` : création sans fichier + filtres** : le fichier (photo/PDF) est désormais facultatif — utile pour émettre directement une facture de vente (client) sans document à scanner, alors qu'avant le formulaire l'exigeait toujours. Ajout de filtres au-dessus du tableau, combinables : période (jour/semaine/mois/année, ancrée sur une date de référence), client (`third_parties` de type client), statut (reçue/vérifiée/imputée/approuvée/payée/archivée), montant TTC min/max — avec bouton de réinitialisation. Testé bout en bout (période + client → une seule facture sur deux ; statut + plage de montant combinés → une seule facture sur trois).
- **Clarté de l'interface** : nouvelle page `/aide` (lexique des termes comptables — débit/crédit, TVA, lettrage, écart de change, CMV, moteur de confiance... — accessible depuis la sidebar et l'accueil) ; le champ "compte de contrepartie" du bon de caisse (`/comptes`) était un texte libre demandant de connaître les codes SYSCOHADA par cœur — remplacé par un menu déroulant filtré (comptes de charge pour une sortie, de produit pour une entrée) qui affiche le libellé, pas juste le code.
- **Variation de stock automatique** (`/stocks`) : compare les deux dernières dates de valorisation et génère l'écriture de variation (débit 603 / crédit 311 si le stock a baissé, l'inverse sinon) — méthode de l'inventaire intermittent, cohérente avec le reste de l'application (achats en charge, pas de ledger perpétuel par mouvement). Protection contre la double génération pour une même date de clôture (table `stock_variation_closures`). Testé bout en bout (stock 100 000 → 60 000 XOF → écriture 40 000/40 000 générée ; nouvelle tentative sur la même date bloquée).
- **Taux de paie configurables** (`/parametres`, section "Taux de paie") : cotisations salariales/patronales et retenue à la source en % du brut, colonnes ajoutées à `companies` (`employee_contribution_rate`, `employer_contribution_rate`, `income_tax_rate`). Bouton "Auto-calculer" sur `/paie` qui pré-remplit les montants à partir de ces taux — **approximation forfaitaire, pas les barèmes progressifs réels IPRES/IPM/CSS**, à vérifier auprès d'un professionnel. Si aucun taux n'est configuré, la saisie manuelle reste inchangée.
- `/factures` : champ **date d'échéance** (`due_date`) ajouté au formulaire — la colonne existait déjà dans `schema.sql` mais n'était jamais renseignée, ce qui privait `/previsionnel` de toute donnée de facture. Testé bout en bout (facture client à 30 jours → apparaît dans `cash_flow_forecast_inputs`).
- `/comptes` : nouvelle section **bon de caisse** (module qui n'avait encore aucun écran — table `cash_vouchers` présente depuis `schema.sql` mais jamais câblée). Écriture de trésorerie systématiquement générée (déterministe une fois les comptes choisis) ; seul le dépassement du plafond configuré (`automation_settings.cash_voucher_auto_limit`, 50 000 F par défaut) déclenche `needs_review`. Logique dans `app/src/lib/cashVouchers.ts`. Testé bout en bout (20 000 F → écriture 20 000/20 000 sans revue ; 200 000 F → file d'exceptions).

## Prochaine étape

Tous les modules identifiés dans `gaps-comptabilite.md`, `gaps-comptabilite-2.md`, `gaps-comptabilite-3.md` et le principe d'automatisation maximale (`docs/architecture-automatisation-maximale.md`) sont désormais couverts par un écran fonctionnel, testés bout en bout via Supabase direct. Pour l'usage perso actuel, ce qui reste réellement ouvert :

1. **Tester manuellement dans le navigateur** (`npm run dev` puis http://localhost:3000) le remplissage réel de tous les formulaires — les tests effectués jusqu'ici valident la logique métier (Supabase direct), pas le rendu ni l'ergonomie réelle à l'usage.
2. **`/relances`** : le message est généré et copiable, mais l'envoi effectif (email/SMS/WhatsApp) reste manuel — brancher un fournisseur réel (ex. PayTech, Twilio, API WhatsApp Business) si le volume de relances le justifie un jour.
3. **Cotisations de paie et taux de change** : les deux ont un calcul automatique disponible mais basé sur des taux/paramètres saisis par l'utilisateur, pas sur des barèmes officiels vérifiés — à valider avec un comptable avant tout usage réel en paie ou déclaration fiscale.

Volontairement laissés de côté (à reprendre seulement si une vraie offre SaaS à plusieurs clients voit le jour) :

- Inviter d'autres utilisateurs sur une même entreprise (collaborateur/comptable externe) — aujourd'hui une entreprise = un seul compte.
- Fournisseur de paiement pour un abonnement payant (Wave/Orange Money via PayTech ou Intouch).
- Rôles techniques différenciés (au-delà du registre déclaratif `/securite`).
