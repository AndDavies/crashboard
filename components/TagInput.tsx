import React, { useEffect, useState } from "react";
import CreatableSelect from "react-select";
import { supabaseBlog } from '@/utils/supabase/supabaseBlogClient';
import { ActionMeta, MultiValue } from "react-select";

export interface TagOption {
  value: string;
  label: string;
}

interface TagInputProps {
  value: TagOption[];
  onChange: (tags: TagOption[]) => void;
}

const TagInput: React.FC<TagInputProps> = ({ value, onChange }) => {
  const [options, setOptions] = useState<TagOption[]>([]);

  useEffect(() => {
    async function fetchTags() {
      const { data } = await supabaseBlog.from('blog_posts').select('tags');
      if (data) {
        const allTags = data.flatMap((post: { tags: string[] }) => post.tags || []);
        const uniqueTags = Array.from(new Set(allTags)).map(tag => ({ value: tag, label: tag }));
        setOptions(uniqueTags);
      }
    }
    fetchTags();
  }, []);

  const handleChange = (newValue: MultiValue<TagOption>, actionMeta: ActionMeta<TagOption>) => {
    onChange(newValue ? Array.from(newValue) : []);
  };

  return (
    <CreatableSelect
      isMulti
      options={options}
      value={value}
      onChange={handleChange}
      placeholder="Select or create tags"
    />
  );
};

export default TagInput;