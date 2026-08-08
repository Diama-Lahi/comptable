-- ============================================================================
-- EXTENSION SCHÉMA — Modules 1 & 2 : Cycles Achats et Ventes
-- Dépend de schema.sql et schema-extensions.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. BONS DE COMMANDE FOURNISSEURS (Module 1.1)
-- ---------------------------------------------------------------------------
create table purchase_orders (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  supplier_id       uuid not null references third_parties(id),
  po_number         text not null,                -- numéro bon de commande
  po_date           date not null default current_date,
  expected_date     date,                          -- date de livraison prévue
  total_ht          numeric(15,2) not null default 0,
  total_ttc         numeric(15,2) not null default 0,
  status            text not null default 'draft'
                      check (status in ('draft','sent','partially_received','received','cancelled')),
  notes             text,
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (company_id, po_number)
);

create table purchase_order_lines (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  description       text not null,
  quantity          numeric(10,2) not null default 1,
  unit_price        numeric(15,2) not null,
  tva_rate          numeric(5,2) default 18.00,
  amount_ht         numeric(15,2) generated always as (quantity * unit_price) stored,
  amount_ttc        numeric(15,2) generated always as (quantity * unit_price * (1 + tva_rate/100)) stored,
  received_qty      numeric(10,2) not null default 0
);

-- ---------------------------------------------------------------------------
-- 2. EMAIL IMPORT CONFIG (Module 1.2)
-- ---------------------------------------------------------------------------
create table email_import_config (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  provider          text not null check (provider in ('imap','gmail','outlook')),
  email_address     text not null,
  -- Les credentials sont chiffrés (chiffrement applicatif côté serveur)
  credentials_ref   text,                          -- référence vers le secret stocké
  folder            text not null default 'INBOX',
  last_checked_at   timestamptz,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (company_id, email_address)
);

create table imported_emails (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  config_id         uuid references email_import_config(id),
  message_id        text,                          -- Message-ID de l'email
  from_address      text,
  subject           text,
  received_at       timestamptz,
  attachment_count  int default 0,
  -- Attachements traités (factures, etc.)
  processed         boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (company_id, message_id)
);

