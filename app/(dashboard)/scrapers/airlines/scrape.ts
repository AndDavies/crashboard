// app/(dashboard)/scrapers/airlines/scrape.ts
'use server'; // Mark as server-only

import FireCrawlApp from '@mendable/firecrawl-js';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

// Define Firecrawl response types
interface ExtractResponse {
  data: {
    airline_policy: {
      airline_name?: string;
      airline_website?: string;
      phone_number?: string;
      pet_fees?: string;
      pet_weight_limit?: string;
      pet_carrier_requirements?: string;
      additional_notes?: string;
      pets_in_cabin_policy?: string;
      pets_in_checked_baggage_policy?: string;
      pets_in_cargo_policy?: string;
      carrier_guidelines?: string;
      other_restrictions?: string;
    };
  };
  success: boolean;
}

interface ErrorResponse {
  error: string;
  success: false;
}

// Schema for airline policy data
const schema = z.object({
  airline_policy: z.object({
    airline_name: z.string().optional(),
    airline_website: z.string().optional(),
    phone_number: z.string().optional(),
    pet_fees: z.string().optional(),
    pet_weight_limit: z.string().optional(),
    pet_carrier_requirements: z.string().optional(),
    additional_notes: z.string().optional(),
    pets_in_cabin_policy: z.string().optional(),
    pets_in_checked_baggage_policy: z.string().optional(),
    pets_in_cargo_policy: z.string().optional(),
    carrier_guidelines: z.string().optional(),
    other_restrictions: z.string().optional(),
  }),
});

export async function scrapeAirlinePolicies(): Promise<any[]> {
  console.log('Starting scrapeAirlinePolicies...');
  const app = new FireCrawlApp({ apiKey: 'fc-7f8067c125c945d5a293734007f28545' });
  const OUTPUT_DIR = path.join(process.cwd(), 'policies_downloaded');
  const OUTPUT_FILE = path.join(OUTPUT_DIR, 'airline_policies.json');
  const URLS_FILE = path.join(process.cwd(), 'app/(dashboard)/scrapers/airlines/urls.json');

  // Ensure output directory exists
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    console.log(`Created directory: ${OUTPUT_DIR}`);
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code !== 'EEXIST') {
      console.error(`Failed to create directory: ${error.message}`);
      throw error;
    }
  }

  // Load URLs
  let urls: string[];
  try {
    const urlsData = await fs.readFile(URLS_FILE, 'utf8');
    urls = JSON.parse(urlsData);
    console.log(`Loaded ${urls.length} URLs from ${URLS_FILE}`);
  } catch (error: unknown) {
    const err = error as Error;
    console.error(`Failed to load URLs: ${err.message}`);
    throw new Error('Failed to load URLs');
  }

  const policies: any[] = [];
  const startTime = Date.now();

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`Processing ${i + 1}/${urls.length}: ${url}`);

    try {
      const extractResult = (await app.extract([url], {
        prompt:
          "Extract the pet fees, pet weight limit, pet carrier requirements, and any additional notes related to the airline's pet policy. Extract the airline name, the link to the airline's website, phone number, the policy regarding pets in cabin, checked baggage, and cargo, carrier guidelines, and other restrictions, most of which are in a paragraph beneath an h2 header.",
        schema,
      })) as ExtractResponse | ErrorResponse;

      console.log(`Extracted data for ${url}:`, JSON.stringify(extractResult, null, 2));
      const result = extractResult.success && 'data' in extractResult && extractResult.data.airline_policy
        ? extractResult.data
        : { airline_policy: { airline_name: url.split('/').slice(-2, -1)[0], error: 'No data extracted' } };
      policies.push(result.airline_policy);
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`Error scraping ${url}: ${err.message}`);
      policies.push({ airline_name: url.split('/').slice(-2, -1)[0], error: err.message });
    }

    // Save incrementally
    try {
      await fs.writeFile(OUTPUT_FILE, JSON.stringify(policies, null, 2));
      console.log(`Saved ${policies.length} policies to ${OUTPUT_FILE}`);
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`Failed to save policies: ${err.message}`);
    }

    const delay = Math.random() * 10000 + 10000; // 10-20s
    if (i < urls.length - 1) {
      console.log(`Waiting ${delay / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  const endTime = Date.now();
  console.log(`Scraped ${policies.length} policies in ${(endTime - startTime) / 1000} seconds`);
  return policies;
}