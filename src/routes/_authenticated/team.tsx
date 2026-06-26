import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Users2, ArrowRight, Sparkles, Loader2 } from "lucide-react";
import { createWorkspace } from "@/lib/workspaces.functions";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({ meta: [{ title: "Team — VentureIQ AI" }] }),
  component: TeamIndex,
});

function TeamIndex() {
  const qc = useQueryClient();
  const create = useServerFn(createWorkspace);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["my-workspaces"],
    queryFn: async () => {
      const { data: members } = await supabase
        .from("workspace_members")
        .select("role, workspace:workspaces(*)");
      return (members ?? []).filter((m) => m.workspace);
    },
  });

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await create({ data: { name: name.trim(), description: desc.trim() || null } });
      toast.success("Workspace created");
      setName("");
      setDesc("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["my-workspaces"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create workspace");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto box-border w-full min-w-0 max-w-6xl px-4 py-8 md:px-8">
      <header className="mb-8 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <Sparkles className="h-3 w-3 text-primary" /> Collaborate with your team
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Workspaces</h1>
          <p className="text-sm text-muted-foreground">Shared spaces for startup analyses, pitch decks, and readiness reports.</p>
        </div>
        <Button onClick={() => setOpen((v) => !v)} className="shrink-0">
          <Plus className="h-4 w-4" /> New workspace
        </Button>
      </header>

      {open && (
        <form onSubmit={onCreate} className="mb-6 rounded-2xl border border-border bg-card/70 p-5 backdrop-blur">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input placeholder="Workspace name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input placeholder="Short description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading workspaces…</div>
      ) : !data?.length ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
          <Users2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <div className="text-lg font-semibold">No workspaces yet</div>
          <p className="mt-1 text-sm text-muted-foreground">Create a workspace to invite teammates and collaborate on startup ideas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.map((m) => {
            const w = m.workspace!;
            return (
              <Link
                key={w.id}
                to="/team/$slug"
                params={{ slug: w.slug }}
                className="group relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-2xl border border-border bg-card/70 p-5 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
              >
                <div className="flex items-center justify-between">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Users2 className="h-5 w-5" />
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {m.role}
                  </span>
                </div>
                <div className="truncate text-lg font-semibold">{w.name}</div>
                {w.description && <p className="line-clamp-2 text-sm text-muted-foreground">{w.description}</p>}
                <div className="mt-auto inline-flex items-center gap-1 pt-2 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  Open workspace <ArrowRight className="h-3 w-3" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
