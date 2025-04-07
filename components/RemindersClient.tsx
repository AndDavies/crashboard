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
import { CalendarIcon, Tag, ChevronDown, Check, Plus, Edit2, Pin, PinOff, Star } from 'lucide-react';
import { TagsInput } from '@/components/TagsInput';
import { cn } from "@/lib/utils";

// Define the colors with a type (new soft, primary colors)
type ColorKey = 'soft-blue' | 'soft-green' | 'soft-red' | 'soft-yellow' | 'soft-purple' | 'soft-gray';
const COLORS: Record<ColorKey, { hex: string; tailwindBg: string }> = {
  'soft-blue': { hex: '#A3BFFA', tailwindBg: 'bg-blue-200' },
  'soft-green': { hex: '#B5EAD7', tailwindBg: 'bg-green-200' },
  'soft-red': { hex: '#FF9AA2', tailwindBg: 'bg-red-200' },
  'soft-yellow': { hex: '#FFECB3', tailwindBg: 'bg-yellow-200' },
  'soft-purple': { hex: '#D6BCFA', tailwindBg: 'bg-purple-200' },
  'soft-gray': { hex: '#E2E8F0', tailwindBg: 'bg-gray-200' },
};

// Form schema (make title optional)
const reminderSchema = z.object({
  title: z.string().optional(),
  due_date: z.date().optional().nullable(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  category: z.enum(['need_to_do', 'want_to_do', 'reading_list']).optional().nullable(),
  energy_scale: z.number().min(1).max(10),
  color: z.enum(['soft-blue', 'soft-green', 'soft-red', 'soft-yellow', 'soft-purple', 'soft-gray']),
  is_open: z.boolean(),
  is_done: z.boolean(),
  is_pinned: z.boolean(),
});

type ReminderForm = z.infer<typeof reminderSchema>;

export type Reminder = {
  id: string;
  user_id: string;
  title: string;
  content: string | null;
  tags: string[];
  created_at: string;
  is_pinned: boolean;
  color: ColorKey;
  energy_scale: number;
  is_done: boolean;
  due_date: string | null;
  is_open: boolean;
  category: 'need_to_do' | 'want_to_do' | 'reading_list' | undefined | null;
};

export function RemindersClient({ initialReminders, userId }: { initialReminders: Reminder[]; userId: string }) {
  const [reminders, setReminders] = useState<Reminder[]>(initialReminders);
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null);
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
    if (a.is_pinned !== b.is_pinned) {
      return a.is_pinned ? -1 : 1;
    }
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
      color: 'soft-blue',
      is_open: true,
      is_done: false,
      is_pinned: false,
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
        is_pinned: selectedReminder.is_pinned,
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
        is_pinned: data.is_pinned || false,
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
        is_pinned: data.is_pinned,
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
        .update({ is_done: !reminder.is_done, is_open: reminder.is_done })
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

  const togglePin = async (reminder: Reminder) => {
    try {
      console.log('Toggling pin status for reminder:', reminder.id);
      const { data, error } = await supabase
        .from('reminders')
        .update({ is_pinned: !reminder.is_pinned })
        .eq('id', reminder.id)
        .select()
        .single();

      if (error) {
        console.error('Supabase toggle pin error:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        throw new Error(`Failed to update pin status: ${error.message}`);
      }

      console.log('Successfully toggled pin status:', data);
      toast.success(reminder.is_pinned ? 'Unpinned.' : 'Pinned.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update pin status';
      console.error('Error toggling pin status:', error);
      toast.error(errorMessage);
    }
  };

  // Keyboard shortcut for form submission (Cmd/Ctrl + Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isAddFormVisible && (e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        addForm.handleSubmit(onAddSubmit)();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [addForm, onAddSubmit, isAddFormVisible]);

  return (
    <div className="p-4 md:p-6 space-y-6 min-h-screen">
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
          <Card className="mb-6 shadow-sm">
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
                {/* More Options Collapsible */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-[240px] justify-start text-left font-normal",
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
                      onSelect={(date) => addForm.setValue('due_date', date || null)}
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
                    {['need_to_do', 'want_to_do', 'reading_list'].map((cat) => (
                      <Button
                        key={cat}
                        type="button"
                        size="sm"
                        variant={addForm.watch('category') === cat ? 'secondary' : 'outline'}
                        onClick={() => addForm.setValue('category', cat as any)}
                      >
                        {cat.replace('_', ' ')}
                      </Button>
                    ))}
                    {addForm.watch('category') && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => addForm.setValue('category', null)}
                        className="text-muted-foreground hover:text-foreground"
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
                          'w-6 h-6 rounded-full border-2 transition-all duration-150',
                          addForm.watch('color') === name ? 'border-foreground ring-2 ring-offset-2 ring-foreground' : 'border-muted'
                        )}
                        onClick={() => addForm.setValue('color', name as ColorKey)}
                        aria-label={`Select color ${name}`}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox
                    id="add-pinned"
                    checked={addForm.watch('is_pinned')}
                    onCheckedChange={(checked) => addForm.setValue('is_pinned', Boolean(checked))}
                  />
                  <Label htmlFor="add-pinned" className="text-sm font-medium">Pin this reminder</Label>
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
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Your Reminders</CardTitle>
          <CardDescription>
            {showCompleted ? 'Showing completed reminders.' : 'Showing open reminders.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]"></TableHead>
                <TableHead className="w-[50px]">Done</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="hidden md:table-cell">Due Date</TableHead>
                <TableHead className="hidden lg:table-cell">Category</TableHead>
                <TableHead className="hidden sm:table-cell w-[100px]">Energy</TableHead>
                <TableHead className="text-right w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReminders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No reminders found. {showCompleted ? '' : 'Add one above!'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredReminders.map((reminder) => (
                  <TableRow key={reminder.id} className={cn(reminder.is_done && 'opacity-60')}>
                    <TableCell className="w-[50px] text-center">
                      <Button variant="ghost" size="icon" className="w-6 h-6" onClick={(e) => { e.stopPropagation(); togglePin(reminder); }}>
                        {reminder.is_pinned ? <PinOff className="w-4 h-4 text-yellow-500" /> : <Pin className="w-4 h-4 text-muted-foreground hover:text-yellow-500" />}
                      </Button>
                    </TableCell>
                    <TableCell className="w-[50px]">
                      <Checkbox
                        checked={reminder.is_done}
                        onCheckedChange={() => toggleDone(reminder)}
                        aria-label="Mark as done"
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: COLORS[reminder.color]?.hex || COLORS['soft-gray'].hex }} />
                        <span>{reminder.title}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {reminder.due_date ? format(new Date(reminder.due_date), 'PP') : '--'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground capitalize">
                      {reminder.category?.replace('_', ' ') || '--'}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground w-[100px]">
                      <div className="flex items-center gap-1">
                        <Slider value={[reminder.energy_scale]} max={10} step={1} className="w-16 h-2 [&>span:first-child]:h-2" disabled />
                        <span className="text-xs w-4 text-right">{reminder.energy_scale}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right w-[80px]">
                      <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setSelectedReminder(reminder)}>
                        <Edit2 className="w-4 h-4" />
                        <span className="sr-only">Edit</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Reminder Dialog */}
      <Dialog open={!!selectedReminder} onOpenChange={(isOpen) => !isOpen && setSelectedReminder(null)}>
        <DialogContent className="sm:max-w-lg bg-background">
          {selectedReminder && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">Edit Reminder</DialogTitle>
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
                      onSelect={(date) => editForm.setValue('due_date', date || null)}
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
                  <Label className="text-sm font-medium mb-2 block">Category</Label>
                  <div className="flex flex-wrap gap-2">
                    {['need_to_do', 'want_to_do', 'reading_list'].map((cat) => (
                      <Button key={cat} type="button" size="sm" variant={editForm.watch('category') === cat ? 'secondary' : 'outline'} onClick={() => editForm.setValue('category', cat as any)}>
                        {cat.replace('_', ' ')}
                      </Button>
                    ))}
                    {editForm.watch('category') && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => editForm.setValue('category', null)} className="text-muted-foreground hover:text-foreground">Clear</Button>
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
                      <button key={name} type="button" style={{ backgroundColor: hex }} className={cn('w-6 h-6 rounded-full border-2 transition-all duration-150', editForm.watch('color') === name ? 'border-foreground ring-2 ring-offset-2 ring-foreground' : 'border-muted')} onClick={() => editForm.setValue('color', name as ColorKey)} aria-label={`Select color ${name}`} />
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 pt-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="edit-open" checked={editForm.watch('is_open')} onCheckedChange={(checked) => editForm.setValue('is_open', Boolean(checked))} />
                    <Label htmlFor="edit-open" className="text-sm">Open</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="edit-done" checked={editForm.watch('is_done')} onCheckedChange={(checked) => editForm.setValue('is_done', Boolean(checked))} />
                    <Label htmlFor="edit-done" className="text-sm">Done</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="edit-pinned" checked={editForm.watch('is_pinned')} onCheckedChange={(checked) => editForm.setValue('is_pinned', Boolean(checked))} />
                    <Label htmlFor="edit-pinned" className="text-sm">Pinned</Label>
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