import { z } from "zod";

// Structured resume content used across the app.
export const resumeContentSchema = z.object({
  contact: z.object({
    name: z.string().default(""),
    email: z.string().default(""),
    phone: z.string().default(""),
    location: z.string().default(""),
    links: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
  }),
  summary: z.string().default(""),
  experience: z
    .array(
      z.object({
        company: z.string().default(""),
        title: z.string().default(""),
        location: z.string().default(""),
        start: z.string().default(""),
        end: z.string().default(""),
        bullets: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  education: z
    .array(
      z.object({
        school: z.string().default(""),
        degree: z.string().default(""),
        field: z.string().default(""),
        start: z.string().default(""),
        end: z.string().default(""),
        details: z.string().default(""),
      }),
    )
    .default([]),
  projects: z
    .array(
      z.object({
        name: z.string().default(""),
        description: z.string().default(""),
        bullets: z.array(z.string()).default([]),
        link: z.string().default(""),
      }),
    )
    .default([]),
  skills: z.array(z.string()).default([]),
});
export type ResumeContent = z.infer<typeof resumeContentSchema>;

export const emptyResume: ResumeContent = {
  contact: { name: "", email: "", phone: "", location: "", links: [] },
  summary: "",
  experience: [],
  education: [],
  projects: [],
  skills: [],
};

export const jobParsedSchema = z.object({
  required_skills: z.array(z.string()).default([]),
  preferred_skills: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  seniority: z.string().default(""),
  summary: z.string().default(""),
});
export type JobParsed = z.infer<typeof jobParsedSchema>;

export const atsReportSchema = z.object({
  overall_score: z.number().min(0).max(100),
  breakdown: z.object({
    keyword_match: z.number().min(0).max(100),
    impact: z.number().min(0).max(100),
    clarity: z.number().min(0).max(100),
    ats_formatting: z.number().min(0).max(100),
  }),
  matched_keywords: z.array(z.string()).default([]),
  missing_keywords: z.array(z.string()).default([]),
  suggestions: z
    .array(
      z.object({
        section: z.string(),
        title: z.string(),
        rationale: z.string(),
        before: z.string().default(""),
        after: z.string().default(""),
        severity: z.enum(["info", "warn", "critical"]).default("info"),
      }),
    )
    .default([]),
  summary: z.string().default(""),
});
export type AtsReport = z.infer<typeof atsReportSchema>;

export const recommendationsSchema = z.object({
  recommendations: z
    .array(
      z.object({
        kind: z.enum([
          "improve_resume",
          "tailor_resume",
          "add_job",
          "interview_prep",
          "learn_skill",
          "complete_profile",
        ]),
        title: z.string(),
        body: z.string(),
        score: z.number().min(0).max(100),
        action_label: z.string().default("Open"),
        action_path: z.string().default("/dashboard"),
      }),
    )
    .max(8),
});
export type RecommendationsPayload = z.infer<typeof recommendationsSchema>;

// Tailor a resume to a JD: rewrite summary + experience bullets with a change log.
export const tailorResultSchema = z.object({
  summary: z.string().default(""),
  experience: z
    .array(
      z.object({
        company: z.string().default(""),
        title: z.string().default(""),
        bullets: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  emphasized_skills: z.array(z.string()).default([]),
  change_log: z.array(z.string()).default([]),
});
export type TailorResult = z.infer<typeof tailorResultSchema>;

// Skill normalization: extract skills from raw text into canonical entities.
export const skillExtractionSchema = z.object({
  skills: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        kind: z
          .enum(["hard", "soft", "tool", "language", "framework", "domain", "certification"])
          .default("hard"),
        category: z.string().max(60).default(""),
        importance: z
          .enum(["nice_to_have", "preferred", "required", "core"])
          .default("preferred"),
        proficiency: z
          .enum(["beginner", "intermediate", "advanced", "expert"])
          .nullable()
          .default(null),
        years_experience: z.number().min(0).max(60).nullable().default(null),
        confidence: z.number().min(0).max(1).default(0.6),
        evidence: z.string().max(280).default(""),
      }),
    )
    .max(60)
    .default([]),
});
export type SkillExtraction = z.infer<typeof skillExtractionSchema>;

// Learning recommendations — ranked courses/projects/resources for missing skills.
export const learningRecommendationsSchema = z.object({
  recommendations: z
    .array(
      z.object({
        skill: z.string().min(1).max(80),
        resource_type: z
          .enum(["course", "project", "book", "article", "video", "tutorial", "certification", "other"])
          .default("course"),
        title: z.string().min(1).max(160),
        provider: z.string().max(80).default(""),
        url: z.string().max(500).default(""),
        description: z.string().max(400).default(""),
        level: z.enum(["beginner", "intermediate", "advanced"]).default("intermediate"),
        duration: z.string().max(60).default(""),
        cost: z.string().max(40).default(""),
        rationale: z.string().max(280).default(""),
        score: z.number().min(0).max(100).default(60),
      }),
    )
    .max(40)
    .default([]),
});
export type LearningRecommendationsPayload = z.infer<typeof learningRecommendationsSchema>;
