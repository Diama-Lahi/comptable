# Plan "Invincible" — Compta Sénégal v1.0
## Référence OHADA | Zéro Saisie Manuelle | Afrique de l'Ouest

---

# 1. ARCHITECTURE TECHNIQUE GLOBALE

## 1.1 Stack Technique Recommandée

### Backend — NestJS (Node.js) ✅ Recommandé
```
Raison : TypeScript natif, architecture modulaire (modules = domaines métier),
décorateurs pour les validations, intégration facile avec BullMQ, 
compatible avec le frontend Next.js existant.
```

| Couche | Technologie | Justification |
|--------|------------|---------------|
| Runtime | Node.js 22 LTS | Performance, écosystème riche |
| Framework | NestJS 11 | Architecture modulaire, TypeScript natif |
| API | REST (OpenAPI) + GraphQL (pour dashboards) | Flexibilité |
| ORM | Prisma 6 | Type-safe, migrations automatiques |
| Validation | class-validator + Zod | Double couche de validation |
| Cache | Redis 7 (via BullMQ) | File d'attente + cache |
| Queue | BullMQ | Tâches asynchrones (OCR, PDF, email) |
| Auth | JWT + Passport + 2FA (TOTP) | Sécurité multi-couche |
| Logging | Winston + ELK Stack | Centralisé et structuré |
| Tests | Jest + Supertest + k6 | Unitaire, intégration, charge |

### Frontend — React (Next.js 16) ✅ Déjà en place
```
Stack actuelle conservée et enrichie.
```

| Technologie | Usage |
|-------------|-------|
| Next.js 16 | SSR/SSG, API Routes, PWA |
| React 19 | Composants, hooks |
| Tailwind v4 | Design system |
| TypeScript | Type safety |
| Zustand | State management léger |
| TanStack Query | Gestion des requêtes API + cache client |
| React Hook Form | Formulaires performants |

### Infrastructure Cloud

```
┌─────────────────────────────────────────────────────┐
│                 Cloudflare (DNS, CDN, DDoS)         │
├─────────────────────────────────────────────────────┤
│                   Vercel (Frontend)                  │
├─────────────────────────────────────────────────────┤
│   ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │
│   │  Supabase    │  │  Redis       │  │  BullMQ  │ │
│   │  PostgreSQL  │  │  Cache/Queue │  │  Workers │ │
│   └──────────────┘  └──────────────┘  └──────────┘ │
├─────────────────────────────────────────────────────┤
│          Supabase Storage (PDF/A, documents)        │
├─────────────────────────────────────────────────────┤
│              GitHub Actions (CI/CD)                  │
└─────────────────────────────────────────────────────┘
```

## 1.2 Architecture Microservices

```
┌────────────────────────────────────────────────────────────┐
│                     API Gateway (Next.js)                   │
│  Auth / Rate Limiting / Logging / Compression              │
└──────────┬─────────────────────────────────────┬───────────┘
           │                                     │
    ┌──────▼──────┐                    ┌─────────▼─────────┐
    │  Core API   │                    │  Async Workers    │
    │  NestJS     │                    │  BullMQ           │
    ├─────────────┤                    ├───────────────────┤
    │ Auth module │                    │ OCR Worker        │
    │ Compta mod. │                    │ PDF Generator     │
    │ Tiers mod.  │                    │ XML Generator     │
    │ Bank mod.   │                    │ Email Worker      │
    │ Paie mod.   │                    │ Consolidation     │
    │ Etats mod.  │                    │ Benchmarking      │
    │ Analytique  │                    │ Veille juridique  │
    └─────────────┘                    └───────────────────┘
```

---

# 2. MODÈLE DE DONNÉES COMPLET

## 2.1 Diagramme des Entités Principales

```
companies ────┬─── chart_of_accounts
              ├─── fiscal_periods
              ├─── journals
              ├─── entries ──── entry_lines
              ├─── third_parties
              ├─── invoices ──── invoice_lines
              ├─── bank_transactions
              ├─── employees ──── payslips
              ├─── fixed_assets ──── depreciation_schedule
              ├─── cost_centers
              ├─── budgets ──── budget_lines
              ├─── consolidation_groups ──── consolidation_members
              ├─── documents
              ├─── users ──── roles ──── permissions
              └─── audit_logs
```

## 2.2 Schéma SQL Complet (Déjà livré)

Les 4 fichiers SQL suivants couvrent **toutes les tables** nécessaires :

| Fichier | Tables | Statut |
|---------|--------|--------|
| `sql/schema.sql` | Fondations (15 tables) | ✅ Existant |
| `sql/schema-extensions.sql` | Immos, paie, stocks, analytique (12 tables) | ✅ Livré |
| `sql/schema-module-1-2-achats-ventes.sql` | BC, email, workflow, devis, paiements (12 tables) | ✅ Livré |
| `sql/schema-mvp-pro-senegal.sql` | Tax settings, acomptes TVA, audit, DSF, honoraires (15 tables) | ✅ Livré |
| `sql/schema-phase-2-avancee.sql` | Facturation élec., associations, agriculture, consolidation, budgets, GED, messagerie, veille, IFRS (26 tables) | ✅ Livré |

