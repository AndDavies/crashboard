"use client";

import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2Icon, ArchiveIcon, TagIcon, ZapIcon, CalendarIcon } from "lucide-react";

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

interface DashboardActivitySummaryProps {
  reminders: Reminder[];
}

type Activity = {
  id: string;
  title: string;
  time: string;
  timestamp: Date;
  icon: React.ElementType;
};

export default function DashboardActivitySummary({ reminders }: DashboardActivitySummaryProps) {
  const recentActivities = useMemo(() => {
    const activities: Activity[] = [];

    // Add activities from reminders (completed, archived, created)
    reminders.forEach(reminder => {
      const createdDate = new Date(reminder.created_at);
      
      // Add creation activity
      activities.push({
        id: `create-${reminder.id}`,
        title: `Created "${reminder.title}"`,
        time: formatDistanceToNow(createdDate, { addSuffix: true }),
        timestamp: createdDate,
        icon: CalendarIcon
      });
      
      // For completed reminders
      if (reminder.is_done) {
        // We don't have a completed_at field, so we'll simulate one
        // In a real app, you would store the actual completion time
        const completedDate = new Date(createdDate);
        completedDate.setHours(completedDate.getHours() + Math.floor(Math.random() * 24));
        
        if (completedDate <= new Date()) {
          activities.push({
            id: `complete-${reminder.id}`,
            title: `Completed "${reminder.title}"`,
            time: formatDistanceToNow(completedDate, { addSuffix: true }),
            timestamp: completedDate,
            icon: CheckCircle2Icon
          });
        }
      }
      
      // For archived reminders
      if (reminder.is_archived) {
        // Again, simulating an archived_at field
        const archivedDate = new Date(createdDate);
        archivedDate.setHours(archivedDate.getHours() + Math.floor(Math.random() * 48));
        
        if (archivedDate <= new Date()) {
          activities.push({
            id: `archive-${reminder.id}`,
            title: `Archived "${reminder.title}"`,
            time: formatDistanceToNow(archivedDate, { addSuffix: true }),
            timestamp: archivedDate,
            icon: ArchiveIcon
          });
        }
      }
      
      // For high energy reminders
      if (reminder.energy_scale && reminder.energy_scale >= 8) {
        activities.push({
          id: `energy-${reminder.id}`,
          title: `Added high-energy task "${reminder.title}"`,
          time: formatDistanceToNow(createdDate, { addSuffix: true }),
          timestamp: createdDate,
          icon: ZapIcon
        });
      }
      
      // For reminders with tags
      if (reminder.tags && reminder.tags.length > 0) {
        activities.push({
          id: `tags-${reminder.id}`,
          title: `Tagged "${reminder.title}" with ${reminder.tags.map(t => `#${t}`).join(', ')}`,
          time: formatDistanceToNow(createdDate, { addSuffix: true }),
          timestamp: createdDate,
          icon: TagIcon
        });
      }
    });

    // Sort by timestamp (most recent first) and limit to 5 activities
    return activities
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 5);
  }, [reminders]);

  return (
    <div className="space-y-6">
      {recentActivities.length > 0 ? (
        recentActivities.map((activity) => (
          <div key={activity.id} className="flex items-center">
            <div className="mr-4 rounded-full p-2 bg-muted">
              <activity.icon className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium leading-none">{activity.title}</p>
              <p className="text-sm text-muted-foreground">{activity.time}</p>
            </div>
          </div>
        ))
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <p>No recent activity</p>
        </div>
      )}
    </div>
  );
} 