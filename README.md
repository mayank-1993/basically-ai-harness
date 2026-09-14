# mini-ai-harness

A minimal TypeScript implementation of two kinds of AI harness, built for a talk on **harness engineering** at AI Engineer Europe 2026.

Read the full write-up, with every step explained: [What Is an Agent Harness?](https://tej.as/blog/what-is-an-agent-harness). Watch the talk: [Harnesses in AI: A Deep Dive](https://www.youtube.com/watch?v=C_GG5g38vLU).

---

## What is an AI harness?

An AI harness is the infrastructure that gives an AI model tools and manages input/output behind the scenes, ensuring the model has the tools, context, and environment to do what's asked. It's the scaffolding that wraps around an LLM to make it useful for real-world tasks — not just answering one prompt, but doing actual work in a loop.

The clearest one-liner: **an AI harness is everything except the model weights.**

In practice that means: tool interfaces, context/memory handling, guardrails, verification steps, approval gates, logging, and recovery loops. Anthropic refers to their Claude Agent SDK as a "general-purpose agent harness" that provides built-in context management and tool use so Claude can function as a long-running assistant. OpenAI describes the same idea as orchestration. Anthropic calls the context layer context engineering.

---

## What is harness engineering?

The term crystallized in February 2026 when Mitchell Hashimoto — co-founder of HashiCorp, creator of Terraform — published a blog post giving the practice a name:

> Whenever an agent makes a mistake, you engineer the environment so it won't make that mistake again.

Days later, OpenAI used the same phrase describing how they built an internal beta product: roughly one million lines of code, written entirely by agents, shipped in five months, with no manually written source code. Their key insight:

> When something failed, the fix was almost never "try harder." Human engineers always stepped in and asked: what capability is missing, and how do we make it both legible and enforceable for the agent?

Harness engineering shifts the engineer's job from writing code to designing environments, specifying intent, and providing structured feedback. The harness is the moat. The model is rented.

According to Thoughtworks and OpenAI, a harness has three core components:

1. **Context engineering** — deciding what information to include or exclude at each model call: isolation (keep subtasks separate), reduction (drop stale data to avoid context rot), retrieval (inject fresh docs or search results at the right time).
2. **Architectural constraints** — enforced not just by the model, but by deterministic linters, structural tests, and guardrails the model cannot bypass.
3. **Verification and feedback loops** — the harness checks outputs, runs eval steps, and if something is wrong, surfaces it so the agent or the engineer can fix it.

---

## The two meanings of "harness" — and why both are in this repo

The word has two distinct usages and conflating them causes real confusion.

| | Eval harness | Agent harness |
|---|---|---|
| **Origin** | ML research, 2021 | Agentic engineering, 2026 |
| **Example** | EleutherAI's LM Evaluation Harness | Claude Agent SDK, this repo |
| **Purpose** | Measure model quality against known answers | Enable a model to act in the real world |
| **Input** | Fixed dataset | Open-ended task |
| **Output** | Scores and pass/fail | Answer + tool call log |
| **Loop** | One call per test case | Iterates until done or guardrail fires |
| **Tools** | None | Yes — the whole point |
| **Guardrails** | Not needed | Essential |
| **State** | Stateless | Conversation history across turns |

EleutherAI's LM Evaluation Harness (2021) described itself as "a framework for few-shot evaluation of autoregressive language models." That's the older meaning. The agent harness is newer and fundamentally different in purpose.

Both are in this repo so you can see them side by side.

---

## What's in this repo

```
eval/        ← the eval harness (older meaning)
agent/       ← the agent harness (newer meaning)
```

### `eval/` — test a model against known answers

```
dataset → model → scorer → pass/fail → summary
```

| File | Part | What it does |
|---|---|---|
| `1-dataset.ts` | Dataset | Fixed test cases with known expected outputs. Designed to trigger common hallucinations — the "obvious" answer is usually wrong. |
| `2-model.ts` | Model | Calls any OpenRouter model with a prompt, returns a string. |
| `3-scorers.ts` | Scorers | `exactMatch`, `contains`, `keywords` — normalizes number words ("Three" → "3") before comparing. |
| `4-runner.ts` | Runner | Loops over cases, scores each, tracks whether the model fell for the trap answer. |
| `5-index.ts` | Output | Runs multiple models against the same dataset, prints side-by-side comparison. |

```sh
npm run eval
```

### `agent/` — give a model a task and an environment

```
task → [tools + context + guardrails + loop + verify] → result
```

| File | Part | What it does |
|---|---|---|
| `1-tools.ts` | Tool registry | `createTools(session)` — tools are bound to the environment the harness provides, not a global they reach into. |
| `2-model.ts` | Model client | OpenRouter via the OpenAI SDK. Swap models by changing one string. |
| `3-context.ts` | Context / state | Builds initial context, trims old messages to prevent context rot. |
| `4-guardrails.ts` | Guardrails | Composable safety checks (max iterations, max messages) that run before every loop iteration. |
| `5-loop.ts` | Agent loop | Call model → use tools → feed result back → repeat. Stops when model answers or guardrail fires. |
| `6-harness.ts` | The harness | Owns the full lifecycle: opens environment, creates tools, runs loop, verifies answer, closes environment. |
| `browser.ts` | Environment | A `BrowserSession` — one isolated browser page per harness run, managed entirely by the harness. |

```sh
npm run agent
```

---

## How the agent demo works

The task requires live data from the web:

> "Go to https://news.ycombinator.com and tell me the exact title and current point score of the #1 story right now."

The demo runs this against two models sequentially. Each gets its own browser session, opened and closed by the harness.

**A model with good tool use** (e.g. `gpt-4o-mini`):
```
[iter 1] called 2 tool(s)  [ctx: 2 msgs]
           → browser_navigate({"url":"https://news.ycombinator.com"})
           → browser_get_text({})
             ...Hacker News | #1: "Some Title" | 847 points...
[iter 2] answered  [ctx: 6 msgs]

Answer:  The #1 story is "Some Title" with 847 points.
Verify:  ✓ PASS — Answer contains a point score
```

**A model that skips tools** (e.g. `stepfun/step-3.5-flash:free`):
```
[iter 1] answered  [ctx: 2 msgs]

Answer:  The top story on Hacker News is "Some Made-Up Title" with 312 points.
Verify:  ✗ FAIL — No point score found in answer
```

The contrast makes three things visible at once:

- **Tools**: one model opens a real browser, the other hallucinates
- **Context**: message count grows with each tool call — you can watch it
- **Verify**: both models stopped without hitting a guardrail. The harness looked successful either way. Only the verify step caught the semantic failure.

That last point is the key insight: **guardrails catch structural failures. Verify catches wrong answers. You need both.**

---

## The harness owns the environment

The architectural decision that makes this a real harness rather than just a loop with tools:

```
runHarness()
  ├── session = new BrowserSession()   ← harness opens the environment
  ├── tools   = createTools(session)   ← tools are bound to this session
  ├── messages = createContext(task)   ← fresh context for this task
  ├── result  = await runLoop(...)     ← loop runs inside the environment
  └── session.close()                  ← always, even on error
```

Tools don't manage the browser. They don't know about the browser lifecycle. The harness opens it, the harness closes it, and the process exits cleanly. That's what "managing input/output behind the scenes" means in practice.

---

## Setup

```sh
cp .env.example .env
# add your OPENROUTER_API_KEY
npm install
npx playwright install chromium
npm run eval    # or
npm run agent
```

Get an OpenRouter key at [openrouter.ai](https://openrouter.ai).

---

## Sources

- Mitchell Hashimoto, [My AI Adoption Journey](https://mitchellh.com/writing/my-ai-adoption-journey) (February 2026) — coined "harness engineering" in its current agentic meaning
- Anthropic, [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — context engineering as a core harness component
- EleutherAI, [lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness) — the older eval harness meaning (2021)
