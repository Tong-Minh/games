-- Local development seed. Runs after migrations on `supabase db reset`.

-- One paid feature, so access gating can be tried locally by setting
-- app_settings.monetization_enabled to true. Invisible while monetization is off.
insert into public.products (sku, price_cents, is_paid, lobby_access)
values ('feature:liars-dice:wild-ones', 199, true, 'host')
on conflict (sku) do nothing;
