# Architecture Avancée — Compta Sénégal Phase 2

## 1. Architecture Technique Globale

### 1.1 Stack Technologique
```
Frontend (Next.js 16 + React 19)
    ↕ API REST (Next.js API Routes)
        ↕ 
    ┌──────────────────────────────────────┐
    │         API Gateway (Next.js)        │
    ├──────────────────────────────────────┤
    │  Auth → Supabase Auth (JWT + RBAC)   │
    │  Queue → BullMQ (Redis)              │
    │  Cache → Redis                       │
    │  Search → Meilisearch / pg_search    │
    │  Email → Nodemailer + IMAP           │
    │  Storage → Supabase Storage (PDF/A)  │
    │  OCR → Tesseract.js + Azure AI       │
    └──────────────────────────────────────┘
        ↕
    ┌──────────────────────────────────────┐
    │    PostgreSQL (Supabase)             │
    │    + audit_logs (triggers)           │
    │    + pgmq (file d'attente natif)     │
    └──────────────────────────────────────┘
        ↕
    Services Externes :
    ┌──────────────────────────────────────┐
    │  BCEAO → Taux de change              │
    │  DGID → Facturation électronique     │
    │  Banques → API (BICIS, SGBS, etc.)   │
    │  RSS → Flux veille juridique         │
    └──────────────────────────────────────┘
```

### 1.2 Architecture Microservices (Modules Lourds)
```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ OCR Service  │ │ PDF/XML Gen │ │ Consolidation│
│ (BullMQ)     │ │ (BullMQ)    │ │ (BullMQ)     │
└─────────────┘ └─────────────┘ └─────────────┘
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ Email Import│ │ Benchmarking│ │ Veille Jur. │
│ (IMAP)      │ │ (Batch)     │ │ (RSS)       │
└─────────────┘ └─────────────┘ └─────────────┘
```

---

## 2. Modèle de Données Complet

### 2.1 Facturation Électronique (Obligation 2026)
```sql
create table electronic_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  invoice_id uuid references invoices(id),
  dgid_invoice_id text unique,           -- ID attribué par la DGID
  xml_content text not null,              -- Facture au format XML DGID
  qr_code text,                           -- QR code sécurisé
  transmitted_at timestamptz,             -- Date d'envoi à la DGID
  ack_status text check (ack_status in ('pending','acknowledged','rejected','error')),
  ack_detail jsonb,                       -- Réponse détaillée de la DGID
  archive_url text,                       -- Lien vers l'archive PDF/A
  created_at timestamptz default now()
);

create table electronic_invoice_audit_trail (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id),
  event_type text not null,               -- 'emission', 'transmission', 'validation', 'annulation'
  event_data jsonb,
  performed_at timestamptz default now()
);

-- Piste d'audit des factures (obligation légale)
create table invoice_audit_trail (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  invoice_id uuid references invoices(id),
  action text not null check (action in ('created','modified','sent','cancelled','archived')),
  performed_by text,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  performed_at timestamptz default now()
);
```

### 2.2 Sociétés en Liquidation (OHADA)
```sql
create table liquidations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  start_date date not null,                -- Date d'ouverture de la liquidation
  expected_end_date date,
  end_date date,
  liquidator_name text not null,           -- Nom du liquidateur
  status text check (status in ('open','realization','closing','closed')),
  -- Réalisation de l'actif
  asset_realization jsonb default '[]',    -- Liste des actifs réalisés
  liability_settlement jsonb default '[]', -- Liste des passifs réglés
  -- Comptes spécifiques
  liquidation_account text default '837',  -- Charges de liquidation
  created_at timestamptz default now()
);

alter table fiscal_periods add column if not exists is_liquidation boolean default false;
```

### 2.3 Système Minimal de Trésorerie (SMT — TPE)
```sql
create table smt_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  active boolean default false,
  simplified_chart boolean default true,    -- Plan comptable simplifié
  no_inventory boolean default true,        -- Pas d'inventaire obligatoire
  simplified_statements boolean default true, -- États simplifiés
  revenue_threshold numeric(15,2),          -- Seuil de CA pour basculement
  switched_at timestamptz,                  -- Date de basculement auto
  created_at timestamptz default now()
);

-- Plan comptable SMT (classes allégées)
insert into chart_of_accounts (company_id, code, label, class, account_type)
select id, '571', 'Caisse', 5, 'actif' from companies
where not exists (select 1 from chart_of_accounts ca where ca.company_id = companies.id and ca.code = '571');
```

