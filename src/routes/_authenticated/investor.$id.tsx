import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Download,
  ShieldAlert,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { generateInvestorReadiness, type InvestorReadiness } from "@/lib/investor.functions";
import { exportInvestorPdf, uploadExport, downloadBlob } from "@/lib/pdf";

export const Route = createFileRoute("/_authenticated/investor/$id")({
  head: () => ({ meta: [{ title: "Investor Readiness — VentureIQ AI" }] }),
  component: InvestorDetail,
});

function tier(score: number) {
  if (score >= 71) return { label: "Investor Ready", text: "text-emerald-600", ring: "stroke-emerald-500" };
  if (score >= 41) return { label: "Moderate Readiness", text: "text-amber-600", ring: "stroke-amber-500" };
  return { label: "High Risk", text: "text-rose-600", ring: "stroke-rose-500" };
}

function ScoreGauge({ score }: { score: number }) {
  const t = tier(score);
  const r = 70;
  const C = 2 * Math.PI * r;
  const off = C * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <div className="relative inline-flex h-44 w-44 items-center justify-center">
      <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
        <circle cx="90" cy="90" r={r} className="fill-none stroke-muted" strokeWidth="14" />
        <circle
          cx="90"
          cy="90"
          r={r}
          className={`fill-none ${t.ring}`}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={off}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <div className="text-5xl font-black tabular-nums">{Math.round(score)}</div>
        <div className={`text-xs font-bold uppercase tracking-wide ${t.text}`}>{t.label}</div>
      </div>
    </div>
  );
}

const sevStyles: Record<string, string> = {
  critical: "border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  high: "border-rose-200 bg-rose-50/60 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300",
  medium: "border-amber-200 bg-amber-50/60 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
  low: "border-muted bg-muted/40 text-muted-foreground",
};

function InvestorDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const generate = useServerFn(generateInvestorReadiness);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["investor", id],
    queryFn: async () => {
      const [{ data: project }, { data: report }] = await Promise.all([
        supabase.from("startup_projects").select("*").eq("id", id).single(),
        supabase
          .from("investor_readiness_reports")
          .select("*")
          .eq("project_id", id)
          .maybeSingle(),
      ]);
      return { project, report };
    },
  });

  async function onGenerate() {
    setBusy(true);
    try {
      await generate({ data: { projectId: id } });
      toast.success("Investor readiness report generated");
      qc.invalidateQueries({ queryKey: ["investor", id] });
      qc.invalidateQueries({ queryKey: ["investor-index"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to generate report");
    } finally {
      setBusy(false);
    }
  }

  async function onExport() {
    if (!data?.report || !data?.project || !user) return;
    setExporting(true);
    try {
      const readiness: InvestorReadiness = {
        score: data.report.score,
        confidence: (data.report.confidence ?? "medium") as InvestorReadiness["confidence"],
        breakdown: data.report.breakdown as unknown as InvestorReadiness["breakdown"],
        strengths: (data.report.strengths as unknown as string[]) ?? [],
        weaknesses: (data.report.weaknesses as unknown as InvestorReadiness["weaknesses"]) ?? [],
        concerns: (data.report.concerns as unknown as InvestorReadiness["concerns"]) ?? [],
        improvements: (data.report.improvements as unknown as InvestorReadiness["improvements"]) ?? {
          immediate: [],
          next_30_days: [],
          next_90_days: [],
          before_fundraising: [],
        },
        fundraising_recommendations:
          (data.report.recommendations as unknown as string[]) ?? [],
      };
      const blob = await exportInvestorPdf(data.project.startup_name, readiness);
      const filename = `${data.project.startup_name.replace(/[^a-z0-9]+/gi, "-")}-investor-readiness.pdf`;
      downloadBlob(blob, filename);
      try {
        const path = await uploadExport(user.id, "investor", filename, blob);
        await supabase.from("user_activity").insert({
          user_id: user.id,
          kind: "export",
          label: `Investor readiness · ${data.project.startup_name}`,
          ref_id: data.report.id,
        });
        await supabase
          .from("investor_readiness_reports")
          .update({ pdf_path: path })
          .eq("id", data.report.id);
      } catch {
        /* upload best-effort */
      }
      toast.success("Investor report exported");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const project = data?.project;
  const report = data?.report;

  return (
    <div className="mx-auto box-border w-full min-w-0 max-w-6xl px-4 py-6 md:px-8">
      <Link
        to="/investor"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to readiness
      </Link>

      <header className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-bold tracking-tight">{project?.startup_name}</h1>
          <p className="text-sm text-muted-foreground">Investor readiness assessment</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {report && (
            <Button variant="outline" size="sm" onClick={onExport} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span className="hidden sm:inline">Download PDF</span>
            </Button>
          )}
          <Button onClick={onGenerate} disabled={busy} size="sm">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {report ? "Re-assess" : "Run assessment"}
          </Button>
        </div>
      </header>

      {!report ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
          <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <div className="text-lg font-semibold">No readiness assessment yet</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Run the investor readiness check to score this startup across 10 categories and surface concerns.
          </p>
          <Button className="mt-5" onClick={onGenerate} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
            Run assessment
          </Button>
        </div>
      ) : (
        <ReadinessBody report={report} />
      )}
    </div>
  );
}

type Report = NonNullable<Awaited<ReturnType<typeof loadReport>>>;

async function loadReport() {
  const { data } = await supabase
    .from("investor_readiness_reports")
    .select("*")
    .limit(1)
    .maybeSingle();
  return data;
}

function ReadinessBody({ report }: { report: Report }) {
  const breakdown = (report.breakdown ?? {}) as Record<string, number>;
  const strengths = (report.strengths as unknown as string[]) ?? [];
  const weaknesses = (report.weaknesses as unknown as InvestorReadiness["weaknesses"]) ?? [];
  const concerns = (report.concerns as unknown as InvestorReadiness["concerns"]) ?? [];
  const improvements =
    (report.improvements as unknown as InvestorReadiness["improvements"]) ?? {
      immediate: [],
      next_30_days: [],
      next_90_days: [],
      before_fundraising: [],
    };
  const recommendations = (report.recommendations as unknown as string[]) ?? [];

  return (
    <div className="space-y-6">
      {/* Score + breakdown */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex items-center justify-center rounded-2xl border border-border bg-gradient-to-br from-card to-card/60 p-8 backdrop-blur">
          <ScoreGauge score={report.score} />
        </div>
        <div className="rounded-2xl border border-border bg-card/70 p-5 backdrop-blur">
          <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Score breakdown
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Object.entries(breakdown).map(([k, v]) => (
              <div key={k} className="min-w-0 rounded-lg border border-border/60 bg-background/60 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {k.replace(/_/g, " ")}
                  </div>
                  <div className="text-base font-bold tabular-nums">{Math.round(Number(v) || 0)}</div>
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                  <div
                    className="h-1.5 rounded-full bg-primary"
                    style={{ width: `${Math.max(0, Math.min(100, Number(v) || 0))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {strengths.length > 0 && (
        <section className="rounded-2xl border border-border bg-card/70 p-5 backdrop-blur">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Strengths
          </h2>
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {strengths.map((s, i) => (
              <li key={i} className="flex gap-2 rounded-lg border border-emerald-100/60 bg-emerald-50/40 p-3 text-sm dark:bg-emerald-950/20">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span className="break-words">{s}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {concerns.length > 0 && (
        <section className="rounded-2xl border border-border bg-card/70 p-5 backdrop-blur">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
            <AlertTriangle className="h-4 w-4 text-rose-500" /> Potential Investor Concerns
          </h2>
          <Accordion type="multiple" className="space-y-2">
            {concerns.map((c, i) => (
              <AccordionItem
                key={i}
                value={`c-${i}`}
                className={`overflow-hidden rounded-xl border ${sevStyles[c.severity] ?? sevStyles.low} px-3`}
              >
                <AccordionTrigger className="py-3 hover:no-underline">
                  <div className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="inline-flex shrink-0 rounded-full bg-background/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                      {c.severity}
                    </span>
                    <span className="truncate font-semibold text-foreground">{c.title}</span>
                    <span className="ml-auto hidden shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground sm:inline">
                      {c.category}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-2 text-sm text-foreground/90">
                  <p className="break-words">{c.explanation}</p>
                  <p className="break-words">
                    <span className="font-semibold">Why investors reject: </span>
                    {c.why_investors_reject}
                  </p>
                  <p className="break-words">
                    <span className="font-semibold">Suggested solution: </span>
                    {c.suggested_solution}
                  </p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      )}

      {weaknesses.length > 0 && (
        <section className="rounded-2xl border border-border bg-card/70 p-5 backdrop-blur">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
            <TrendingUp className="h-4 w-4 text-primary" /> Weakness Analysis
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {weaknesses.map((w, i) => (
              <div key={i} className="min-w-0 rounded-xl border border-border bg-background/60 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="truncate font-semibold">{w.area}</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                    prio {w.priority}
                  </span>
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600">
                    impact {w.impact}
                  </span>
                </div>
                <p className="text-sm text-foreground/90">{w.description}</p>
                <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">
                  <span className="font-semibold">Fix: </span>
                  {w.fix}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card/70 p-5 backdrop-blur">
        <h2 className="mb-4 text-base font-semibold">Improvement plan</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(
            [
              ["Immediate actions", improvements.immediate],
              ["Next 30 days", improvements.next_30_days],
              ["Next 90 days", improvements.next_90_days],
              ["Before fundraising", improvements.before_fundraising],
            ] as const
          ).map(([label, items]) => (
            <div key={label} className="rounded-xl border border-border bg-background/60 p-4">
              <div className="mb-3 text-xs font-bold uppercase tracking-wide text-primary">{label}</div>
              {!items?.length ? (
                <div className="text-sm text-muted-foreground">Nothing here yet.</div>
              ) : (
                <ul className="space-y-3">
                  {items.map((it, i) => (
                    <li key={i} className="rounded-lg border border-border/60 bg-card/60 p-3">
                      <div className="text-sm font-semibold">{it.problem}</div>
                      <div className="mt-1 text-sm text-foreground/90">{it.recommendation}</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        <span className="rounded bg-muted px-2 py-0.5">{it.difficulty}</span>
                        <span className="rounded bg-muted px-2 py-0.5">{it.time_required}</span>
                        <span className="rounded bg-muted px-2 py-0.5">impact · {it.estimated_impact}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      {recommendations.length > 0 && (
        <section className="rounded-2xl border border-border bg-card/70 p-5 backdrop-blur">
          <h2 className="mb-3 text-base font-semibold">Fundraising recommendations</h2>
          <ul className="space-y-2">
            {recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 -rotate-90 text-primary" />
                <span className="break-words">{r}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
