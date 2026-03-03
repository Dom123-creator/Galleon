interface ToolCallResult {
  content: string;
  is_error?: boolean;
}

export async function scrapePublicRecords(
  source: string,
  query: string,
  entityName?: string
): Promise<ToolCallResult> {
  // These are stub implementations that would connect to real APIs
  // In production, each source would have its own integration
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
    // SEC EDGAR full-text search API
    const searchUrl = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(query)}&dateRange=custom&startdt=${getDateDaysAgo(365)}&enddt=${getDateToday()}&forms=10-K,10-Q,8-K,S-1`;

    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Galleon/1.0 (support@galleon.ai)",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return {
        content: JSON.stringify({
          source: "SEC EDGAR",
          query,
          note: "SEC EDGAR search returned non-200 status. Results may be limited.",
          results: [],
        }),
      };
    }

    const data = await response.json();
    return {
      content: JSON.stringify({
        source: "SEC EDGAR",
        query,
        entityName,
        total: data.hits?.total?.value || 0,
        results: (data.hits?.hits || []).slice(0, 10).map((hit: Record<string, unknown>) => ({
          title: (hit._source as Record<string, unknown>)?.display_names,
          form: (hit._source as Record<string, unknown>)?.form_type,
          filedAt: (hit._source as Record<string, unknown>)?.file_date,
          url: `https://www.sec.gov/Archives/edgar/data/${(hit._source as Record<string, unknown>)?.entity_id}`,
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

function getDateToday(): string {
  return new Date().toISOString().split("T")[0];
}

function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
}
