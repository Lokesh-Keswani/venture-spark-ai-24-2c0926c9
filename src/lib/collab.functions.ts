import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Role = z.enum(["admin", "member"]);

export const inviteToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        email: z.string().email(),
        role: Role,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify caller can manage this project.
    const { data: canManage } = await supabaseAdmin.rpc("can_manage_project", {
      _project_id: data.projectId,
      _user_id: context.userId,
    });
    if (!canManage) throw new Error("Only project owners and admins can invite teammates.");

    // If a user already exists with that email and is already a member, skip.
    const email = data.email.trim().toLowerCase();
    const { data: existingMember } = await supabaseAdmin
      .from("project_members")
      .select("id, user_id, role")
      .eq("project_id", data.projectId);
    // Try to resolve email -> user id (best effort)
    const { data: userByEmail } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .ilike("email", email)
      .maybeSingle();
    if (userByEmail && existingMember?.some((m) => m.user_id === userByEmail.id)) {
      throw new Error("This person is already a member of the project.");
    }

    const { data: invite, error } = await supabaseAdmin
      .from("project_invites")
      .insert({
        project_id: data.projectId,
        email,
        role: data.role,
        invited_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("project_activity").insert({
      project_id: data.projectId,
      user_id: context.userId,
      action: "invite.sent",
      target: email,
      meta: { role: data.role },
    });

    return invite;
  });

export const acceptProjectInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ token: z.string().min(8) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite, error } = await supabaseAdmin
      .from("project_invites")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();
    if (error || !invite) throw new Error("Invitation not found.");
    if (invite.status !== "pending") throw new Error("Invitation is no longer valid.");

    const { data: userResp } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = (userResp?.user?.email || "").toLowerCase();
    if (email && invite.email.toLowerCase() !== email) {
      throw new Error("This invitation was sent to a different email address.");
    }

    const { error: me } = await supabaseAdmin
      .from("project_members")
      .upsert(
        { project_id: invite.project_id, user_id: context.userId, role: invite.role },
        { onConflict: "project_id,user_id" },
      );
    if (me) throw new Error(me.message);

    await supabaseAdmin
      .from("project_invites")
      .update({ status: "accepted" })
      .eq("id", invite.id);

    await supabaseAdmin.from("project_activity").insert({
      project_id: invite.project_id,
      user_id: context.userId,
      action: "member.joined",
      target: email || "member",
      meta: { role: invite.role },
    });

    const { data: project } = await supabaseAdmin
      .from("startup_projects")
      .select("id, startup_name")
      .eq("id", invite.project_id)
      .single();

    return { projectId: invite.project_id, name: project?.startup_name ?? "Project" };
  });

export const updateProjectMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ memberId: z.string().uuid(), role: Role }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("project_members")
      .update({ role: data.role })
      .eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeProjectMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ memberId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("project_members")
      .delete()
      .eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revokeProjectInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ inviteId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("project_invites")
      .update({ status: "revoked" })
      .eq("id", data.inviteId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
