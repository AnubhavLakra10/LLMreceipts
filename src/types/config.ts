// Configuration file types

export interface ReceiptConfig {
  version: string;
  location?: string;
  timezone?: string;
  printer?: string;
  company?: string;
  companyLogoUrl?: string;
  teamDataDir?: string;
}

export const DEFAULT_CONFIG: ReceiptConfig = {
  version: "1.0.0",
};
