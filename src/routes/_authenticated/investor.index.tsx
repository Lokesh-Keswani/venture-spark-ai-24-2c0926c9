import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Gauge,
  ArrowRight,
  Sparkles,
  Loader2,
  RefreshCw,
  Download,
  Eye,
  ShieldAlert,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  generateInvestorReadiness,
  type InvestorReadiness,
} from "@/lib/investor.functions";
import { exportInvestorPdf, uploadExport, downloadBlob } from "@/lib/pdf";

export const Route = createFileRoute("/_authenticated/investor/")({
  head: () => ({ meta: [{ title: "Investor Readiness — VentureIQ AI" }] }),
  component: InvestorIndex,
});

function tier(score: number) {
  if (score >= 71) return { label: "Investor Ready", color: "text-emerald-600", bar: "bg-emerald-500" };
  if (score >= 41) return { label: "Moderate Readiness", color: "text-amber-600", bar: "bg-amber-500" };
  return { label: "High Risk", color: "text-rose-600", bar: "bg-rose-500" };
}

function InvestorIndex() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const generate = useServerFn(generateInvestorReadiness);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["investor-index"],
    queryFn: async () => {
      const [{ data: projects }, { data: reports }, { data: analyses }] = await Promise.all([
        supabase.from("startup_projects").select("*").order("created_at", { ascending: false }),
        supabase.from("investor_readiness_reports").select("*"),
        supabase.from("startup_reports").select("project_id").limit(1000),
      ]);
      const byId = new Map((reports ?? []).map((r) => [r.project_id, r]));
      const analyzed = new Set((analyses ?? []).map((a) => a.project_id));
      return { projects: projects ?? [], byId, analyzed };
    },
  });

  async function onGenerate(projectId: string) {
    setBusyId(projectId);
    try {
      await generate({ data: { projectId } });
      toast.success("Investor readiness report generated");
      qc.invalidateQueries({ queryKey: ["investor-index"] });
      qc.invalidateQueries({ queryKey: ["investor", projectId] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to generate report");
    } finally {
      setBusyId(null);
    }
  }

  async function onExport(projectId: string, projectName: string) {
    if (!user) return;
    setExportingId(projectId);
    try {
      const { data: report } = await supabase
        .from("investor_readiness_reports")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      if (!report) throw new Error("No report to export");
      const readiness: InvestorReadiness = {
        score: report.score,
        confidence: (report.confidence ?? "medium") as InvestorReadiness["confidence"],
        breakdown: report.breakdown as unknown as InvestorReadiness["breakdown"],
        strengths: (report.strengths as unknown as string[]) ?? [],
        weaknesses: (report.weaknesses as unknown as InvestorReadiness["weaknesses"]) ?? [],
        concerns: (report.concerns as unknown as InvestorReadiness["concerns"]) ?? [],
        improvements:
          (report.improvements as unknown as InvestorReadiness["improvements"]) ?? {
            immediate: [],
            next_30_days: [],
            next_90_days: [],
            before_fundraising: [],
          },
        fundraising_recommendations:
          (report.recommendations as unknown as string[]) ?? [],
      };
      const blob = await exportInvestorPdf(projectName, readiness);
      const filename = `${projectName.replace(/[^a-z0-9]+/gi, "-")}-investor-readiness.pdf`;
      downloadBlob(blob, filename);
      try {
        const path = await uploadExport(user.id, "investor", filename, blob);
        await supabase.from("user_activity").insert({
          user_id: user.id,
          kind: "export",
          label: `Investor readiness · ${projectName}`,
          ref_id: report.id,
        });
        await supabase
          .from("investor_readiness_reports")
          .update({ pdf_path: path })
          .eq("id", report.id);
      } catch {
        /* upload best-effort */
      }
      toast.success("Investor report exported");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportingId(null);
    }
  }

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
            const isBusy = busyId === p.id;
            const isExporting = exportingId === p.id;
            const hasAnalysis = data.analyzed.has(p.id);
            return (
              <div
                key={p.id}
                className="relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card/70 p-5 shadow-sm backdrop-blur transition-all hover:border-primary/40 hover:shadow-lg"
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
                    <div className="mt-1 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate({ to: "/investor/$id", params: { id: p.id } })}
                      >
                        <Eye className="h-3.5 w-3.5" /> View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onExport(p.id, p.startup_name)}
                        disabled={isExporting}
                      >
                        {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        PDF
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onGenerate(p.id)}
                      disabled={isBusy}
                      className="justify-center"
                    >
                      {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Refresh report
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="rounded-lg border border-dashed border-border bg-background/60 p-3 text-xs text-muted-foreground">
                      {hasAnalysis
                        ? "Startup analysis ready — generate a readiness report from it."
                        : "No readiness report yet. Generate one to score this startup."}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => onGenerate(p.id)}
                      disabled={isBusy}
                      className="w-full"
                    >
                      {isBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldAlert className="h-4 w-4" />
                      )}
                      Generate Investor Readiness Report
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
