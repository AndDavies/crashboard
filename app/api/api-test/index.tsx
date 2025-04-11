'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ApiRedirect() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/dashboard/api-test');
  }, [router]);
  
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="text-center p-6 bg-white dark:bg-slate-800 rounded-lg shadow-md">
        <h1 className="text-xl font-bold mb-4">Redirecting to API Dashboard...</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          The API test dashboard is located at <code>/dashboard/api-test</code>.
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-500">
          You will be redirected automatically. If not, <a href="/dashboard/api-test" className="text-blue-500 hover:underline">click here</a>.
        </p>
      </div>
    </div>
  );
} 