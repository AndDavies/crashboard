import { Metadata } from 'next';
import ApiTestClient from './ApiTestClient';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'API Diagnostics',
  description: 'Test and diagnose API connections for the application',
};

// Simple error component as a fallback
function ApiTestErrorDisplay({ message }: { message: string }) {
  return (
    <div className="p-8 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
      <h2 className="text-xl font-semibold text-red-800 dark:text-red-300 mb-4">
        API Test Error
      </h2>
      <p className="text-red-700 dark:text-red-400 mb-4">
        There was an error loading the API diagnostics tool:
      </p>
      <pre className="bg-white dark:bg-slate-800 p-4 rounded overflow-auto text-sm">
        {message}
      </pre>
      <p className="mt-4 text-gray-700 dark:text-gray-300">
        Please refresh the page or contact support if the issue persists.
      </p>
    </div>
  );
}

export default async function ApiTestPage() {
  // Ensure user is authenticated
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      redirect('/login');
    }

    return (
      <div className="container mx-auto max-w-6xl">
        <div className="py-8">
          <ApiTestClient />
        </div>
      </div>
    );
  } catch (error) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'An unknown error occurred while loading the API diagnostics tool';
    
    return (
      <div className="container mx-auto max-w-6xl">
        <div className="py-8">
          <ApiTestErrorDisplay message={errorMessage} />
        </div>
      </div>
    );
  }
}
