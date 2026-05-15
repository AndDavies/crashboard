create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled post' check (btrim(title) <> ''),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  excerpt text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published', 'scheduled', 'archived')),
  content_json jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  content_html text not null default '',
  cover_image_path text,
  published_at timestamptz,
  scheduled_at timestamptz,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'scheduled' and scheduled_at is not null)
    or status <> 'scheduled'
  )
);

create unique index if not exists blog_posts_active_slug_key
  on public.blog_posts (lower(slug))
  where deleted_at is null;

create index if not exists blog_posts_public_listing_idx
  on public.blog_posts (coalesce(published_at, scheduled_at) desc)
  where status in ('published', 'scheduled') and deleted_at is null;

create index if not exists blog_posts_status_updated_idx
  on public.blog_posts (status, updated_at desc)
  where deleted_at is null;

create table if not exists public.blog_post_revisions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  title text not null,
  slug text not null,
  excerpt text not null default '',
  status text not null check (status in ('draft', 'published', 'scheduled', 'archived')),
  content_json jsonb not null,
  content_html text not null default '',
  cover_image_path text,
  published_at timestamptz,
  scheduled_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists blog_post_revisions_post_created_idx
  on public.blog_post_revisions (post_id, created_at desc);

create or replace function public.set_blog_post_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_blog_post_updated_at on public.blog_posts;
create trigger set_blog_post_updated_at
before update on public.blog_posts
for each row execute function public.set_blog_post_updated_at();

alter table public.blog_posts enable row level security;
alter table public.blog_post_revisions enable row level security;

grant select on public.blog_posts to anon;
grant select, insert, update, delete on public.blog_posts to authenticated;
grant select, insert on public.blog_post_revisions to authenticated;
grant all on public.blog_posts to service_role;
grant all on public.blog_post_revisions to service_role;

drop policy if exists "Published blog posts are publicly readable" on public.blog_posts;
create policy "Published blog posts are publicly readable"
on public.blog_posts
for select
to anon, authenticated
using (
  status in ('published', 'scheduled')
  and deleted_at is null
  and coalesce(published_at, scheduled_at) is not null
  and coalesce(published_at, scheduled_at) <= now()
);

drop policy if exists "Authenticated users can view blog posts" on public.blog_posts;
create policy "Authenticated users can view blog posts"
on public.blog_posts
for select
to authenticated
using ((select auth.uid()) is not null);

drop policy if exists "Authenticated users can insert blog posts" on public.blog_posts;
create policy "Authenticated users can insert blog posts"
on public.blog_posts
for insert
to authenticated
with check ((select auth.uid()) is not null);

drop policy if exists "Authenticated users can update blog posts" on public.blog_posts;
create policy "Authenticated users can update blog posts"
on public.blog_posts
for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

drop policy if exists "Authenticated users can delete blog posts" on public.blog_posts;
create policy "Authenticated users can delete blog posts"
on public.blog_posts
for delete
to authenticated
using ((select auth.uid()) is not null);

drop policy if exists "Authenticated users can view blog revisions" on public.blog_post_revisions;
create policy "Authenticated users can view blog revisions"
on public.blog_post_revisions
for select
to authenticated
using ((select auth.uid()) is not null);

drop policy if exists "Authenticated users can insert blog revisions" on public.blog_post_revisions;
create policy "Authenticated users can insert blog revisions"
on public.blog_post_revisions
for insert
to authenticated
with check ((select auth.uid()) is not null);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'blog-media',
  'blog-media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read blog media" on storage.objects;
create policy "Public can read blog media"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'blog-media');

drop policy if exists "Authenticated users can upload blog media" on storage.objects;
create policy "Authenticated users can upload blog media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'blog-media'
  and (select auth.uid()) is not null
);

drop policy if exists "Authenticated users can update blog media" on storage.objects;
create policy "Authenticated users can update blog media"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'blog-media'
  and (select auth.uid()) is not null
)
with check (
  bucket_id = 'blog-media'
  and (select auth.uid()) is not null
);

drop policy if exists "Authenticated users can delete blog media" on storage.objects;
create policy "Authenticated users can delete blog media"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'blog-media'
  and (select auth.uid()) is not null
);
