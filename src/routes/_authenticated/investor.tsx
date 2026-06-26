import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Gauge, ArrowRight, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/investor")({
  head: () => ({ meta: [{ title: "Investor Readiness — VentureIQ AI" }] }),
  component: InvestorIndex,
});

function tier(score: number) {
  if (score >= 71) return { label: "Investor Ready", color: "text-emerald-600", bar: "bg-emerald-500" };
  if (score >= 41) return { label: "Moderate Readiness", color: "text-amber-600", bar: "bg-amber-500" };
  return { label: "High Risk", color: "text-rose-600", bar: "bg-rose-500" };
}

function InvestorIndex() {
  const { data, isLoading } = useQuery({
    queryKey: ["investor-index"],
    queryFn: async () => {
      const [{ data: projects }, { data: reports }] = await Promise.all([
        supabase.from("startup_projects").select("*").order("created_at", { ascending: false }),
        supabase.from("investor_readiness_reports").select("project_id, score, confidence, updated_at"),
      ]);
      const byId = new Map(
        (reports ?? []).map((r) => [r.project_id, r]),
      );
      return { projects: projects ?? [], byId };
    },
  });

  return (
    <div className="mx-auto box-border w-full min-w-0 max-w-6xl px-4 py-8 md:px-8">
      <div className="mb-8 flex flex-col gap-2">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
          <Sparkles className="h-3 w-3 text-primary" /> Premium investor analysis
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Investor Readiness</h1>
        <p className="text-sm text-muted-foreground">
          Evaluate funding readiness, surface investor concerns, and generate an improvement plan for each startup.
        </p>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading projects…</div>
      ) : !data?.projects.length ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
          <Gauge className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <div className="font-medium">No projects yet</div>
          <p className="mb-4 text-sm text-muted-foreground">Create a startup project first, then run an investor readiness check.</p>
          <Link to="/projects/new" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Create project <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.projects.map((p) => {
            const r = data.byId.get(p.id);
            const score = r?.score ?? 0;
            const t = tier(score);
            return (
              <Link
                key={p.id}
                to="/investor/$id"
                params={{ id: p.id }}
                className="group relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card/70 p-5 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold">{p.startup_name}</div>
                    <div className="truncate text-xs text-muted-foreground">{p.industry || "—"}</div>
                  </div>
                  <Gauge className="h-5 w-5 shrink-0 text-primary opacity-70" />
                </div>

                {r ? (
                  <>
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-4xl font-black tabular-nums">{score}</div>
                        <div className={`text-xs font-semibold ${t.color}`}>{t.label}</div>
                      </div>
                      <div className="text-right text-[10px] uppercase tracking-wide text-muted-foreground">
                        Confidence<br />
                        <span className="text-foreground">{r.confidence}</span>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div className={`h-2 rounded-full ${t.bar}`} style={{ width: `${score}%` }} />
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-background/60 p-3 text-xs text-muted-foreground">
                    Not assessed yet — open the project to run readiness.
                  </div>
                )}

                <div className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  Open report <ArrowRight className="h-3 w-3" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
