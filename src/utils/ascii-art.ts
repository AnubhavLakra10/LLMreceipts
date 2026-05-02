/**
 * ASCII art headers for receipts
 */

export const CLAUDE_LOGO = `     ▐▛███▜▌
    ▝▜█████▛▘
      ▘▘ ▝▝   `;

/**
 * Get the Claude logo header (default)
 */
export function getHeader(company?: string): string {
  if (company) {
    return `${CLAUDE_LOGO}\n     ${company}`;
  }
  return CLAUDE_LOGO;
}

/**
 * Receipt section separators
 */
export const SEPARATOR = "━".repeat(35);
export const LIGHT_SEPARATOR = "─".repeat(35);
