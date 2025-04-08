'use client';

import { useState, useEffect } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { CalendarIcon, Tag, ChevronDown, Check, Plus, Edit2, Pin, PinOff, Star, ExternalLink } from 'lucide-react';
import { TagsInput } from '@/components/TagsInput';
import { cn } from "@/lib/utils";
import { Badge } from '@/components/ui/badge';
import React from 'react';

// Define the colors with a type - New Palette from provided image with dark mode support
type ColorKey = 'emerald-green' | 'maximum-yellow' | 'dark-pastel-red' | 'antique-white' | 'papaya-whip' | 'cosmic-latte' | 'muted-teal' | 'clay-orange' | 'pine-shadow' | 'dusty-lilac';
const COLORS: Record<ColorKey, { 
  hex: string; 
  darkHex: string;
  border: string; 
  darkBorder: string;
  bg: string; 
  darkBg: string;
  text: string;
  darkText: string;
}> = {
  'emerald-green': { 
    hex: '#317039', 
    darkHex: '#3c8845',
    border: 'border-[#317039]', 
    darkBorder: 'dark:border-[#3c8845]',
    bg: 'bg-[#317039]/10', 
    darkBg: 'dark:bg-[#317039]/30',
    text: 'text-[#317039]', 
    darkText: 'dark:text-[#5baf65]'
  },
  'maximum-yellow': { 
    hex: '#F1BE49', 
    darkHex: '#f1be49',
    border: 'border-[#F1BE49]', 
    darkBorder: 'dark:border-[#f1be49]',
    bg: 'bg-[#F1BE49]/10', 
    darkBg: 'dark:bg-[#F1BE49]/20',
    text: 'text-[#8B6F19]', 
    darkText: 'dark:text-[#f1c96a]'
  },
  'dark-pastel-red': { 
    hex: '#CC4B24', 
    darkHex: '#cc5c38',
    border: 'border-[#CC4B24]', 
    darkBorder: 'dark:border-[#cc5c38]',
    bg: 'bg-[#CC4B24]/10', 
    darkBg: 'dark:bg-[#CC4B24]/30',
    text: 'text-[#CC4B24]', 
    darkText: 'dark:text-[#f07d5e]'
  },
  'antique-white': { 
    hex: '#F8EDD9', 
    darkHex: '#f8edd9',
    border: 'border-[#F8EDD9]', 
    darkBorder: 'dark:border-[#f8edd9]',
    bg: 'bg-[#F8EDD9]/10', 
    darkBg: 'dark:bg-[#F8EDD9]/10',
    text: 'text-gray-800', 
    darkText: 'dark:text-gray-200'
  },
  'papaya-whip': { 
    hex: '#FFF1D4', 
    darkHex: '#fff1d4',
    border: 'border-[#FFF1D4]', 
    darkBorder: 'dark:border-[#fff1d4]',
    bg: 'bg-[#FFF1D4]/10', 
    darkBg: 'dark:bg-[#FFF1D4]/10',
    text: 'text-gray-800', 
    darkText: 'dark:text-gray-200'
  },
  'cosmic-latte': { 
    hex: '#FFF8EB', 
    darkHex: '#fff8eb',
    border: 'border-[#FFF8EB]', 
    darkBorder: 'dark:border-[#fff8eb]',
    bg: 'bg-[#FFF8EB]/10', 
    darkBg: 'dark:bg-[#FFF8EB]/10',
    text: 'text-gray-800', 
    darkText: 'dark:text-gray-200'
  },
  'muted-teal': { 
    hex: '#588C82', 
    darkHex: '#6da99e',
    border: 'border-[#588C82]', 
    darkBorder: 'dark:border-[#6da99e]',
    bg: 'bg-[#588C82]/10', 
    darkBg: 'dark:bg-[#588C82]/30',
    text: 'text-[#588C82]', 
    darkText: 'dark:text-[#8cc5bb]'
  },
  'clay-orange': { 
    hex: '#D77A61', 
    darkHex: '#d7866f',
    border: 'border-[#D77A61]', 
    darkBorder: 'dark:border-[#d7866f]',
    bg: 'bg-[#D77A61]/10', 
    darkBg: 'dark:bg-[#D77A61]/30',
    text: 'text-[#D77A61]', 
    darkText: 'dark:text-[#ffa48e]'
  },
  'pine-shadow': { 
    hex: '#3E4E45', 
    darkHex: '#4d5f55',
    border: 'border-[#3E4E45]', 
    darkBorder: 'dark:border-[#4d5f55]',
    bg: 'bg-[#3E4E45]/10', 
    darkBg: 'dark:bg-[#3E4E45]/30',
    text: 'text-[#3E4E45]', 
    darkText: 'dark:text-[#879c91]'
  },
  'dusty-lilac': { 
    hex: '#C1B2D3', 
    darkHex: '#c1b2d3',
    border: 'border-[#C1B2D3]', 
    darkBorder: 'dark:border-[#c1b2d3]',
    bg: 'bg-[#C1B2D3]/10', 
    darkBg: 'dark:bg-[#C1B2D3]/20',
    text: 'text-[#645a7d]', 
    darkText: 'dark:text-[#d3c7e3]'
  },
};