### 2.4 Associations (SYSCEBNL)
```sql
create table association_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  type text check (type in ('association','ong','fondation','cooperative')),
  fiscal_exempt boolean default false,
  created_at timestamptz default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  code text not null,
  label text not null,
  budget_ht numeric(19,4),
  start_date date,
  end_date date,
  status text check (status in ('planned','active','completed','cancelled')),
  manager text,
  unique (company_id, code)
);

create table grants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  project_id uuid references projects(id),
  grantor_name text not null,              -- Nom du bailleur
  grant_number text,
  amount_approved numeric(19,4),
  amount_received numeric(19,4) default 0,
  conditions jsonb,                         -- Conditions de la subvention
  reporting_dates jsonb,                    -- Dates de reporting
  status text check (status in ('pending','active','completed','terminated')),
  created_at timestamptz default now()
);

-- Fonds dédiés
create table dedicated_funds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  project_id uuid references projects(id),
  grant_id uuid references grants(id),
  fund_type text check (fund_type in ('subvention','don','legs','cotisation')),
  amount numeric(19,4) not null,
  remaining numeric(19,4) not null,
  deadline date,
  status text check (status in ('available','committed','used'))
);
```

### 2.5 Comptabilité Agricole
```sql
create table agricultural_assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  type text check (type in ('land','plantation','livestock','equipment')),
  label text not null,
  surface_ha numeric(10,2),                -- Surface en hectares
  head_count int,                           -- Nombre de têtes (cheptel)
  acquisition_date date,
  useful_life_months int,
  depreciation_method text default 'lineaire',
  current_value numeric(19,4),
  created_at timestamptz default now()
);

create table harvest_cycles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  crop text not null,                       -- Type de culture
  planted_date date,
  expected_harvest_date date,
  actual_harvest_date date,
  estimated_quantity numeric(15,2),
  actual_quantity numeric(15,2),
  unit text default 'kg',
  cost_of_production numeric(19,4),
  entry_id uuid references entries(id),
  status text check (status in ('planted','growing','harvested','sold'))
);
```

### 2.6 Consolidation des Comptes
```sql
create table consolidation_groups (
  id uuid primary key default gen_random_uuid(),
  parent_company_id uuid not null references companies(id),
  label text not null,
  fiscal_year int not null,
  consolidation_method text check (consolidation_method in ('full','equity','proportional')),
  created_at timestamptz default now()
);

create table consolidation_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references consolidation_groups(id),
  company_id uuid not null references companies(id),
  ownership_percentage numeric(5,2) not null, -- % de détention
  consolidation_method text check (consolidation_method in ('full','equity','proportional')),
  consolidation_date date,
  created_at timestamptz default now()
);

create table consolidation_entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references consolidation_groups(id),
  type text check (type in ('elimination','reclassification','adjustment')),
  description text,
  account_code text not null,
  amount numeric(19,4) not null,
  source_company_id uuid references companies(id),
  created_at timestamptz default now()
);

-- Résultat consolidé
create table consolidation_results (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references consolidation_groups(id),
  period_from date not null,
  period_to date not null,
  total_assets numeric(19,4),
  total_liabilities numeric(19,4),
  equity_group_share numeric(19,4),         -- Part du groupe
  equity_minority_share numeric(19,4),      -- Intérêts minoritaires
  revenue numeric(19,4),
  net_income_group numeric(19,4),
  net_income_minority numeric(19,4),
  data jsonb,                                -- États consolidés complets
  generated_at timestamptz default now(),
  unique (group_id, period_from, period_to)
);
```

