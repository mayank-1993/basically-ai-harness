import { printHarnessResult, runHarness, verifySuccessfulUpvote } from "./6-harness.js";

// try a shitty model
const MODEL = "openai/gpt-3.5-turbo-0613";

const TASK = `
Upvote a story on Hacker News.

Go to https://news.ycombinator.com.
Call browser_get_stories to see ranked stories with their IDs and voted status.
Find the highest-ranked story where alreadyVoted is false.
Click its upvote arrow using the exact selector: a[id="up_STORYID"] (replace STORYID with the actual id).
`.trim();

console.log(`Model: ${MODEL}`);
console.log(`Task:  upvote on Hacker News\n`);

const result = await runHarness(TASK, MODEL, {
  verify: verifySuccessfulUpvote,
  maxAttempts: 3,
});
printHarnessResult(result);
