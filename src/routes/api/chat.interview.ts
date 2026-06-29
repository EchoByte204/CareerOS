import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { z } from "zod";
import {
  createLovableAiGatewayProvider,
  MODELS,
} from "@/lib/ai/gateway.server";

const bodySchema = z.object({
  messages: z.array(z.any()),
  context: z
    .object({
      job_title: z.string().optional(),
      company: z.string().optional(),
      job_description: z.string().max(8000).optional(),
      mode: z.enum(["behavioral", "technical", "mixed"]).default("mixed"),
      resume_summary: z.string().max(4000).optional(),
    })
    .partial()
    .optional(),
});

const SYSTEM = (ctx: NonNullable<z.infer<typeof bodySchema>["context"]>) => `
You are an interview coach running a realistic mock interview.

Mode: ${ctx.mode ?? "mixed"}.
Target role: ${ctx.job_title ?? "(generic)"} at ${ctx.company ?? "(target company)"}.
Job description excerpt:
${(ctx.job_description ?? "").slice(0, 4000) || "(none provided)"}
Candidate background:
${(ctx.resume_summary ?? "").slice(0, 2000) || "(none provided)"}

Rules:
- Ask ONE question per turn. Wait for the candidate's full answer before moving on.
- After each answer, give brief, specific feedback (2–4 bullets): what was strong, what to improve, and a sample STAR-style rewrite of the weakest part if applicable.
- Then ask the next question — progress from warmup to harder follow-ups.
- Stay in role. Do not break character to lecture. Do not output JSON.
- Use markdown lightly: bold for the question, list for feedback.
`.trim();

export const Route = createFileRoute("/api/chat/interview")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload;
        try {
          payload = bodySchema.parse(await request.json());
        } catch (e) {
          return new Response(
            `Bad request: ${e instanceof Error ? e.message : "invalid body"}`,
            { status: 400 },
          );
        }

        const modelMessages = await convertToModelMessages(payload.messages as UIMessage[]);
        const gateway = createLovableAiGatewayProvider();
        const result = streamText({
          model: gateway(MODELS.fast),
          system: SYSTEM(payload.context ?? {}),
          messages: modelMessages,
        });

        return result.toUIMessageStreamResponse();
      },
    },
  },
});
