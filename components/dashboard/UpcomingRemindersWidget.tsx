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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  return (
    <Card style={{ backgroundColor: '#CC4824', color: '#FFF' }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-white">Upcoming Reminders</CardTitle>
        <CardDescription className="text-gray-200">Your pinned or soon-due tasks.</CardDescription>
      </CardHeader>
      <CardContent className="p-2">
        {reminders.length === 0 ? (
          <p className="text-sm text-gray-300 text-center py-4">
            No upcoming or pinned reminders!
          </p>
        ) : (
          <div className="rounded-md overflow-hidden bg-gray-800/50">
            <Table className="border-collapse">
              <TableHeader className="bg-gray-800/70">
                <TableRow className="border-b-0">
                  <TableHead className="text-white w-[40px] py-2">Pin</TableHead>
                  <TableHead className="text-white w-[40px] py-2">Done</TableHead>
                  <TableHead className="text-white py-2">Title</TableHead>
                  <TableHead className="text-white hidden md:table-cell py-2">Due Date</TableHead>
                  <TableHead className="text-white hidden lg:table-cell py-2">Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reminders.map((reminder) => (
                  <TableRow 
                    key={reminder.id} 
                    className={cn(
                      "border-b border-gray-700 hover:bg-gray-700/70",
                      reminder.is_done && "opacity-60"
                    )}
                  >
                    <TableCell className="py-1">
                      {reminder.is_pinned && (
                        <Pin className="h-4 w-4 text-yellow-400" />
                      )}
                    </TableCell>
                    <TableCell className="py-1">
                      <Checkbox
                        checked={reminder.is_done}
                        className="border-white data-[state=checked]:bg-white data-[state=checked]:text-[#CC4824]"
                      />
                    </TableCell>
                    <TableCell className="py-1 font-medium text-white">
                      {reminder.title}
                    </TableCell>
                    <TableCell className="py-1 hidden md:table-cell text-gray-200">
                      {reminder.due_date ? (
                        <span className="flex items-center gap-1">
                          <CalendarClock className="h-3 w-3" />
                          {format(new Date(reminder.due_date), 'PP')}
                        </span>
                      ) : (
                        '--'
                      )}
                    </TableCell>
                    <TableCell className="py-1 hidden lg:table-cell text-gray-200 capitalize">
                      {reminder.category?.replace('_', ' ') || '--'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-2">
        <Button asChild variant="outline" size="sm" className="w-full text-white border-white hover:bg-white/20">
          <Link href="/dashboard/reminders">View All Reminders</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}