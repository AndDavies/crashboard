"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Reminder = {
  id: string;
  title: string;
  content: string | null;
  created_at: string;
};

export default function TrendInsights({ reminders }: { reminders: Reminder[] }) {
  const now = new Date();
  const start = new Date();
  start.setDate(now.getDate() - 7); // Default to week

  const periodReminders = reminders.filter(
    (r) => new Date(r.created_at) >= start && new Date(r.created_at) <= now
  );

  const words = periodReminders
    .flatMap((r) => `${r.title} ${r.content || ""}`.split(/\s+/))
    .filter((word) => word.length > 3)
    .reduce(
      (acc, word) => {
        const cleanWord = word.toLowerCase().replace(/[^\w]/g, "");
        if (cleanWord) {
          acc[cleanWord] = (acc[cleanWord] || 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>,
    );

  const topWords = Object.entries(words)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word, count]) => ({ word, count }));

  if (topWords.length === 0) {
    return null;
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>This Week’s Trends</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="list-disc pl-5">
          {topWords.map(({ word, count }) => (
            <li key={word} className="text-sm">
              {word}: {count} mentions
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}