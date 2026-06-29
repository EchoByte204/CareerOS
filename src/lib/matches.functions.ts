import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Compute top job matches using overlap of canonical skill ids between
// `user_skills` and `job_skills`. Required job skills count double.
export const topJobMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: userSkillsRaw }, { data: jobsRaw }] = await Promise.all([
      context.supabase
        .from("user_skills")
        .select("skill_id")
        .eq("user_id", context.userId),
      context.supabase
        .from("jobs")
        .select("id, title, company, location, created_at, job_skills(skill_id, importance)")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const userSkills = new Set<string>(
      (userSkillsRaw ?? []).map((r: { skill_id: string }) => r.skill_id),
    );
    type JobSk = { skill_id: string; importance: string | null };
    type JobRow = {
      id: string; title: string; company: string; location: string | null;
      created_at: string; job_skills: JobSk[] | null;
    };
    const jobs = (jobsRaw ?? []) as unknown as JobRow[];

    const weightFor = (imp: string | null) =>
      imp === "required" ? 3 : imp === "preferred" ? 2 : 1;

    const scored = jobs.map((j) => {
      const skills = j.job_skills ?? [];
      const total = skills.length;
      if (total === 0) return { ...j, score: 0, matched: 0, total: 0, missing: 0 };
      let weighted = 0;
      let weightTotal = 0;
      let matched = 0;
      for (const s of skills) {
        const w = weightFor(s.importance);
        weightTotal += w;
        if (userSkills.has(s.skill_id)) { weighted += w; matched += 1; }
      }
      const score = weightTotal === 0 ? 0 : Math.round((weighted / weightTotal) * 100);
      return { ...j, score, matched, total, missing: total - matched };
    });

    scored.sort((a, b) => b.score - a.score || (b.matched - a.matched));
    return scored.slice(0, 8);
  });
