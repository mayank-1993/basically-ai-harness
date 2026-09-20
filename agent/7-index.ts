import { createTools } from "./1-tools.js";
import { createContext } from "./3-context.js";
import { defaultGuardrails } from "./4-guardrails.js";
import { runLoop } from "./5-loop.js";
import { BrowserSession } from "./browser.js";

// try a shitty model
const MODEL = "gpt-3.5-turbo";

const TASK = `
Upvote a story on Hacker News.

Go to https://news.ycombinator.com.
Call browser_get_stories to see ranked stories with their IDs and voted status.
Find the highest-ranked story where alreadyVoted is false.
Click its upvote arrow using the exact selector: a[id="up_STORYID"] (replace STORYID with the actual id).
`.trim();

console.log(`Model: ${MODEL}`);
console.log(`Task:  upvote on Hacker News\n`);

const session = new BrowserSession();

try {
  await session.open();

  const tools = createTools(session);
  const messages = createContext(TASK);
  const result = await runLoop(MODEL, messages, defaultGuardrails, tools);

  console.log(`\nAnswer: ${result.answer}`);
  console.log(`Stopped by: ${result.stoppedBy}`);
  console.log(`Iterations: ${result.iterations}`);
} finally {
  await session.close();
}
