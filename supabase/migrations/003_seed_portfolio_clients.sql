-- Portfolio clients used on the marketing site (no Stripe subscription).
-- Safe to re-run.

insert into public.customers (company_name, contact_name, email, website_url, city, state, status)
select 'Accu-Fab NM', 'Accu-Fab NM', 'info@accufabnm.com', 'https://accufabnm.com', 'Milan', 'NM', 'active'
where not exists (
  select 1 from public.customers where company_name = 'Accu-Fab NM'
);

insert into public.customers (company_name, contact_name, email, website_url, city, state, status)
select 'Black Mesa Welding', 'Black Mesa Welding', 'info@blackmesawelding.com', 'https://blackmesawelding.com', 'Carlsbad', 'NM', 'active'
where not exists (
  select 1 from public.customers where company_name = 'Black Mesa Welding'
);

update public.customers
set status = 'active',
    website_url = coalesce(nullif(website_url, ''), 'https://accufabnm.com'),
    updated_at = now()
where company_name = 'Accu-Fab NM';

update public.customers
set status = 'active',
    website_url = coalesce(nullif(website_url, ''), 'https://blackmesawelding.com'),
    updated_at = now()
where company_name = 'Black Mesa Welding';

insert into public.website_projects (customer_id, name, tier, status, live_url, launched_at)
select c.id, 'Accu-Fab NM Website', 'custom', 'live', 'https://accufabnm.com', current_date
from public.customers c
where c.company_name = 'Accu-Fab NM'
  and not exists (
    select 1 from public.website_projects p where p.customer_id = c.id
  );

insert into public.website_projects (customer_id, name, tier, status, live_url, launched_at)
select c.id, 'Black Mesa Welding Website', 'custom', 'live', 'https://blackmesawelding.com', current_date
from public.customers c
where c.company_name = 'Black Mesa Welding'
  and not exists (
    select 1 from public.website_projects p where p.customer_id = c.id
  );

update public.website_projects p
set status = 'live',
    live_url = 'https://accufabnm.com',
    name = 'Accu-Fab NM Website',
    updated_at = now()
from public.customers c
where p.customer_id = c.id
  and c.company_name = 'Accu-Fab NM';

update public.website_projects p
set status = 'live',
    live_url = 'https://blackmesawelding.com',
    name = 'Black Mesa Welding Website',
    updated_at = now()
from public.customers c
where p.customer_id = c.id
  and c.company_name = 'Black Mesa Welding';