**Total : ~80 tables couvrant l'intégralité des besoins.**

### Tables non encore créées (à ajouter) :

```sql
-- 2FA / Sécurité
create table user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  token text not null unique,
  ip_address text,
  user_agent text,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create table audit_security (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text not null,        -- 'login', 'login_failed', 'logout', '2fa_setup', 'password_change'
  ip_address text,
  details jsonb,
  created_at timestamptz default now()
);

-- Sauvegardes / PRA
create table backup_logs (
  id uuid primary key default gen_random_uuid(),
  type text check (type in ('automatic','manual','pre_migration')),
  status text check (status in ('running','completed','failed')),
  file_url text,
  size_bytes bigint,
  checksum text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- Marketplace / Intégrations
create table api_keys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  key_hash text not null,
  name text,
  permissions jsonb,            -- ['read:entries', 'write:invoices']
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz default now()
);

create table webhooks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  url text not null,
  events text[] not null,       -- ['invoice.created', 'payment.received']
  secret text,
  active boolean default true,
  last_triggered_at timestamptz,
  created_at timestamptz default now()
);
```

---

# 3. ENDPOINTS API

## 3.1 API RESTful — Documentation OpenAPI

### Règle de nommage
```
GET    /api/v1/{ressource}          → Liste
POST   /api/v1/{ressource}          → Création
GET    /api/v1/{ressource}/:id      → Détail
PATCH  /api/v1/{ressource}/:id      → Mise à jour partielle
DELETE /api/v1/{ressource}/:id      → Suppression (logique)
```

### Modules et endpoints

#### Auth & Utilisateurs
```
POST   /api/v1/auth/login                 → Connexion (JWT)
POST   /api/v1/auth/login/2fa             → 2FA TOTP
POST   /api/v1/auth/register              → Inscription
POST   /api/v1/auth/logout                → Déconnexion
POST   /api/v1/auth/refresh               → Rafraîchir token
POST   /api/v1/auth/forgot-password       → Mot de passe oublié
POST   /api/v1/auth/reset-password        → Réinitialiser
GET    /api/v1/auth/me                    → Profil connecté
PATCH  /api/v1/auth/me                    → Modifier profil
POST   /api/v1/auth/2fa/setup             → Activer 2FA
POST   /api/v1/auth/2fa/verify            → Vérifier 2FA
POST   /api/v1/auth/2fa/disable           → Désactiver 2FA
```

#### Sociétés / Multi-entreprise
```
GET    /api/v1/companies                  → Liste des sociétés
POST   /api/v1/companies                  → Créer société
GET    /api/v1/companies/:id              → Détail société
PATCH  /api/v1/companies/:id              → Modifier société
DELETE /api/v1/companies/:id              → Supprimer société
POST   /api/v1/companies/:id/switch       → Changer de contexte
```

#### Tiers (Clients & Fournisseurs)
```
GET    /api/v1/third-parties              → Liste (filtres: type, search)
POST   /api/v1/third-parties              → Créer
GET    /api/v1/third-parties/:id          → Détail
PATCH  /api/v1/third-parties/:id          → Modifier
DELETE /api/v1/third-parties/:id          → Supprimer
GET    /api/v1/third-parties/:id/balance  → Solde du compte
```

#### Plan Comptable
```
GET    /api/v1/chart-of-accounts          → Liste
POST   /api/v1/chart-of-accounts          → Ajouter compte
PATCH  /api/v1/chart-of-accounts/:id      → Modifier
POST   /api/v1/chart-of-accounts/seed     → Initialiser plan SYSCOHADA
GET    /api/v1/chart-of-accounts/search?q= → Recherche
```

#### Écritures Comptables
```
GET    /api/v1/entries                    → Liste (filtres: période, journal, compte)
POST   /api/v1/entries                    → Créer écriture équilibrée
GET    /api/v1/entries/:id                → Détail avec lignes
PATCH  /api/v1/entries/:id                → Modifier (si non clôturé)
DELETE /api/v1/entries/:id                → Annulation logique
POST   /api/v1/entries/:id/reverse        → Contre-passation
GET    /api/v1/entries/export?format=csv  → Export CSV/Excel
```

#### Factures (Achats & Ventes)
```
GET    /api/v1/invoices                   → Liste (filtres: type, statut, tiers)
POST   /api/v1/invoices                   → Créer facture
GET    /api/v1/invoices/:id               → Détail avec lignes
PATCH  /api/v1/invoices/:id               → Modifier
POST   /api/v1/invoices/:id/approve       → Approuver
POST   /api/v1/invoices/:id/reject        → Rejeter
POST   /api/v1/invoices/:id/cancel        → Avoir
POST   /api/v1/invoices/:id/send-email    → Envoyer par email
POST   /api/v1/invoices/import-email      → Importer depuis email
POST   /api/v1/invoices/import-ocr        → OCR sur fichier
GET    /api/v1/invoices/unpaid            → Factures impayées
GET    /api/v1/invoices/aging             → Balance âgée
```

#### Bons de Commande
```
GET    /api/v1/purchase-orders
POST   /api/v1/purchase-orders
PATCH  /api/v1/purchase-orders/:id/receive → Réceptionner
PATCH  /api/v1/purchase-orders/:id/cancel  → Annuler
```