-- ---------------------------------------------------------------------------
-- 3. CONTRÔLE CONFORMITÉ BC/FACTURE (Module 1.4)
-- ---------------------------------------------------------------------------
create table invoice_controls (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  invoice_id        uuid not null references invoices(id),
  purchase_order_id uuid references purchase_orders(id),
  control_date      timestamptz not null default now(),
  -- Écarts constatés
  amount_diff       numeric(15,2),                 -- montant TTC facture - montant TTC BC
  qty_diff          boolean,                       -- différence de quantité ?
  price_diff        boolean,                       -- différence de prix unitaire ?
  status            text not null default 'pending'
                      check (status in ('pending','ok','warning','blocking')),
  notes             text,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. WORKFLOW DE VALIDATION (Module 1.5)
-- ---------------------------------------------------------------------------
create table workflow_rules (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  entity_type       text not null check (entity_type in
                      ('invoice_supplier','invoice_client','expense_report','payment','purchase_order')),
  min_amount        numeric(15,2) default 0,
  max_amount        numeric(15,2),
  approver_role     text not null,
  approval_order    int not null default 1,        -- si validation hiérarchique
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

create table approval_requests (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  entity_type       text not null,
  entity_id         uuid not null,
  requested_by      text not null,
  approver_role     text not null,
  status            text not null default 'pending'
                      check (status in ('pending','approved','rejected')),
  comment           text,
  decided_at        timestamptz,
  decided_by        text,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. DEVIS CLIENTS (Module 2.1)
-- ---------------------------------------------------------------------------
create table quotes (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  client_id         uuid not null references third_parties(id),
  quote_number      text not null,
  quote_date        date not null default current_date,
  valid_until       date,
  total_ht          numeric(15,2) not null default 0,
  total_ttc         numeric(15,2) not null default 0,
  status            text not null default 'draft'
                      check (status in ('draft','sent','accepted','refused','converted_to_invoice','expired')),
  notes             text,
  converted_to_invoice_id uuid references invoices(id),
  created_by        text,
  created_at        timestamptz not null default now(),
  unique (company_id, quote_number)
);

create table quote_lines (
  id                uuid primary key default gen_random_uuid(),
  quote_id          uuid not null references quotes(id) on delete cascade,
  description       text not null,
  quantity          numeric(10,2) not null default 1,
  unit_price        numeric(15,2) not null,
  tva_rate          numeric(5,2) default 18.00,
  amount_ht         numeric(15,2) generated always as (quantity * unit_price) stored
);

-- ---------------------------------------------------------------------------
-- 6. PAIEMENTS FOURNISSEURS — FICHIER VIREMENT (Module 1.8)
-- ---------------------------------------------------------------------------
create table supplier_payment_batches (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  batch_number      text not null,
  batch_date        date not null default current_date,
  total_amount      numeric(15,2) not null default 0,
  payment_count     int not null default 0,
  format            text not null check (format in ('xml_uemoa','sepa','csv')),
  file_generated    boolean not null default false,
  file_url          text,                          -- lien vers le fichier généré
  status            text not null default 'pending'
                      check (status in ('pending','generated','executed','cancelled')),
  executed_date     date,
  created_by        text,
  created_at        timestamptz not null default now()
);

create table supplier_payment_items (
  id                  uuid primary key default gen_random_uuid(),
  batch_id            uuid not null references supplier_payment_batches(id) on delete cascade,
  payment_id          uuid references payments(id),
  supplier_id         uuid not null references third_parties(id),
  amount              numeric(15,2) not null,
  bank_account_iban   text,                        -- IBAN du fournisseur
  bank_account_bic    text,                        -- BIC/SWIFT
  communication       text,                        -- motif du virement
  status              text not null default 'pending'
                        check (status in ('pending','included','error'))
);

-- ---------------------------------------------------------------------------
-- 7. RELANCES AUTOMATIQUES (Modules 1.7 & 2.4)
-- ---------------------------------------------------------------------------
create table reminder_templates (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  entity_type       text not null check (entity_type in ('supplier','client')),
  trigger_day       int not null,                  -- J+10, J-5, etc.
  subject_template  text not null,
  body_template     text not null,
  method            text not null default 'email' check (method in ('email','letter','both')),
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 8. EXTENSION FACTURES — champs manquants pour le cycle complet
-- ---------------------------------------------------------------------------
alter table invoices add column if not exists legal_number text;
alter table invoices add column if not exists is_cancelled boolean not null default false;
alter table invoices add column if not exists cancelled_by_invoice_id uuid references invoices(id);
alter table invoices add column if not exists purchase_order_id uuid references purchase_orders(id);
alter table invoices add column if not exists approved_at timestamptz;
alter table invoices add column if not exists approved_by text;

-- ---------------------------------------------------------------------------
-- 9. TABLE : NUMÉROTATION LÉGALE AUTOMATIQUE
-- ---------------------------------------------------------------------------
create table legal_numbering (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  fiscal_year       int not null,
  prefix            text not null,                 -- FAC, AVOIR, DEV, BC, etc.
  last_number       int not null default 0,
  unique (company_id, fiscal_year, prefix)
);

-- Fonction pour générer le prochain numéro
create or replace function next_legal_number(
  p_company_id uuid,
  p_fiscal_year int,
  p_prefix text
) returns int as $$
declare
  v_next int;
begin
  insert into legal_numbering (company_id, fiscal_year, prefix, last_number)
  values (p_company_id, p_fiscal_year, p_prefix, 1)
  on conflict (company_id, fiscal_year, prefix) do update
    set last_number = legal_numbering.last_number + 1
    returning last_number into v_next;
  return v_next;
end;
$$ language plpgsql;

-- Met à jour la fonction existante pour utiliser la nouvelle table
create or replace function next_invoice_number(p_company_id uuid, p_fiscal_year int)
returns int as $$
  select coalesce(last_number, 0) + 1
  from legal_numbering
  where company_id = p_company_id
    and fiscal_year = p_fiscal_year
    and prefix = 'FAC';
$$ language sql;

-- ---------------------------------------------------------------------------
-- INDEX
-- ---------------------------------------------------------------------------
create index idx_po_supplier on purchase_orders(supplier_id);
create index idx_po_status on purchase_orders(status);
create index idx_quote_client on quotes(client_id);
create index idx_quote_status on quotes(status);
create index idx_approval_entity on approval_requests(entity_type, entity_id);
create index idx_imported_emails_processed on imported_emails(processed);
create index idx_invoice_controls_invoice on invoice_controls(invoice_id);