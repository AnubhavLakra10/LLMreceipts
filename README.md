# LLM Receipts

Generate thermal printer-style receipts for your LLM coding sessions — with enterprise team tracking and custom branding.

Every time you end a Claude Code session, a styled receipt pops up in your browser showing exactly what you spent: token breakdown per model, cache usage, and total cost. For teams, aggregate usage across 20+ members into a single dashboard.

## Features

- **Auto-generated receipts** via Claude Code `SessionEnd` hook
- **HTML receipts** with thermal printer aesthetic — opens in browser automatically
- **Console output** with ASCII art
- **Thermal printer** support (Epson TM-T88V / ESC/POS compatible)
- **Company branding** — custom logo, company name, location
- **Enterprise team tracking** — export, aggregate, and report across team members
- **Configurable** location, timezone, and output preferences
- **Latest model support** — Opus 4.6, Sonnet 4.6, Haiku 4.5

## Quick Start

```bash
npx llm-receipts setup
```

This installs a `SessionEnd` hook in `~/.claude/settings.json` and creates `~/.claude-receipts.config.json`.

### Configure for your company

```bash
npx llm-receipts config --set company="Your Company"
npx llm-receipts config --set location="City, Country"
npx llm-receipts config --set timezone="Europe/Copenhagen"
```

### Manual generation

```bash
# Generate for most recent session
npx llm-receipts generate

# HTML output
npx llm-receipts generate --output html

# Console ASCII art
npx llm-receipts generate --output console

# Thermal printer
npx llm-receipts generate --output printer --printer usb
```

## Commands

### `generate`

Generate a receipt for a Claude Code session.

| Option | Description |
|--------|-------------|
| `-s, --session <id>` | Specific session ID or UUID prefix |
| `-o, --output <format>` | `html`, `console`, or `printer` (comma-separated) |
| `-l, --location <text>` | Override location detection |
| `-p, --printer <name>` | Printer interface (`usb`, `tcp://host:port`) |

### `setup`

```bash
npx llm-receipts setup          # Install SessionEnd hook
npx llm-receipts setup --uninstall  # Remove hook
```

### `config`

```bash
npx llm-receipts config --show
npx llm-receipts config --set company="DPE - Ramboll Tech"
npx llm-receipts config --set location="Esbjerg, Denmark"
npx llm-receipts config --set timezone="Europe/Copenhagen"
npx llm-receipts config --set teamDataDir="\\\\server\\share\\team-data"
npx llm-receipts config --reset
```

| Setting | Description |
|---------|-------------|
| `company` | Company name on receipts |
| `location` | Default location string |
| `timezone` | Timezone for dates (e.g., `Europe/Copenhagen`) |
| `printer` | Default printer interface |
| `teamDataDir` | Shared directory for team data aggregation |

### `team`

Enterprise team usage tracking and reporting.

```bash
# Export your receipts to shared team directory
npx llm-receipts team --export
npx llm-receipts team --export --user-name "firstname.lastname"

# Generate team report (console)
npx llm-receipts team --report

# Generate team report (HTML dashboard)
npx llm-receipts team --html

# Filter by date range
npx llm-receipts team --html --from 2026-04-01 --to 2026-04-30
```

The HTML dashboard includes:
- Total cost, sessions, and tokens KPIs
- Per-member breakdown with average cost per session
- Per-model usage (Opus vs Sonnet vs Haiku)
- Daily cost chart (last 30 days)

## Enterprise Team Setup

For teams of any size:

1. **Each member** installs the hook and configures the shared directory:
   ```bash
   npx llm-receipts setup
   npx llm-receipts config --set company="Your Company"
   npx llm-receipts config --set teamDataDir="\\\\server\\share\\team-data"
   ```

2. **Each member** periodically exports their session data:
   ```bash
   npx llm-receipts team --export --user-name "firstname.lastname"
   ```

3. **Admin** generates the team report:
   ```bash
   npx llm-receipts team --html
   ```

The `teamDataDir` should be a shared network drive, OneDrive, SharePoint, or NAS accessible to all team members.

## How It Works

1. **SessionEnd Hook** — When you exit Claude Code, the hook fires automatically
2. **Data Collection** — Calls `ccusage session --id` for accurate token/cost data
3. **Transcript Parsing** — Reads session JSONL for metadata (name, timestamps, messages)
4. **Receipt Generation** — Creates a styled HTML receipt with token breakdowns
5. **Auto-open** — Opens the receipt in your default browser

### Location Detection

Priority order:
1. `--location` flag
2. Config file `location` setting
3. IP geolocation (offline, via geoip-lite)
4. Fallback: "The Cloud"

## Requirements

- Node.js >= 22.0.0
- Claude Code (for automatic generation)

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

Very short sessions may not appear in ccusage yet. The hook exits silently rather than showing incorrect data.

## License

MIT
