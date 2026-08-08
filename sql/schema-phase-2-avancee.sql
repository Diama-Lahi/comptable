-- ============================================================================
-- PHASE 2 AVANCÉE — Tables pour les modules avancés
-- Dépend de schema.sql, schema-extensions.sql, schema-mvp-pro-senegal.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. FACTURATION ÉLECTRONIQUE (Obligation 2026)
-- ---------------------------------------------------------------------------
create table electronic_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  invoice_id uuid references invoices(id),
  dgid_invoice_id text unique,
  xml_content text not null,
  qr_code text,
  transmitted_at timestamptz,
  ack_status text check (ack_status in ('pending','acknowledged','rejected','error')),
  ack_detail jsonb,
  archive_url text,
  created_at timestamptz default now()
);

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

-- ---------------------------------------------------------------------------
-- 2. SOCIÉTÉS EN LIQUIDATION
-- ---------------------------------------------------------------------------
create table liquidations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  start_date date not null,
  expected_end_date date,
  end_date date,
  liquidator_name text not null,
  status text check (status in ('open','realization','closing','closed')),
  asset_realization jsonb default '[]',
  liability_settlement jsonb default '[]',
  liquidation_account text default '837',
  created_at timestamptz default now()
);
alter table fiscal_periods add column if not exists is_liquidation boolean default false;

-- ---------------------------------------------------------------------------
-- 3. SYSTÈME MINIMAL DE TRÉSORERIE (TPE)
-- ---------------------------------------------------------------------------
create table smt_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  active boolean default false,
  simplified_chart boolean default true,
  no_inventory boolean default true,
  simplified_statements boolean default true,
  revenue_threshold numeric(15,2),
  switched_at timestamptz,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 4. ASSOCIATIONS (SYSCEBNL)
-- ---------------------------------------------------------------------------
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
  grantor_name text not null,
  grant_number text,
  amount_approved numeric(19,4),
  amount_received numeric(19,4) default 0,
  conditions jsonb,
  reporting_dates jsonb,
  status text check (status in ('pending','active','completed','terminated')),
  created_at timestamptz default now()
);

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

-- ---------------------------------------------------------------------------
-- 5. COMPTABILITÉ AGRICOLE
-- ---------------------------------------------------------------------------
create table agricultural_assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  type text check (type in ('land','plantation','livestock','equipment')),
  label text not null,
  surface_ha numeric(10,2),
  head_count int,
  acquisition_date date,
  useful_life_months int,
  depreciation_method text default 'lineaire',
  current_value numeric(19,4),
  created_at timestamptz default now()
);

create table harvest_cycles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  crop text not null,
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

-- ---------------------------------------------------------------------------
-- 6. CONSOLIDATION
-- ---------------------------------------------------------------------------
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
  ownership_percentage numeric(5,2) not null,
  consolidation_method text check (consolidation_method in ('full','equity','proportional')),
  created_at timestamptz default now()
);

create table consolidation_results (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references consolidation_groups(id),
  period_from date not null,
  period_to date not null,
  total_assets numeric(19,4),
  total_liabilities numeric(19,4),
  equity_group_share numeric(19,4),
  equity_minority_share numeric(19,4),
  revenue numeric(19,4),
  net_income_group numeric(19,4),
  net_income_minority numeric(19,4),
  data jsonb,
  generated_at timestamptz default now(),
  unique (group_id, period_from, period_to)
);

-- ---------------------------------------------------------------------------
-- 7. GESTION BUDGÉTAIRE
-- ---------------------------------------------------------------------------
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
  account_code text not null,
  label text not null,
  amount_budgeted numeric(19,4) not null,
  amount_actual numeric(19,4) default 0,
  variance numeric(19,4) generated always as (amount_actual - amount_budgeted) stored,
  variance_percent numeric(5,2) generated always as 
    (case when amount_budgeted > 0 then ((amount_actual - amount_budgeted) / amount_budgeted) * 100 else 0 end) stored,
  period_month int,
  notes text
);

