# HELM — Engineering Organizational Memory Layer

> Your git history has been keeping a record since day one. HELM is the first time you can ask it a question.

HELM is a self-hosted MCP server that synthesizes your GitHub repository history into organizational intelligence — accessible through Alexa+, Claude, or any MCP-compatible AI.

Built for the **Amazon Developer Hackathon 2026** — Alexa+ Track.

---

## The Problem

Engineering teams lose ~$500K per major incident. The most common root cause: context that existed in the codebase's history, but was never accessible when it was needed.

Developers leave. Incidents recur. Architecture drifts from its original intent. And no tool synthesizes the history into actionable intelligence — until now.

---

## Five Core Tools

| Tool | What it answers |
|---|---|
| `get_codebase_biography` | What has this system been through? What are its inflection points? |
| `get_incident_context` | What do we know about past incidents in this service? (3am war room) |
| `get_departure_impact` | What do we lose when this engineer leaves? (bus factor scoring) |
| `get_intent_drift` | How has this module drifted from its original design? |
| `get_generational_memory` | Ask any question — get an answer grounded in commit/PR/issue evidence |

---

## Setup

### 1. Prerequisites

- Node.js 20+
- AWS account with Bedrock access (Claude 3 Haiku + Sonnet enabled)
- GitHub Personal Access Token (read:repo scope)

### 2. Install

```bash
cd helm-mcp
npm install
cp .env.example .env
# Edit .env with your credentials
```

### 3. Configure AWS Bedrock

Enable these models in your AWS account (us-east-1):
- `us.anthropic.claude-3-haiku-20240307-v1:0` (fast synthesis)
- `us.anthropic.claude-3-5-sonnet-20241022-v2:0` (deep synthesis)

### 4. Build & Start

```bash
npm run build
npm start
```

Or for development:
```bash
npm run dev
```

Server starts at `http://localhost:3000`

### 5. Verify

```bash
curl http://localhost:3000/health
# {"status":"ok","service":"helm-mcp","version":"1.0.0"}
```

---

## MCP Configuration

Add to your MCP client config:

```json
{
  "mcpServers": {
    "helm": {
      "url": "http://localhost:3000/mcp",
      "transport": "streamable-http"
    }
  }
}
```

For Alexa+ (hosted deployment), set the MCP endpoint URL to your public server.

---

## Example Queries

**Alexa+ / Claude:**

> "Alexa, give me the biography of the facebook/react repository"

> "Alexa, we're seeing 500 errors in payments — what do we know from history?"

> "Alexa, John is leaving Friday — what do we lose?"

> "Alexa, how has the auth module drifted from its original design?"

> "Alexa, why did we rewrite the queue processor in 2023?"

---

## Architecture

```
GitHub REST API → Data Fetcher → Era Chunker
                                      ↓
                              AWS Bedrock (Claude)
                              ├── Haiku (fast queries)
                              └── Sonnet (deep synthesis)
                                      ↓
                               SQLite Cache Layer
                                      ↓
                              MCP Streamable HTTP
                                      ↓
                              Alexa+ / Claude / Any MCP Client
```

### Two-Level Synthesis

For large repositories, HELM uses a two-level synthesis approach:
1. **Era summaries**: Commits grouped by quarter → synthesized by Haiku (~400 tokens each)
2. **Biography narrative**: Era summaries → synthesized by Sonnet into a full narrative

This handles repositories with 500,000+ commits without hitting context window limits.

---

## AWS Services Used

| Service | Purpose |
|---|---|
| Amazon Bedrock (Claude Haiku) | Fast synthesis for era grouping |
| Amazon Bedrock (Claude Sonnet) | Deep synthesis for narratives |
| AWS IAM | Bedrock access control |

For production deployment:
- AWS Lambda (serverless MCP endpoint)
- Amazon DynamoDB (replace SQLite)
- Amazon S3 (synthesis cache)
- Amazon CloudWatch (observability)
- AWS Secrets Manager (GitHub token)

---

## Hackathon Track

**Primary:** Alexa+ ($25,000)
- Self-hosted MCP server ✓
- MCP spec 2025-11-25 ✓
- Streamable HTTP transport ✓

**Secondary:** AWS Builder ($5,000)
- Amazon Bedrock integration ✓

**Secondary:** Open Source ($5,000)
- MIT licensed ✓

---

## License

MIT
