import { createSupabaseServerClient } from '@/utils/supabase/server';
import { Bookmark } from 'lucide-react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { TwitterBookmarkCard } from '@/components/twitter-bookmark-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';


interface Bookmark {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  attachments?: { media_keys: string[] };
  entities?: {
    urls?: { url: string; expanded_url: string; display_url: string }[];
    hashtags?: { text: string }[];
    annotations?: { normalized_text: string }[];
  };
  context_annotations?: { domain: { name: string }; entity: { name: string } }[];
}

interface TwitterUser {
  id: string;
  username: string;
  name: string;
}

interface Media {
  media_key: string;
  type: string;
  url?: string;
  preview_image_url?: string;
}

interface BookmarkResponse {
  data: Bookmark[];
  includes?: {
    users: TwitterUser[];
    media: Media[];
  };
}

interface StoredBookmark {
  id: string;
  user_id: string;
  text: string;
  created_at: string;
  author_username: string;
  author_name: string;
  media_url?: string;
  urls: string[];
  hashtags: string[];
  annotations: string[];
  context_domain: string;
  context_entity: string;
}

export default async function BookmarksPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: tokenData, error: tokenError } = await supabase
    .from('user_tokens')
    .select('twitter_access_token')
    .eq('user_id', user.id)
    .single();

  const accessToken = tokenData?.twitter_access_token;
  if (!accessToken || tokenError) {
    console.log('No token found or error:', tokenError?.message);
    redirect('/api/twitter/auth');
  }

  console.log('Using access token:', accessToken);

  let twitterId: string | null = null;
  let enrichedBookmarks: StoredBookmark[] = [];
  let errorMessage: string | null = null;

  // Check local cache
  const { data: cachedBookmarks, error: cacheError } = await supabase
    .from('twitter_bookmarks')
    .select('*')
    .eq('user_id', user.id);

  if (cachedBookmarks?.length && !cacheError) {
    enrichedBookmarks = cachedBookmarks as StoredBookmark[];
  } else {
    console.log('Fetching Twitter ID...');
    const meResponse = await fetch('https://api.twitter.com/2/users/meEE', {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const meText = await meResponse.text();
    if (!meResponse.ok) {
      if (meResponse.status === 401) {
        await supabase.from('user_tokens').delete().eq('user_id', user.id);
        redirect('/api/twitter/auth');
      }
      errorMessage = `Failed to fetch Twitter ID: ${meResponse.status} - ${meText}`;
      console.error('Twitter ID fetch error:', errorMessage);
    } else {
      const meData = JSON.parse(meText);
      twitterId = meData.data.id;
      console.log('Twitter ID:', twitterId);

      console.log('Fetching bookmarks for Twitter ID:', twitterId);
      const response = await fetch(
        `https://api.twitter.com/2/users/${twitterId}/bookmarks?max_results=100&tweet.fields=author_id,created_at,attachments,entities,context_annotations&expansions=author_id,attachments.media_keys&media.fields=type,url,preview_image_url`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      const responseText = await response.text();
      if (!response.ok) {
        if (response.status === 401) {
          await supabase.from('user_tokens').delete().eq('user_id', user.id);
          redirect('/api/twitter/auth');
        } else if (response.status === 429) {
          errorMessage = 'Rate limit exceeded. Twitter allows 180 bookmark requests per 15 minutes. Please wait and try again later.';
        } else {
          errorMessage = `Failed to fetch bookmarks: ${response.status} - ${responseText}`;
        }
        console.error('Bookmarks fetch error:', errorMessage);
      } else {
        const data: BookmarkResponse = JSON.parse(responseText);
        const bookmarks = data.data || [];
        const users = data.includes?.users || [];
        const media = data.includes?.media || [];

        enrichedBookmarks = bookmarks.map(bookmark => {
          const author = users.find(user => user.id === bookmark.author_id) || { username: 'Unknown', name: 'Unknown' };
          const mediaItem = bookmark.attachments?.media_keys?.[0]
            ? media.find(m => m.media_key === bookmark.attachments?.media_keys?.[0])
            : null;
          const context = bookmark.context_annotations?.[0] || { domain: { name: 'Uncategorized' }, entity: { name: '' } };

          return {
            id: bookmark.id,
            user_id: user.id,
            text: bookmark.text,
            created_at: bookmark.created_at,
            author_username: author.username,
            author_name: author.name,
            media_url: mediaItem?.url || mediaItem?.preview_image_url,
            urls: bookmark.entities?.urls?.map(url => url.expanded_url) || [],
            hashtags: bookmark.entities?.hashtags?.map(h => h.text) || [],
            annotations: bookmark.entities?.annotations?.map(a => a.normalized_text) || [],
            context_domain: context.domain.name,
            context_entity: context.entity.name,
          };
        });

        await supabase.from('twitter_bookmarks').upsert(enrichedBookmarks, { onConflict: 'id' });
      }
    }
  }

  // Analytics Widgets Data
  const totalBookmarks = enrichedBookmarks.length;
  const topHashtags = enrichedBookmarks
    .flatMap(b => b.hashtags)
    .reduce((acc, h) => { acc[h] = (acc[h] || 0) + 1; return acc; }, {} as Record<string, number>);
  const topAnnotations = enrichedBookmarks
    .flatMap(b => b.annotations)
    .reduce((acc, a) => { acc[a] = (acc[a] || 0) + 1; return acc; }, {} as Record<string, number>);
  const domains = enrichedBookmarks.reduce((acc, b) => {
    acc[b.context_domain] = (acc[b.context_domain] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const saveMonths = enrichedBookmarks.reduce((acc, b) => {
    const month = new Date(b.created_at).toLocaleString('default', { month: 'long', year: 'numeric' });
    acc[month] = (acc[month] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-4 flex items-center">
        <Bookmark className="mr-2 h-6 w-6" /> My Twitter Bookmarks
      </h1>

      {/* Analytics Widgets */}
      {totalBookmarks > 0 && !errorMessage && (
        <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader><CardTitle>Total Bookmarks</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-bold">{totalBookmarks}</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Top Hashtag</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xl">
                #{Object.entries(topHashtags).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None'} ({Math.max(...Object.values(topHashtags) || [0])})
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Top Theme</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xl">
                {Object.entries(domains).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None'} ({Math.max(...Object.values(domains))})
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Top Month</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xl">
                {Object.entries(saveMonths).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None'} ({Math.max(...Object.values(saveMonths))})
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bookmarks Display */}
      {errorMessage ? (
        <div className="text-red-500">
          <p>{errorMessage}</p>
          {errorMessage.includes('Rate limit exceeded') ? (
            <p className="mt-2">Try again in 15 minutes or check your Twitter API plan.</p>
          ) : (
            <Link href="/api/twitter/auth" className="mt-2 inline-block text-blue-500 underline">
              Re-authenticate with Twitter
            </Link>
          )}
        </div>
      ) : enrichedBookmarks.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 mt-4">No bookmarks found.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          {enrichedBookmarks.map(bookmark => (
            <TwitterBookmarkCard
              key={bookmark.id}
              id={bookmark.id}
              user_id={bookmark.user_id}
              text={bookmark.text}
              created_at={bookmark.created_at}
              author_username={bookmark.author_username}
              author_name={bookmark.author_name}
              media_url={bookmark.media_url}
              urls={bookmark.urls}
              hashtags={bookmark.hashtags}
              annotations={bookmark.annotations}
              context_domain={bookmark.context_domain}
              context_entity={bookmark.context_entity}
            />
          ))}
        </div>
      )}
    </div>
  );
}