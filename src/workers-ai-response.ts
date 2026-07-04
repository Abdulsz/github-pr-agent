/**
 * Normalize Workers AI model outputs across catalog formats.
 *
 * Legacy Llama/Mistral models return `{ response, tool_calls }`.
 * OpenAI-compatible models (GLM, Kimi, GPT-OSS) return
 * `{ choices: [{ message: { content, tool_calls } }] }`.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/** Extract assistant text from any supported Workers AI response shape. */
export function extractWorkersAiText(result: unknown): string {
  if (typeof result === "string") return result;
  const record = asRecord(result);
  if (!record) return result != null ? String(result) : "";

  if (typeof record.response === "string") return record.response;

  const choices = record.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const message = asRecord(choices[0])?.message;
    const msgRecord = asRecord(message);
    if (typeof msgRecord?.content === "string") return msgRecord.content;
    if (typeof choices[0] === "string") return choices[0];
  }

  return String(record.response ?? record);
}

/** Extract raw tool call objects from any supported Workers AI response shape. */
export function extractWorkersAiToolCalls(result: unknown): unknown[] {
  const record = asRecord(result);
  if (!record) return [];

  if (Array.isArray(record.tool_calls)) return record.tool_calls;

  const choices = record.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const message = asRecord(choices[0])?.message;
    const toolCalls = asRecord(message)?.tool_calls;
    if (Array.isArray(toolCalls)) return toolCalls;
  }

  return [];
}
