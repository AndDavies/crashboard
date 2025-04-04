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

export default function EnergyTrends({ reminders }: { reminders: Reminder[] }) {
  const lastWeek = new Date();
  lastWeek.setDate(lastWeek.getDate() - 7);

  const energyData = reminders
    .filter((r) => new Date(r.created_at) >= lastWeek && r.energy_scale !== null)
    .reduce((acc, r) => {
      const date = new Date(r.created_at).toDateString();
      if (!acc[date]) acc[date] = { date, total: 0, count: 0 };
      acc[date].total += r.energy_scale!;
      acc[date].count += 1;
      return acc;
    }, {} as Record<string, { date: string; total: number; count: number }>);

  const chartData = Object.values(energyData).map((d) => ({
    name: d.date.split(" ")[2] + " " + d.date.split(" ")[1], // e.g., "03 Apr"
    average: d.total / d.count,
  }));

  if (chartData.length === 0) return null;

  return (
    <Card className="mt-6 rounded-md">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base font-medium">Energy Trends (Last Week)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis
              stroke="#888888"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}`}
              domain={[1, 5]}
            />
            <Tooltip />
            <Line type="monotone" dataKey="average" stroke="#82ca9d" activeDot={{ r: 8 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}