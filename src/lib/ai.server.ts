// Server-only helper to call Lovable AI Gateway.
export async function callGateway(
  systemPrompt: string,
  userPrompt: string,
  opts: { json?: boolean } = {},
): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("AI service is not configured.");

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (resp.status === 429) throw new Error("Rate limit reached — please retry in a moment.");
  if (resp.status === 402) throw new Error("AI credits exhausted. Add credits in your Lovable workspace.");
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`AI gateway error: ${t.slice(0, 200)}`);
  }
  const json = await resp.json();
  return json?.choices?.[0]?.message?.content ?? "";
}

export async function callChat(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("AI service is not configured.");
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    }),
  });
  if (resp.status === 429) throw new Error("Rate limit reached — please retry in a moment.");
  if (resp.status === 402) throw new Error("AI credits exhausted.");
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`AI gateway error: ${t.slice(0, 200)}`);
  }
  const json = await resp.json();
  return json?.choices?.[0]?.message?.content ?? "";
}
