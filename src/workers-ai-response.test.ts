import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractWorkersAiText,
  extractWorkersAiToolCalls,
} from "./workers-ai-response";

describe("extractWorkersAiText", () => {
  it("reads legacy Llama response text", () => {
    assert.equal(extractWorkersAiText({ response: "hello" }), "hello");
  });

  it("reads OpenAI-style choices message content", () => {
    assert.equal(
      extractWorkersAiText({
        choices: [{ message: { role: "assistant", content: "plan json" } }],
      }),
      "plan json"
    );
  });
});

describe("extractWorkersAiToolCalls", () => {
  it("reads legacy top-level tool_calls", () => {
    const calls = [{ name: "read_file", arguments: { path: "a.js" } }];
    assert.deepEqual(extractWorkersAiToolCalls({ tool_calls: calls }), calls);
  });

  it("reads OpenAI-style nested tool_calls", () => {
    const nested = [
      {
        id: "call_1",
        type: "function",
        function: { name: "grep_in_file", arguments: '{"path":"app/page.js"}' },
      },
    ];
    assert.deepEqual(
      extractWorkersAiToolCalls({ choices: [{ message: { tool_calls: nested } }] }),
      nested
    );
  });
});
