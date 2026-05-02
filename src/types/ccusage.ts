// ccusage JSON response types (actual format from ccusage CLI)

export interface ModelBreakdown {
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  cost: number;
}

export interface CcusageSession {
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  totalTokens: number;
  totalCost: number;
  lastActivity?: string;
  modelsUsed?: string[];
  modelBreakdowns?: ModelBreakdown[];
  projectPath?: string;
}

export interface CcusageResponse {
  sessions: CcusageSession[];
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalCost: number;
    totalTokens: number;
  };
}

/**
 * A single entry from ccusage daily/weekly/monthly output
 */
export interface CcusagePeriodEntry {
  date: string;
  totalCost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  sessions: number;
  modelBreakdowns?: ModelBreakdown[];
}

/**
 * Response from ccusage daily/weekly/monthly commands
 */
export interface CcusagePeriodResponse {
  entries: CcusagePeriodEntry[];
  totals: {
    totalCost: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    sessions: number;
  };
}

/**
 * Per-project usage summary within a period
 */
export interface ProjectUsageSummary {
  projectName: string;
  projectPath: string;
  totalCost: number;
  totalTokens: number;
  modelBreakdowns: ModelBreakdown[];
}

/**
 * Aggregated data for a period receipt (daily/weekly/monthly)
 */
export interface PeriodReceiptData {
  periodType: "daily" | "weekly" | "monthly";
  periodLabel: string;
  dateFrom: string;
  dateTo: string;
  totalCost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalSessions: number;
  modelBreakdowns: ModelBreakdown[];
  dailyBreakdown: CcusagePeriodEntry[];
  projectBreakdown: ProjectUsageSummary[];
}
