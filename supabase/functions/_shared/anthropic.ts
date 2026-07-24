export interface CallClaudeInput {
  model: string;
  maxTokens: number;
  system?: string;
  prompt: string;
  temperature?: number;
}

export async function callClaude(input: CallClaudeInput): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return "";

  const base = (Deno.env.get("ANTHROPIC_BASE_URL") || "https://api.anthropic.com").replace(/\/+$/, "");

  try {
    const resp = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Authorization": `Bearer ${apiKey}`,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: input.maxTokens,
        ...(input.temperature != null ? { temperature: input.temperature } : {}),
        ...(input.system ? { system: input.system } : {}),
        messages: [{ role: "user", content: input.prompt }],
      }),
    });
    if (!resp.ok) return "";
    const data = await resp.json();
    if (Array.isArray(data.content)) {
      return data.content
        .filter((b: { type?: string }) => b.type === "text")
        .map((b: { text?: string }) => b.text ?? "")
        .join("\n")
        .trim();
    }
    return "";
  } catch {
    return "";
  }
}
