/**
 * jobErrorMessages.ts — turns a raw scout_jobs.error string (engineer-speak,
 * written by run-pipeline.js for logs/Telegram) into plain-language copy for
 * the dashboard (2026-09-02 UX pass, direct user feedback: "that's not very
 * UX friendly").
 *
 * The raw formats this parses (see scout/run-pipeline.js):
 *   "Cancelled — <reason>"                                   — manual cancel
 *   "Structural gate FAIL before P<n>: <failures>"            — mid-run gate
 *   "Verifier FAIL: <failures>"                                — end-of-run
 *   "P<n> <phase name>: <message>"                             — a phase itself threw
 *   "Pipeline crashed: <message>"                              — top-level crash
 * `<failures>` is a " | "-joined list of entries like:
 *   "P3 10/40 (this run) < 50% and Top20 4/20 (...)"           — count-based
 *   "P7 market_intelligence missing"                           — boolean-based
 *   "P1 migration incomplete: only 3/139 scraped ASINs..."     — migration-loss
 *
 * Never throws — any unrecognized shape falls back to a generic-but-honest
 * message. The raw string is ALWAYS returned too (`raw`) so callers can put
 * it behind a collapsible "Technical details" — never hidden entirely, just
 * not the first thing a user has to parse.
 */

/** Plain-language noun for what a phase collects/produces — used in both the
 * title and the one-sentence explanation. Deliberately short. */
const PHASE_TOPIC: Record<number, string> = {
  1: "product data",
  2: "pricing & sales data",
  3: "customer reviews",
  4: "supplement-facts data",
  5: "deep research",
  6: "product analysis",
  7: "market analysis",
  8: "packaging analysis",
  9: "the formula brief",
  10: "formula QA",
  11: "competitive benchmarking",
  12: "the FDA compliance check",
  13: "final sign-off",
};

/** Gerund form for "a problem while ___ing" phrasing when a phase itself
 * throws (not a coverage-gate failure). */
const PHASE_GERUND: Record<number, string> = {
  1: "collecting product data",
  2: "collecting pricing & sales data",
  3: "collecting customer reviews",
  4: "reading supplement-facts labels",
  5: "researching competitor formulas",
  6: "analyzing products",
  7: "analyzing the market",
  8: "analyzing packaging",
  9: "writing the formula brief",
  10: "reviewing the formula",
  11: "benchmarking competitors",
  12: "checking FDA compliance",
  13: "finalizing sign-off",
};

export interface HumanizedJobError {
  /** Short, plain-language headline — e.g. "Stopped early: not enough customer reviews". */
  title: string;
  /** One sentence explaining what happened and why, in plain words. */
  description: string;
  /** The phase number this failure is about, when derivable — used to default
   * the "Retry from P<n>" action to the right phase. Null when no specific
   * phase could be identified (falls back to job.current_phase upstream). */
  phase: number | null;
  /** The original, unmodified scout_jobs.error string — always shown behind
   * a "Technical details" toggle, never lost. */
  raw: string;
}

/** Pulls the first "P<n> <done>/<total>" count out of a failures string, e.g.
 * "P3 10/40 (this run) < 50% and Top20 4/20 (...)" -> { phase: 3, done: 10, total: 40 }. */
function firstCountFailure(failures: string): { phase: number; done: number; total: number } | null {
  const m = failures.match(/P(\d+)\s+(\d+)\/(\d+)/);
  if (!m) return null;
  return { phase: Number(m[1]), done: Number(m[2]), total: Number(m[3]) };
}

/** Pulls the first "P<n> <field> missing" boolean-style failure, e.g.
 * "P7 market_intelligence missing" -> { phase: 7 }. */
function firstMissingFailure(failures: string): { phase: number } | null {
  const m = failures.match(/P(\d+)\s+\S+\s+missing/);
  if (!m) return null;
  return { phase: Number(m[1]) };
}

