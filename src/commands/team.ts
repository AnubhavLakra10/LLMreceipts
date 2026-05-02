import { readFile, writeFile, mkdir, readdir } from "fs/promises";
import { existsSync } from "fs";
import { join, basename } from "path";
import chalk from "chalk";
import ora from "ora";
import { ConfigManager } from "../core/config-manager.js";
import { formatCurrency, formatNumber, formatDateTime } from "../utils/formatting.js";

/**
 * Individual team member receipt data (exported after each session)
 */
export interface TeamMemberReceipt {
  userName: string;
  sessionSlug: string;
  sessionDate: string;
  location: string;
  totalCost: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  modelsUsed: string[];
  modelBreakdowns: Array<{
    modelName: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
    cost: number;
  }>;
}

/**
 * Aggregated team report
 */
interface TeamReport {
  company: string;
  generatedAt: string;
  period: { from: string; to: string };
  totalCost: number;
  totalSessions: number;
  totalTokens: number;
  memberSummaries: MemberSummary[];
  modelSummaries: ModelSummary[];
  dailyCosts: DailyCost[];
}

interface MemberSummary {
  userName: string;
  sessions: number;
  totalCost: number;
  totalTokens: number;
  avgCostPerSession: number;
}

interface ModelSummary {
  modelName: string;
  totalCost: number;
  totalTokens: number;
  sessionsUsed: number;
}

interface DailyCost {
  date: string;
  cost: number;
  sessions: number;
}

export interface TeamOptions {
  export?: boolean;
  report?: boolean;
  html?: boolean;
  userName?: string;
  from?: string;
  to?: string;
}

export class TeamCommand {
  private configManager = new ConfigManager();

  async execute(options: TeamOptions): Promise<void> {
    try {
      if (options.export) {
        await this.exportMemberData(options.userName);
      } else if (options.report || options.html) {
        await this.generateTeamReport(options);
      } else {
        this.showHelp();
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      } else {
        console.error(chalk.red("An unknown error occurred"));
      }
      process.exit(1);
    }
  }

  /**
   * Export current user's recent session data to the shared team-data directory
   */
  private async exportMemberData(userName?: string): Promise<void> {
    const config = await this.configManager.loadConfig();
    const teamDir = config.teamDataDir;

    if (!teamDir) {
      throw new Error(
        'No team data directory configured. Run: claude-receipts config --set teamDataDir="<shared-path>"',
      );
    }

    const name = userName || process.env.USERNAME || process.env.USER || "unknown";
    const spinner = ora(`Exporting session data for ${name}...`).start();

    // Ensure team-data directory exists
    const memberDir = join(teamDir, name);
    if (!existsSync(memberDir)) {
      await mkdir(memberDir, { recursive: true });
    }

    // Read existing receipts from ~/.claude-receipts/projects/
    const home = process.env.HOME || process.env.USERPROFILE || "";
    const receiptsDir = join(home, ".claude-receipts", "projects");

    if (!existsSync(receiptsDir)) {
      spinner.warn("No receipts found. Generate some receipts first.");
      return;
    }

    const files = await readdir(receiptsDir);
    const htmlFiles = files.filter((f) => f.endsWith(".html"));

    if (htmlFiles.length === 0) {
      spinner.warn("No receipt HTML files found.");
      return;
    }

    let exported = 0;

    for (const file of htmlFiles) {
      const filePath = join(receiptsDir, file);
      const content = await readFile(filePath, "utf-8");

      // Extract the embedded receipt JSON data from the HTML
      const dataMatch = content.match(
        /<script id="receipt-data" type="application\/json">\s*([\s\S]*?)\s*<\/script>/,
      );

      if (!dataMatch) continue;

      try {
        const receiptData = JSON.parse(dataMatch[1]);
        const memberReceipt: TeamMemberReceipt = {
          userName: name,
          sessionSlug: receiptData.sessionSlug || basename(file, ".html"),
          sessionDate: receiptData.sessionDate || new Date().toISOString(),
          location: receiptData.location || config.location || "Unknown",
          totalCost: receiptData.totalCost || 0,
          totalTokens: receiptData.totalTokens || 0,
          inputTokens: receiptData.inputTokens || 0,
          outputTokens: receiptData.outputTokens || 0,
          cacheCreationTokens: receiptData.cacheCreationTokens || 0,
          cacheReadTokens: receiptData.cacheReadTokens || 0,
          modelsUsed: (receiptData.modelBreakdowns || []).map(
            (m: { modelName: string }) => m.modelName,
          ),
          modelBreakdowns: receiptData.modelBreakdowns || [],
        };

        const outFile = join(memberDir, `${basename(file, ".html")}.json`);
        await writeFile(outFile, JSON.stringify(memberReceipt, null, 2), "utf-8");
        exported++;
      } catch {
        // Skip malformed receipt data
      }
    }

    spinner.succeed(`Exported ${exported} receipts for ${name} to ${memberDir}`);
  }

