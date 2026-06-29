import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  text: z.string().min(1).max(4000),
  voice: z.string().max(64).optional(),
  format: z.enum(["mp3", "wav", "opus", "aac", "flac", "pcm"]).optional(),
});

/**
 * POST /api/voice/tts
 * Body: { text, voice?, format? }
 * Streams audio bytes back from a local OpenAI-compatible /audio/speech endpoint.
 */
export const Route = createFileRoute("/api/voice/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const base = process.env.LOCAL_TTS_BASE_URL ?? "http://localhost:8000/v1";
        const model = process.env.LOCAL_TTS_MODEL ?? "tts-1";
        const defaultVoice = process.env.LOCAL_TTS_VOICE ?? "alloy";
        const apiKey = process.env.LOCAL_TTS_API_KEY ?? "local";

        let parsed: z.infer<typeof bodySchema>;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "Bad request" },
            { status: 400 },
          );
        }

        const format = parsed.format ?? "mp3";
        try {
          const res = await fetch(`${base.replace(/\/$/, "")}/audio/speech`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              input: parsed.text,
              voice: parsed.voice ?? defaultVoice,
              response_format: format,
            }),
          });
          if (!res.ok || !res.body) {
            const errText = await res.text().catch(() => "");
            return Response.json(
              { error: `TTS failed (${res.status}): ${errText.slice(0, 400)}` },
              { status: 502 },
            );
          }
          const mime =
            format === "mp3"
              ? "audio/mpeg"
              : format === "wav"
                ? "audio/wav"
                : format === "opus"
                  ? "audio/ogg"
                  : format === "aac"
                    ? "audio/aac"
                    : format === "flac"
                      ? "audio/flac"
                      : "application/octet-stream";
          return new Response(res.body, {
            status: 200,
            headers: {
              "Content-Type": res.headers.get("Content-Type") ?? mime,
              "Cache-Control": "no-store",
            },
          });
        } catch (e) {
          return Response.json(
            { error: `TTS unreachable: ${e instanceof Error ? e.message : String(e)}` },
            { status: 502 },
          );
        }
      },
    },
  },
});
