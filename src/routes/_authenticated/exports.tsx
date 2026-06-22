import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2, Sparkles, Trash2, Presentation, Map as MapIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { analyzeStartup } from "@/lib/analyze.functions";
import {
  exportPitchPdf,
  exportRoadmapPdf,
  exportReportPdf,
  uploadExport,
  downloadBlob,
} from "@/lib/pdf";
import type { DeepAnalysis } from "@/lib/analyze.functions";
import type { Slide } from "@/lib/pitch.functions";
import type { RoadmapPlan } from "@/lib/roadmap.functions";

export const Route = createFileRoute("/_authenticated/exports")({
  head: () => ({ meta: [{ title: "Exports — VentureIQ AI" }] }),
  component: ExportsPage,
});

type Entry = {
  key: string;
  kind: "pitch" | "roadmap" | "report";
  label: string;
  created_at: string;
  path: string | null;
  refId: string;
};

function ExportsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  // Force-unused server fn import keeps tree-shake honest (we re-export reports via project page)
  useServerFn(analyzeStartup);

  const { data } = useQuery({
    queryKey: ["exports", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [decks, roadmaps, reports, projects] = await Promise.all([
        supabase
          .from("pitch_decks")
          .select("id, title, slides, created_at, pdf_path, project_id")
          .order("created_at", { ascending: false }),
        supabase
          .from("roadmaps")
          .select("id, plan, created_at, pdf_path, project_id")
          .order("created_at", { ascending: false }),
        supabase
          .from("startup_reports")
          .select("id, analysis_json, summary, created_at, project_id")
          .order("created_at", { ascending: false }),
        supabase.from("startup_projects").select("id, startup_name"),
      ]);
      if (decks.error) throw decks.error;
      if (roadmaps.error) throw roadmaps.error;
      if (reports.error) throw reports.error;
      if (projects.error) throw projects.error;
      const projMap = new Map((projects.data ?? []).map((p) => [p.id, p.startup_name]));
      const entries: Entry[] = [
        ...(decks.data ?? []).map<Entry>((d) => ({
          key: `pitch-${d.id}`,
          kind: "pitch",
          label: d.title,
          created_at: d.created_at,
          path: d.pdf_path,
          refId: d.id,
        })),
        ...(roadmaps.data ?? []).map<Entry>((r) => ({
          key: `roadmap-${r.id}`,
          kind: "roadmap",
          label: `${projMap.get(r.project_id) ?? "Project"} — Roadmap`,
          created_at: r.created_at,
          path: r.pdf_path,
          refId: r.id,
        })),
        ...(reports.data ?? []).map<Entry>((r) => ({
          key: `report-${r.id}`,
          kind: "report",
          label: `${projMap.get(r.project_id) ?? "Project"} — Analysis`,
          created_at: r.created_at,
          path: null,
          refId: r.id,
        })),
      ].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
      return { entries, decks: decks.data ?? [], roadmaps: roadmaps.data ?? [], reports: reports.data ?? [], projects: projects.data ?? [] };
    },
  });

  async function download(entry: Entry) {
    if (!user) return;
    setBusy(entry.key);
    try {
      // If already exported, fetch from storage
      if (entry.path) {
        const { data: file, error } = await supabase.storage.from("exports").download(entry.path);
        if (error) throw error;
        downloadBlob(file, entry.path.split("/").pop() ?? "export.pdf");
      } else {
        // Generate on the fly
        let blob: Blob;
        let filename: string;
        if (entry.kind === "pitch") {
          const d = data?.decks.find((x) => x.id === entry.refId);
          if (!d) throw new Error("Deck not found");
          blob = await exportPitchPdf(d.title, d.slides as unknown as Slide[]);
          filename = `${slug(d.title)}.pdf`;
          const path = await uploadExport(user.id, "pitch", filename, blob);
          await supabase.from("pitch_decks").update({ pdf_path: path }).eq("id", d.id);
        } else if (entry.kind === "roadmap") {
          const r = data?.roadmaps.find((x) => x.id === entry.refId);
          if (!r) throw new Error("Roadmap not found");
          const name = data?.projects.find((p) => p.id === r.project_id)?.startup_name ?? "Project";
          blob = await exportRoadmapPdf(name, r.plan as unknown as RoadmapPlan);
          filename = `${slug(name)}-roadmap.pdf`;
          const path = await uploadExport(user.id, "roadmap", filename, blob);
          await supabase.from("roadmaps").update({ pdf_path: path }).eq("id", r.id);
        } else {
          const r = data?.reports.find((x) => x.id === entry.refId);
          if (!r) throw new Error("Report not found");
          const name = data?.projects.find((p) => p.id === r.project_id)?.startup_name ?? "Project";
          blob = await exportReportPdf(name, r.analysis_json as unknown as DeepAnalysis);
          filename = `${slug(name)}-report.pdf`;
          await uploadExport(user.id, "report", filename, blob);
        }
        await supabase.from("user_activity").insert({
          user_id: user.id,
          kind: "export",
          label: `Exported ${entry.kind}: ${entry.label}`,
          ref_id: entry.refId,
        });
        downloadBlob(blob, filename);
      }
      qc.invalidateQueries({ queryKey: ["exports"] });
      toast.success("Downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(null);
    }
  }

  async function removeFile(entry: Entry) {
    if (!entry.path || !user) return;
    if (!confirm("Delete exported PDF?")) return;
    const { error } = await supabase.storage.from("exports").remove([entry.path]);
    if (error) return toast.error(error.message);
    if (entry.kind === "pitch")
      await supabase.from("pitch_decks").update({ pdf_path: null }).eq("id", entry.refId);
    if (entry.kind === "roadmap")
      await supabase.from("roadmaps").update({ pdf_path: null }).eq("id", entry.refId);
    qc.invalidateQueries({ queryKey: ["exports"] });
    toast.success("Deleted");
  }

  const entries = data?.entries ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Exports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Download history for all your reports, pitch decks, and roadmaps.
        </p>
      </div>

      <section className="mt-7 rounded-xl border border-border bg-card shadow-soft">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Sparkles className="h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">No artifacts yet.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/projects/new">Create analysis</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/pitch">Generate deck</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/roadmap">Build roadmap</Link>
              </Button>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((e) => (
              <li key={e.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-4">
                <KindIcon kind={e.kind} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {labelFor(e.kind)} · {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                    {e.path ? " · stored" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" onClick={() => download(e)} disabled={busy === e.key}>
                    {busy === e.key ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </Button>
                  {e.path && (
                    <Button size="sm" variant="ghost" onClick={() => removeFile(e)} aria-label="Delete">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function KindIcon({ kind }: { kind: Entry["kind"] }) {
  const Icon = kind === "pitch" ? Presentation : kind === "roadmap" ? MapIcon : FileText;
  return (
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <Icon className="h-4 w-4" />
    </span>
  );
}

function labelFor(kind: Entry["kind"]) {
  return kind === "pitch" ? "Pitch deck" : kind === "roadmap" ? "Roadmap" : "Startup report";
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "export";
}
