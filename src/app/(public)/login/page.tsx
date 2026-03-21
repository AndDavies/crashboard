import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in · Crashboard",
  description: "Sign in to your Crashboard dashboard.",
};

type Props = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const { next, error } = await searchParams;
  const nextPath = next?.startsWith("/") ? next : "/dashboard";

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8">
      <div className="space-y-2 text-center sm:text-left">
        <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-foreground/65">
          Access your personal dashboard. Configure Supabase Auth and env vars
          to enable sign-in.
        </p>
      </div>
      {error === "auth" ? (
        <p className="rounded-lg border border-foreground/15 bg-foreground/5 px-3 py-2 text-center text-sm text-foreground/80">
          Something went wrong confirming your session. Try again.
        </p>
      ) : null}
      <LoginForm nextPath={nextPath} />
    </div>
  );
}
