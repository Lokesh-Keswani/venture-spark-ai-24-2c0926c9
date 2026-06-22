import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callGateway } from "./ai.server";

export type Milestone = { title: string; detail: string };
export type RoadmapPlan = {
  mvp: { summary: string; milestones: Milestone[] };
  thirty_day: Milestone[];
  ninety_day: Milestone[];
  one_year: Milestone[];
  product_milestones: string[];
  marketing_milestones: string[];
  technical_milestones: string[];
  hiring_recommendations: string[];
};

const Input = z.object({ projectId: z.string().uuid() });

const SYSTEM = `You are a seasoned operator helping founders sequence their next 12 months. Output specific, time-bounded, action-oriented milestones. Return STRICT JSON only.`;

export const generateRoadmap = createServerFn({ method: "POST" })
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

    const prompt = `Build a tactical execution roadmap for:
Name: ${proj.startup_name}
Industry: ${proj.industry ?? "n/a"}
Audience: ${proj.target_audience ?? "n/a"}
Model: ${proj.business_model ?? "n/a"}
Idea: ${proj.startup_idea}

Return ONLY JSON:
{
  "mvp": { "summary": "1-2 sentence MVP description", "milestones": [{ "title": "...", "detail": "..." } x 4-6] },
  "thirty_day":  [{ "title": "...", "detail": "..." } x 4-6],
  "ninety_day":  [{ "title": "...", "detail": "..." } x 4-6],
  "one_year":    [{ "title": "...", "detail": "..." } x 4-6],
  "product_milestones":   ["4-6 items"],
  "marketing_milestones": ["4-6 items"],
  "technical_milestones": ["4-6 items"],
  "hiring_recommendations": ["3-5 specific roles with rationale"]
}`;

    const raw = await callGateway(SYSTEM, prompt, { json: true });
    let plan: RoadmapPlan;
    try {
      plan = JSON.parse(raw);
    } catch {
      throw new Error("AI returned invalid JSON. Please retry.");
    }

    const { data: inserted, error } = await supabase
      .from("roadmaps")
      .insert({
        user_id: userId,
        project_id: proj.id,
        plan: plan as unknown as object,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("user_activity").insert({
      user_id: userId,
      kind: "roadmap",
      label: `Generated roadmap for ${proj.startup_name}`,
      ref_id: inserted.id,
    });

    return { id: inserted.id };
  });
