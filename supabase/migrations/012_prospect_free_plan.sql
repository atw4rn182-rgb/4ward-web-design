-- Free-plan limits for prospective clients.
-- Run after 011. Not applied to production until explicitly approved.
-- One dashboard request returns a page, counts, settings, and recent usage.
-- Writes are single transactions. No file bucket, live subscription, or scheduled loop.
-- Does not change customers, payments, consultations, quotes, or auth.

create extension if not exists pg_trgm;

alter table public.prospects
  drop constraint if exists prospects_notes_len,
  add constraint prospects_notes_len check (notes is null or char_length(notes) <= 2000),
  drop constraint if exists prospects_research_notes_len,
  add constraint prospects_research_notes_len check (research_notes is null or char_length(research_notes) <= 1000),
  drop constraint if exists prospects_research_sources_len,
  add constraint prospects_research_sources_len check (research_sources is null or char_length(research_sources) <= 800),
  drop constraint if exists prospects_opportunities_len,
  add constraint prospects_opportunities_len check (website_opportunities is null or char_length(website_opportunities) <= 1000),
  drop constraint if exists prospects_gbp_len,
  add constraint prospects_gbp_len check (gbp_observations is null or char_length(gbp_observations) <= 1000);

alter table public.prospect_activity
  drop constraint if exists prospect_activity_note_len,
  add constraint prospect_activity_note_len check (note is null or char_length(note) <= 500);

alter table public.outreach_settings
  add column if not exists scheduler_live boolean not null default false,
  add column if not exists max_retries smallint not null default 2,
  add column if not exists request_timeout_seconds smallint not null default 8,
  add column if not exists consecutive_failures smallint not null default 0,
  add column if not exists run_lock_until timestamptz,
  add column if not exists last_cleanup_at timestamptz;

alter table public.outreach_settings
  drop constraint if exists outreach_settings_scheduler_off,
  add constraint outreach_settings_scheduler_off check (scheduler_live = false),
  drop constraint if exists outreach_settings_retries_len,
  add constraint outreach_settings_retries_len check (max_retries between 0 and 3),
  drop constraint if exists outreach_settings_timeout_len,
  add constraint outreach_settings_timeout_len check (request_timeout_seconds between 3 and 15),
  drop constraint if exists outreach_settings_failures_len,
  add constraint outreach_settings_failures_len check (consecutive_failures >= 0);

create table if not exists public.outreach_usage_daily (
  day date primary key,
  writes integer not null default 0,
  prospects_added integer not null default 0,
  status_changes integer not null default 0,
  research_saves integer not null default 0,
  settings_saves integer not null default 0,
  cleanups integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists prospects_list_idx
  on public.prospects (status, manual_priority desc, last_activity_at desc);

create index if not exists prospects_recent_idx
  on public.prospects (manual_priority desc, last_activity_at desc);

create index if not exists prospects_name_trgm
  on public.prospects using gin (business_name gin_trgm_ops);

create index if not exists prospects_city_trgm
  on public.prospects using gin (city gin_trgm_ops);

create index if not exists prospects_email_trgm
  on public.prospects using gin (public_email gin_trgm_ops);

create index if not exists prospect_activity_created_idx
  on public.prospect_activity (created_at);

alter table public.outreach_usage_daily enable row level security;

drop policy if exists outreach_usage_daily_admin_all on public.outreach_usage_daily;
create policy outreach_usage_daily_admin_all
  on public.outreach_usage_daily for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.touch_outreach_usage(p_kind text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.outreach_usage_daily as usage (
    day, writes, prospects_added, status_changes, research_saves, settings_saves, cleanups
  )
  values (
    current_date,
    1,
    case when p_kind = 'add' then 1 else 0 end,
    case when p_kind = 'status' then 1 else 0 end,
    case when p_kind = 'research' then 1 else 0 end,
    case when p_kind = 'settings' then 1 else 0 end,
    case when p_kind = 'cleanup' then 1 else 0 end
  )
  on conflict (day) do update set
    writes = usage.writes + 1,
    prospects_added = usage.prospects_added + excluded.prospects_added,
    status_changes = usage.status_changes + excluded.status_changes,
    research_saves = usage.research_saves + excluded.research_saves,
    settings_saves = usage.settings_saves + excluded.settings_saves,
    cleanups = usage.cleanups + excluded.cleanups,
    updated_at = now();
end;
$$;

create or replace function public.prospect_dashboard(
  p_q text default '',
  p_status text default 'all',
  p_limit integer default 25,
  p_offset integer default 0
) returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 25);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 10000);
  v_q text := left(replace(replace(btrim(coalesce(p_q, '')), '%', ''), '_', ''), 80);
  v_status text := coalesce(nullif(p_status, ''), 'all');
  v_rows jsonb;
  v_total integer;
  v_counts jsonb;
  v_settings jsonb;
  v_usage jsonb;
