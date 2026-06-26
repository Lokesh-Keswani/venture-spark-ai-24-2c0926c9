import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { acceptInvitation } from "@/lib/workspaces.functions";
import { Loader2, Users2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/invite/$token")({
  head: () => ({ meta: [{ title: "Join Workspace — VentureIQ AI" }] }),
  component: AcceptInvite,
});

function AcceptInvite() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const accept = useServerFn(acceptInvitation);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState<string | undefined>();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await accept({ data: { token } });
        if (!alive) return;
        setStatus("success");
        setTarget(r.slug);
        setMessage(`You've joined ${r.name}.`);
        setTimeout(() => {
          if (r.slug) navigate({ to: "/team/$slug", params: { slug: r.slug } });
        }, 1500);
      } catch (e: unknown) {
        if (!alive) return;
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Invitation invalid");
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, accept, navigate]);

  return (
    <div className="mx-auto box-border w-full min-w-0 max-w-md px-4 py-16">
      <div className="rounded-2xl border border-border bg-card/70 p-8 text-center backdrop-blur">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Users2 className="h-7 w-7" />
        </div>
        {status === "loading" && (
          <>
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
            <h1 className="mt-3 text-lg font-semibold">Accepting invitation…</h1>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
            <h1 className="mt-3 text-lg font-semibold">Welcome aboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">{message}</p>
            {target && (
              <Button className="mt-4" onClick={() => navigate({ to: "/team/$slug", params: { slug: target } })}>
                Open workspace
              </Button>
            )}
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="mx-auto h-8 w-8 text-rose-500" />
            <h1 className="mt-3 text-lg font-semibold">Invitation problem</h1>
            <p className="mt-1 text-sm text-muted-foreground">{message}</p>
            <Button className="mt-4" variant="outline" onClick={() => navigate({ to: "/team" })}>
              Back to workspaces
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
