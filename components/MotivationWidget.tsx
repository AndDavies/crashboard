"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

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

export default function MotivationWidget({ reminders }: { reminders: Reminder[] }) {
  const [message, setMessage] = useState("");

  useEffect(() => {
    const messages = ["You're on a roll—keep it up!", "Nice work tackling those tasks!", "You've got this in the bag!"];
    if (Math.random() < 0.3 && reminders.length > 0) {
      const randomTitle = reminders[Math.floor(Math.random() * reminders.length)].title;
      setMessage(`${messages[Math.floor(Math.random() * messages.length)]} Especially with "${randomTitle}".`);
    }
  }, [reminders]);

  if (!message) {
    return null;
  }

  return (
    <Card className="mt-6">
      <CardContent className="pt-6">
        <p>{message}</p>
      </CardContent>
    </Card>
  );
}