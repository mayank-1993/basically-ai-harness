import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

type GuardrailInput = {
  iterations: number;
  messages: ChatCompletionMessageParam[];
};

export type GuardrailResult = { ok: true } | { ok: false; reason: string };
export type GuardrailFn = (input: GuardrailInput) => GuardrailResult;

const maxIterations =
  (limit: number): GuardrailFn =>
  ({ iterations }) =>
    iterations >= limit
      ? { ok: false, reason: `Guardrail: reached iteration limit (${limit})` }
      : { ok: true };

const maxMessages =
  (limit: number): GuardrailFn =>
  ({ messages }) =>
    messages.length > limit
      ? { ok: false, reason: `Guardrail: context too large (${messages.length} messages)` }
      : { ok: true };

export function combineGuardrails(...fns: GuardrailFn[]): GuardrailFn {
  return (input) => {
    for (const check of fns) {
      const result = check(input);
      if (!result.ok) return result;
    }
    return { ok: true };
  };
}

export const stopAfterUpvote =
  (getUpvotedStory: () => { id: string; title?: string; rank?: number } | null): GuardrailFn =>
  () => {
    const story = getUpvotedStory();
    if (story) {
      const storyInfo = story.title && story.rank
        ? `"${story.title}" (rank ${story.rank})`
        : `story ID ${story.id}`;
      return { ok: false, reason: `Successfully upvoted ${storyInfo}` };
    }
    return { ok: true };
  };

export const defaultGuardrails = combineGuardrails(
  maxIterations(15),
  maxMessages(50)
);
