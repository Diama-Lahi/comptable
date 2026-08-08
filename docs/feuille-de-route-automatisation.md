# Feuille de route technique — Compta Sénégal "Zéro Saisie Manuelle"

## Architecture actuelle
- **Stack** : Next.js 16 + React 19 + Tailwind v4 + TypeScript + Supabase (PostgreSQL)
- **Auth** : Supabase Auth (email/password, Google OAuth)
- **OCR** : Tesseract.js intégré
- **Multi-entreprise** : Prêt via `company_id` sur toutes les tables
- **Déploiement** : Compatible Vercel / Netlify

---

## PHASE 1 : LES 3 PILIERS DU MVP PRO (Priorité absolue)

### Pilier 1 — Portail client + OCR (Cycle Achats)  
**Objectif** : Zéro ressaisie des factures fournisseurs.

| Sous-module | Fichiers | Statut |
|---|---|---|
| 1.1 Bons de commande fournisseurs | SQL + `lib/purchaseOrders.ts` + page UI | ✅ Livré |
| 1.2 Import emails factures (IMAP/Gmail/Outlook) | SQL + `lib/emailImport.ts` | ✅ Livré |
| 1.3 OCR intelligent (extraction : fournisseur, montant, TVA, date, numéro) | Tesseract.js (déjà intégré) | ✅ Existant |
| 1.4 Contrôle conformité BC/Facture | SQL + `lib/invoiceControl.ts` | ✅ Livré |
| 1.5 Workflow validation hiérarchique | SQL + `lib/workflow.ts` | ✅ Livré |
| 1.6 Comptabilisation automatique | `lib/imputation.ts` (existant) | ✅ Existant |
| 1.7 Échéancier & relances fournisseurs | `lib/reminders.ts` | ✅ Livré |
| 1.8 Paiement fournisseur (XML UEMOA) | `lib/supplierPayments.ts` | ✅ Livré |

### Pilier 2 — Générateur de Liasse Fiscale & Déclarations  
**Objectif** : Automatiser la production des états obligatoires OHADA + DSF.

| Sous-module | Fichiers | Statut |
|---|---|---|
| 7.1 Bilan (Actif/Passif) | `lib/financialStatements.ts` | ✅ Livré |
| 7.2 Compte de résultat (CRC) | `lib/financialStatements.ts` | ✅ Livré |
| 7.3 Tableau des flux de trésorerie | `lib/financialStatements.ts` | ✅ Livré |
| 7.4 Variation des capitaux propres | `lib/financialStatements.ts` | ✅ Livré |
| 7.5 Annexes & tableaux | `lib/financialStatements.ts` | ✅ Livré |
| 7.6 DSF (Déclaration Statistique et Fiscale) XML DGID | `lib/dsfGenerator.ts` + table `dsf_declarations` | ✅ Livré |
| 7.7 Cache des états générés | Table `financial_statements_cache` | ✅ Livré |

### Pilier 3 — Lettrage Bancaire Automatique (Matching)  
**Objectif** : Lettrage quasi-automatique des relevés bancaires.

| Sous-module | Fichiers | Statut |
|---|---|---|
| 3.1 Import relevés banque | `lib/bankImport.ts` (existant) | ✅ Existant |
| 3.2 Algorithme de matching multi-critères | `lib/bankMatching.ts` (scoring montant/date/référence + auto-lettering) | ✅ Livré |
| 3.3 Validation en un clic (exceptions) | Interface à créer | 📝 À faire |
| 3.4 Mise à jour prévisionnel trésorerie | `lib/forecast.ts` (existant) | ✅ Existant |

---

## PHASE 2 : SPÉCIFICITÉS SÉNÉGALAISES (Vrai différenciateur)

| Fonctionnalité | Fichiers | Statut |
|---|---|---|
| **TVA sur acomptes** : acompte → TVA exigible → facture finale → régularisation | SQL `customer_deposits` + `vat_on_deposits` + `invoice_deposit_links` + `lib/customerDeposits.ts` | ✅ Livré |
| **Taxe sur Contrats d'Assurance (TCA)** | Colonne `tca_amount` sur `entry_lines` | ✅ Livré |
| **Paramètres fiscaux dynamiques** (plus jamais codés en dur) | Table `tax_settings` avec versioning + `lib/taxSettings.ts` | ✅ Livré |
| **DSF format XML DGID** | `lib/dsfGenerator.ts` (génération XML normée) | ✅ Livré |
| **Calculateur d'honoraires** (Cabinet) | Tables `fee_rules` + `fee_generations` | ✅ Livré |

---

## PHASE 3 : ARCHITECTURE TECHNIQUE & BONNES PRATIQUES

| Pratique | Implémentation | Statut |
|---|---|---|
| **Gestion des arrondis** (fléau des centimes) | Types `numeric(19,4)` partout + compte 658 "Pertes sur arrondis" | ✅ Livré |
| **Verrouillage optimiste** (concurrence) | Colonne `version` sur `entries` + `entry_lines`, fonction `update_entry_line()` | ✅ Livré |
| **Immutabilité & Piste d'audit** | Table `audit_logs` centralisée, trigger interdisant les DELETE comptables, contre-passation obligatoire | ✅ Livré |
| **Multi-entreprise** | `company_id` sur toutes les tables, `COMPANY_ID` dynamique dans `lib/supabase.ts` | ✅ Existant |

