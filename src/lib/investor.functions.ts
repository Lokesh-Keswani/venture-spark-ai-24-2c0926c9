import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

export type ReadinessConcern = {
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  explanation: string;
  why_investors_reject: string;
  suggested_solution: string;
};

export type ReadinessWeakness = {
  area: string;
  priority: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  description: string;
  fix: string;
};

export type ImprovementItem = {
  problem: string;
  recommendation: string;
  estimated_impact: string;
  time_required: string;
  difficulty: "easy" | "medium" | "hard";
};

export type ReadinessImprovements = {
  immediate: ImprovementItem[];
  next_30_days: ImprovementItem[];
  next_90_days: ImprovementItem[];
  before_fundraising: ImprovementItem[];
};

export type ReadinessBreakdown = {
  market_opportunity: number;
  problem_validation: number;
  product_readiness: number;
  team_strength: number;
  business_model: number;
  competitive_advantage: number;
  scalability: number;
  revenue_potential: number;
  go_to_market: number;
  investor_appeal: number;
};

export type InvestorReadiness = {
  score: number;
  confidence: "low" | "medium" | "high";
  breakdown: ReadinessBreakdown;
  strengths: string[];
  weaknesses: ReadinessWeakness[];
  concerns: ReadinessConcern[];
  improvements: ReadinessImprovements;
  fundraising_recommendations: string[];
};

const SYS = `You are a senior partner at a venture fund evaluating early-stage startups for VentureIQ AI. Be candid, specific, and grounded. Return STRICT JSON only matching the requested schema. Numeric scores are integers 0-100.`;

export const generateInvestorReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI service is not configured.");

    const { data: project, error: pe } = await context.supabase
      .from("startup_projects")
      .select("*")
      .eq("id", data.projectId)
      .single();
    if (pe || !project) throw new Error(pe?.message || "Project not found");

    const { data: report } = await context.supabase
      .from("startup_reports")
      .select("analysis_json, score, summary")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const userPrompt = `Evaluate this startup's investor readiness. Return ONLY valid JSON.

Startup: ${project.startup_name}
Industry: ${project.industry || "n/a"}
Audience: ${project.target_audience || "n/a"}
Business model: ${project.business_model || "n/a"}

Idea:
${project.startup_idea}

${report ? `Existing analysis context (use it):\n${JSON.stringify(report.analysis_json).slice(0, 4000)}` : ""}

JSON schema:
{
  "score": 0-100,
  "confidence": "low" | "medium" | "high",
  "breakdown": {
    "market_opportunity": 0-100,
    "problem_validation": 0-100,
    "product_readiness": 0-100,
    "team_strength": 0-100,
    "business_model": 0-100,
    "competitive_advantage": 0-100,
    "scalability": 0-100,
    "revenue_potential": 0-100,
    "go_to_market": 0-100,
    "investor_appeal": 0-100
  },
  "strengths": ["4-6 specific strengths"],
  "weaknesses": [
    { "area": "string", "priority": "low|medium|high", "impact": "low|medium|high", "description": "1-2 sentences", "fix": "1 sentence concrete fix" }
  ],
  "concerns": [
    { "category": "market|product|team|execution|competition|revenue|funding", "severity": "low|medium|high|critical", "title": "short headline", "explanation": "2-3 sentences", "why_investors_reject": "1-2 sentences", "suggested_solution": "1-2 sentences" }
  ],
  "improvements": {
    "immediate": [{ "problem": "...", "recommendation": "...", "estimated_impact": "...", "time_required": "...", "difficulty": "easy|medium|hard" }],
    "next_30_days": [...same shape, 2-4 items],
    "next_90_days": [...same shape, 2-4 items],
    "before_fundraising": [...same shape, 2-4 items]
  },
  "fundraising_recommendations": ["4-6 specific recommendations: round size, stage, investor types, milestones"]
}

Generate 5-8 weaknesses and 5-8 concerns spread across categories.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYS },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (resp.status === 429) throw new Error("Rate limit reached — try again shortly.");
    if (resp.status === 402) throw new Error("AI credits exhausted.");
    if (!resp.ok) throw new Error(`AI gateway error: ${(await resp.text()).slice(0, 200)}`);

    const json = await resp.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    let parsed: InvestorReadiness;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("AI returned invalid JSON.");
    }
    const score = Math.max(0, Math.min(100, Math.round(parsed.score ?? 0)));

    // upsert: keep one readiness report per project
    const { data: existing } = await context.supabase
      .from("investor_readiness_reports")
      .select("id")
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();

    const payload = {
      project_id: data.projectId,
      user_id: context.userId,
      score,
      confidence: parsed.confidence ?? "medium",
      breakdown: parsed.breakdown as unknown as Json,
      concerns: parsed.concerns as unknown as Json,
      weaknesses: parsed.weaknesses as unknown as Json,
      improvements: parsed.improvements as unknown as Json,
      strengths: parsed.strengths as unknown as Json,
      recommendations: parsed.fundraising_recommendations as unknown as Json,
    };

    if (existing?.id) {
      const { error } = await context.supabase
        .from("investor_readiness_reports")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { id: existing.id, score };
    }
    const { data: inserted, error } = await context.supabase
      .from("investor_readiness_reports")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id, score };
  });
