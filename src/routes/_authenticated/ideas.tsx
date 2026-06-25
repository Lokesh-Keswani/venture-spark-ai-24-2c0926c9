import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  Boxes,
  Building2,
  CircleDollarSign,
  Loader2,
  Plus,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { generateIdeas, type GeneratedIdea } from "@/lib/ideas.functions";
import { analyzeStartup } from "@/lib/analyze.functions";

export const Route = createFileRoute("/_authenticated/ideas")({
  head: () => ({ meta: [{ title: "Idea Generator — VentureIQ AI" }] }),
  component: IdeasPage,
});

type Category = "saas" | "ai" | "micro-saas" | "marketplace" | "consumer" | "fintech" | "custom";

const CATEGORIES: Array<{
  id: Category;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "saas", label: "B2B SaaS", desc: "Operational tools for teams", icon: Boxes },
  { id: "ai", label: "AI startup", desc: "LLM-native, agentic, or vision", icon: Bot },
  { id: "micro-saas", label: "Micro-SaaS", desc: "Solo-founder scale, fast to ship", icon: Zap },
  { id: "marketplace", label: "Marketplace", desc: "Two-sided or vertical SaaS", icon: ShoppingBag },
  { id: "consumer", label: "Consumer", desc: "Retention + viral mechanics", icon: Smartphone },
  { id: "fintech", label: "Fintech", desc: "Embedded finance, payments", icon: CircleDollarSign },
];

function IdeasPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const gen = useServerFn(generateIdeas);
  const analyze = useServerFn(analyzeStartup);

  const [category, setCategory] = useState<Category>("saas");
  const [customPrompt, setCustomPrompt] = useState("");
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [ideas, setIdeas] = useState<GeneratedIdea[]>([]);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);

  async function onGenerate() {
    setBusy(true);
    setIdeas([]);
    try {
      const res = await gen({
        data: {
          category,
          count,
          customPrompt: category === "custom" ? customPrompt : null,
        },
      });
      setIdeas(res.ideas);
      if (res.ideas.length === 0) toast.error("No ideas returned — try again.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate ideas.");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveAndAnalyze(idea: GeneratedIdea, idx: number) {
    if (!user) return;
    setSavingIdx(idx);
    try {
      const { data: project, error } = await supabase
        .from("startup_projects")
        .insert({
          user_id: user.id,
          startup_name: idea.name,
          startup_idea: `${idea.tagline}\n\nProblem: ${idea.problem}\nSolution: ${idea.solution}`,
          industry: idea.industry,
          target_audience: idea.target_audience,
          business_model: idea.business_model,
        })
        .select("id")
        .single();
      if (error) throw error;

      toast.loading("Running AI analysis…", { id: "analyze" });
      await analyze({
        data: {
          projectId: project.id,
          startup_name: idea.name,
          startup_idea: `${idea.tagline}\n\nProblem: ${idea.problem}\nSolution: ${idea.solution}`,
          industry: idea.industry,
          target_audience: idea.target_audience,
          business_model: idea.business_model,
        },
      });
      toast.success("Analysis ready!", { id: "analyze" });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
      navigate({ to: "/projects/$id", params: { id: project.id } });
    } catch (e) {
      toast.dismiss("analyze");
      toast.error(e instanceof Error ? e.message : "Failed to save idea.");
    } finally {
      setSavingIdx(null);
    }
  }

  return (
    <div className="mx-auto box-border w-full min-w-0 max-w-6xl px-3 py-6 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            AI Idea Generator
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a category and let the co-founder brainstorm fundable startup ideas for you.
          </p>
        </div>
      </div>

      {/* Category picker */}
      <div className="mt-6 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
        {CATEGORIES.map((c) => {
          const active = category === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={[
                "group rounded-xl border p-3 text-left transition-all",
                "backdrop-blur",
                active
                  ? "border-primary/60 bg-primary/10 shadow-glow"
                  : "border-border/60 bg-card/50 hover:border-primary/30 hover:bg-card",
              ].join(" ")}
            >
              <div className="flex items-center gap-2">
                <span
                  className={[
                    "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                    active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
                  ].join(" ")}
                >
                  <c.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{c.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.desc}</p>
                </div>
              </div>
            </button>
          );
        })}
        <button
          onClick={() => setCategory("custom")}
          className={[
            "group rounded-xl border p-3 text-left transition-all backdrop-blur",
            category === "custom"
              ? "border-primary/60 bg-primary/10 shadow-glow"
              : "border-dashed border-border/60 bg-card/50 hover:border-primary/30 hover:bg-card",
          ].join(" ")}
        >
          <div className="flex items-center gap-2">
            <span
              className={[
                "inline-flex h-8 w-8 items-center justify-center rounded-lg",
                category === "custom"
                  ? "bg-primary text-primary-foreground"
                  : "bg-primary/10 text-primary",
              ].join(" ")}
            >
              <Wand2 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Custom brief</p>
              <p className="truncate text-xs text-muted-foreground">
                Describe a niche, industry, or wedge
              </p>
            </div>
          </div>
        </button>
      </div>

      {/* Controls */}
      <Card className="mt-4 border-border/60 bg-card/60 backdrop-blur">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div className="min-w-0">
            <Label htmlFor="brief" className="text-xs">
              {category === "custom" ? "Your brief" : "Optional context (industry, ICP, constraints)"}
            </Label>
            <Input
              id="brief"
              placeholder={
                category === "custom"
                  ? "e.g. AI tools for dental clinics in the US"
                  : "e.g. Targeting LATAM, low CAC, mobile-first"
              }
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="count" className="text-xs">
              Count
            </Label>
            <Input
              id="count"
              type="number"
              min={1}
              max={8}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
              className="mt-1 w-20"
            />
          </div>
          <Button onClick={onGenerate} disabled={busy} className="shadow-glow">
            {busy ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-4 w-4" />
            )}
            Generate
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      <div className="mt-6">
        {busy && ideas.length === 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: count }).map((_, i) => (
              <div
                key={i}
                className="h-48 animate-pulse rounded-xl border border-border/60 bg-card/40"
              />
            ))}
          </div>
        )}

        {!busy && ideas.length === 0 && (
          <Card className="border-dashed border-border/60 bg-card/40 backdrop-blur">
            <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium">No ideas yet</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Choose a category above and hit Generate. Save promising ideas as projects in one click.
              </p>
            </CardContent>
          </Card>
        )}

        {ideas.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {ideas.map((idea, i) => (
              <IdeaCard
                key={i}
                idea={idea}
                saving={savingIdx === i}
                onSave={() => onSaveAndAnalyze(idea, i)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function IdeaCard({
  idea,
  saving,
  onSave,
}: {
  idea: GeneratedIdea;
  saving: boolean;
  onSave: () => void;
}) {
  const diffTone =
    idea.difficulty === "easy"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : idea.difficulty === "medium"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : "bg-rose-500/15 text-rose-600 dark:text-rose-400";

  return (
    <Card className="group flex flex-col overflow-hidden border-border/60 bg-card/60 backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-glow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{idea.name}</CardTitle>
            <CardDescription className="line-clamp-2">{idea.tagline}</CardDescription>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="inline-flex items-center justify-center rounded-md bg-primary/10 px-2 py-0.5 text-sm font-semibold text-primary">
              {idea.potential_score}
            </span>
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${diffTone}`}>
              {idea.difficulty}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-2 pb-3">
        <Row label="Problem" value={idea.problem} />
        <Row label="Solution" value={idea.solution} />
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Badge variant="secondary" className="font-normal">
            {idea.industry}
          </Badge>
          <Badge variant="outline" className="font-normal">
            {idea.target_audience}
          </Badge>
          <Badge variant="outline" className="font-normal">
            {idea.monetization}
          </Badge>
        </div>
      </CardContent>
      <CardFooter className="border-t border-border/40 bg-background/30 p-3">
        <Button onClick={onSave} disabled={saving} size="sm" className="w-full">
          {saving ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-1.5 h-4 w-4" />
          )}
          Save & analyze
        </Button>
      </CardFooter>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="line-clamp-3 text-sm">{value}</p>
    </div>
  );
}
