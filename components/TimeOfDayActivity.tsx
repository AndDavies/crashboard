"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type Reminder = {
  id: string;
  title: string;
  content: string | null;
  created_at: string;
};

export default function TimeOfDayActivity({ reminders }: { reminders: Reminder[] }) {
  const hourCounts = reminders.reduce((acc, r) => {
    const hour = new Date(r.created_at).getHours();
    acc[hour] = (acc[hour] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const data = Array.from({ length: 24 }, (_, i) => ({
    hour: `${i}:00`,
    count: hourCounts[i] || 0,
  }));

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Time of Day Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <XAxis dataKey="hour" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill="#8884d8" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}