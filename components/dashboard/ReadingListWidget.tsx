import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";

type ColorKey = 'soft-blue' | 'soft-green' | 'soft-red' | 'soft-yellow' | 'soft-purple' | 'soft-gray';
export type Reminder = {
  id: string;
  title: string;
  content: string | null;
  due_date: string | null;
  is_pinned: boolean;
  category?: 'need_to_do' | 'want_to_do' | 'reading_list' | null | undefined;
  color: ColorKey;
  energy_scale: number;
  tags: string[];
  is_open: boolean;
  is_done: boolean;
};

interface ReadingListWidgetProps {
  reminders: Reminder[];
}

export function ReadingListWidget({ reminders }: ReadingListWidgetProps) {
  // Function to extract URL from content or title
  const extractUrl = (reminder: Reminder): string | null => {
    const urlPattern = /(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})/;
    
    if (reminder.content) {
      const contentMatch = reminder.content.match(urlPattern);
      if (contentMatch) return contentMatch[0];
    }
    
    if (reminder.title) {
      const titleMatch = reminder.title.match(urlPattern);
      if (titleMatch) return titleMatch[0];
    }
    
    return null;
  };

  // Function to ensure URL has protocol
  const normalizeUrl = (url: string): string => {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return `https://${url}`;
    }
    return url;
  };

  return (
    <Card className="rounded-lg shadow-md" style={{ backgroundColor: '#3E4E45', color: '#F5F5F5' }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-gray-100 text-lg font-medium">Reading List</CardTitle>
        <CardDescription className="text-gray-300">Your saved reading materials.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1 p-3">
        {reminders.length === 0 ? (
          <p className="text-xs text-gray-300 text-center py-2">No items in your reading list!</p>
        ) : (
          reminders.slice(0, 5).map((reminder) => {
            const url = extractUrl(reminder);
            return (
              <div 
                key={reminder.id} 
                className="flex items-start gap-2 p-1.5 rounded-md bg-gray-700/20 hover:bg-gray-700/40 transition-colors"
              >
                <div className="flex-grow overflow-hidden">
                  {url ? (
                    <a 
                      href={normalizeUrl(url)} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-start gap-1 text-[#FFF1D4] hover:text-[#FBEDD9] hover:underline"
                    >
                      <p className="text-xs tracking-tight font-medium truncate leading-tight">{reminder.title}</p>
                      <ExternalLink className="h-3 w-3 mt-0.5 flex-shrink-0 text-[#FFF1D4] hover:text-[#FBEDD9]" />
                    </a>
                  ) : (
                    <p className="text-xs tracking-tight font-medium break-words leading-tight text-gray-100">{reminder.title}</p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}