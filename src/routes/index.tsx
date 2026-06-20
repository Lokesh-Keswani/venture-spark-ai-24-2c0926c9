import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import {
  Sparkles,
  BarChart3,
  Target,
  ShieldCheck,
  Moon,
  Sun,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VentureIQ AI — Validate startup ideas with AI" },
      {
        name: "description",
        content:
          "Get a candid, scored analysis of any startup idea. Market, feasibility, competition, monetization — in seconds.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user } = useAuth();
  const { theme, toggle } = useTheme();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <LogoMark />
            <span className="font-display text-base font-semibold tracking-tight">
              VentureIQ <span className="text-muted-foreground">AI</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {user ? (
              <Button asChild size="sm">
                <Link to="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/auth" search={{ mode: "login" }}>
                    Log in
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/auth" search={{ mode: "signup" }}>
                    Get started
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-hero">
        <div className="grid-bg absolute inset-0 opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-4xl px-4 pb-24 pt-20 text-center sm:px-6 sm:pt-28">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground shadow-soft">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Powered by Lovable AI
          </div>
          <h1 className="mt-6 font-display text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Validate your next startup,
            <br />
            <span className="text-gradient">in under a minute.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
            VentureIQ AI scores your idea across market, feasibility, competition,
            and monetization — and tells you exactly what to do next.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="shadow-glow">
              <Link to="/auth" search={{ mode: "signup" }}>
                Analyze an idea <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/auth" search={{ mode: "login" }}>
                I have an account
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            A second opinion that doesn't sleep.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Built for founders who want a structured gut-check before they ship.
          </p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-border bg-card p-6 shadow-soft transition hover:-translate-y-0.5 hover:shadow-glow"
            >
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-muted/40">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
          <h2 className="font-display text-3xl font-semibold tracking-tight">
            Ready to pressure-test your idea?
          </h2>
          <p className="mt-3 text-muted-foreground">
            Free to start. No credit card required.
          </p>
          <Button asChild size="lg" className="mt-6 shadow-glow">
            <Link to="/auth" search={{ mode: "signup" }}>
              Create your account
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6 text-xs text-muted-foreground sm:px-6">
          <span>© {new Date().getFullYear()} VentureIQ AI</span>
          <span>Made with Lovable</span>
        </div>
      </footer>
    </div>
  );
}

function LogoMark() {
  return (
    <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-glow">
      <Sparkles className="h-3.5 w-3.5" />
    </span>
  );
}

const features = [
  {
    icon: BarChart3,
    title: "Quantified scoring",
    body: "A clear 0–100 score across four dimensions, so you can compare ideas fairly.",
  },
  {
    icon: Target,
    title: "Audience clarity",
    body: "Pinpoint who you're really serving and how to reach them.",
  },
  {
    icon: ShieldCheck,
    title: "Risk surfacing",
    body: "Honest about competition, distribution risk, and pricing pitfalls.",
  },
  {
    icon: Sparkles,
    title: "Actionable next steps",
    body: "Walk away with the four moves that matter this week.",
  },
  {
    icon: BarChart3,
    title: "Saved analyses",
    body: "Every report saved to your dashboard, ready to revisit and iterate.",
  },
  {
    icon: Target,
    title: "Linear-clean UI",
    body: "Calm, fast, distraction-free. Built for thinking work.",
  },
];
