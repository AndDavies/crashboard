"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type Reminder = {
  id: string;
  title: string;
  content: string | null;
  created_at: string;
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
    date: d.date,
    average: d.total / d.count,
  }));

  if (chartData.length === 0) return null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Energy Trends (Last Week)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <XAxis dataKey="date" />
            <YAxis domain={[1, 5]} />
            <Tooltip />
            <Line type="monotone" dataKey="average" stroke="#8884d8" />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}