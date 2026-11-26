/** Credentialed job types, one org per job. Kept dependency-free so pure modules and tests can import it. */
export const JOB_TYPES = ['content', 'social-pulse', 'youtube', 'monitoring'] as const;
export type JobType = (typeof JOB_TYPES)[number];

export function isJobType(x: string): x is JobType {
  return (JOB_TYPES as readonly string[]).includes(x);
}
