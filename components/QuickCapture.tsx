"use client";

import { useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger 
} from "@/components/ui/accordion";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

export default function QuickCapture({
  onAddReminder,
}: {
  onAddReminder: (reminder: Omit<Reminder, "id" | "created_at" | "is_archived" | "is_done">) => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [needToDo, setNeedToDo] = useState(false);
  const [wantToDo, setWantToDo] = useState(false);
  const [readingList, setReadingList] = useState(false);
  const [energy, setEnergy] = useState<number | null>(null);
  const [color, setColor] = useState("soft-blue");
  const [accordionValue, setAccordionValue] = useState<string>("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  
  const handleAddReminder = () => {
    // Allow empty title as it can be generated via OpenAI API
    onAddReminder({
      title,
      content: content || null,
      color,
      tags,
      is_pinned: false,
      need_to_do: needToDo,
      want_to_do: wantToDo,
      reading_list: readingList,
      energy_scale: energy,
    });
    
    // Reset form
    setTitle("");
    setContent("");
    setNeedToDo(false);
    setWantToDo(false);
    setReadingList(false);
    setEnergy(null);
    setColor("soft-blue");
    setTags([]);
    setTagInput("");
    
    // Close the accordion after adding
    setAccordionValue("");
  };
  
  const handleAddTag = () => {
    if (tagInput.trim() === "") return;
    
    // Add the tag if it's not already in the list
    if (!tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
    }
    
    // Clear the input
    setTagInput("");
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };
  
  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };
  
  const colors = [
    { name: "soft-blue", bg: "bg-blue-100 dark:bg-blue-900", border: "border-blue-300 dark:border-blue-800" },
    { name: "soft-green", bg: "bg-green-100 dark:bg-green-900", border: "border-green-300 dark:border-green-800" },
    { name: "soft-yellow", bg: "bg-yellow-100 dark:bg-yellow-900", border: "border-yellow-300 dark:border-yellow-800" },
    { name: "soft-purple", bg: "bg-purple-100 dark:bg-purple-900", border: "border-purple-300 dark:border-purple-800" },
    { name: "soft-pink", bg: "bg-pink-100 dark:bg-pink-900", border: "border-pink-300 dark:border-pink-800" },
    { name: "soft-gray", bg: "bg-gray-100 dark:bg-gray-800", border: "border-gray-300 dark:border-gray-700" },
  ];

  const initialFormState = {
    title: "",
    content: "",
    tags: [] as string[],
    is_pinned: false,
    color: "soft-blue",
    need_to_do: false,
    want_to_do: false,
    reading_list: false,
    energy_scale: 3,
  };

  return (
    <Accordion 
      type="single" 
      collapsible 
      className="mb-4"
      value={accordionValue}
      onValueChange={setAccordionValue}
    >
      <AccordionItem value="add-reminder" className="border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
        <AccordionTrigger className="px-4 py-3 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 hover:from-blue-50 hover:to-blue-100 dark:hover:from-blue-950 dark:hover:to-blue-900 hover:no-underline rounded-t-lg font-medium">
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <span>Add a new reminder</span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-0 pb-0">
          <Card className="w-full bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border-0 shadow-none rounded-t-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Add a Reminder</CardTitle>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Capture thoughts, tasks, or ideas you want to remember. Classify them by importance and energy level.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter a title for your reminder (or leave empty for AI generation)"
                  className="border-gray-300 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Leave empty to generate a title from URL or content automatically.
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="content">Details & Tags</Label>
                <div className="flex flex-col gap-2">
                  <Textarea
                    id="content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Add any additional details or notes"
                    className="border-gray-300 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500 min-h-[100px]"
                  />
                  
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center space-x-2">
                      <Input 
                        placeholder="Add tags..."
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="flex-grow"
                      />
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        onClick={handleAddTag}
                      >
                        Add
                      </Button>
                    </div>
                    
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {tags.map(tag => (
                          <Badge 
                            key={tag} 
                            variant="secondary"
                            className="flex items-center gap-1 px-2 py-1"
                          >
                            {tag}
                            <X 
                              className="h-3 w-3 cursor-pointer" 
                              onClick={() => removeTag(tag)}
                            />
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <div>
                  <Label className="mb-2 block">Classification</Label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      type="button"
                      variant={needToDo ? "default" : "outline"}
                      size="lg"
                      onClick={() => setNeedToDo(!needToDo)}
                      className={`flex-1 relative font-medium ${
                        needToDo 
                          ? "bg-red-100 text-red-800 border-red-300 hover:bg-red-200 dark:bg-red-900 dark:text-red-100 dark:border-red-800 dark:hover:bg-red-800" 
                          : "hover:bg-red-50 hover:text-red-700 hover:border-red-200 dark:hover:bg-red-950 dark:hover:text-red-200 dark:hover:border-red-800"
                      } transition-colors duration-200`}
                    >
                      <span className="mr-2">🔴</span> Need to do
                      <div className="text-xs font-normal mt-1 opacity-80">Tasks you must complete</div>
                    </Button>
                    
                    <Button
                      type="button"
                      variant={wantToDo ? "default" : "outline"}
                      size="lg"
                      onClick={() => setWantToDo(!wantToDo)}
                      className={`flex-1 relative font-medium ${
                        wantToDo 
                          ? "bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200 dark:bg-purple-900 dark:text-purple-100 dark:border-purple-800 dark:hover:bg-purple-800" 
                          : "hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200 dark:hover:bg-purple-950 dark:hover:text-purple-200 dark:hover:border-purple-800"
                      } transition-colors duration-200`}
                    >
                      <span className="mr-2">💜</span> Want to do
                      <div className="text-xs font-normal mt-1 opacity-80">Things you'd enjoy doing</div>
                    </Button>
                    
                    <Button
                      type="button"
                      variant={readingList ? "default" : "outline"}
                      size="lg"
                      onClick={() => setReadingList(!readingList)}
                      className={`flex-1 relative font-medium ${
                        readingList 
                          ? "bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-100 dark:border-blue-800 dark:hover:bg-blue-800" 
                          : "hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 dark:hover:bg-blue-950 dark:hover:text-blue-200 dark:hover:border-blue-800"
                      } transition-colors duration-200`}
                    >
                      <span className="mr-2">📚</span> Reading List
                      <div className="text-xs font-normal mt-1 opacity-80">Articles and content to read</div>
                    </Button>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <div>
                  <Label className="flex items-center justify-between mb-2">
                    <span>Energy Required {energy !== null && <span className="text-sm text-gray-500 dark:text-gray-400">({energy}/10)</span>}</span>
                    {energy !== null && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 text-xs" 
                        onClick={() => setEnergy(null)}
                      >
                        Clear
                      </Button>
                    )}
                  </Label>
                  <div className="px-1 pt-2 pb-6">
                    <Slider
                      defaultValue={[5]}
                      max={10}
                      step={1}
                      value={energy !== null ? [energy] : [5]}
                      onValueChange={(values) => setEnergy(values[0])}
                      className={energy !== null ? "opacity-100" : "opacity-70"}
                      onClick={() => {
                        if (energy === null) setEnergy(5);
                      }}
                    />
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-2">
                      <span>Low energy</span>
                      <span>High energy</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                      Slide to indicate how much energy this task requires. This helps you choose tasks based on your current energy level.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex flex-wrap gap-2">
                  {colors.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      className={`w-8 h-8 rounded-full ${c.bg} ${c.border} border-2 transition-all ${
                        color === c.name ? "ring-2 ring-blue-500 dark:ring-blue-400 ring-offset-2 dark:ring-offset-gray-900" : ""
                      }`}
                      onClick={() => setColor(c.name)}
                      aria-label={`Select ${c.name} color`}
                    />
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter className="pb-4">
              <Button
                onClick={handleAddReminder}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium py-2 shadow-md hover:shadow-lg transition-all dark:from-blue-600 dark:to-blue-700 dark:hover:from-blue-500 dark:hover:to-blue-600"
              >
                Add Reminder
              </Button>
            </CardFooter>
          </Card>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}