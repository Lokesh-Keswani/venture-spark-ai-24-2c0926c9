import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  );
}

export const createWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().min(2).max(80),
        description: z.string().max(400).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const base = slugify(data.name);
    const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const { data: ws, error } = await context.supabase
      .from("workspaces")
      .insert({
        name: data.name,
        slug,
        description: data.description ?? null,
        owner_id: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const { error: me } = await context.supabase
      .from("workspace_members")
      .insert({ workspace_id: ws.id, user_id: context.userId, role: "owner" });
    if (me) throw new Error(me.message);

    await context.supabase.from("workspace_activity").insert({
      workspace_id: ws.id,
      user_id: context.userId,
      action: "workspace.created",
      target: ws.name,
    });

    return ws;
  });

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        email: z.string().email(),
        role: z.enum(["admin", "editor", "viewer"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: inv, error } = await context.supabase
      .from("workspace_invitations")
      .insert({
        workspace_id: data.workspaceId,
        email: data.email.toLowerCase(),
        role: data.role,
        invited_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("workspace_activity").insert({
      workspace_id: data.workspaceId,
      user_id: context.userId,
      action: "invitation.sent",
      target: data.email,
    });

    return inv;
  });

export const acceptInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(8) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // We need elevated read to find the invite by token even when user isn't yet a member.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite, error: ie } = await supabaseAdmin
      .from("workspace_invitations")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();
    if (ie || !invite) throw new Error("Invitation not found");
    if (invite.status !== "pending") throw new Error("Invitation no longer valid");

    const { data: userResp } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = (userResp?.user?.email || "").toLowerCase();
    if (email && invite.email.toLowerCase() !== email) {
      throw new Error("This invitation was sent to a different email address.");
    }

    const { error: me } = await supabaseAdmin
      .from("workspace_members")
      .upsert(
        { workspace_id: invite.workspace_id, user_id: context.userId, role: invite.role },
        { onConflict: "workspace_id,user_id" },
      );
    if (me) throw new Error(me.message);

    await supabaseAdmin
      .from("workspace_invitations")
      .update({ status: "accepted" })
      .eq("id", invite.id);

    await supabaseAdmin.from("workspace_activity").insert({
      workspace_id: invite.workspace_id,
      user_id: context.userId,
      action: "member.joined",
      target: email || "member",
    });

    const { data: ws } = await supabaseAdmin
      .from("workspaces")
      .select("slug, name")
      .eq("id", invite.workspace_id)
      .single();
    return { workspaceId: invite.workspace_id, slug: ws?.slug, name: ws?.name };
  });

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        memberId: z.string().uuid(),
        role: z.enum(["admin", "editor", "viewer"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("workspace_members")
      .update({ role: data.role })
      .eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ memberId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("workspace_members")
      .delete()
      .eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ invitationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("workspace_invitations")
      .update({ status: "revoked" })
      .eq("id", data.invitationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
