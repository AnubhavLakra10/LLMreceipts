# LLM Receipts

Generate thermal printer-style receipts for your LLM coding sessions — with enterprise team tracking, period summaries, and custom branding.

Every time you end a Claude Code session, a styled receipt pops up in your browser showing exactly what you spent: token breakdown per model, cache usage, project folder, and total cost. Period receipts (daily/weekly/monthly) are generated automatically. For teams, aggregate usage across members into a single dashboard via a shared OneDrive/SharePoint folder.

## Features

- **Auto-generated receipts** via Claude Code `SessionEnd` hook with retry logic
- **Period receipts** — daily, weekly, and monthly summaries in thermal receipt style
- **Project breakdown** — shows which project folders were used and their cost
- **HTML receipts** with thermal printer aesthetic — opens in browser automatically
- **Console output** with ASCII art
- **Thermal printer** support (Epson TM-T88V / ESC/POS compatible)
- **Company branding** — custom logo, company name, location
- **Enterprise team tracking** — auto-export to shared folder, aggregate reports
- **Automatic period generation** — hook creates due daily/weekly/monthly receipts
- **Configurable** location, timezone, retry behavior, and output preferences
- **Latest model support** — Opus 4.6, Sonnet 4.6, Haiku 4.5

## Quick Start

```bash
# Install globally from GitHub
npm install -g github:AnubhavLakra10/LLMreceipts

# Install the SessionEnd hook
llm-receipts setup

# Configure
llm-receipts config --set company="Your Company"
llm-receipts config --set location="City, Country"
llm-receipts config --set timezone="Europe/Copenhagen"
```

That's it. Every Claude Code session now auto-generates a receipt.

## Commands

### `generate`

Generate a receipt for a Claude Code session.

```bash
# Most recent session
llm-receipts generate

# HTML output
llm-receipts generate --output html

# Console ASCII art
llm-receipts generate --output console

# Thermal printer
llm-receipts generate --output printer --printer usb
```

| Option | Description |
|--------|-------------|
| `-s, --session <id>` | Specific session ID or UUID prefix |
| `-o, --output <format>` | `html`, `console`, or `printer` (comma-separated) |
| `-l, --location <text>` | Override location detection |
| `-p, --printer <name>` | Printer interface (`usb`, `tcp://host:port`) |

### `report`

Generate period summary receipts (daily, weekly, monthly) with project folder breakdown.

```bash
# Daily — yesterday by default
llm-receipts report --daily

# Daily — specific date
llm-receipts report --daily --date 2026-05-01

# Weekly — last complete week
llm-receipts report --weekly

# Monthly — last complete month
llm-receipts report --monthly

# Monthly — specific month
llm-receipts report --monthly --date 2026-04-15

# All three at once
llm-receipts report --daily --weekly --monthly
```

| Option | Description |
|--------|-------------|
| `--daily` | Generate daily receipt |
| `--weekly` | Generate weekly receipt |
| `--monthly` | Generate monthly receipt |
| `--date <YYYY-MM-DD>` | Reference date (default: yesterday/last complete period) |

Receipts are saved to `~/.claude-receipts/daily/`, `weekly/`, and `monthly/`.

Each period receipt includes:
- Model-by-model cost and token breakdown
- Project folder breakdown (which repos you worked in)
- Daily cost chart (for weekly/monthly)
- Thermal printer receipt styling

### `setup`

```bash
llm-receipts setup              # Install SessionEnd hook
llm-receipts setup --uninstall  # Remove hook
```

### `config`

```bash
llm-receipts config --show
llm-receipts config --set company="Your Company"
llm-receipts config --set location="City, Country"
llm-receipts config --set timezone="Europe/Copenhagen"
llm-receipts config --set "teamDataDir=C:/Users/YOU/OneDrive - Company/llm-team-receipts"
llm-receipts config --reset
```

| Setting | Default | Description |
|---------|---------|-------------|
| `company` | — | Company name on receipts |
| `location` | — | Default location string |
| `timezone` | — | Timezone for dates (e.g., `Europe/Copenhagen`) |
| `printer` | — | Default printer interface |
| `teamDataDir` | — | Shared directory for team data aggregation |
| `autoDaily` | `true` | Auto-generate daily receipts from hook |
| `autoWeekly` | `true` | Auto-generate weekly receipts from hook |
| `autoMonthly` | `true` | Auto-generate monthly receipts from hook |
| `hookRetryAttempts` | `3` | Retry attempts when session not yet indexed |
| `hookRetryDelayMs` | `2000` | Base retry delay in ms (1.5x backoff) |