### 2.7 Gestion Budgétaire
```sql
create table budgets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  label text not null,
  fiscal_year int not null,
  type text check (type in ('annual','rolling','project')),
  status text check (status in ('draft','active','closed')),
  created_at timestamptz default now()
);

create table budget_lines (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references budgets(id),
  account_code text not null,               -- Compte 6 ou 7
  label text not null,
  amount_budgeted numeric(19,4) not null,
  amount_actual numeric(19,4) default 0,    -- Réalisé (mis à jour automatiquement)
  variance numeric(19,4) generated always as (amount_actual - amount_budgeted) stored,
  variance_percent numeric(5,2) generated always as 
    (case when amount_budgeted > 0 then ((amount_actual - amount_budgeted) / amount_budgeted) * 100 else 0 end) stored,
  period_month int,                          -- Mois concerné (1-12)
  notes text
);
```

### 2.8 Engagements de Retraite
```sql
create table pension_commitments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  employee_id uuid references employees(id),
  calculation_date date not null,
  -- Méthode OHADA : engagement = salaire annuel × nombre d'années × taux
  annual_salary numeric(19,4),
  years_of_service int,
  accrual_rate numeric(6,4),                -- Taux de constitution (ex: 0.02)
  commitment_amount numeric(19,4),           -- Engagement calculé
  provision_amount numeric(19,4),            -- Provision comptabilisée
  entry_id uuid references entries(id),      -- Écriture de provision
  status text check (status in ('calculated','provisioned','paid')),
  created_at timestamptz default now()
);
```

### 2.9 Cautions, Garanties et Litiges
```sql
create table guarantees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  type text check (type in ('surety','guarantee','warranty','mortgage')),
  counterparty text not null,
  amount numeric(19,4) not null,
  start_date date not null,
  end_date date,
  status text check (status in ('active','expired','called','released')),
  description text,
  created_at timestamptz default now()
);

create table litigations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  type text check (type in ('client','supplier','tax','labor','other')),
  counterparty text not null,
  amount_disputed numeric(19,4),
  provision_amount numeric(19,4),           -- Provision pour risque
  start_date date not null,
  expected_end_date date,
  status text check (status in ('open','in_progress','won','lost','settled')),
  notes text,
  entry_id uuid references entries(id),     -- Écriture de provision
  created_at timestamptz default now()
);

create table guarantee_events (
  id uuid primary key default gen_random_uuid(),
  guarantee_id uuid references guarantees(id),
  event_type text check (event_type in ('creation','renewal','call','release')),
  event_date date not null,
  amount numeric(19,4),
  description text,
  created_at timestamptz default now()
);
```

### 2.10 GED (Gestion Électronique de Documents)
```sql
create table document_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  code text not null,                        -- 'INVOICE', 'BANK_STMT', 'CONTRACT', etc.
  label text not null,
  retention_months int default 120,          -- 10 ans par défaut (OHADA)
  requires_validation boolean default true,
  unique (company_id, code)
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  document_type_id uuid references document_types(id),
  -- Références métier
  invoice_id uuid references invoices(id),
  entry_id uuid references entries(id),
  -- Contenu
  filename text not null,
  mime_type text not null,
  file_size int,
  file_url text not null,                    -- Lien Supabase Storage
  thumbnail_url text,                        -- Aperçu
  -- OCR
  ocr_text text,                             -- Texte extrait (pour recherche)
  ocr_done boolean default false,
  -- Archivage
  archive_date date,
  archive_url text,                          -- PDF/A archivé
  retention_end date,                        -- Date de fin de conservation
  -- Validation
  validation_status text check (validation_status in ('pending','validated','rejected')),
  validated_by text,
  validated_at timestamptz,
  -- Métadonnées
  tags text[],
  notes text,
  uploaded_by text,
  created_at timestamptz default now()
);

create index idx_documents_ocr on documents using gin(to_tsvector('french', coalesce(ocr_text, '')));
create index idx_documents_tags on documents using gin(tags);
```

### 2.11 Messagerie Intégrée
```sql
create table conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  subject text,
  participant_ids uuid[] not null,          -- Users participants
  last_message_at timestamptz,
  created_at timestamptz default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id),
  sender_id uuid not null,
  content text not null,
  attachment_ids uuid[],
  read_at timestamptz,
  created_at timestamptz default now()
);
```

