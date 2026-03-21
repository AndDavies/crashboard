"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = { nextPath: string };

export function LoginForm({ nextPath }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<"password" | "magic" | null>(null);

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setPending("password");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setPending(null);
    if (error) {
      setMessage(error.message);
      return;
    }
    router.push(nextPath);
    router.refresh();
  }

  async function sendMagicLink() {
    setMessage(null);
    if (!email.trim()) {
      setMessage("Enter your email for a magic link.");
      return;
    }
    setPending("magic");
    const supabase = createClient();
    const origin = window.location.origin;
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    setPending(null);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Check your email for the sign-in link.");
  }

  return (
    <div className="mx-auto w-full max-w-sm space-y-6">
      <form onSubmit={signInWithPassword} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-foreground">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm text-foreground outline-none ring-foreground/20 focus:ring-2"
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor="password"
            className="text-sm font-medium text-foreground"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm text-foreground outline-none ring-foreground/20 focus:ring-2"
          />
        </div>
        <button
          type="submit"
          disabled={pending !== null}
          className="w-full rounded-full bg-foreground py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending === "password" ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <div className="relative text-center text-xs text-foreground/45">
        <span className="relative z-10 bg-background px-2">or</span>
        <span
          className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/10"
          aria-hidden
        />
      </div>
      <button
        type="button"
        onClick={sendMagicLink}
        disabled={pending !== null}
        className="w-full rounded-full border border-foreground/15 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-50"
      >
        {pending === "magic" ? "Sending link…" : "Email me a magic link"}
      </button>
      {message ? (
        <p className="text-center text-sm text-foreground/70">{message}</p>
      ) : null}
    </div>
  );
}
