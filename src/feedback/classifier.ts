import type { FeedbackClassification } from "../types";

export class FeedbackClassifier {
  constructor(private ai: Ai) {}

  async classify(description: string): Promise<FeedbackClassification> {
    const prompt = `You are a feedback classifier. Output ONLY valid JSON, no markdown.

Feedback: "${description.substring(0, 1000)}"

Determine if this feedback is:
- "technical": bug report with error/code details, feature request with implementation details, crash report, API issue
- "non-technical": general comment, UI preference, praise, vague suggestion

Categorize as: bug, feature, improvement, or general

Extract any key technical info if present.

Respond with ONLY this JSON format:
{"type":"technical","confidence":0.9,"category":"bug","extractedInfo":{"errorMessage":"...","componentName":"...","reproduceSteps":"..."}}`;

    try {
      let response;
      try {
        response = await this.ai.run(
          "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
          { prompt, max_tokens: 2048 }
        );
      } catch {
        response = await this.ai.run(
          "@cf/meta/llama-3.1-8b-instruct-fp8",
          { prompt, max_tokens: 2048 }
        );
      }

      const raw =
        typeof response === "string"
          ? response
          : (response as { response?: unknown }).response;
      let text =
        typeof raw === "string" ? raw : raw != null ? String(raw) : "";

      text = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          type: parsed.type === "technical" ? "technical" : "non-technical",
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
          category: this.validCategory(parsed.category),
          extractedInfo: parsed.extractedInfo ?? undefined,
        };
      }
    } catch (e) {
      console.error("Classification error:", e);
    }

    return this.keywordFallback(description);
  }

  private keywordFallback(description: string): FeedbackClassification {
    const text = description.toLowerCase();
    const isTechnical =
      /error|bug|crash|fail|break|issue|code|api|stack trace|exception|null|undefined|cannot|not working|timeout|500|404/.test(
        text
      );

    return {
      type: isTechnical ? "technical" : "non-technical",
      confidence: 0.5,
      category: isTechnical ? "bug" : "general",
    };
  }

  private validCategory(
    value: unknown
  ): "bug" | "feature" | "improvement" | "general" {
    const valid = ["bug", "feature", "improvement", "general"];
    return valid.includes(value as string)
      ? (value as "bug" | "feature" | "improvement" | "general")
      : "general";
  }
}