function describeFailures(failures: string, verb: "Stopped early" | "Finished, but"): { title: string; description: string; phase: number | null } {
  const count = firstCountFailure(failures);
  if (count) {
    const topic = PHASE_TOPIC[count.phase] ?? `phase ${count.phase} data`;
    return {
      title: verb === "Stopped early" ? `Stopped early: not enough ${topic}` : `Finished, but ${topic} is incomplete`,
      description:
        verb === "Stopped early"
          ? `Only ${count.done} of ${count.total} products had ${topic} collected, so we stopped before spending on the next step.`
          : `Only ${count.done} of ${count.total} products had ${topic} collected — below the bar we need before calling this run done.`,
      phase: count.phase,
    };
  }
  const missing = firstMissingFailure(failures);
  if (missing) {
    const topic = PHASE_TOPIC[missing.phase] ?? `phase ${missing.phase} data`;
    return {
      title: verb === "Stopped early" ? `Stopped early: ${topic} missing` : `Finished, but ${topic} is missing`,
      description: `An earlier step didn't finish producing ${topic}, so we stopped before spending on the next one.`,
      phase: missing.phase,
    };
  }
  // Migration-loss guard failure or anything else unrecognized within the list.
  const migrationMatch = failures.match(/P1 migration incomplete/);
  if (migrationMatch) {
    return {
      title: "Stopped early: product data didn't sync correctly",
      description: "Most of the scraped products never made it into the dashboard's database, so we stopped before spending on analysis.",
      phase: 1,
    };
  }
  return {
    title: verb === "Stopped early" ? "Stopped early: not enough data yet" : "Finished, but a quality check didn't pass",
    description:
      verb === "Stopped early"
        ? "An earlier step didn't collect enough data, so we stopped before spending on the next one."
        : "The run completed, but the results didn't meet our completeness bar.",
    phase: null,
  };
}

/** Turns a raw scout_jobs.error string into plain-language copy. Returns
 * null for a null/empty input (no error to show). Never throws. */
export function humanizeJobError(rawError: string | null | undefined): HumanizedJobError | null {
  const raw = (rawError ?? "").trim();
  if (!raw) return null;

  try {
    if (/^cancelled/i.test(raw)) {
      return { title: "Cancelled", description: "This run was stopped manually before it finished.", phase: null, raw };
    }

    let m = raw.match(/^Structural gate FAIL before P\d+:\s*([\s\S]*)$/);
    if (m) {
      const { title, description, phase } = describeFailures(m[1], "Stopped early");
      return { title, description, phase, raw };
    }

    m = raw.match(/^Verifier FAIL:\s*([\s\S]*)$/);
    if (m) {
      const { title, description, phase } = describeFailures(m[1], "Finished, but");
      return { title, description, phase, raw };
    }

    m = raw.match(/^P(\d+)\s+([^:]+):\s*([\s\S]*)$/);
    if (m) {
      const phase = Number(m[1]);
      const phaseName = m[2].trim();
      const gerund = PHASE_GERUND[phase] ?? `running "${phaseName}"`;
      return {
        title: `Stopped early: a problem while ${gerund}`,
        description: `The "${phaseName}" step ran into an error and couldn't finish. See technical details for exactly what happened.`,
        phase,
        raw,
      };
    }

    m = raw.match(/^Pipeline crashed:\s*([\s\S]*)$/);
    if (m) {
      return {
        title: "Unexpected error",
        description: "Something went wrong outside the normal checks and the run stopped. See technical details for the exact error.",
        phase: null,
        raw,
      };
    }

    return { title: "This run stopped early", description: "See technical details below for exactly what happened.", phase: null, raw };
  } catch {
    // Never let a copy-formatting bug crash the dashboard over a display detail.
    return { title: "This run stopped early", description: "See technical details below for exactly what happened.", phase: null, raw };
  }
}

/** Picks the phase to default a "Retry from P<n>" action to: the specific
 * phase the humanized error points at, else the job's own current_phase
 * (mid-phase crash with no parseable failure list), else the job's own
 * from_phase (a continuation that was cancelled before it even started),
 * else phase 1 as the last-resort default. */
export function deriveRetryPhase(job: { error?: string | null; current_phase?: number | null; from_phase?: number | null } | null | undefined): number {
  if (!job) return 1;
  const humanized = humanizeJobError(job.error);
  if (humanized?.phase) return humanized.phase;
  if (job.current_phase) return job.current_phase;
  if (job.from_phase) return job.from_phase;
  return 1;
}
