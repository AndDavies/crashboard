# Crashboard

Personal site built with [Next.js](https://nextjs.org) (App Router) and [Supabase](https://supabase.com) Auth: public sections for **content**, **blog**, **articles**, and **links**, plus a private **`/dashboard`** when signed in.

## Setup

1. Copy env: `cp .env.example .env.local` and add your [Supabase project URL and anon key](https://supabase.com/dashboard/project/_/settings/api).

2. In Supabase → **Authentication** → [**URL configuration**](https://supabase.com/dashboard/project/nhahhggzdlrejdoftbgb/auth/url-configuration), set:
   - **Site URL** — `http://localhost:3000` while developing (and your production URL when you deploy).
   - **Redirect URLs** — include `http://localhost:3000/auth/callback` (and your production `/auth/callback` URL). This app uses the PKCE flow via `/auth/callback`. Password reset emails use the same callback with `?next=/auth/update-password`.
   - **Password reset** — Flow: `/auth/forgot-password` → email link → `/auth/callback` → `/auth/update-password`. Optional: customize the reset email under **Authentication** → **Email templates** → **Reset password**.
   - **Automate URL allow list** — See [`docs/supabase-auth-callbacks.md`](docs/supabase-auth-callbacks.md) (includes Supabase MCP notes) and run `scripts/apply-supabase-auth-urls.sh` with `SUPABASE_ACCESS_TOKEN` if you prefer the Management API over the dashboard.
   - Optional wildcard for previews: `http://localhost:3000/**`

3. Under **Authentication** → **Providers** → **Email**, keep the provider **enabled**. For **password** sign-in, ensure users are created with a password (e.g. **Authentication** → **Users** → **Add user** → set password, or enable **Sign ups** if you want self-serve registration). Magic links remain optional on the login page.
4. **Session length** — In **Authentication** → **Settings**, review **JWT expiry** and **refresh token reuse**. Cookies are set for up to one year on the browser, but the project’s refresh-token policy still controls when Supabase invalidates a session.

5. Install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Auth callback route: `/auth/callback`.

## Project layout

This repo uses the **Next.js App Router only** (`src/app`). There is no `pages/` directory. Route groups like `(public)` organize files without changing URLs.

| File | URL |
| --- | --- |
| `src/app/layout.tsx` | Root layout (fonts, metadata) |
| `src/app/(public)/page.tsx` | `/` |
| `src/app/(public)/login/page.tsx` | `/login` |
| `src/app/dashboard/page.tsx` | `/dashboard` |
| `src/app/auth/callback/route.ts` | `/auth/callback` (GET; PKCE exchange) |
| `src/app/(public)/auth/forgot-password/page.tsx` | `/auth/forgot-password` |
| `src/app/(public)/auth/update-password/page.tsx` | `/auth/update-password` |
| `src/middleware.ts` | Session refresh + `/dashboard` guard |

| Route | Purpose |
| --- | --- |
| `/` | Home |
| `/about`, `/work`, `/contact` | Marketing pages |
| `/content`, `/blog`, `/articles`, `/links` | Public sections (placeholders) |
| `/login` | Email + password or magic link |
| `/auth/forgot-password` | Request password reset email |
| `/auth/update-password` | Set new password after email link |
| `/dashboard` | Protected; requires session |

Middleware refreshes the Supabase session and redirects unauthenticated users away from `/dashboard`.

## Push to GitHub

The repo is ready on branch `main` with `.env.local` **ignored** (never commit secrets).

1. Install the [GitHub CLI](https://cli.github.com/) if needed: `brew install gh`

2. Sign in (browser or token):

```bash
gh auth login
```

3. Create the remote repository from this folder and push:

```bash
gh repo create crashboard --source=. --public --remote=origin --push
```

(Run this from the project root.)

Use `--private` instead of `--public` for a private repo. If the name `crashboard` is taken, pick another: `gh repo create my-crashboard --source=. --public --remote=origin --push`.

**Without `gh`:** create an empty repo on GitHub, then:

```bash
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

## Supabase MCP (Cursor)

Use the [hosted Supabase MCP server](https://supabase.com/docs/guides/getting-started/mcp) so the agent can query docs, inspect schema, and run **read-only** SQL against your project.

1. **Config** — This repo includes [`.cursor/mcp.json`](.cursor/mcp.json). Cursor also merges your global config at `~/.cursor/mcp.json`. Prefer **one** `supabase` entry (project file overrides global when both define it).

2. **URL** — Default in `mcp.json` is `https://mcp.supabase.com/mcp?read_only=true` (recommended). To limit access to a single project, append `&project_ref=<your-project-id>` (from **Project Settings → General**), or open the [**Connect → MCP**](https://supabase.com/dashboard/project/_?showConnect=true&connectTab=mcp) tab in the dashboard and paste the generated URL into `mcp.json`.

3. **Auth** — After saving, **restart Cursor**. When the MCP connects, complete **Supabase OAuth** in the browser if prompted (no personal access token required for the hosted server).

4. **Optional env interpolation** — You can put `&project_ref=${env:SUPABASE_PROJECT_REF}` in the URL if that variable is set in the environment **before** Cursor starts (see [Cursor MCP interpolation](https://cursor.com/docs/context/mcp)).

5. **Revoke old tokens** — If you previously used a Supabase **personal access token** in `mcp.json`, rotate or revoke it under [Account → Access Tokens](https://supabase.com/dashboard/account/tokens); the hosted MCP should use OAuth instead.

If the server fails to start, check **Output → MCP Logs** in Cursor.
