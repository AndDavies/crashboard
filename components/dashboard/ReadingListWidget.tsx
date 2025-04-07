import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

interface ReadingListWidgetProps {
  reminders: Reminder[];
}

export function ReadingListWidget({ reminders }: ReadingListWidgetProps) {
  return (
    <Card style={{ backgroundColor: '#FBEDD9', color: '#000' }}>
      <CardHeader>
        <CardTitle className="text-black">Reading List</CardTitle>
        <CardDescription className="text-gray-800">Your saved reading materials.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {reminders.length === 0 ? (
          <p className="text-sm text-gray-600 text-center py-4">No items in your reading list!</p>
        ) : (
          reminders.slice(0, 5).map((reminder) => (
            <div key={reminder.id} className="flex items-start gap-2 p-2 rounded-md bg-white/20">
              <div className="flex-grow">
                <p className="text-sm font-medium text-black truncate">{reminder.title}</p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}