import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/voice/transcribe
 * Body: multipart/form-data with field `file` (audio blob, typically WAV).
 * Forwards to a local OpenAI-compatible Whisper server and returns { text }.
 */
export const Route = createFileRoute("/api/voice/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const base = process.env.LOCAL_STT_BASE_URL ?? "http://localhost:8080/v1";
        const model = process.env.LOCAL_STT_MODEL ?? "whisper-1";
        const apiKey = process.env.LOCAL_STT_API_KEY ?? "local";

        let inboundForm: FormData;
        try {
          inboundForm = await request.formData();
        } catch {
          return Response.json({ error: "Expected multipart/form-data" }, { status: 400 });
        }

        const file = inboundForm.get("file");
        if (!(file instanceof Blob)) {
          return Response.json({ error: "Missing `file`" }, { status: 400 });
        }
        if (file.size < 2048) {
          return Response.json({ error: "Recording too short" }, { status: 400 });
        }

        const upstream = new FormData();
        const name = (file as File).name ?? "recording.wav";
        upstream.append("file", file, name);
        upstream.append("model", model);
        const language = inboundForm.get("language");
        if (typeof language === "string" && language) upstream.append("language", language);
        upstream.append("response_format", "json");

        try {
          const res = await fetch(`${base.replace(/\/$/, "")}/audio/transcriptions`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: upstream,
          });
          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            return Response.json(
              { error: `STT failed (${res.status}): ${errText.slice(0, 400)}` },
              { status: 502 },
            );
          }
          const json = (await res.json()) as { text?: string };
          return Response.json({ text: (json.text ?? "").trim() });
        } catch (e) {
          return Response.json(
            { error: `STT unreachable: ${e instanceof Error ? e.message : String(e)}` },
            { status: 502 },
          );
        }
      },
    },
  },
});
