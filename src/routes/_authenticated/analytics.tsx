import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList,
} from "recharts";
import { Activity, ArrowRight, Sparkles, TrendingUp, Trophy } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics — VentureIQ AI" }] }),
  component: AnalyticsPage,
});

type Report = {
  id: string;
  project_id: string;
  score: number | null;
  summary: string | null;
  created_at: string;
};
type Project = {
  id: string;
  startup_name: string;
  industry: string | null;
  created_at: string;
};
type Activity = {
  id: string;
  kind: string;
  label: string;
  ref_id: string | null;
  created_at: string;
};

// Chart palette uses CSS custom properties directly (oklch). Avoid `hsl()` wrapper
// since our tokens are not HSL — wrapping them yields invalid colors that render
// black, killing chart visibility in dark mode.
const C = {
  primary: "var(--primary)",
  border: "color-mix(in oklab, var(--foreground) 18%, transparent)",
  grid: "color-mix(in oklab, var(--foreground) 12%, transparent)",
  axis: "color-mix(in oklab, var(--foreground) 70%, transparent)",
  tooltipBg: "var(--popover)",
  tooltipText: "var(--popover-foreground)",
};

function AnalyticsPage() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["analytics", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [p, r, a] = await Promise.all([
        supabase
          .from("startup_projects")
          .select("id, startup_name, industry, created_at")
          .order("created_at", { ascending: true }),
        supabase
          .from("startup_reports")
          .select("id, project_id, score, summary, created_at")
          .order("created_at", { ascending: true }),
        supabase
          .from("user_activity")
          .select("id, kind, label, ref_id, created_at")
          .order("created_at", { ascending: false })
          .limit(40),
      ]);
      if (p.error) throw p.error;
      if (r.error) throw r.error;
      if (a.error) throw a.error;
      return {
        projects: (p.data ?? []) as Project[],
        reports: (r.data ?? []) as Report[],
        activity: (a.data ?? []) as Activity[],
      };
    },
  });

  const projects = data?.projects ?? [];
  const reports = data?.reports ?? [];
  const activity = data?.activity ?? [];

  const projectById = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p])),
    [projects],
  );

  const trend = useMemo(
    () =>
      reports.map((r, i) => ({
        idx: i + 1,
        date: format(new Date(r.created_at), "MMM d"),
        score: r.score ?? 0,
        name: projectById[r.project_id]?.startup_name ?? "Untitled",
      })),
    [reports, projectById],
  );

  const benchmarks = useMemo(() => {
    const buckets = new Map<string, { sum: number; n: number }>();
    for (const r of reports) {
      const p = projectById[r.project_id];
      const ind = (p?.industry ?? "Other").trim() || "Other";
      const b = buckets.get(ind) ?? { sum: 0, n: 0 };
      b.sum += r.score ?? 0;
      b.n += 1;
      buckets.set(ind, b);
    }
    return Array.from(buckets.entries())
      .map(([industry, b]) => ({
        industry,
        short: industry.length > 18 ? industry.slice(0, 16) + "…" : industry,
        avg: Math.round(b.sum / b.n),
        count: b.n,
      }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 8);
  }, [reports, projectById]);

  const avgScore =
    reports.length === 0
      ? 0
      : Math.round(reports.reduce((s, r) => s + (r.score ?? 0), 0) / reports.length);
  const best = reports.reduce<Report | null>(
    (a, r) => (!a || (r.score ?? 0) > (a.score ?? 0) ? r : a),
    null,
  );
  const delta =
    reports.length >= 2
      ? (reports[reports.length - 1].score ?? 0) - (reports[0].score ?? 0)
      : 0;

  return (
    <div className="mx-auto box-border w-full min-w-0 max-w-6xl px-3 py-6 sm:px-6 sm:py-10">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Advanced analytics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Score trends, industry benchmarks, and your activity stream.
          </p>
        </div>
        <Button asChild size="sm" className="shadow-glow sm:size-default">
          <Link to="/ideas">
            <Sparkles className="mr-1.5 h-4 w-4" />
            <span className="hidden xs:inline">Generate</span>
            <span className="xs:hidden">Ideas</span>
            <span className="ml-1 hidden sm:inline">ideas</span>
          </Link>
        </Button>
      </div>

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KPI label="Avg score" value={isLoading ? "…" : `${avgScore}`} icon={TrendingUp} />
        <KPI label="Analyses" value={isLoading ? "…" : String(reports.length)} icon={Activity} />
        <KPI label="Best score" value={isLoading ? "…" : best ? `${best.score ?? 0}` : "—"} icon={Trophy} />
        <KPI label="Trend delta" value={isLoading ? "…" : `${delta >= 0 ? "+" : ""}${delta}`} icon={TrendingUp} />
      </div>

      {/* Score trend */}
      <Card className="mt-6 min-w-0 max-w-full overflow-hidden border-border/60 bg-card/60 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-base">Startup score trend</CardTitle>
          <CardDescription>Every analysis you've run, in chronological order.</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 px-2 sm:px-6">
          {trend.length === 0 ? (
            <EmptyState label="Run your first analysis to see the trend." />
          ) : (
            <div className="h-[260px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.primary} stopOpacity={0.55} />
                      <stop offset="100%" stopColor={C.primary} stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: C.axis }}
                    stroke={C.border}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: C.axis }}
                    stroke={C.border}
                    tickLine={false}
                    axisLine={false}
                    width={32}
                  />
                  <Tooltip
                    cursor={{ stroke: C.primary, strokeOpacity: 0.3 }}
                    contentStyle={{
                      background: C.tooltipBg,
                      color: C.tooltipText,
                      border: `1px solid ${C.border}`,
                      borderRadius: 10,
                      fontSize: 12,
                      boxShadow: "0 8px 24px -8px rgba(0,0,0,0.25)",
                    }}
                    labelStyle={{ color: C.tooltipText }}
                  />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke={C.primary}
                    strokeWidth={2.5}
                    fill="url(#scoreGrad)"
                    dot={{ r: 3, fill: C.primary, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: C.primary, stroke: C.tooltipBg, strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        {/* Industry benchmarks – horizontal bars handle long labels cleanly */}
        <Card className="min-w-0 max-w-full overflow-hidden border-border/60 bg-card/60 backdrop-blur lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Industry benchmarks</CardTitle>
            <CardDescription>Average score per industry across your portfolio.</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0 px-2 sm:px-6">
            {benchmarks.length === 0 ? (
              <EmptyState label="No industry data yet." />
            ) : (
              <div
                className="w-full min-w-0"
                style={{ height: Math.max(180, benchmarks.length * 44 + 24) }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={benchmarks}
                    layout="vertical"
                    margin={{ left: 4, right: 36, top: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tick={{ fontSize: 11, fill: C.axis }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="short"
                      tick={{ fontSize: 11, fill: C.axis }}
                      tickLine={false}
                      axisLine={false}
                      width={108}
                    />
                    <Tooltip
                      cursor={{ fill: C.primary, fillOpacity: 0.08 }}
                      contentStyle={{
                        background: C.tooltipBg,
                        color: C.tooltipText,
                        border: `1px solid ${C.border}`,
                        borderRadius: 10,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="avg" radius={[0, 6, 6, 0]} fill={C.primary}>
                      <LabelList
                        dataKey="avg"
                        position="right"
                        style={{ fill: C.axis, fontSize: 11 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 max-w-full overflow-hidden border-border/60 bg-card/60 backdrop-blur lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
            <CardDescription>Your latest actions across the platform.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {activity.length === 0 ? (
              <EmptyState label="No activity yet." />
            ) : (
              activity.slice(0, 8).map((a) => (
                <div
                  key={a.id}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-md border border-border/40 bg-background/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium leading-snug">{a.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{a.kind}</p>
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Analysis history — responsive list (cards on mobile, table on md+) */}
      <Card className="mt-4 min-w-0 max-w-full overflow-hidden border-border/60 bg-card/60 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-base">Analysis history</CardTitle>
          <CardDescription>Every report you've generated.</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          {reports.length === 0 ? (
            <EmptyState label="No analyses yet." />
          ) : (
            <>
              {/* Mobile: card list */}
              <ul className="space-y-2 md:hidden">
                {[...reports].reverse().map((r) => {
                  const p = projectById[r.project_id];
                  return (
                    <li
                      key={r.id}
                      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border/40 bg-background/60 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {p?.startup_name ?? "Untitled"}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary" className="max-w-[160px] truncate">
                            {p?.industry ?? "—"}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <ScorePill score={r.score ?? 0} />
                        {p && (
                          <Button asChild size="icon" variant="ghost" aria-label="Open">
                            <Link to="/projects/$id" params={{ id: p.id }}>
                              <ArrowRight className="h-4 w-4" />
                            </Link>
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Desktop: real table */}
              <div className="hidden md:block">
                <table className="w-full table-fixed border-collapse text-sm">
                  <colgroup>
                    <col />
                    <col style={{ width: "28%" }} />
                    <col style={{ width: "90px" }} />
                    <col style={{ width: "150px" }} />
                    <col style={{ width: "80px" }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Startup</th>
                      <th className="px-3 py-2 font-medium">Industry</th>
                      <th className="px-3 py-2 font-medium">Score</th>
                      <th className="px-3 py-2 font-medium">When</th>
                      <th className="px-3 py-2 text-right font-medium">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...reports].reverse().map((r) => {
                      const p = projectById[r.project_id];
                      return (
                        <tr key={r.id} className="border-b border-border/30 last:border-0">
                          <td className="truncate px-3 py-2 font-medium">{p?.startup_name ?? "Untitled"}</td>
                          <td className="px-3 py-2">
                            <Badge variant="secondary" className="max-w-full truncate">
                              {p?.industry ?? "—"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2"><ScorePill score={r.score ?? 0} /></td>
                          <td className="truncate px-3 py-2 text-muted-foreground">
                            {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {p && (
                              <Button asChild size="sm" variant="ghost">
                                <Link to="/projects/$id" params={{ id: p.id }}>
                                  View <ArrowRight className="ml-1 h-3 w-3" />
                                </Link>
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KPI({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="min-w-0 border-border/60 bg-card/60 backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-glow">
      <CardContent className="flex min-w-0 items-center gap-3 p-4">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-lg font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ScorePill({ score }: { score: number }) {
  const tone =
    score >= 75
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : score >= 50
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : "bg-rose-500/15 text-rose-600 dark:text-rose-400";
  return (
    <span className={`inline-flex min-w-9 justify-center rounded-md px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {score}
    </span>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}
