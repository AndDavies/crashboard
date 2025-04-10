import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from 'date-fns';
import { cn } from "@/lib/utils";
import { Pin, CalendarClock, Check } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox";

type ColorKey = 'soft-blue' | 'soft-green' | 'soft-red' | 'soft-yellow' | 'soft-purple' | 'soft-gray';
export type Reminder = {
  id: string;
  title: string;
  due_date: string | null;
  is_pinned: boolean;
  category?: 'need_to_do' | 'want_to_do' | 'reading_list' | null | undefined;
  color: ColorKey;
  is_done?: boolean;
};

interface UpcomingRemindersWidgetProps {
  reminders: Reminder[];
}

export function UpcomingRemindersWidget({ reminders }: UpcomingRemindersWidgetProps) {
  return (
    <Card className="rounded-lg shadow-md" style={{ backgroundColor: '#CC4B24', color: '#FFF' }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-white text-lg font-medium">Upcoming Reminders</CardTitle>
        <CardDescription className="text-[#F5E6D3]">Your pinned or soon-due tasks.</CardDescription>
      </CardHeader>
      <CardContent className="p-3">
        {reminders.length === 0 ? (
          <p className="text-sm text-gray-300 text-center py-4">
            No upcoming or pinned reminders!
          </p>
        ) : (
          <div className="space-y-2">
            {reminders.map((reminder) => (
              <div
                key={reminder.id}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-md bg-gray-800/30 hover:bg-gray-800/50 transition-colors",
                  reminder.is_done && "opacity-60"
                )}
              >
                {/* Pin Icon */}
                <div className="flex-shrink-0">
                  {reminder.is_pinned && (
                    <Pin className="h-3 w-3 text-[#F5E6D3]" />
                  )}
                </div>

                {/* Checkbox */}
                <div className="flex-shrink-0">
                  <Checkbox
                    checked={reminder.is_done}
                    className="border-white data-[state=checked]:bg-white data-[state=checked]:text-[#CC4B24] hover:border-gray-300"
                  />
                </div>

                {/* Reminder Details */}
                <div className="flex-grow overflow-hidden">
                  <p className="text-sm font-medium text-white truncate leading-relaxed">
                    {reminder.title}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-[#F5E6D3] flex-wrap">
                    {/* Due Date */}
                    <span className="flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" />
                      {reminder.due_date ? format(new Date(reminder.due_date), 'PP') : '--'}
                    </span>
                    {/* Category (visible on lg screens) */}
                    <span className="hidden lg:inline capitalize">
                      {reminder.category?.replace('_', ' ') || '--'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-2">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="w-full text-white border-white rounded-full px-4 py-1 hover:bg-white/30"
        >
          <Link href="/dashboard/reminders">View All Reminders</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}