-- ============================================================================
-- EXTENSIONS DU SCHÉMA (partie 3) — sécurité/accès, sauvegarde, relances,
-- rentabilité produit, prévisionnel de trésorerie, mobile money, accès
-- cabinet externe, contrats récurrents.
-- À exécuter après schema.sql, schema-extensions.sql, schema-extensions-2.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RÔLES ET ACCÈS AUX DONNÉES SENSIBLES
-- ----------------------------------------------------------------------------
create table user_roles (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  user_identifier     text not null,                    -- lien vers auth.users plus tard
  role                text not null check (role in
                        ('comptable','dirigeant','controleur','cabinet_externe','associe')),
  can_view_sensitive  boolean not null default false,    -- salaires, contacts personnels
  access_expires_at   timestamptz,                       -- utile pour l'accès cabinet, révocable
  created_at          timestamptz not null default now()
);

create table data_processing_registry (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  data_category   text not null,                          -- ex: 'contacts clients', 'salaires'
  purpose         text not null,
  retention_years int not null default 10,
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. SAUVEGARDE ET CONTINUITÉ
-- ----------------------------------------------------------------------------
create table backup_log (
  id            uuid primary key default gen_random_uuid(),
  backup_date   timestamptz not null default now(),
  status        text not null check (status in ('success','failed')),
  size_mb       numeric(10,2),
  location      text,                                     -- ex: lien de stockage externe
  notes         text
);

-- ----------------------------------------------------------------------------
-- 3. RELANCES CLIENTS AUTOMATISÉES
-- ----------------------------------------------------------------------------
create table reminder_rules (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  days_overdue    int not null,                           -- ex: 7, 15, 30
  tone            text not null check (tone in ('courtois','ferme','mise_en_demeure')),
  template        text,
  active          boolean not null default true
);

create table customer_reminders_sent (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references invoices(id) on delete cascade,
  reminder_rule_id uuid references reminder_rules(id),
  sent_at         timestamptz not null default now(),
  channel         text default 'email' check (channel in ('email','sms','whatsapp'))
);

-- ----------------------------------------------------------------------------
-- 4. RENTABILITÉ PAR PRODUIT/SERVICE
-- ----------------------------------------------------------------------------
create table products_services (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  code          text not null,
  label         text not null,                            -- ex: 'Café Touba 1kg', 'Abonnement École - mensuel'
  unit_cost     numeric(15,2),                             -- coût direct estimé, mis à jour manuellement ou lié aux stocks
  active        boolean not null default true,
  unique (company_id, code)
);

alter table invoice_lines add column if not exists product_id uuid references products_services(id);

-- ----------------------------------------------------------------------------
-- 5. PRÉVISIONNEL DE TRÉSORERIE
-- ----------------------------------------------------------------------------
create table recurring_charges (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  label           text not null,                           -- ex: 'Loyer bureau', 'Abonnement Vercel'
  amount          numeric(15,2) not null,
  frequency       text not null check (frequency in ('mensuelle','trimestrielle','annuelle')),
  next_due_date   date not null,
  active          boolean not null default true
);

-- Le prévisionnel lui-même (projection) est calculé côté application à
-- partir de : invoices (échéances non encaissées/payées) + recurring_charges.
-- Pas besoin d'une table de plus ; juste une vue si utile :
create or replace view cash_flow_forecast_inputs as
  select 'facture_client' as source, due_date as expected_date, amount_ttc as amount, company_id
    from invoices where type = 'client' and status not in ('paid','archived')
  union all
  select 'facture_fournisseur' as source, due_date as expected_date, -amount_ttc as amount, company_id
    from invoices where type = 'fournisseur' and status not in ('paid','archived')
  union all
  select 'charge_recurrente' as source, next_due_date as expected_date, -amount as amount, company_id
    from recurring_charges where active = true;

-- ----------------------------------------------------------------------------
-- 6. SPÉCIFICITÉS WAVE / ORANGE MONEY
-- ----------------------------------------------------------------------------
alter table cash_bank_accounts add column if not exists provider text
  check (provider in ('banque_classique','wave','orange_money','autre'));
alter table cash_bank_accounts add column if not exists settlement_delay_days int default 0;

create table mobile_money_fees (
  id                uuid primary key default gen_random_uuid(),
  cash_bank_account_id uuid not null references cash_bank_accounts(id) on delete cascade,
  bank_transaction_id  uuid references bank_transactions(id),
  fee_amount        numeric(15,2) not null,
  created_at        timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 7. CONTRATS ET FACTURATION RÉCURRENTE
-- ----------------------------------------------------------------------------
create table contracts (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  third_party_id  uuid references third_parties(id),
  label           text not null,                           -- ex: 'Abonnement École Cheikh Djibril Gaye'
  amount          numeric(15,2) not null,
  frequency       text not null check (frequency in ('mensuelle','annuelle')),
  start_date      date not null,
  end_date        date,
  status          text not null default 'active' check (status in ('active','suspended','terminated')),
  created_at      timestamptz not null default now()
);

create table recurring_invoice_log (
  id              uuid primary key default gen_random_uuid(),
  contract_id     uuid not null references contracts(id) on delete cascade,
  invoice_id      uuid references invoices(id),
  period_date     date not null,
  generated_at    timestamptz not null default now(),
  unique (contract_id, period_date)
);

-- Index utiles
create index idx_user_roles_company on user_roles(company_id);
create index idx_reminders_sent_invoice on customer_reminders_sent(invoice_id);
create index idx_invoice_lines_product on invoice_lines(product_id);
create index idx_contracts_third_party on contracts(third_party_id);
