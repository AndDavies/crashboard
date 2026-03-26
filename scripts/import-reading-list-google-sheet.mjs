#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { PDFParse } from 'pdf-parse';
import { YoutubeTranscript } from 'youtube-transcript/dist/youtube-transcript.esm.js';

const WORKDIR = process.cwd();
const ENV_PATH = path.join(WORKDIR, '.env.local');
const FETCH_TIMEOUT_MS = Number(process.env.READING_LIST_FETCH_TIMEOUT_MS || '20000');
const DELAY_MS = Number(process.env.READING_LIST_DELAY_MS || '250');
const START = Number(process.env.READING_LIST_START || '1');
const END = Number(process.env.READING_LIST_END || '999999');
const DRY_RUN = /^(1|true|yes)$/i.test(process.env.READING_LIST_DRY_RUN || '');
const OUT_PATH = process.env.READING_LIST_OUT_PATH || path.join(WORKDIR, 'tmp', 'reading-list-google-sheet-import-results.json');

function loadDotEnv(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[key] = value;
  }
  return env;
}

function required(value, name) {
  if (!value) throw new Error(`Missing required value: ${name}`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function normalizeText(text) {
  return String(text || '')
    .replace(/\u0000/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    if (char !== '\r') cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = rows[0].map((v) => v.trim());
  return rows.slice(1).filter((r) => r.some((v) => v && v.trim())).map((r) => {
    const out = {};
    headers.forEach((header, idx) => {
      out[header] = r[idx] ?? '';
    });
    return out;
  });
}

function resolveSheetCsvUrl(input) {
  if (!input) return null;
  if (input.includes('/export?') || input.includes('output=csv') || input.endsWith('.csv')) return input;
  const url = new URL(input);
  if (!url.hostname.includes('docs.google.com') || !url.pathname.includes('/spreadsheets/')) return input;
  const gid = url.searchParams.get('gid') || '0';
  const parts = url.pathname.split('/');
  const dIndex = parts.findIndex((part) => part === 'd');
  const sheetId = dIndex >= 0 ? parts[dIndex + 1] : null;
  if (!sheetId) throw new Error(`Could not determine Google Sheet id from ${input}`);
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

async function timedFetch(url, init = {}) {
  const signal = init.signal || AbortSignal.timeout(FETCH_TIMEOUT_MS);
  return fetch(url, { ...init, signal, redirect: 'follow' });
}

async function fetchJson(url, init) {
  const response = await timedFetch(url, init);
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON from ${url}: ${error?.message || error}`);
  }
}

function parseJsonArrayFile(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`Expected JSON array in ${filePath}`);
  return parsed;
}

async function loadItems(env) {
  const jsonPath = process.env.READING_LIST_JSON_PATH || env.READING_LIST_JSON_PATH;
  if (jsonPath) {
    return {
      items: parseJsonArrayFile(jsonPath),
      sourceLabel: 'reviewed_links_json',
      sourcePath: jsonPath,
    };
  }

  const csvPath = env.READING_LIST_CSV_PATH || process.env.READING_LIST_CSV_PATH;
  if (csvPath) {
    return {
      items: parseCsv(fs.readFileSync(csvPath, 'utf8')),
      sourceLabel: 'sheet_csv',
      sourcePath: csvPath,
    };
  }

  const csvUrl = resolveSheetCsvUrl(
    process.env.READING_LIST_CSV_URL || env.READING_LIST_CSV_URL || process.env.READING_LIST_SHEET_URL || env.READING_LIST_SHEET_URL,
  );
  if (!csvUrl) throw new Error('Provide READING_LIST_JSON_PATH, READING_LIST_CSV_PATH, READING_LIST_CSV_URL, or READING_LIST_SHEET_URL');
  const res = await timedFetch(csvUrl, { headers: { accept: 'text/csv,text/plain;q=0.9,*/*;q=0.8' } });
  if (!res.ok) throw new Error(`Failed to fetch sheet CSV (${res.status})`);
  return {
    items: parseCsv(await res.text()),
    sourceLabel: 'sheet_csv_url',
    sourcePath: csvUrl,
  };
}

function firstPresent(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function getRowUrl(row) {
  return firstPresent(row, ['clean_url', 'URL', 'Url', 'url', 'Link']);
}

function getRowIndex(row, fallbackIndex) {
  return firstPresent(row, ['Reading List Row', 'reading_list_row', 'row']) || String(fallbackIndex);
}

function isApprovedRow(row) {
  const status = firstPresent(row, ['review_status', 'Review Status', 'status']);
  return !status || status === 'approved_layer_a' || status === 'approved';
}

function classifyUrl(url) {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const pathname = parsed.pathname.toLowerCase();
  if (host === 'youtu.be' || host.endsWith('youtube.com')) return 'youtube_video';
  if (host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com') || host.endsWith('.twitter.com')) return 'x_post';
  if (isGoogleDrivePdfUrl(url)) return 'drive_pdf';
  if (pathname.endsWith('.pdf') || pathname.includes('.pdf?')) return 'pdf';
  return 'article';
}

function extractGoogleDriveFileId(url) {
  const parsed = new URL(url);
  const idParam = parsed.searchParams.get('id');
  if (idParam) return idParam;
  const match = parsed.pathname.match(/\/file\/d\/([^/]+)/) || parsed.pathname.match(/\/document\/d\/([^/]+)/);
  return match?.[1] || null;
}

function isGoogleDrivePdfUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes('drive.google.com') && !host.includes('docs.google.com')) return false;
    return !!extractGoogleDriveFileId(url) || parsed.searchParams.get('export') === 'download';
  } catch {
    return false;
  }
}

function buildDriveUrls(url) {
  const fileId = extractGoogleDriveFileId(url);
  if (!fileId) throw new Error(`Could not determine Google Drive file id from ${url}`);
  return {
    fileId,
    openUrl: `https://drive.google.com/file/d/${fileId}/view`,
    downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
  };
}

function buildImportMetadata(row, index, inputSource) {
  return {
    sheet_import_source: 'google_sheet_reading_list',
    import_input_source: inputSource.sourceLabel,
    import_input_path: inputSource.sourcePath,
    import_batch_label: process.env.READING_LIST_BATCH_LABEL || path.basename(inputSource.sourcePath || inputSource.sourceLabel),
    sheet_row: getRowIndex(row, index),
    clean_url: firstPresent(row, ['clean_url', 'URL', 'url']),
    source_domain: firstPresent(row, ['Domain', 'domain']),
    source_type_hint: firstPresent(row, ['Type', 'type']),
    review_status: firstPresent(row, ['review_status', 'Review Status']),
    ingestion_scope: firstPresent(row, ['ingestion_scope']),
    special_flags: firstPresent(row, ['special_flags']),
    first_source_type: firstPresent(row, ['First Source Type', 'first_source_type']),
    first_source_title: firstPresent(row, ['First Source Title', 'first_source_title']),
    first_source_id: firstPresent(row, ['First Source ID', 'first_source_id']),
    source_occurrences: firstPresent(row, ['Occurrences', 'occurrences']),
  };
}

function buildCaptureBlock(row, index) {
  const sheetRow = getRowIndex(row, index);
  return {
    capture_source: 'import',
    sender_label: 'google-sheet-import',
    raw_text: `Google Sheet reading-list import row ${sheetRow}`,
    metadata: {
      import_batch: firstPresent(row, ['ingestion_scope']) || 'google_sheet_reading_list',
    },
  };
}

function buildStructuredBody(document, row, index) {
  return {
    kind: 'structured',
    document,
    capture: buildCaptureBlock(row, index),
    related_urls: [],
  };
}

async function extractPdfDocument(url, row, index, inputSource, existingResponse = null) {
  const isDrivePdf = isGoogleDrivePdfUrl(url);
  const drive = isDrivePdf ? buildDriveUrls(url) : null;
  const fetchUrl = drive?.downloadUrl || url;
  const response = existingResponse || (await timedFetch(fetchUrl, {
    headers: {
      'user-agent': 'Mozilla/5.0',
      accept: 'application/pdf,*/*;q=0.8',
    },
  }));
  if (!response.ok) throw new Error(`PDF download failed (${response.status})`);
  const finalUrl = response.url || fetchUrl;
  const bytes = Buffer.from(await response.arrayBuffer());
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  let textResult;
  try {
    textResult = await parser.getText();
  } finally {
    await parser.destroy();
  }

  const text = normalizeText(textResult?.text || '');
  if (!text) throw new Error('No text extracted from PDF');

  const title = firstPresent(row, ['First Source Title', 'Title', 'title'])
    || decodeURIComponent((finalUrl.split('/').pop() || 'PDF').replace(/\.pdf$/i, ''));
  const metadata = {
    ...buildImportMetadata(row, index, inputSource),
    ...(drive
      ? {
          drive_file_id: drive.fileId,
          drive_open_url: drive.openUrl,
          drive_download_url: drive.downloadUrl,
        }
      : {}),
    pdf_source_url: finalUrl,
  };

  return {
    source_type: 'pdf',
    original_url: drive?.openUrl || url,
    canonical_url: drive?.openUrl || finalUrl,
    title,
    publisher_name: drive ? 'Google Drive' : new URL(url).hostname.replace(/^www\./, ''),
    content_text: text,
    summary_short: text.slice(0, 600),
    content_hash: sha256(text),
    extraction_method: drive ? 'reading-list.google-drive-pdf' : 'reading-list.pdf-parse',
    extraction_version: '2026-03-26',
    metadata,
    quality_flags: {},
  };
}

async function extractArticleDocument(url, row, index, inputSource) {
  const response = await timedFetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36',
      accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/pdf')) {
    return extractPdfDocument(url, row, index, inputSource, response);
  }

  const html = await response.text();
  const finalUrl = response.url || url;
  const dom = new JSDOM(html, { url: finalUrl });
  const doc = dom.window.document;
  const article = new Readability(doc).parse();
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || finalUrl;
  const title = article?.title || doc.querySelector('title')?.textContent || firstPresent(row, ['First Source Title', 'Title', 'title']) || finalUrl;
  const publisher = doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content') || new URL(finalUrl).hostname.replace(/^www\./, '');
  const author = doc.querySelector('meta[name="author"]')?.getAttribute('content') || doc.querySelector('meta[property="article:author"]')?.getAttribute('content') || null;
  const publishedAt = doc.querySelector('meta[property="article:published_time"]')?.getAttribute('content') || doc.querySelector('time[datetime]')?.getAttribute('datetime') || null;
  const text = normalizeText(article?.textContent || doc.body?.textContent || '');
  if (!text) throw new Error('No readable text extracted from article');

  return {
    source_type: 'article',
    original_url: url,
    canonical_url: canonical,
    title: normalizeText(title),
    author_name: author ? normalizeText(author) : null,
    publisher_name: publisher ? normalizeText(publisher) : null,
    language: doc.documentElement.lang || null,
    published_at: publishedAt,
    content_text: text,
    summary_short: text.slice(0, 600),
    content_hash: sha256(text),
    extraction_method: 'reading-list.readability',
    extraction_version: '2026-03-26',
    metadata: buildImportMetadata(row, index, inputSource),
    quality_flags: { readability: !!article },
  };
}

function getYouTubeVideoId(inputUrl) {
  const url = new URL(inputUrl);
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (host === 'youtu.be') return url.pathname.slice(1) || null;
  if (host.endsWith('youtube.com')) {
    if (url.pathname === '/watch') return url.searchParams.get('v');
    const shorts = url.pathname.match(/^\/shorts\/([^/?#]+)/);
    if (shorts) return shorts[1];
    const embed = url.pathname.match(/^\/embed\/([^/?#]+)/);
    if (embed) return embed[1];
  }
  return null;
}

function canonicalYouTubeUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

async function extractYouTubeDocument(url, row, index, inputSource) {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) throw new Error('Could not determine YouTube video id');
  const meta = await fetchJson(`https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalYouTubeUrl(videoId))}&format=json`);
  const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
  const transcriptText = normalizeText(transcriptItems.map((item) => item.text).join('\n'));
  if (!transcriptText) throw new Error('Transcript unavailable for YouTube video');

  return {
    source_type: 'youtube_video',
    original_url: url,
    canonical_url: canonicalYouTubeUrl(videoId),
    title: meta.title || canonicalYouTubeUrl(videoId),
    publisher_name: meta.author_name || 'YouTube',
    transcript_text: transcriptText,
    summary_short: transcriptText.slice(0, 600),
    content_hash: sha256(transcriptText),
    extraction_method: 'reading-list.youtube-transcript',
    extraction_version: '2026-03-26',
    metadata: {
      ...buildImportMetadata(row, index, inputSource),
      video_id: videoId,
      channel_name: meta.author_name || null,
      transcript_source: 'youtube-transcript',
    },
    quality_flags: { transcript_complete: transcriptItems.length > 0 },
  };
}

function getTweetId(url) {
  const parsed = new URL(url);
  const match = parsed.pathname.match(/\/status\/(\d+)/);
  return match ? match[1] : null;
}

function stripHtml(html) {
  return normalizeText(String(html || '').replace(/<blockquote[^>]*>/gi, '').replace(/<\/blockquote>/gi, '').replace(/<[^>]+>/g, ' '));
}

async function extractXDocument(url, row, index, inputSource) {
  const tweetId = getTweetId(url);
  if (!tweetId) throw new Error('Could not determine X/Twitter status id');

  try {
    const tweet = await fetchJson(`https://syndication.twitter.com/tweet-result?id=${encodeURIComponent(tweetId)}&token=x`);
    const rawText = tweet?.note_tweet?.text || tweet?.text || '';
    const text = normalizeText(rawText);
    if (!text) throw new Error('Missing tweet text');
    return {
      source_type: 'x_post',
      original_url: url,
      canonical_url: url,
      title: normalizeText(text.slice(0, 180)),
      author_name: tweet?.user?.name || null,
      publisher_name: 'X',
      language: tweet?.lang || null,
      published_at: tweet?.created_at || null,
      content_text: text,
      summary_short: text.slice(0, 600),
      content_hash: sha256(text),
      extraction_method: 'reading-list.twitter-syndication',
      extraction_version: '2026-03-26',
      metadata: {
        ...buildImportMetadata(row, index, inputSource),
        platform: 'x',
        tweet_id: tweetId,
        author_handle: tweet?.user?.screen_name || null,
        extraction_mode: 'public_syndication',
      },
      quality_flags: { thread_expanded: false },
    };
  } catch {
    const oembed = await fetchJson(`https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(url)}`);
    const text = stripHtml(oembed.html || '');
    if (!text) throw new Error('Could not extract X post text');
    return {
      source_type: 'x_post',
      original_url: url,
      canonical_url: url,
      title: normalizeText(text.slice(0, 180)),
      author_name: oembed.author_name || null,
      publisher_name: 'X',
      content_text: text,
      summary_short: text.slice(0, 600),
      content_hash: sha256(text),
      extraction_method: 'reading-list.twitter-oembed',
      extraction_version: '2026-03-26',
      metadata: {
        ...buildImportMetadata(row, index, inputSource),
        platform: 'x',
        tweet_id: tweetId,
        extraction_mode: 'public_oembed',
      },
      quality_flags: { thread_expanded: false, partial: true },
    };
  }
}

async function buildStructuredPayload(url, row, index, inputSource) {
  const kind = classifyUrl(url);
  let document;
  if (kind === 'drive_pdf' || kind === 'pdf') {
    document = await extractPdfDocument(url, row, index, inputSource);
  } else if (kind === 'youtube_video') {
    document = await extractYouTubeDocument(url, row, index, inputSource);
  } else if (kind === 'x_post') {
    document = await extractXDocument(url, row, index, inputSource);
  } else {
    document = await extractArticleDocument(url, row, index, inputSource);
  }
  return { kind, body: buildStructuredBody(document, row, index) };
}

async function postJson(url, secret, body) {
  const response = await timedFetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) throw new Error(`${url} failed (${response.status}): ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  const env = { ...loadDotEnv(ENV_PATH), ...process.env };
  const siteUrl = required(env.NEXT_PUBLIC_SITE_URL || env.SITE_URL || env.APP_URL, 'NEXT_PUBLIC_SITE_URL');
  const secret = required(env.OPENCLAW_INGESTION_SECRET, 'OPENCLAW_INGESTION_SECRET');
  const structuredEndpoint = new URL('/api/ingestion/openclaw/structured', siteUrl).toString();

  const loaded = await loadItems(env);
  const allItems = loaded.items;
  const approvedRows = allItems.filter((row) => isApprovedRow(row) && getRowUrl(row));
  const sliced = approvedRows.slice(Math.max(0, START - 1), Math.min(approvedRows.length, END));

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  const results = fs.existsSync(OUT_PATH) ? JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')) : [];
  const done = new Set(results.map((item) => `${item.index}:${item.url}`));

  for (let localIndex = 0; localIndex < sliced.length; localIndex += 1) {
    const index = START + localIndex;
    const row = sliced[localIndex];
    const url = getRowUrl(row);
    if (!url) continue;
    const dedupeKey = `${index}:${url}`;
    if (done.has(dedupeKey)) continue;

    const startedAt = new Date().toISOString();
    try {
      const { kind, body } = await buildStructuredPayload(url, row, index, loaded);
      const response = DRY_RUN ? { dryRun: true, endpoint: structuredEndpoint, kind } : await postJson(structuredEndpoint, secret, body);
      results.push({ index, url, kind, startedAt, ok: true, response });
    } catch (error) {
      results.push({ index, url, startedAt, ok: false, error: String(error?.message || error) });
    }

    done.add(dedupeKey);
    fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ index, total: approvedRows.length, url, ok: results.at(-1).ok }, null, 2));
    await sleep(DELAY_MS);
  }

  const summary = {
    inputSource: loaded.sourceLabel,
    inputPath: loaded.sourcePath,
    totalRows: allItems.length,
    approvedRows: approvedRows.length,
    attemptedRows: sliced.length,
    ok: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    dryRun: DRY_RUN,
    outPath: OUT_PATH,
  };
  console.log(JSON.stringify({ done: true, summary }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, fatal: String(error?.message || error) }, null, 2));
  process.exit(1);
});
