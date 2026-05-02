#!/usr/bin/env node

import { Command, Option } from "commander";
import { GenerateCommand } from "./commands/generate.js";
import { ConfigCommand } from "./commands/config.js";
import { SetupCommand } from "./commands/setup.js";
import { TeamCommand } from "./commands/team.js";
import { ReportCommand } from "./commands/report.js";

const program = new Command();

program
  .name("llm-receipts")
  .description("Generate thermal-style receipts for LLM coding sessions with enterprise team tracking")
  .version("1.0.0");

// Generate command
program
  .command("generate")
  .description("Generate a receipt for a Claude Code session")
  .option("-s, --session <id>", "Specific session ID to generate receipt for")
  .addOption(
    new Option("-o, --output <format...>", "Output format(s): html, console, printer (comma-separated or repeated)")
      .argParser((value: string, prev: string[] | undefined) => {
        const formats = value.split(",").map((s) => s.trim()).filter(Boolean);
        const valid = ["html", "console", "printer"];
        for (const f of formats) {
          if (!valid.includes(f)) {
            throw new Error(`Invalid output format "${f}". Valid formats: ${valid.join(", ")}`);
          }
        }
        return [...(prev || []), ...formats];
      }),
  )
  .option("-l, --location <text>", "Override location detection")
  .option(
    "-p, --printer <interface>",
    'Printer: "usb" (auto-detect), "usb:VID:PID", "tcp://host:port", or CUPS name',
  )
  .action(async (options) => {
    const command = new GenerateCommand();
    await command.execute(options);
  });

// Config command
program
  .command("config")
  .description("Manage configuration")
  .option("--show", "Display current configuration")
  .option("--set <key=value>", "Set a configuration value")
  .option("--reset", "Reset configuration to defaults")
  .action(async (options) => {
    const command = new ConfigCommand();
    await command.execute(options);
  });

// Setup command
program
  .command("setup")
  .description("Setup automatic receipt generation via SessionEnd hook")
  .option("--uninstall", "Remove the SessionEnd hook")
  .action(async (options) => {
    const command = new SetupCommand();
    await command.execute(options);
  });

// Team command
program
  .command("team")
  .description("Team usage aggregation and reporting for enterprise")
  .option("--export", "Export your receipts to the shared team data directory")
  .option("--report", "Generate team usage report (console)")
  .option("--html", "Generate team usage report (HTML with charts)")
  .option("--user-name <name>", "Override username for export")
  .option("--from <date>", "Filter from date (YYYY-MM-DD)")
  .option("--to <date>", "Filter to date (YYYY-MM-DD)")
  .action(async (options) => {
    const command = new TeamCommand();
    await command.execute(options);
  });

// Report command
program
  .command("report")
  .description("Generate period summary receipts (daily, weekly, monthly)")
  .option("--daily", "Generate daily receipt")
  .option("--weekly", "Generate weekly receipt")
  .option("--monthly", "Generate monthly receipt")
  .option("--date <YYYY-MM-DD>", "Reference date (default: yesterday for daily, last complete period for weekly/monthly)")
  .action(async (options) => {
    const command = new ReportCommand();
    await command.execute(options);
  });

// Make generate the default command if no command is specified
if (process.argv.length === 2) {
  process.argv.push("generate");
}

program.parse();
