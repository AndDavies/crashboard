"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";

type Reminder = {
  id: string;
  title: string;
  content: string | null;
  tags: string[];
  created_at: string;
  is_pinned: boolean;
  color: string;
  need_to_do: boolean;
  want_to_do: boolean;
  reading_list: boolean;
  is_archived: boolean;
  is_done: boolean;
  energy_scale: number | null;
};

export default function KeywordCloud({ reminders }: { reminders: Reminder[] }) {
  const [timeRange, setTimeRange] = useState<"week" | "month" | "3months" | "year">("week");

  const now = new Date();
  const start = new Date();
  switch (timeRange) {
    case "week":
      start.setDate(now.getDate() - 7);
      break;
    case "month":
      start.setMonth(now.getMonth() - 1);
      break;
    case "3months":
      start.setMonth(now.getMonth() - 3);
      break;
    case "year":
      start.setFullYear(now.getFullYear() - 1);
      break;
  }

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

  const data = Object.entries(words)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }));

  if (data.length === 0) {
    return null;
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Frequent Terms</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          <Button variant={timeRange === "week" ? "default" : "outline"} onClick={() => setTimeRange("week")}>
            Last Week
          </Button>
          <Button variant={timeRange === "month" ? "default" : "outline"} onClick={() => setTimeRange("month")}>
            Last Month
          </Button>
          <Button variant={timeRange === "3months" ? "default" : "outline"} onClick={() => setTimeRange("3months")}>
            Last 3 Months
          </Button>
          <Button variant={timeRange === "year" ? "default" : "outline"} onClick={() => setTimeRange("year")}>
            Last Year
          </Button>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <XAxis dataKey="word" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill="#8884d8" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}