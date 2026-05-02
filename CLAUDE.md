# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**LLM Receipts** generates thermal printer-style receipts for LLM coding sessions with enterprise team tracking. It hooks into Claude Code's `SessionEnd` event to auto-generate branded HTML receipts showing token/cost breakdowns.

## Development Commands

```bash
npm run build          # Build TypeScript
npm run dev            # Watch mode
node bin/claude-receipts.js generate          # Test CLI
node bin/claude-receipts.js generate --output html
node bin/claude-receipts.js config --show
node bin/claude-receipts.js team --html
npm link               # Install globally for testing
```

## Architecture

### Data Flow

1. **Hook Mode**: SessionEnd hook → stdin JSON → generate HTML → open browser
2. **Manual Mode**: CLI command → fetch recent session → output to console/HTML
3. **Team Mode**: Export individual receipts → aggregate → HTML dashboard

### Key Components

**Commands** (`src/commands/`)
- `generate.ts` — Main receipt generation; auto-detects hook mode via stdin
- `setup.ts` — Installs/removes SessionEnd hook in `~/.claude/settings.json`
- `config.ts` — Manages `~/.claude-receipts.config.json`
- `team.ts` — Enterprise team export, aggregation, and HTML dashboard

**Core** (`src/core/`)
- `data-fetcher.ts` — Fetches session data via `ccusage` CLI
- `transcript-parser.ts` — Parses session JSONL for metadata
- `receipt-generator.ts` — ASCII text receipt with company branding
- `html-renderer.ts` — Styled HTML with company logo and branding
- `thermal-printer.ts` — ESC/POS thermal printer output
- `config-manager.ts` — Config file I/O

**Types** (`src/types/`)
- `config.ts` — ReceiptConfig with company, teamDataDir, etc.
- `ccusage.ts` — ccusage CLI JSON output types
- `transcript.ts` — JSONL message structure
- `session-hook.ts` — SessionEnd stdin JSON format

## Config Fields

- `version`, `company`, `location`, `timezone`, `printer`, `companyLogoUrl`, `teamDataDir`

## Package Info

- ESM only (`"type": "module"`) — Node 22+ required
- bin: `llm-receipts` → `bin/claude-receipts.js` → `dist/cli.js`
