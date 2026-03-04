import { searchEdgarFullText } from "./edgar-client";

interface ToolCallResult {
  content: string;
  is_error?: boolean;
}

export async function scrapePublicRecords(
  source: string,
  query: string,
  entityName?: string
): Promise<ToolCallResult> {
  switch (source) {
    case "ucc":
      return {
        content: JSON.stringify({
          source: "UCC Filings",
          query,
          entityName,
          note: "UCC filing search requires PREQIN or state-level API integration. Configure a data source in Settings > Data Sources to enable live searches.",
          results: [],
        }),
      };

    case "court":
      return {
        content: JSON.stringify({
          source: "Court Records",
          query,
          entityName,
          note: "Court record search requires PACER or state court API integration. Configure a data source in Settings > Data Sources.",
          results: [],
        }),
      };

    case "edgar":
      return await searchEdgar(query, entityName);

    case "news":
      return await searchNews(query, 30);

    default:
      return { content: `Unknown source: ${source}`, is_error: true };
  }
}

async function searchEdgar(
  query: string,
  entityName?: string
): Promise<ToolCallResult> {
  try {
    const results = await searchEdgarFullText(query);

    return {
      content: JSON.stringify({
        source: "SEC EDGAR",
        query,
        entityName,
        total: results.length,
        results: results.map((r) => ({
          title: r.title,
          form: r.form,
          filedAt: r.filedAt,
          entityName: r.entityName,
          url: r.url,
        })),
      }),
    };
  } catch (error) {
    return {
      content: JSON.stringify({
        source: "SEC EDGAR",
        query,
        error: error instanceof Error ? error.message : "Search failed",
        results: [],
      }),
    };
  }
}

export async function searchNews(
  query: string,
  daysBack: number
): Promise<ToolCallResult> {
  // Stub - would integrate with a news API (NewsAPI, Bing News, etc.)
  return {
    content: JSON.stringify({
      source: "News",
      query,
      daysBack,
      note: "News search requires API integration (NewsAPI, Google News API). Configure in Settings > Data Sources.",
      results: [],
    }),
  };
}
