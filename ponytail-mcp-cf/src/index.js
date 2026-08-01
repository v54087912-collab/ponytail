import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { MODES, buildInstructions, resolveMode } from "./instructions.js";
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();
app.use("/*", cors());

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

app.get("/sse", async (c) => {
  const server = createMcpServer();
  const transport = new SSEServerTransport("/messages", c.req.raw);
  await server.connect(transport);
  
  const sessionId = transport.sessionId;
  transports.set(sessionId, transport);

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

app.post("/messages", async (c) => {
  const sessionId = c.req.query("sessionId");
  const transport = transports.get(sessionId);

  if (!transport) {
    return c.text("Session not found", 404);
  }

  await transport.handlePostMessage(c.req.raw);
  return c.text("Accepted", 202);
});

// Beautiful Landing Page
app.get("/", (c) => {
  const sseUrl = new URL('/sse', c.req.url).href;
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ponytail MCP Server</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: rgba(30, 41, 59, 0.7);
      --text: #f8fafc;
      --accent: #38bdf8;
      --accent-hover: #0ea5e9;
      --border: rgba(255,255,255,0.1);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: var(--bg);
      background-image: 
        radial-gradient(at 0% 0%, rgba(56, 189, 248, 0.15) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(139, 92, 246, 0.15) 0px, transparent 50%);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .container {
      max-width: 800px;
      padding: 3rem;
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      border-radius: 24px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      text-align: center;
      animation: fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    h1 {
      font-size: 3rem;
      margin-bottom: 0.5rem;
      background: linear-gradient(to right, #38bdf8, #8b5cf6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle {
      font-size: 1.2rem;
      color: #94a3b8;
      margin-bottom: 2.5rem;
      font-weight: 300;
    }
    .code-box {
      background: rgba(0, 0, 0, 0.4);
      padding: 1.5rem;
      border-radius: 12px;
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 2rem;
      transition: border-color 0.3s;
    }
    .code-box:hover {
      border-color: var(--accent);
    }
    .code-box code {
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      color: #e2e8f0;
      font-size: 1.1rem;
      word-break: break-all;
    }
    .copy-btn {
      background: var(--accent);
      color: #0f172a;
      border: none;
      padding: 0.6rem 1.2rem;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      margin-left: 1rem;
    }
    .copy-btn:hover {
      background: var(--accent-hover);
      transform: translateY(-2px);
    }
    .copy-btn:active {
      transform: translateY(0);
    }
    .instructions {
      text-align: left;
      background: rgba(255, 255, 255, 0.03);
      padding: 2rem;
      border-radius: 16px;
      border: 1px solid var(--border);
    }
    .instructions h3 {
      margin-top: 0;
      color: #e2e8f0;
    }
    .instructions ol {
      color: #cbd5e1;
      padding-left: 1.5rem;
      line-height: 1.7;
    }
    .instructions li {
      margin-bottom: 0.5rem;
    }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      background: rgba(56, 189, 248, 0.2);
      color: var(--accent);
      border-radius: 9999px;
      font-size: 0.875rem;
      font-weight: 500;
      margin-bottom: 1rem;
    }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=JetBrains+Mono&display=swap" rel="stylesheet">
</head>
<body>
  <div class="container">
    <div class="badge">Global MCP Server Running</div>
    <h1>Ponytail MCP</h1>
    <div class="subtitle">The Lazy Senior Dev Mode for AI Agents</div>
    
    <div class="code-box">
      <code id="urlField">${sseUrl}</code>
      <button class="copy-btn" onclick="copyUrl(this)">Copy URL</button>
    </div>

    <div class="instructions">
      <h3>How to use with AI Agents (Cursor / Windsurf):</h3>
      <ol>
        <li>Open your AI Agent's settings.</li>
        <li>Find the <strong>MCP (Model Context Protocol)</strong> section.</li>
        <li>Click <strong>Add New Server</strong>.</li>
        <li>Set Name to <strong>Ponytail</strong>.</li>
        <li>Set Type to <strong>SSE</strong>.</li>
        <li>Paste the copied URL above into the URL field.</li>
        <li>Save. Your AI will now write cleaner, lazier, and better code!</li>
      </ol>
    </div>
  </div>

  <script>
    function copyUrl(btn) {
      const url = document.getElementById('urlField').innerText;
      navigator.clipboard.writeText(url).then(() => {
        const originalText = btn.innerText;
        btn.innerText = 'Copied! ✨';
        btn.style.background = '#22c55e';
        setTimeout(() => {
          btn.innerText = originalText;
          btn.style.background = '';
        }, 2000);
      });
    }
  </script>
</body>
</html>
  `;
  
  return c.html(html);
});

export default app;
