import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { client } from "./2-model.js";
import { trimContext } from "./3-context.js";
import type { GuardrailFn } from "./4-guardrails.js";
import type { ToolRegistry } from "./1-tools.js";

const MAX_CONTEXT_MESSAGES = 20;

// A single tool call + its result, captured for the trace
export type ToolEvent = {
  tool: string;
  args: Record<string, unknown>;
  result: string;
};

// One loop iteration: the model either called tools or gave a final answer
export type LoopIteration = {
  index: number;
  outcome: "tool_calls" | "answer";
  toolEvents: ToolEvent[];    // empty if outcome is "answer"
  contextSize: number;        // how many messages were in context for this call
  contextTrimmed: boolean;    // true if we dropped old messages before this call
};

export type LoopResult = {
  answer: string;
  iterations: number;
  trace: LoopIteration[];
  stoppedBy: "model" | "guardrail" | "success";
};

export type LoginHandler = () => Promise<ToolEvent | null>;

export async function runLoop(
  model: string,
  messages: ChatCompletionMessageParam[],
  guardrail: GuardrailFn,
  tools: ToolRegistry,           // injected by the harness, not imported globally
  loginHandler?: LoginHandler
): Promise<LoopResult> {
  const trace: LoopIteration[] = [];

  while (true) {
    const iterationIndex = trace.length + 1;

    const beforeTrim = messages.length;
    messages = trimContext(messages, MAX_CONTEXT_MESSAGES);
    const contextTrimmed = messages.length < beforeTrim;

    const check = guardrail({ iterations: trace.length, messages });
    if (!check.ok) {
      const stoppedBy = check.reason.startsWith("Successfully") ? "success" : "guardrail";
      return { answer: check.reason, iterations: trace.length, trace, stoppedBy };
    }

    // ── Model call ────────────────────────────
    process.stdout.write(`[iter ${iterationIndex}] calling model... `);
    const response = await client.chat.completions.create({
      model,
      messages,
      tools: tools.definitions,
    });

    const choice = response.choices[0];
    const contextSize = messages.length;
    console.log(`${choice.finish_reason}`);

    messages.push(choice.message as ChatCompletionMessageParam);

    // ── Final answer ──────────────────────────
    if (choice.finish_reason === "stop") {
      trace.push({ index: iterationIndex, outcome: "answer", toolEvents: [], contextSize, contextTrimmed });
      return {
        answer: choice.message.content ?? "(no response)",
        iterations: trace.length,
        trace,
        stoppedBy: "model",
      };
    }

    // ── Tool calls → execute → loop ───────────
    if (choice.finish_reason === "tool_calls") {
      const toolEvents: ToolEvent[] = [];

      for (const call of choice.message.tool_calls ?? []) {
        const name = call.function.name;
        const args = JSON.parse(call.function.arguments) as Record<string, unknown>;

        const tool = tools.byName.get(name);
        process.stdout.write(`           → ${name}(${JSON.stringify(args)}) ... `);
        let result: string;
        try {
          result = tool ? await tool.execute(args) : `Unknown tool: "${name}"`;
          console.log(`done`);
        } catch (err) {
          result = `Error: ${err instanceof Error ? err.message : String(err)}`;
          console.log(`error`);
        }

        toolEvents.push({ tool: name, args, result });
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }

      if (loginHandler) {
        const loginEvent = await loginHandler();
        if (loginEvent) {
          toolEvents.push(loginEvent);
          messages.push({
            role: "user",
            content: "Authentication completed by harness. You are now logged in. Navigate back to https://news.ycombinator.com and complete your upvote task.",
          });
        }
      }

      trace.push({ index: iterationIndex, outcome: "tool_calls", toolEvents, contextSize, contextTrimmed });
    }
  }
}
