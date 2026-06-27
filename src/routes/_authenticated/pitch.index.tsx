import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Presentation, Plus, Loader2, Sparkles, Trash2, Download } from "lucide-react";
import { generatePitchDeck, type Slide } from "@/lib/pitch.functions";
import { exportPitchPdf, uploadExport, downloadBlob } from "@/lib/pdf";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/pitch")({
  head: () => ({ meta: [{ title: "Pitch Decks — VentureIQ AI" }] }),
  component: PitchList,
});

function PitchList() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const generate = useServerFn(generatePitchDeck);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dlId, setDlId] = useState<string | null>(null);

  async function download(id: string, title: string) {
    if (!user) return;
    setDlId(id);
    try {
      toast.loading("Preparing PDF…", { id: "dl" });
      const { data: deck, error } = await supabase
        .from("pitch_decks")
        .select("slides, title")
        .eq("id", id)
        .single();
      if (error) throw error;
      const blob = await exportPitchPdf(deck.title ?? title, (deck.slides as unknown as Slide[]) ?? []);
      const filename = `${(deck.title ?? title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "deck"}.pdf`;
      const path = await uploadExport(user.id, "pitch", filename, blob);
      await supabase.from("pitch_decks").update({ pdf_path: path }).eq("id", id);
      await supabase.from("user_activity").insert({
        user_id: user.id, kind: "export",
        label: `Exported pitch deck: ${deck.title ?? title}`, ref_id: id,
      });
      downloadBlob(blob, filename);
      toast.success("Downloaded", { id: "dl" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed", { id: "dl" });
    } finally {
      setDlId(null);
    }
  }

  const { data } = useQuery({
    queryKey: ["pitch-decks", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [decks, projects] = await Promise.all([
        supabase
          .from("pitch_decks")
          .select("id, title, created_at, project_id")
          .order("created_at", { ascending: false }),
        supabase.from("startup_projects").select("id, startup_name"),
      ]);
      if (decks.error) throw decks.error;
      if (projects.error) throw projects.error;
      return { decks: decks.data ?? [], projects: projects.data ?? [] };
    },
  });

  async function gen(projectId: string) {
    setBusyId(projectId);
    try {
      toast.loading("Generating investor-ready deck…", { id: "deck" });
      await generate({ data: { projectId } });
      toast.success("Pitch deck ready!", { id: "deck" });
      qc.invalidateQueries({ queryKey: ["pitch-decks"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed", { id: "deck" });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this deck?")) return;
    const { error } = await supabase.from("pitch_decks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["pitch-decks"] });
  }

  const projects = data?.projects ?? [];
  const decks = data?.decks ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Pitch decks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Investor-grade decks generated from your projects.
          </p>
        </div>
      </div>

      <section className="mt-7">
        <h2 className="mb-3 font-display text-sm font-semibold text-muted-foreground">
          Generate a new deck
        </h2>
        {projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              You need at least one project to generate a deck.
            </p>
            <Button asChild className="mt-3" size="sm">
              <Link to="/projects/new">Create a project</Link>
            </Button>
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
                  <p className="mt-0.5 text-xs text-muted-foreground">Generate 8-slide deck</p>
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

      <section className="mt-10">
        <h2 className="mb-3 font-display text-sm font-semibold text-muted-foreground">
          Your decks
        </h2>
        {decks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-10 text-center">
            <Presentation className="h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">No decks generated yet.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {decks.map((d) => {
              const proj = projects.find((p) => p.id === d.project_id);
              return (
                <div
                  key={d.id}
                  className="group relative rounded-xl border border-border bg-card p-4 shadow-soft transition hover:border-primary/40"
                >
                  <Link
                    to="/pitch/$id"
                    params={{ id: d.id }}
                    className="block"
                  >
                    <div className="aspect-video rounded-lg bg-gradient-to-br from-primary/15 via-accent/40 to-background p-4">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {proj?.startup_name ?? "Pitch deck"}
                      </p>
                      <p className="mt-2 line-clamp-3 font-display text-base font-semibold">
                        {d.title}
                      </p>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                    </p>
                  </Link>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => download(d.id, d.title)}
                      disabled={dlId === d.id}
                    >
                      {dlId === d.id ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Download Pitch Deck
                    </Button>
                  </div>
                  <button
                    onClick={() => remove(d.id)}
                    className="absolute right-2 top-2 hidden rounded p-1 text-muted-foreground hover:bg-background hover:text-destructive group-hover:inline-flex"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export { Plus };
