import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

const updateProfileInput = z.object({
  display_name: z.string().trim().max(120).optional(),
  headline: z.string().trim().max(200).optional(),
  location: z.string().trim().max(120).optional(),
  target_roles: z.array(z.string().trim().max(80)).max(10).optional(),
  target_locations: z.array(z.string().trim().max(80)).max(10).optional(),
  seniority: z
    .enum(["intern", "entry", "mid", "senior", "staff", "principal", "exec"])
    .nullable()
    .optional(),
  work_auth: z.string().trim().max(120).optional(),
  links: z.record(z.string(), z.string()).optional(),
  mark_onboarded: z.boolean().optional(),
});

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateProfileInput.parse(d))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { ...data };
    delete patch.mark_onboarded;
    if (data.mark_onboarded) patch.onboarded_at = new Date().toISOString();

    const { data: row, error } = await context.supabase
      .from("profiles")
      .update(patch as any)
      .eq("id", context.userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
