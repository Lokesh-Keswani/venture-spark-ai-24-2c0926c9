import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Map,
  Loader2,
  Sparkles,
  Download,
  Trash2,
  CheckCircle2,
  Rocket,
  Calendar,
  TrendingUp,
} from "lucide-react";
import { generateRoadmap, type RoadmapPlan, type Milestone } from "@/lib/roadmap.functions";
import { exportRoadmapPdf, uploadExport, downloadBlob } from "@/lib/pdf";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/roadmap")({
  head: () => ({ meta: [{ title: "Roadmaps — VentureIQ AI" }] }),
  component: RoadmapPage,
});

function RoadmapPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const generate = useServerFn(generateRoadmap);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["roadmaps", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [roadmaps, projects] = await Promise.all([
        supabase
          .from("roadmaps")
          .select("id, project_id, plan, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("startup_projects").select("id, startup_name"),
      ]);
      if (roadmaps.error) throw roadmaps.error;
      if (projects.error) throw projects.error;
      return { roadmaps: roadmaps.data ?? [], projects: projects.data ?? [] };
    },
  });

  async function gen(projectId: string) {
    setBusyId(projectId);
    try {
      toast.loading("Building your execution roadmap…", { id: "rm" });
      const res = await generate({ data: { projectId } });
      toast.success("Roadmap ready!", { id: "rm" });
      qc.invalidateQueries({ queryKey: ["roadmaps"] });
      setSelectedId(res.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed", { id: "rm" });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this roadmap?")) return;
    const { error } = await supabase.from("roadmaps").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["roadmaps"] });
    if (selectedId === id) setSelectedId(null);
  }

  async function exportPdf(roadmapId: string, plan: RoadmapPlan, name: string) {
    if (!user) return;
    setBusyId(roadmapId);
    try {
      const blob = await exportRoadmapPdf(name, plan);
      const filename = `${slugify(name)}-roadmap.pdf`;
      const path = await uploadExport(user.id, "roadmap", filename, blob);
      await supabase.from("roadmaps").update({ pdf_path: path }).eq("id", roadmapId);
      await supabase.from("user_activity").insert({
        user_id: user.id,
        kind: "export",
        label: `Exported roadmap: ${name}`,
        ref_id: roadmapId,
      });
      downloadBlob(blob, filename);
      toast.success("PDF exported");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusyId(null);
    }
  }

  const projects = data?.projects ?? [];
  const roadmaps = data?.roadmaps ?? [];
  const selected = selectedId
    ? roadmaps.find((r) => r.id === selectedId)
    : roadmaps[0];
  const selectedProject = selected
    ? projects.find((p) => p.id === selected.project_id)
    : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Roadmaps</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tactical execution plans across product, marketing, hiring, and tech.
        </p>
      </div>

      <section className="mt-7">
        <h2 className="mb-3 font-display text-sm font-semibold text-muted-foreground">
          Generate a new roadmap
        </h2>
        {projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Create a project to generate a roadmap.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => gen(p.id)}
                disabled={busyId === p.id}
                className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-soft transition hover:border-primary/40 hover:shadow-glow disabled:opacity-60"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.startup_name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Generate roadmap</p>
                </div>
                {busyId === p.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <Sparkles className="h-4 w-4 text-primary opacity-0 transition group-hover:opacity-100" />
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {roadmaps.length > 0 && (
        <section className="mt-10 grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="space-y-2">
            <h2 className="mb-1 font-display text-sm font-semibold text-muted-foreground">
              Your roadmaps
            </h2>
            {roadmaps.map((r) => {
              const proj = projects.find((p) => p.id === r.project_id);
              return (
                <div
                  key={r.id}
                  className={`group relative rounded-lg border p-3 transition ${
                    (selected?.id ?? roadmaps[0].id) === r.id
                      ? "border-primary/60 bg-primary/5"
                      : "border-border bg-card hover:border-primary/30"
                  }`}
                >
                  <button onClick={() => setSelectedId(r.id)} className="block w-full text-left">
                    <p className="truncate text-sm font-medium">
                      {proj?.startup_name ?? "Roadmap"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </p>
                  </button>
                  <button
                    onClick={() => remove(r.id)}
                    className="absolute right-2 top-2 hidden rounded p-1 text-muted-foreground hover:bg-background hover:text-destructive group-hover:inline-flex"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </aside>

          {selected && (
            <RoadmapView
              key={selected.id}
              plan={selected.plan as unknown as RoadmapPlan}
              name={selectedProject?.startup_name ?? "Project"}
              busy={busyId === selected.id}
              onExport={() =>
                exportPdf(
                  selected.id,
                  selected.plan as unknown as RoadmapPlan,
                  selectedProject?.startup_name ?? "Project",
                )
              }
            />
          )}
        </section>
      )}
    </div>
  );
}

function RoadmapView({
  plan,
  name,
  busy,
  onExport,
}: {
  plan: RoadmapPlan;
  name: string;
  busy: boolean;
  onExport: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-border bg-card p-5 shadow-soft">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Execution roadmap
          </p>
          <h2 className="font-display text-xl font-semibold">{name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{plan.mvp?.summary}</p>
        </div>
        <Button size="sm" onClick={onExport} disabled={busy} className="shadow-glow">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
          Export PDF
        </Button>
      </div>

      <PhaseCard icon={Rocket} title="MVP plan" milestones={plan.mvp?.milestones} />
      <PhaseCard icon={Calendar} title="30-Day roadmap" milestones={plan.thirty_day} />
      <PhaseCard icon={Calendar} title="90-Day roadmap" milestones={plan.ninety_day} />
      <PhaseCard icon={TrendingUp} title="1-Year growth" milestones={plan.one_year} />

      <div className="grid gap-4 lg:grid-cols-2">
        <BulletCard title="Product milestones" items={plan.product_milestones} />
        <BulletCard title="Marketing milestones" items={plan.marketing_milestones} />
        <BulletCard title="Technical milestones" items={plan.technical_milestones} />
        <BulletCard title="Hiring recommendations" items={plan.hiring_recommendations} />
      </div>
    </div>
  );
}

function PhaseCard({
  icon: Icon,
  title,
  milestones,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  milestones?: Milestone[];
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="font-display text-base font-semibold">{title}</h3>
      </div>
      <ol className="space-y-3">
        {(milestones ?? []).map((m, i) => (
          <li key={i} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-medium">{m.title}</p>
              <p className="text-xs text-muted-foreground">{m.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function BulletCard({ title, items }: { title: string; items?: string[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
      <h3 className="mb-2 font-display text-sm font-semibold">{title}</h3>
      <ul className="space-y-1.5">
        {(items ?? []).map((it, i) => (
          <li key={i} className="flex gap-2 text-sm">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "roadmap";
}

export { Map };
