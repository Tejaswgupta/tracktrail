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

// Bank-specific regex patterns for counterparty extraction
export const BANK_REGEX_PATTERNS: Record<string, string[]> = {
  generic: [
    "UPI\\/([^\\/]+)\\/[^\\/]+\\/?", // UPI/COUNTERPARTY/number/optional
    "(?:NEFT|RTGS)\\/[^\\/]+\\/([^\\\\n]+)\\/?",
    "POS\\/([^\\\\n]+)\\/?",
    "IMPS(?:-[A-Z]+)?\\/[^\\/]+\\/[^\\/]+\\/([^\\\\n]+)\\/?",
    "(?:.*\\/)?([^\\\\n]+)$", // General fallback: last segment after slash
  ],
  axis: [
    "^NEFT/[A-Z0-9/]+/([^/]+)",
    "^INB/NEFT/[A-Z0-9/]+/([^/]+)",
    "^INB/RTGS/[A-Z0-9/]+/([^/]+)",
    "^RTGS/[A-Z0-9/]+/([^/]+)",
    "^IMPS/P2A/[0-9]+(?:/[^/]*)*/([^/]+)$",
    "^TRF/[^/]+/([^/]+)",
  ],
  bank_of_baroda: [],
  canara: [],
  cbi: [],
  csb: [],
  hdfc: [],
  icici: [],
  idbi: [],
  indusind: [],
  kalupur: [],
  kotak: [],
  pnb: [],
  rbl: [],
  sbi: [],
  south_indian: [],
  ujjvain: [],
  yes: [],
  idfc: [
    "^(?:NEFT|RTGS)/[^/]+/([^/]+)/[^/]+",
    "^IMPS-[^/]+/Fund Trf/[^/]+/([^/]+)/",
    "^TRANSFER (?:TO|FROM) DEPOSIT: CHEQUE NO\\. \\d+/FT TO (.+)",
    "^IFT/[^/]+/([^/\\r\\n]*)",
    "^CHQ Paid/[^/]+/([^/]+)/",
    "^CASH DEPOSIT AT [^/]+ BY (.+)",
  ],
  federal: [
    "^(?:RTG|NFT|FTIMPS|IFN\\/CHRG|CHRG|dd\\sissue|DD:|BBYT:|TFR:?)\\/??:\\s*(?:IFI\\/\\d+\\/)?([^\\/:,\\n]+)",
    "^(ALLOYS?|LLP|BANK|ICICI|SBI|HDFC|PAYMENT?|Pymt|SELF)$",
    '^(?:TFR:|ID\\s*:\\s*\\[[^\\]]*\\]\\s*:|BillId\\s*:\\s*\\[[^\\]]*\\]\\s*:)\\s*"?([^",:\\n\\/]+?)\"?$',
    "^FT?\\s*IMPS\\/IFI\\/\\d+\\/([^\\/]+)\\/SUPP",
  ],
  indian: [
    "\\/[A-Z]{3,}\\/([^\\/-]+)(?:\\/-)?$",
    "RTGS\\s+\\S+\\s+(.+)$",
    '^TRANSFER (?:TO|FROM) \\d+ [^\\/]*?\\/P[Aa]y\\/([^\\/\\r\\n\"]+?)(?:\\/|$)',
    "^TRANSFER (?:TO|FROM) \\d+ [^\\/]*?\\/IMPS\\/P2A\\/\\d+\\/ \\/P[Aa]y\\/([^\\/]+?)\\s*\\/BRANCH",
    "\\s([A-Z][A-Z0-9 &]+)$",
    "FROM (\\d{8,15})$",
    "^TRANSFER TO (\\d{8,15})",
    "Paid to SELF \\/BRANCH\\s*:\\s*([^\\/]+)",
  ],
  jammu_and_kashmir_bank: [
    "^UPI\\/[A-Z]+\\/\\d+\\/[CD]R\\/([^\\/]+)\\/P2M", // UPI
    "^NEFT-[A-Z0-9]+-([A-Za-z][A-Za-z\\s]*[A-Za-z])", // NEFT
    "^RTGS-[A-Z0-9]+-([A-Za-z][A-Za-z\\s]*[A-Za-z])", // RTGS
    "^mTFR\\/\\d+\\/([A-Za-z][A-Za-z\\s]*[A-Za-z])", // IMPS/mTFR
  ],
};

// Helper function to get available bank presets
export function getAvailableBankPresets(): Record<string, string> {
  return BANK_PRESETS;
}

// Helper function to map bank name to bank preset
export function getBankPresetFromBankName(bankName: string): string {
  // Find matching preset by exact match first, then partial match
  const exactMatch = Object.keys(BANK_NAME_TO_PRESET).find(
    bank => bank.toLowerCase() === bankName.toLowerCase()
  );
  if (exactMatch) return BANK_NAME_TO_PRESET[exactMatch];

  const partialMatch = Object.keys(BANK_NAME_TO_PRESET).find(bank =>
    bankName.toLowerCase().includes(bank.toLowerCase()) ||
    bank.toLowerCase().includes(bankName.toLowerCase())
  );

  return partialMatch ? BANK_NAME_TO_PRESET[partialMatch] : "generic";
}

// Helper function to get regex patterns for a bank preset
export function getBankRegexPatterns(bankPreset: string): string[] {
  return BANK_REGEX_PATTERNS[bankPreset] || BANK_REGEX_PATTERNS.generic;
}

// Helper function to automatically infer bank preset from bank name
export function inferBankPresetFromBankName(bankName: string): BankPreset {
  if (!bankName || bankName.trim() === "") {
    return "generic";
  }

  const cleanBankName = bankName.toLowerCase().trim();

  // Try exact match first
  for (const [preset, displayName] of Object.entries(BANK_NAME_TO_PRESET)) {
    if (preset.toLowerCase() === cleanBankName || displayName.toLowerCase() === cleanBankName) {
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