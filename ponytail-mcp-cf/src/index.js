import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MODES, buildInstructions, resolveMode } from "./instructions.js";
import { Hono } from "hono";
import { cors } from "hono/cors";

class CloudflareSSETransport {
  constructor(endpoint) {
    this.endpoint = endpoint;
    this.sessionId = crypto.randomUUID();
    this.controller = null;
    this.stream = new ReadableStream({
      start: (controller) => {
        this.controller = controller;
      }
    });
  }

  async start() {
    this.sendEvent("endpoint", this.endpoint + "?sessionId=" + this.sessionId);
  }

  async close() {
    if (this.controller) {
      try { this.controller.close(); } catch (e) {}
    }
    if (this.onclose) this.onclose();
  }

  async send(message) {
    this.sendEvent("message", JSON.stringify(message));
  }

  sendEvent(event, data) {
    if (!this.controller) return;
    const chunk = `event: ${event}\ndata: ${data}\n\n`;
    this.controller.enqueue(new TextEncoder().encode(chunk));
  }

  async handlePostMessage(req) {
    const message = await req.json();
    if (this.onmessage) this.onmessage(message);
  }
}

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
  
  // Use relative path for endpoint. Client will resolve it against the SSE URL.
  const transport = new CloudflareSSETransport("/messages");
  await server.connect(transport);
  
  const sessionId = transport.sessionId;
  transports.set(sessionId, transport);

  c.req.raw.signal.addEventListener("abort", () => {
    transports.delete(sessionId);
    transport.close();
  });

  return new Response(transport.stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*"
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

// Professional Landing Page with Developer Details
app.get("/", (c) => {
  const sseUrl = new URL('/sse', c.req.url).href;
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ponytail MCP Server | Professional AI Toolkit</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #09090b;
      --surface: #18181b;
      --surface-border: #27272a;
      --text: #f4f4f5;
      --text-muted: #a1a1aa;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --glow: rgba(59, 130, 246, 0.15);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Outfit', sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.6;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      background-image: radial-gradient(circle at 50% 0%, var(--glow) 0%, transparent 50%);
    }
    .wrapper {
      width: 100%;
      max-width: 900px;
      padding: 4rem 2rem;
      animation: fadeIn 1s ease-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .header {
      text-align: center;
      margin-bottom: 3.5rem;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: rgba(34, 197, 94, 0.1);
      color: #4ade80;
      border: 1px solid rgba(34, 197, 94, 0.2);
      border-radius: 99px;
      font-size: 0.875rem;
      font-weight: 500;
      margin-bottom: 1.5rem;
    }
    .status-badge .dot {
      width: 8px;
      height: 8px;
      background: #4ade80;
      border-radius: 50%;
      box-shadow: 0 0 10px #4ade80;
    }
    h1 {
      font-size: 3.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 1rem;
      background: linear-gradient(to right, #fff, #a1a1aa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle {
      font-size: 1.25rem;
      color: var(--text-muted);
      max-width: 600px;
      margin: 0 auto;
    }
    
    .card {
      background: var(--surface);
      border: 1px solid var(--surface-border);
      border-radius: 16px;
      padding: 2.5rem;
      margin-bottom: 2rem;
      box-shadow: 0 4px 30px rgba(0, 0, 0, 0.5);
    }
    .card-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 1.5rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    
    /* URL Box */
    .url-container {
      display: flex;
      background: #000;
      border: 1px solid var(--surface-border);
      border-radius: 12px;
      padding: 0.5rem;
      align-items: center;
      transition: border-color 0.2s;
    }
    .url-container:focus-within, .url-container:hover {
      border-color: var(--primary);
    }
    .url-input {
      flex: 1;
      background: transparent;
      border: none;
      color: #fff;
      font-family: 'Fira Code', monospace;
      font-size: 1rem;
      padding: 1rem;
      outline: none;
      width: 100%;
    }
    .btn-copy {
      background: var(--primary);
      color: #fff;
      border: none;
      padding: 0.8rem 1.5rem;
      border-radius: 8px;
      font-family: 'Outfit', sans-serif;
      font-weight: 600;
      font-size: 0.95rem;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .btn-copy:hover {
      background: var(--primary-hover);
    }
    
    /* Grid Layout */
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2rem;
    }
    @media (max-width: 768px) {
      .grid { grid-template-columns: 1fr; }
    }
    
    /* Steps */
    .steps {
      list-style: none;
      counter-reset: my-counter;
    }
    .steps li {
      position: relative;
      padding-left: 2.5rem;
      margin-bottom: 1.25rem;
      color: var(--text-muted);
    }
    .steps li::before {
      counter-increment: my-counter;
      content: counter(my-counter);
      position: absolute;
      left: 0;
      top: -2px;
      width: 24px;
      height: 24px;
      background: var(--surface-border);
      color: #fff;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .steps strong {
      color: #fff;
    }

    /* Developer Profile Section */
    .dev-profile {
      background: linear-gradient(145deg, #18181b, #09090b);
      border-top: 2px solid var(--surface-border);
    }
    .dev-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .dev-avatar {
      width: 50px;
      height: 50px;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--primary), #8b5cf6);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      color: #fff;
      font-weight: 700;
    }
    .dev-info h3 {
      font-size: 1.5rem;
      margin-bottom: 0.2rem;
    }
    .dev-info p {
      color: var(--primary);
      font-size: 0.9rem;
      font-weight: 500;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    
    .social-links {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .social-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1.25rem;
      background: #000;
      border: 1px solid var(--surface-border);
      border-radius: 8px;
      color: var(--text);
      text-decoration: none;
      font-size: 0.95rem;
      font-weight: 500;
      transition: all 0.2s;
    }
    .social-btn:hover {
      border-color: var(--text-muted);
      transform: translateY(-2px);
    }
    .social-btn svg {
      width: 20px;
      height: 20px;
      fill: currentColor;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="status-badge">
        <div class="dot"></div> Server Online & Ready
      </div>
      <h1>Ponytail MCP</h1>
      <p class="subtitle">The definitive "Lazy Senior Dev" Mode for modern AI Agents. Write less code, build better systems.</p>
    </div>

    <div class="card">
      <div class="card-title">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary)"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
        MCP Server Connection
      </div>
      <div class="url-container">
        <input type="text" class="url-input" id="mcpUrl" value="${sseUrl}" readonly>
        <button class="btn-copy" onclick="copyUrl(this)">Copy Endpoint</button>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-title">Integration Guide</div>
        <ul class="steps">
          <li>Open your AI Editor (<strong>Cursor</strong>, <strong>Windsurf</strong>, etc).</li>
          <li>Navigate to the <strong>MCP Servers</strong> configuration panel.</li>
          <li>Click on <strong>Add New Server</strong>.</li>
          <li>Set the Server Name to <strong>Ponytail</strong>.</li>
          <li>Set the connection Type to <strong>SSE</strong>.</li>
          <li>Paste the <strong>Endpoint URL</strong> copied from above and save.</li>
        </ul>
      </div>

      <div class="card dev-profile">
        <div class="dev-header">
          <div class="dev-avatar">/&gt;</div>
          <div class="dev-info">
            <h3>Developer Details</h3>
            <p>System Architect & Creator</p>
          </div>
        </div>
        <div class="social-links">
          <a href="https://aboutmee.pages.dev/" target="_blank" class="social-btn">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
            Portfolio
          </a>
          <a href="https://github.com/v54087912-collab" target="_blank" class="social-btn">
            <svg viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            GitHub
          </a>
          <a href="https://t.me/R3V_X" target="_blank" class="social-btn">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.19-.08-.05-.19-.02-.27 0-.12.03-1.99 1.26-5.61 3.71-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.05-.49-.82-.27-1.47-.41-1.42-.87.03-.24.38-.49 1.04-.76 4.08-1.78 6.81-2.92 8.19-3.5 3.9-1.63 4.71-1.91 5.23-1.92.11 0 .37.03.5.15.11.1.15.24.13.37z"/></svg>
            Contact
          </a>
          <a href="https://t.me/allinformation0173" target="_blank" class="social-btn">
            <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
            Community
          </a>
          <a href="https://www.instagram.com/opeditzxx/?utm_source=qr&r=nametag" target="_blank" class="social-btn">
            <svg viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
            Instagram
          </a>
        </div>
      </div>
    </div>
  </div>

  <script>
    function copyUrl(btn) {
      const urlInput = document.getElementById('mcpUrl');
      urlInput.select();
      navigator.clipboard.writeText(urlInput.value).then(() => {
        const originalText = btn.innerText;
        btn.innerText = 'Copied! ✨';
        btn.style.background = '#22c55e';
        btn.style.color = '#fff';
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
