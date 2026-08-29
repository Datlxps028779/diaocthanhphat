import Anthropic from "npm:@anthropic-ai/sdk";

export interface RecoClaudeInput {
  model: string;
  maxTokens: number;
  system: string;
  prompt: string;
}

export interface RecoClaudeResult {
  text: string;
  diagnostic: string | null;
}

export async function callRecoClaude(input: RecoClaudeInput): Promise<RecoClaudeResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return { text: "", diagnostic: "no_key" };

  const baseURL = (Deno.env.get("ANTHROPIC_BASE_URL") || "https://api.anthropic.com").replace(/\/+$/, "");
  const client = new Anthropic({
    apiKey,
    baseURL,
    maxRetries: 0,
    defaultHeaders: { Authorization: `Bearer ${apiKey}` },
  });

  try {
    const response = await client.messages.create({
      model: input.model,
      max_tokens: input.maxTokens,
      system: input.system,
      messages: [{ role: "user", content: input.prompt }],
    });
    const text = response.content
      .filter(block => block.type === "text")
      .map(block => block.text)
      .join("\n")
      .trim();
    return { text, diagnostic: text ? null : "empty_content" };
  } catch (error) {
    if (error instanceof Anthropic.APIError && typeof error.status === "number") {
      return { text: "", diagnostic: `http_${error.status}` };
    }
    return { text: "", diagnostic: "network_error" };
  }
}
