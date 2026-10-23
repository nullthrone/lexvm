/**
 * LLM access for the generation pipeline.
 *
 * The pipeline only knows the `CompleteFn` interface, so tests can inject a
 * fake model. `createAnthropicComplete` is the real implementation on top of
 * the Anthropic SDK: streaming (large outputs would otherwise hit HTTP
 * timeouts), a cached system prompt shared by all stages, the SDK's built-in
 * retries for failed requests, plus a retry with backoff for errors that
 * arrive mid-stream (overload, rate limits, dropped connections).
 *
 * The model id is never hard-coded: it comes from --model or LEXVM_MODEL.
 * The API key is passed in from ANTHROPIC_API_KEY and never logged.
 */
import Anthropic from "@anthropic-ai/sdk";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export interface CompleteOptions {
  /** Pipeline stage, for logging. */
  stage: string;
  /** Stable system prompt (cached by the API across stages). */
  system?: string;
  /** Called with the number of characters received so far. */
  onProgress?: (chars: number) => void;
}

export interface CompletionResult {
  text: string;
  usage?: TokenUsage;
  /** e.g. "end_turn", "max_tokens", "refusal". */
  stopReason?: string | null;
}

export type CompleteFn = (prompt: string, options: CompleteOptions) => Promise<CompletionResult>;

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

export interface AnthropicConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  /** Request adaptive thinking (default true). Disable for models that do not support it. */
  thinking: boolean;
  effort?: Effort | undefined;
  /** Retries for mid-stream failures, on top of the SDK's own request retries. */
  streamRetries?: number;
  /** Base delay for mid-stream retries in ms (doubles each attempt). */
  backoffMs?: number;
  log?: (line: string) => void;
  /** Injection point for tests. */
  sleep?: (ms: number) => Promise<void>;
}

/** Thrown for failures that retrying cannot fix (refusal, authentication, bad request). */
export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmError";
  }
}

/** Overload, rate limit, server and connection errors are worth retrying. */
export function isRetryable(err: unknown): boolean {
  if (err instanceof Anthropic.APIConnectionError) return true;
  if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) return true;
  if (err instanceof Anthropic.APIError) {
    if (err.type === "overloaded_error" || err.type === "rate_limit_error" || err.type === "api_error") return true;
    if (err.type === "timeout_error") return true;
    if (typeof err.status === "number" && (err.status === 408 || err.status === 409 || err.status >= 500)) return true;
  }
  return false;
}

function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "authentication failed — check ANTHROPIC_API_KEY";
  if (err instanceof Anthropic.PermissionDeniedError) return "permission denied for this API key or model";
  if (err instanceof Anthropic.NotFoundError) return "not found — check the model id (--model / LEXVM_MODEL)";
  if (err instanceof Anthropic.BadRequestError) return `bad request: ${err.message}`;
  if (err instanceof Anthropic.APIError) return `${err.type ?? "API error"} ${err.status ?? ""}: ${err.message}`.trim();
  return err instanceof Error ? err.message : String(err);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createAnthropicComplete(config: AnthropicConfig): CompleteFn {
  const client = new Anthropic({
    apiKey: config.apiKey,
    // SDK-level retries cover failed requests (429, 5xx, overload, connection errors) with backoff.
    maxRetries: 4,
    // Streaming keeps the connection alive; this only bounds a stalled request.
    timeout: 30 * 60 * 1000,
  });
  const log = config.log ?? (() => {});
  const sleep = config.sleep ?? defaultSleep;
  const streamRetries = config.streamRetries ?? 3;
  const backoffMs = config.backoffMs ?? 15_000;

  return async (prompt, options) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const stream = client.messages.stream({
          model: config.model,
          max_tokens: config.maxTokens,
          ...(options.system
            ? { system: [{ type: "text" as const, text: options.system, cache_control: { type: "ephemeral" as const } }] }
            : {}),
          messages: [{ role: "user", content: prompt }],
          ...(config.thinking ? { thinking: { type: "adaptive" as const } } : {}),
          ...(config.effort ? { output_config: { effort: config.effort } } : {}),
        });
        if (options.onProgress) {
          const onProgress = options.onProgress;
          stream.on("text", (_delta, snapshot) => onProgress(snapshot.length));
        }
        const message = await stream.finalMessage();
        if (message.stop_reason === "refusal") {
          throw new LlmError(
            `the model declined the ${options.stage} request (stop_reason: refusal). Rephrase the idea or try another model.`,
          );
        }
        const text = message.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        const u = message.usage;
        return {
          text,
          stopReason: message.stop_reason,
          usage: {
            inputTokens: u.input_tokens,
            outputTokens: u.output_tokens,
            cacheReadInputTokens: u.cache_read_input_tokens ?? 0,
            cacheCreationInputTokens: u.cache_creation_input_tokens ?? 0,
          },
        };
      } catch (err) {
        if (err instanceof LlmError) throw err;
        if (isRetryable(err) && attempt < streamRetries) {
          const delay = backoffMs * 2 ** attempt;
          log(`  ${options.stage}: ${describeError(err)}; retrying in ${Math.round(delay / 1000)} s`);
          await sleep(delay);
          continue;
        }
        throw new LlmError(`${options.stage}: ${describeError(err)}`);
      }
    }
  };
}
