import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { acceptProjectInvite } from "@/lib/collab.functions";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/invite/$token")({
  head: () => ({ meta: [{ title: "Project Invitation — VentureIQ AI" }] }),
  component: AcceptInvite,
});

function AcceptInvite() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const accept = useServerFn(acceptProjectInvite);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoTried, setAutoTried] = useState(false);

  async function onAccept() {
    setBusy(true);
    setError(null);
    try {
      const res = await accept({ data: { token } });
      toast.success(`You joined ${res.name}`);
      navigate({ to: "/projects/$id", params: { id: res.projectId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to accept invitation");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!autoTried) {
      setAutoTried(true);
      onAccept();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid min-h-[70vh] place-items-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card/70 p-8 text-center backdrop-blur">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles className="h-6 w-6" />
        </div>
        <h1 className="font-display text-xl font-semibold">Join the project</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          You've been invited to collaborate on a startup project in VentureIQ.
        </p>
        {error ? (
          <div className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        ) : busy ? (
          <div className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Accepting invitation…
          </div>
        ) : null}
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={onAccept} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accept invitation"}
          </Button>
          <Button variant="outline" onClick={() => navigate({ to: "/projects" })}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
