import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, RefreshCw, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { analyzeStartup } from "@/lib/analyze.functions";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/projects/$id")({
  head: () => ({ meta: [{ title: "Project — VentureIQ AI" }] }),
  component: ProjectDetail,
});

type Analysis = {
  overall_score: number;
  summary: string;
  market_opportunity: { score: number; notes: string };
  feasibility: { score: number; notes: string };
  competition: { score: number; notes: string };
  monetization: { score: number; notes: string };
  risks: string[];
  next_steps: string[];
};

function ProjectDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const analyze = useServerFn(analyzeStartup);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const [{ data: project, error: pe }, { data: reports, error: re }] =
        await Promise.all([
          supabase.from("startup_projects").select("*").eq("id", id).single(),
          supabase
            .from("startup_reports")
            .select("*")
            .eq("project_id", id)
            .order("created_at", { ascending: false }),
        ]);
      if (pe) throw pe;
      if (re) throw re;
      return { project, reports: reports ?? [] };
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!data?.project) return null;
  const { project, reports } = data;
  const latest = reports[0];
  const analysis = latest?.analysis_json as Analysis | undefined;

  async function rerun() {
    setBusy(true);
    try {
      toast.loading("Re-analyzing…", { id: "re" });
      await analyze({
        data: {
          projectId: project.id,
          startup_name: project.startup_name,
          startup_idea: project.startup_idea,
          industry: project.industry,
          target_audience: project.target_audience,
          business_model: project.business_model,
        },
      });
      toast.success("Updated!", { id: "re" });
      qc.invalidateQueries({ queryKey: ["project", id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed", { id: "re" });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this project and all its reports?")) return;
    const { error } = await supabase.from("startup_projects").delete().eq("id", project.id);
    if (error) return toast.error(error.message);
    toast.success("Project deleted");
    qc.invalidateQueries();
    navigate({ to: "/projects" });
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link
        to="/projects"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Projects
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {project.startup_name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.industry || "—"} · {project.business_model || "—"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={rerun} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
            Re-analyze
          </Button>
          <Button variant="ghost" size="sm" onClick={remove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-soft">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          The idea
        </h2>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{project.startup_idea}</p>
        {project.target_audience && (
          <p className="mt-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Audience: </span>
            {project.target_audience}
          </p>
        )}
      </section>

      {!analysis ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-12 text-center">
          <Sparkles className="h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No analysis yet.</p>
          <Button onClick={rerun} disabled={busy} className="mt-3">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate"}
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-5 shadow-soft sm:col-span-1">
              <p className="text-xs text-muted-foreground">Overall score</p>
              <p className="mt-2 font-display text-5xl font-semibold text-gradient">
                {analysis.overall_score}
                <span className="text-xl text-muted-foreground">/100</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {latest && formatDistanceToNow(new Date(latest.created_at), { addSuffix: true })}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 shadow-soft sm:col-span-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Summary
              </p>
              <p className="mt-2 text-sm leading-relaxed">{analysis.summary}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <DimensionCard title="Market opportunity" data={analysis.market_opportunity} />
            <DimensionCard title="Feasibility" data={analysis.feasibility} />
            <DimensionCard title="Competition" data={analysis.competition} />
            <DimensionCard title="Monetization" data={analysis.monetization} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <ListCard title="Top risks" items={analysis.risks} tone="warn" />
            <ListCard title="Next steps" items={analysis.next_steps} tone="ok" />
          </div>
        </>
      )}
    </div>
  );
}

function DimensionCard({
  title,
  data,
}: {
  title: string;
  data: { score: number; notes: string };
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold">{title}</h3>
        <span className="inline-flex h-7 min-w-10 items-center justify-center rounded-md bg-primary/15 px-2 text-xs font-semibold text-primary">
          {data.score}
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${data.score}%` }} />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{data.notes}</p>
    </div>
  );
}

function ListCard({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "warn" | "ok";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
      <h3 className="font-display text-sm font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2">
        {items?.map((it, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed">
            <span
              className={[
                "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                tone === "warn" ? "bg-destructive" : "bg-primary",
              ].join(" ")}
            />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
