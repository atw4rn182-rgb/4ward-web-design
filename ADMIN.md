# 4Ward Admin (Supabase)

## What was added

- Protected Next.js admin at `/admin/*`
- Email/password login at `/admin/login`
- After login, users land on `/admin/dashboard`
- Tailwind sidebar with: Dashboard, Clients, Projects, Payments, Files, Messages, Analytics, Settings
- SQL schema for customers, onboarding, files, projects, payments, notes

## Setup

1. Create a Supabase project.
2. Copy `.env.example` values into `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only; keep secret)
3. In Supabase SQL Editor, run:
   - `supabase/migrations/001_admin_schema.sql`
4. Authentication → Users → create an admin user (email + password).
5. Promote that user:

```sql
insert into public.admin_users (user_id, email, full_name)
values ('PASTE_AUTH_USER_UUID', 'you@example.com', 'Your Name');
```

6. Install and run:

```bash
npm install
npm run dev
```

7. Open `http://localhost:3000/admin/login`.

## Notes

- Marketing pages remain static under `public/` (`/`, `/onboarding.html`).
- Existing Stripe API stays in `/api/create-checkout-session.js`.
- Dashboard section pages currently show clean placeholder data for UI.
- RLS allows only rows in `admin_users` to read/write admin tables.
