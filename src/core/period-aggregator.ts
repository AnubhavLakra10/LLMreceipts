import { existsSync } from "fs";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { DataFetcher } from "./data-fetcher.js";
import { formatCurrency, formatNumber } from "../utils/formatting.js";
import type { ReceiptConfig } from "../types/config.js";
import type {
  ModelBreakdown,
  PeriodReceiptData,
  ProjectUsageSummary,
} from "../types/ccusage.js";

export class PeriodAggregator {
  private dataFetcher = new DataFetcher();

  private getBaseDir(): string {
    const home = process.env.HOME || process.env.USERPROFILE || "";
    return join(home, ".claude-receipts");
  }

  /**
   * Check and generate yesterday's daily receipt if it doesn't exist.
   */
  async checkAndGenerateDaily(config: ReceiptConfig): Promise<void> {
    if (config.autoDaily === false) return;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const label = this.formatDateLabel(yesterday);

    const outPath = join(this.getBaseDir(), "daily", `${label}.html`);
    if (existsSync(outPath)) return;

    await this.generateDaily(label, config);
  }

  /**
   * Check and generate last complete week's receipt if missing.
   */
  async checkAndGenerateWeekly(config: ReceiptConfig): Promise<void> {
    if (config.autoWeekly === false) return;

    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysSinceLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const lastMonday = new Date(now);
    lastMonday.setDate(now.getDate() - daysSinceLastMonday - 7);

    const weekLabel = this.getISOWeekLabel(lastMonday);
    const outPath = join(this.getBaseDir(), "weekly", `${weekLabel}.html`);
    if (existsSync(outPath)) return;

    await this.generateWeekly(lastMonday, config);
  }

  /**
   * Check and generate last complete month's receipt if missing.
   */
  async checkAndGenerateMonthly(config: ReceiptConfig): Promise<void> {
    if (config.autoMonthly === false) return;

    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthLabel = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

    const outPath = join(this.getBaseDir(), "monthly", `${monthLabel}.html`);
    if (existsSync(outPath)) return;

    await this.generateMonthly(lastMonth, config);
  }

  /**
   * Generate a daily receipt for a specific date.
   * @param date Date string in YYYY-MM-DD format
   */
  async generateDaily(date: string, config: ReceiptConfig): Promise<string> {
    const since = date.replace(/-/g, "");
    const untilDate = new Date(date);
    untilDate.setDate(untilDate.getDate() + 1);
    const until = this.formatDateYYYYMMDD(untilDate);

    const [response, projectBreakdown] = await Promise.all([
      this.dataFetcher.fetchDailyData(since, until),
      this.dataFetcher.fetchProjectBreakdown("daily", since, until),
    ]);

    const modelBreakdowns = this.aggregateModelBreakdowns(response.entries);

    const periodData: PeriodReceiptData = {
      periodType: "daily",
      periodLabel: date,
      dateFrom: date,
      dateTo: date,
      totalCost: response.totals.totalCost,
      totalTokens: response.totals.totalTokens,
      inputTokens: response.totals.inputTokens,
      outputTokens: response.totals.outputTokens,
      cacheCreationTokens: response.totals.cacheCreationTokens,
      cacheReadTokens: response.totals.cacheReadTokens,
      totalSessions: response.totals.sessions,
      modelBreakdowns,
      dailyBreakdown: response.entries,
      projectBreakdown,
    };

    const outDir = join(this.getBaseDir(), "daily");
    const outPath = join(outDir, `${date}.html`);
    const html = this.renderReceiptHtml(periodData, config);

    await mkdir(outDir, { recursive: true });
    await writeFile(outPath, html, "utf-8");

    return outPath;
  }

