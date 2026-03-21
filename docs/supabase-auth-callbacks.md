# Supabase Auth callbacks (password reset, magic link, OAuth)

This file records what was verified with **Supabase MCP** and what you must configure so **`resetPasswordForEmail` → `/auth/callback` → `/auth/update-password`** works end-to-end.

## MCP verification (no dashboard write API in MCP)

| Tool | Result |
|------|--------|
| `get_project` (`id: nhahhggzdlrejdoftbgb`) | Project **crashboard**, ref `nhahhggzdlrejdoftbgb`, active. |
| `execute_sql` | DB reachable; **Auth redirect URLs are not stored in Postgres** — they live in hosted Auth / Management API. |
| `search_docs` | Confirmed: `redirectTo` from `resetPasswordForEmail` must appear in the project **Redirect URLs** allow list; **Site URL** drives default links in emails. |

So MCP **cannot** click the dashboard for you. Use either [URL Configuration](https://supabase.com/dashboard/project/nhahhggzdlrejdoftbgb/auth/url-configuration) or the script below (Management API).

## 1. URL configuration (required)

Open: **[Authentication → URL Configuration](https://supabase.com/dashboard/project/nhahhggzdlrejdoftbgb/auth/url-configuration)**.

Set **Site URL** to your real app base (dev example):

- `http://localhost:3000`

Under **Redirect URLs**, add at least:

| Entry | Why |
|-------|-----|
| `http://localhost:3000/auth/callback` | PKCE exchange for magic link, OAuth, **and password reset** (our `redirectTo` points here with `?next=…`). |
| `http://localhost:3000/**` | Convenient for local deep links and query strings (see [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)). |

For production, add your live origin too, e.g.:

- `https://your-domain.com/auth/callback`
- `https://your-domain.com/**` (optional; prefer exact paths in production when you can)

## 2. Reset password email template (recommended)

Open: **[Authentication → Email templates → Reset password](https://supabase.com/dashboard/project/nhahhggzdlrejdoftbgb/auth/templates)**.

Supabase exposes `{{ .RedirectTo }}` for the URL passed to `resetPasswordForEmail`. If the link in the email ignores your app callback, ensure the button uses **`{{ .ConfirmationURL }}`** (includes verification + redirect) or build a link that preserves the redirect your app passed in.

Official variables: [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates).

## 3. Automated apply (Management API)

If you prefer CLI over the dashboard, use a token with **auth write** (see [Management API](https://supabase.com/docs/reference/api/v1-update-auth-service-config)):

```bash
export SUPABASE_ACCESS_TOKEN="your-personal-access-token"  # Account → Access tokens
./scripts/apply-supabase-auth-urls.sh
```

Optional:

```bash
export SUPABASE_PROJECT_REF="nhahhggzdlrejdoftbgb"   # default in script
export AUTH_SITE_URL="http://localhost:3000"           # default
# Append more comma-separated URLs:
export AUTH_EXTRA_REDIRECT_URLS="https://yourdomain.com/auth/callback,https://yourdomain.com/**"
```

**Note:** The script sets `site_url` and merges into `uri_allow_list`. If you already have many redirect URLs, review the merged list in the dashboard after running.

## Troubleshooting: “no reset email”

If the app shows success but nothing arrives:

1. **Confirm Auth actually sent mail** — Dashboard → **Authentication** → **Logs** (or **Project Settings → Logs**). Look for `POST /recover` **200** and **`mail.send`** with `mail_type: recovery`. If those appear, the problem is **inbox delivery**, not your redirect URL.
2. **Search the mailbox** for `supabase` or `noreply@mail.app.supabase.io`. Gmail often files it under **Promotions** or **Spam**.
3. **Rate limits** — The built-in Supabase mailer has [sending limits](https://supabase.com/docs/guides/platform/going-into-prod#auth-rate-limits). Wait before spamming retries.
4. **Custom SMTP** — For reliable delivery, use **Authentication → SMTP Settings** (e.g. Resend, Postmark, SES) so mail comes from your domain and passes SPF/DKIM.
5. **Wrong email** — The address must match an existing **Authentication → Users** identity exactly (case-insensitive for Gmail, but typos won’t get a mail).