### 2.12 Veille Juridique & Benchmarking
```sql
create table legal_feeds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  feed_url text not null,
  feed_label text not null,                  -- 'DGID', 'BCEAO', 'OHADA', 'JOURNAL_OFFICIEL'
  category text check (category in ('tax','social','commercial','accounting')),
  active boolean default true,
  last_fetched_at timestamptz,
  created_at timestamptz default now()
);

create table legal_updates (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid references legal_feeds(id),
  title text not null,
  content text,
  url text,
  published_at timestamptz,
  relevance_tags text[],                     -- Secteurs concernés
  notified boolean default false,
  created_at timestamptz default now()
);

create table risk_scores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  score_date date not null default current_date,
  overall_score int check (overall_score between 0 and 100),
  -- Sous-scores
  vat_score int,                             -- Conformité TVA
  tax_score int,                             -- Conformité fiscale
  social_score int,                          -- Conformité sociale
  accounting_score int,                      -- Qualité comptable
  -- Détails
  risk_factors jsonb,                        -- Facteurs de risque identifiés
  recommendations text[],
  created_at timestamptz default now()
);

create table benchmarking_data (
  id uuid primary key default gen_random_uuid(),
  sector text not null,                      -- Secteur d'activité
  period_from date not null,
  period_to date not null,
  -- Ratios agrégés (anonymes)
  avg_margin_rate numeric(6,4),
  avg_receivable_turnover numeric(10,2),
  avg_payable_turnover numeric(10,2),
  avg_inventory_turnover numeric(10,2),
  avg_roe numeric(6,4),                     -- Return on Equity
  sample_size int,                           -- Nombre d'entreprises dans l'échantillon
  generated_at timestamptz default now()
);
```

### 2.13 Conversion OHADA → IFRS
```sql
create table ifrs_mapping (
  id uuid primary key default gen_random_uuid(),
  ohada_account_code text not null,
  ifrs_account_code text not null,
  ifrs_account_label text,
  retreatment_type text check (retreatment_type in ('none','reclassification','adjustment')),
  adjustment_formula text,                   -- Formule de retraitement (ex: 'amount * 1.2')
  created_at timestamptz default now(),
  unique (ohada_account_code, ifrs_account_code)
);

create table ifrs_financials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  period_from date not null,
  period_to date not null,
  statement_type text check (statement_type in ('balance_sheet','income','cash_flow','equity')),
  data jsonb not null,                       -- États IFRS complets
  generated_at timestamptz default now()
);
```

---

## 3. Endpoints API Critiques

### 3.1 Facturation Électronique
```
POST   /api/e-invoices/emit          → Émet une facture électronique
POST   /api/e-invoices/transmit      → Transmet à la DGID
GET    /api/e-invoices/:id/status    → Statut de transmission
GET    /api/e-invoices/audit-trail   → Piste d'audit des factures
```

### 3.2 Consolidation
```
POST   /api/consolidation/groups     → Créer un groupe
POST   /api/consolidation/run        → Lancer la consolidation
GET    /api/consolidation/:id/result → Résultat consolidé
GET    /api/consolidation/:id/adjustments → Retraitements
```

### 3.3 Budgets
```
POST   /api/budgets                  → Créer un budget
GET    /api/budgets/:id/variance     → Écarts budget/réel
POST   /api/budgets/update-actuals   → Mettre à jour les réalisés
```

### 3.4 GED
```
POST   /api/documents/upload         → Upload de document
GET    /api/documents/search?q=      → Recherche full-text
GET    /api/documents/:id             → Détail du document
POST   /api/documents/:id/validate   → Valider un document
POST   /api/documents/:id/archive    → Archiver (PDF/A)
```

### 3.5 Assistant IA
```
POST   /api/ai/ask                   → Poser une question (chatbot)
POST   /api/ai/suggest-account       → Suggérer un compte comptable
POST   /api/ai/analyze-invoice       → Analyser une facture (IA)
GET    /api/ai/compliance-score/:id  → Score de conformité
```

### 3.6 Benchmarking
```
POST   /api/benchmarking/generate    → Générer les benchmarks
GET    /api/benchmarking/:sector     → Benchmarks par secteur
GET    /api/benchmarking/company/:id → Position de l'entreprise
```