#### Devis
```
GET    /api/v1/quotes
POST   /api/v1/quotes
POST   /api/v1/quotes/:id/accept          → Accepter → Facture
POST   /api/v1/quotes/:id/refuse          → Refuser
```

#### Banque & Rapprochement
```
GET    /api/v1/bank-transactions          → Liste relevé
POST   /api/v1/bank-transactions/import   → Import relevé (CSV/MT940)
POST   /api/v1/bank-transactions/match    → Lancer matching auto
GET    /api/v1/bank-transactions/unmatched → Non rapprochées
POST   /api/v1/reconciliations            → Confirmer rapprochement
DELETE /api/v1/reconciliations/:id        → Annuler rapprochement
```

#### Paiements
```
GET    /api/v1/payments
POST   /api/v1/payments
POST   /api/v1/payments/batch             → Créer lot virement
GET    /api/v1/payments/batches           → Lots de virement
GET    /api/v1/payments/batches/:id/xml   → Télécharger XML UEMOA
POST   /api/v1/payments/batches/:id/execute → Exécuter
```

#### Paie
```
GET    /api/v1/employees
POST   /api/v1/employees
GET    /api/v1/payslips
POST   /api/v1/payslips/generate          → Générer bulletins
POST   /api/v1/payslips/:id/validate      → Valider
POST   /api/v1/payslips/batch-virement    → Virement salaires
GET    /api/v1/payslips/das/:year         → DAS annuelle
```

#### Immobilisations
```
GET    /api/v1/fixed-assets
POST   /api/v1/fixed-assets
POST   /api/v1/fixed-assets/:id/depreciate → Calculer amortissement
POST   /api/v1/fixed-assets/:id/dispose   → Cession
GET    /api/v1/fixed-assets/depreciation-plan → Plan complet
```

#### Stocks
```
GET    /api/v1/stock/valuations           → Valorisation
POST   /api/v1/stock/movement             → Mouvement (entrée/sortie)
POST   /api/v1/stock/inventory            → Inventaire physique
GET    /api/v1/stock/alerts               → Seuils d'alerte
```

#### États Financiers
```
GET    /api/v1/financial-statements/bilan?from=&to=
GET    /api/v1/financial-statements/crc?from=&to=
GET    /api/v1/financial-statements/cash-flow?from=&to=
GET    /api/v1/financial-statements/equity?from=&to=
GET    /api/v1/financial-statements/annexes?from=&to=
GET    /api/v1/financial-statements/liasse?from=&to=  → Liasse complète
GET    /api/v1/financial-statements/export?format=pdf → Export PDF
```

#### Déclarations Fiscales
```
POST   /api/v1/tax/dsf/generate           → Générer DSF
GET    /api/v1/tax/dsf/:id/xml            → Télécharger XML DGID
POST   /api/v1/tax/vat/declare            → Déclaration TVA
POST   /api/v1/tax/is/calculate           → Calculer IS
GET    /api/v1/tax/declarations           → Historique
```

#### Comptabilité Analytique
```
GET    /api/v1/cost-centers
POST   /api/v1/cost-centers
GET    /api/v1/cost-centers/:id/result    → Résultat par centre
POST   /api/v1/cost-centers/:id/allocate  → Répartition clés
GET    /api/v1/cost-centers/dashboard     → Tableau analytique
```

#### Budgets
```
GET    /api/v1/budgets
POST   /api/v1/budgets
GET    /api/v1/budgets/:id/lines
POST   /api/v1/budgets/:id/lines
POST   /api/v1/budgets/:id/update-actuals → Mettre à jour réalisés
GET    /api/v1/budgets/:id/alerts         → Alertes écarts
```

#### Consolidation
```
POST   /api/v1/consolidation/groups
GET    /api/v1/consolidation/groups
POST   /api/v1/consolidation/groups/:id/members
POST   /api/v1/consolidation/groups/:id/run → Lancer consolidation
GET    /api/v1/consolidation/groups/:id/result → Résultat
```

#### Conformité & Score
```
GET    /api/v1/compliance/score?from=&to=  → Score SYSCOHADA
GET    /api/v1/compliance/alerts          → Alertes anomalies
GET    /api/v1/compliance/recommendations → Recommandations
```

#### Documents / GED
```
POST   /api/v1/documents/upload           → Upload fichier
GET    /api/v1/documents/search?q=        → Recherche full-text
GET    /api/v1/documents/:id              → Détail
POST   /api/v1/documents/:id/validate     → Valider
POST   /api/v1/documents/:id/archive      → Archiver PDF/A
```

#### Administration / Utilisateurs
```
GET    /api/v1/users                      → Liste utilisateurs
POST   /api/v1/users                      → Inviter utilisateur
PATCH  /api/v1/users/:id/role             → Changer rôle
DELETE /api/v1/users/:id                  → Désactiver
GET    /api/v1/roles                      → Liste rôles
POST   /api/v1/roles                      → Créer rôle personnalisé
PATCH  /api/v1/roles/:id/permissions      → Modifier permissions
```

