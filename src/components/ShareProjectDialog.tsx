import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Loader2, Mail, Send, Share2, Trash2, UserMinus, Users2 } from "lucide-react";
import { toast } from "sonner";
import {
  inviteToProject,
  removeProjectMember,
  revokeProjectInvite,
  updateProjectMemberRole,
} from "@/lib/collab.functions";

type Role = "owner" | "admin" | "member";
type InvitableRole = Exclude<Role, "owner">;

function roleBadge(role: string) {
  const map: Record<string, string> = {
    owner: "bg-gradient-to-r from-amber-400 to-rose-500 text-white",
    admin: "bg-primary/15 text-primary",
    member: "bg-muted text-foreground/80",
  };
  return map[role] ?? map.member;
}

export function ShareProjectDialog({
  projectId,
  projectName,
  ownerId,
  trigger,
}: {
  projectId: string;
  projectName: string;
  ownerId: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <Share2 className="mr-1.5 h-4 w-4" /> Share
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg bg-card/95 backdrop-blur">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-primary" /> Share {projectName}
          </DialogTitle>
        </DialogHeader>
        {open && <ShareBody projectId={projectId} ownerId={ownerId} />}
      </DialogContent>
    </Dialog>
  );
}

function ShareBody({ projectId, ownerId }: { projectId: string; ownerId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const invite = useServerFn(inviteToProject);
  const updateRole = useServerFn(updateProjectMemberRole);
  const remove = useServerFn(removeProjectMember);
  const revoke = useServerFn(revokeProjectInvite);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitableRole>("member");
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ["project-share", projectId],
    queryFn: async () => {
      const [{ data: members }, { data: invites }] = await Promise.all([
        supabase
          .from("project_members")
          .select("id, role, user_id, created_at")
          .eq("project_id", projectId)
          .order("created_at"),
        supabase
          .from("project_invites")
          .select("*")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false }),
      ]);

      const userIds = Array.from(new Set([ownerId, ...(members ?? []).map((m) => m.user_id)]));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", userIds);
      const pm = new Map((profiles ?? []).map((p) => [p.id, p]));

      // Dedupe + ensure owner appears once at top, even if also a member row
      const seen = new Set<string>([ownerId]);
      const ownerProfile = pm.get(ownerId);
      const list: {
        id: string;
        user_id: string;
        role: Role;
        profile: typeof ownerProfile;
        isOwner: boolean;
      }[] = [
        {
          id: `owner-${ownerId}`,
          user_id: ownerId,
          role: "owner",
          profile: ownerProfile,
          isOwner: true,
        },
      ];
      for (const m of members ?? []) {
        if (seen.has(m.user_id)) continue;
        seen.add(m.user_id);
        list.push({
          id: m.id,
          user_id: m.user_id,
          role: m.role as Role,
          profile: pm.get(m.user_id),
          isOwner: false,
        });
      }
      return { members: list, invites: invites ?? [] };
    },
  });

  const myRole: Role | undefined =
    user?.id === ownerId
      ? "owner"
      : (data?.members.find((m) => m.user_id === user?.id)?.role as Role | undefined);
  const canManage = myRole === "owner" || myRole === "admin";
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const inv = await invite({ data: { projectId, email: email.trim(), role } });
      const link = `${origin}/invite/${inv.token}`;
      await navigator.clipboard.writeText(link).catch(() => {});
      const emailSent = (inv as { email_sent?: boolean }).email_sent;
      if (emailSent) {
        toast.success(`Invite emailed to ${email.trim()} · link copied`);
      } else {
        toast.success(`Invite created · link copied (email not configured)`);
      }
      setEmail("");
      qc.invalidateQueries({ queryKey: ["project-share", projectId] });
      qc.invalidateQueries({ queryKey: ["project-activity", projectId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to invite");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {canManage ? (
        <form onSubmit={onInvite} className="rounded-xl border border-border bg-background/50 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Invite by email
          </p>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <Input
              type="email"
              required
              placeholder="teammate@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as InvitableRole)}
              className="h-9 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="admin">Admin</option>
              <option value="member">Member</option>
            </select>
            <Button type="submit" disabled={busy} className="col-span-2 sm:col-span-1">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="ml-1.5">Invite</span>
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Invite link is copied to your clipboard. If email is configured, your teammate also receives a "Join project" email.
          </p>
        </form>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          Only Owners and Admins can invite new members.
        </p>
      )}

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Users2 className="h-3.5 w-3.5" /> Members ({data?.members.length ?? 0})
        </p>
        <ul className="space-y-1.5">
          {data?.members.map((m) => {
            // Permission to edit/remove THIS specific row
            const canTouchRow =
              !m.isOwner &&
              (myRole === "owner" || (myRole === "admin" && m.role === "member"));
            return (
              <li
                key={m.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-border bg-background/40 p-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {(m.profile?.full_name || m.profile?.email || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {m.profile?.full_name || m.profile?.email || "Pending member"}
                      {m.user_id === user?.id && (
                        <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                          you
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {m.profile?.email ?? ""}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {canTouchRow ? (
                    <>
                      {myRole === "owner" && (
                        <select
                          value={m.role}
                          onChange={async (e) => {
                            try {
                              await updateRole({
                                data: { memberId: m.id, role: e.target.value as InvitableRole },
                              });
                              qc.invalidateQueries({ queryKey: ["project-share", projectId] });
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "Failed");
                            }
                          }}
                          className="h-7 rounded border border-input bg-background px-1.5 text-[11px]"
                        >
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                        </select>
                      )}
                      {myRole !== "owner" && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${roleBadge(m.role)}`}
                        >
                          {m.role}
                        </span>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={async () => {
                          if (!confirm("Remove this member?")) return;
                          try {
                            await remove({ data: { memberId: m.id } });
                            qc.invalidateQueries({ queryKey: ["project-share", projectId] });
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Failed");
                          }
                        }}
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${roleBadge(m.role)}`}
                    >
                      {m.role}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {(data?.invites ?? []).filter((i) => i.status === "pending").length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Mail className="h-3.5 w-3.5" /> Pending invites
          </p>
          <ul className="space-y-1.5">
            {data!.invites
              .filter((i) => i.status === "pending")
              .map((i) => {
                const link = `${origin}/invite/${i.token}`;
                return (
                  <li
                    key={i.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-border bg-background/40 p-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{i.email}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{i.role}</div>
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
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      {canManage && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={async () => {
                            try {
                              await revoke({ data: { inviteId: i.id } });
                              qc.invalidateQueries({ queryKey: ["project-share", projectId] });
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
        </div>
      )}
    </div>
  );
}
