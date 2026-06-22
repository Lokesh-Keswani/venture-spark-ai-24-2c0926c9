import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — VentureIQ AI" },
      { name: "description", content: "Sign in to VentureIQ AI with Google." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard", replace: true });
  }, [user, loading, navigate]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-hero px-4 py-10">
      <div className="grid-bg absolute inset-0 opacity-30" aria-hidden />
      <div className="relative w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-glow">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="font-display text-lg font-semibold">VentureIQ AI</span>
        </Link>

        <div className="rounded-2xl border border-border bg-card/80 p-8 shadow-soft backdrop-blur">
          <h1 className="text-center font-display text-2xl font-semibold tracking-tight">
            Meet your AI co-founder
          </h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Sign in with Google to validate ideas, generate pitch decks, and ship a roadmap.
          </p>

          <div className="mt-7">
            <GoogleButton />
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By continuing you agree to our terms and privacy policy.
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleButton() {
  const [busy, setBusy] = useState(false);
  async function onClick() {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/dashboard",
      });
      if (result.error) {
        toast.error(result.error.message ?? "Google sign-in failed");
        setBusy(false);
        return;
      }
      if (result.redirected) return;
      window.location.href = "/dashboard";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Google sign-in failed");
      setBusy(false);
    }
  }
  return (
    <Button type="button" size="lg" className="w-full shadow-glow" onClick={onClick} disabled={busy}>
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <GoogleIcon /> Continue with Google
        </>
      )}
    </Button>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" className="mr-2">
      <path
        fill="currentColor"
        d="M12 11v3.2h7.4c-.3 1.9-2.2 5.5-7.4 5.5-4.4 0-8-3.7-8-8.2S7.6 3.3 12 3.3c2.5 0 4.2 1.1 5.2 2l3.5-3.4C18.5.8 15.5-.5 12-.5 5.4-.5 0 4.9 0 11.5S5.4 23.5 12 23.5c6.9 0 11.5-4.9 11.5-11.7 0-.8-.1-1.4-.2-2H12z"
      />
    </svg>
  );
}
