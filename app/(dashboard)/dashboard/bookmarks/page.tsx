"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Bookmark } from 'lucide-react';

interface Bookmark {
  id: string;
  text: string;
  created_at: string;
  author: { username: string };
  entities?: { hashtags?: { text: string }[] };
}

export default function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [filteredBookmarks, setFilteredBookmarks] = useState<Bookmark[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [segment, setSegment] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [twitterId, setTwitterId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    fetchTwitterIdAndBookmarks();
  }, []);

  const fetchTwitterIdAndBookmarks = async () => {
    setIsLoading(true);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      toast.error('Please log in to view bookmarks');
      setIsLoading(false);
      return;
    }

    const accessToken = document.cookie
      .split('; ')
      .find(row => row.startsWith('twitter_access_token='))
      ?.split('=')[1];

    if (!accessToken) {
      window.location.href = '/api/twitter/auth';
      setIsLoading(false);
      return;
    }

    // Fetch Twitter ID if not already set
    if (!twitterId) {
      try {
        const meResponse = await fetch('https://api.twitter.com/2/users/me', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (!meResponse.ok) throw new Error(await meResponse.text());
        const meData = await meResponse.json();
        setTwitterId(meData.data.id);
      } catch (error) {
        toast.error('Failed to fetch Twitter ID: ' + (error as Error).message);
        console.error('Twitter ID fetch error:', error);
        setIsLoading(false);
        return;
      }
    }

    // Fetch bookmarks
    if (twitterId) {
      try {
        const response = await fetch(`https://api.twitter.com/2/users/${twitterId}/bookmarks`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const data = await response.json();
        setBookmarks(data.data || []);
        setFilteredBookmarks(data.data || []);
      } catch (error) {
        toast.error('Failed to fetch bookmarks: ' + (error as Error).message);
        console.error('Bookmarks fetch error:', error);
        if ((error as Error).message.includes('Unauthorized')) {
          window.location.href = '/api/twitter/auth';
        }
      }
    }
    setIsLoading(false);
  };

  const filterBookmarks = () => {
    let result = bookmarks;
    if (searchTerm) {
      result = result.filter(b =>
        b.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.author.username.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (segment !== 'all') {
      result = result.filter(b =>
        segment === 'hashtags'
          ? Array.isArray(b.entities?.hashtags) && b.entities.hashtags.length > 0 // Fixed with explicit array check
          : b.text.toLowerCase().includes(segment.toLowerCase())
      );
    }
    setFilteredBookmarks(result);
  };

  useEffect(() => {
    filterBookmarks();
  }, [searchTerm, segment, bookmarks]);

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-4 flex items-center">
        <Bookmark className="mr-2 h-6 w-6" /> My Twitter Bookmarks
      </h1>
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search bookmarks..."
          className="w-full sm:w-64"
        />
        <Select value={segment} onValueChange={setSegment}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Segment by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="hashtags">Hashtags</SelectItem>
            <SelectItem value="pet">Pet-related</SelectItem>
            <SelectItem value="code">Code-related</SelectItem>
            <SelectItem value="travel">Travel-related</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={fetchTwitterIdAndBookmarks} disabled={isLoading}>
          {isLoading ? 'Loading...' : 'Refresh'}
        </Button>
      </div>
      {filteredBookmarks.length === 0 && !isLoading ? (
        <p className="text-gray-500 dark:text-gray-400">No bookmarks found.</p>
      ) : (
        <div className="grid gap-4">
          {filteredBookmarks.map(bookmark => (
            <Card key={bookmark.id}>
              <CardHeader>
                <CardTitle>@{bookmark.author.username}</CardTitle>
              </CardHeader>
              <CardContent>
                <p>{bookmark.text}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  {new Date(bookmark.created_at).toLocaleString()}
                </p>
                {bookmark.entities?.
hashtags && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Hashtags: {bookmark.entities.hashtags.map(h => `#${h.text}`).join(', ')}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}