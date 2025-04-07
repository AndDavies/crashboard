import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, formatDistanceToNowStrict } from 'date-fns';
import { cn } from "@/lib/utils";
import { Pin, CalendarClock } from 'lucide-react';

type ColorKey = 'soft-blue' | 'soft-green' | 'soft-red' | 'soft-yellow' | 'soft-purple' | 'soft-gray';
export type Reminder = {
  id: string;
  title: string;
  due_date: string | null;
  is_pinned: boolean;
  category?: 'need_to_do' | 'want_to_do' | 'reading_list' | null | undefined;
  color: ColorKey;
};

const COLORS: Record<ColorKey, { hex: string; tailwindBg: string }> = {
  'soft-blue': { hex: '#A3BFFA', tailwindBg: 'bg-blue-100 dark:bg-blue-900' },
  'soft-green': { hex: '#B5EAD7', tailwindBg: 'bg-green-100 dark:bg-green-900' },
  'soft-red': { hex: '#FF9AA2', tailwindBg: 'bg-red-100 dark:bg-red-900' },
  'soft-yellow': { hex: '#FFECB3', tailwindBg: 'bg-yellow-100 dark:bg-yellow-900' },
  'soft-purple': { hex: '#D6BCFA', tailwindBg: 'bg-purple-100 dark:bg-purple-900' },
  'soft-gray': { hex: '#E2E8F0', tailwindBg: 'bg-gray-100 dark:bg-gray-800' },
};

interface UpcomingRemindersWidgetProps {
  reminders: Reminder[];
}

export function UpcomingRemindersWidget({ reminders }: UpcomingRemindersWidgetProps) {
  const getDueDateText = (dueDate: string | null): string => {
    if (!dueDate) return 'No due date';
    try {
      const date = new Date(dueDate);
      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }
      return `Due ${formatDistanceToNowStrict(date, { addSuffix: true })}`;
    } catch (e) {
      console.error("Error parsing due date:", dueDate, e);
      return 'Invalid date';
    }
  };

  return (
    <Card style={{ backgroundColor: '#CC4824', color: '#FFF' }}>
      <CardHeader>
        <CardTitle className="text-white">Upcoming Reminders</CardTitle>
        <CardDescription className="text-gray-200">Your pinned or soon-due tasks.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {reminders.length === 0 ? (
          <p className="text-sm text-gray-300 text-center py-4">
            No upcoming or pinned reminders!
          </p>
        ) : (
          reminders.map((reminder) => (
            <div
              key={reminder.id}
              className={cn(
                "flex items-start gap-3 p-3 rounded-md border",
                COLORS[reminder.color]?.tailwindBg || COLORS['soft-gray'].tailwindBg
              )}
            >
              {reminder.is_pinned ? (
                <Pin className="h-4 w-4 mt-1 text-yellow-400 flex-shrink-0" />
              ) : (
                <div className="w-4 h-4 flex-shrink-0"></div>
              )}
              <div className="flex-grow overflow-hidden">
                <p className="text-sm font-medium leading-none mb-1 truncate">{reminder.title}</p>
                <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {reminder.due_date && (
                    <span className="flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" />
                      <span>{getDueDateText(reminder.due_date)}</span>
                    </span>
                  )}
                  {reminder.category && (
                    <Badge variant="secondary" className="capitalize text-xs">
                      {reminder.category.replace('_', ' ')}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
      <CardFooter>
        <Button asChild variant="outline" size="sm" className="w-full text-white border-white hover:bg-white/20">
          <Link href="/dashboard/reminders">View All Reminders</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}