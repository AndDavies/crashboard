"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Watchlist = {
  id: string;
  name: string;
  description: string;
  rules: Record<string, unknown>;
  enabled: boolean;
};

export function OperationsControls({ watchlists }: { watchlists: Watchlist[] }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function createWatchlist(formData: FormData) {
    setBusy(true);
    setMessage(null);
    const terms = String(formData.get("terms") ?? "")
      .split(",")
      .map((term) => term.trim())
      .filter(Boolean);
    const response = await fetch("/api/intelligence/watchlists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
        rules: {
          terms,
          eventTypes: [],
          minimumStrength: Number(formData.get("minimumStrength") ?? 65),
          defenceOnly: formData.get("defenceOnly") === "on",
          canadaAlliedOnly: formData.get("canadaAlliedOnly") === "on",
        },
      }),
    });
    const result = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setMessage(result.error ?? "Could not create watchlist.");
      return;
    }
    window.location.reload();
  }

  async function deleteWatchlist(id: string) {
    setBusy(true);
    const response = await fetch(`/api/intelligence/watchlists?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (response.ok) window.location.reload();
    else setMessage("Could not delete watchlist.");
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
      <form action={createWatchlist} className="border border-border bg-card p-4">
        <p className="editorial-kicker">New watchlist</p>
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5"><Label htmlFor="name">Name</Label><Input id="name" name="name" required placeholder="Canadian autonomous systems" /></div>
          <div className="space-y-1.5"><Label htmlFor="terms">Terms, comma separated</Label><Input id="terms" name="terms" required placeholder="autonomy, drone, uncrewed, canada" /></div>
          <div className="space-y-1.5"><Label htmlFor="description">Purpose</Label><Input id="description" name="description" placeholder="Watch procurement, trials, and industrial movement" /></div>
          <div className="space-y-1.5">
            <Label htmlFor="minimumStrength">Notify me when evidence is</Label>
            <select id="minimumStrength" name="minimumStrength" defaultValue="65" className="flex h-9 w-full border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50">
              <option value="80">Strong only</option>
              <option value="65">Moderate or stronger</option>
              <option value="50">Include early signals</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="defenceOnly" className="size-4" /> Defence &amp; Security lens only</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="canadaAlliedOnly" className="size-4" /> Canada &amp; Allies lens only</label>
          <Button type="submit" disabled={busy}><Plus className="size-4" /> Add watchlist</Button>
          {message ? <p className="text-sm text-destructive">{message}</p> : null}
        </div>
      </form>
      <div className="border-x border-b border-border">
        {watchlists.length ? watchlists.map((watchlist) => {
          const rules = watchlist.rules ?? {};
          const terms = Array.isArray(rules.terms) ? rules.terms.join(", ") : "No terms";
          const minimum = Number(rules.minimumStrength ?? 65);
          const evidenceLabel = minimum >= 80 ? "Strong only" : minimum >= 65 ? "Moderate or stronger" : "Includes early signals";
          return (
            <div key={watchlist.id} className="border-t border-border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div><h3 className="font-heading text-lg font-semibold">{watchlist.name}</h3><p className="mt-1 text-sm text-muted-foreground">{watchlist.description}</p></div>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${watchlist.name}`} disabled={busy} onClick={() => deleteWatchlist(watchlist.id)}><Trash2 className="size-4" /></Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground"><span>{terms}</span><span>{evidenceLabel}</span>{rules.defenceOnly ? <span>Defence &amp; Security only</span> : null}{rules.canadaAlliedOnly ? <span>Canada &amp; Allies only</span> : null}</div>
            </div>
          );
        }) : <div className="border-t border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">No saved watchlists yet.</div>}
      </div>
    </div>
  );
}
