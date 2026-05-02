import chalk from "chalk";
import ora from "ora";
import { ConfigManager } from "../core/config-manager.js";
import { PeriodAggregator } from "../core/period-aggregator.js";

export interface ReportOptions {
  daily?: boolean;
  weekly?: boolean;
  monthly?: boolean;
  date?: string;
}

export class ReportCommand {
  private configManager = new ConfigManager();
  private aggregator = new PeriodAggregator();

  async execute(options: ReportOptions): Promise<void> {
    const { daily, weekly, monthly, date } = options;

    if (!daily && !weekly && !monthly) {
      console.log(chalk.yellow("Specify at least one period: --daily, --weekly, or --monthly"));
      console.log(chalk.gray("\nExamples:"));
      console.log(chalk.gray("  llm-receipts report --daily"));
      console.log(chalk.gray("  llm-receipts report --daily --date 2026-04-15"));
      console.log(chalk.gray("  llm-receipts report --weekly"));
      console.log(chalk.gray("  llm-receipts report --monthly"));
      console.log(chalk.gray("  llm-receipts report --daily --weekly --monthly"));
      return;
    }

    const config = await this.configManager.loadConfig();
    const referenceDate = date ? new Date(date) : new Date();

    // Validate date if provided
    if (date && isNaN(referenceDate.getTime())) {
      console.error(chalk.red(`Invalid date: ${date}. Use YYYY-MM-DD format.`));
      process.exit(1);
    }

    if (daily) {
      await this.generateDaily(referenceDate, date, config);
    }

    if (weekly) {
      await this.generateWeekly(referenceDate, config);
    }

    if (monthly) {
      await this.generateMonthly(referenceDate, config);
    }
  }

  private async generateDaily(
    referenceDate: Date,
    dateStr: string | undefined,
    config: Parameters<PeriodAggregator["generateDaily"]>[1],
  ): Promise<void> {
    const targetDate = dateStr || this.formatDate(
      new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() - 1),
    );

    const spinner = ora(`Generating daily receipt for ${targetDate}...`).start();
    try {
      const outPath = await this.aggregator.generateDaily(targetDate, config);
      spinner.succeed(`Daily receipt saved to: ${outPath}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      spinner.fail(`Failed to generate daily receipt: ${msg}`);
    }
  }

  private async generateWeekly(
    referenceDate: Date,
    config: Parameters<PeriodAggregator["generateWeekly"]>[1],
  ): Promise<void> {
    const spinner = ora("Generating weekly receipt...").start();
    try {
      const outPath = await this.aggregator.generateWeekly(referenceDate, config);
      spinner.succeed(`Weekly receipt saved to: ${outPath}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      spinner.fail(`Failed to generate weekly receipt: ${msg}`);
    }
  }

  private async generateMonthly(
    referenceDate: Date,
    config: Parameters<PeriodAggregator["generateMonthly"]>[1],
  ): Promise<void> {
    const spinner = ora("Generating monthly receipt...").start();
    try {
      const outPath = await this.aggregator.generateMonthly(referenceDate, config);
      spinner.succeed(`Monthly receipt saved to: ${outPath}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      spinner.fail(`Failed to generate monthly receipt: ${msg}`);
    }
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}
