"use client";

import React from "react";
import { useRouter } from "next/navigation";
import BlogEditor from "@/components/BlogEditor";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function CreatePage() {
  const router = useRouter();

  const handleSaveComplete = () => {
    router.push("/dashboard/blog");
  };

  return (
    <div className="w-full p-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-bold">Create New Post</h1>
        <Button variant="outline" asChild>
          <Link href="/dashboard/blog">Back to Blog</Link>
        </Button>
      </div>
      <BlogEditor onSaveComplete={handleSaveComplete} />
    </div>
  );
}