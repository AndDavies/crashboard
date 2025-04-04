"use client";

import { useState, useEffect } from "react";
import { 
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetClose
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Tag, CheckCircle, X, Edit, Archive } from "lucide-react";
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
  reading_list?: boolean;
  is_archived: boolean;
  is_done: boolean;
  energy_scale: number | null;
};

const colors = {
  "soft-blue": "bg-gradient-to-br from-blue-50 to-blue-100 border-blue-300 text-blue-800 dark:from-blue-950 dark:to-blue-900 dark:border-blue-800 dark:text-blue-100",
  "soft-green": "bg-gradient-to-br from-green-50 to-green-100 border-green-300 text-green-800 dark:from-green-950 dark:to-green-900 dark:border-green-800 dark:text-green-100",
  "soft-yellow": "bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-300 text-yellow-800 dark:from-yellow-950 dark:to-yellow-900 dark:border-yellow-800 dark:text-yellow-100",
  "soft-purple": "bg-gradient-to-br from-purple-50 to-purple-100 border-purple-300 text-purple-800 dark:from-purple-950 dark:to-purple-900 dark:border-purple-800 dark:text-purple-100",
  "soft-pink": "bg-gradient-to-br from-pink-50 to-pink-100 border-pink-300 text-pink-800 dark:from-pink-950 dark:to-pink-900 dark:border-pink-800 dark:text-pink-100",
  "soft-gray": "bg-gradient-to-br from-gray-50 to-gray-100 border-gray-300 text-gray-800 dark:from-gray-900 dark:to-gray-800 dark:border-gray-700 dark:text-gray-100",
};

interface ReminderDetailPanelProps {
  reminder: Reminder | null;
  isOpen: boolean;
  onClose: () => void;
  onDone: (id: string, currentDone: boolean) => void;
  onArchive: (id: string) => void;
}

export default function ReminderDetailPanel({
  reminder,
  isOpen,
  onClose,
  onDone,
  onArchive
}: ReminderDetailPanelProps) {
  if (!reminder) return null;

  // Format the date
  const formattedDate = format(new Date(reminder.created_at), "PPP");
  const formattedTime = format(new Date(reminder.created_at), "p");
  
  // Process content to detect and linkify URLs
  const renderContent = () => {
    if (!reminder.content) return null;
    
    // Simple URL regex
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = reminder.content.split(urlRegex);
    
    return (
      <div>
        {parts.map((part, i) => {
          if (part.match(urlRegex)) {
            return (
              <a 
                key={i} 
                href={part} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline break-all"
              >
                {part}
              </a>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </div>
    );
  };

  // Get energy level icons
  const getEnergyIcons = () => {
    if (!reminder.energy_scale) return null;
    
    const level = reminder.energy_scale;
    return (
      <div className="flex items-center mt-1">
        <span className="text-gray-700 mr-2">Energy:</span>
        <div className="flex">
          {Array.from({ length: level }).map((_, i) => (
            <span key={i} className="text-yellow-500">🔋</span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4 border-b dark:border-gray-700">
          <div className="flex justify-between items-center">
            <SheetTitle className="text-xl font-bold">{reminder.title}</SheetTitle>
            <SheetClose asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </SheetClose>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {reminder.need_to_do && (
              <Badge variant="destructive" className="text-sm flex items-center gap-1">
                <span>⚠️</span> Need To Do
              </Badge>
            )}
            {reminder.want_to_do && (
              <Badge variant="secondary" className="text-sm flex items-center gap-1">
                <span>🎯</span> Want To Do
              </Badge>
            )}
            {reminder.reading_list && (
              <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-300 text-sm flex items-center gap-1 dark:bg-blue-950 dark:text-blue-100 dark:border-blue-800">
                <span>📚</span> Reading List
              </Badge>
            )}
            <Badge 
              variant="outline" 
              className={`${colors[reminder.color as keyof typeof colors] || colors["soft-gray"]} text-sm`}
            >
              {reminder.color.replace('soft-', '').charAt(0).toUpperCase() + reminder.color.replace('soft-', '').slice(1)}
            </Badge>
            {reminder.is_done && (
              <Badge variant="outline" className="bg-green-50 text-green-800 border-green-300 text-sm dark:bg-green-950 dark:text-green-100 dark:border-green-800">
                Completed
              </Badge>
            )}
          </div>
        </SheetHeader>
        
        <div className="py-4">
          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 mb-1">
            <Calendar className="h-4 w-4 mr-2" />
            {formattedDate}
          </div>
          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 mb-4">
            <Clock className="h-4 w-4 mr-2" />
            {formattedTime}
          </div>
          
          {getEnergyIcons()}
          
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Content</h3>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {renderContent() || <span className="text-gray-400 dark:text-gray-500 italic">No content</span>}
            </div>
          </div>
          
          {reminder.tags && reminder.tags.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                <Tag className="h-4 w-4 mr-2" />
                Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {reminder.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
                    #{tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div className="mt-6 flex gap-3 border-t dark:border-gray-700 pt-4">
          <Button
            variant={reminder.is_done ? "outline" : "default"}
            onClick={() => {
              onDone(reminder.id, reminder.is_done);
            }}
            className="flex-1"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            {reminder.is_done ? "Mark Incomplete" : "Mark Complete"}
          </Button>
          {!reminder.is_archived && (
            <Button
              variant="outline"
              onClick={() => onArchive(reminder.id)}
              className="flex-1"
            >
              <Archive className="h-4 w-4 mr-2" />
              Archive
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
} 