begin
  select count(*)
  into v_total
  from public.prospects
  where (v_status = 'all' or status = v_status)
    and (
      v_q = ''
      or business_name ilike '%' || v_q || '%'
      or coalesce(city, '') ilike '%' || v_q || '%'
      or coalesce(public_email, '') ilike '%' || v_q || '%'
      or coalesce(website_host, '') ilike '%' || v_q || '%'
      or coalesce(notes, '') ilike '%' || v_q || '%'
    );

  select coalesce(
    jsonb_agg(to_jsonb(page_rows) order by page_rows.manual_priority desc, page_rows.last_activity_at desc),
    '[]'::jsonb
  )
  into v_rows
  from (
    select
      id, business_name, city, service_area, public_email, website_host,
      status, last_activity_at, left(notes, 140) as notes, manual_priority
    from public.prospects
    where (v_status = 'all' or status = v_status)
      and (
        v_q = ''
        or business_name ilike '%' || v_q || '%'
        or coalesce(city, '') ilike '%' || v_q || '%'
        or coalesce(public_email, '') ilike '%' || v_q || '%'
        or coalesce(website_host, '') ilike '%' || v_q || '%'
        or coalesce(notes, '') ilike '%' || v_q || '%'
      )
    order by manual_priority desc, last_activity_at desc
    limit v_limit offset v_offset
  ) page_rows;

  select jsonb_build_object(
    'total', count(*),
    'awaitingResearch', count(*) filter (where status in ('queued', 'researching')),
    'ready', count(*) filter (where status = 'ready'),
    'emailsSent', count(*) filter (
      where status not in ('bounced', 'failed')
        and (sent_at is not null or status in ('sent', 'interested'))
    ),
    'interested', count(*) filter (where status = 'interested'),
    'optedOut', count(*) filter (where status in ('not_interested', 'do_not_contact')),
    'failed', count(*) filter (where status in ('failed', 'bounced'))
  )
  into v_counts
  from public.prospects;

  select to_jsonb(settings_row)
  into v_settings
  from (
    select
      automation_enabled, weekday_target, timezone, send_hour, send_minute, weekdays,
      manual_priority, mailing_address, last_run_at, last_run_summary, last_cleanup_at,
      consecutive_failures, max_retries, request_timeout_seconds, scheduler_live, run_lock_until
    from public.outreach_settings
    where id = 1
  ) settings_row;

  select coalesce(jsonb_agg(to_jsonb(usage_row) order by usage_row.day desc), '[]'::jsonb)
  into v_usage
  from (
    select day, writes, prospects_added, status_changes, research_saves, settings_saves, cleanups
    from public.outreach_usage_daily
    where day >= current_date - 6
    order by day desc
  ) usage_row;

  return jsonb_build_object(
    'rows', coalesce(v_rows, '[]'::jsonb),
    'total', coalesce(v_total, 0),
    'counts', coalesce(v_counts, '{}'::jsonb),
    'settings', v_settings,
    'usage', coalesce(v_usage, '[]'::jsonb),
    'limit', v_limit,
    'offset', v_offset,
    'requests', 1
  );
end;
$$;

