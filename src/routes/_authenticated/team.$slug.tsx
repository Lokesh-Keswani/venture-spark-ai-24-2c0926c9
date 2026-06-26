import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Users2,
  Mail,
  Crown,
  Copy,
  Trash2,
  Loader2,
  Activity,
  FolderKanban,
  TrendingUp,
  Send,
} from "lucide-react";
import {
  inviteMember,
  removeMember,
  updateMemberRole,
  revokeInvitation,
} from "@/lib/workspaces.functions";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/team/$slug")({
  head: () => ({ meta: [{ title: "Workspace — VentureIQ AI" }] }),
  component: WorkspaceDetail,
});

type Role = "owner" | "admin" | "editor" | "viewer";

function roleBadge(role: string) {
  const map: Record<string, string> = {
    owner: "bg-gradient-to-r from-amber-400 to-rose-500 text-white",
    admin: "bg-primary/15 text-primary",
    editor: "bg-blue-500/15 text-blue-600",
    viewer: "bg-muted text-muted-foreground",
  };
  return map[role] ?? map.viewer;
}

function WorkspaceDetail() {
  const { slug } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const invite = useServerFn(inviteMember);
  const remove = useServerFn(removeMember);
  const updateRole = useServerFn(updateMemberRole);
  const revoke = useServerFn(revokeInvitation);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<Role, "owner">>("editor");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["workspace", slug],
    queryFn: async () => {
      const { data: ws, error } = await supabase
        .from("workspaces")
        .select("*")
        .eq("slug", slug)
        .single();
      if (error || !ws) throw error || new Error("Not found");

      const [{ data: members }, { data: invites }, { data: activity }] = await Promise.all([
        supabase
          .from("workspace_members")
          .select("id, role, user_id, created_at, profile:profiles(full_name, email, avatar_url)")
          .eq("workspace_id", ws.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("workspace_invitations")
          .select("*")
          .eq("workspace_id", ws.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("workspace_activity")
          .select("id, action, target, created_at, user:profiles(full_name, email)")
          .eq("workspace_id", ws.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      return { ws, members: members ?? [], invites: invites ?? [], activity: activity ?? [] };
    },
  });

  const myRole: Role | undefined = data?.members.find((m) => m.user_id === user?.id)?.role as Role | undefined;
  const canManage = myRole === "owner" || myRole === "admin";

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!data?.ws || !email.trim()) return;
    setBusy(true);
    try {
      await invite({ data: { workspaceId: data.ws.id, email: email.trim(), role } });
      toast.success(`Invitation sent to ${email}`);
      setEmail("");
      qc.invalidateQueries({ queryKey: ["workspace", slug] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to invite");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const { ws, members, invites, activity } = data;
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="mx-auto box-border w-full min-w-0 max-w-6xl px-4 py-6 md:px-8">
      <Link to="/team" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All workspaces
      </Link>

      <header className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Users2 className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight">{ws.name}</h1>
            {ws.description && <p className="truncate text-sm text-muted-foreground">{ws.description}</p>}
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${roleBadge(myRole ?? "viewer")}`}>
          {myRole ?? "viewer"}
        </span>
      </header>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Members", value: members.length, icon: Users2 },
          { label: "Pending invites", value: invites.filter((i) => i.status === "pending").length, icon: Mail },
          { label: "Activity (recent)", value: activity.length, icon: Activity },
          { label: "Your role", value: myRole ?? "—", icon: Crown },
        ].map((s) => (
          <div key={s.label} className="min-w-0 rounded-xl border border-border bg-card/70 p-4 backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</div>
              <s.icon className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-2 truncate text-2xl font-bold capitalize tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Members + invites */}
        <div className="min-w-0 space-y-6">
          {canManage && (
            <form onSubmit={onInvite} className="rounded-2xl border border-border bg-card/70 p-5 backdrop-blur">
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
                <Send className="h-4 w-4 text-primary" /> Invite teammate
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <Input
                  type="email"
                  required
                  placeholder="teammate@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as typeof role)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="admin">Admin</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <Button type="submit" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Invite
                </Button>
              </div>
            </form>
          )}

          <section className="rounded-2xl border border-border bg-card/70 p-5 backdrop-blur">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
              <Users2 className="h-4 w-4 text-primary" /> Members ({members.length})
            </h2>
            <ul className="divide-y divide-border">
              {members.map((m) => (
                <li key={m.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {(m.profile?.full_name || m.profile?.email || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {m.profile?.full_name || m.profile?.email || "Unknown"}
                        {m.user_id === user?.id && (
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">you</span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{m.profile?.email}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {canManage && m.role !== "owner" ? (
                      <select
                        value={m.role}
                        onChange={async (e) => {
                          try {
                            await updateRole({ data: { memberId: m.id, role: e.target.value as "admin" | "editor" | "viewer" } });
                            qc.invalidateQueries({ queryKey: ["workspace", slug] });
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Failed");
                          }
                        }}
                        className="h-7 rounded border border-input bg-background px-2 text-xs"
                      >
                        <option value="admin">Admin</option>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${roleBadge(m.role)}`}>
                        {m.role}
                      </span>
                    )}
                    {canManage && m.role !== "owner" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={async () => {
                          if (!confirm("Remove this member?")) return;
                          try {
                            await remove({ data: { memberId: m.id } });
                            qc.invalidateQueries({ queryKey: ["workspace", slug] });
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Failed");
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {invites.filter((i) => i.status === "pending").length > 0 && (
            <section className="rounded-2xl border border-border bg-card/70 p-5 backdrop-blur">
              <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
                <Mail className="h-4 w-4 text-primary" /> Pending invitations
              </h2>
              <ul className="space-y-2">
                {invites
                  .filter((i) => i.status === "pending")
                  .map((i) => {
                    const link = `${origin}/invite/${i.token}`;
                    return (
                      <li key={i.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border bg-background/60 p-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{i.email}</div>
                          <div className="truncate text-xs text-muted-foreground">{i.role} · invited {formatDistanceToNow(new Date(i.created_at))} ago</div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              navigator.clipboard.writeText(link);
                              toast.success("Invite link copied");
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" /> Link
                          </Button>
                          {canManage && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={async () => {
                                try {
                                  await revoke({ data: { invitationId: i.id } });
                                  qc.invalidateQueries({ queryKey: ["workspace", slug] });
                                } catch (err) {
                                  toast.error(err instanceof Error ? err.message : "Failed");
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </section>
          )}
        </div>

        {/* Activity feed */}
        <aside className="min-w-0 space-y-6">
          <section className="rounded-2xl border border-border bg-card/70 p-5 backdrop-blur">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
              <Activity className="h-4 w-4 text-primary" /> Activity feed
            </h2>
            {!activity.length ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="space-y-3">
                {activity.map((a) => (
                  <li key={a.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      <TrendingUp className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="break-words text-sm">
                        <span className="font-semibold">{a.user?.full_name || a.user?.email || "Someone"}</span>{" "}
                        <span className="text-muted-foreground">{a.action.replace(/[._]/g, " ")}</span>
                        {a.target && <> · <span className="font-medium">{a.target}</span></>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(a.created_at))} ago
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card/70 p-5 backdrop-blur">
            <h2 className="mb-2 flex items-center gap-2 text-base font-semibold">
              <FolderKanban className="h-4 w-4 text-primary" /> Roles & permissions
            </h2>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li><b className="text-foreground">Owner</b> — full access; manage workspace, billing, members.</li>
              <li><b className="text-foreground">Admin</b> — manage projects, analyses, invite members.</li>
              <li><b className="text-foreground">Editor</b> — create and edit analyses, generate reports & decks.</li>
              <li><b className="text-foreground">Viewer</b> — view-only access to shared work.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
