// components/TagInput.tsx
"use client";

import React, { useEffect, useState } from "react";
import CreatableSelect from "react-select/creatable";
import { supabaseBlog } from '@/utils/supabase/supabaseBlogClient';
import { ActionMeta, MultiValue } from "react-select";

export interface TagOption {
  value: string;
  label: string;
}

interface TagInputProps {
  value: TagOption[];
  onChange: (value: TagOption[]) => void;
}

const TagInput: React.FC<TagInputProps> = ({ value, onChange }) => {
  const [allTags, setAllTags] = useState<TagOption[]>([]);

  useEffect(() => {
    async function fetchTags() {
      const { data, error } = await supabaseBlog.from("blog_posts").select("tags");
      if (!error && data) {
        const tagSet = new Set<string>();
        data.forEach((post: any) => {
          if (post.tags && Array.isArray(post.tags)) {
            post.tags.forEach((tag: string) => tagSet.add(tag));
          }
        });
        const options = Array.from(tagSet).map((tag) => ({ value: tag, label: tag }));
        setAllTags(options);
      }
    }
    fetchTags();
  }, []);

  return (
    <CreatableSelect
      instanceId="tag-input" // Fixed instanceId for stable ID generation
      isMulti
      options={allTags}
      value={value}
      onChange={(
        newValue: MultiValue<TagOption>,
        _actionMeta: ActionMeta<TagOption>
      ) => {
        onChange(Array.isArray(newValue) ? [...newValue] : []);
      }}
      placeholder="Select or create tags..."
    />
  );
};

export default TagInput;
