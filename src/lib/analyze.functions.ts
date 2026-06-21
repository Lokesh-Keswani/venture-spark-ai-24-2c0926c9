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

export type Competitor = {
  name: string;
  type: "direct" | "indirect";
  description: string;
  strength: string;
  weakness: string;
};

export type DeepAnalysis = {
  overall_score: number;
  summary: string;
  market_analysis: {
    market_size: string;
    industry_trends: string[];
    growth_potential: string;
    risks: string[];
    score: number;
  };
  competitor_analysis: {
    competitors: Competitor[];
    competitive_advantages: string[];
    market_gaps: string[];
    score: number;
  };
  business_validation: {
    problem_statement: string;
    solution_validation: string;
    target_customers: string[];
    product_market_fit_score: number;
  };
  revenue_model: {
    revenue_streams: string[];
    pricing_recommendations: string[];
    growth_opportunities: string[];
    score: number;
  };
  risk_analysis: {
    technical_risks: string[];
    business_risks: string[];
    market_risks: string[];
  };
  next_steps: string[];
};

const SYSTEM_PROMPT = `You are a senior venture analyst at VentureIQ AI. Produce a rigorous, candid, founder-grade analysis. Be specific to the idea — avoid generic platitudes. Use real-world reasoning about market dynamics, competitors, and monetization. Return STRICT JSON only matching the requested schema. All scores are integers 0-100.`;

export const analyzeStartup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI service is not configured.");

    const userPrompt = `Analyze this startup and return ONLY valid JSON.

Name: ${data.startup_name}
Industry: ${data.industry || "n/a"}
Target audience: ${data.target_audience || "n/a"}
Business model: ${data.business_model || "n/a"}

Idea:
${data.startup_idea}

JSON schema (exact shape):
{
  "overall_score": 0-100,
  "summary": "2-3 sentence executive summary",
  "market_analysis": {
    "market_size": "TAM/SAM/SOM estimate with rationale",
    "industry_trends": ["3-5 specific current trends"],
    "growth_potential": "growth thesis, 2-3 sentences",
    "risks": ["3-4 market-level risks"],
    "score": 0-100
  },
  "competitor_analysis": {
    "competitors": [
      { "name": "Real or plausible name", "type": "direct" | "indirect", "description": "1 sentence", "strength": "their edge", "weakness": "their gap" }
    ],
    "competitive_advantages": ["3-4 advantages this startup could own"],
    "market_gaps": ["3-4 unmet needs to exploit"],
    "score": 0-100
  },
  "business_validation": {
    "problem_statement": "the core problem in 1-2 sentences",
    "solution_validation": "why this solution fits, 2-3 sentences",
    "target_customers": ["3-4 specific customer segments"],
    "product_market_fit_score": 0-100
  },
  "revenue_model": {
    "revenue_streams": ["3-5 concrete streams"],
    "pricing_recommendations": ["2-4 specific pricing ideas with numbers"],
    "growth_opportunities": ["3-4 expansion paths"],
    "score": 0-100
  },
  "risk_analysis": {
    "technical_risks": ["3-4 risks"],
    "business_risks": ["3-4 risks"],
    "market_risks": ["3-4 risks"]
  },
  "next_steps": ["4-6 concrete next actions"]
}

Provide 4-6 competitors total — mix of direct and indirect.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
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
    let analysis: DeepAnalysis;
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
