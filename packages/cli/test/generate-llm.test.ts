import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { createAnthropicComplete, isRetryable, LlmError } from "../src/generate/llm.ts";

const MODEL = "test-model";
const KEY = "sk-test-not-a-real-key";

type SseEvent = [string, unknown];

function sseResponse(events: SseEvent[]): Response {
  const body = events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function messageEvents(text: string, stopReason = "end_turn"): SseEvent[] {
  const half = Math.ceil(text.length / 2);
  return [
    [
      "message_start",
      {
        type: "message_start",
        message: {
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: MODEL,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 1, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 },
        },
      },
    ],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    [
      "content_block_delta",
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(0, half) } },
    ],
    [
      "content_block_delta",
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(half) } },
    ],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    [
      "message_delta",
      { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 42 } },
    ],
    ["message_stop", { type: "message_stop" }],
  ];
}

interface Captured {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

function fakeFetch(responses: Array<() => Response>): { fetch: typeof fetch; requests: Captured[] } {
  const requests: Captured[] = [];
  let i = 0;
  const f = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    requests.push({
      url,
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });
    const next = responses[Math.min(i++, responses.length - 1)]!;
    return next();
  };
  return { fetch: f as typeof fetch, requests };
}

describe("isRetryable", () => {
  it("retries overload, rate limits, server and connection errors only", () => {
    expect(isRetryable(new Anthropic.APIConnectionError({ message: "reset" }))).toBe(true);
    expect(isRetryable(new Anthropic.RateLimitError(429, {}, "slow down", new Headers()))).toBe(true);
    expect(isRetryable(new Anthropic.InternalServerError(529, {}, "overloaded", new Headers()))).toBe(true);
    const midStream = new Anthropic.APIError(
      undefined,
      { type: "error", error: { type: "overloaded_error", message: "Overloaded" } },
      undefined,
      undefined,
      "overloaded_error",
    );
    expect(isRetryable(midStream)).toBe(true);
    expect(isRetryable(new Anthropic.BadRequestError(400, {}, "bad", new Headers()))).toBe(false);
    expect(isRetryable(new Anthropic.AuthenticationError(401, {}, "no", new Headers()))).toBe(false);
    expect(isRetryable(new Anthropic.NotFoundError(404, {}, "no model", new Headers()))).toBe(false);
    expect(isRetryable(new Error("other"))).toBe(false);
  });
});

describe("createAnthropicComplete", () => {
  it("streams a request with a cached system prompt and returns text and usage", async () => {
    const { fetch, requests } = fakeFetch([() => sseResponse(messageEvents("Hello from the stream."))]);
    const progress: number[] = [];
    const complete = createAnthropicComplete({ apiKey: KEY, model: MODEL, maxTokens: 64000, thinking: true, fetch });
    const result = await complete("Write the concept.", {
      stage: "concept",
      system: "SYSTEM PROMPT",
      onProgress: (n) => progress.push(n),
    });
    expect(result.text).toBe("Hello from the stream.");
    expect(result.stopReason).toBe("end_turn");
    expect(result.usage).toEqual({
      inputTokens: 100,
      outputTokens: 42,
      cacheReadInputTokens: 900,
      cacheCreationInputTokens: 0,
    });
    expect(progress.at(-1)).toBe("Hello from the stream.".length);

    expect(requests).toHaveLength(1);
    const req = requests[0]!;
    expect(req.url).toContain("/v1/messages");
    expect(req.body.model).toBe(MODEL);
    expect(req.body.stream).toBe(true);
    expect(req.body.max_tokens).toBe(64000);
    expect(req.body.thinking).toEqual({ type: "adaptive" });
    expect(req.body.system).toEqual([{ type: "text", text: "SYSTEM PROMPT", cache_control: { type: "ephemeral" } }]);
    expect(req.body.messages).toEqual([{ role: "user", content: "Write the concept." }]);
    expect(req.body).not.toHaveProperty("temperature");
    expect(req.body).not.toHaveProperty("output_config");
  });

  it("omits thinking when disabled and passes effort when given", async () => {
    const { fetch, requests } = fakeFetch([() => sseResponse(messageEvents("ok"))]);
    const complete = createAnthropicComplete({
      apiKey: KEY,
      model: MODEL,
      maxTokens: 1000,
      thinking: false,
      effort: "high",
      fetch,
    });
    await complete("x", { stage: "world" });
    expect(requests[0]!.body).not.toHaveProperty("thinking");
    expect(requests[0]!.body).not.toHaveProperty("system");
    expect(requests[0]!.body.output_config).toEqual({ effort: "high" });
  });

  it("retries an overload error that arrives mid-stream", async () => {
    const overloaded = () =>
      sseResponse([
        ...messageEvents("partial").slice(0, 3),
        ["error", { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }],
      ]);
    const { fetch, requests } = fakeFetch([overloaded, () => sseResponse(messageEvents("second try"))]);
    const logs: string[] = [];
    const sleeps: number[] = [];
    const complete = createAnthropicComplete({
      apiKey: KEY,
      model: MODEL,
      maxTokens: 1000,
      thinking: true,
      fetch,
      log: (l) => logs.push(l),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      backoffMs: 10,
    });
    const result = await complete("x", { stage: "logic" });
    expect(result.text).toBe("second try");
    expect(requests).toHaveLength(2);
    expect(sleeps).toEqual([10]);
    expect(logs.join("\n")).toContain("retrying");
    expect(logs.join("\n")).not.toContain(KEY);
  });

  it("turns a refusal and non-retryable errors into LlmError without leaking the key", async () => {
    const refusal = fakeFetch([() => sseResponse(messageEvents("", "refusal"))]);
    const c1 = createAnthropicComplete({
      apiKey: KEY,
      model: MODEL,
      maxTokens: 1000,
      thinking: true,
      fetch: refusal.fetch,
    });
    await expect(c1("x", { stage: "concept" })).rejects.toThrow(LlmError);
    await expect(c1("x", { stage: "concept" })).rejects.toThrow(/refusal/);

    const unauthorized = fakeFetch([
      () =>
        new Response(
          JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }),
          {
            status: 401,
            headers: { "content-type": "application/json" },
          },
        ),
    ]);
    const c2 = createAnthropicComplete({
      apiKey: KEY,
      model: MODEL,
      maxTokens: 1000,
      thinking: true,
      fetch: unauthorized.fetch,
    });
    const err = await c2("x", { stage: "concept" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as Error).message).toContain("ANTHROPIC_API_KEY");
    expect((err as Error).message).not.toContain(KEY);
    expect(unauthorized.requests).toHaveLength(1);
  });
});
