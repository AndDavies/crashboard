"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckIcon, XIcon, ChevronRightIcon } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

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
  is_archived: boolean;
  is_done: boolean;
  energy_scale: number | null;
};

interface DashboardRemindersWidgetProps {
  todayReminders: Reminder[];
  needToDoReminders: Reminder[];
}

export default function DashboardRemindersWidget({
  todayReminders: initialTodayReminders,
  needToDoReminders: initialNeedToDoReminders,
}: DashboardRemindersWidgetProps) {
  const [todayReminders, setTodayReminders] = useState<Reminder[]>(initialTodayReminders);
  const [needToDoReminders, setNeedToDoReminders] = useState<Reminder[]>(initialNeedToDoReminders);
  const supabase = createClient();
  const { toast } = useToast();

  const handleDone = async (id: string, currentDone: boolean) => {
    try {
      // Optimistic update for Today's reminders
      setTodayReminders((prev) => 
        prev.filter((r) => r.id !== id)
      );
      
      // Optimistic update for Need-to-do reminders
      setNeedToDoReminders((prev) => 
        prev.filter((r) => r.id !== id)
      );
      
      // Update in Supabase
      const { error } = await supabase
        .from("reminders")
        .update({ is_done: !currentDone })
        .eq("id", id);
      
      if (error) {
        toast({ 
          title: "Error", 
          description: error.message, 
          variant: "destructive" 
        });
      } else {
        toast({ 
          title: "Success", 
          description: "Reminder marked as done" 
        });
      }
    } catch (err) {
      console.error("Error updating reminder status:", err);
      toast({ 
        title: "Error", 
        description: "Failed to update reminder", 
        variant: "destructive" 
      });
    }
  };

  const handleArchive = async (id: string) => {
    try {
      // Optimistic update for Today's reminders
      setTodayReminders((prev) => 
        prev.filter((r) => r.id !== id)
      );
      
      // Optimistic update for Need-to-do reminders
      setNeedToDoReminders((prev) => 
        prev.filter((r) => r.id !== id)
      );
      
      // Update in Supabase
      const { error } = await supabase
        .from("reminders")
        .update({ is_archived: true })
        .eq("id", id);
      
      if (error) {
        toast({ 
          title: "Error", 
          description: error.message, 
          variant: "destructive" 
        });
      } else {
        toast({ 
          title: "Success", 
          description: "Reminder archived" 
        });
      }
    } catch (err) {
      console.error("Error archiving reminder:", err);
      toast({ 
        title: "Error", 
        description: "Failed to archive reminder", 
        variant: "destructive" 
      });
    }
  };

  // Colors for different reminder types
  const getColorClass = (color: string) => {
    const colors: Record<string, string> = {
      "soft-blue": "bg-blue-500",
      "soft-green": "bg-green-500",
      "soft-purple": "bg-purple-500",
      "soft-pink": "bg-pink-500",
      "soft-yellow": "bg-yellow-500",
      "soft-gray": "bg-gray-500",
    };
    return colors[color] || "bg-gray-500";
  };

  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle>Priority Reminders</CardTitle>
        <CardDescription>Today's tasks and important reminders</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="today" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="need-to-do">Need To Do</TabsTrigger>
          </TabsList>
          
          <TabsContent value="today">
            {todayReminders.length > 0 ? (
              <div className="space-y-4">
                {todayReminders.map((reminder) => (
                  <ReminderItem 
                    key={reminder.id} 
                    reminder={reminder} 
                    onDone={handleDone} 
                    onArchive={handleArchive}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <p>No reminders for today</p>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="need-to-do">
            {needToDoReminders.length > 0 ? (
              <div className="space-y-4">
                {needToDoReminders.map((reminder) => (
                  <ReminderItem 
                    key={reminder.id} 
                    reminder={reminder} 
                    onDone={handleDone} 
                    onArchive={handleArchive}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <p>No urgent reminders</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function ReminderItem({ 
  reminder, 
  onDone, 
  onArchive 
}: { 
  reminder: Reminder; 
  onDone: (id: string, currentDone: boolean) => void;
  onArchive: (id: string) => void;
}) {
  const colorDot = getColorDot(reminder.color);
  
  return (
    <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${colorDot}`} />
        <div>
          <div className="font-medium text-sm">{reminder.title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {format(new Date(reminder.created_at), "MMM d, h:mm a")}
          </div>
          
          {/* Tags and badges */}
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {reminder.need_to_do && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Need</Badge>
            )}
            {reminder.want_to_do && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Want</Badge>
            )}
            {reminder.energy_scale && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                Energy: {reminder.energy_scale}
              </Badge>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-1">
        <Button 
          size="icon" 
          variant="ghost" 
          className="h-7 w-7" 
          onClick={() => onDone(reminder.id, reminder.is_done)}
        >
          <CheckIcon className="h-4 w-4" />
        </Button>
        <Button 
          size="icon" 
          variant="ghost" 
          className="h-7 w-7" 
          onClick={() => onArchive(reminder.id)}
        >
          <XIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function getColorDot(color: string): string {
  const colors: Record<string, string> = {
    "soft-blue": "bg-blue-500",
    "soft-green": "bg-green-500",
    "soft-purple": "bg-purple-500",
    "soft-pink": "bg-pink-500",
    "soft-yellow": "bg-yellow-500",
    "soft-gray": "bg-gray-500",
  };
  return colors[color] || "bg-gray-500";
} 