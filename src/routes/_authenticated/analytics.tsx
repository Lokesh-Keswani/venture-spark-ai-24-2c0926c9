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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

  // Trend series
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

  // Industry benchmarks: avg score grouped by industry
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
      .map(([industry, b]) => ({ industry, avg: Math.round(b.sum / b.n), count: b.n }))
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Advanced analytics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Score trends, industry benchmarks, and your full activity stream.
          </p>
        </div>
        <Button asChild className="shadow-glow">
          <Link to="/ideas">
            <Sparkles className="mr-1.5 h-4 w-4" /> Generate ideas
          </Link>
        </Button>
      </div>

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KPI label="Avg startup score" value={isLoading ? "…" : `${avgScore}`} icon={TrendingUp} />
        <KPI
          label="Total analyses"
          value={isLoading ? "…" : String(reports.length)}
          icon={Activity}
        />
        <KPI
          label="Best score"
          value={isLoading ? "…" : best ? `${best.score ?? 0}` : "—"}
          icon={Trophy}
        />
        <KPI
          label="Trend delta"
          value={isLoading ? "…" : `${delta >= 0 ? "+" : ""}${delta}`}
          icon={TrendingUp}
        />
      </div>

      {/* Score trend */}
      <Card className="mt-6 border-border/60 bg-card/60 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-base">Startup score trend</CardTitle>
          <CardDescription>
            Every analysis you've run, in chronological order.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {trend.length === 0 ? (
            <EmptyState label="Run your first analysis to see the trend." />
          ) : (
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#scoreGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Benchmarks + Activity */}
      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="border-border/60 bg-card/60 backdrop-blur lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Industry benchmarks</CardTitle>
            <CardDescription>Average score per industry across your portfolio.</CardDescription>
          </CardHeader>
          <CardContent>
            {benchmarks.length === 0 ? (
              <EmptyState label="No industry data yet." />
            ) : (
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={benchmarks} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="industry"
                      tick={{ fontSize: 11 }}
                      stroke="hsl(var(--muted-foreground))"
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="avg" radius={[6, 6, 0, 0]} fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur lg:col-span-2">
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
                  className="flex items-start justify-between gap-3 rounded-md border border-border/40 bg-background/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.label}</p>
                    <p className="text-xs text-muted-foreground">{a.kind}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Analysis history */}
      <Card className="mt-4 border-border/60 bg-card/60 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-base">Analysis history</CardTitle>
          <CardDescription>Every report you've generated.</CardDescription>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <EmptyState label="No analyses yet." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Startup</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead className="hidden sm:table-cell">When</TableHead>
                    <TableHead className="text-right">Open</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...reports].reverse().map((r) => {
                    const p = projectById[r.project_id];
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          {p?.startup_name ?? "Untitled"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{p?.industry ?? "—"}</Badge>
                        </TableCell>
                        <TableCell>
                          <ScorePill score={r.score ?? 0} />
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                          {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell className="text-right">
                          {p && (
                            <Button asChild size="sm" variant="ghost">
                              <Link to="/projects/$id" params={{ id: p.id }}>
                                View <ArrowRight className="ml-1 h-3 w-3" />
                              </Link>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
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
    <Card className="border-border/60 bg-card/60 backdrop-blur transition-shadow hover:shadow-glow">
      <CardContent className="flex items-center gap-3 p-4">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
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