### 3.7 Contrôle Fiscal
```
POST   /api/tax-audit/start          → Démarrer un contrôle
POST   /api/tax-audit/:id/documents  → Ajouter des pièces
GET    /api/tax-audit/:id/timeline   → Chronologie du contrôle
POST   /api/tax-audit/:id/close      → Clôturer le contrôle
```

---

## 4. Algorithmes Clés

### 4.1 Algorithme de Consolidation
```
1. Récupérer toutes les sociétés du groupe avec leur % de détention
2. Pour chaque société :
   a. Générer le bilan et le CRC individuels
   b. Appliquer le retraitement de consolidation (ex: amortissements IFRS)
3. Agréger les états financiers :
   - Consolidation globale : 100% des filiales contrôlées
   - Mise en équivalence : quote-part des sociétés associées
4. Éliminations internes :
   a. Identifier les opérations réciproques (créances/dettes, achats/ventes)
   b. Éliminer les montants correspondants
   c. Ajuster les impôts différés
5. Calculer :
   a. Part du groupe (majoritaire)
   b. Intérêts minoritaires
   c. Résultat consolidé
6. Générer les états consolidés :
   - Bilan consolidé
   - CRC consolidé
   - Flux de trésorerie consolidé
7. Enregistrer le résultat en base + cache
```

### 4.2 Algorithme de Score de Conformité
```
Score = 100 points répartis en 4 catégories :

1. QUALITÉ COMPTABLE (40 pts)
   - Écritures équilibrées : 10 pts (vérifie debit = credit)
   - Comptes autorisés : 10 pts (vérifie existence dans plan comptable)
   - TVA correcte : 10 pts (vérifie taux et collecte/déduction)
   - Tiers renseignés : 5 pts
   - Pièces justificatives : 5 pts

2. CONFORMITÉ FISCALE (30 pts)
   - TVA déclarée : 10 pts
   - IS calculé : 10 pts
   - Déclarations sociales : 10 pts

3. QUALITÉ DES ÉTATS (20 pts)
   - Bilan équilibré : 10 pts
   - CRC cohérent : 5 pts
   - Annexes complètes : 5 pts

4. RISQUES (10 pts - pénalités)
   - Écritures non standard
   - Provisions insuffisantes
   - Retards de déclaration

→ Score < 50 : Risque élevé
→ Score 50-75 : Risque moyen
→ Score 75-90 : Conforme
→ Score > 90 : Excellent
```

### 4.3 Algorithme de Benchmarking Anonyme
```
1. Pour chaque secteur d'activité :
   a. Filtrer les entreprises du même secteur (code NAF/activité)
   b. Exclure les entreprises avec données incomplètes
   c. Anonymiser : remplacer le nom par un ID

2. Calculer les ratios pour chaque entreprise :
   - Marge brute = (Ventes - Achats) / Ventes
   - Délai de paiement clients = (Créances clients / Ventes) × 365
   - Délai de paiement fournisseurs = (Dettes fournisseurs / Achats) × 365
   - Rotation des stocks = Stocks × 365 / Achats
   - ROE = Résultat net / Capitaux propres

3. Agréger par secteur :
   - Moyenne, médiane, écart-type
   - Quartiles (Q1, Q3)
   - Taille de l'échantillon

4. Stocker les résultats (anonymes) dans benchmarking_data

5. Pour une entreprise donnée :
   a. Calculer ses ratios individuels
   b. Comparer aux benchmarks du secteur
   c. Générer un rapport de positionnement
```

### 4.4 Algorithme de Détection des Changements Législatifs
```
1. Pour chaque flux RSS configuré :
   a. Récupérer les nouveaux articles
   b. Analyser le titre et le contenu avec des mots-clés
   
2. Catégoriser par thème :
   - TVA (mots-clés : TVA, taux, collecte, déductible)
   - IS (mots-clés : impôt, bénéfice, IS, résultat)
   - Social (mots-clés : CNPS, IPRES, salaire, cotisation)
   - Comptable (mots-clés : OHADA, SYSCOHADA, plan comptable)

3. Évaluer l'impact :
   - Score de pertinence (0-100)
   - Secteurs concernés
   - Urgence (date d'effet)

4. Notifier les utilisateurs concernés :
   - Par secteur d'activité
   - Par profil (expert-comptable, chef d'entreprise)
   
5. Archiver dans legal_updates
```