#### Audit & Sécurité
```
GET    /api/v1/audit-logs                 → Piste d'audit (filtres)
GET    /api/v1/audit-logs/export          → Export CSV
GET    /api/v1/security/sessions          → Sessions actives
DELETE /api/v1/security/sessions/:id      → Déconnecter session
GET    /api/v1/security/login-history     → Historique connexions
```

#### Dashboard / KPIs
```
GET    /api/v1/dashboard/cabinet          → Vue cabinet (multi-entités)
GET    /api/v1/dashboard/company          → Vue entreprise
GET    /api/v1/dashboard/forecast         → Prévisionnel trésorerie
GET    /api/v1/dashboard/benchmarking     → Benchmarking sectoriel
```

#### Notifications
```
GET    /api/v1/notifications              → Liste notifications
PATCH  /api/v1/notifications/:id/read     → Marquer lue
POST   /api/v1/notifications/preferences  → Préférences
```

#### API Publique (pour développeurs tiers)
```
GET    /api/v1/public/invoices            → Liste factures (API key)
POST   /api/v1/public/entries             → Créer écriture
GET    /api/v1/public/companies/:id/balance → Balance
```

---

# 4. ALGORITHMES CLÉS

## 4.1 Algorithme de Matching Bancaire (Lettrage Automatique)
```typescript
// Déjà implémenté dans lib/bankMatching.ts ✓
// Score sur 100 : montant (40pts) + date (30pts) + référence (30pts) + description (bonus 10pts)
// Seuils : ≥90 → auto_exact, ≥60 → auto_fuzzy, <60 → manual
```

## 4.2 Algorithme de Consolidation
```typescript
// Déjà implémenté dans lib/consolidation.ts ✓
// 3 méthodes : full, equity, proportional
// Étapes : agrégation → éliminations internes → calcul minoritaires → stockage
```

## 4.3 Algorithme de Scoring de Conformité
```typescript
// Déjà implémenté dans lib/compliance.ts ✓
// 100 pts : qualité comptable (40) + conformité fiscale (30) + qualité états (20) + risques (-10)
// Niveaux : <50 élevé, 50-75 moyen, 75-90 conforme, >90 excellent
```

## 4.4 Algorithme de Benchmarking Anonyme

```typescript
async function generateBenchmarking(sector: string, from: string, to: string) {
  // 1. Filtrer les entreprises du même secteur
  // 2. Anonymiser (remplacer noms par IDs)
  // 3. Calculer ratios :
  //    - Marge brute = (Ventes - Achats) / Ventes
  //    - Délai clients = (Créances / Ventes) × 365
  //    - Délai fournisseurs = (Dettes / Achats) × 365
  //    - Rotation stocks = (Stocks / Achats) × 365
  //    - ROE = Résultat / Capitaux propres
  // 4. Agréger : moyenne, médiane, quartiles
  // 5. Stocker dans benchmarking_data
  // 6. Pour chaque entreprise :
  //    a. Calculer ses ratios
  //    b. Comparer aux benchmarks
  //    c. Générer rapport de positionnement
}
```

## 4.5 Algorithme de Détection d'Anomalies (Rule-based + ML)

```typescript
async function detectAnomalies(from: string, to: string) {
  const anomalies = [];
  
  // 1. RÈGLES METIER (90% des détections)
  //    - Écriture non équilibrée
  //    - Compte inconnu
  //    - TVA anormale (taux hors norme)
  //    - Montant > seuil défini
  //    - Même fournisseur, même montant, même date (doublon)
  
  // 2. STATISTIQUES (10% des détections)
  //    - Écart-type > 3σ (montants inhabituels)
  //    - Fréquence anormale (trop d'écritures sur un compte)
  
  // 3. ML (futur)
  //    - Isolation Forest pour détection outliers
  //    - Autoencoder pour reconstruction error
  
  return anomalies;
}
```

## 4.6 Algorithme de Prévision de Trésorerie

```typescript
async function forecastCashFlow(months: number = 6) {
  // 1. Récupérer historique des flux (24 mois)
  // 2. Décomposer : tendance + saisonnalité + résidu
  //    - Moyenne mobile sur 12 mois (tendance)
  //    - Coefficient saisonnier mensuel
  //    - Bruit résiduel
  
  // 3. Projeter :
  //    - Encaissements prévus (factures clients, échéances)
  //    - Décaissements prévus (factures fournisseurs, paie, impôts)
  //    - Solde de trésorerie projeté
  
  // 4. Ajouter scénarios :
  //    - Optimiste (+20% CA)
  //    - Pessimiste (-20% CA)
  //    - Statu quo
  
  // 5. Alertes si solde < seuil critique
}
```

---

# 5. UI/UX — DESIGN SYSTEM

## 5.1 Principes Directeurs

```
1. Mobile-first → Responsive
2. Accessible → WCAG 2.1 AA
3. Rapide → Lighthouse > 90
4. Simple → Pas plus de 3 clics pour une action courante
5. Cohérent → Design System unifié
```

## 5.2 Palette de Couleurs

