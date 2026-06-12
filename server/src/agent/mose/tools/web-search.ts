import { register } from "./registry";
import type { ToolContext } from "./registry";

async function webSearchHandler(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const query = args.query as string | undefined;
  if (!query) return "Error: query required";
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`,
    );
    const data = (await res.json()) as Record<string, unknown>;
    return String(data.AbstractText || data.Abstract || JSON.stringify(data).slice(0, 1000));
  } catch (err: unknown) {
    return `Search error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

register({
  name: "web_search",
  description: "Search the web",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
    },
    required: ["query"],
  },
  phase: "search",
  meta: (args) => ({ query: args.query as string }),
  handler: webSearchHandler,
});
