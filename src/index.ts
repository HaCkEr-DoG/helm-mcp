import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "./tools/index.js";
import { initDb } from "./db/index.js";

const app = express();
app.use(express.json({ limit: "10mb" }));

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "helm-mcp", version: "1.0.0" });
});

// MCP Streamable HTTP endpoint (required for Alexa+ - spec 2025-11-25)
app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  });

  const server = new McpServer({
    name: "helm-mcp",
    version: "1.0.0",
  });

  registerTools(server);

  res.on("close", () => transport.close());

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// SSE endpoint for server-initiated messages
app.get("/mcp", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  const server = new McpServer({
    name: "helm-mcp",
    version: "1.0.0",
  });

  registerTools(server);

  res.on("close", () => transport.close());

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error("SSE error:", err);
  }
});

const PORT = parseInt(process.env.PORT ?? "3000", 10);

async function main() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`HELM MCP Server listening on http://localhost:${PORT}`);
    console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
    console.log(`Health: http://localhost:${PORT}/health`);
  });
}

main().catch(console.error);
