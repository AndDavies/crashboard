import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, isBefore, startOfDay } from 'date-fns';

type ColorKey = 'soft-blue' | 'soft-green' | 'soft-red' | 'soft-yellow' | 'soft-purple' | 'soft-gray';
export type Reminder = {
  id: string;
  title: string;
  due_date: string | null;
  is_pinned: boolean;
  category?: 'need_to_do' | 'want_to_do' | 'reading_list' | null | undefined;
  color: ColorKey;
  energy_scale: number;
  tags: string[];
  is_open: boolean;
  is_done: boolean;
};

interface ToDoSnapshotWidgetProps {
  reminders: Reminder[];
}

export function ToDoSnapshotWidget({ reminders }: ToDoSnapshotWidgetProps) {
  // Statistical Insights
  const averageEnergy = reminders.length > 0
    ? (reminders.reduce((sum, r) => sum + r.energy_scale, 0) / reminders.length).toFixed(1)
    : 0;

  // Most common tag
  const tagCounts: Record<string, number> = {};
  reminders.forEach(r => {
    r.tags.forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });
  const mostCommonTag = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';

  // Time of day recommendation based on energy and due dates
  const highEnergyTasks = reminders.filter(r => r.energy_scale >= 7);
  const urgentTasks = reminders.filter(r => r.due_date && isBefore(new Date(r.due_date), startOfDay(new Date())));
  const focusTime = highEnergyTasks.length > 0 || urgentTasks.length > 0 ? 'Morning' : 'Afternoon';

  return (
    <Card style={{ backgroundColor: '#317039', color: '#FFF' }}>
      <CardHeader>
        <CardTitle className="text-white">To-Do Snapshot</CardTitle>
        <CardDescription className="text-gray-200">Your current tasks and focus insights.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Statistical Insights */}
        <div className="bg-white/10 p-3 rounded-md">
          <div className="text-sm font-medium">Insights:</div>
          <div className="text-xs">Avg. Energy: {averageEnergy} / 10</div>
          <div className="text-xs">
            Top Tag: <Badge variant="secondary">{mostCommonTag}</Badge>
          </div>
          <div className="text-xs">Best Focus Time: {focusTime}</div>
        </div>

        {/* Task List */}
        {reminders.length === 0 ? (
          <p className="text-sm text-gray-300 text-center py-4">No open to-do tasks!</p>
        ) : (
          reminders.slice(0, 3).map((reminder) => (
            <div key={reminder.id} className="flex items-start gap-2 p-2 rounded-md bg-white/20">
              <div className="flex-grow">
                <p className="text-sm font-medium text-white truncate">{reminder.title}</p>
                <div className="flex items-center gap-2 text-xs text-gray-200">
                  {reminder.due_date && (
                    <span>{format(new Date(reminder.due_date), 'MMM d')}</span>
                  )}
                  <span>Energy: {reminder.energy_scale}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}