---

## 5. Planning de Développement (6 mois)

```
SPRINT 1-2 (Semaines 1-2) : Fondations
│  ✅ Facturation électronique (urgent 2026)
│  ✅ Modèles d'écritures intelligents
│  ✅ Verrouillage des périodes comptables
│
SPRINT 3-4 (Semaines 3-4) : Qualité & Conformité
│  ✅ Moteur de validation normative
│  ✅ Score de conformité SYSCOHADA
│  ✅ Piste d'audit enrichie (Audit Trail 2.0)
│  ✅ Rôles et permissions granulaires (RBAC)
│
SPRINT 5-6 (Semaines 5-6) : Nouveaux Marchés
│  ✅ Système minimal de trésorerie (TPE)
│  ✅ Comptabilité des associations (SYSCEBNL)
│  ✅ Comptabilité agricole
│  ✅ Sociétés en liquidation
│
SPRINT 7-8 (Semaines 7-8) : Pilotage & Conseil
│  ✅ Assistant IA (chatbot + suggestions)
│  ✅ Benchmarking sectoriel
│  ✅ Veille juridique automatisée
│  ✅ Gestion des contrôles fiscaux
│  ✅ Score de risque fiscal
│
SPRINT 9-10 (Semaines 9-10) : Gestion Financière Avancée
│  ✅ Consolidation des comptes
│  ✅ Gestion budgétaire
│  ✅ Conversion OHADA → IFRS
│  ✅ Engagements de retraite
│
SPRINT 11-12 (Semaines 11-12) : UX & Finalisation
│  ✅ GED intégrée (recherche full-text)
│  ✅ Barre de recherche universelle
│  ✅ Mode hors-ligne (PWA Offline-first)
│  ✅ Raccourcis clavier + Dark Mode
│  ✅ Messagerie intégrée
│  ✅ Personnalisation des états (branding)
```

---

## 6. Stratégie de Migration (Sage/EBP → Compta Sénégal)

### 6.1 Processus en 5 étapes
```
ÉTAPE 1 : Audit
  - Analyser la balance Sage/EBP (fichier Excel ou CSV)
  - Vérifier la cohérence des données
  - Estimer le volume d'écritures

ÉTAPE 2 : Mapping
  - Convertir le plan comptable source vers SYSCOHADA
  - Table de correspondance automatique (suggestions)
  - Validation par l'expert-comptable

ÉTAPE 3 : Import
  - Charger les soldes d'ouverture (journal OD)
  - Importer les écritures de l'exercice en cours
  - Créer les tiers (clients/fournisseurs) automatiquement

ÉTAPE 4 : Contrôle
  - Vérifier l'équilibre de la balance importée
  - Comparer les totaux (source vs destination)
  - Rapport d'import avec anomalies éventuelles

ÉTAPE 5 : Basculement
  - Activer la production sur Compta Sénégal
  - Archiver les données Sage/EBP
  - Former l'équipe comptable (1 journée)
```

### 6.2 Outils de Migration Inclus
- `lib/migration.ts` — Import Excel/CSV avec création auto des comptes et tiers
- Algorithme de conversion des codes comptes Sage → OHADA
- Vérification d'équilibre des balances
- Rapport détaillé des anomalies

---

## 7. Métriques de Succès

| Indicateur | Cible | Mesure |
|---|---|---|
| Taux d'automatisation des écritures | > 95% | Écritures automatiques / total écritures |
| Taux de matching bancaire | > 85% | Transactions matchées / total relevé |
| Satisfaction des experts-comptables | NPS > 50 | Enquête trimestrielle |
| Temps de clôture mensuelle | < 3 jours | Délai moyen constaté |
| Nombre de clients actifs | × 10 | Croissance trimestrielle |
| Part de marché Sénégal | > 5% | Estimation marché adressable |