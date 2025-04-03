"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

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
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Mood vs. Energy</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <XAxis dataKey="energy" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="positive" fill="#82ca9d" name="Positive" />
            <Bar dataKey="negative" fill="#ff5722" name="Negative" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}