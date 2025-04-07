// components/TagsInput.tsx
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

// Define the props type for TagsInput
type TagsInputProps = {
  value: string[];
  onChange: (tags: string[]) => void;
  className?: string; // Add className prop
  placeholder?: string; // Add placeholder prop
};

export function TagsInput({ value, onChange, className, placeholder }: TagsInputProps) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      onChange([...value, inputValue.trim()]);
      setInputValue('');
    }
  };

  const removeTag = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className={className}>
      <Input
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || "Type a tag and press Enter"} // Use the placeholder prop
      />
      <div className="flex flex-wrap gap-2 mt-2">
        {value.map((tag, index) => (
          <span
            key={index}
            className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-800 text-sm rounded-full"
          >
            {tag}
            <Button
              variant="ghost"
              size="sm"
              className="ml-1 w-5 h-5 p-0"
              onClick={() => removeTag(index)}
            >
              <X className="w-3 h-3" />
            </Button>
          </span>
        ))}
      </div>
    </div>
  );
}