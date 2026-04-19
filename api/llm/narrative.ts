import type { VercelRequest, VercelResponse } from "@vercel/node";

// POST /api/llm/narrative
// Body: { prompt: string, apiKey?: string, apiUrl?: string, model?: string }
// Returns: { narrative: string }
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt, apiKey, apiUrl, model } = req.body ?? {};

  if (!prompt) {
    return res.status(400).json({ error: "Missing required field: prompt" });
  }

  // Use env var as fallback if no apiKey provided in body
  const key      = apiKey  ?? process.env.OPENROUTER_API_KEY ?? "";
  const endpoint = apiUrl  ?? "https://openrouter.ai/api/v1/chat/completions";
  const llmModel = model   ?? "openai/gpt-4.1-mini";

  if (!key) {
    return res.status(400).json({ error: "No API key provided. Set OPENROUTER_API_KEY env var or pass apiKey in body." });
  }

  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": "https://sentiarch-updated.vercel.app",
        "X-Title": "SentiArch Route Simulation",
      },
      body: JSON.stringify({
        model: llmModel,
        messages: [
          {
            role: "system",
            content:
              "You are an architectural experience narrator. Given a route simulation result, write a vivid first-person narrative describing the journey through the building from the agent\'s perspective. Focus on spatial transitions, comfort levels, and emotional responses shaped by the agent\'s MBTI personality. Write in flowing prose, 3-5 sentences. Do NOT use JSON format — just plain narrative text.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.85,
        max_tokens: 600,
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return res.status(upstream.status).json({ error: errText });
    }

    const data = await upstream.json();
    const narrative = data.choices?.[0]?.message?.content ?? "";

    return res.status(200).json({ narrative });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: message });
  }
}
