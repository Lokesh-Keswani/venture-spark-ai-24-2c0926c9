import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { analyzeStartup } from "@/lib/analyze.functions";

export const Route = createFileRoute("/_authenticated/projects/new")({
  head: () => ({ meta: [{ title: "New analysis — VentureIQ AI" }] }),
  component: NewProject,
});

function NewProject() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const analyze = useServerFn(analyzeStartup);

  const [startup_name, setName] = useState("");
  const [startup_idea, setIdea] = useState("");
  const [industry, setIndustry] = useState("");
  const [target_audience, setAudience] = useState("");
  const [business_model, setModel] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const { data: project, error } = await supabase
        .from("startup_projects")
        .insert({
          user_id: user.id,
          startup_name,
          startup_idea,
          industry: industry || null,
          target_audience: target_audience || null,
          business_model: business_model || null,
        })
        .select("id")
        .single();
      if (error) throw error;

      toast.loading("Analyzing with AI…", { id: "analyze" });
      await analyze({
        data: {
          projectId: project.id,
          startup_name,
          startup_idea,
          industry: industry || null,
          target_audience: target_audience || null,
          business_model: business_model || null,
        },
      });
      toast.success("Analysis ready!", { id: "analyze" });
      qc.invalidateQueries();
      navigate({ to: "/projects/$id", params: { id: project.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to analyze", {
        id: "analyze",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link
        to="/projects"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Projects
      </Link>
      <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
        New analysis
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tell us about the idea — we'll do the rest.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border border-border bg-card p-6 shadow-soft">
        <div className="space-y-1.5">
          <Label htmlFor="name">Startup name</Label>
          <Input id="name" value={startup_name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="idea">The idea</Label>
          <Textarea
            id="idea"
            value={startup_idea}
            onChange={(e) => setIdea(e.target.value)}
            required
            minLength={20}
            maxLength={4000}
            rows={5}
            placeholder="What does it do? For whom? Why now?"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="industry">Industry</Label>
            <Input id="industry" value={industry} onChange={(e) => setIndustry(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="model">Business model</Label>
            <Input id="model" value={business_model} onChange={(e) => setModel(e.target.value)} placeholder="SaaS, marketplace…" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audience">Target audience</Label>
          <Input
            id="audience"
            value={target_audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="Who is this for?"
          />
        </div>
        <Button type="submit" className="w-full shadow-glow" disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" /> Generate analysis
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
