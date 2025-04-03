"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type Reminder = {
  id: string;
  title: string;
  content: string | null;
  energy_scale: number | null;
};

const positiveWords = ["great", "good", "awesome", "happy", "success"];
const negativeWords = ["bad", "fail", "tired", "sad", "problem"];

export default function MoodCorrelation({ reminders }: { reminders: Reminder[] }) {
  const moodData = reminders
    .filter((r) => r.energy_scale !== null)
    .reduce((acc, r) => {
      const text = `${r.title} ${r.content || ""}`.toLowerCase();
      const energy = r.energy_scale!;
      if (!acc[energy]) acc[energy] = { energy, positive: 0, negative: 0 };
      if (positiveWords.some((w) => text.includes(w))) acc[energy].positive += 1;
      if (negativeWords.some((w) => text.includes(w))) acc[energy].negative += 1;
      return acc;
    }, {} as Record<number, { energy: number; positive: number; negative: number }>);

  const data = Object.values(moodData);

  if (data.length === 0) return null;

  return (
    <Card className="mt-6 rounded-md">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base font-medium">Mood vs. Energy</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <XAxis dataKey="energy" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip />
            <Line type="monotone" dataKey="positive" stroke="#82ca9d" activeDot={{ r: 8 }} name="Positive" />
            <Line type="monotone" dataKey="negative" stroke="#ff5722" activeDot={{ r: 8 }} name="Negative" />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}