  /**
   * Generate an aggregated team report from all member data
   */
  private async generateTeamReport(options: TeamOptions): Promise<void> {
    const config = await this.configManager.loadConfig();
    const teamDir = config.teamDataDir;

    if (!teamDir) {
      throw new Error(
        'No team data directory configured. Run: claude-receipts config --set teamDataDir="<shared-path>"',
      );
    }

    if (!existsSync(teamDir)) {
      throw new Error(`Team data directory not found: ${teamDir}`);
    }

    const spinner = ora("Generating team report...").start();

    // Collect all member receipts
    const allReceipts: TeamMemberReceipt[] = [];
    const memberDirs = await readdir(teamDir);

    for (const dir of memberDirs) {
      const memberPath = join(teamDir, dir);
      try {
        const files = await readdir(memberPath);
        const jsonFiles = files.filter((f) => f.endsWith(".json"));

        for (const file of jsonFiles) {
          const content = await readFile(join(memberPath, file), "utf-8");
          const receipt: TeamMemberReceipt = JSON.parse(content);
          allReceipts.push(receipt);
        }
      } catch {
        // Skip non-directory entries
      }
    }

    if (allReceipts.length === 0) {
      spinner.warn("No team receipt data found. Each member should run: claude-receipts team --export");
      return;
    }

    // Filter by date range
    let filtered = allReceipts;
    if (options.from) {
      const fromDate = new Date(options.from);
      filtered = filtered.filter((r) => new Date(r.sessionDate) >= fromDate);
    }
    if (options.to) {
      const toDate = new Date(options.to);
      filtered = filtered.filter((r) => new Date(r.sessionDate) <= toDate);
    }

    // Build report
    const report = this.buildReport(filtered, config.company || "Team");

    spinner.succeed(`Report generated from ${filtered.length} sessions`);

    if (options.html) {
      const htmlPath = join(teamDir, "team-report.html");
      const html = this.renderReportHtml(report);
      await writeFile(htmlPath, html, "utf-8");
      console.log(chalk.green(`\nHTML report saved to: ${htmlPath}`));

      // Open in browser
      const { execa } = await import("execa");
      try {
        if (process.platform === "win32") {
          await execa("cmd", ["/c", "start", htmlPath]);
        } else if (process.platform === "darwin") {
          await execa("open", [htmlPath]);
        } else {
          await execa("xdg-open", [htmlPath]);
        }
      } catch {
        // Browser open is best-effort
      }
    } else {
      this.printConsoleReport(report);
    }
  }