// Form schema (make title optional)
const reminderSchema = z.object({
  title: z.string().optional(),
  due_date: z.date().optional().nullable(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  category: z.enum(['need_to_do', 'want_to_do', 'reading_list']).optional().nullable(),
  energy_scale: z.number().min(1).max(10),
  color: z.string(), // Use string to allow any color value
  is_open: z.boolean(),
  is_done: z.boolean(),
});

type ReminderForm = z.infer<typeof reminderSchema>;

// Define the Reminder type with is_pinned for backward compatibility
export type Reminder = {
  id: string;
  user_id: string;
  title: string;
  content: string | null;
  tags: string[];
  created_at: string;
  color: ColorKey | string; // Accept string for backward compatibility
  energy_scale: number;
  is_done: boolean;
  due_date: string | null;
  is_open: boolean;
  is_pinned?: boolean; // Make optional but keep for backward compatibility
  category: 'need_to_do' | 'want_to_do' | 'reading_list' | undefined | null;
};

// Function to convert URLs in text to clickable links
const LinkifyText = ({ text }: { text: string }) => {
  if (!text) return null;
  
  // Regex to match URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  
  // Split text by URLs and create an array of text and link elements
  const parts = text.split(urlRegex);
  const matches = text.match(urlRegex) || [];
  
  // Return array of text and link elements
  return (
    <>
      {parts.map((part, index) => {
        // If this part is a URL, render it as a link
        if (index > 0 && index <= matches.length) {
          const url = matches[index - 1];
          return (
            <React.Fragment key={index}>
              <a 
                href={url} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center break-all"
              >
                {url}
                <ExternalLink className="h-3 w-3 ml-1 inline-block" />
              </a>
            </React.Fragment>
          );
        }
        // Otherwise just return the text
        return part;
      })}
    </>
  );
};

export function RemindersClient({ initialReminders, userId }: { initialReminders: Reminder[]; userId: string }) {
  const [reminders, setReminders] = useState<Reminder[]>(initialReminders);
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddFormVisible, setIsAddFormVisible] = useState(false);

  const supabase = createClient();

  // Verify authentication state on mount
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        console.error('Initial authentication check failed:', error?.message || 'No user found');
        toast.error('You must be logged in to add reminders.');
      } else {
        console.log('Authenticated user:', user.id);
        if (user.id !== userId) {
          console.error('User ID mismatch:', { authenticatedUserId: user.id, providedUserId: userId });
          toast.error('User authentication mismatch. Please log in again.');
        }
      }
    };
    checkAuth();
  }, [supabase, userId]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('reminders')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'reminders',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newReminder = payload.new as Reminder;
          const processedReminder = { ...newReminder, category: newReminder.category ?? undefined };
          setReminders((prev) => {
            // Prevent duplicate if already added locally
            if (prev.some((r) => r.id === newReminder.id)) {
              console.log('Duplicate INSERT detected, skipping:', newReminder.id);
              return prev;
            }
            return [processedReminder, ...prev];
          });
          console.log('Real-time INSERT:', processedReminder);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'reminders',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updatedReminder = payload.new as Reminder;
          const processedReminder = { ...updatedReminder, category: updatedReminder.category ?? undefined };
          setReminders((prev) =>
            prev.map((reminder) =>
              reminder.id === updatedReminder.id
                ? processedReminder
                : reminder
            )
          );
          console.log('Real-time UPDATE:', processedReminder);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'reminders',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setReminders((prev) => prev.filter(reminder => reminder.id !== payload.old.id));
          console.log('Real-time DELETE:', payload.old.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  // Filter reminders based on showCompleted toggle
  const filteredReminders = reminders.filter((r) =>
    showCompleted ? r.is_done : r.is_open && !r.is_done
  ).sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Form setup for adding reminders
  const addForm = useForm<ReminderForm>({
    resolver: zodResolver(reminderSchema),
    defaultValues: {
      title: '',
      due_date: null,
      content: '',
      tags: [],
      category: null,
      energy_scale: 5,
      color: 'emerald-green',
      is_open: true,
      is_done: false,
    },
  });

  // Form setup for editing reminders
  const editForm = useForm<ReminderForm>({
    resolver: zodResolver(reminderSchema),
    defaultValues: { /* Default values set via useEffect */ },
  });

  // Update edit form when selectedReminder changes
  useEffect(() => {
    if (selectedReminder) {
      editForm.reset({
        title: selectedReminder.title,
        due_date: selectedReminder.due_date ? new Date(selectedReminder.due_date) : null,
        content: selectedReminder.content || '',
        tags: selectedReminder.tags || [],
        category: selectedReminder.category ?? null,
        energy_scale: selectedReminder.energy_scale,
        color: selectedReminder.color,
        is_open: selectedReminder.is_open,
        is_done: selectedReminder.is_done,
      });
    }
  }, [selectedReminder, editForm]);

  // Call the server-side API route to generate a title
  const generateTitle = async (content: string): Promise<string> => {
    try {
      console.log('Generating title for content:', content);
      const response = await fetch('/api/generate-title', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate title: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.title) {
        throw new Error('Title generation returned empty result');
      }
      console.log('Generated title:', data.title);
      return data.title;
    } catch (error) {
      console.error('Error generating title:', error);
      toast.error('Failed to generate title');
      return 'Generated Title'; // Fallback
    }
  };

  const onAddSubmit: SubmitHandler<ReminderForm> = async (data) => {
    setIsLoading(true);
    try {
      console.log('Starting onAddSubmit with form data:', data);

      // Ensure title is provided
      let finalTitle = data.title || '';
      if (!finalTitle && data.content) {
        console.log('No title provided, generating title from content:', data.content);
        finalTitle = await generateTitle(data.content);
      }
      if (!finalTitle) {
        console.error('Title is required but still empty after generation attempt');
        throw new Error('A title is required. Please provide one or add content to generate it.');
      }

      // Verify authentication before insert
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        console.error('Authentication check failed:', authError?.message || 'No user found');
        throw new Error('You must be logged in to add reminders');
      }
      if (user.id !== userId) {
        console.error('User ID mismatch:', { authenticatedUserId: user.id, providedUserId: userId });
        throw new Error('User authentication mismatch. Please log in again.');
      }
      console.log('Authenticated user:', user.id);

      // Prepare full reminder data
      const reminderData = {
        user_id: userId,
        title: finalTitle,
        due_date: data.due_date ? data.due_date.toISOString() : null,
        content: data.content || null,
        tags: data.tags && data.tags.length > 0 ? data.tags : null, // Use null if empty to leverage default
        category: data.category || null,
        energy_scale: data.energy_scale,
        color: data.color,
        is_open: true,
        is_done: false,
        is_pinned: false, // Keep default value for database compatibility
      };

      console.log('Inserting reminder into database:', reminderData);

      const { data: insertData, error } = await supabase
        .from('reminders')
        .insert(reminderData)
        .select()
        .single();

      if (error) {
        console.error('Supabase insert error:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          rawError: error,
        });
        if (error.code === '23514') {
          throw new Error('Invalid data provided. Please check your inputs.');
        } else if (error.code === '42501') {
          throw new Error('Permission denied. Please log in again.');
        } else {
          throw new Error(`Failed to add reminder: ${error.message}`);
        }
      }

      if (!insertData) {
        console.error('Insert operation returned no data');
        throw new Error('Insert operation failed: No data returned');
      }

      console.log('Successfully inserted reminder:', insertData);

      // Immediately update local state with the new reminder
      const newReminder: Reminder = {
        ...insertData,
        tags: insertData.tags || [], // Ensure tags is an array
        category: insertData.category ?? undefined, // Match processing in subscription
      };
      setReminders((prev) => [newReminder, ...prev]);

      toast.success('Reminder added!');
      addForm.reset();
      setIsAddFormVisible(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add reminder';
      console.error('Error in onAddSubmit:', error);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
      console.log('Finished onAddSubmit, isLoading set to false');
    }
  };

  const onEditSubmit: SubmitHandler<ReminderForm> = async (data) => {
    if (!selectedReminder) return;
    setIsLoading(true);
    try {
      console.log('Editing reminder with data:', data);

      let finalTitle = data.title || '';
      if (!finalTitle && data.content) {
        console.log('No title provided, generating title from content:', data.content);
        finalTitle = await generateTitle(data.content);
      }
      if (!finalTitle) {
        console.log('Falling back to original title:', selectedReminder.title);
        finalTitle = selectedReminder.title;
      }

      const updateData = {
        title: finalTitle,
        due_date: data.due_date ? data.due_date.toISOString() : null,
        content: data.content || null,
        tags: data.tags || [],
        category: data.category || null,
        energy_scale: data.energy_scale,
        color: data.color,
        is_open: data.is_open,
        is_done: data.is_done,
        is_pinned: selectedReminder.is_pinned,
      };

      console.log('Updating reminder in database:', updateData);

      const { data: updatedData, error } = await supabase
        .from('reminders')
        .update(updateData)
        .eq('id', selectedReminder.id)
        .select()
        .single();

      if (error) {
        console.error('Supabase update error:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        throw new Error(`Failed to update reminder: ${error.message}`);
      }

      if (!updatedData) {
        console.error('Update operation returned no data');
        throw new Error('Update operation failed: No data returned');
      }

      console.log('Successfully updated reminder:', updatedData);
      toast.success('Reminder updated!');
      setSelectedReminder(null);
      if (expandedRowId === selectedReminder.id) {
        setExpandedRowId(null);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update reminder';
      console.error('Error updating reminder:', error);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
      console.log('Finished edit operation, isLoading set to false');
    }
  };

  const toggleDone = async (reminder: Reminder) => {
    try {
      console.log('Toggling done status for reminder:', reminder.id);
      const { data, error } = await supabase
        .from('reminders')
        .update({ 
          is_done: !reminder.is_done, 
          is_open: reminder.is_done 
        })
        .eq('id', reminder.id)
        .select()
        .single();

      if (error) {
        console.error('Supabase toggle done error:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        throw new Error(`Failed to update status: ${error.message}`);
      }

      console.log('Successfully toggled done status:', data);
      toast.success(reminder.is_done ? 'Marked as open.' : 'Marked as done.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update status';
      console.error('Error toggling done status:', error);
      toast.error(errorMessage);
    }
  };

  // Toggle expanded row
  const toggleExpandedRow = (id: string) => {
    setExpandedRowId(expandedRowId === id ? null : id);
  };

  // Helper function to get a safe color
  const getSafeColor = (colorKey: string | undefined): ColorKey => {
    // If the color exists in our palette, use it
    if (colorKey && colorKey in COLORS) {
      return colorKey as ColorKey;
    }
    
    // Map old colors to new ones
    const colorMap: Record<string, ColorKey> = {
      'soft-blue': 'muted-teal',
      'soft-green': 'emerald-green',
      'soft-red': 'dark-pastel-red',
      'soft-yellow': 'maximum-yellow',
      'soft-purple': 'dusty-lilac',
      'soft-gray': 'pine-shadow'
    };
    
    // If we can map the old color, use the mapped value
    if (colorKey && colorKey in colorMap) {
      return colorMap[colorKey];
    }
    
    // Default fallback
    return 'cosmic-latte';
  };

  return (
    <div className="p-4 md:p-6 space-y-6 min-h-screen bg-gray-50 dark:bg-black">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold text-foreground">Reminders</h1>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="show-completed"
              checked={showCompleted}
              onCheckedChange={setShowCompleted}
            />
            <Label htmlFor="show-completed" className="text-sm font-medium text-muted-foreground">
              Show Completed
            </Label>
          </div>
          <Button onClick={() => setIsAddFormVisible(!isAddFormVisible)} variant="default">
            <Plus className="w-4 h-4 mr-2" /> {isAddFormVisible ? 'Cancel' : 'Add Reminder'}
          </Button>
        </div>
      </div>

      {/* Add Reminder Form - Using Card */}
      {isAddFormVisible && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
          <Card className="mb-6 shadow-sm bg-white dark:bg-gray-800">
            <CardHeader>
              <CardTitle className="text-xl">Add New Reminder</CardTitle>
              <CardDescription>Quickly capture tasks or ideas.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={addForm.handleSubmit(onAddSubmit)} className="space-y-4">
                {/* Title Input */}
                <Input
                  {...addForm.register('title')}
                  placeholder="Reminder title (optional, can be generated)"
                  className="text-base"
                />
                {/* Date Picker */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !addForm.watch("due_date") && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {addForm.watch("due_date") ? (
                        format(addForm.watch("due_date") as Date, "PPP")
                      ) : (
                        <span>Pick a due date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={addForm.watch("due_date") || undefined}
                      onSelect={(date) => {
                        addForm.setValue('due_date', date || null);
                        // Close the calendar after selection
                        document.body.click();
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

                <Textarea
                  {...addForm.register('content')}
                  placeholder="Details, links, etc."
                  className="text-base"
                  rows={3}
                />
                <div>
                  <Label className="text-sm font-medium">Tags</Label>
                  <TagsInput
                    value={addForm.watch('tags') || []}
                    onChange={(tags) => addForm.setValue('tags', tags)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-2 block">Category</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className={cn(
                        "transition-colors",
                        addForm.watch('category') === 'need_to_do' 
                          ? `bg-[#317039] hover:bg-[#317039]/90 text-white dark:bg-[#3c8845] dark:hover:bg-[#3c8845]/90` 
                          : "bg-white dark:bg-gray-800 border border-[#317039] dark:border-[#3c8845] text-[#317039] dark:text-[#5baf65] hover:bg-[#317039]/10 dark:hover:bg-[#317039]/20"
                      )}
                      onClick={() => addForm.setValue('category', 'need_to_do')}
                    >
                      Need to do
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className={cn(
                        "transition-colors",
                        addForm.watch('category') === 'want_to_do' 
                          ? `bg-[#F1BE49] hover:bg-[#F1BE49]/90 text-black dark:bg-[#f1be49] dark:hover:bg-[#f1be49]/90` 
                          : "bg-white dark:bg-gray-800 border border-[#F1BE49] text-[#8B6F19] dark:text-[#f1c96a] hover:bg-[#F1BE49]/10 dark:hover:bg-[#F1BE49]/20"
                      )}
                      onClick={() => addForm.setValue('category', 'want_to_do')}
                    >
                      Want to do
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className={cn(
                        "transition-colors",
                        addForm.watch('category') === 'reading_list' 
                          ? `bg-[#588C82] hover:bg-[#588C82]/90 text-white dark:bg-[#6da99e] dark:hover:bg-[#6da99e]/90` 
                          : "bg-white dark:bg-gray-800 border border-[#588C82] dark:border-[#6da99e] text-[#588C82] dark:text-[#8cc5bb] hover:bg-[#588C82]/10 dark:hover:bg-[#588C82]/20"
                      )}
                      onClick={() => addForm.setValue('category', 'reading_list')}
                    >
                      Reading list
                    </Button>
                    {addForm.watch('category') && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => addForm.setValue('category', null)}
                        className="text-muted-foreground hover:text-foreground dark:text-gray-400 dark:hover:text-gray-300"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Energy Level ({addForm.watch('energy_scale')})</Label>
                  <Slider
                    min={1} max={10} step={1}
                    value={[addForm.watch('energy_scale')]}
                    onValueChange={(value) => addForm.setValue('energy_scale', value[0])}
                    className="mt-2"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>Low</span>
                    <span>Medium</span>
                    <span>High</span>
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-2 block">Color Tag</Label>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(COLORS).map(([name, { hex }]) => (
                      <button
                        key={name}
                        type="button"
                        style={{ backgroundColor: hex }}
                        className={cn(
                          'w-8 h-8 rounded-full border-2 transition-all duration-150',
                          addForm.watch('color') === name ? 'border-foreground ring-2 ring-offset-2 ring-foreground' : 'border-muted'
                        )}
                        onClick={() => addForm.setValue('color', name as ColorKey)}
                        aria-label={`Select color ${name}`}
                      />
                    ))}
                  </div>
                </div>
              </form>
            </CardContent>
            <CardFooter className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setIsAddFormVisible(false)}>Cancel</Button>
              <Button type="submit" disabled={isLoading} onClick={addForm.handleSubmit(onAddSubmit)}>
                {isLoading ? 'Adding...' : 'Add Reminder'}
              </Button>
            </CardFooter>
          </Card>
        </motion.div>
      )}

      {/* Reminders List - Using Card and Table */}
      <Card className="bg-white dark:bg-gray-800 border-t-4 border-t-[#317039] dark:border-t-[#3c8845] shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl font-semibold dark:text-white">Your Reminders</CardTitle>
          <CardDescription className="dark:text-gray-400">
            {showCompleted ? 'Showing completed reminders.' : 'Showing open reminders.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
                <TableHead className="dark:text-gray-300">Title</TableHead>
                <TableHead className="hidden md:table-cell dark:text-gray-300">Due Date</TableHead>
                <TableHead className="hidden lg:table-cell dark:text-gray-300">Category</TableHead>
                <TableHead className="hidden sm:table-cell w-[100px] dark:text-gray-300">Energy</TableHead>
                <TableHead className="text-right w-[80px] dark:text-gray-300">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReminders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground dark:text-gray-400">
                    No reminders found. {showCompleted ? '' : 'Add one above!'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredReminders.map((reminder) => (
                  <React.Fragment key={reminder.id}>
                    <TableRow 
                      className={cn(
                        "border-l-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer",
                        `${COLORS[getSafeColor(reminder.color)].border} ${COLORS[getSafeColor(reminder.color)].darkBorder}`,
                        reminder.is_done && 'opacity-60'
                      )}
                      onClick={() => toggleExpandedRow(reminder.id)}
                    >
                      <TableCell className="font-medium dark:text-white">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={reminder.is_done}
                            onCheckedChange={() => toggleDone(reminder)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label="Mark as done"
                            className="mr-2 dark:border-gray-600"
                          />
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ 
                              backgroundColor: COLORS[getSafeColor(reminder.color)].hex 
                            }}></div>
                            <span>{reminder.title}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground dark:text-gray-400">
                        {reminder.due_date ? format(new Date(reminder.due_date), 'PP') : '--'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {reminder.category && (
                          <span className={cn(
                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                            reminder.category === 'need_to_do' ? 
                              `${COLORS['emerald-green'].bg} ${COLORS['emerald-green'].darkBg} ${COLORS['emerald-green'].text} ${COLORS['emerald-green'].darkText}` :
                            reminder.category === 'want_to_do' ? 
                              `${COLORS['maximum-yellow'].bg} ${COLORS['maximum-yellow'].darkBg} ${COLORS['maximum-yellow'].text} ${COLORS['maximum-yellow'].darkText}` :
                            reminder.category === 'reading_list' ? 
                              `${COLORS['muted-teal'].bg} ${COLORS['muted-teal'].darkBg} ${COLORS['muted-teal'].text} ${COLORS['muted-teal'].darkText}` :
                            'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                          )}>
                            {reminder.category.replace('_', ' ')}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground dark:text-gray-400 w-[100px]">
                        <div className="flex items-center gap-1">
                          <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                            <div 
                              className="h-full rounded-full" 
                              style={{ 
                                width: `${reminder.energy_scale * 10}%`,
                                backgroundColor: COLORS[getSafeColor(reminder.color)].hex 
                              }}
                            />
                          </div>
                          <span className="text-xs w-4 text-right">{reminder.energy_scale}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right w-[80px]">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="w-8 h-8 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedReminder(reminder);
                          }}
                        >
                          <Edit2 className="w-4 h-4" />
                          <span className="sr-only">Edit</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expandedRowId === reminder.id && (
                      <TableRow className="bg-gray-50 dark:bg-gray-700 border-0">
                        <TableCell colSpan={5} className="p-4">
                          <div className="space-y-3 pl-8">
                            {reminder.content && (
                              <div>
                                <Label className="font-medium text-sm text-gray-700 dark:text-gray-300">Details</Label>
                                <div className="mt-1 text-sm whitespace-pre-wrap text-gray-600 dark:text-gray-400">
                                  <LinkifyText text={reminder.content} />
                                </div>
                              </div>
                            )}
                            {reminder.tags && reminder.tags.length > 0 && (
                              <div>
                                <Label className="font-medium text-sm text-gray-700 dark:text-gray-300">Tags</Label>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {reminder.tags.map((tag) => (
                                    <Badge 
                                      key={tag} 
                                      variant="outline" 
                                      className="bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600"
                                    >
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="flex justify-end mt-2">
                              <Button 
                                size="sm"
                                className="bg-white hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-300 border border-gray-300 dark:border-gray-600"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedReminder(reminder);
                                }}
                              >
                                Edit Reminder
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Reminder Dialog */}
      <Dialog open={!!selectedReminder} onOpenChange={(isOpen) => !isOpen && setSelectedReminder(null)}>
        <DialogContent className="sm:max-w-lg bg-white dark:bg-gray-800 dark:border-gray-700">
          {selectedReminder && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl dark:text-white">Edit Reminder</DialogTitle>
              </DialogHeader>
              <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4 pt-4">
                <Input
                  {...editForm.register('title')}
                  placeholder="Reminder title"
                  className="text-base"
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !editForm.watch("due_date") && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editForm.watch("due_date") ? (
                        format(editForm.watch("due_date") as Date, "PPP")
                      ) : (
                        <span>Pick a due date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={editForm.watch("due_date") || undefined}
                      onSelect={(date) => {
                        editForm.setValue('due_date', date || null);
                        // Close the calendar after selection
                        document.body.click();
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Textarea
                  {...editForm.register('content')}
                  placeholder="Details..."
                  rows={4}
                />
                <div>
                  <Label className="text-sm font-medium">Tags</Label>
                  <TagsInput
                    value={editForm.watch('tags') || []}
                    onChange={(tags) => editForm.setValue('tags', tags)}
                    placeholder="Add tags..."
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-2 block dark:text-gray-300">Category</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className={cn(
                        "transition-colors",
                        editForm.watch('category') === 'need_to_do' 
                          ? `bg-[#317039] hover:bg-[#317039]/90 text-white dark:bg-[#3c8845] dark:hover:bg-[#3c8845]/90` 
                          : "bg-white dark:bg-gray-800 border border-[#317039] dark:border-[#3c8845] text-[#317039] dark:text-[#5baf65] hover:bg-[#317039]/10 dark:hover:bg-[#317039]/20"
                      )}
                      onClick={() => editForm.setValue('category', 'need_to_do')}
                    >
                      Need to do
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className={cn(
                        "transition-colors",
                        editForm.watch('category') === 'want_to_do' 
                          ? `bg-[#F1BE49] hover:bg-[#F1BE49]/90 text-black dark:bg-[#f1be49] dark:hover:bg-[#f1be49]/90` 
                          : "bg-white dark:bg-gray-800 border border-[#F1BE49] text-[#8B6F19] dark:text-[#f1c96a] hover:bg-[#F1BE49]/10 dark:hover:bg-[#F1BE49]/20"
                      )}
                      onClick={() => editForm.setValue('category', 'want_to_do')}
                    >
                      Want to do
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className={cn(
                        "transition-colors",
                        editForm.watch('category') === 'reading_list' 
                          ? `bg-[#588C82] hover:bg-[#588C82]/90 text-white dark:bg-[#6da99e] dark:hover:bg-[#6da99e]/90` 
                          : "bg-white dark:bg-gray-800 border border-[#588C82] dark:border-[#6da99e] text-[#588C82] dark:text-[#8cc5bb] hover:bg-[#588C82]/10 dark:hover:bg-[#588C82]/20"
                      )}
                      onClick={() => editForm.setValue('category', 'reading_list')}
                    >
                      Reading list
                    </Button>
                    {editForm.watch('category') && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => editForm.setValue('category', null)}
                        className="text-muted-foreground hover:text-foreground dark:text-gray-400 dark:hover:text-gray-300"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Energy Level ({editForm.watch('energy_scale')})</Label>
                  <Slider
                    min={1} max={10} step={1}
                    value={[editForm.watch('energy_scale')]}
                    onValueChange={(value) => editForm.setValue('energy_scale', value[0])}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-2 block">Color Tag</Label>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(COLORS).map(([name, { hex }]) => (
                      <button 
                        key={name} 
                        type="button" 
                        style={{ backgroundColor: hex }} 
                        className={cn(
                          'w-8 h-8 rounded-full border-2 transition-all duration-150', 
                          editForm.watch('color') === name ? 'border-foreground ring-2 ring-offset-2 ring-foreground' : 'border-muted'
                        )} 
                        onClick={() => editForm.setValue('color', name as ColorKey)} 
                        aria-label={`Select color ${name}`} 
                      />
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="edit-open" checked={editForm.watch('is_open')} onCheckedChange={(checked) => editForm.setValue('is_open', Boolean(checked))} />
                    <Label htmlFor="edit-open" className="text-sm">Open</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="edit-done" checked={editForm.watch('is_done')} onCheckedChange={(checked) => editForm.setValue('is_done', Boolean(checked))} />
                    <Label htmlFor="edit-done" className="text-sm">Done</Label>
                  </div>
                </div>
                <DialogFooter className="pt-4">
                  <Button type="button" variant="outline" onClick={() => setSelectedReminder(null)}>Cancel</Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? 'Saving...' : 'Save Changes'}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}