---

## PHASE 4 : VUE "CABINET" ET OUTILS DE MIGRATION

| Fonctionnalité | Statut |
|---|---|
| Dashboard multi-entités (vue cabinet) | 📝 Phase 2 — utiliser les routes existantes `/dashboard` + `/consolidation` |
| Calculateur d'honoraires paramétrable | ✅ Tables prêtes (`fee_rules`, `fee_generations`), logique à coder |
| Outil de migration Excel/CSV (depuis Sage/EBP) | 📝 Phase 2 — utiliser `xlsx` déjà en dépendances |

---

## PHASE 5 : EXPÉRIENCE UTILISATEUR

| Fonctionnalité | Statut |
|---|---|
| PWA / Mobile — Prise de photo des factures | 📝 À faire (Next.js compatible PWA) |
| Interface responsive pour experts-comptables | ✅ Déjà responsive (Tailwind) |

---

## Fichiers créés

### SQL
| Fichier | Contenu |
|---|---|
| `sql/schema-module-1-2-achats-ventes.sql` | 9 tables : bons de commande, email import, contrôle conformité, workflow, devis, paiements fournisseurs, relances, numérotation légale |
| `sql/schema-mvp-pro-senegal.sql` | 10 ensembles : `tax_settings`, `customer_deposits`, `invoice_deposit_links`, `vat_on_deposits`, `audit_logs`, `financial_statements_cache`, `dsf_declarations`, `fee_rules`, `fee_generations`, versionning, arrondis (19,4), TCA |

### Librairies métier (15 fichiers)
| Fichier | Module |
|---|---|
| `lib/purchaseOrders.ts` | 1.1 — Bons de commande |
| `lib/emailImport.ts` | 1.2 — Import email + identification fournisseur |
| `lib/invoiceControl.ts` | 1.4 — Contrôle conformité BC/Facture |
| `lib/workflow.ts` | 1.5 — Workflow validation hiérarchique |
| `lib/reminders.ts` | 1.7 & 2.4 — Échéancier & relances automatiques |
| `lib/supplierPayments.ts` | 1.8 — XML UEMOA virement |
| `lib/quotes.ts` | 2.1 — Devis → Facture automatique |
| `lib/financialStatements.ts` | 7 — Bilan, CRC, Flux trésorerie, Capitaux propres |
| `lib/dsfGenerator.ts` | 7.6 — DSF XML DGID Sénégal |
| `lib/bankMatching.ts` | 3.2 — Algorithme scoring matching bancaire |
| `lib/customerDeposits.ts` | Phase 2 — Acomptes TVA Sénégal |
| `lib/taxSettings.ts` | Phase 2 — Paramètres fiscaux dynamiques |

### Pages UI
| Page | Module |
|---|---|
| `app/bons-de-commande/page.tsx` | 1.1 — CRUD bons de commande avec filtres |
| `app/devis/page.tsx` | 2.1 — Devis avec transformation → facture |

### Navigation mise à jour
`components/AppShell.tsx` — 2 nouvelles sections : "Achats & fournisseurs" et "Ventes & clients"

---

## Ordre d'implémentation recommandé (3 mois)

```
SEMAINE 1-2 : ✅ Modules 1 & 2 (Achats + Ventes) — LIVRÉS
SEMAINE 3   : ✅ Pilier 2 (Liasse fiscale + DSF) — LIVRÉ
SEMAINE 3   : ✅ Pilier 3 (Matching bancaire) — LIVRÉ
SEMAINE 3   : ✅ Spécificités Sénégal (acomptes TVA, tax_settings, TCA) — LIVRÉ
SEMAINE 3   : ✅ Architecture avancée (audit, versionning, arrondis) — LIVRÉ
SEMAINE 4   : Pages UI restantes + intégration email serveur
SEMAINE 5   : Module Cabinet (honoraires, dashboard multi-entités)
SEMAINE 6   : Migration Excel/CSV (depuis Sage/EBP)
SEMAINE 7-8 : PWA Mobile + Tests utilisateurs
SEMAINE 9-10: Déploiement production + Documentation
```

---

## Travail restant (semaine 4+)

1. **Configurer BullMQ/pgmq** pour les tâches asynchrones (OCR, génération PDF/XML, envoi emails)
2. **Service d'email côté serveur** (Nodemailer avec IMAP)
3. **Pages UI :** Contrôle conformité, Échéancier fournisseurs, Paiements fournisseurs, Acomptes, Relances
4. **Module Cabinet :** Dashboard multi-entités, calculateur d'honoraires
5. **Outil de migration :** Import Excel/CSV depuis Sage/EBP
6. **PWA :** Service Worker, manifest, prise de photo
7. **Tests et déploiement**