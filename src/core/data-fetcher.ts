import { execa } from "execa";
import type {
  CcusageResponse,
  CcusageSession,
  CcusagePeriodEntry,
  CcusagePeriodResponse,
  ProjectUsageSummary,
  ModelBreakdown,
} from "../types/ccusage.js";

/**
 * Run ccusage CLI — tries direct binary first, falls back to npx.
 */
async function runCcusage(args: string[], timeout = 60000) {
  try {
    return await execa("ccusage", args, { timeout });
  } catch {
    return await execa("npx", ["ccusage", ...args], { timeout });
  }
}

interface CcusageEntry {
  timestamp: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  model: string;
  costUSD: number;
}

interface CcusageByIdResponse {
  sessionId: string;
  totalCost: number;
  totalTokens: number;
  entries: CcusageEntry[];
}

export class DataFetcher {
  /**
   * Fetch accurate session data by exact session ID.
   * Uses `ccusage session --id` which returns the true total cost
   * (unlike --breakdown which splits into sub-session slices).
   */
  async fetchSessionById(sessionId: string): Promise<CcusageSession> {
    const { stdout } = await runCcusage(
      ["session", "--id", sessionId, "--json"],
      30000,
    );

    const data: CcusageByIdResponse = JSON.parse(stdout);

    // Aggregate entries by model
    const modelMap = new Map<
      string,
      {
        inputTokens: number;
        outputTokens: number;
        cacheCreationTokens: number;
        cacheReadTokens: number;
        totalTokens: number;
      }
    >();

    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheCreation = 0;
    let totalCacheRead = 0;

    for (const entry of data.entries) {
      // Skip synthetic entries (no real model)
      if (entry.model === "<synthetic>") continue;

      const input = entry.inputTokens || 0;
      const output = entry.outputTokens || 0;
      const cacheCreation = entry.cacheCreationTokens || 0;
      const cacheRead = entry.cacheReadTokens || 0;

      totalInput += input;
      totalOutput += output;
      totalCacheCreation += cacheCreation;
      totalCacheRead += cacheRead;

      const existing = modelMap.get(entry.model) || {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 0,
      };

      existing.inputTokens += input;
      existing.outputTokens += output;
      existing.cacheCreationTokens += cacheCreation;
      existing.cacheReadTokens += cacheRead;
      existing.totalTokens += input + output + cacheCreation + cacheRead;
      modelMap.set(entry.model, existing);
    }

    // Distribute totalCost across models proportionally by token count
    const totalTokensAcrossModels = [...modelMap.values()].reduce(
      (sum, m) => sum + m.totalTokens,
      0,
    );

    const modelBreakdowns: ModelBreakdown[] = [...modelMap.entries()].map(
      ([modelName, stats]) => ({
        modelName,
        inputTokens: stats.inputTokens,
        outputTokens: stats.outputTokens,
        cacheCreationTokens: stats.cacheCreationTokens,
        cacheReadTokens: stats.cacheReadTokens,
        cost:
          totalTokensAcrossModels > 0
            ? data.totalCost * (stats.totalTokens / totalTokensAcrossModels)
            : 0,
      }),
    );

    return {
      sessionId: data.sessionId,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheCreationTokens: totalCacheCreation,
      cacheReadTokens: totalCacheRead,
      totalTokens: data.totalTokens,
      totalCost: data.totalCost,
      modelsUsed: [...modelMap.keys()],
      modelBreakdowns,
    };
  }

