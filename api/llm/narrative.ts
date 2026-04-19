import type { VercelRequest, VercelResponse } from "@vercel/node";

// POST /api/llm/narrative
// Body: { prompt: string, apiKey: string, apiUrl: string, model: string }
// Returns OpenRouter response proxied back to client
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt, apiKey, apiUrl, model } = req.body ?? {};

  if (!prompt || !apiKey) {
    return res.status(400).json({ error: "Missing required fields: prompt, apiKey" });
  }

  const endpoint = apiUrl ?? "https://openrouter.ai/api/v1/chat/completions";
  const llmModel  = model  ?? "openai/gpt-4o-mini";

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://sentiarch-updated.vercel.app",
        "X-Title": "SentiArch",
      },
      body: JSON.stringify({
        model: llmModel,
        messages: [
          {
            role: "system",
            content:
              "You are an agent-based environmental experience model. Simulate how MBTI personality types experience architectural spaces along a route. CRITICAL: Only reference spatial elements that are explicitly listed. Always respond with valid JSON only, no markdown.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 1200,
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return res.status(upstream.status).json({ error: errText });
    }

    const data = await upstream.json();
    return res.status(200).json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: message });
  }
}
