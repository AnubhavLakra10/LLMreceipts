// Configuration file types

export interface ReceiptConfig {
  version: string;
  location?: string;
  timezone?: string;
  printer?: string;
  company?: string;
  companyLogoUrl?: string;
  teamDataDir?: string;
  autoDaily?: boolean;
  autoWeekly?: boolean;
  autoMonthly?: boolean;
  hookRetryAttempts?: number;
  hookRetryDelayMs?: number;
}

export const DEFAULT_CONFIG: ReceiptConfig = {
  version: "1.0.0",
  autoDaily: true,
  autoWeekly: true,
  autoMonthly: true,
  hookRetryAttempts: 3,
  hookRetryDelayMs: 2000,
};
