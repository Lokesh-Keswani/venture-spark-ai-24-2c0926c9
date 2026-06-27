import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Role = z.enum(["admin", "member"]);

/**
 * Caller helpers: enforce role-based controls ON THE SERVER.
 * Owner: invite, remove anyone, change any role.
 * Admin: invite, remove Members only. Cannot touch the Owner or other Admins.
 * Member: read-only on management; cannot invite/remove/change roles.
 */
async function loadCallerRole(
  admin: Awaited<ReturnType<typeof loadAdmin>>,
  projectId: string,
  userId: string,
): Promise<"owner" | "admin" | "member" | null> {
  const { data } = await admin.rpc("project_role", {
    _project_id: projectId,
    _user_id: userId,
  });
  const r = data as string | null;
  if (r === "owner" || r === "admin" || r === "member") return r;
  return null;
}

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

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
    const admin = await loadAdmin();

    const callerRole = await loadCallerRole(admin, data.projectId, context.userId);
    if (callerRole !== "owner" && callerRole !== "admin") {
      throw new Error("Only project owners and admins can invite teammates.");
    }
    // Admins cannot invite other Admins
    if (callerRole === "admin" && data.role === "admin") {
      throw new Error("Admins can only invite Members. Ask the Owner to add another Admin.");
    }

    const email = data.email.trim().toLowerCase();

    // Block self-invite
    const { data: meResp } = await admin.auth.admin.getUserById(context.userId);
    if ((meResp?.user?.email || "").toLowerCase() === email) {
      throw new Error("You can't invite yourself.");
    }

    // Block duplicate active member
    const { data: existingMember } = await admin
      .from("project_members")
      .select("user_id")
      .eq("project_id", data.projectId);
    const { data: userByEmail } = await admin
      .from("profiles")
      .select("id, email")
      .ilike("email", email)
      .maybeSingle();
    if (userByEmail && existingMember?.some((m) => m.user_id === userByEmail.id)) {
      throw new Error("This person is already a member of the project.");
    }
    // Block duplicate pending invite
    const { data: existingInvite } = await admin
      .from("project_invites")
      .select("id, status")
      .eq("project_id", data.projectId)
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle();
    if (existingInvite) {
      throw new Error("An invitation is already pending for this email.");
    }

    const { data: invite, error } = await admin
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

    await admin.from("project_activity").insert({
      project_id: data.projectId,
      user_id: context.userId,
      action: "invite.sent",
      target: email,
      meta: { role: data.role },
    });

    // Best-effort: enqueue an invitation email via the project's email queue
    // (only works once an email domain + transactional templates are configured).
    let emailSent = false;
    try {
      const { data: project } = await admin
        .from("startup_projects")
        .select("startup_name")
        .eq("id", data.projectId)
        .maybeSingle();
      const { data: inviter } = await admin
        .from("profiles")
        .select("full_name, email")
        .eq("id", context.userId)
        .maybeSingle();
      const origin = process.env.VITE_PUBLIC_APP_URL || process.env.APP_URL || "";
      const acceptUrl = `${origin}/invite/${invite.token}`;
      const { error: qErr } = await (admin.rpc as unknown as (n: string, args: unknown) => Promise<{ error: unknown }>)(
        "enqueue_email",
        {
          queue_name: "transactional_emails",
          payload: {
            template_name: "project-invite",
            recipient_email: email,
            template_data: {
              project_name: project?.startup_name ?? "a VentureIQ project",
              inviter_name: inviter?.full_name || inviter?.email || "A teammate",
              role: data.role,
              accept_url: acceptUrl,
            },
            idempotency_key: `invite-${invite.id}`,
          },
        },
      );
      if (!qErr) emailSent = true;
    } catch {
      // Email infra not yet configured — invite still created, share link manually.
    }

    return { ...invite, email_sent: emailSent };
  });

export const acceptProjectInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ token: z.string().min(8) }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await loadAdmin();
    const { data: invite, error } = await admin
      .from("project_invites")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();
    if (error || !invite) throw new Error("Invitation not found.");
    if (invite.status !== "pending") throw new Error("Invitation is no longer valid.");

    const { data: userResp } = await admin.auth.admin.getUserById(context.userId);
    const email = (userResp?.user?.email || "").toLowerCase();
    if (email && invite.email.toLowerCase() !== email) {
      throw new Error("This invitation was sent to a different email address.");
    }

    // Don't add the owner as a member of their own project
    const { data: project } = await admin
      .from("startup_projects")
      .select("id, startup_name, user_id")
      .eq("id", invite.project_id)
      .single();
    if (project && project.user_id !== context.userId) {
      const { error: me } = await admin
        .from("project_members")
        .upsert(
          { project_id: invite.project_id, user_id: context.userId, role: invite.role },
          { onConflict: "project_id,user_id" },
        );
      if (me) throw new Error(me.message);
    }

    await admin.from("project_invites").update({ status: "accepted" }).eq("id", invite.id);

    await admin.from("project_activity").insert({
      project_id: invite.project_id,
      user_id: context.userId,
      action: "member.joined",
      target: email || "member",
      meta: { role: invite.role },
    });

    return { projectId: invite.project_id, name: project?.startup_name ?? "Project" };
  });

export const updateProjectMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ memberId: z.string().uuid(), role: Role }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await loadAdmin();
    const { data: target } = await admin
      .from("project_members")
      .select("project_id, user_id, role")
      .eq("id", data.memberId)
      .maybeSingle();
    if (!target) throw new Error("Member not found.");

    const callerRole = await loadCallerRole(admin, target.project_id, context.userId);
    if (callerRole !== "owner") {
      // Only the Owner can change roles
      throw new Error("Only the Owner can change member roles.");
    }

    const { error } = await admin
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
    const admin = await loadAdmin();
    const { data: target } = await admin
      .from("project_members")
      .select("project_id, user_id, role")
      .eq("id", data.memberId)
      .maybeSingle();
    if (!target) throw new Error("Member not found.");

    const callerRole = await loadCallerRole(admin, target.project_id, context.userId);
    const selfRemove = target.user_id === context.userId;

    if (!selfRemove) {
      if (callerRole !== "owner" && callerRole !== "admin") {
        throw new Error("You do not have permission to remove members.");
      }
      if (callerRole === "admin" && target.role !== "member") {
        throw new Error("Admins can only remove Members.");
      }
    }

    const { error } = await admin.from("project_members").delete().eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revokeProjectInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ inviteId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await loadAdmin();
    const { data: target } = await admin
      .from("project_invites")
      .select("project_id")
      .eq("id", data.inviteId)
      .maybeSingle();
    if (!target) throw new Error("Invite not found.");

    const callerRole = await loadCallerRole(admin, target.project_id, context.userId);
    if (callerRole !== "owner" && callerRole !== "admin") {
      throw new Error("You do not have permission to revoke invites.");
    }

    const { error } = await admin
      .from("project_invites")
      .update({ status: "revoked" })
      .eq("id", data.inviteId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
