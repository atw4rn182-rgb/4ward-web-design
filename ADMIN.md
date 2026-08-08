# 4Ward Admin — Supabase setup

## 1. Create / open the Supabase project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Open your project (or **New project**)

## 2. Environment variables for Vercel

In Vercel: **Project → Settings → Environment Variables**  
Add all three for **Production** (and Preview if you use previews).  
After saving, **Redeploy** Production (Deployments → … → Redeploy).

| Vercel variable | Where to copy it in Supabase |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Project Settings → API → Project URL** (looks like `https://xxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Project Settings → API → Project API keys → `anon` `public`** |
| `SUPABASE_SERVICE_ROLE_KEY` | **Project Settings → API → Project API keys → `service_role` `secret`** (never expose in browser code) |

Path in the dashboard: gear icon **Project Settings** (left sidebar bottom) → **API**.

## 3. Run the admin schema

1. Supabase → **SQL Editor** → **New query**
2. Paste the full contents of `supabase/migrations/001_admin_schema.sql`
3. Click **Run**

## 4. Lock down signups (recommended)

1. **Authentication → Providers → Email** — keep Email enabled
2. **Authentication → Providers → Email** — turn **off** “Confirm email” only if you want instant login for the admin you create in the dashboard (optional)
3. **Authentication → Sign In / Providers** — disable any providers you are not using
4. Prefer creating users only in the dashboard (do not leave public signup open on a marketing site)

In newer dashboards: **Authentication → Sign Up / Providers** — disable public sign-ups if the toggle exists, or leave signup unused and only create users manually.

## 5. Create the first admin Auth user

1. **Authentication → Users → Add user → Create new user**
2. Email: `atw.4rn182@gmail.com` (change if you want a different admin email)
3. Password: choose a strong password and save it
4. Check **Auto Confirm User** so you can sign in immediately
5. Create user
6. Open that user and **copy the User UID** (UUID)

## 6. Promote that user into `admin_users`

**SQL Editor → New query**, replace the UUID if needed:

```sql
insert into public.admin_users (user_id, email, full_name)
values (
  'PASTE_USER_UUID_HERE',
  'atw.4rn182@gmail.com',
  'Nereece Rodriguez'
)
on conflict (user_id) do update
set email = excluded.email,
    full_name = excluded.full_name;
```

Only rows in `admin_users` can access `/admin` (app checks this on login and on every dashboard page). Random Auth users who are not in this table are signed out and blocked.

## 7. Verify

1. Open `https://www.4wardwebdesign.com/admin/login`
2. Sign in with the admin email + password → should land on `/admin/dashboard`
3. Sign out
4. In Supabase, create a second throwaway Auth user that is **not** inserted into `admin_users`
5. Try signing in with that user → should see **not authorized** and never reach the dashboard
