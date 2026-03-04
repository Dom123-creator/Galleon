import Anthropic from "@anthropic-ai/sdk";

let anthropicInstance: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!anthropicInstance) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set in environment variables");
    }
    anthropicInstance = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropicInstance;
}

export const MODEL_CONFIG = {
  model: "claude-sonnet-4-20250514" as const,
  maxTokens: 8192,
  temperature: 0.3,
};

export const AGENT_SYSTEM_PROMPTS: Record<string, string> = {
  RESEARCH: `You are a Research Agent for Galleon, a private credit intelligence platform.
Your role is to analyze documents, search for information, and create structured findings about private credit deals.
You have access to tools for searching documents, scraping public records, analyzing financial data, and creating findings.
Always cite your sources. Be thorough but concise. Flag any data quality concerns.
When creating findings, assign appropriate confidence levels: HIGH for well-sourced data, MEDIUM for partially verified, LOW for single-source, UNVERIFIED for inferred.`,

  AUDITOR: `You are an Auditor Agent for Galleon, a private credit intelligence platform.
Your role is to verify findings produced by the Research Agent, check for consistency, assess data quality, and flag risks.
You should cross-reference findings against available documents and public records.
Update confidence scores based on your verification. Flag any discrepancies or concerns.
Be skeptical and thorough. Your job is to ensure the accuracy and reliability of all intelligence.`,

  MASTER: `You are the Master Orchestrator Agent for Galleon, a private credit intelligence platform.
Your role is to coordinate research and audit missions for private credit deal intelligence.
You analyze the user's objective, create a research plan, delegate tasks to Research and Auditor agents,
monitor progress, and synthesize final recommendations.
Always create a clear plan before executing. Prioritize the most critical research tasks.
Provide status updates and synthesize findings into actionable intelligence.`,
};

