import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "@/components/ui/card";
  import { Badge } from "@/components/ui/badge";
  
  // Define Quote type (same as in page.tsx)
  type Quote = {
    id: number;
    quote_text: string;
    author: string;
    theme: 'grounding' | 'presence' | 'acceptance' | 'surrender' | 'bible_verse' | 'taoist' | 'buddhist' | 'spiritual_leader' | null;
    context: string;
    application: string;
    scheduled_date: string | null;
    created_at: string;
    updated_at: string;
  };
  
  interface QuoteOfTheDayWidgetProps {
    quote: Quote | null;
  }
  
  export function QuoteOfTheDayWidget({ quote }: QuoteOfTheDayWidgetProps) {
    return (
      <Card style={{ backgroundColor: '#FFF8EB', color: '#000' }}>
        <CardHeader>
          <CardTitle className="text-black">Quote of the Day</CardTitle>
          <CardDescription className="text-gray-800">Daily inspiration to guide your journey.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {quote ? (
            <div className="p-3 rounded-md bg-white/20">
              <p className="text-sm font-medium text-black italic mb-2">"{quote.quote_text}"</p>
              <p className="text-xs text-gray-800">— {quote.author}</p>
              {quote.theme && (
                <Badge variant="secondary" className="capitalize text-xs mt-2">
                  {quote.theme.replace('_', ' ')}
                </Badge>
              )}
              <p className="text-xs text-gray-800 mt-2"><strong>Context:</strong> {quote.context}</p>
              <p className="text-xs text-gray-800 mt-1"><strong>Apply Today:</strong> {quote.application}</p>
            </div>
          ) : (
            <p className="text-sm text-gray-600 text-center py-4">No quote available today.</p>
          )}
        </CardContent>
      </Card>
    );
  }