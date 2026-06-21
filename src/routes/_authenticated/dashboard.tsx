import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  FileText,
  FolderKanban,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — VentureIQ AI" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const name = (user?.user_metadata?.full_name as string) ?? user?.email ?? "there";

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [projects, reports] = await Promise.all([
        supabase
          .from("startup_projects")
          .select("id, startup_name, industry, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("startup_reports")
          .select("id, project_id, score, summary, created_at")
          .order("created_at", { ascending: false }),
      ]);
      if (projects.error) throw projects.error;
      if (reports.error) throw reports.error;
      return { projects: projects.data ?? [], reports: reports.data ?? [] };
    },
  });

  const projects = data?.projects ?? [];
  const reports = data?.reports ?? [];
  const avgScore =
    reports.length === 0
      ? null
      : Math.round(reports.reduce((s, r) => s + (r.score ?? 0), 0) / reports.length);

  return (
    <div className="mx-auto box-border w-full min-w-0 max-w-6xl overflow-hidden px-3 py-6 sm:px-6 sm:py-8 lg:py-10">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Hi, {name.toString().split(" ")[0]}
          </h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            Here's what's happening across your ventures.
          </p>
        </div>
        <Button asChild className="w-full shadow-glow sm:w-auto">
          <Link to="/projects/new">
            <Sparkles className="mr-1.5 h-4 w-4" /> New analysis
          </Link>
        </Button>
      </div>

      <div className="mt-6 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 sm:mt-8 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={FolderKanban}
          label="Total projects"
          value={isLoading ? "…" : projects.length.toString()}
        />
        <Stat
          icon={FileText}
          label="Total reports"
          value={isLoading ? "…" : reports.length.toString()}
        />
        <Stat
          icon={TrendingUp}
          label="Avg. score"
          value={isLoading ? "…" : avgScore === null ? "—" : `${avgScore}/100`}
        />
        <Stat
          icon={Sparkles}
          label="This week"
          value={
            isLoading
              ? "…"
              : reports
                  .filter(
                    (r) =>
                      Date.now() - new Date(r.created_at).getTime() <
                      7 * 24 * 3600 * 1000,
                  )
                  .length.toString()
          }
        />
      </div>

      <div className="mt-6 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 sm:mt-8 lg:grid-cols-3 lg:gap-6">
        <section className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-card p-4 shadow-soft sm:p-5 lg:col-span-2">
          <div className="mb-4 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <h2 className="truncate font-display text-lg font-semibold">Recent activity</h2>
            <Link to="/projects" className="text-xs text-muted-foreground hover:text-foreground">
              View all
            </Link>
          </div>
          {reports.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="min-w-0 divide-y divide-border">
              {reports.slice(0, 6).map((r) => {
                const proj = projects.find((p) => p.id === r.project_id);
                return (
                  <li key={r.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                    <ScorePill score={r.score ?? 0} />
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/projects/$id"
                        params={{ id: r.project_id }}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {proj?.startup_name ?? "Untitled project"}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{r.summary}</p>
                    </div>
                    <span className="hidden text-xs text-muted-foreground sm:block">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-card p-4 shadow-soft sm:p-5">
          <h2 className="mb-4 truncate font-display text-lg font-semibold">Score overview</h2>
          {reports.length === 0 ? (
            <p className="text-sm text-muted-foreground">No analyses yet.</p>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-4xl font-semibold text-gradient">
                  {avgScore}
                </span>
                <span className="text-sm text-muted-foreground">/ 100 avg</span>
              </div>
              <div className="mt-4 min-w-0 space-y-2">
                {reports.slice(0, 5).map((r) => (
                  <div key={r.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_2.25rem] items-center gap-3">
                    <div className="h-1.5 min-w-0 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${r.score ?? 0}%` }}
                      />
                    </div>
                    <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                      {r.score ?? 0}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <section className="mt-5 w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-card p-4 shadow-soft sm:mt-6 sm:p-5">
        <div className="mb-4 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <h2 className="truncate font-display text-lg font-semibold">Saved analyses</h2>
          <Button asChild size="sm" variant="ghost" className="shrink-0">
            <Link to="/projects">
              Open all <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
        {projects.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.slice(0, 6).map((p) => {
              const r = reports.find((x) => x.project_id === p.id);
              return (
                <Link
                  key={p.id}
                  to="/projects/$id"
                  params={{ id: p.id }}
                  className="group min-w-0 overflow-hidden rounded-lg border border-border bg-background p-4 transition hover:border-primary/40 hover:shadow-soft"
                >
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                    <h3 className="truncate font-medium">{p.startup_name}</h3>
                    {r && <ScorePill score={r.score ?? 0} small />}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {p.industry || "—"}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate text-xs">{label}</span>
      </div>
      <div className="mt-2 truncate font-display text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function ScorePill({ score, small }: { score: number; small?: boolean }) {
  const tone =
    score >= 75
      ? "bg-primary/15 text-primary"
      : score >= 50
        ? "bg-accent text-accent-foreground"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center justify-center rounded-md font-semibold tabular-nums",
        small ? "h-5 px-1.5 text-[10px]" : "h-7 w-10 text-xs",
        tone,
      ].join(" ")}
    >
      {score}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-10 text-center">
      <Sparkles className="h-6 w-6 text-muted-foreground" />
      <p className="mt-2 text-sm text-muted-foreground">No analyses yet.</p>
      <Button asChild size="sm" className="mt-3">
        <Link to="/projects/new">Run your first analysis</Link>
      </Button>
    </div>
  );
}
