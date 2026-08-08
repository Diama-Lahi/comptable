-- ============================================================================
-- EXTENSIONS DU SCHÉMA (partie 2) — lettrage, facturation client, comptes
-- courants associés, acomptes, douane, engagements hors bilan, multi-comptes,
-- consolidation.
-- À exécuter après schema.sql et schema-extensions.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. LETTRAGE — liaison factures ↔ paiements (plusieurs-à-plusieurs)
-- ----------------------------------------------------------------------------
create table invoice_payment_links (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references invoices(id) on delete cascade,
  payment_id    uuid not null references payments(id) on delete cascade,
  amount_applied numeric(15,2) not null,
  created_at    timestamptz not null default now()
);

alter table invoices add column if not exists lettering_status text
  default 'non_lettree' check (lettering_status in ('non_lettree','partielle','soldee'));

create index idx_invoice_payment_links_invoice on invoice_payment_links(invoice_id);
create index idx_invoice_payment_links_payment on invoice_payment_links(payment_id);

-- ----------------------------------------------------------------------------
-- 2. FACTURATION CLIENT CONFORME (numérotation légale + mentions)
-- ----------------------------------------------------------------------------
create table invoice_sequences (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  fiscal_year     int not null,
  last_number     int not null default 0,
  unique (company_id, fiscal_year)
);

-- Fonction : retourne le prochain numéro de facture client, sans trou.
create or replace function next_invoice_number(p_company_id uuid, p_fiscal_year int)
returns int as $$
declare
  v_number int;
begin
  insert into invoice_sequences (company_id, fiscal_year, last_number)
  values (p_company_id, p_fiscal_year, 1)
  on conflict (company_id, fiscal_year)
  do update set last_number = invoice_sequences.last_number + 1
  returning last_number into v_number;
  return v_number;
end;
$$ language plpgsql;

alter table invoices add column if not exists legal_number text;       -- ex: 'FAC-2026-000042'
alter table invoices add column if not exists is_cancelled boolean default false;
alter table invoices add column if not exists cancelled_by_invoice_id uuid references invoices(id); -- avoir

-- ----------------------------------------------------------------------------
-- 3. COMPTES COURANTS ASSOCIÉS
-- ----------------------------------------------------------------------------
create table partners (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  name          text not null,
  created_at    timestamptz not null default now()
);

create table partner_current_account_movements (
  id            uuid primary key default gen_random_uuid(),
  partner_id    uuid not null references partners(id) on delete cascade,
  movement_date date not null,
  type          text not null check (type in ('apport','retrait','interet')),
  amount        numeric(15,2) not null,
  entry_id      uuid references entries(id),
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. ACOMPTES ET AVANCES CLIENTS
-- ----------------------------------------------------------------------------
create table customer_deposits (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  third_party_id  uuid references third_parties(id),
  deposit_date    date not null,
  amount          numeric(15,2) not null,
  tva_declared    boolean not null default false,       -- TVA déjà déclarée sur cet acompte
  final_invoice_id uuid references invoices(id),        -- facture finale qui l'apure
  entry_id        uuid references entries(id),
  status          text not null default 'open' check (status in ('open','applied')),
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5. DOUANE ET IMPORT
-- ----------------------------------------------------------------------------
create table customs_declarations (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references companies(id) on delete cascade,
  related_invoice_id    uuid references invoices(id),   -- achat fournisseur importé
  declaration_date      date not null,
  customs_value         numeric(15,2) not null,          -- valeur en douane
  duties_paid           numeric(15,2) not null default 0,-- droits de douane
  import_vat_paid       numeric(15,2) not null default 0,-- TVA à l'import
  transit_fees          numeric(15,2) not null default 0,
  total_landed_cost     numeric(15,2) generated always as
                          (customs_value + duties_paid + import_vat_paid + transit_fees) stored,
  entry_id              uuid references entries(id),
  created_at            timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 6. ENGAGEMENTS HORS BILAN
-- ----------------------------------------------------------------------------
create table off_balance_commitments (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  type          text not null check (type in
                  ('caution_donnee','caution_recue','garantie_bancaire','credit_bail','litige','autre')),
  description   text,
  amount        numeric(15,2),
  start_date    date,
  end_date      date,
  status        text not null default 'active' check (status in ('active','closed')),
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 7. MULTI-COMPTES BANCAIRES / MULTI-CAISSES
-- ----------------------------------------------------------------------------
create table cash_bank_accounts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  type          text not null check (type in ('banque','caisse')),
  label         text not null,                          -- ex: 'Banque FCFA principale', 'Caisse Winnipeg'
  currency      text not null default 'XOF',
  account_code  text not null,                           -- compte SYSCOHADA lié (521x, 571x)
  account_number text,                                    -- numéro de compte bancaire (si banque)
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table bank_transactions add column if not exists cash_bank_account_id uuid references cash_bank_accounts(id);
alter table cash_vouchers add column if not exists cash_bank_account_id uuid references cash_bank_accounts(id);

-- ----------------------------------------------------------------------------
-- 8. SEUIL D'AUDIT LÉGAL (indicateur informatif seulement)
-- ----------------------------------------------------------------------------
alter table companies add column if not exists annual_revenue_estimate numeric(15,2);
alter table companies add column if not exists employee_count_estimate int;
-- Le calcul du seuil (comparaison à des valeurs légales OHADA) se fait côté
-- application/tableau de bord, pas en base — les seuils évoluent et doivent
-- être vérifiés auprès d'un professionnel avant d'être codés en dur.

-- ----------------------------------------------------------------------------
-- 9. CONSOLIDATION MULTI-ENTITÉS (vue simple, pas de consolidation légale)
-- ----------------------------------------------------------------------------
create table consolidation_groups (
  id            uuid primary key default gen_random_uuid(),
  label         text not null                            -- ex: 'Mes activités - vue globale'
);

create table consolidation_group_members (
  group_id      uuid not null references consolidation_groups(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,
  primary key (group_id, company_id)
);

-- Index utiles
create index idx_partner_ca_movements_partner on partner_current_account_movements(partner_id);
create index idx_customs_declarations_invoice on customs_declarations(related_invoice_id);
create index idx_bank_tx_account on bank_transactions(cash_bank_account_id);