```css
/* Marque */
--primary: #1a365d;       /* Bleu profond (confiance, sérieux) */
--primary-light: #2b6cb0;
--accent: #d4a843;        /* Or (excellence, valeur) */
--accent-light: #f6e05e;

/* UI */
--bg-base: #f7fafc;       /* Fond clair */
--bg-card: #ffffff;
--bg-elevated: #edf2f7;
--text-primary: #1a202c;
--text-secondary: #4a5568;
--text-muted: #a0aec0;

/* Feedback */
--success: #38a169;
--warning: #d69e2e;
--error: #e53e3e;
--info: #3182ce;

/* Dark Mode */
--dark-bg-base: #1a202c;
--dark-bg-card: #2d3748;
--dark-text: #e2e8f0;
```

## 5.3 Typographie

```css
--font-heading: 'Inter', sans-serif;        /* Titres */
--font-body: 'Inter', sans-serif;           /* Corps */
--font-mono: 'JetBrains Mono', monospace;   /* Chiffres comptables */
```

## 5.4 Wireframes des Écrans Clés

### Dashboard Cabinet
```
┌─────────────────────────────────────────────────────┐
│ 🔔 Compta Sénégal    [Société: Cabinet ABCD ▼]  👤  │
├─────────────────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐      │
│ │ 12   │ │ 45M  │ │ 3.2M │ │ 92%  │ │ 2    │      │
│ │Clients│ │CA/mois│ │Hono. │ │Conf. │ │Alertes│     │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘      │
├─────────────────────────────────────────────────────┤
│ Sociétés du portefeuille                            │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 🟢 SARL Teranga       CA: 120M  ▲ 12%  Voir ▸  │ │
│ │ 🟡 EURL Baobab        CA: 45M   ▼ 3%   Voir ▸  │ │
│ │ 🔴 SA Sénégal Énergie  CA: 0     ⚠ Retard Voir ▸│ │
│ └─────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────┤
│ Alertes ⚠️                                         │
│ • 3 échéances fiscales cette semaine               │
│ • 5 factures en attente de validation               │
│ • 1 société en retard de clôture                    │
└─────────────────────────────────────────────────────┘
```

### Saisie d'Écriture
```
┌─────────────────────────────────────────────────────┐
│ Nouvelle écriture            [Journal: OD ▼]        │
├─────────────────────────────────────────────────────┤
│ Date : [2026-01-15]  Réf : [FAC-2026-000042]       │
│ Libellé : [Achat fournitures bureau]                │
├─────────────────────────────────────────────────────┤
│ Compte │ Libellé        │ Débit   │ Crédit │ Tiers │
│ ───────┼────────────────┼─────────┼────────┼───────│
│ 605    │ Fournitures    │ 50.000  │        │       │
│ 4452   │ TVA déductible │ 9.000   │        │       │
│ 401    │ Fournisseur X  │         │ 59.000 │  ✓   │
│        │                │         │        │       │
│        │ Total →        │ 59.000  │ 59.000 │       │
├─────────────────────────────────────────────────────┤
│     [Annuler]                 [ Valider ✓ ]         │
│      Ctrl+Z                     Ctrl+S              │
└─────────────────────────────────────────────────────┘
```

### Bilan (État Financier)
```
┌─────────────────────────────────────────────────────┐
│ BILAN ACTIF                    Exercice 2026        │
│ [📄 PDF] [📊 Excel] [🔄 Actualiser]                │
├─────────────────────────────────────────────────────┤
│ Actif immobilisé              Brut   ↓Amort.  Net   │
│  Immobilisations corporelles  45.2M   12.1M  33.1M │
│  Immobilisations incorp.      2.1M    0.8M   1.3M  │
│                                                    │
│ Actif circulant                                     │
│  Clients                    18.5M          18.5M   │
│  TVA déductible              2.3M           2.3M   │
│  Trésorerie                 12.1M          12.1M   │
├─────────────────────────────────────────────────────┤
│ TOTAL ACTIF                              67.3M     │
└─────────────────────────────────────────────────────┘
```

---

# 6. FEUILLE DE ROUTE DÉTAILLÉE (24 Mois)

## Phase 0 — Fondations (Mois 1-2)
| Sprint | Module | Tâches | Estimation |
|--------|--------|--------|------------|
| S1 | Architecture | Mise en place NestJS, Prisma, Redis, BullMQ | 5j |
| S1 | Auth | JWT, 2FA, RBAC, sessions | 5j |
| S2 | Multi-tenant | Switch company, isolation données | 4j |
| S2 | Audit trail | Triggers, logs centralisés | 3j |
| S2 | API Gateway | Rate limiting, CORS, compression | 3j |
| **Total** | | | **20j** |

## Phase 1 — Urgent Légal (Mois 3-4)
| Sprint | Module | Tâches | Estimation |
|--------|--------|--------|------------|
| S3 | Facturation élec. | Émission, transmission DGID, QR code | 8j |
| S4 | Conformité | Moteur scoring, alertes, recommendations | 5j |
| S4 | TVA acomptes | Facture acompte, déduction, régularisation | 5j |
| S4 | DSF XML | Génération DSF, historique | 4j |
| **Total** | | | **22j** |

