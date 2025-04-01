import { formatDistanceToNow } from "date-fns";
import { ExternalLink, Hash, Info, MessageCircle, Tag } from "lucide-react";
import Image from "next/image";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Bookmark } from "lucide-react";

interface TwitterBookmarkProps {
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
  bookmarked_at?: string; // Optional, defaults to created_at
}

export function TwitterBookmarkCard({
  id,
  user_id,
  text,
  created_at,
  author_username,
  author_name,
  media_url,
  urls,
  hashtags,
  annotations,
  context_domain,
  context_entity,
  bookmarked_at = created_at,
}: TwitterBookmarkProps) {
  const formattedDate = formatDistanceToNow(new Date(bookmarked_at), { addSuffix: true });
  const authorInitial = author_name.charAt(0).toUpperCase();
  const isVideo = media_url?.includes("video") || false;

  const getContextIcon = () => {
    switch (context_domain.toLowerCase()) {
      case "news":
        return <Info className="h-3.5 w-3.5" />;
      case "technology":
        return <ExternalLink className="h-3.5 w-3.5" />;
      default:
        return <Tag className="h-3.5 w-3.5" />;
    }
  };

  return (
    <Card className="flex h-full min-h-[400px] w-full flex-col overflow-hidden transition-all hover:shadow-md">
      <CardHeader className="flex flex-row items-start gap-3 space-y-0 p-4">
        <Avatar className="h-9 w-9 border">
          <AvatarFallback className="bg-gray-100 text-gray-800">{authorInitial}</AvatarFallback>
        </Avatar>
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-between">
            <p className="font-medium leading-none">{author_name}</p>
            <Badge variant="outline" className="ml-auto flex items-center gap-1 px-2 py-0.5">
              {getContextIcon()}
              <span className="text-xs">{context_entity || context_domain}</span>
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">@{author_username}</p>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-3 p-4 pt-0">
        <p className="text-sm">{text}</p>
        {media_url && (
          <div className="relative mt-2 overflow-hidden rounded-md bg-muted">
            {isVideo ? (
              <div className="relative aspect-video w-full bg-black/5">
                <div className="absolute inset-0 flex items-center justify-center">
                  <MessageCircle className="h-10 w-10 text-white/80" />
                </div>
                <Image
                  src={media_url || "/placeholder.svg"}
                  alt="Video thumbnail"
                  fill
                  className="object-cover opacity-90"
                />
              </div>
            ) : (
              <div className="relative aspect-video w-full">
                <Image src={media_url || "/placeholder.svg"} alt="Tweet media" fill className="object-cover" />
              </div>
            )}
          </div>
        )}
        {hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {hashtags.map((tag) => (
              <Badge key={tag} variant="secondary" className="flex items-center gap-0.5 px-2 py-0.5">
                <Hash className="h-3 w-3" />
                <span className="text-xs">{tag}</span>
              </Badge>
            ))}
          </div>
        )}
      </CardContent>

      <CardFooter className="border-t p-3">
        <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Bookmark className="h-3.5 w-3.5" />
            <span>Saved</span>
          </div>
          <span>{formattedDate}</span>
        </div>
      </CardFooter>
    </Card>
  );
}