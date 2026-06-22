import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Download, Save, Loader2, Presentation } from "lucide-react";
import type { Slide } from "@/lib/pitch.functions";
import { updatePitchDeck } from "@/lib/pitch.functions";
import { exportPitchPdf, uploadExport, downloadBlob } from "@/lib/pdf";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/pitch/$id")({
  head: () => ({ meta: [{ title: "Pitch Deck — VentureIQ AI" }] }),
  component: DeckView,
});

function DeckView() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const update = useServerFn(updatePitchDeck);

  const { data, isLoading } = useQuery({
    queryKey: ["pitch-deck", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pitch_decks")
        .select("id, title, slides, project_id, startup_projects(startup_name)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [slides, setSlides] = useState<Slide[]>([]);
  const [title, setTitle] = useState("");
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setSlides((data.slides as unknown as Slide[]) ?? []);
      setTitle(data.title ?? "");
    }
  }, [data]);

  function updateSlide(i: number, patch: Partial<Slide>) {
    setSlides((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
    setDirty(true);
  }

  async function save() {
    setBusy(true);
    try {
      await update({ data: { id, slides, title } });
      toast.success("Saved");
      setDirty(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function exportPdf() {
    if (!user) return;
    setBusy(true);
    try {
      if (dirty) await update({ data: { id, slides, title } });
      const blob = await exportPitchPdf(title, slides);
      const filename = `${slugify(title)}.pdf`;
      const path = await uploadExport(user.id, "pitch", filename, blob);
      await supabase
        .from("pitch_decks")
        .update({ pdf_path: path })
        .eq("id", id);
      await supabase.from("user_activity").insert({
        user_id: user.id,
        kind: "export",
        label: `Exported pitch deck: ${title}`,
        ref_id: id,
      });
      downloadBlob(blob, filename);
      toast.success("PDF exported");
      setDirty(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading deck…</div>;
  if (!data) return null;

  const current = slides[active];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        to="/pitch"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Pitch decks
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            className="border-0 bg-transparent px-0 font-display text-2xl font-semibold tracking-tight focus-visible:ring-0 sm:text-3xl"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {/* @ts-expect-error nested */}
            {data.startup_projects?.startup_name}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={save} disabled={busy || !dirty}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Save
          </Button>
          <Button size="sm" onClick={exportPdf} disabled={busy} className="shadow-glow">
            <Download className="mr-1.5 h-4 w-4" /> Export PDF
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
        <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {slides.map((s, i) => (
            <li key={i} className="shrink-0 lg:shrink">
              <button
                onClick={() => setActive(i)}
                className={`flex w-40 items-start gap-2 rounded-lg border p-2 text-left text-xs transition lg:w-full ${
                  active === i
                    ? "border-primary/60 bg-primary/10"
                    : "border-border bg-card hover:border-primary/30"
                }`}
              >
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold">
                  {i + 1}
                </span>
                <span className="truncate font-medium">{s.title}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="space-y-4">
          {/* Slide preview */}
          <div className="aspect-video overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-accent/30 to-background p-8 shadow-soft">
            <div className="flex h-full flex-col">
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-primary">
                {current?.kind?.replace("_", " ")}
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                {current?.title}
              </h2>
              {current?.subtitle && (
                <p className="mt-1 text-sm text-muted-foreground">{current.subtitle}</p>
              )}
              {current?.body && (
                <p className="mt-3 text-sm leading-relaxed">{current.body}</p>
              )}
              {current?.bullets?.length ? (
                <ul className="mt-3 space-y-1.5 text-sm">
                  {current.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-auto flex items-center justify-between pt-4 text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Presentation className="h-3 w-3" /> {title}
                </span>
                <span>
                  {active + 1} / {slides.length}
                </span>
              </div>
            </div>
          </div>

          {/* Editor */}
          {current && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-soft">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Title</label>
                <Input
                  value={current.title}
                  onChange={(e) => updateSlide(active, { title: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Subtitle</label>
                <Input
                  value={current.subtitle ?? ""}
                  onChange={(e) => updateSlide(active, { subtitle: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Narrative</label>
                <Textarea
                  value={current.body ?? ""}
                  onChange={(e) => updateSlide(active, { body: e.target.value })}
                  rows={3}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Bullets (one per line)
                </label>
                <Textarea
                  value={(current.bullets ?? []).join("\n")}
                  onChange={(e) =>
                    updateSlide(active, {
                      bullets: e.target.value.split("\n").filter((s) => s.trim()),
                    })
                  }
                  rows={5}
                  className="mt-1"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "deck";
}
