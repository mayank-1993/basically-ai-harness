// ─────────────────────────────────────────────
// PART 5: The output
//
// Run the same dataset across multiple models
// and print a side-by-side comparison.
//
// This is the key value of an eval harness:
// the same test, run consistently, so you can
// compare models or catch regressions over time.
// ─────────────────────────────────────────────

import { dataset } from "./1-dataset.js";
import { scoreContains } from "./3-scorers.js";
import { runEval } from "./4-runner.js";
import type { EvalRun } from "./4-runner.js";

// Swap any OpenAI model ID here
const MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-3.5-turbo",
];

function printRun(run: EvalRun): void {
  console.log(`\n=== ${run.model} ===\n`);
  console.table(
    run.results.map((r) => ({
      id: r.id,
      passed: r.passed ? "✓" : "✗",
      felForTrap: r.felForTrap ? "🪤" : "",
      expected: r.expected,
      actual: r.actual,
      latencyMs: r.latencyMs,
    }))
  );
}

function printComparison(runs: EvalRun[]): void {
  console.log("\n=== COMPARISON ===\n");
  console.table(
    runs.map((run) => ({
      model: run.model,
      passed: `${run.passed} / ${run.total}`,
      traps: run.results.filter((r) => r.felForTrap).length,
      avgScore: run.avgScore.toFixed(2),
      avgLatencyMs: run.avgLatencyMs.toFixed(0),
    }))
  );
}

// Run all models in parallel against the same dataset
const runs = await Promise.all(
  MODELS.map((model) => runEval(dataset, model, scoreContains))
);

for (const run of runs) printRun(run);
printComparison(runs);
