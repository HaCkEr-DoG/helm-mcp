import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerBiographyTool } from "./biography.js";
import { registerIncidentTool } from "./incident.js";
import { registerDepartureTool } from "./departure.js";
import { registerDriftTool } from "./drift.js";
import { registerMemoryTool } from "./memory.js";

export function registerTools(server: McpServer): void {
  registerBiographyTool(server);
  registerIncidentTool(server);
  registerDepartureTool(server);
  registerDriftTool(server);
  registerMemoryTool(server);
}