## Phase 2 — Cœur MVP (Mois 5-7) ✅ DÉJÀ LIVRÉ
| Module | Statut |
|--------|--------|
| Cycle Achats (BC, OCR, workflow, paiements XML) | ✅ Livré |
| Cycle Ventes (devis, facturation, relances, avoirs) | ✅ Livré |
| Trésorerie (matching, import relevés, prévisionnel) | ✅ Livré |
| États financiers OHADA (bilan, CRC, flux) | ✅ Livré |
| Comptabilité analytique (centres, coûts, marges) | ✅ Livré |

## Phase 3 — Cabinets (Mois 8-10)
| Sprint | Module | Tâches | Estimation |
|--------|--------|--------|------------|
| S9 | Dashboard cabinet | Vue multi-entités, KPIs, alertes | 6j |
| S9 | Branding états | Logo, couleurs, modèles PDF | 4j |
| S10 | Modèles écritures | Modèles avec champs variables, génération série | 5j |
| S10 | GED | Upload, OCR, recherche full-text, archivage PDF/A | 8j |
| S11 | Honoraires | Calculateur, génération factures, suivi | 5j |
| S11 | Verrouillage périodes | Blocage, déverrouillage tracé | 3j |
| **Total** | | | **31j** |

## Phase 4 — Nouveaux Marchés (Mois 11-13)
| Sprint | Module | Tâches | Estimation |
|--------|--------|--------|------------|
| S12 | SMT (TPE) | Plan simplifié, états allégés | 5j |
| S12 | Associations | SYSCEBNL, projets, subventions, fonds dédiés | 8j |
| S13 | Agriculture | Actifs agricoles, cycles récolte | 6j |
| S13 | Liquidation | Comptes spécifiques, états de liquidation | 5j |
| S14 | Retraite | Engagements, provisions, écritures | 5j |
| **Total** | | | **29j** |

## Phase 5 — Pilotage & Conseil (Mois 14-16)
| Sprint | Module | Tâches | Estimation |
|--------|--------|--------|------------|
| S15 | Assistant IA | Chatbot, suggestion comptes, recherche SYSCOHADA | 10j |
| S15 | Benchmarking | Ratios, agrégation anonyme, positionnement | 5j |
| S16 | Veille juridique | RSS DGID/BCEAO/OHADA, détection changements | 5j |
| S16 | Contrôles fiscaux | Checklist, timeline, génération argumentaires | 6j |
| S17 | Budgets | Création, suivi écarts, alertes | 5j |
| S17 | Analyse prédictive | Prévisions trésorerie, scénarios what-if | 6j |
| **Total** | | | **37j** |

## Phase 6 — Haut de Gamme (Mois 17-19)
| Sprint | Module | Tâches | Estimation |
|--------|--------|--------|------------|
| S18 | Consolidation | Groupes, éliminations, minoritaires | 8j |
| S18 | OHADA→IFRS | Mapping, retraitements, états IFRS | 6j |
| S19 | Offline-first | PWA, cache local, sync conflits | 8j |
| S19 | Raccourcis clavier | Ctrl+N, Ctrl+S, Ctrl+Z, personnalisable | 3j |
| S20 | Dark mode | Thème sombre, plusieurs variantes | 3j |
| S20 | Dashboard builder | Drag & drop, widgets, export | 6j |
| **Total** | | | **34j** |

## Phase 7 — Intégrations (Mois 20-22)
| Sprint | Module | Tâches | Estimation |
|--------|--------|--------|------------|
| S21 | API publique | Documentation OpenAPI, SDK, portail dev | 8j |
| S21 | Webhooks | Événements, secret, logs | 4j |
| S22 | ERP (Odoo, Dolibarr) | Connecteurs, sync bidirectionnelle | 8j |
| S22 | Banques (BICIS, SGBS) | API bancaires, formats fichiers | 6j |
| S23 | DGID, CNPS, IPRES | Transmission électronique | 6j |
| S23 | Marketplace | Catalogue apps tierces, installation | 5j |
| **Total** | | | **37j** |

## Phase 8 — Marketing & Croissance (Mois 23-24)
| Sprint | Module | Tâches | Estimation |
|--------|--------|--------|------------|
| S24 | Site web + Démo | Landing page, demo interactive, SEO | 8j |
| S24 | Essai gratuit | 30 jours, onboarding automatisé | 4j |
| S25 | Tarification | Modules pricing, abonnements, facturation | 5j |
| S25 | Partenariats | Programme de parrainage, API partenaires | 5j |
| S25 | Extension UEMOA | Côte d'Ivoire, Mali, Burkina Faso | 8j |
| **Total** | | | **30j** |

### Temps Total Estimé : ~240 jours ouvrés ≈ 12 mois (24 en parallélisant)

---

# 7. STRATÉGIE DE MIGRATION (Sage/EBP → Compta Sénégal)

## 7.1 Processus en 5 Étapes

