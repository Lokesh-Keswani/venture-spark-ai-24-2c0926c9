import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Trash2,
  Sparkles,
  TrendingUp,
  Target,
  DollarSign,
  ShieldAlert,
  Users,
  Lightbulb,
  Download,
  MessageSquare,
  Paperclip,
  MessagesSquare,
  Activity as ActivityIcon,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { analyzeStartup, type DeepAnalysis, type Competitor } from "@/lib/analyze.functions";
import { exportReportPdf, uploadExport, downloadBlob } from "@/lib/pdf";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ShareProjectDialog } from "@/components/ShareProjectDialog";
import { ChatPanel, FilesPanel, CommentsPanel, ActivityPanel } from "@/components/project/CollabPanels";

export const Route = createFileRoute("/_authenticated/projects/$id")({
  head: () => ({ meta: [{ title: "Analysis — VentureIQ AI" }] }),
  component: ProjectDetail,
});

function ProjectDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const analyze = useServerFn(analyzeStartup);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [tab, setTab] = useState<"analysis" | "chat" | "files" | "comments" | "activity">("analysis");

  // Project role (owner, admin, editor, viewer) drives editor/viewer affordances.
  const { data: roleData } = useQuery({
    queryKey: ["project-role", id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("project_role", {
        _project_id: id,
        _user_id: user!.id,
      });
      if (error) return "viewer";
      return (data as string) ?? "viewer";
    },
  });
  const role = (roleData ?? "member") as "owner" | "admin" | "member";
  const canManage = role === "owner" || role === "admin";
  const canEdit = canManage; // Only Owner/Admin can modify project content
  const isMember = role === "owner" || role === "admin" || role === "member";

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
      <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!data?.project) return null;
  const { project, reports } = data;
  const latest = reports[0];
  const analysis = latest?.analysis_json as DeepAnalysis | undefined;

  async function rerun() {
    setBusy(true);
    try {
      toast.loading("Generating deep analysis…", { id: "re" });
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
      toast.success("Analysis ready", { id: "re" });
      if (user) {
        await supabase.from("project_activity").insert({
          project_id: project.id,
          user_id: user.id,
          action: "analysis.generated",
          target: project.startup_name,
        });
      }
      qc.invalidateQueries({ queryKey: ["project", id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["project-activity", id] });
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

  async function downloadAnalysis() {
    if (!user || !analysis || !latest) return;
    setExporting(true);
    try {
      toast.loading("Building your analysis PDF…", { id: "dl" });
      const blob = await exportReportPdf(project.startup_name, analysis);
      const filename = `${slugify(project.startup_name)}-analysis.pdf`;
      try {
        await uploadExport(user.id, "report", filename, blob);
        await supabase.from("user_activity").insert({
          user_id: user.id,
          kind: "export",
          label: `Exported analysis: ${project.startup_name}`,
          ref_id: latest.id,
        });
      } catch {
        // Storage save is best-effort — still let the user download.
      }
      downloadBlob(blob, filename);
      toast.success("Analysis downloaded", { id: "dl" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed", { id: "dl" });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
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
        <div className="flex flex-wrap gap-2">
          <ShareProjectDialog projectId={project.id} projectName={project.startup_name} ownerId={project.user_id} />
          {analysis && (
            <Button
              size="sm"
              onClick={downloadAnalysis}
              disabled={exporting}
              className="shadow-glow"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-4 w-4" />
              )}
              Download Analysis
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" size="sm" onClick={rerun} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
              Re-analyze
            </Button>
          )}
          {role === "owner" && (
            <Button variant="ghost" size="sm" onClick={remove}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Role badge */}
      <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Your role: {role}
      </div>

      {/* Tabs */}
      <div className="mt-5 flex flex-wrap gap-1.5 border-b border-border">
        {[
          { id: "analysis" as const, label: "Analysis", icon: BarChart3 },
          { id: "chat" as const, label: "Team Chat", icon: MessageSquare },
          { id: "files" as const, label: "Files", icon: Paperclip },
          { id: "comments" as const, label: "Comments", icon: MessagesSquare },
          { id: "activity" as const, label: "Activity", icon: ActivityIcon },
        ].map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition ${
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "chat" && (
        <div className="mt-5">
          <ChatPanel projectId={project.id} canSend={isMember} />
        </div>
      )}
      {tab === "files" && (
        <div className="mt-5">
          <FilesPanel projectId={project.id} canEdit={canEdit} />
        </div>
      )}
      {tab === "comments" && (
        <div className="mt-5">
          <CommentsPanel projectId={project.id} canComment={isMember} />
        </div>
      )}
      {tab === "activity" && (
        <div className="mt-5">
          <ActivityPanel projectId={project.id} />
        </div>
      )}

      {tab === "analysis" && (
        <>
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
              {canEdit && (
                <Button onClick={rerun} disabled={busy} className="mt-3">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate deep analysis"}
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Success Score Visualization */}
              <section className="mt-6 grid gap-4 sm:grid-cols-3">
                <ScoreRing score={analysis.overall_score} createdAt={latest?.created_at} />
            <div className="rounded-xl border border-border bg-card p-5 shadow-soft sm:col-span-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Executive summary
              </p>
              <p className="mt-2 text-sm leading-relaxed">{analysis.summary}</p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Pill label="Market" value={analysis.market_analysis?.score} />
                <Pill label="Competition" value={analysis.competitor_analysis?.score} />
                <Pill label="PMF" value={analysis.business_validation?.product_market_fit_score} />
                <Pill label="Revenue" value={analysis.revenue_model?.score} />
              </div>
            </div>
          </section>

          {/* Market Opportunity Dashboard */}
          <Section icon={TrendingUp} title="Market opportunity">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardLabel>Market size</CardLabel>
                <p className="mt-1.5 text-sm leading-relaxed">{analysis.market_analysis?.market_size}</p>
                <CardLabel className="mt-4">Growth potential</CardLabel>
                <p className="mt-1.5 text-sm leading-relaxed">{analysis.market_analysis?.growth_potential}</p>
              </Card>
              <Card>
                <CardLabel>Industry trends</CardLabel>
                <Bullets items={analysis.market_analysis?.industry_trends} />
              </Card>
              <Card className="lg:col-span-3">
                <CardLabel>Market risks</CardLabel>
                <Bullets items={analysis.market_analysis?.risks} tone="warn" />
              </Card>
            </div>
          </Section>

          {/* Competitor Comparison */}
          <Section icon={Target} title="Competitor landscape">
            <div className="grid gap-3 sm:grid-cols-2">
              {analysis.competitor_analysis?.competitors?.map((c, i) => (
                <CompetitorCard key={i} c={c} />
              ))}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Card>
                <CardLabel>Your competitive advantages</CardLabel>
                <Bullets items={analysis.competitor_analysis?.competitive_advantages} tone="ok" />
              </Card>
              <Card>
                <CardLabel>Market gaps to exploit</CardLabel>
                <Bullets items={analysis.competitor_analysis?.market_gaps} tone="ok" />
              </Card>
            </div>
          </Section>

          {/* Business Validation */}
          <Section icon={Lightbulb} title="Business validation">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardLabel>Problem statement</CardLabel>
                <p className="mt-1.5 text-sm leading-relaxed">{analysis.business_validation?.problem_statement}</p>
                <CardLabel className="mt-4">Solution validation</CardLabel>
                <p className="mt-1.5 text-sm leading-relaxed">{analysis.business_validation?.solution_validation}</p>
              </Card>
              <Card>
                <CardLabel>Product–market fit</CardLabel>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="font-display text-4xl font-semibold text-gradient">
                    {analysis.business_validation?.product_market_fit_score}
                  </span>
                  <span className="text-xs text-muted-foreground">/ 100</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${analysis.business_validation?.product_market_fit_score ?? 0}%` }}
                  />
                </div>
              </Card>
              <Card className="lg:col-span-3">
                <CardLabel className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Target customers
                </CardLabel>
                <Bullets items={analysis.business_validation?.target_customers} />
              </Card>
            </div>
          </Section>

          {/* Revenue Model */}
          <Section icon={DollarSign} title="Revenue model">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardLabel>Revenue streams</CardLabel>
                <Bullets items={analysis.revenue_model?.revenue_streams} />
              </Card>
              <Card>
                <CardLabel>Pricing recommendations</CardLabel>
                <Bullets items={analysis.revenue_model?.pricing_recommendations} />
              </Card>
              <Card>
                <CardLabel>Growth opportunities</CardLabel>
                <Bullets items={analysis.revenue_model?.growth_opportunities} tone="ok" />
              </Card>
            </div>
          </Section>

          {/* Risk Analysis */}
          <Section icon={ShieldAlert} title="Risk analysis">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardLabel>Technical risks</CardLabel>
                <Bullets items={analysis.risk_analysis?.technical_risks} tone="warn" />
              </Card>
              <Card>
                <CardLabel>Business risks</CardLabel>
                <Bullets items={analysis.risk_analysis?.business_risks} tone="warn" />
              </Card>
              <Card>
                <CardLabel>Market risks</CardLabel>
                <Bullets items={analysis.risk_analysis?.market_risks} tone="warn" />
              </Card>
            </div>
          </Section>

          {/* Next steps */}
          <Section icon={Sparkles} title="Recommended next steps">
            <Card>
              <Bullets items={analysis.next_steps} tone="ok" />
            </Card>
          </Section>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ScoreRing({ score, createdAt }: { score: number; createdAt?: string }) {
  const pct = Math.max(0, Math.min(100, score ?? 0));
  const r = 52;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const tone = pct >= 75 ? "text-primary" : pct >= 50 ? "text-foreground" : "text-muted-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Success score
      </p>
      <div className="mt-2 flex items-center gap-4">
        <div className="relative h-32 w-32">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r={r} className="fill-none stroke-muted" strokeWidth="10" />
            <circle
              cx="60"
              cy="60"
              r={r}
              className="fill-none stroke-primary transition-all duration-700"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c}`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`font-display text-3xl font-semibold ${tone}`}>{pct}</span>
            <span className="text-[10px] text-muted-foreground">/ 100</span>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {createdAt && formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
        </div>
      </div>
    </div>
  );
}

function Pill({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value ?? "—"}</p>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="font-display text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card p-5 shadow-soft ${className}`}>
      {children}
    </div>
  );
}

function CardLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-[11px] font-medium uppercase tracking-wider text-muted-foreground ${className}`}>
      {children}
    </p>
  );
}

function Bullets({ items, tone = "neutral" }: { items?: string[]; tone?: "neutral" | "warn" | "ok" }) {
  if (!items?.length) return <p className="mt-2 text-sm text-muted-foreground">—</p>;
  const dot =
    tone === "warn" ? "bg-destructive" : tone === "ok" ? "bg-primary" : "bg-muted-foreground/50";
  return (
    <ul className="mt-2 space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2 text-sm leading-relaxed">
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function CompetitorCard({ c }: { c: Competitor }) {
  const isDirect = c.type === "direct";
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-sm font-semibold">{c.name}</h3>
        <span
          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
            isDirect ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {c.type}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{c.description}</p>
      <div className="mt-3 space-y-1.5 text-xs">
        <p>
          <span className="font-medium text-foreground">Strength: </span>
          <span className="text-muted-foreground">{c.strength}</span>
        </p>
        <p>
          <span className="font-medium text-foreground">Weakness: </span>
          <span className="text-muted-foreground">{c.weakness}</span>
        </p>
      </div>
    </div>
  );
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "analysis";
}