  /**
   * Build aggregated report from receipts
   */
  private buildReport(receipts: TeamMemberReceipt[], company: string): TeamReport {
    const dates = receipts.map((r) => r.sessionDate).sort();

    // Member summaries
    const memberMap = new Map<string, MemberSummary>();
    for (const r of receipts) {
      const existing = memberMap.get(r.userName) || {
        userName: r.userName,
        sessions: 0,
        totalCost: 0,
        totalTokens: 0,
        avgCostPerSession: 0,
      };
      existing.sessions++;
      existing.totalCost += r.totalCost;
      existing.totalTokens += r.totalTokens;
      existing.avgCostPerSession = existing.totalCost / existing.sessions;
      memberMap.set(r.userName, existing);
    }

    // Model summaries
    const modelMap = new Map<string, ModelSummary>();
    for (const r of receipts) {
      for (const m of r.modelBreakdowns) {
        const existing = modelMap.get(m.modelName) || {
          modelName: m.modelName,
          totalCost: 0,
          totalTokens: 0,
          sessionsUsed: 0,
        };
        existing.totalCost += m.cost;
        existing.totalTokens += m.inputTokens + m.outputTokens + (m.cacheCreationTokens || 0) + (m.cacheReadTokens || 0);
        existing.sessionsUsed++;
        modelMap.set(m.modelName, existing);
      }
    }

    // Daily costs
    const dailyMap = new Map<string, DailyCost>();
    for (const r of receipts) {
      const day = r.sessionDate.split("T")[0];
      const existing = dailyMap.get(day) || { date: day, cost: 0, sessions: 0 };
      existing.cost += r.totalCost;
      existing.sessions++;
      dailyMap.set(day, existing);
    }

    return {
      company,
      generatedAt: new Date().toISOString(),
      period: {
        from: dates[0] || "N/A",
        to: dates[dates.length - 1] || "N/A",
      },
      totalCost: receipts.reduce((sum, r) => sum + r.totalCost, 0),
      totalSessions: receipts.length,
      totalTokens: receipts.reduce((sum, r) => sum + r.totalTokens, 0),
      memberSummaries: [...memberMap.values()].sort((a, b) => b.totalCost - a.totalCost),
      modelSummaries: [...modelMap.values()].sort((a, b) => b.totalCost - a.totalCost),
      dailyCosts: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  /**
   * Print console report
   */
  private printConsoleReport(report: TeamReport): void {
    console.log(chalk.cyan.bold(`\n${"━".repeat(50)}`));
    console.log(chalk.cyan.bold(`  ${report.company} - Claude Usage Report`));
    console.log(chalk.cyan.bold(`${"━".repeat(50)}`));

    console.log(chalk.gray(`  Period: ${report.period.from.split("T")[0]} to ${report.period.to.split("T")[0]}`));
    console.log(chalk.gray(`  Generated: ${new Date(report.generatedAt).toLocaleString()}\n`));

    console.log(chalk.bold(`  Total Cost:     ${formatCurrency(report.totalCost)}`));
    console.log(chalk.bold(`  Total Sessions: ${report.totalSessions}`));
    console.log(chalk.bold(`  Total Tokens:   ${formatNumber(report.totalTokens)}`));

    // Members
    console.log(chalk.cyan(`\n${"─".repeat(50)}`));
    console.log(chalk.cyan.bold("  Team Members"));
    console.log(chalk.cyan(`${"─".repeat(50)}`));

    for (const member of report.memberSummaries) {
      console.log(
        `  ${chalk.bold(member.userName.padEnd(20))} ${formatCurrency(member.totalCost).padStart(10)}  ${String(member.sessions).padStart(4)} sessions  avg ${formatCurrency(member.avgCostPerSession)}/session`,
      );
    }

    // Models
    console.log(chalk.cyan(`\n${"─".repeat(50)}`));
    console.log(chalk.cyan.bold("  Model Usage"));
    console.log(chalk.cyan(`${"─".repeat(50)}`));

    for (const model of report.modelSummaries) {
      const cleanName = this.getModelName(model.modelName);
      console.log(
        `  ${chalk.bold(cleanName.padEnd(25))} ${formatCurrency(model.totalCost).padStart(10)}  ${formatNumber(model.totalTokens).padStart(12)} tokens`,
      );
    }

    // Daily
    if (report.dailyCosts.length > 0) {
      console.log(chalk.cyan(`\n${"─".repeat(50)}`));
      console.log(chalk.cyan.bold("  Daily Breakdown"));
      console.log(chalk.cyan(`${"─".repeat(50)}`));

      for (const day of report.dailyCosts.slice(-14)) {
        const bar = "█".repeat(Math.max(1, Math.round(day.cost * 10)));
        console.log(
          `  ${day.date}  ${formatCurrency(day.cost).padStart(10)}  ${String(day.sessions).padStart(3)} sessions  ${chalk.blue(bar)}`,
        );
      }
    }

    console.log(chalk.cyan(`\n${"━".repeat(50)}\n`));
  }

  /**
   * Render full HTML team report with Ramboll branding
   */
  private renderReportHtml(report: TeamReport): string {
    const rambollLogo = `<svg width="170" height="35" viewBox="0 0 170 35" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M145.536 25.5119C145.286 25.5285 145.036 25.4907 144.802 25.4011C144.568 25.3115 144.356 25.1723 144.181 24.993C144.006 24.8136 143.872 24.5985 143.788 24.3625C143.705 24.1264 143.673 23.875 143.696 23.6255V10.4928C143.696 10.0048 143.89 9.5367 144.235 9.19159C144.58 8.84649 145.048 8.65261 145.536 8.65261C146.024 8.65261 146.492 8.84649 146.837 9.19159C147.182 9.5367 147.376 10.0048 147.376 10.4928V22.1544H154.291C154.72 22.1781 155.124 22.3653 155.42 22.6775C155.715 22.9897 155.88 23.4033 155.88 23.8331C155.88 24.263 155.715 24.6765 155.42 24.9887C155.124 25.3009 154.72 25.4881 154.291 25.5119H145.536ZM128.364 25.5119C128.114 25.5276 127.864 25.4892 127.631 25.3993C127.397 25.3094 127.186 25.1701 127.011 24.991C126.836 24.8119 126.702 24.5972 126.618 24.3615C126.534 24.1258 126.502 23.8748 126.524 23.6255V10.4928C126.524 10.0048 126.718 9.5367 127.063 9.19159C127.408 8.84649 127.876 8.65261 128.364 8.65261C128.852 8.65261 129.32 8.84649 129.665 9.19159C130.01 9.5367 130.204 10.0048 130.204 10.4928V22.1544H137.094C137.523 22.1781 137.927 22.3653 138.222 22.6775C138.517 22.9897 138.682 23.4033 138.682 23.8331C138.682 24.263 138.517 24.6765 138.222 24.9887C137.927 25.3009 137.523 25.4881 137.094 25.5119H128.364ZM17.1873 10.621C17.1575 10.3722 17.1827 10.1199 17.2614 9.88196C17.34 9.64404 17.47 9.42635 17.6422 9.24434C17.8145 9.06233 18.0246 8.92048 18.2579 8.82884C18.4911 8.7372 18.7416 8.69804 18.9917 8.71412H24.8711C27.0138 8.71412 28.6746 9.32411 29.792 10.4211C30.2727 10.9349 30.6474 11.5385 30.8946 12.1973C31.1417 12.8561 31.2565 13.5572 31.2324 14.2604V14.2963C31.2988 15.3996 31.0067 16.4948 30.3998 17.4185C29.7929 18.3423 28.9036 19.0451 27.8647 19.4222L30.4277 22.4978C30.8029 22.8624 31.0279 23.3544 31.0581 23.8767C31.0357 24.3581 30.8278 24.8121 30.4781 25.1436C30.1284 25.4752 29.6639 25.6586 29.182 25.6554C28.8383 25.6504 28.5014 25.559 28.2022 25.3897C27.9031 25.2204 27.6513 24.9786 27.47 24.6866L23.8818 20.145H20.9088V23.769C20.9307 24.0183 20.8985 24.2694 20.8144 24.505C20.7303 24.7407 20.5963 24.9554 20.4216 25.1346C20.2469 25.3137 20.0355 25.4529 19.802 25.5428C19.5685 25.6327 19.3183 25.6711 19.0685 25.6554C18.8186 25.672 18.568 25.6342 18.3341 25.5446C18.1002 25.455 17.8885 25.3158 17.7135 25.1365C17.5386 24.9572 17.4047 24.7421 17.3209 24.506C17.2371 24.2699 17.2055 24.0185 17.2283 23.769L17.1873 10.621ZM90.5294 8.71412C92.4414 8.71412 93.9741 9.25234 94.948 10.2211C95.3201 10.5917 95.6129 11.0341 95.8085 11.5215C96.0041 12.0088 96.0985 12.5308 96.086 13.0558C96.113 13.8158 95.9174 14.5671 95.523 15.2174C95.1287 15.8676 94.5529 16.3884 93.8664 16.7157C95.8143 17.4539 97.024 18.5816 97.024 20.8421C97.024 23.9638 94.5174 25.4914 90.7089 25.4914H84.5577C84.308 25.5071 84.0578 25.4687 83.8243 25.3788C83.5908 25.2889 83.3794 25.1496 83.2047 24.9705C83.0299 24.7914 82.896 24.5767 82.8119 24.341C82.7278 24.1053 82.6956 23.8543 82.7175 23.605V10.621C82.6927 10.3714 82.7222 10.1195 82.804 9.88248C82.8858 9.64544 83.0179 9.4289 83.1912 9.24774C83.3646 9.06658 83.5751 8.92508 83.8083 8.83297C84.0416 8.74086 84.292 8.70032 84.5423 8.71412H90.5294ZM75.4745 23.769C75.4745 24.2571 75.2806 24.7252 74.9355 25.0703C74.5904 25.4154 74.1224 25.6093 73.6343 25.6093C73.1462 25.6093 72.6782 25.4154 72.3331 25.0703C71.988 24.7252 71.7941 24.2571 71.7941 23.769V15.4445L68.5494 20.432C68.4007 20.7108 68.1791 20.9438 67.9082 21.1063C67.6374 21.2689 67.3274 21.3547 67.0116 21.3547C66.6957 21.3547 66.3858 21.2689 66.1149 21.1063C65.844 20.9438 65.6224 20.7108 65.4738 20.432L62.2803 15.5163V23.769C62.2935 24.0185 62.2557 24.2681 62.1693 24.5025C62.0829 24.7369 61.9497 24.9513 61.7778 25.1326C61.6058 25.3138 61.3988 25.4582 61.1693 25.5568C60.9397 25.6555 60.6925 25.7063 60.4427 25.7063C60.1928 25.7063 59.9456 25.6555 59.7161 25.5568C59.4865 25.4582 59.2795 25.3138 59.1076 25.1326C58.9356 24.9513 58.8024 24.7369 58.716 24.5025C58.6296 24.2681 58.5918 24.0185 58.605 23.769V10.3493C58.605 9.18571 59.6302 8.62698 60.6041 8.62698C61.0121 8.59852 61.42 8.68413 61.7821 8.87423C62.1442 9.06434 62.4463 9.35144 62.6545 9.70343L67.0731 16.8798L71.4917 9.70343C71.6906 9.35474 71.9835 9.06896 72.3369 8.87863C72.6904 8.68831 73.0902 8.60112 73.4908 8.62698C74.4647 8.62698 75.495 9.18571 75.495 10.3493L75.4745 23.769ZM162.344 35C167.393 35 169.556 32.8471 169.556 27.8237V7.17633C169.556 2.1529 167.393 0 162.344 0H126.524L111.033 18.5508L110.459 18.2791L111.9 11.9281C111.664 11.8778 111.423 11.8538 111.182 11.8563C108.188 11.8563 106.112 14.2091 106.112 17.0797V17.1309C106.095 17.8152 106.214 18.4961 106.464 19.1335C106.713 19.7709 107.088 20.3518 107.566 20.842C108.044 21.3322 108.615 21.7217 109.245 21.9876C109.876 22.2535 110.554 22.3904 111.238 22.3902C114.232 22.3902 116.287 20.0578 116.287 17.1873V17.1309C116.294 16.61 116.219 16.0913 116.067 15.5931L119.225 13.1173C119.841 14.3417 120.162 15.6934 120.163 17.0643V17.1156C120.163 21.8724 116.395 25.7835 111.202 25.7835C106.01 25.7835 102.273 21.9237 102.273 17.1719V17.1156C102.273 12.3433 106.041 8.45269 111.238 8.45269C111.725 8.45515 112.211 8.48424 112.694 8.53984L114.662 0H7.21221C2.16315 0 0 2.1529 0 7.17633V27.8237C0 32.8471 2.16315 35 7.21221 35H162.344ZM48.2403 21.7443H40.8282L39.6595 24.5072C39.515 24.8877 39.244 25.2069 38.8921 25.4113C38.5401 25.6156 38.1285 25.6927 37.7265 25.6296C37.3244 25.5665 36.9562 25.3671 36.6838 25.0647C36.4114 24.7623 36.2512 24.3754 36.2302 23.969C36.2435 23.6753 36.3168 23.3874 36.4455 23.1232L42.325 9.93922C42.5225 9.50474 42.841 9.13632 43.2423 8.87795C43.6436 8.61959 44.1108 8.4822 44.5881 8.4822C45.0654 8.4822 45.5326 8.61959 45.9339 8.87795C46.3352 9.13632 46.6536 9.50474 46.8512 9.93922L52.7153 23.1232C52.844 23.3874 52.9173 23.6753 52.9306 23.969C52.903 24.3807 52.7359 24.7707 52.4569 25.0747C52.1779 25.3787 51.8036 25.5785 51.3958 25.6412C50.9879 25.7039 50.5709 25.6257 50.2135 25.4196C49.856 25.2134 49.5795 24.8916 49.4296 24.5072L48.2403 21.7443ZM42.202 18.4944H46.8717L44.524 12.9533L42.202 18.4944ZM92.3902 13.7581C92.3902 12.574 91.5393 11.9845 89.9707 11.9845H86.3108V15.5163H89.7349C91.3803 15.5163 92.3902 15.0037 92.3902 13.7581ZM24.5636 12.0716H20.8678V16.8798H24.6353C26.4397 16.8798 27.4649 15.9315 27.4649 14.5116V14.4603C27.4649 12.8815 26.3679 12.0716 24.5636 12.0716ZM90.5858 18.5867H86.3108V22.262H90.7294C92.3748 22.262 93.3641 21.6879 93.3641 20.4525C93.3641 19.2172 92.5183 18.5867 90.6063 18.5867" fill="#009DF0"/></svg>`;

    const memberRows = report.memberSummaries
      .map(
        (m) => `
        <tr>
          <td>${this.escapeHtml(m.userName)}</td>
          <td class="number">${m.sessions}</td>
          <td class="number">${formatCurrency(m.totalCost)}</td>
          <td class="number">${formatNumber(m.totalTokens)}</td>
          <td class="number">${formatCurrency(m.avgCostPerSession)}</td>
        </tr>`,
      )
      .join("");

    const modelRows = report.modelSummaries
      .map(
        (m) => `
        <tr>
          <td>${this.escapeHtml(this.getModelName(m.modelName))}</td>
          <td class="number">${formatCurrency(m.totalCost)}</td>
          <td class="number">${formatNumber(m.totalTokens)}</td>
          <td class="number">${m.sessionsUsed}</td>
        </tr>`,
      )
      .join("");

    const maxDailyCost = Math.max(...report.dailyCosts.map((d) => d.cost), 1);
    const dailyRows = report.dailyCosts
      .slice(-30)
      .map(
        (d) => `
        <tr>
          <td>${d.date}</td>
          <td class="number">${formatCurrency(d.cost)}</td>
          <td class="number">${d.sessions}</td>
          <td>
            <div class="bar" style="width: ${(d.cost / maxDailyCost) * 100}%"></div>
          </td>
        </tr>`,
      )
      .join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(report.company)} - Claude Usage Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f7fa;
      color: #1a2028;
      padding: 40px;
    }
    .container { max-width: 900px; margin: 0 auto; }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 30px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      margin-bottom: 24px;
    }
    .header-left { display: flex; align-items: center; gap: 20px; }
    .header-left svg { width: 140px; height: auto; }
    .header-title {
      font-size: 20px;
      font-weight: 600;
      color: #273943;
    }
    .header-subtitle { color: #666; font-size: 14px; margin-top: 4px; }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    .kpi {
      background: white;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    .kpi-label { font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    .kpi-value { font-size: 28px; font-weight: 700; color: #009DF0; margin-top: 8px; }
    .section {
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      margin-bottom: 24px;
      overflow: hidden;
    }
    .section-header {
      padding: 20px 24px;
      border-bottom: 2px solid #009DF0;
      font-weight: 600;
      font-size: 16px;
    }
    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: left;
      padding: 12px 24px;
      background: #f8f9fb;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #666;
      border-bottom: 1px solid #eee;
    }
    td { padding: 12px 24px; border-bottom: 1px solid #f0f0f0; }
    tr:last-child td { border-bottom: none; }
    .number { text-align: right; font-variant-numeric: tabular-nums; }
    th.number { text-align: right; }
    .bar {
      height: 18px;
      background: linear-gradient(90deg, #009DF0, #00c4ff);
      border-radius: 3px;
      min-width: 4px;
    }
    .footer {
      text-align: center;
      padding: 20px;
      color: #999;
      font-size: 13px;
    }
    @media print {
      body { background: white; padding: 20px; }
      .section { box-shadow: none; border: 1px solid #ddd; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-left">
        ${rambollLogo}
        <div>
          <div class="header-title">${this.escapeHtml(report.company)}</div>
          <div class="header-subtitle">Claude Usage Report &mdash; ${report.period.from.split("T")[0]} to ${report.period.to.split("T")[0]}</div>
        </div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi">
        <div class="kpi-label">Total Cost</div>
        <div class="kpi-value">${formatCurrency(report.totalCost)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Total Sessions</div>
        <div class="kpi-value">${report.totalSessions}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Total Tokens</div>
        <div class="kpi-value">${formatNumber(report.totalTokens)}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">Team Members</div>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th class="number">Sessions</th>
            <th class="number">Total Cost</th>
            <th class="number">Total Tokens</th>
            <th class="number">Avg/Session</th>
          </tr>
        </thead>
        <tbody>${memberRows}</tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-header">Model Usage</div>
      <table>
        <thead>
          <tr>
            <th>Model</th>
            <th class="number">Cost</th>
            <th class="number">Tokens</th>
            <th class="number">Sessions</th>
          </tr>
        </thead>
        <tbody>${modelRows}</tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-header">Daily Breakdown (Last 30 Days)</div>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th class="number">Cost</th>
            <th class="number">Sessions</th>
            <th>Usage</th>
          </tr>
        </thead>
        <tbody>${dailyRows}</tbody>
      </table>
    </div>

    <div class="footer">
      Generated ${new Date(report.generatedAt).toLocaleString()} &bull; Powered by claude-receipts
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Get clean model name
   */
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

  /**
   * Escape HTML
   */
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
   * Show help for team command
   */
  private showHelp(): void {
    console.log(chalk.cyan.bold("\nClaude Receipts - Team Management\n"));
    console.log("Commands:");
    console.log(chalk.bold("  --export             ") + "Export your receipts to the shared team directory");
    console.log(chalk.bold("  --export --user-name ") + "Export with a specific username");
    console.log(chalk.bold("  --report             ") + "Generate team usage report (console)");
    console.log(chalk.bold("  --html               ") + "Generate team usage report (HTML)");
    console.log(chalk.bold("  --from <date>        ") + "Filter from date (YYYY-MM-DD)");
    console.log(chalk.bold("  --to <date>          ") + "Filter to date (YYYY-MM-DD)");
    console.log("");
    console.log("Setup for each team member:");
    console.log(chalk.gray("  1. Install: npx claude-receipts setup"));
    console.log(chalk.gray('  2. Set shared dir: claude-receipts config --set teamDataDir="\\\\server\\share\\team-data"'));
    console.log(chalk.gray("  3. After sessions: claude-receipts team --export"));
    console.log(chalk.gray("  4. Admin generates: claude-receipts team --html"));
    console.log("");
  }
}
