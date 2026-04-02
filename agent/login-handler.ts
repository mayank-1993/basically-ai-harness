import type { BrowserSession } from "./browser.js";
import type { ToolEvent } from "./5-loop.js";

export function createLoginHandler(session: BrowserSession): () => Promise<ToolEvent | null> {
  return async () => {
    const currentUrl = await session.getUrl();
    const isLoginPage = currentUrl.includes("login") || currentUrl.includes("vote");

    if (!isLoginPage) return null;

    console.log("\n[harness] Login redirect detected - handling automatically...");

    try {
      await session.fill("input[name='acct']", "tejasthrowaway");
      await session.fill("input[name='pw']", "tejasthrowaway");
      await session.click("input[type='submit']");

      console.log("[harness] Login completed - agent can continue\n");

      return {
        tool: "harness_auto_login",
        args: {},
        result: `Harness automatically handled login at ${currentUrl}. You are now authenticated and back at ${await session.getUrl()}.`,
      };
    } catch (err) {
      console.log(`[harness] Login failed: ${err instanceof Error ? err.message : String(err)}\n`);
      return {
        tool: "harness_auto_login",
        args: {},
        result: `Harness failed to handle login at ${currentUrl}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  };
}
