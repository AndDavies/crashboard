import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

interface NeedsVsWantsWidgetProps {
  reminders: Reminder[];
}

export function NeedsVsWantsWidget({ reminders }: NeedsVsWantsWidgetProps) {
  const needs = reminders.filter(r => r.category === 'need_to_do');
  const wants = reminders.filter(r => r.category === 'want_to_do');

  // Focus priority based on energy
  const avgNeedsEnergy = needs.length > 0
    ? needs.reduce((sum, r) => sum + r.energy_scale, 0) / needs.length
    : 0;
  const avgWantsEnergy = wants.length > 0
    ? wants.reduce((sum, r) => sum + r.energy_scale, 0) / wants.length
    : 0;
  const focusPriority = avgNeedsEnergy > avgWantsEnergy ? 'Needs First' : 'Wants First';

  return (
    <Card style={{ backgroundColor: '#F1BE49', color: '#000' }}>
      <CardHeader>
        <CardTitle className="text-black">Needs vs Wants</CardTitle>
        <CardDescription className="text-gray-800">Prioritize your tasks.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Statistical Insight */}
        <div className="bg-black/10 p-3 rounded-md">
          <p className="text-sm font-medium">Focus Priority: {focusPriority}</p>
          <p className="text-xs">Needs: {needs.length} tasks (Avg. Energy: {avgNeedsEnergy.toFixed(1)})</p>
          <p className="text-xs">Wants: {wants.length} tasks (Avg. Energy: {avgWantsEnergy.toFixed(1)})</p>
        </div>

        {/* Needs List */}
        <div>
          <p className="text-sm font-medium mb-1">Needs to Do:</p>
          {needs.length === 0 ? (
            <p className="text-sm text-gray-600">No needs-to-do tasks!</p>
          ) : (
            needs.slice(0, 2).map((reminder) => (
              <div key={reminder.id} className="flex items-start gap-2 p-2 rounded-md bg-white/20">
                <div className="flex-grow">
                  <p className="text-sm font-medium text-black truncate">{reminder.title}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-800">
                    <span>Energy: {reminder.energy_scale}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Wants List */}
        <div>
          <p className="text-sm font-medium mb-1">Wants to Do:</p>
          {wants.length === 0 ? (
            <p className="text-sm text-gray-600">No wants-to-do tasks!</p>
          ) : (
            wants.slice(0, 2).map((reminder) => (
              <div key={reminder.id} className="flex items-start gap-2 p-2 rounded-md bg-white/20">
                <div className="flex-grow">
                  <p className="text-sm font-medium text-black truncate">{reminder.title}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-800">
                    <span>Energy: {reminder.energy_scale}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}