```
ÉTAPE 1 — Audit (Jour 1)
  • Analyser la balance Sage/EBP (fichier Excel ou CSV)
  • Vérifier cohérence : total débit = total crédit
  • Estimer le volume d'écritures
  • Durée : 2h

ÉTAPE 2 — Mapping (Jour 1-2)
  • Convertir le plan comptable source vers SYSCOHADA
  • Table de correspondance automatique (60% des comptes)
  • Suggestions pour les 40% restants (validation expert-comptable)
  • Durée : 1 jour

ÉTAPE 3 — Import (Jour 2-3)
  • Charger les soldes d'ouverture (journal OD)
  • Importer les écritures de l'exercice en cours
  • Créer les tiers (clients/fournisseurs) automatiquement
  • Durée : 1 jour

ÉTAPE 4 — Contrôle (Jour 3)
  • Vérifier l'équilibre de la balance importée
  • Comparer les totaux (source vs destination)
  • Rapport d'import avec anomalies
  • Durée : 2h

ÉTAPE 5 — Basculement (Jour 3-5)
  • Activer la production sur Compta Sénégal
  • Archiver les données Sage/EBP (export PDF/A)
  • Former l'équipe comptable (1/2 journée)
  • Période de double saisie optionnelle (1 mois)
  • Durée : 2 jours
```

## 7.2 Fichiers d'Import Supportés

| Format | Source | Contenu |
|--------|--------|---------|
| Excel (.xlsx) | Sage, EBP, Ciel | Balance, écritures, tiers |
| CSV (.csv) | Générique | Balance (compte;libellé;débit;crédit) |
| XML (.xml) | Sage 100 | Export structuré |
| FEC (.txt) | Sage France | Fichier d'Écritures Comptables |

## 7.3 Outils de Migration Inclus
- `lib/migration.ts` — Import Excel/CSV avec création auto des comptes et tiers ✅ Livré
- Algorithme de conversion des codes comptes Sage → OHADA
- Vérification d'équilibre des balances
- Rapport détaillé des anomalies

---

# 8. PLAN DE TEST

## 8.1 Tests Unitaires (Jest)
```typescript
// Coverage cible : 80%+
// Fichiers : *.spec.ts à côté de chaque module

describe('BankMatching', () => {
  it('should score 100 when amount, date and reference match exactly', () => {});
  it('should score 70 when only amount and date match', () => {});
  it('should score 0 when nothing matches', () => {});
  it('should auto-approve when score >= 90', () => {});
});
```

## 8.2 Tests d'Intégration (Supertest)
```typescript
describe('POST /api/v1/entries', () => {
  it('should create a balanced entry', async () => {});
  it('should reject unbalanced entry (debit ≠ credit)', async () => {});
  it('should reject entry in closed period', async () => {});
  it('should create audit log on entry creation', async () => {});
});
```

## 8.3 Tests de Charge (k6)
```javascript
// Cible : 1000 utilisateurs simultanés, temps de réponse < 500ms
export default function() {
  http.get('/api/v1/dashboard/cabinet');
  sleep(1);
}
```

## 8.4 Tests de Sécurité (OWASP Top 10)
- ✅ Injection SQL (via Prisma paramétré)
- ✅ XSS (via React + Content-Security-Policy)
- ✅ CSRF (via SameSite cookies)
- ✅ Rate limiting (via express-rate-limit)
- ✅ 2FA for sensitive actions

---

# 9. PLAN DE DÉPLOIEMENT

## 9.1 CI/CD (GitHub Actions)

```yaml
name: Deploy
on: push to main

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - npm ci && npm test && npm run lint

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - Vercel deploy (frontend)
      - Supabase migrations (database)
      - BullMQ workers restart
```

## 9.2 Infrastructure as Code (Terraform)

```hcl
# Modules : Vercel, Supabase, Redis
resource "vercel_project" "compta" {
  name = "compta-senegal"
  framework = "nextjs"
}
```

## 9.3 Monitoring (Prometheus + Grafana)

| Métrique | Seuil d'alerte | Action |
|----------|---------------|--------|
| CPU > 80% | 5 minutes | Scaling automatique |
| RAM > 85% | 5 minutes | Scaling automatique |
| API response > 1s | 1% des requêtes | Investigation |
| Erreurs 5xx > 1% | 5 minutes | Rollback |
| Queue depth > 1000 | 10 minutes | Scaling workers |

---

# 10. DOCUMENTATION UTILISATEUR

## 10.1 Manuel d'Utilisation (Sections)

```
1. Premiers pas
   1.1 Créer un compte
   1.2 Configurer votre entreprise
   1.3 Inviter votre équipe
   1.4 Paramétrer le plan comptable

2. Saisie comptable
   2.1 Saisie manuelle
   2.2 Import automatique (email, OCR)
   2.3 Modèles d'écritures

3. Achats & Fournisseurs
   3.1 Bons de commande
   3.2 Réception des factures (OCR)
   3.3 Contrôle conformité
   3.4 Paiements fournisseurs

4. Ventes & Clients
   4.1 Devis
   4.2 Facturation
   4.3 Relances
   4.4 Encaissements

5. Trésorerie
   5.1 Import relevés bancaires
   5.2 Rapprochement automatique
   5.3 Prévisionnel

6. États financiers
   6.1 Bilan
   6.2 Compte de résultat
   6.3 Déclarations fiscales (DSF)

7. Administration
   7.1 Gestion des utilisateurs
   7.2 Piste d'audit
   7.3 Paramètres
```

## 10.2 Tutoriels Vidéo (10 vidéos de 3-5 min)

