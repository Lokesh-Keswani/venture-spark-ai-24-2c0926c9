import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const InputSchema = z.object({
  projectId: z.string().uuid(),
  startup_name: z.string().min(1).max(120),
  startup_idea: z.string().min(10).max(4000),
  industry: z.string().max(120).optional().nullable(),
  target_audience: z.string().max(400).optional().nullable(),
  business_model: z.string().max(400).optional().nullable(),
});

type AnalysisJson = {
  overall_score: number;
  summary: string;
  market_opportunity: { score: number; notes: string };
  feasibility: { score: number; notes: string };
  competition: { score: number; notes: string };
  monetization: { score: number; notes: string };
  risks: string[];
  next_steps: string[];
};

const SYSTEM_PROMPT = `You are a senior venture analyst at VentureIQ AI. Given a startup idea, return a rigorous, candid analysis in strict JSON matching the requested schema. Scores are 0-100 integers. Be specific, avoid generic platitudes.`;

export const analyzeStartup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI service is not configured.");

    const userPrompt = `Analyze this startup:

Name: ${data.startup_name}
Industry: ${data.industry || "n/a"}
Target audience: ${data.target_audience || "n/a"}
Business model: ${data.business_model || "n/a"}

Idea:
${data.startup_idea}

Return ONLY a valid JSON object with this exact shape:
{
  "overall_score": number 0-100,
  "summary": string (2-3 sentences),
  "market_opportunity": { "score": 0-100, "notes": string },
  "feasibility": { "score": 0-100, "notes": string },
  "competition": { "score": 0-100, "notes": string },
  "monetization": { "score": 0-100, "notes": string },
  "risks": [string, string, string],
  "next_steps": [string, string, string, string]
}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (resp.status === 429) throw new Error("Rate limit reached — please try again in a moment.");
    if (resp.status === 402) throw new Error("AI credits exhausted. Add credits in your Lovable workspace.");
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`AI gateway error: ${t.slice(0, 200)}`);
    }

    const json = await resp.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    let analysis: AnalysisJson;
    try {
      analysis = JSON.parse(content);
    } catch {
      throw new Error("AI returned an invalid response. Please retry.");
    }

    const score = Math.max(0, Math.min(100, Math.round(analysis.overall_score ?? 0)));

    const { data: inserted, error } = await context.supabase
      .from("startup_reports")
      .insert({
        project_id: data.projectId,
        user_id: context.userId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        analysis_json: analysis as any,
        score,
        summary: analysis.summary ?? "",
      })
      .select("id, score, summary, created_at")
      .single();

    if (error) throw new Error(error.message);
    return { id: inserted.id, score: inserted.score, summary: inserted.summary };
  });
