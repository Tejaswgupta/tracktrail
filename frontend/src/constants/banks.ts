import { regexPatternsService } from "@/services/database";

// Bank presets and their display names
export const BANK_PRESETS = {
  generic: "Generic",
  axis: "Axis Bank",
  bank_of_baroda: "Bank of Baroda",
  canara: "Canara Bank",
  cbi: "Central Bank of India",
  csb: "CSB Bank",
  federal: "Federal Bank",
  hdfc: "HDFC Bank",
  icici: "ICICI Bank",
  idbi: "IDBI Bank",
  idfc: "IDFC First Bank",
  indusind: "IndusInd Bank",
  indian: "Indian Bank",
  jammu_and_kashmir_bank: "Jammu & Kashmir Bank",
  kalupur: "Kalupur Commercial Bank",
  kotak: "Kotak Mahindra Bank",
  pnb: "Punjab National Bank",
  rbl: "RBL Bank",
  sbi: "State Bank of India",
  south_indian: "South Indian Bank",
  ujjvain: "Ujjivan Small Finance Bank",
  yes: "YES Bank",
} as const;

// Bank name to preset mapping
export const BANK_NAME_TO_PRESET: Record<string, string> = {
  "Axis Bank": "axis",
  "Bank of Baroda": "bank_of_baroda",
  "Canara Bank": "canara",
  "Central Bank of India": "cbi",
  "CSB Bank": "csb",
  "Federal Bank": "federal",
  "HDFC Bank": "hdfc",
  "ICICI Bank": "icici",
  "IDBI Bank": "idbi",
  "IDFC First Bank": "idfc",
  "IndusInd Bank": "indusind",
  "Indian Bank": "indian",
  "Jammu & Kashmir Bank": "jammu_and_kashmir_bank",
  "Kalupur Commercial Bank": "kalupur",
  "Kotak Mahindra Bank": "kotak",
  "Punjab National Bank": "pnb",
  "RBL Bank": "rbl",
  "State Bank of India": "sbi",
  "South Indian Bank": "south_indian",
  "Ujjivan Small Finance Bank": "ujjvain",
  "YES Bank": "yes",
};

// Helper function to get regex patterns for a bank preset from database
export async function getBankRegexPatterns(
  bankPreset: string
): Promise<string[]> {
  try {
    const patterns = await regexPatternsService.getPatternsByBank(bankPreset);
    return patterns.map((p) => p.pattern);
  } catch (error) {
    console.error(`Error fetching patterns for bank ${bankPreset}:`, error);
    return [];
  }
}

// Helper function to get available bank presets
export function getAvailableBankPresets(): Record<string, string> {
  return BANK_PRESETS;
}

// Helper function to map bank name to bank preset
export function getBankPresetFromBankName(bankName: string): string {
  // Find matching preset by exact match first, then partial match
  const exactMatch = Object.keys(BANK_NAME_TO_PRESET).find(
    (bank) => bank.toLowerCase() === bankName.toLowerCase()
  );
  if (exactMatch) return BANK_NAME_TO_PRESET[exactMatch];

  const partialMatch = Object.keys(BANK_NAME_TO_PRESET).find(
    (bank) =>
      bankName.toLowerCase().includes(bank.toLowerCase()) ||
      bank.toLowerCase().includes(bankName.toLowerCase())
  );

  return partialMatch ? BANK_NAME_TO_PRESET[partialMatch] : "generic";
}

// Helper function to automatically infer bank preset from bank name
export function inferBankPresetFromBankName(bankName: string): BankPreset {
  if (!bankName || bankName.trim() === "") {
    return "generic";
  }

  const cleanBankName = bankName.toLowerCase().trim();

  // Try exact match first
  for (const [preset, displayName] of Object.entries(BANK_NAME_TO_PRESET)) {
    if (
      preset.toLowerCase() === cleanBankName ||
      displayName.toLowerCase() === cleanBankName
    ) {
      return BANK_NAME_TO_PRESET[preset] as BankPreset;
    }
  }

  // Try partial match - check if bank name contains the preset name or vice versa
  for (const [preset, presetKey] of Object.entries(BANK_NAME_TO_PRESET)) {
    if (
      cleanBankName.includes(preset.toLowerCase()) ||
      preset.toLowerCase().includes(cleanBankName) ||
      cleanBankName.includes(presetKey.toLowerCase()) ||
      presetKey.toLowerCase().includes(cleanBankName)
    ) {
      return presetKey as BankPreset;
    }
  }

  // Try to match against display names with partial matching
  for (const [preset, displayName] of Object.entries(BANK_PRESETS)) {
    if (
      cleanBankName.includes(displayName.toLowerCase()) ||
      displayName.toLowerCase().includes(cleanBankName)
    ) {
      return preset as BankPreset;
    }
  }

  // Return generic if no match found
  return "generic";
}

// Type definitions for bank presets
export type BankPreset = keyof typeof BANK_PRESETS;