```
1. Première connexion et configuration (3 min)
2. Saisir sa première écriture (4 min)
3. Importer une facture fournisseur par OCR (5 min)
4. Générer un bilan (3 min)
5. Déclarer la TVA (DSF) (4 min)
6. Rapprocher un relevé bancaire (4 min)
7. Créer un devis et le transformer en facture (3 min)
8. Calculer la paie (5 min)
9. Utiliser le dashboard cabinet (4 min)
10. Configurer des alertes (3 min)
```

---

# 11. STRATÉGIE MARKETING & COMMERCIALE

## 11.1 Positionnement

```
Pour       : Experts-comptables, TPE/PME, associations au Sénégal et en UEMOA
Qui        : Veulent une comptabilité conforme OHADA sans ressaisie
Notre app  : Compta Sénégal
Est        : La plateforme comptable "zéro saisie" la plus complète d'Afrique de l'Ouest
Contrairement à : Sage, EBP, Ciel (chers, pas adaptés OHADA)
Notre avantage : 100% OHADA, spécificités sénégalaises, IA, multi-entités, prix local
```

## 11.2 Tarification

| Offre | Prix | Cible | Fonctionnalités |
|-------|------|-------|-----------------|
| **Starter** | Gratuit | TPE, auto-entrepreneur | 1 société, 50 écritures/mois, SMT |
| **Pro** | 29 000 FCFA/mois | PME | 3 sociétés, illimité, OCR, banque |
| **Cabinet** | 99 000 FCFA/mois | Cabinets | 20 sociétés, multi-utilisateurs, analytique |
| **Enterprise** | Sur devis | Grands groupes | Illimité, consolidation, IFRS, on-premise |

## 11.3 Stratégie Go-to-Market

```
Mois 1-3  : Bêta fermée (10 cabinets partenaires)
Mois 4-6  : Lancement public + webinaires
Mois 7-12 : Partenariats banques + ordre des experts-comptables
Mois 12+  : Extension Côte d'Ivoire, Mali, Burkina Faso
```

## 11.4 Canaux d'Acquisition

| Canal | Budget | ROI estimé |
|-------|--------|------------|
| LinkedIn Ads (ciblage experts-comptables) | 500 000 FCFA/mois | 5x |
| Partenariats ordre des experts-comptables | Négociation | 10x |
| Webinaires mensuels | 100 000 FCFA/mois | 8x |
| SEO (blog OHADA, comptabilité Sénégal) | 200 000 FCFA/mois | 6x |
| Programme de parrainage | 10% récurrence | 12x |

---

# 12. MES 5 PRIORITÉS ABSOLUES (V1.0 "INVINCIBLE")

Pour ne pas vous noyer, concentrez-vous sur ces 5 piliers :

```
┌────────────────────────────────────────────────────────────┐
│  🔴  1. Zéro saisie manuelle (80% des écritures)         │
│      Cycles Achats + Ventes automatisés → ✅ 60% LIVRÉ    │
├────────────────────────────────────────────────────────────┤
│  🟡  2. États financiers OHADA (Valeur juridique)         │
│      Bilan, CRC, Flux trésorerie → ✅ LIVRÉ               │
├────────────────────────────────────────────────────────────┤
│  🟢  3. DSF + Déclarations fiscales (Conformité)          │
│      XML DGID, TVA, IS → ✅ LIVRÉ                         │
├────────────────────────────────────────────────────────────┤
│  🔵  4. Comptabilité analytique (Pilotage)                │
│      Centres, coûts, marges → ✅ LIVRÉ                     │
├────────────────────────────────────────────────────────────┤
│  🟣  5. Dashboard cabinet + Sécurité (Confiance)          │
│      Multi-entités, 2FA, audit trail → ✅ PARTIEL         │
└────────────────────────────────────────────────────────────┘
```

---

# 13. RÉSUMÉ DES LIVRABLES

## Ce qui a été livré (37 fichiers)

### SQL (4 fichiers, ~80 tables)
`schema.sql` + `schema-extensions.sql` + `schema-module-1-2-achats-ventes.sql` + `schema-mvp-pro-senegal.sql` + `schema-phase-2-avancee.sql`

### Librairies (19 fichiers)
`purchaseOrders`, `emailImport`, `invoiceControl`, `workflow`, `reminders`, `supplierPayments`, `quotes`, `financialStatements`, `dsfGenerator`, `taxSettings`, `customerDeposits`, `bankMatching`, `feeCalculator`, `migration`, `budgets`, `compliance`, `consolidation`

### Pages UI (8 pages)
`bons-de-commande`, `devis`, `controle-conformite`, `echeancier-fournisseurs`, `paiements-fournisseurs`, `acomptes-clients`, `cabinet`

### Documentation (2 fichiers)
`feuille-de-route-automatisation.md` + `architecture-avancee.md`

## Prochaines étapes immédiates

1. **Exécuter les scripts SQL** dans Supabase (dans l'ordre)
2. **Configurer BullMQ** avec Redis pour les tâches asynchrones
3. **Déployer la version bêta** auprès de 10 cabinets partenaires
4. **Itérer sur le feedback** des premiers utilisateurs
5. **Lancer la version publique** avec les 5 piliers

---

> **"Compta Sénégal — La comptabilité OHADA sans ressaisie."**
> 
> Prêt à conquérir le marché ouest-africain. 🚀