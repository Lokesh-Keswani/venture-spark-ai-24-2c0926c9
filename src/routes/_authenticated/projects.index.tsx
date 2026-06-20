import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({ meta: [{ title: "Projects — VentureIQ AI" }] }),
  component: ProjectsList,
});

function ProjectsList() {
  const { data, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data: projects, error } = await supabase
        .from("startup_projects")
        .select("id, startup_name, industry, business_model, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const { data: reports } = await supabase
        .from("startup_reports")
        .select("project_id, score, created_at")
        .order("created_at", { ascending: false });
      return { projects: projects ?? [], reports: reports ?? [] };
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Projects
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every startup idea you've analyzed.
          </p>
        </div>
        <Button asChild className="shadow-glow">
          <Link to="/projects/new">
            <Plus className="mr-1.5 h-4 w-4" /> New project
          </Link>
        </Button>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (data?.projects.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 font-display text-lg font-semibold">No projects yet</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Drop in an idea and we'll generate a structured analysis in seconds.
            </p>
            <Button asChild className="mt-4">
              <Link to="/projects/new">Run your first analysis</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data!.projects.map((p) => {
              const r = data!.reports.find((x) => x.project_id === p.id);
              return (
                <Link
                  key={p.id}
                  to="/projects/$id"
                  params={{ id: p.id }}
                  className="group rounded-xl border border-border bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-glow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="truncate font-display text-base font-semibold">
                      {p.startup_name}
                    </h3>
                    {r && (
                      <span className="inline-flex h-7 min-w-10 items-center justify-center rounded-md bg-primary/15 px-2 text-xs font-semibold text-primary">
                        {r.score ?? 0}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {p.industry || "—"} · {p.business_model || "—"}
                  </p>
                  <p className="mt-4 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
