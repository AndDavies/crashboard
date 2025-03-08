// app/(dashboard)/scrapers/airlines/page.tsx
'use client';

import { useState } from 'react';
import { scrapeAirlinePolicies } from './scrape';

export default function ScrapeAirlinesPage() {
  const [status, setStatus] = useState('Idle');
  const [results, setResults] = useState<any[] | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const handleScrape = async () => {
    setStatus('Scraping...');
    setLog(prev => [...prev, 'Started scraping process...']);
    try {
      const scrapedPolicies = await scrapeAirlinePolicies();
      setResults(scrapedPolicies);
      setStatus('Completed');
      setLog(prev => [
        ...prev,
        'Scraping completed successfully.',
        `Results saved to: <a href="/policies_downloaded/airline_policies.json" target="_blank" class="text-blue-500 underline">airline_policies.json</a>`,
      ]);
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`Scraping failed: ${err.message}`);
      setStatus(`Error: ${err.message}`);
      setLog(prev => [...prev, `Scraping failed: ${err.message}`]);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">Airline Policy Scraper</h1>

        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <button
            onClick={handleScrape}
            disabled={status === 'Scraping...'}
            className={`w-full py-3 px-4 rounded-md text-white font-semibold transition-colors duration-200 ${
              status === 'Scraping...'
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {status === 'Scraping...' ? 'Scraping...' : 'Start Scraping'}
          </button>

          <div className="mt-4">
            <h2 className="text-lg font-medium text-gray-700">Status</h2>
            <p className={`mt-2 ${status === 'Completed' ? 'text-green-600' : status.startsWith('Error') ? 'text-red-600' : 'text-gray-600'}`}>
              {status}
            </p>
          </div>
        </div>

        <div className="bg-white shadow-md rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-700 mb-4">Log</h2>
          <div className="text-gray-600 space-y-2">
            {log.length === 0 ? (
              <p>No activity yet.</p>
            ) : (
              log.map((entry, index) => (
                <p key={index} dangerouslySetInnerHTML={{ __html: entry }} />
              ))
            )}
          </div>
        </div>

        {results && (
          <div className="mt-6 bg-white shadow-md rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-700 mb-4">Results Preview</h2>
            <pre className="bg-gray-50 p-4 rounded-md text-sm text-gray-800 overflow-auto max-h-96">
              {JSON.stringify(results, null, 2)}
            </pre>
          </div>
        )}

        <div className="mt-6 text-gray-600">
          <h3 className="text-lg font-medium">Instructions</h3>
          <p>Ensure <code>urls.json</code> is in <code>app/(dashboard)/scrapers/airlines/</code>.</p>
          <p>Results are saved to <code>policies_downloaded/airline_policies.json</code>.</p>
        </div>
      </div>
    </div>
  );
}