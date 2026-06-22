import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callChat } from "./ai.server";

const SendSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().min(1).max(8000),
});

const COACH_SYSTEM = `You are an experienced AI co-founder for early-stage founders. You give crisp, candid, practical advice across strategy, product, marketing, customer acquisition, technical architecture, and fundraising. Be specific to the user's context. Prefer bullet points and concrete next steps. Reference prior messages in the thread when relevant. Keep responses tight (under 350 words) unless the user asks for depth.`;

export const sendCoachMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SendSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify conversation ownership and load project context + history
    const { data: conv, error: ce } = await supabase
      .from("chat_conversations")
      .select("id, project_id, title")
      .eq("id", data.conversationId)
      .single();
    if (ce || !conv) throw new Error("Conversation not found");

    let context_block = "";
    if (conv.project_id) {
      const { data: proj } = await supabase
        .from("startup_projects")
        .select("startup_name, startup_idea, industry, target_audience, business_model")
        .eq("id", conv.project_id)
        .maybeSingle();
      if (proj) {
        context_block = `\n\nSTARTUP CONTEXT:\nName: ${proj.startup_name}\nIndustry: ${proj.industry ?? "n/a"}\nAudience: ${proj.target_audience ?? "n/a"}\nModel: ${proj.business_model ?? "n/a"}\nIdea: ${proj.startup_idea}`;
      }
    }

    // Persist user message
    const { error: ue } = await supabase.from("chat_messages").insert({
      conversation_id: conv.id,
      user_id: userId,
      role: "user",
      content: data.content,
    });
    if (ue) throw new Error(ue.message);

    // Load recent history (last 30 messages)
    const { data: hist, error: he } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true })
      .limit(30);
    if (he) throw new Error(he.message);

    const messages = (hist ?? []).map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    const reply = await callChat(COACH_SYSTEM + context_block, messages);

    const { data: assistant, error: ae } = await supabase
      .from("chat_messages")
      .insert({
        conversation_id: conv.id,
        user_id: userId,
        role: "assistant",
        content: reply,
      })
      .select("id, content, created_at")
      .single();
    if (ae) throw new Error(ae.message);

    // Update conversation timestamp + title if first exchange
    const updates: { updated_at: string; title?: string } = { updated_at: new Date().toISOString() };
    if ((hist?.length ?? 0) <= 1) {
      updates.title = data.content.slice(0, 60);
    }
    await supabase.from("chat_conversations").update(updates).eq("id", conv.id);

    await supabase.from("user_activity").insert({
      user_id: userId,
      kind: "chat",
      label: `Asked co-founder: ${data.content.slice(0, 60)}`,
      ref_id: conv.id,
    });

    return { id: assistant.id, content: assistant.content, created_at: assistant.created_at };
  });
