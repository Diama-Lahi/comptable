-- ============================================================================
-- EXTENSIONS DU SCHÉMA (partie 6) — MODULE 6 : authentification & isolation
-- multi-comptes (SaaS). À exécuter après tous les fichiers précédents.
--
-- Ce que fait ce fichier :
--   1. Table `profiles` qui relie un utilisateur Supabase Auth (auth.users)
--      à UNE entreprise (company). Un compte = une entreprise isolée.
--   2. À l'inscription (auth.users insert), création automatique d'une
--      nouvelle entreprise + profil + plan comptable par défaut.
--   3. Fonction `auth_company_id()` : renvoie le company_id de l'utilisateur
--      connecté (utilisée dans toutes les policies RLS ci-dessous).
--   4. Activation de Row Level Security sur TOUTES les tables métier, avec
--      une policy qui restreint chaque ligne à l'entreprise de l'utilisateur
--      connecté (directement via company_id, ou via la table parente pour
--      les tables enfants qui n'ont pas de company_id propre).
--
-- Après ce script, l'ancienne clé publique + NEXT_PUBLIC_COMPANY_ID ne
-- suffisent plus : il faut être authentifié (auth.uid()) pour lire/écrire
-- quoi que ce soit.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROFILS UTILISATEUR
-- ----------------------------------------------------------------------------
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  company_id   uuid not null references companies(id) on delete cascade,
  email        text not null,
  created_at   timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles
  for all
  using (id = auth.uid())
  with check (id = auth.uid());

-- ----------------------------------------------------------------------------
-- 2. HELPER : company_id de l'utilisateur connecté
-- ----------------------------------------------------------------------------
create or replace function auth_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from profiles where id = auth.uid()
$$;

-- ----------------------------------------------------------------------------
-- 3. AUTO-PROVISIONING : nouvelle entreprise à chaque inscription
-- ----------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
begin
  insert into companies (name, currency, country)
  values (
    coalesce(new.raw_user_meta_data->>'company_name', 'Mon entreprise'),
    'XOF',
    'SN'
  )
  returning id into new_company_id;

  insert into profiles (id, company_id, email)
  values (new.id, new_company_id, new.email);

  perform seed_default_chart_of_accounts(new_company_id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ----------------------------------------------------------------------------
-- 4. RLS — tables avec company_id direct
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'chart_of_accounts', 'third_parties', 'fiscal_periods', 'journals',
    'entries', 'invoices', 'bank_transactions', 'cash_vouchers', 'payments',
    'imputation_rules', 'audit_log', 'fixed_assets', 'employees',
    'stock_valuations', 'period_adjustments', 'cost_centers',
    'expense_reports', 'advances', 'document_archive_policy',
    'invoice_sequences', 'partners', 'customer_deposits',
    'customs_declarations', 'off_balance_commitments', 'cash_bank_accounts',
    'consolidation_group_members', 'user_roles', 'data_processing_registry',
    'reminder_rules', 'products_services', 'recurring_charges', 'contracts',
    'automation_settings', 'stock_variation_closures'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I for all using (company_id = auth_company_id()) with check (company_id = auth_company_id())',
      t
    );
  end loop;
end $$;

-- companies : chaque utilisateur ne voit que sa propre entreprise
alter table companies enable row level security;
drop policy if exists tenant_isolation on companies;
create policy tenant_isolation on companies
  for all
  using (id = auth_company_id())
  with check (id = auth_company_id());

-- ----------------------------------------------------------------------------
-- 5. RLS — tables enfants (isolées via la table parente)
-- ----------------------------------------------------------------------------
alter table entry_lines enable row level security;
drop policy if exists tenant_isolation on entry_lines;
create policy tenant_isolation on entry_lines for all
  using (exists (select 1 from entries e where e.id = entry_lines.entry_id and e.company_id = auth_company_id()))
  with check (exists (select 1 from entries e where e.id = entry_lines.entry_id and e.company_id = auth_company_id()));

alter table invoice_lines enable row level security;
drop policy if exists tenant_isolation on invoice_lines;
create policy tenant_isolation on invoice_lines for all
  using (exists (select 1 from invoices i where i.id = invoice_lines.invoice_id and i.company_id = auth_company_id()))
  with check (exists (select 1 from invoices i where i.id = invoice_lines.invoice_id and i.company_id = auth_company_id()));

alter table reconciliations enable row level security;
drop policy if exists tenant_isolation on reconciliations;
create policy tenant_isolation on reconciliations for all
  using (exists (select 1 from bank_transactions b where b.id = reconciliations.bank_transaction_id and b.company_id = auth_company_id()))
  with check (exists (select 1 from bank_transactions b where b.id = reconciliations.bank_transaction_id and b.company_id = auth_company_id()));

alter table depreciation_schedule enable row level security;
drop policy if exists tenant_isolation on depreciation_schedule;
create policy tenant_isolation on depreciation_schedule for all
  using (exists (select 1 from fixed_assets f where f.id = depreciation_schedule.fixed_asset_id and f.company_id = auth_company_id()))
  with check (exists (select 1 from fixed_assets f where f.id = depreciation_schedule.fixed_asset_id and f.company_id = auth_company_id()));

alter table payslips enable row level security;
drop policy if exists tenant_isolation on payslips;
create policy tenant_isolation on payslips for all
  using (exists (select 1 from employees emp where emp.id = payslips.employee_id and emp.company_id = auth_company_id()))
  with check (exists (select 1 from employees emp where emp.id = payslips.employee_id and emp.company_id = auth_company_id()));

alter table invoice_payment_links enable row level security;
drop policy if exists tenant_isolation on invoice_payment_links;
create policy tenant_isolation on invoice_payment_links for all
  using (exists (select 1 from invoices i where i.id = invoice_payment_links.invoice_id and i.company_id = auth_company_id()))
  with check (exists (select 1 from invoices i where i.id = invoice_payment_links.invoice_id and i.company_id = auth_company_id()));

alter table partner_current_account_movements enable row level security;
drop policy if exists tenant_isolation on partner_current_account_movements;
create policy tenant_isolation on partner_current_account_movements for all
  using (exists (select 1 from partners p where p.id = partner_current_account_movements.partner_id and p.company_id = auth_company_id()))
  with check (exists (select 1 from partners p where p.id = partner_current_account_movements.partner_id and p.company_id = auth_company_id()));

alter table customer_reminders_sent enable row level security;
drop policy if exists tenant_isolation on customer_reminders_sent;
create policy tenant_isolation on customer_reminders_sent for all
  using (exists (select 1 from invoices i where i.id = customer_reminders_sent.invoice_id and i.company_id = auth_company_id()))
  with check (exists (select 1 from invoices i where i.id = customer_reminders_sent.invoice_id and i.company_id = auth_company_id()));

alter table mobile_money_fees enable row level security;
drop policy if exists tenant_isolation on mobile_money_fees;
create policy tenant_isolation on mobile_money_fees for all
  using (exists (select 1 from cash_bank_accounts c where c.id = mobile_money_fees.cash_bank_account_id and c.company_id = auth_company_id()))
  with check (exists (select 1 from cash_bank_accounts c where c.id = mobile_money_fees.cash_bank_account_id and c.company_id = auth_company_id()));

alter table recurring_invoice_log enable row level security;
drop policy if exists tenant_isolation on recurring_invoice_log;
create policy tenant_isolation on recurring_invoice_log for all
  using (exists (select 1 from contracts c where c.id = recurring_invoice_log.contract_id and c.company_id = auth_company_id()))
  with check (exists (select 1 from contracts c where c.id = recurring_invoice_log.contract_id and c.company_id = auth_company_id()));

-- ----------------------------------------------------------------------------
-- 6. RLS — tables partagées / non sensibles (accès à tout utilisateur connecté,
--    pas d'isolation par entreprise : données de référence ou méta peu sensibles)
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array['exchange_rates', 'backup_log', 'consolidation_groups', 'review_resolutions'];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists authenticated_only on %I', t);
    execute format(
      'create policy authenticated_only on %I for all using (auth.uid() is not null) with check (auth.uid() is not null)',
      t
    );
  end loop;
end $$;