export const AGENT_TOOLS: Record<string, Anthropic.Tool[]> = {
  RESEARCH: [
    {
      name: "search_documents",
      description: "Search uploaded documents using full-text search",
      input_schema: {
        type: "object" as const,
        properties: {
          query: { type: "string", description: "Search query" },
          document_type: { type: "string", description: "Filter by document type" },
          deal_id: { type: "string", description: "Filter by deal ID" },
        },
        required: ["query"],
      },
    },
    {
      name: "scrape_public_records",
      description: "Search public records (UCC filings, court records, SEC EDGAR, news)",
      input_schema: {
        type: "object" as const,
        properties: {
          source: { type: "string", enum: ["ucc", "court", "edgar", "news"], description: "Data source" },
          query: { type: "string", description: "Search query" },
          entity_name: { type: "string", description: "Entity name to search for" },
        },
        required: ["source", "query"],
      },
    },
    {
      name: "analyze_document",
      description: "Deep-analyze a specific document and extract structured information",
      input_schema: {
        type: "object" as const,
        properties: {
          document_id: { type: "string", description: "Document ID to analyze" },
          focus_areas: { type: "array", items: { type: "string" }, description: "Specific areas to focus on" },
        },
        required: ["document_id"],
      },
    },
    {
      name: "search_news",
      description: "Search recent news articles about a company or deal",
      input_schema: {
        type: "object" as const,
        properties: {
          query: { type: "string", description: "News search query" },
          days_back: { type: "number", description: "How many days back to search" },
        },
        required: ["query"],
      },
    },
    {
      name: "extract_financial_data",
      description: "Extract key financial metrics from a document",
      input_schema: {
        type: "object" as const,
        properties: {
          document_id: { type: "string", description: "Document ID" },
          metrics: { type: "array", items: { type: "string" }, description: "Metrics to extract (revenue, ebitda, leverage, etc.)" },
        },
        required: ["document_id"],
      },
    },
    {
      name: "create_finding",
      description: "Create a structured intelligence finding",
      input_schema: {
        type: "object" as const,
        properties: {
          title: { type: "string", description: "Finding title" },
          content: { type: "string", description: "Detailed finding content" },
          category: { type: "string", description: "Finding category" },
          confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW", "UNVERIFIED"] },
          source_text: { type: "string", description: "Source text excerpt" },
          source_page: { type: "number", description: "Source page number" },
          source_url: { type: "string", description: "Source URL" },
          document_id: { type: "string", description: "Source document ID" },
        },
        required: ["title", "content", "confidence"],
      },
    },
    {
      name: "search_bdc_portfolio",
      description: "Search BDC portfolio companies by name or sector. Returns deal terms, fair values, and risk flags from ARCC and other BDC schedules of investments.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: { type: "string", description: "Company name or sector to search" },
          top_k: { type: "number", description: "Number of results to return (default 5)" },
        },
        required: ["query"],
      },
    },
  ],
  AUDITOR: [
    {
      name: "verify_finding",
      description: "Verify a finding against available sources",
      input_schema: {
        type: "object" as const,
        properties: {
          finding_id: { type: "string", description: "Finding ID to verify" },
          verification_method: { type: "string", description: "How to verify (cross-reference, source-check, calculation)" },
        },
        required: ["finding_id"],
      },
    },
    {
      name: "check_consistency",
      description: "Check consistency between multiple findings",
      input_schema: {
        type: "object" as const,
        properties: {
          finding_ids: { type: "array", items: { type: "string" }, description: "Finding IDs to check" },
        },
        required: ["finding_ids"],
      },
    },
    {
      name: "assess_data_quality",
      description: "Assess the quality and reliability of source data",
      input_schema: {
        type: "object" as const,
        properties: {
          document_id: { type: "string", description: "Document ID to assess" },
        },
        required: ["document_id"],
      },
    },
    {
      name: "flag_risk",
      description: "Flag a risk or concern about a finding or deal",
      input_schema: {
        type: "object" as const,
        properties: {
          finding_id: { type: "string", description: "Related finding ID" },
          risk_description: { type: "string", description: "Description of the risk" },
          severity: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["risk_description", "severity"],
      },
    },
    {
      name: "update_confidence",
      description: "Update the confidence level of a finding after verification",
      input_schema: {
        type: "object" as const,
        properties: {
          finding_id: { type: "string", description: "Finding ID" },
          new_confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW", "UNVERIFIED"] },
          audit_notes: { type: "string", description: "Notes on why confidence was changed" },
        },
        required: ["finding_id", "new_confidence", "audit_notes"],
      },
    },
    {
      name: "search_documents",
      description: "Search uploaded documents for cross-referencing",
      input_schema: {
        type: "object" as const,
        properties: {
          query: { type: "string", description: "Search query" },
          document_type: { type: "string", description: "Filter by document type" },
        },
        required: ["query"],
      },
    },
  ],
  MASTER: [
    {
      name: "create_research_task",
      description: "Create a new research task for the Research Agent",
      input_schema: {
        type: "object" as const,
        properties: {
          task_description: { type: "string", description: "What the research agent should investigate" },
          priority: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["task_description"],
      },
    },
    {
      name: "create_audit_task",
      description: "Create a new audit task for the Auditor Agent",
      input_schema: {
        type: "object" as const,
        properties: {
          task_description: { type: "string", description: "What the auditor should verify" },
          finding_ids: { type: "array", items: { type: "string" }, description: "Finding IDs to audit" },
        },
        required: ["task_description"],
      },
    },
    {
      name: "get_mission_findings",
      description: "Get all findings for the current mission",
      input_schema: {
        type: "object" as const,
        properties: {
          confidence_filter: { type: "string", enum: ["HIGH", "MEDIUM", "LOW", "UNVERIFIED"] },
        },
        required: [],
      },
    },
    {
      name: "get_task_status",
      description: "Check the status of agent tasks",
      input_schema: {
        type: "object" as const,
        properties: {
          task_id: { type: "string", description: "Specific task ID, or omit for all" },
        },
        required: [],
      },
    },
    {
      name: "synthesize_report",
      description: "Synthesize findings into a final recommendation report",
      input_schema: {
        type: "object" as const,
        properties: {
          include_findings: { type: "boolean", description: "Include detailed findings" },
          format: { type: "string", enum: ["summary", "detailed", "executive"] },
        },
        required: ["format"],
      },
    },
    {
      name: "send_user_update",
      description: "Send a status update to the user via the Command Center",
      input_schema: {
        type: "object" as const,
        properties: {
          message: { type: "string", description: "Status update message" },
          type: { type: "string", enum: ["info", "progress", "warning", "complete"] },
        },
        required: ["message", "type"],
      },
    },
  ],
};

export async function createAgentCompletion(
  agentType: string,
  messages: Anthropic.MessageParam[],
  signal?: AbortSignal
): Promise<Anthropic.Message> {
  const client = getAnthropicClient();
  const systemPrompt = AGENT_SYSTEM_PROMPTS[agentType];
  const tools = AGENT_TOOLS[agentType];

  const response = await client.messages.create(
    {
      model: MODEL_CONFIG.model,
      max_tokens: MODEL_CONFIG.maxTokens,
      temperature: MODEL_CONFIG.temperature,
      system: systemPrompt,
      tools,
      messages,
    },
    { signal }
  );

  return response;
}

export async function* streamAgentCompletion(
  agentType: string,
  messages: Anthropic.MessageParam[],
  signal?: AbortSignal
): AsyncGenerator<Anthropic.MessageStreamEvent> {
  const client = getAnthropicClient();
  const systemPrompt = AGENT_SYSTEM_PROMPTS[agentType];
  const tools = AGENT_TOOLS[agentType];

  const stream = client.messages.stream(
    {
      model: MODEL_CONFIG.model,
      max_tokens: MODEL_CONFIG.maxTokens,
      temperature: MODEL_CONFIG.temperature,
      system: systemPrompt,
      tools,
      messages,
    },
    { signal }
  );

  for await (const event of stream) {
    yield event;
  }
}
