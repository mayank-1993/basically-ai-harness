import { BrowserSession } from "./browser.js";
import { createTools } from "./1-tools.js";
import { createContext } from "./3-context.js";
import { combineGuardrails, defaultGuardrails, stopAfterUpvote } from "./4-guardrails.js";
import { runLoop } from "./5-loop.js";
import { createLoginHandler } from "./login-handler.js";
import type { LoopResult } from "./5-loop.js";

export type VerifyResult = {
  passed: boolean;
  reason: string;
  fatal?: boolean;
};

export type HarnessExecutionResult = LoopResult & {
  task: string;
  model: string;
};

export type HarnessOptions = {
  verify?: (result: HarnessExecutionResult) => VerifyResult;
  maxAttempts?: number;
};

export type HarnessResult = HarnessExecutionResult & {
  attempts: number;
  verification: VerifyResult | null;
};

export async function runHarness(
  task: string,
  model: string,
  options: HarnessOptions = {}
): Promise<HarnessResult> {
  const maxAttempts = options.maxAttempts ?? 1;
  let latestResult: HarnessResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await runHarnessAttempt(task, model);
    const verification = options.verify ? options.verify(result) : null;
    const answer =
      verification && !verification.passed
        ? verification.reason
        : result.answer;

    latestResult = { ...result, answer, attempts: attempt, verification };

    if (!verification || verification.passed || verification.fatal || attempt === maxAttempts) {
      return latestResult;
    }

    console.log(`\nAttempt ${attempt} failed - retrying (${attempt + 1}/${maxAttempts})...\n`);
  }

  throw new Error("Harness finished without producing a result");
}

export function verifySuccessfulUpvote(result: HarnessExecutionResult): VerifyResult {
  const successfulUpvote = result.trace
    .flatMap((iteration) => iteration.toolEvents)
    .find(
      (event) =>
        event.tool === "browser_click" &&
        /up_/.test(JSON.stringify(event.args)) &&
        /news\.ycombinator\.com\/(news)?$/.test(event.result.split("now at ")[1]?.trim() ?? "")
    );

  if (successfulUpvote) {
    return {
      passed: true,
      reason: `Upvote click confirmed - landed on ${successfulUpvote.result.split("now at ")[1]}`,
    };
  }

  const failedLogin = result.trace
    .flatMap((iteration) => iteration.toolEvents)
    .find(
      (event) =>
        event.tool === "harness_auto_login" &&
        event.result.startsWith("Harness failed to handle login at ")
    );

  if (failedLogin) {
    return {
      passed: false,
      reason: failedLogin.result,
      fatal: true,
    };
  }

  const unrecoveredLoginRedirect = result.trace
    .flatMap((iteration) => iteration.toolEvents)
    .find(
      (event) =>
        event.tool !== "harness_auto_login" &&
        isLoginUrl(extractUrl(event.result))
    );

  if (unrecoveredLoginRedirect) {
    return {
      passed: false,
      reason: `Hit login screen instead of completing the upvote (${extractUrl(unrecoveredLoginRedirect.result)})`,
      fatal: true,
    };
  }

  return {
    passed: false,
    reason: "No successful upvote click found in trace",
  };
}

function extractUrl(result: string): string | null {
  const match = result.match(/https?:\/\/\S+/);
  return match ? match[0] : null;
}

function isLoginUrl(url: string | null): boolean {
  return !!url && (url.includes("/login") || url.includes("/vote"));
}

async function runHarnessAttempt(
  task: string,
  model: string
): Promise<HarnessExecutionResult> {
  const session = new BrowserSession();
  let upvotedStory: { id: string; title?: string; rank?: number } | null = null;
  let storiesData: any[] = [];
  
  await session.open();
  
  try {
    const tools = createTools(session, {
      onUpvoteSuccess: (storyId) => {
        const story = storiesData.find((s) => s.id === storyId);
        upvotedStory = story
          ? { id: storyId, title: story.title, rank: story.rank }
          : { id: storyId };
        console.log(`\n[harness] Upvote successful for story ID ${storyId} - forcing completion\n`);
      },
      onStoriesLoaded: (stories) => {
        storiesData = stories;
      },
    });

    const guardrails = combineGuardrails(
      stopAfterUpvote(() => upvotedStory),
      defaultGuardrails
    );

    const messages = createContext(task);
    const loginHandler = createLoginHandler(session);
    const result = await runLoop(model, messages, guardrails, tools, loginHandler);
    return { task, model, ...result };
  } finally {
    await session.close();
  }
}

export function printHarnessResult(result: HarnessResult): void {
  console.log("\n--- Agent trace ---\n");

  for (const iteration of result.trace) {
    const trimNote = iteration.contextTrimmed ? " (trimmed)" : "";
    const ctx = `[ctx: ${iteration.contextSize}${trimNote}]`;

    if (iteration.outcome === "tool_calls") {
      console.log(`[iter ${iteration.index}] ${iteration.toolEvents.length} tool call(s) ${ctx}`);
      for (const event of iteration.toolEvents) {
        console.log(`  -> ${event.tool}(${JSON.stringify(event.args)})`);
        console.log(`     ${event.result.slice(0, 120)}${event.result.length > 120 ? "..." : ""}`);
      }
    } else {
      console.log(`[iter ${iteration.index}] answered ${ctx}`);
    }

    console.log();
  }

  console.log("--- Result ---\n");
  console.log(result.answer);
  console.log(`\nStopped by: ${result.stoppedBy} after ${result.iterations} iteration(s)`);
  console.log(`Attempts:   ${result.attempts}`);

  if (result.verification) {
    const status = result.verification.passed ? "PASS" : "FAIL";
    console.log(`Verify:     ${status} - ${result.verification.reason}`);
  }
}
