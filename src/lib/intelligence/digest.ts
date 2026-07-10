import type { SupabaseClient } from "@supabase/supabase-js";
import { sendGmailMessage } from "@/lib/intelligence/gmail";
import {
  getGmailSource,
  gmailAccessTokenForSource,
} from "@/lib/intelligence/jobs";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function digestDate(anchor = new Date()) {
  return anchor.toLocaleDateString("en-CA", { timeZone: "America/Halifax" });
}

export async function createAndSendIntelligenceDigest(
  admin: SupabaseClient,
  ownerId: string,
  anchor = new Date(),
) {
  const date = digestDate(anchor);
  const since = new Date(anchor);
  since.setUTCDate(since.getUTCDate() - 1);

  const [alertsResult, trendsResult, eventsResult] = await Promise.all([
    admin
      .from("intelligence_alerts")
      .select("id,severity,title,summary,created_at")
      .eq("owner_id", ownerId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(12),
    admin
      .from("intelligence_trend_snapshots")
      .select("trend_label,trend_strength,momentum,event_count,independent_source_count,period_end")
      .eq("owner_id", ownerId)
      .order("period_end", { ascending: false })
      .order("trend_strength", { ascending: false })
      .limit(8),
    admin
      .from("intelligence_events")
      .select("id,title,event_type,summary,announced_at,defence_relevance,canada_allied_relevance")
      .eq("owner_id", ownerId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  for (const result of [alertsResult, trendsResult, eventsResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const alerts = alertsResult.data ?? [];
  const trends = trendsResult.data ?? [];
  const events = eventsResult.data ?? [];
  const subject = `Trend Intelligence · ${date}`;
  const textLines = [
    subject,
    "",
    alerts.length ? "Alerts" : "No new alerts in the last 24 hours.",
    ...alerts.map((alert) => `- ${alert.title}: ${alert.summary}`),
    "",
    "Top trend movements",
    ...trends.map(
      (trend) =>
        `- ${trend.trend_label}: strength ${Math.round(Number(trend.trend_strength))}, ${trend.event_count} events, ${trend.independent_source_count} sources`,
    ),
    "",
    "New evidence-backed events",
    ...events.map((event) => `- ${event.title}: ${event.summary}`),
    "",
    `${baseUrl}/dashboard/intelligence`,
  ];
  const text = textLines.join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f7f6f1;color:#171719;font-family:Arial,sans-serif"><main style="max-width:680px;margin:0 auto;padding:36px 24px"><div style="height:6px;width:92px;background:#2457d6;margin-bottom:28px"></div><p style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#666">Crashboard intelligence</p><h1 style="font-family:Georgia,serif;font-size:32px;line-height:1.05;margin:8px 0 24px">${escapeHtml(subject)}</h1><h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.08em;border-top:1px solid #222;padding-top:16px">Alerts</h2>${
    alerts.length
      ? alerts
          .map(
            (alert) => `<article style="border-top:1px solid #d6d4cc;padding:14px 0"><strong>${escapeHtml(alert.title)}</strong><p style="line-height:1.55;color:#555">${escapeHtml(alert.summary)}</p></article>`,
          )
          .join("")
      : '<p style="color:#666">No new alerts in the last 24 hours.</p>'
  }<h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.08em;border-top:1px solid #222;padding-top:16px;margin-top:28px">Top trend movements</h2>${trends
    .map(
      (trend) => `<article style="display:flex;justify-content:space-between;gap:20px;border-top:1px solid #d6d4cc;padding:12px 0"><span>${escapeHtml(String(trend.trend_label))}</span><strong>${Math.round(Number(trend.trend_strength))}/100</strong></article>`,
    )
    .join("")}<h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.08em;border-top:1px solid #222;padding-top:16px;margin-top:28px">New events</h2>${events
    .map(
      (event) => `<article style="border-top:1px solid #d6d4cc;padding:14px 0"><strong>${escapeHtml(event.title)}</strong><p style="line-height:1.55;color:#555">${escapeHtml(event.summary)}</p></article>`,
    )
    .join("")}<a href="${baseUrl}/dashboard/intelligence" style="display:inline-block;margin-top:28px;background:#171719;color:#fff;padding:12px 16px;text-decoration:none">Open intelligence workbench</a></main></body></html>`;

  const source = await getGmailSource(admin, ownerId);
  if (!source) throw new Error("Connect Gmail before sending the intelligence digest.");
  const { accessToken, email } = await gmailAccessTokenForSource(source);
  const to = process.env.INTELLIGENCE_DIGEST_TO?.trim() || email;
  if (!to) throw new Error("INTELLIGENCE_DIGEST_TO is not configured and Gmail email is unavailable.");

  const digest = await admin
    .from("intelligence_digests")
    .upsert(
      {
        owner_id: ownerId,
        digest_date: date,
        status: "draft",
        subject,
        content_html: html,
        content_text: text,
        alert_ids: alerts.map((alert) => alert.id),
      },
      { onConflict: "owner_id,digest_date" },
    )
    .select("id")
    .single();
  if (digest.error) throw new Error(digest.error.message);

  try {
    const sent = await sendGmailMessage(accessToken, { to, subject, text, html });
    const updated = await admin
      .from("intelligence_digests")
      .update({ status: "sent", gmail_message_id: sent.id, sent_at: new Date().toISOString() })
      .eq("id", digest.data.id);
    if (updated.error) throw new Error(updated.error.message);
    return { digestId: String(digest.data.id), gmailMessageId: sent.id, to };
  } catch (error) {
    await admin
      .from("intelligence_digests")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Digest send failed.",
      })
      .eq("id", digest.data.id);
    throw error;
  }
}
