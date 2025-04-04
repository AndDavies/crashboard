"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

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

export default function TimeOfDayActivity({ reminders }: { reminders: Reminder[] }) {
  const hourCounts = reminders.reduce((acc, r) => {
    const hour = new Date(r.created_at).getHours();
    acc[hour] = (acc[hour] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const data = Array.from({ length: 24 }, (_, i) => ({
    name: `${i}:00`,
    count: hourCounts[i] || 0,
  }));

  return (
    <Card className="mt-6 rounded-md">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base font-medium">Time of Day Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#82ca9d" activeDot={{ r: 8 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}