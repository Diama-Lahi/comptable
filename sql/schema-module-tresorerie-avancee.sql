-- ============================================================================
-- MODULE TRÉSORERIE AVANCÉE — Mobile Money, Chèques, Caisse, Traites
-- Dépend de schema.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. CONNECTEURS MOBILE MONEY (Wave, Orange Money, Free Money)
-- ---------------------------------------------------------------------------
create table mobile_money_config (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  provider text not null check (provider in ('wave','orange_money','free_money')),
  merchant_name text not null,
  merchant_code text,                              -- Code marchand Wave/OM
  api_key text,                                    -- Chiffré
  phone_number text not null,                       -- Numéro associé
  active boolean default true,
  last_sync_at timestamptz,
  created_at timestamptz default now(),
  unique (company_id, provider)
);

create table mobile_money_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  provider text not null check (provider in ('wave','orange_money','free_money')),
  config_id uuid references mobile_money_config(id),
  external_tx_id text,                             -- ID transaction chez l'opérateur
  type text not null check (type in ('reception','paiement')),
  sender_phone text,
  sender_name text,
  amount numeric(19,4) not null,
  provider_fees numeric(19,4) not null default 0,  -- Frais opérateur
  net_amount numeric(19,4) generated always as (amount - provider_fees) stored,
  tx_date timestamptz not null,
  reference text,                                  -- Référence/narration
  -- Rapprochement
  reconciled boolean default false,
  invoice_id uuid references invoices(id),
  entry_id uuid references entries(id),
  -- Métadonnées
  raw_data jsonb,                                  -- Données brutes de l'API
  imported_at timestamptz default now(),
  unique (company_id, external_tx_id)
);

create index idx_mm_tx_reconciled on mobile_money_transactions(reconciled);
create index idx_mm_tx_date on mobile_money_transactions(tx_date);

-- ---------------------------------------------------------------------------
-- 2. BROUILLARD DE CAISSE & BILLETAGE
-- ---------------------------------------------------------------------------
create table cash_voucher_lines (
  id uuid primary key default gen_random_uuid(),
  cash_voucher_id uuid not null references cash_vouchers(id) on delete cascade,
  bill_type text,                                  -- 'billet_10000', 'billet_5000', 'piece_500', etc.
  bill_value numeric(10,2),
  quantity int not null default 0,
  subtotal numeric(15,2) generated always as (bill_value * quantity) stored
);

-- PV de caisse (billetage physique)
create table cash_audit_sheets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  audit_date date not null default current_date,
  accountant text not null,                        -- Caissier
  controller text,                                 -- Contrôleur
  -- Soldes
  theoretical_balance numeric(19,4) not null,      -- Solde théorique comptable
  physical_balance numeric(19,4) not null,         -- Solde compté physiquement
  discrepancy numeric(19,4) generated always as (physical_balance - theoretical_balance) stored,
  notes text,
  signature_url text,
  status text default 'pending' check (status in ('pending','validated','anomaly')),
  created_at timestamptz default now()
);

-- Solde créditeur de caisse interdit (détection automatique)
create table cash_anomalies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  detection_date date not null default current_date,
  anomaly_type text not null check (anomaly_type in ('credit_balance','missing_audit','ledger_gap')),
  description text not null,
  resolved boolean default false,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 3. CHAÎNE DU CHÈQUE & TRAITES
-- ---------------------------------------------------------------------------
create table checks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  type text not null check (type in ('emitted','received')),
  check_number text not null,
  bank_name text,
  issue_date date not null,
  due_date date,                                   -- Date d'échéance
  amount numeric(19,4) not null,
  beneficiary text,                                -- Bénéficiaire ou émetteur
  -- Statut workflow
  status text not null default 'portfolio' check (status in
    ('portfolio','deposited','cleared','rejected','cashed','cancelled')),
  deposit_date date,                               -- Date de remise
  clearance_date date,                             -- Date d'encaissement effectif
  -- Références comptables
  invoice_id uuid references invoices(id),
  entry_id uuid references entries(id),
  reconciliation_id uuid references reconciliations(id),
  notes text,
  created_at timestamptz default now(),
  unique (company_id, check_number, type)
);

create table bills_of_exchange (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  type text not null check (type in ('lcr','promissory_note')),
  reference_number text not null,
  issuer_id uuid references third_parties(id),     -- Tireur
  drawee_id uuid references third_parties(id),     -- Tiré
  amount numeric(19,4) not null,
  issue_date date not null,
  maturity_date date not null,                     -- Date d'échéance
  status text not null default 'active' check (status in
    ('active','discounted','endorsed','paid','protested','cancelled')),
  -- Escompte
  discount_rate numeric(6,4),                      -- Taux d'escompte
  discounted_amount numeric(19,4),                  -- Montant escompté
  bank_id uuid references third_parties(id),       -- Banque d'escompte
  entry_id uuid references entries(id),
  created_at timestamptz default now()
);

create index idx_checks_status on checks(status);
create index idx_checks_company on checks(company_id, type, status);

-- ---------------------------------------------------------------------------
-- 4. GESTION DES FRAIS DE TRANSACTION (séparation principale/frais)
-- ---------------------------------------------------------------------------
create table transaction_fee_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  payment_method text not null check (payment_method in
    ('wave','orange_money','free_money','bank_transfer','check')),
  fee_type text not null check (fee_type in ('fixed','percentage','mixed')),
  fixed_fee numeric(19,4) default 0,
  percentage_fee numeric(6,4) default 0,           -- ex: 0.01 pour 1%
  fee_account_code text not null default '631',    -- Frais bancaires
  active boolean default true,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 5. CONFORMITÉ TIERS (NINEA, RCCM, ARF)
-- ---------------------------------------------------------------------------
alter table third_parties add column if not exists ninea text;
alter table third_parties add column if not exists rccm text;
alter table third_parties add column if not exists arf_valid_until date;
alter table third_parties add column if not exists business_sector text;

create table arf_history (
  id uuid primary key default gen_random_uuid(),
  third_party_id uuid not null references third_parties(id) on delete cascade,
  arf_number text,
  valid_from date not null,
  valid_to date not null,
  document_url text,
  created_at timestamptz default now()
);