  /**
   * Generate a weekly receipt for the week containing the given date.
   */
  async generateWeekly(date: Date, config: ReceiptConfig): Promise<string> {
    const monday = new Date(date);
    const dayOfWeek = monday.getDay();
    const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    monday.setDate(monday.getDate() + offset);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const since = this.formatDateYYYYMMDD(monday);
    const untilDate = new Date(sunday);
    untilDate.setDate(untilDate.getDate() + 1);
    const until = this.formatDateYYYYMMDD(untilDate);

    const [response, projectBreakdown] = await Promise.all([
      this.dataFetcher.fetchDailyData(since, until),
      this.dataFetcher.fetchProjectBreakdown("daily", since, until),
    ]);
    const modelBreakdowns = this.aggregateModelBreakdowns(response.entries);
    const weekLabel = this.getISOWeekLabel(monday);

    const periodData: PeriodReceiptData = {
      periodType: "weekly",
      periodLabel: weekLabel,
      dateFrom: this.formatDateLabel(monday),
      dateTo: this.formatDateLabel(sunday),
      totalCost: response.totals.totalCost,
      totalTokens: response.totals.totalTokens,
      inputTokens: response.totals.inputTokens,
      outputTokens: response.totals.outputTokens,
      cacheCreationTokens: response.totals.cacheCreationTokens,
      cacheReadTokens: response.totals.cacheReadTokens,
      totalSessions: response.totals.sessions,
      modelBreakdowns,
      dailyBreakdown: response.entries,
      projectBreakdown,
    };

    const outDir = join(this.getBaseDir(), "weekly");
    const outPath = join(outDir, `${weekLabel}.html`);
    const html = this.renderReceiptHtml(periodData, config);

    await mkdir(outDir, { recursive: true });
    await writeFile(outPath, html, "utf-8");

    return outPath;
  }

  /**
   * Generate a monthly receipt for the month containing the given date.
   */
  async generateMonthly(date: Date, config: ReceiptConfig): Promise<string> {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    const since = this.formatDateYYYYMMDD(firstDay);
    const untilDate = new Date(lastDay);
    untilDate.setDate(untilDate.getDate() + 1);
    const until = this.formatDateYYYYMMDD(untilDate);

    const [response, projectBreakdown] = await Promise.all([
      this.dataFetcher.fetchDailyData(since, until),
      this.dataFetcher.fetchProjectBreakdown("daily", since, until),
    ]);
    const modelBreakdowns = this.aggregateModelBreakdowns(response.entries);
    const monthLabel = `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, "0")}`;

    const periodData: PeriodReceiptData = {
      periodType: "monthly",
      periodLabel: monthLabel,
      dateFrom: this.formatDateLabel(firstDay),
      dateTo: this.formatDateLabel(lastDay),
      totalCost: response.totals.totalCost,
      totalTokens: response.totals.totalTokens,
      inputTokens: response.totals.inputTokens,
      outputTokens: response.totals.outputTokens,
      cacheCreationTokens: response.totals.cacheCreationTokens,
      cacheReadTokens: response.totals.cacheReadTokens,
      totalSessions: response.totals.sessions,
      modelBreakdowns,
      dailyBreakdown: response.entries,
      projectBreakdown,
    };

    const outDir = join(this.getBaseDir(), "monthly");
    const outPath = join(outDir, `${monthLabel}.html`);
    const html = this.renderReceiptHtml(periodData, config);

    await mkdir(outDir, { recursive: true });
    await writeFile(outPath, html, "utf-8");

    return outPath;
  }

