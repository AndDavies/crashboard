'use client';

import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export default function ApiTestNotFound() {
  const router = useRouter();
  
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="text-center p-6 bg-white dark:bg-slate-800 rounded-lg shadow-md max-w-md">
        <h1 className="text-xl font-bold mb-4">API Test Endpoint Not Found</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          The API test endpoint you're looking for doesn't exist. Please use the dashboard to run API diagnostics.
        </p>
        <Button 
          onClick={() => router.push('/dashboard/api-test')}
          className="w-full"
        >
          Go to API Dashboard
        </Button>
      </div>
    </div>
  );
} 