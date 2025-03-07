"use client";

import { useState, useEffect } from "react";

// Define the shape of a log entry
interface LogEntry {
  date: string;
  runtime_seconds: number;
  logos_downloaded: string[];
  skipped: { src: string; alt: string }[]; // Add skipped field
}

export default function ScrapeLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch logs on mount
  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const res = await fetch("/api/get-logs");
      const data = await res.json();
      setLogs(data as LogEntry[]);
    } catch (error) {
      console.error("Error fetching logs:", error);
    }
  };

  const runScraper = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/run-scraper", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await fetchLogs();
    } catch (error) {
      console.error("Error running scraper:", error);
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1>Airline Logo Scraper</h1>
      
      <button
        onClick={runScraper}
        disabled={loading}
        style={{ padding: "10px 20px", marginBottom: "20px" }}
      >
        {loading ? "Running..." : "Run Scraper"}
      </button>

      <h2>Scrape Logs</h2>
      {logs.length === 0 ? (
        <p>No scrape runs yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {logs.map((log, index) => (
            <li key={index} style={{ marginBottom: "20px", borderBottom: "1px solid #ccc" }}>
              <p><strong>Date:</strong> {new Date(log.date).toLocaleString()}</p>
              <p><strong>Runtime:</strong> {log.runtime_seconds.toFixed(2)} seconds</p>
              <p><strong>Logos Downloaded:</strong> {log.logos_downloaded.length}</p>
              <ul style={{ paddingLeft: "20px" }}>
                {log.logos_downloaded.map((logo: string, i: number) => (
                  <li key={i}>{logo}</li>
                ))}
              </ul>
              <p><strong>Skipped Entries:</strong> {log.skipped.length}</p>
              {log.skipped.length > 0 && (
                <ul style={{ paddingLeft: "20px" }}>
                  {log.skipped.map((entry, i) => (
                    <li key={i}>{`URL: ${entry.src}, Alt: ${entry.alt}`}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2>Information & Documentation</h2>
      <h3>Virtual Environment Setup</h3>
      <pre style={{ background: "#f4f4f4", padding: "10px", borderRadius: "5px" }}>
        {`# Create the virtual environment
python3 -m venv .venv

# Activate the virtual environment
source .venv/bin/activate

# Install required packages
pip install requests beautifulsoup4 cloudscraper

# Deactivate when done (optional)
deactivate`}
      </pre>

      <h3>Running the Script</h3>
      <pre style={{ background: "#f4f4f4", padding: "10px", borderRadius: "5px" }}>
        {`# Activate the virtual environment
source .venv/bin/activate

# Navigate to the script folder
cd app/scrapers/logo

# Run the script
python3 airline_loggers.py`}
      </pre>
    </div>
  );
}