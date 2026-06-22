import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callGateway } from "./ai.server";

export type Slide = {
  kind:
    | "problem"
    | "solution"
    | "market"
    | "competition"
    | "business_model"
    | "gtm"
    | "financials"
    | "team";
  title: string;
  subtitle?: string;
  bullets: string[];
  body?: string;
};

const Input = z.object({ projectId: z.string().uuid() });

const SYSTEM = `You are an investor-grade pitch deck writer. Produce a tight, specific, founder-quality 8-slide deck. Return STRICT JSON only.`;

export const generatePitchDeck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: proj, error: pe } = await supabase
      .from("startup_projects")
      .select("*")
      .eq("id", data.projectId)
      .single();
    if (pe || !proj) throw new Error("Project not found");

    const prompt = `Build an 8-slide pitch deck for:
Name: ${proj.startup_name}
Industry: ${proj.industry ?? "n/a"}
Audience: ${proj.target_audience ?? "n/a"}
Model: ${proj.business_model ?? "n/a"}
Idea: ${proj.startup_idea}

Return ONLY JSON of shape:
{
  "title": "Deck title",
  "slides": [
    { "kind": "problem",        "title": "...", "subtitle": "...", "bullets": ["3-5 specific bullets"], "body": "1-2 sentence narrative" },
    { "kind": "solution",       "title": "...", "subtitle": "...", "bullets": [...], "body": "..." },
    { "kind": "market",         "title": "Market opportunity", "subtitle": "TAM / SAM / SOM", "bullets": [...], "body": "..." },
    { "kind": "competition",    "title": "Competition", "bullets": [...], "body": "..." },
    { "kind": "business_model", "title": "Business model", "bullets": [...], "body": "..." },
    { "kind": "gtm",            "title": "Go-to-market", "bullets": [...], "body": "..." },
    { "kind": "financials",     "title": "Financial projections", "bullets": ["Y1 revenue", "Y2", "Y3", "Key drivers"], "body": "..." },
    { "kind": "team",           "title": "Team", "bullets": ["roles and why we win"], "body": "..." }
  ]
}
Be specific with numbers, names, dollar amounts where reasonable.`;

    const raw = await callGateway(SYSTEM, prompt, { json: true });
    let deck: { title: string; slides: Slide[] };
    try {
      deck = JSON.parse(raw);
    } catch {
      throw new Error("AI returned invalid JSON. Please retry.");
    }

    const { data: inserted, error } = await supabase
      .from("pitch_decks")
      .insert({
        user_id: userId,
        project_id: proj.id,
        title: deck.title ?? `${proj.startup_name} Pitch Deck`,
        slides: deck.slides as never,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("user_activity").insert({
      user_id: userId,
      kind: "pitch_deck",
      label: `Generated pitch deck for ${proj.startup_name}`,
      ref_id: inserted.id,
    });

    return { id: inserted.id };
  });

const UpdateSchema = z.object({
  id: z.string().uuid(),
  slides: z.array(z.any()),
  title: z.string().optional(),
});

export const updatePitchDeck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpdateSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("pitch_decks")
      .update({ slides: data.slides, ...(data.title ? { title: data.title } : {}) })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