  private aggregateModelBreakdowns(entries: Array<{ modelBreakdowns?: ModelBreakdown[] }>): ModelBreakdown[] {
    const modelMap = new Map<string, ModelBreakdown>();

    for (const entry of entries) {
      if (!entry.modelBreakdowns) continue;
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

    return [...modelMap.values()].sort((a, b) => b.cost - a.cost);
  }

  private formatDateYYYYMMDD(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}${m}${d}`;
  }

  private formatDateLabel(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  private getISOWeekLabel(date: Date): string {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  }

  private getModelName(model: string): string {
    const cleaned = model.replace(/-\d{8}$/, "");
    const modelMap: Record<string, string> = {
      "claude-sonnet-4-5": "Claude Sonnet 4.5",
      "claude-sonnet-4-6": "Claude Sonnet 4.6",
      "claude-opus-4-5": "Claude Opus 4.5",
      "claude-opus-4-6": "Claude Opus 4.6",
      "claude-haiku-4-5": "Claude Haiku 4.5",
      "claude-3-5-sonnet": "Claude 3.5 Sonnet",
      "claude-3-opus": "Claude 3 Opus",
      "claude-3-haiku": "Claude 3 Haiku",
    };
    return modelMap[cleaned] || model;
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Render thermal-printer-style receipt HTML for a period summary
   */
  private renderReceiptHtml(data: PeriodReceiptData, config: ReceiptConfig): string {
    const periodTitle = {
      daily: "DAILY SUMMARY",
      weekly: "WEEKLY SUMMARY",
      monthly: "MONTHLY SUMMARY",
    }[data.periodType];

    const company = config.company || "LLM RECEIPTS";
    const dateRange = data.dateFrom === data.dateTo
      ? data.dateFrom
      : `${data.dateFrom} to ${data.dateTo}`;

    // Build model line items
    const modelItems = data.modelBreakdowns
      .map((m) => {
        const name = this.getModelName(m.modelName);
        const lines = [
          `<div class="model-header">
            <span class="model-name">${this.escapeHtml(name)}</span>
            <span class="model-cost">${formatCurrency(m.cost)}</span>
          </div>`,
          `<div class="line-item"><span>  Input tokens</span><span>${formatNumber(m.inputTokens)}</span></div>`,
          `<div class="line-item"><span>  Output tokens</span><span>${formatNumber(m.outputTokens)}</span></div>`,
        ];
        if (m.cacheCreationTokens && m.cacheCreationTokens > 0) {
          lines.push(`<div class="line-item"><span>  Cache write</span><span>${formatNumber(m.cacheCreationTokens)}</span></div>`);
        }
        if (m.cacheReadTokens && m.cacheReadTokens > 0) {
          lines.push(`<div class="line-item"><span>  Cache read</span><span>${formatNumber(m.cacheReadTokens)}</span></div>`);
        }
        return lines.join("\n");
      })
      .join("\n");

    // Build project breakdown items
    const projectItems = data.projectBreakdown
      .map((p) => `
        <div class="project-row">
          <span class="project-name">${this.escapeHtml(p.projectName)}</span>
          <span class="project-cost">${formatCurrency(p.totalCost)}</span>
        </div>`)
      .join("\n");

    // Build daily breakdown for weekly/monthly (skip for daily since it's just one day)
    let dailySection = "";
    if (data.dailyBreakdown.length > 1) {
      const maxCost = Math.max(...data.dailyBreakdown.map((d) => d.totalCost), 1);
      const dailyRows = data.dailyBreakdown
        .map((d) => {
          const barWidth = Math.max(1, Math.round((d.totalCost / maxCost) * 15));
          const bar = "\u2588".repeat(barWidth);
          return `<div class="line-item"><span>${d.date}</span><span>${formatCurrency(d.totalCost)} ${bar}</span></div>`;
        })
        .join("\n");
      dailySection = `
        <div class="separator"></div>
        <div class="section-label">DAILY BREAKDOWN</div>
        <div class="light-separator"></div>
        ${dailyRows}`;
    }

    // Ramboll SVG logo (inline)
    const rambollLogo = `<svg width="170" height="35" viewBox="0 0 170 35" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M145.536 25.5119C145.286 25.5285 145.036 25.4907 144.802 25.4011C144.568 25.3115 144.356 25.1723 144.181 24.993C144.006 24.8136 143.872 24.5985 143.788 24.3625C143.705 24.1264 143.673 23.875 143.696 23.6255V10.4928C143.696 10.0048 143.89 9.5367 144.235 9.19159C144.58 8.84649 145.048 8.65261 145.536 8.65261C146.024 8.65261 146.492 8.84649 146.837 9.19159C147.182 9.5367 147.376 10.0048 147.376 10.4928V22.1544H154.291C154.72 22.1781 155.124 22.3653 155.42 22.6775C155.715 22.9897 155.88 23.4033 155.88 23.8331C155.88 24.263 155.715 24.6765 155.42 24.9887C155.124 25.3009 154.72 25.4881 154.291 25.5119H145.536ZM128.364 25.5119C128.114 25.5276 127.864 25.4892 127.631 25.3993C127.397 25.3094 127.186 25.1701 127.011 24.991C126.836 24.8119 126.702 24.5972 126.618 24.3615C126.534 24.1258 126.502 23.8748 126.524 23.6255V10.4928C126.524 10.0048 126.718 9.5367 127.063 9.19159C127.408 8.84649 127.876 8.65261 128.364 8.65261C128.852 8.65261 129.32 8.84649 129.665 9.19159C130.01 9.5367 130.204 10.0048 130.204 10.4928V22.1544H137.094C137.523 22.1781 137.927 22.3653 138.222 22.6775C138.517 22.9897 138.682 23.4033 138.682 23.8331C138.682 24.263 138.517 24.6765 138.222 24.9887C137.927 25.3009 137.523 25.4881 137.094 25.5119H128.364ZM17.1873 10.621C17.1575 10.3722 17.1827 10.1199 17.2614 9.88196C17.34 9.64404 17.47 9.42635 17.6422 9.24434C17.8145 9.06233 18.0246 8.92048 18.2579 8.82884C18.4911 8.7372 18.7416 8.69804 18.9917 8.71412H24.8711C27.0138 8.71412 28.6746 9.32411 29.792 10.4211C30.2727 10.9349 30.6474 11.5385 30.8946 12.1973C31.1417 12.8561 31.2565 13.5572 31.2324 14.2604V14.2963C31.2988 15.3996 31.0067 16.4948 30.3998 17.4185C29.7929 18.3423 28.9036 19.0451 27.8647 19.4222L30.4277 22.4978C30.8029 22.8624 31.0279 23.3544 31.0581 23.8767C31.0357 24.3581 30.8278 24.8121 30.4781 25.1436C30.1284 25.4752 29.6639 25.6586 29.182 25.6554C28.8383 25.6504 28.5014 25.559 28.2022 25.3897C27.9031 25.2204 27.6513 24.9786 27.47 24.6866L23.8818 20.145H20.9088V23.769C20.9307 24.0183 20.8985 24.2694 20.8144 24.505C20.7303 24.7407 20.5963 24.9554 20.4216 25.1346C20.2469 25.3137 20.0355 25.4529 19.802 25.5428C19.5685 25.6327 19.3183 25.6711 19.0685 25.6554C18.8186 25.672 18.568 25.6342 18.3341 25.5446C18.1002 25.455 17.8885 25.3158 17.7135 25.1365C17.5386 24.9572 17.4047 24.7421 17.3209 24.506C17.2371 24.2699 17.2055 24.0185 17.2283 23.769L17.1873 10.621ZM90.5294 8.71412C92.4414 8.71412 93.9741 9.25234 94.948 10.2211C95.3201 10.5917 95.6129 11.0341 95.8085 11.5215C96.0041 12.0088 96.0985 12.5308 96.086 13.0558C96.113 13.8158 95.9174 14.5671 95.523 15.2174C95.1287 15.8676 94.5529 16.3884 93.8664 16.7157C95.8143 17.4539 97.024 18.5816 97.024 20.8421C97.024 23.9638 94.5174 25.4914 90.7089 25.4914H84.5577C84.308 25.5071 84.0578 25.4687 83.8243 25.3788C83.5908 25.2889 83.3794 25.1496 83.2047 24.9705C83.0299 24.7914 82.896 24.5767 82.8119 24.341C82.7278 24.1053 82.6956 23.8543 82.7175 23.605V10.621C82.6927 10.3714 82.7222 10.1195 82.804 9.88248C82.8858 9.64544 83.0179 9.4289 83.1912 9.24774C83.3646 9.06658 83.5751 8.92508 83.8083 8.83297C84.0416 8.74086 84.292 8.70032 84.5423 8.71412H90.5294ZM75.4745 23.769C75.4745 24.2571 75.2806 24.7252 74.9355 25.0703C74.5904 25.4154 74.1224 25.6093 73.6343 25.6093C73.1462 25.6093 72.6782 25.4154 72.3331 25.0703C71.988 24.7252 71.7941 24.2571 71.7941 23.769V15.4445L68.5494 20.432C68.4007 20.7108 68.1791 20.9438 67.9082 21.1063C67.6374 21.2689 67.3274 21.3547 67.0116 21.3547C66.6957 21.3547 66.3858 21.2689 66.1149 21.1063C65.844 20.9438 65.6224 20.7108 65.4738 20.432L62.2803 15.5163V23.769C62.2935 24.0185 62.2557 24.2681 62.1693 24.5025C62.0829 24.7369 61.9497 24.9513 61.7778 25.1326C61.6058 25.3138 61.3988 25.4582 61.1693 25.5568C60.9397 25.6555 60.6925 25.7063 60.4427 25.7063C60.1928 25.7063 59.9456 25.6555 59.7161 25.5568C59.4865 25.4582 59.2795 25.3138 59.1076 25.1326C58.9356 24.9513 58.8024 24.7369 58.716 24.5025C58.6296 24.2681 58.5918 24.0185 58.605 23.769V10.3493C58.605 9.18571 59.6302 8.62698 60.6041 8.62698C61.0121 8.59852 61.42 8.68413 61.7821 8.87423C62.1442 9.06434 62.4463 9.35144 62.6545 9.70343L67.0731 16.8798L71.4917 9.70343C71.6906 9.35474 71.9835 9.06896 72.3369 8.87863C72.6904 8.68831 73.0902 8.60112 73.4908 8.62698C74.4647 8.62698 75.495 9.18571 75.495 10.3493L75.4745 23.769ZM162.344 35C167.393 35 169.556 32.8471 169.556 27.8237V7.17633C169.556 2.1529 167.393 0 162.344 0H126.524L111.033 18.5508L110.459 18.2791L111.9 11.9281C111.664 11.8778 111.423 11.8538 111.182 11.8563C108.188 11.8563 106.112 14.2091 106.112 17.0797V17.1309C106.095 17.8152 106.214 18.4961 106.464 19.1335C106.713 19.7709 107.088 20.3518 107.566 20.842C108.044 21.3322 108.615 21.7217 109.245 21.9876C109.876 22.2535 110.554 22.3904 111.238 22.3902C114.232 22.3902 116.287 20.0578 116.287 17.1873V17.1309C116.294 16.61 116.219 16.0913 116.067 15.5931L119.225 13.1173C119.841 14.3417 120.162 15.6934 120.163 17.0643V17.1156C120.163 21.8724 116.395 25.7835 111.202 25.7835C106.01 25.7835 102.273 21.9237 102.273 17.1719V17.1156C102.273 12.3433 106.041 8.45269 111.238 8.45269C111.725 8.45515 112.211 8.48424 112.694 8.53984L114.662 0H7.21221C2.16315 0 0 2.1529 0 7.17633V27.8237C0 32.8471 2.16315 35 7.21221 35H162.344ZM48.2403 21.7443H40.8282L39.6595 24.5072C39.515 24.8877 39.244 25.2069 38.8921 25.4113C38.5401 25.6156 38.1285 25.6927 37.7265 25.6296C37.3244 25.5665 36.9562 25.3671 36.6838 25.0647C36.4114 24.7623 36.2512 24.3754 36.2302 23.969C36.2435 23.6753 36.3168 23.3874 36.4455 23.1232L42.325 9.93922C42.5225 9.50474 42.841 9.13632 43.2423 8.87795C43.6436 8.61959 44.1108 8.4822 44.5881 8.4822C45.0654 8.4822 45.5326 8.61959 45.9339 8.87795C46.3352 9.13632 46.6536 9.50474 46.8512 9.93922L52.7153 23.1232C52.844 23.3874 52.9173 23.6753 52.9306 23.969C52.903 24.3807 52.7359 24.7707 52.4569 25.0747C52.1779 25.3787 51.8036 25.5785 51.3958 25.6412C50.9879 25.7039 50.5709 25.6257 50.2135 25.4196C49.856 25.2134 49.5795 24.8916 49.4296 24.5072L48.2403 21.7443ZM42.202 18.4944H46.8717L44.524 12.9533L42.202 18.4944ZM92.3902 13.7581C92.3902 12.574 91.5393 11.9845 89.9707 11.9845H86.3108V15.5163H89.7349C91.3803 15.5163 92.3902 15.0037 92.3902 13.7581ZM24.5636 12.0716H20.8678V16.8798H24.6353C26.4397 16.8798 27.4649 15.9315 27.4649 14.5116V14.4603C27.4649 12.8815 26.3679 12.0716 24.5636 12.0716ZM90.5858 18.5867H86.3108V22.262H90.7294C92.3748 22.262 93.3641 21.6879 93.3641 20.4525C93.3641 19.2172 92.5183 18.5867 90.6063 18.5867" fill="#009DF0"/></svg>`;

    const companyHeader = config.company
      ? `<div class="company-header">
          <div class="company-logo">${rambollLogo}</div>
          <div class="company-name">${this.escapeHtml(config.company)}</div>
        </div>
        <div class="company-divider"></div>`
      : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(company)} - ${periodTitle} (${data.periodLabel})</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 16px;
      background: #3a3a3a;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .receipt {
      background: #f8f8f8;
      width: 420px;
      padding: 30px 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2);
      position: relative;
      animation: slideIn 0.5s ease-out;
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateY(-20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .receipt::before, .receipt::after {
      content: '';
      position: absolute;
      left: 0; right: 0;
      height: 15px;
      background: repeating-linear-gradient(90deg, transparent, transparent 10px, #f8f8f8 10px, #f8f8f8 20px);
    }
    .receipt::before { top: -15px; left: -10px; }
    .receipt::after { bottom: -15px; }
    .company-header { text-align: center; margin-bottom: 10px; }
    .company-logo svg { width: 140px; height: auto; }
    .company-name {
      font-size: 11px; font-weight: bold; letter-spacing: 1px;
      color: #333; margin-top: 6px; text-transform: uppercase;
    }
    .company-divider { border-bottom: 2px solid #009DF0; margin: 12px 0; }
    .header { text-align: center; padding: 15px 0; }
    .period-type {
      font-size: 18px; font-weight: bold; letter-spacing: 2px; color: #333;
    }
    .period-label {
      font-size: 14px; color: #555; margin-top: 4px;
    }
    .meta { margin: 10px 0; display: flex; flex-direction: column; gap: 5px; }
    .meta-row {
      color: #666;
      display: grid;
      grid-template-columns: auto minmax(0,1fr) auto;
      gap: 1px; text-align: left;
    }
    .meta .dots { overflow: hidden; height: 1rem; }
    .meta .value { text-align: right; }
    .separator { border-bottom: 2px solid #333; margin: 15px 0; }
    .light-separator { border-bottom: 1px dashed #999; margin: 10px 0; }
    .section-label {
      font-weight: bold; font-size: 12px; letter-spacing: 1px;
      color: #333; padding: 8px 0 4px;
    }
    .model-header {
      display: flex; justify-content: space-between;
      padding: 8px 0 4px; margin-top: 10px;
      border-bottom: 1px dashed #ccc;
    }
    .model-header:first-child { margin-top: 0; }
    .model-name { font-weight: bold; color: #333; }
    .model-cost { font-weight: bold; color: #333; }
    .line-item {
      display: flex; justify-content: space-between;
      padding: 3px 0; color: #555;
    }
    .project-row {
      display: flex; justify-content: space-between;
      padding: 5px 0; color: #555;
    }
    .project-name {
      font-size: 13px; max-width: 260px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .project-cost { font-weight: bold; color: #333; }
    .total-section {
      margin-top: 20px; padding-top: 15px;
      border-top: 2px solid #333;
    }
    .total {
      font-weight: bold; font-size: 18px;
      display: flex; justify-content: space-between;
      margin: 10px 0;
    }
    .footer {
      text-align: center; margin-top: 20px;
      padding-top: 20px; border-top: 2px dashed #999; color: #666;
    }
    .footer-message { margin: 15px 0; color: #333; }
    .generated-by { margin-top: 20px; padding-top: 20px; border-top: 1px dashed #999; }
    @media print {
      body { background: white; }
      .receipt { box-shadow: none; width: 100%; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    ${companyHeader}
    <div class="header">
      <div class="period-type">${periodTitle}</div>
      <div class="period-label">${data.periodLabel}</div>
      <div class="meta">
        <div class="meta-row">
          <div>Period</div><div class="dots">....................</div><div class="value">${dateRange}</div>
        </div>
        <div class="meta-row">
          <div>Generated</div><div class="dots">....................</div><div class="value">${new Date().toLocaleDateString()}</div>
        </div>
      </div>
    </div>

    <div class="separator"></div>
    <div class="section-label">MODEL BREAKDOWN</div>
    <div class="light-separator"></div>
    ${modelItems}

    ${data.projectBreakdown.length > 0 ? `
    <div class="separator"></div>
    <div class="section-label">PROJECTS</div>
    <div class="light-separator"></div>
    ${projectItems}` : ""}

    ${dailySection}

    <div class="total-section">
      <div class="line-item"><span>Total tokens</span><span>${formatNumber(data.totalTokens)}</span></div>
      <div class="line-item"><span>Input</span><span>${formatNumber(data.inputTokens)}</span></div>
      <div class="line-item"><span>Output</span><span>${formatNumber(data.outputTokens)}</span></div>
      ${data.cacheCreationTokens > 0 ? `<div class="line-item"><span>Cache write</span><span>${formatNumber(data.cacheCreationTokens)}</span></div>` : ""}
      ${data.cacheReadTokens > 0 ? `<div class="line-item"><span>Cache read</span><span>${formatNumber(data.cacheReadTokens)}</span></div>` : ""}
      <div class="total">
        <span>TOTAL</span>
        <span>${formatCurrency(data.totalCost)}</span>
      </div>
    </div>

    <div class="footer">
      <div class="footer-message">Thank you for building!</div>
      <div class="generated-by">
        Powered by <strong>LLM Receipts</strong><br>
        <a href="https://github.com/AnubhavLakra10/LLMreceipts" style="color: #009DF0; font-size: 12px;">github.com/AnubhavLakra10/LLMreceipts</a>
      </div>
    </div>
  </div>

  <script id="period-data" type="application/json">
${JSON.stringify(data, null, 2)}
  </script>
</body>
</html>`;
  }
}
