import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callGateway } from "./ai.server";

export type GeneratedIdea = {
  name: string;
  tagline: string;
  problem: string;
  solution: string;
  target_audience: string;
  business_model: string;
  industry: string;
  why_now: string;
  monetization: string;
  difficulty: "easy" | "medium" | "hard";
  potential_score: number;
};

const InputSchema = z.object({
  category: z.enum(["saas", "ai", "micro-saas", "marketplace", "consumer", "fintech", "custom"]),
  customPrompt: z.string().max(400).optional().nullable(),
  count: z.number().int().min(1).max(8).default(5),
});

const CATEGORY_BRIEFS: Record<string, string> = {
  saas: "B2B SaaS products that solve concrete operational pain points for SMBs or mid-market teams.",
  ai: "AI-native startups that use modern LLMs, agents, or vision models to deliver 10x value over manual workflows.",
  "micro-saas": "Small, focused micro-SaaS that a solo founder can ship in 4-8 weeks and reach $5-20k MRR with low ops burden.",
  marketplace: "Two-sided marketplaces or vertical SaaS-enabled marketplaces with clear take-rate economics.",
  consumer: "Consumer apps with viral mechanics, strong day-1 retention, and clear monetization paths.",
  fintech: "Fintech and embedded-finance ideas that comply with regulation and target real cash-flow pain.",
  custom: "Use the user's custom brief verbatim as the seed.",
};

const SYSTEM = `You are a senior startup strategist who has shipped multiple venture-backed companies. Generate concrete, non-obvious, founder-grade startup ideas. Avoid generic platitudes ("Uber for X"). Each idea must be specific, monetizable, and feel like it could appear in a Y Combinator batch. Return STRICT JSON only.`;

export const generateIdeas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const brief = CATEGORY_BRIEFS[data.category];
    const custom = data.customPrompt?.trim();

    const userPrompt = `Generate ${data.count} startup ideas in this category:

Category: ${data.category}
Brief: ${brief}
${custom ? `User context: ${custom}` : ""}

Return JSON of the exact shape:
{
  "ideas": [
    {
      "name": "string (catchy, brandable, 1-3 words)",
      "tagline": "string (≤ 12 words)",
      "problem": "string (1-2 sentences, specific pain)",
      "solution": "string (1-2 sentences, how product works)",
      "target_audience": "string (specific ICP)",
      "business_model": "string (e.g. 'SaaS $49/mo per seat', 'Marketplace 8% take rate')",
      "industry": "string",
      "why_now": "string (1 sentence on market timing / unlock)",
      "monetization": "string (concrete pricing or revenue mechanism)",
      "difficulty": "easy" | "medium" | "hard",
      "potential_score": integer 0-100
    }
  ]
}

Constraints:
- Names must be unique, not real existing companies.
- Vary the angles — do not produce ${data.count} variations of the same idea.
- Be specific about the wedge ICP.`;

    const raw = await callGateway(SYSTEM, userPrompt, { json: true });
    let parsed: { ideas?: GeneratedIdea[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { ideas: [] };
    }
    return { ideas: (parsed.ideas ?? []).slice(0, data.count) };
  });
