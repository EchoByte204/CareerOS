// Server-only AI provider. Points at a LOCAL LLM exposing an OpenAI-compatible
// API (Ollama, LM Studio, llama.cpp server, vLLM, text-generation-webui, etc.).
//
// Env vars:
//   LOCAL_LLM_BASE_URL  default "http://localhost:11434/v1"   (Ollama)
//   LOCAL_LLM_MODEL     default "llama3.1:8b"
//   LOCAL_LLM_MODEL_SMART  optional; falls back to LOCAL_LLM_MODEL
//   LOCAL_LLM_API_KEY   optional; sent as Bearer if set, else "local"
//
// The file keeps the historical export names (getGateway, MODELS,
// gatewayChatCompletion, createLovableAiGatewayProvider,
// withLovableAiGatewayRunIdHeader, getLovableAiGatewayResponseHeaders) so
// existing callers do not need to change.

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

function env(name: string, fallback?: string) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

export function getLocalLlmConfig() {
  return {
    baseURL: env("LOCAL_LLM_BASE_URL", "http://localhost:11434/v1")!,
    apiKey: env("LOCAL_LLM_API_KEY", "local")!,
    model: env("LOCAL_LLM_MODEL", "llama3.1:8b")!,
    modelSmart:
      env("LOCAL_LLM_MODEL_SMART") ?? env("LOCAL_LLM_MODEL", "llama3.1:8b")!,
  };
}

// Models are resolved at call time so the .env can change without rebuild.
export const MODELS = {
  get fast() {
    return getLocalLlmConfig().model;
  },
  get smart() {
    return getLocalLlmConfig().modelSmart;
  },
} as const;

// Kept for API parity with the old gateway helper. Run-ID is a Lovable concept
// and is not produced by local LLMs, so this is a no-op pass-through.
export function createLovableAiGatewayProvider(
  _apiKeyIgnored?: string,
  _initialRunId?: string,
) {
  const { baseURL, apiKey } = getLocalLlmConfig();
  const provider = createOpenAICompatible({
    name: "local-llm",
    baseURL,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  return Object.assign(provider, {
    getRunId: () => undefined as string | undefined,
    waitForRunId: async () => undefined as string | undefined,
  });
}

export function getGateway() {
  return createLovableAiGatewayProvider();
}

// Header helpers — kept as no-ops so streaming routes still compile.
export function getLovableAiGatewayResponseHeaders(
  _providerHeaders: HeadersInit | undefined,
  init?: HeadersInit,
) {
  return new Headers(init);
}

export async function withLovableAiGatewayRunIdHeader(
  response: Response,
  _gateway: { getRunId: () => string | undefined; waitForRunId: () => Promise<string | undefined> },
  init?: HeadersInit,
) {
  if (!init) return response;
  const headers = new Headers(response.headers);
  new Headers(init).forEach((v, n) => headers.set(n, v));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Raw chat-completions passthrough. Used historically for multimodal PDF parts;
// local LLMs typically don't accept PDF file parts, so callers should extract
// text first (see `unpdf` in resumes.functions.ts) and pass plain text.
export async function gatewayChatCompletion(body: Record<string, unknown>) {
  const { baseURL, apiKey, model } = getLocalLlmConfig();
  const payload = { model, ...body };
  const res = await fetch(`${baseURL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Local LLM ${res.status}: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as {
    choices: { message: { content: string } }[];
  };
}