-- ---------------------------------------------------------------------------
-- 8. ENGAGEMENTS DE RETRAITE
-- ---------------------------------------------------------------------------
create table pension_commitments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  employee_id uuid references employees(id),
  calculation_date date not null,
  annual_salary numeric(19,4),
  years_of_service int,
  accrual_rate numeric(6,4),
  commitment_amount numeric(19,4),
  provision_amount numeric(19,4),
  entry_id uuid references entries(id),
  status text check (status in ('calculated','provisioned','paid')),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 9. CAUTIONS, GARANTIES ET LITIGES
-- ---------------------------------------------------------------------------
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
  provision_amount numeric(19,4),
  start_date date not null,
  expected_end_date date,
  status text check (status in ('open','in_progress','won','lost','settled')),
  notes text,
  entry_id uuid references entries(id),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 10. GED (Gestion Électronique de Documents)
-- ---------------------------------------------------------------------------
create table document_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  code text not null,
  label text not null,
  retention_months int default 120,
  requires_validation boolean default true,
  unique (company_id, code)
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  document_type_id uuid references document_types(id),
  invoice_id uuid references invoices(id),
  entry_id uuid references entries(id),
  filename text not null,
  mime_type text not null,
  file_size int,
  file_url text not null,
  thumbnail_url text,
  ocr_text text,
  ocr_done boolean default false,
  archive_date date,
  archive_url text,
  retention_end date,
  validation_status text check (validation_status in ('pending','validated','rejected')),
  validated_by text,
  validated_at timestamptz,
  tags text[],
  notes text,
  uploaded_by text,
  created_at timestamptz default now()
);

create index idx_documents_ocr on documents using gin(to_tsvector('french', coalesce(ocr_text, '')));
create index idx_documents_tags on documents using gin(tags);

-- ---------------------------------------------------------------------------
-- 11. MESSAGERIE INTÉGRÉE
-- ---------------------------------------------------------------------------
create table conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  subject text,
  participant_ids uuid[] not null,
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

-- ---------------------------------------------------------------------------
-- 12. VEILLE JURIDIQUE & BENCHMARKING
-- ---------------------------------------------------------------------------
create table legal_feeds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  feed_url text not null,
  feed_label text not null,
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
  relevance_tags text[],
  notified boolean default false,
  created_at timestamptz default now()
);

create table risk_scores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  score_date date not null default current_date,
  overall_score int check (overall_score between 0 and 100),
  vat_score int,
  tax_score int,
  social_score int,
  accounting_score int,
  risk_factors jsonb,
  recommendations text[],
  created_at timestamptz default now()
);

create table benchmarking_data (
  id uuid primary key default gen_random_uuid(),
  sector text not null,
  period_from date not null,
  period_to date not null,
  avg_margin_rate numeric(6,4),
  avg_receivable_turnover numeric(10,2),
  avg_payable_turnover numeric(10,2),
  avg_inventory_turnover numeric(10,2),
  avg_roe numeric(6,4),
  sample_size int,
  generated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 13. CONVERSION OHADA → IFRS
-- ---------------------------------------------------------------------------
create table ifrs_mapping (
  id uuid primary key default gen_random_uuid(),
  ohada_account_code text not null,
  ifrs_account_code text not null,
  ifrs_account_label text,
  retreatment_type text check (retreatment_type in ('none','reclassification','adjustment')),
  adjustment_formula text,
  created_at timestamptz default now(),
  unique (ohada_account_code, ifrs_account_code)
);

create table ifrs_financials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  period_from date not null,
  period_to date not null,
  statement_type text check (statement_type in ('balance_sheet','income','cash_flow','equity')),
  data jsonb not null,
  generated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- INDEX
-- ---------------------------------------------------------------------------
create index idx_electronic_invoices on electronic_invoices(company_id, dgid_invoice_id);
create index idx_documents_company on documents(company_id);
create index idx_messages_conversation on messages(conversation_id);
create index idx_legal_updates_feed on legal_updates(feed_id);
create index idx_risk_scores_company on risk_scores(company_id, score_date desc);
create index idx_benchmarking_sector on benchmarking_data(sector, period_from, period_to);