### `team`

Enterprise team usage tracking and reporting.

```bash
# Export your receipts to shared team directory
llm-receipts team --export

# Generate team report (console)
llm-receipts team --report

# Generate team report (HTML dashboard)
llm-receipts team --html

# Filter by date range
llm-receipts team --html --from 2026-04-01 --to 2026-04-30
```

## Enterprise Team Setup

### For the admin (you)

1. Create a shared OneDrive/SharePoint folder (e.g., `llm-team-receipts`)
2. Share it with all team members
3. Configure your own install:

```bash
npm install -g github:AnubhavLakra10/LLMreceipts
llm-receipts setup
llm-receipts config --set company="Your Company"
llm-receipts config --set location="Your City"
llm-receipts config --set "teamDataDir=C:/Users/YOU/OneDrive - Company/llm-team-receipts"
```

### For each teammate (copy-paste, change 2 lines)

```powershell
# Install (one time, no clone needed)
npm install -g github:AnubhavLakra10/LLMreceipts

# Setup auto-hook
llm-receipts setup

# Configure — CHANGE location and YOUR_USERNAME below:
llm-receipts config --set company="Your Company"
llm-receipts config --set location="Copenhagen"
llm-receipts config --set "teamDataDir=C:/Users/YOUR_USERNAME/OneDrive - Company/llm-team-receipts"

# Backfill all past months and export
llm-receipts report --monthly --date 2026-03-15
llm-receipts report --monthly --date 2026-04-15
llm-receipts team --export
```

Change only:
- `location` — their city
- `YOUR_USERNAME` — their Windows username

### What happens automatically after setup

Every time a teammate ends a Claude Code session:
1. Session receipt is created (with retry if ccusage hasn't indexed yet)
2. Due daily/weekly/monthly receipts are generated
3. Their receipt data is exported to the shared OneDrive folder

### Viewing team data

```bash
# Generate the team dashboard anytime
llm-receipts team --html
```

The shared folder structure:

```
OneDrive - Company/llm-team-receipts/
├── alice/
│   ├── auth-refactor.json
│   └── api-migration.json
├── bob/
│   ├── data-pipeline.json
│   └── dashboard-v2.json
├── charlie/
│   └── infra-setup.json
└── team-report.html
```

Each JSON contains: username, project folder, location, session date, cost, tokens, and model breakdowns.

## Receipt Storage

```
~/.claude-receipts/
├── projects/           # Per-session receipts
│   ├── fix-auth-bug.html
│   └── api-refactor.html
├── daily/              # Auto-generated daily summaries
│   ├── 2026-05-01.html
│   └── 2026-05-02.html
├── weekly/             # Auto-generated weekly summaries
│   └── 2026-W18.html
└── monthly/            # Auto-generated monthly summaries
    └── 2026-04.html
```

## How It Works

1. **SessionEnd Hook** — When you exit Claude Code, the hook fires automatically
2. **Retry with Backoff** — 3 attempts (2s, 3s, 4.5s) if ccusage hasn't indexed the session yet
3. **Data Collection** — Calls `ccusage session --id` for accurate token/cost data
4. **Transcript Parsing** — Reads session JSONL for metadata (name, timestamps, messages)
5. **Receipt Generation** — Creates a styled HTML receipt with token and project breakdowns
6. **Period Check** — Generates any due daily/weekly/monthly receipts
7. **Team Export** — Auto-exports to shared folder if `teamDataDir` is configured
8. **Auto-open** — Opens the receipt in your default browser

## Requirements

- Node.js >= 22.0.0
- Claude Code (for automatic generation)
- `ccusage` (installed automatically as a dependency)

## Thermal Printing

Supports Epson TM-T88V and compatible ESC/POS printers:

- **USB**: `--printer usb` (auto-detect) or `--printer usb:VID:PID`
- **Network**: `--printer tcp://192.168.1.100:9100`

## Troubleshooting

### "No session data found"

Make sure you've used Claude Code recently:

```bash
npx ccusage session --json
```

### Hook not triggering

Verify the hook is installed:

```bash
cat ~/.claude/settings.json
```

Look for a `SessionEnd` hook pointing to `llm-receipts`.

### Session shows wrong cost

The hook retries 3 times with backoff. Very short sessions (< 100 tokens) may still not appear in ccusage.

### Period receipts not generating

Check your config:

```bash
llm-receipts config --show
```

Ensure `autoDaily`, `autoWeekly`, `autoMonthly` are not set to `false`.

## License

MIT
