alter table public.blog_posts
  add column if not exists seo_title text not null default '',
  add column if not exists meta_description text not null default '',
  add column if not exists canonical_url text,
  add column if not exists og_image_path text,
  add column if not exists noindex boolean not null default false,
  add column if not exists focus_topic text not null default '',
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists answer_summary text not null default '',
  add column if not exists source_links jsonb not null default '[]'::jsonb,
  add column if not exists related_wiki_slugs text[] not null default '{}'::text[];

alter table public.blog_post_revisions
  add column if not exists seo_title text not null default '',
  add column if not exists meta_description text not null default '',
  add column if not exists canonical_url text,
  add column if not exists og_image_path text,
  add column if not exists noindex boolean not null default false,
  add column if not exists focus_topic text not null default '',
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists answer_summary text not null default '',
  add column if not exists source_links jsonb not null default '[]'::jsonb,
  add column if not exists related_wiki_slugs text[] not null default '{}'::text[];

alter table public.blog_posts
  drop constraint if exists blog_posts_source_links_array_check,
  add constraint blog_posts_source_links_array_check
    check (jsonb_typeof(source_links) = 'array');

alter table public.blog_post_revisions
  drop constraint if exists blog_post_revisions_source_links_array_check,
  add constraint blog_post_revisions_source_links_array_check
    check (jsonb_typeof(source_links) = 'array');

create index if not exists blog_posts_tags_idx
  on public.blog_posts using gin (tags)
  where deleted_at is null;

create index if not exists blog_posts_focus_topic_idx
  on public.blog_posts (focus_topic)
  where deleted_at is null and focus_topic <> '';
