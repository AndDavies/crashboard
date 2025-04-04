"use client";

import * as React from "react";
import { useState } from "react";
import { Check, Clock, X, MoreHorizontal, CalendarIcon, TagIcon, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import ReminderDetailPanel from "@/components/ReminderDetailPanel";

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

// Color mapping for the reminder categories
const colors = {
  "soft-blue": {
    bg: "bg-blue-50 dark:bg-blue-950",
    text: "text-blue-800 dark:text-blue-100",
    border: "border-blue-200 dark:border-blue-800",
    hoverBg: "hover:bg-blue-100 dark:hover:bg-blue-900",
    dot: "bg-blue-500 dark:bg-blue-400"
  },
  "soft-green": {
    bg: "bg-green-50 dark:bg-green-950",
    text: "text-green-800 dark:text-green-100",
    border: "border-green-200 dark:border-green-800",
    hoverBg: "hover:bg-green-100 dark:hover:bg-green-900",
    dot: "bg-green-500 dark:bg-green-400"
  },
  "soft-yellow": {
    bg: "bg-yellow-50 dark:bg-yellow-950",
    text: "text-yellow-800 dark:text-yellow-100",
    border: "border-yellow-200 dark:border-yellow-800",
    hoverBg: "hover:bg-yellow-100 dark:hover:bg-yellow-900",
    dot: "bg-yellow-500 dark:bg-yellow-400"
  },
  "soft-purple": {
    bg: "bg-purple-50 dark:bg-purple-950",
    text: "text-purple-800 dark:text-purple-100",
    border: "border-purple-200 dark:border-purple-800",
    hoverBg: "hover:bg-purple-100 dark:hover:bg-purple-900",
    dot: "bg-purple-500 dark:bg-purple-400"
  },
  "soft-pink": {
    bg: "bg-pink-50 dark:bg-pink-950",
    text: "text-pink-800 dark:text-pink-100",
    border: "border-pink-200 dark:border-pink-800",
    hoverBg: "hover:bg-pink-100 dark:hover:bg-pink-900",
    dot: "bg-pink-500 dark:bg-pink-400"
  },
  "soft-gray": {
    bg: "bg-gray-50 dark:bg-gray-900",
    text: "text-gray-800 dark:text-gray-100",
    border: "border-gray-200 dark:border-gray-700",
    hoverBg: "hover:bg-gray-100 dark:hover:bg-gray-800",
    dot: "bg-gray-500 dark:bg-gray-400"
  },
};

interface ReminderTaskListProps {
  reminders: Reminder[];
  onDone: (id: string, currentDone: boolean) => void;
  onArchive: (id: string) => void;
  title: string;
  emptyMessage: string;
}

export default function ReminderTaskList({
  reminders,
  onDone,
  onArchive,
  title,
  emptyMessage,
}: ReminderTaskListProps) {
  const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [sortField, setSortField] = useState<"title" | "created_at" | "energy_scale">("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  
  const handleToggleExpand = (id: string) => {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleSort = (field: "title" | "created_at" | "energy_scale") => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const handleReminderClick = (reminder: Reminder) => {
    setSelectedReminder(reminder);
    setIsDetailOpen(true);
  };

  const handleDetailClose = () => {
    setIsDetailOpen(false);
  };

  const handleDone = (id: string, currentDone: boolean) => {
    onDone(id, currentDone);
    // Update the selected reminder if it's the one that was updated
    if (selectedReminder && selectedReminder.id === id) {
      setSelectedReminder({
        ...selectedReminder,
        is_done: !currentDone
      });
    }
  };

  const handleArchive = (id: string) => {
    onArchive(id);
    // Close the detail panel if the archived reminder was selected
    if (selectedReminder && selectedReminder.id === id) {
      setIsDetailOpen(false);
    }
  };

  // Sort reminders based on current sorting criteria
  const sortedReminders = [...reminders].sort((a, b) => {
    if (sortField === "title") {
      return sortDirection === "asc"
        ? a.title.localeCompare(b.title)
        : b.title.localeCompare(a.title);
    }
    
    if (sortField === "created_at") {
      return sortDirection === "asc"
        ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    
    if (sortField === "energy_scale") {
      const aEnergy = a.energy_scale || 0;
      const bEnergy = b.energy_scale || 0;
      return sortDirection === "asc" ? aEnergy - bEnergy : bEnergy - aEnergy;
    }
    
    return 0;
  });

  // Render energy indicators
  const renderEnergyLevel = (level: number | null) => {
    if (!level) return null;
    
    return (
      <div className="flex items-center gap-0.5">
        {Array.from({ length: Math.min(level, 5) }).map((_, i) => (
          <div 
            key={i} 
            className={`w-1.5 h-5 rounded-sm ${
              level <= 3 ? "bg-green-500 dark:bg-green-600" : 
              level <= 7 ? "bg-yellow-500 dark:bg-yellow-600" : 
              "bg-red-500 dark:bg-red-600"
            }`} 
            style={{ opacity: 0.5 + ((i + 1) * 0.1) }}
          />
        ))}
        <span className="ml-1.5 text-xs text-gray-500 dark:text-gray-400">{level}</span>
      </div>
    );
  };

  return (
    <div className="mt-6 mb-8 animate-in fade-in-50 duration-500">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        
        <div className="flex gap-2 text-sm text-muted-foreground">
          <span>Sort by:</span>
          <button 
            onClick={() => handleSort("title")} 
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors",
              sortField === "title" ? "font-medium text-foreground" : ""
            )}
          >
            Title {sortField === "title" && (sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
          </button>
          <button 
            onClick={() => handleSort("created_at")} 
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors",
              sortField === "created_at" ? "font-medium text-foreground" : ""
            )}
          >
            Date {sortField === "created_at" && (sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
          </button>
          <button 
            onClick={() => handleSort("energy_scale")} 
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded hover:bg-muted transition-colors",
              sortField === "energy_scale" ? "font-medium text-foreground" : ""
            )}
          >
            Energy {sortField === "energy_scale" && (sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
          </button>
        </div>
      </div>
      
      {reminders.length === 0 ? (
        <div className="text-center p-8 bg-muted/30 rounded-lg border animate-in fade-in-50 duration-300">
          <p className="text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : (
        <div className="rounded-md border animate-in fade-in-50 duration-300">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="hidden md:table-cell">Date</TableHead>
                <TableHead className="hidden md:table-cell">Tags</TableHead>
                <TableHead className="hidden sm:table-cell">Energy</TableHead>
                <TableHead className="w-28">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedReminders.map((reminder) => {
                const colorConfig = colors[reminder.color as keyof typeof colors] || colors["soft-gray"];
                const isExpanded = expandedRows[reminder.id] || false;
                
                return (
                  <React.Fragment key={reminder.id}>
                    <TableRow 
                      className={cn(
                        "group cursor-pointer transition-colors",
                        colorConfig.hoverBg,
                        reminder.is_done && "opacity-60",
                        isExpanded ? colorConfig.bg : ""
                      )}
                    >
                      <TableCell className="p-2">
                        <div className="flex items-center justify-center">
                          <div 
                            className={`w-3 h-3 rounded-full ${colorConfig.dot}`}
                            aria-hidden="true"
                          />
                        </div>
                      </TableCell>
                      <TableCell 
                        className="flex items-center gap-3 font-medium cursor-pointer"
                        onClick={() => handleToggleExpand(reminder.id)}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              reminder.is_done && "line-through text-muted-foreground",
                            )}>
                              {reminder.title}
                            </span>
                            <div className="flex space-x-1">
                              {reminder.need_to_do && (
                                <Badge variant="destructive" className="text-xs">Need</Badge>
                              )}
                              {reminder.want_to_do && (
                                <Badge variant="secondary" className="text-xs">Want</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <button 
                          className="ml-auto text-muted-foreground hover:text-foreground" 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleExpand(reminder.id);
                          }}
                        >
                          {isExpanded ? 
                            <ChevronUp className="h-4 w-4" /> : 
                            <ChevronDown className="h-4 w-4" />
                          }
                        </button>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {format(new Date(reminder.created_at), "MMM d, yyyy")}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {reminder.tags && reminder.tags.length > 0 ? (
                            reminder.tags.slice(0, 2).map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground italic">No tags</span>
                          )}
                          {reminder.tags && reminder.tags.length > 2 && (
                            <Badge variant="outline" className="text-xs">+{reminder.tags.length - 2}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {renderEnergyLevel(reminder.energy_scale)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 group-hover:bg-background/80"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDone(reminder.id, reminder.is_done);
                            }}
                            title={reminder.is_done ? "Mark as Incomplete" : "Mark as Complete"}
                          >
                            {reminder.is_done ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 group-hover:bg-background/80"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReminderClick(reminder);
                            }}
                            title="View Details"
                          >
                            <CalendarIcon className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 group-hover:bg-background/80"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Open menu</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleDone(reminder.id, reminder.is_done)}
                              >
                                {reminder.is_done ? "Mark as Incomplete" : "Mark as Complete"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleArchive(reminder.id)}
                              >
                                Archive
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleReminderClick(reminder)}
                              >
                                View Details
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                    
                    {/* Expandable content row */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.tr
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className={`${colorConfig.bg} border-t border-b ${colorConfig.border}`}
                        >
                          <td colSpan={6} className="p-0">
                            <motion.div 
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="p-4"
                            >
                              <div className="flex flex-col gap-4">
                                {reminder.content && (
                                  <div>
                                    <h4 className="text-sm font-medium mb-1">Content:</h4>
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                      {reminder.content}
                                    </p>
                                  </div>
                                )}
                                
                                <div className="flex flex-wrap gap-4 text-sm">
                                  <div>
                                    <h4 className="font-medium mb-1">Created:</h4>
                                    <div className="flex items-center gap-1.5 text-muted-foreground">
                                      <CalendarIcon className="h-3.5 w-3.5" />
                                      {format(new Date(reminder.created_at), "PPP p")}
                                    </div>
                                  </div>
                                  
                                  {reminder.tags && reminder.tags.length > 0 && (
                                    <div>
                                      <h4 className="font-medium mb-1">Tags:</h4>
                                      <div className="flex flex-wrap gap-1.5 items-center">
                                        <TagIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                        {reminder.tags.map(tag => (
                                          <Badge key={tag} variant="outline" className="text-xs">
                                            {tag}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                                
                                <div className="flex justify-end mt-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleReminderClick(reminder)}
                                    className="text-xs"
                                  >
                                    View Full Details
                                  </Button>
                                </div>
                              </div>
                            </motion.div>
                          </td>
                        </motion.tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      
      {selectedReminder && (
        <ReminderDetailPanel
          reminder={selectedReminder}
          isOpen={isDetailOpen}
          onClose={handleDetailClose}
          onDone={handleDone}
          onArchive={handleArchive}
        />
      )}
    </div>
  );
} 