  /**
   * Discover a session from the ccusage breakdown list, then fetch accurate
   * data via --id.
   *
   * @param sessionQuery Optional filter — matches against:
   *   1. Project path UUID (or prefix, e.g. "5ede5ccb")
   *   2. Session name (e.g. "subagents") — picks the most recent match
   *   If omitted, returns the first session with a valid project path.
   */
  async fetchSessionData(sessionQuery?: string): Promise<CcusageSession> {
    try {
      const args = ["session", "--json", "--breakdown"];

      const { stdout } = await runCcusage(args, 30000);

      const response: CcusageResponse = JSON.parse(stdout);

      if (!response.sessions || response.sessions.length === 0) {
        throw new Error("No session data found");
      }

      const validSessions = response.sessions.filter(
        (s) => s.projectPath && s.projectPath !== "Unknown Project",
      );

      if (validSessions.length === 0) {
        throw new Error(
          "No sessions with valid project paths found. Please run this command from a SessionEnd hook.",
        );
      }

      let match: CcusageSession | undefined;

      if (!sessionQuery) {
        match = validSessions[0];
      } else {
        // Try matching by project path UUID (exact or prefix)
        match = validSessions.find((s) => {
          const uuid = s.projectPath!.split("/").pop() || "";
          return uuid === sessionQuery || uuid.startsWith(sessionQuery);
        });

        // Try matching by session name (returns first/most recent match)
        if (!match) {
          match = validSessions.find((s) => s.sessionId === sessionQuery);
        }
      }

      if (!match) {
        const available = validSessions
          .slice(0, 10)
          .map((s) => {
            const uuid = s.projectPath!.split("/").pop() || "";
            const short = uuid.slice(0, 8);
            return `  ${short}  ${s.sessionId.padEnd(20)}  $${s.totalCost.toFixed(2)}`;
          })
          .join("\n");

        throw new Error(
          `No session matching "${sessionQuery}". Available sessions:\n${available}`,
        );
      }

      // Extract the full UUID from the projectPath and re-fetch via --id
      // for accurate totals (--breakdown only shows sub-session slices)
      const fullUuid = match.projectPath!.split("/").pop();
      if (fullUuid) {
        try {
          const accurate = await this.fetchSessionById(fullUuid);
          // Preserve projectPath from the discovery result
          accurate.projectPath = match.projectPath;
          return accurate;
        } catch {
          // Fall back to breakdown data if --id fails
          return match;
        }
      }

      return match;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch session data: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get the most recent session ID
   */
  async getMostRecentSessionId(): Promise<string> {
    const sessionData = await this.fetchSessionData();
    return sessionData.sessionId;
  }

  /**
   * Fetch daily usage data for a date range.
   * @param since Start date in YYYYMMDD format
   * @param until End date in YYYYMMDD format
   */
  async fetchDailyData(since: string, until: string): Promise<CcusagePeriodResponse> {
    return this.fetchPeriodData("daily", since, until);
  }

  /**
   * Fetch weekly usage data for a date range.
   * @param since Start date in YYYYMMDD format
   * @param until End date in YYYYMMDD format
   */
  async fetchWeeklyData(since: string, until: string): Promise<CcusagePeriodResponse> {
    return this.fetchPeriodData("weekly", since, until);
  }

  /**
   * Fetch monthly usage data for a date range.
   * @param since Start date in YYYYMMDD format
   * @param until End date in YYYYMMDD format
   */
  async fetchMonthlyData(since: string, until: string): Promise<CcusagePeriodResponse> {
    return this.fetchPeriodData("monthly", since, until);
  }

  /**
   * Internal: fetch period data from ccusage CLI
   */
  private async fetchPeriodData(
    period: "daily" | "weekly" | "monthly",
    since: string,
    until: string,
  ): Promise<CcusagePeriodResponse> {
    const { stdout } = await runCcusage(
      [period, "--since", since, "--until", until, "--json", "--breakdown"],
    );

    const data = JSON.parse(stdout);

    // Handle null/undefined/empty responses
    if (!data || typeof data !== "object") {
      return { entries: [], totals: { totalCost: 0, totalTokens: 0, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, sessions: 0 } };
    }

    // ccusage returns { daily: [...], totals: {...} } (or weekly/monthly key)
    // Normalize to our { entries, totals } interface
    const raw = data[period] || data.entries;
    const entries: CcusagePeriodEntry[] = Array.isArray(raw) ? raw : [];

    if (data.totals) {
      return {
        entries,
        totals: {
          totalCost: data.totals.totalCost || 0,
          totalTokens: data.totals.totalTokens || 0,
          inputTokens: data.totals.inputTokens || 0,
          outputTokens: data.totals.outputTokens || 0,
          cacheCreationTokens: data.totals.cacheCreationTokens || 0,
          cacheReadTokens: data.totals.cacheReadTokens || 0,
          sessions: data.totals.sessions || 0,
        },
      };
    }

    // Fallback: compute totals from entries
    const totals = {
      totalCost: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      sessions: 0,
    };
    for (const entry of entries) {
      totals.totalCost += entry.totalCost || 0;
      totals.totalTokens += entry.totalTokens || 0;
      totals.inputTokens += entry.inputTokens || 0;
      totals.outputTokens += entry.outputTokens || 0;
      totals.cacheCreationTokens += entry.cacheCreationTokens || 0;
      totals.cacheReadTokens += entry.cacheReadTokens || 0;
      totals.sessions += entry.sessions || 0;
    }
    return { entries, totals };
  }

  /**
   * Fetch period data with project/instance breakdown.
   * Returns { projects: Record<string, entries[]>, totals }
   */
  async fetchProjectBreakdown(
    period: "daily" | "weekly" | "monthly",
    since: string,
    until: string,
  ): Promise<ProjectUsageSummary[]> {
    const { stdout } = await runCcusage(
      [period, "--since", since, "--until", until, "--json", "--breakdown", "--instances"],
    );

    const data = JSON.parse(stdout);
    const projects: ProjectUsageSummary[] = [];

    if (!data || typeof data !== "object") return projects;

    // ccusage returns { projects: { "project-path": [...entries] }, totals }
    const projectsMap: Record<string, unknown[]> = data.projects || {};

    for (const [projectPath, entries] of Object.entries(projectsMap)) {
      const entryList = entries as Array<{
        totalCost?: number;
        totalTokens?: number;
        modelBreakdowns?: ModelBreakdown[];
      }>;

      let totalCost = 0;
      let totalTokens = 0;
      const modelMap = new Map<string, ModelBreakdown>();

      for (const entry of entryList) {
        totalCost += entry.totalCost || 0;
        totalTokens += entry.totalTokens || 0;

        if (entry.modelBreakdowns) {
          for (const mb of entry.modelBreakdowns) {
            const existing = modelMap.get(mb.modelName);
            if (existing) {
              existing.inputTokens += mb.inputTokens;
              existing.outputTokens += mb.outputTokens;
              existing.cacheCreationTokens = (existing.cacheCreationTokens || 0) + (mb.cacheCreationTokens || 0);
              existing.cacheReadTokens = (existing.cacheReadTokens || 0) + (mb.cacheReadTokens || 0);
              existing.cost += mb.cost;
            } else {
              modelMap.set(mb.modelName, { ...mb });
            }
          }
        }
      }

      // Convert "C--Users-ANUBAV-anubhav-LLMreceipts" to readable name
      const projectName = this.cleanProjectName(projectPath);

      projects.push({
        projectName,
        projectPath,
        totalCost,
        totalTokens,
        modelBreakdowns: [...modelMap.values()].sort((a, b) => b.cost - a.cost),
      });
    }

    return projects.sort((a, b) => b.totalCost - a.totalCost);
  }

  /**
   * Convert ccusage project path like "C--Users-ANUBAV-anubhav-LLMreceipts"
   * to a readable folder name like "LLMreceipts"
   */
  private cleanProjectName(projectPath: string): string {
    // Split on -- (drive separator) and - (path separator)
    // The ccusage format replaces : with nothing, / with --, and \ with --
    const parts = projectPath.split("-");
    // Take the last meaningful segment
    const nonEmpty = parts.filter((p) => p.length > 0);
    if (nonEmpty.length === 0) return projectPath;

    // Find the last non-user, non-drive segment
    // Heuristic: skip C, Users, username — take the rest as project path
    const usersIdx = nonEmpty.findIndex((p) => p.toLowerCase() === "users");
    if (usersIdx >= 0 && usersIdx + 2 < nonEmpty.length) {
      return nonEmpty.slice(usersIdx + 2).join("/");
    }
    return nonEmpty[nonEmpty.length - 1];
  }
}