create or replace function public.prospect_detail(p_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_prospect jsonb;
  v_activity jsonb;
begin
  select to_jsonb(row) into v_prospect
  from (
    select
      id, business_name, city, service_area, industry, website_url, website_host,
      public_email, secondary_email, research_notes, research_sources,
      website_opportunities, gbp_observations, researched_at, research_confidence,
      outreach_eligible, status, source, manual_priority, notes, last_activity_at,
      unsubscribe_token
    from public.prospects
    where id = p_id
  ) row;

  select coalesce(jsonb_agg(to_jsonb(event) order by event.created_at desc), '[]'::jsonb)
  into v_activity
  from (
    select id, event_type, from_status, to_status, note, created_at
    from public.prospect_activity
    where prospect_id = p_id
    order by created_at desc
    limit 20
  ) event;

  return jsonb_build_object(
    'prospect', v_prospect,
    'activity', coalesce(v_activity, '[]'::jsonb),
    'requests', 1
  );
end;
$$;

create or replace function public.admin_add_prospect(
  p_business_name text,
  p_city text,
  p_website_url text,
  p_website_host text,
  p_email text,
  p_notes text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_business_name, ''));
  v_city text := nullif(btrim(coalesce(p_city, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_host text := nullif(btrim(coalesce(p_website_host, '')), '');
begin
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_notes is not null and char_length(p_notes) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  if exists (
    select 1 from public.prospect_suppressions
    where (v_email is not null and lower(btrim(email)) = v_email)
       or (v_host is not null and website_host = v_host)
       or (
         lower(btrim(business_name)) = lower(v_name)
         and lower(btrim(coalesce(city, ''))) = lower(btrim(coalesce(v_city, '')))
       )
    limit 1
  ) then
    return jsonb_build_object('ok', false, 'error', 'suppressed');
  end if;

  begin
    insert into public.prospects (
      business_name, city, website_url, website_host, public_email, notes,
      status, source, manual_priority, outreach_eligible, last_activity_at, queued_at
    )
    values (
      v_name, v_city, nullif(btrim(coalesce(p_website_url, '')), ''), v_host, v_email,
      nullif(btrim(coalesce(p_notes, '')), ''),
      'queued', 'manual', true, false, now(), now()
    )
    returning id into v_id;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'error', 'duplicate');
  end;

  insert into public.prospect_activity (prospect_id, event_type, to_status, note)
  values (
    v_id, 'queued', 'queued',
    'Added manually. Priority is set for the next scheduled batch. No email was sent.'
  );
  perform public.touch_outreach_usage('add');
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.admin_update_prospect_status(
  p_id uuid,
  p_status text,
  p_eligible boolean,
  p_note text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current public.prospects%rowtype;
  v_note text := left(btrim(coalesce(p_note, '')), 500);
  v_eligible boolean := coalesce(p_eligible, false);
begin
  if p_status not in (
    'queued', 'researching', 'ready', 'sent', 'interested',
    'not_interested', 'bounced', 'failed', 'do_not_contact'
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into v_current from public.prospects where id = p_id;
  if v_current.id is null then
    return jsonb_build_object('ok', false, 'error', 'missing');
  end if;

  if p_status in ('not_interested', 'do_not_contact') then
    v_eligible := false;
  elsif p_status = 'ready' and not v_eligible then
    return jsonb_build_object('ok', false, 'error', 'not_eligible');
  end if;

  update public.prospects
  set
    status = p_status,
    outreach_eligible = v_eligible,
    last_activity_at = now(),
    queued_at = case when p_status = 'queued' then now() else queued_at end,
    ready_at = case when p_status = 'ready' then now() else ready_at end,
    sent_at = case when p_status = 'sent' then now() else sent_at end,
    interested_at = case when p_status = 'interested' then now() else interested_at end,
    opted_out_at = case when p_status = 'not_interested' then now() else opted_out_at end,
    bounced_at = case when p_status = 'bounced' then now() else bounced_at end,
    failed_at = case when p_status = 'failed' then now() else failed_at end,
    do_not_contact_at = case when p_status = 'do_not_contact' then now() else do_not_contact_at end
  where id = p_id;

  insert into public.prospect_activity (prospect_id, event_type, from_status, to_status, note)
  values (
    p_id, 'status', v_current.status, p_status,
    coalesce(nullif(v_note, ''), 'Status updated. No email was sent.')
  );

  if p_status in ('not_interested', 'do_not_contact') and not exists (
    select 1 from public.prospect_suppressions
    where (v_current.public_email is not null and lower(btrim(email)) = lower(btrim(v_current.public_email)))
       or (v_current.website_host is not null and website_host = v_current.website_host)
       or (
         lower(btrim(business_name)) = lower(btrim(v_current.business_name))
         and lower(btrim(coalesce(city, ''))) = lower(btrim(coalesce(v_current.city, '')))
       )
    limit 1
  ) then
    insert into public.prospect_suppressions (
      prospect_id, business_name, city, email, website_host, reason
    )
    values (
      p_id, v_current.business_name, v_current.city, v_current.public_email,
      v_current.website_host, p_status
    );
  end if;

  perform public.touch_outreach_usage('status');
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_update_prospect_research(
  p_id uuid,
  p_business_name text,
  p_city text,
  p_service_area text,
  p_industry text,
  p_website_url text,
  p_website_host text,
  p_public_email text,
  p_secondary_email text,
  p_research_notes text,
  p_research_sources text,
  p_website_opportunities text,
  p_gbp_observations text,
  p_researched_at timestamptz,
  p_research_confidence text,
  p_outreach_eligible boolean,
  p_notes text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (select 1 from public.prospects where id = p_id) then
    return jsonb_build_object('ok', false, 'error', 'missing');
  end if;
  if p_research_confidence is not null and p_research_confidence not in ('low', 'medium', 'high') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  update public.prospects
  set
    business_name = btrim(p_business_name),
    city = nullif(btrim(coalesce(p_city, '')), ''),
    service_area = nullif(left(btrim(coalesce(p_service_area, '')), 160), ''),
    industry = nullif(left(btrim(coalesce(p_industry, '')), 120), ''),
    website_url = nullif(btrim(coalesce(p_website_url, '')), ''),
    website_host = nullif(btrim(coalesce(p_website_host, '')), ''),
    public_email = nullif(lower(btrim(coalesce(p_public_email, ''))), ''),
    secondary_email = nullif(lower(btrim(coalesce(p_secondary_email, ''))), ''),
    research_notes = nullif(left(btrim(coalesce(p_research_notes, '')), 1000), ''),
    research_sources = nullif(left(btrim(coalesce(p_research_sources, '')), 800), ''),
    website_opportunities = nullif(left(btrim(coalesce(p_website_opportunities, '')), 1000), ''),
    gbp_observations = nullif(left(btrim(coalesce(p_gbp_observations, '')), 1000), ''),
    researched_at = p_researched_at,
    research_confidence = p_research_confidence,
    outreach_eligible = coalesce(p_outreach_eligible, false),
    notes = nullif(left(btrim(coalesce(p_notes, '')), 2000), ''),
    last_activity_at = now()
  where id = p_id;

  insert into public.prospect_activity (prospect_id, event_type, note)
  values (p_id, 'research', 'Research summary saved. No email was sent.');
  perform public.touch_outreach_usage('research');
  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'duplicate');
end;
$$;

create or replace function public.admin_save_outreach_settings(
  p_enabled boolean,
  p_manual_priority boolean,
  p_mailing_address text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_mailing_address is not null and char_length(p_mailing_address) > 300 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  update public.outreach_settings
  set
    automation_enabled = coalesce(p_enabled, false),
    manual_priority = coalesce(p_manual_priority, true),
    mailing_address = nullif(btrim(coalesce(p_mailing_address, '')), ''),
    scheduler_live = false
  where id = 1;

  perform public.touch_outreach_usage('settings');
  return jsonb_build_object('ok', true, 'schedulerLive', false);
end;
$$;

create or replace function public.cleanup_prospect_operations()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_activity integer := 0;
  v_usage integer := 0;
begin
  delete from public.prospect_activity
  where created_at < now() - interval '180 days'
    and coalesce(to_status, '') not in ('not_interested', 'do_not_contact');
  get diagnostics v_activity = row_count;

  delete from public.outreach_usage_daily
  where day < current_date - 90;
  get diagnostics v_usage = row_count;

  update public.outreach_settings
  set last_cleanup_at = now()
  where id = 1;

  perform public.touch_outreach_usage('cleanup');
  return jsonb_build_object(
    'ok', true,
    'activityDeleted', v_activity,
    'usageDeleted', v_usage
  );
end;
$$;

create or replace function public.claim_outreach_run()
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_claimed boolean := false;
begin
  if not exists (
    select 1
    from public.outreach_settings
    where id = 1
      and scheduler_live
      and automation_enabled
  ) then
    return false;
  end if;

  update public.outreach_settings
  set run_lock_until = now() + interval '15 minutes'
  where id = 1
    and scheduler_live
    and automation_enabled
    and (run_lock_until is null or run_lock_until < now())
    and consecutive_failures < max_retries
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.touch_outreach_usage(text) from public, anon;
revoke all on function public.prospect_dashboard(text, text, integer, integer) from public, anon;
revoke all on function public.prospect_detail(uuid) from public, anon;
revoke all on function public.admin_add_prospect(text, text, text, text, text, text) from public, anon;
revoke all on function public.admin_update_prospect_status(uuid, text, boolean, text) from public, anon;
revoke all on function public.admin_update_prospect_research(uuid, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, text, boolean, text) from public, anon;
revoke all on function public.admin_save_outreach_settings(boolean, boolean, text) from public, anon;
revoke all on function public.cleanup_prospect_operations() from public, anon;
revoke all on function public.claim_outreach_run() from public, anon;

grant execute on function public.touch_outreach_usage(text) to authenticated;
grant execute on function public.prospect_dashboard(text, text, integer, integer) to authenticated;
grant execute on function public.prospect_detail(uuid) to authenticated;
grant execute on function public.admin_add_prospect(text, text, text, text, text, text) to authenticated;
grant execute on function public.admin_update_prospect_status(uuid, text, boolean, text) to authenticated;
grant execute on function public.admin_update_prospect_research(uuid, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, text, boolean, text) to authenticated;
grant execute on function public.admin_save_outreach_settings(boolean, boolean, text) to authenticated;
grant execute on function public.cleanup_prospect_operations() to authenticated;
grant execute on function public.claim_outreach_run() to authenticated;
