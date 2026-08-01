import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { MODES, buildInstructions, resolveMode } from "./instructions.js";
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();
app.use("/*", cors());

// In-memory store for active transports. 
// Note: In Cloudflare Workers, this memory drops periodically as isolates spin down.
// For a fully persistent setup, consider using Cloudflare Durable Objects.
// However, for most MCP client requests that open SSE and immediately POST a query, this often works.
const transports = new Map();

function createMcpServer() {
  const server = new McpServer({ name: "ponytail", version: "1.0.0" });

  const modeArg = z
    .enum(MODES)
    .optional()
    .describe("Ponytail intensity: lite, full, or ultra. Omit for the configured default.");

  server.registerPrompt(
    "ponytail",
    {
      title: "Ponytail mode",
      description: "Lazy senior dev instructions: YAGNI, stdlib first, the smallest correct change.",
      argsSchema: { mode: modeArg },
    },
    ({ mode }) => ({
      messages: [{ role: "user", content: { type: "text", text: buildInstructions(mode) } }],
    })
  );

  server.registerTool(
    "ponytail_instructions",
    {
      title: "Ponytail instructions",
      description: "Return the Ponytail ruleset for the given intensity (lite, full, or ultra).",
      inputSchema: { mode: modeArg },
      outputSchema: { mode: z.string(), instructions: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ mode }) => {
      const resolvedMode = resolveMode(mode);
      const instructions = buildInstructions(resolvedMode);
      const structuredContent = { mode: resolvedMode, instructions };
      return { content: [{ type: "text", text: instructions }], structuredContent };
    }
  );
  
  return server;
}

// Endpoint to establish SSE connection
app.get("/sse", async (c) => {
  const server = createMcpServer();
  const transport = new SSEServerTransport("/messages", c.req.raw);
  await server.connect(transport);
  
  const sessionId = transport.sessionId;
  transports.set(sessionId, transport);

  // Clean up if closed
  c.req.raw.signal.addEventListener("abort", () => {
    transports.delete(sessionId);
  });

  return new Response(transport.stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
});

// Endpoint to handle incoming messages from the client
app.post("/messages", async (c) => {
  const sessionId = c.req.query("sessionId");
  const transport = transports.get(sessionId);

  if (!transport) {
    return c.text("Session not found", 404);
  }

  // Pass the incoming message to the transport
  await transport.handlePostMessage(c.req.raw);
  
  return c.text("Accepted", 202);
});

// Root endpoint for simple health check / usage info
app.get("/", (c) => {
  return c.json({
    status: "Ponytail Global MCP Server is running!",
    sse_endpoint: "/sse",
    message_endpoint: "/messages"
  });
});

export default app;
