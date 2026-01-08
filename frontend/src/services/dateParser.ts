import { isValid, parse } from "date-fns";

// Check if a date string is already in valid ISO format (YYYY-MM-DD)
function isISODate(dateString: string): boolean {
  const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoRegex.test(dateString)) {
    return false;
  }

  const date = new Date(dateString);
  return (
    !isNaN(date.getTime()) && dateString === date.toISOString().split("T")[0]
  );
}

function tryParseDate(dateString: string) {
  // First try to parse as a standard ISO date
  if (isISODate(dateString)) {
    return {
      parsedDate: new Date(dateString),
      usedFormat: "ISO",
    };
  }

  // For 2-digit year formats, we need to use a reference date in the 2000s
  // to ensure proper interpretation of 2-digit years (e.g., "23" as 2023)
  const referenceDate = new Date(2000, 0, 1); // January 1, 2000

  // Reorder formats to prioritize 2-digit year formats for ambiguous cases
  // Place 2-digit year formats before 4-digit ones to handle "dd/mm/yy" correctly
  const formats = [
    // ISO formats
    "yyyy-MM-dd",
    "yyyy-MM-dd'T'HH:mm:ss",
    "yyyy-MM-dd'T'HH:mm:ss.SSS",
    "yyyy-MM-dd'T'HH:mm:ss'Z'",
    "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
    "yyyy-MM-dd HH:mm:ss",
    "yyyy-MM-dd HH:mm",

    // US formats (MM/dd/yyyy) - 2-digit years first
    // "MM/dd/yy",
    // "MM/dd/yyyy",
    // "M/d/yy",
    // "M/d/yyyy",
    // "MM/dd/yy HH:mm:ss",
    // "MM/dd/yyyy HH:mm:ss",
    // "MM/dd/yy HH:mm",
    // "MM/dd/yyyy HH:mm",
    // "M/d/yy HH:mm:ss",
    // "M/d/yyyy HH:mm:ss",
    // "M/d/yy HH:mm",
    // "M/d/yyyy HH:mm",
    // "MM/dd/yy h:mm:ss a",
    // "MM/dd/yyyy h:mm:ss a",
    // "MM/dd/yy h:mm a",
    // "MM/dd/yyyy h:mm a",

    // European formats (dd/MM/yyyy) - 2-digit years first
    "dd/MM/yy",
    "dd/MM/yyyy",
    "d/M/yy",
    "d/M/yyyy",
    "dd/MM/yy HH:mm:ss",
    "dd/MM/yyyy HH:mm:ss",
    "dd/MM/yy HH:mm",
    "dd/MM/yyyy HH:mm",
    "d/M/yy HH:mm:ss",
    "d/M/yyyy HH:mm:ss",
    "d/M/yy HH:mm",
    "d/M/yyyy HH:mm",
    "dd/MM/yy h:mm:ss a",
    "dd/MM/yyyy h:mm:ss a",
    "dd/MM/yy h:mm a",
    "dd/MM/yyyy h:mm a",

    // Alternative separators with dashes - 2-digit years first
    "MM-dd-yy",
    "MM-dd-yyyy",
    "dd-MM-yy",
    "dd-MMM-yy",
    "dd-MM-yyyy",
    "yy-MM-dd",
    "yyyy-MM-dd",
    "M-d-yy",
    "M-d-yyyy",
    "d-M-yy",
    "d-M-yyyy",
    "dd-MM-yy HH:mm",
    "dd-MM-yyyy HH:mm:ss",
    "MM-dd-yy HH:mm",
    "MM-dd-yyyy HH:mm",
    "yy-MM-dd HH:mm",
    "yyyy-MM-dd HH:mm",

    // Alternative separators with dots - 2-digit years first
    "MM.dd.yy",
    "MM.dd.yyyy",
    "dd.MM.yy",
    "dd.MM.yyyy",
    "yy.MM.dd",
    "yyyy.MM.dd",
    "M.d.yy",
    "M.d.yyyy",
    "d.M.yy",
    "d.M.yyyy",

    // Month names (English)
    "MMMM d, yyyy",
    "MMM d, yyyy",
    "MMMM dd, yyyy",
    "MMM dd, yyyy",
    "d MMMM yyyy",
    "dd MMMM yyyy",
    "d MMM yyyy",
    "dd MMM yyyy",
    "yyyy MMMM d",
    "yyyy MMM d",
    "yyyy MMMM dd",
    "yyyy MMM dd",

    // Compact formats - 2-digit years first
    "yyMMdd",
    "yyyyMMdd",
    "MMddyy",
    "MMddyyyy",
    "ddMMyy",
    "ddMMyyyy",

    // Excel serial date formats
    "M/d/yy",
    "M/d/yyyy",
    "M/dd/yy",
    "M/dd/yyyy",
    "MM/d/yy",
    "MM/d/yyyy",
    "d/M/yy",
    "d/M/yyyy",
    "dd/M/yy",
    "dd/M/yyyy",
    "d/MM/yy",
    "d/MM/yyyy",

    // Time-first formats
    "HH:mm:ss yyyy-MM-dd",
    "HH:mm yyyy-MM-dd",
    "h:mm:ss a MM/dd/yy",
    "h:mm:ss a MM/dd/yyyy",
    "h:mm a MM/dd/yy",
    "h:mm a MM/dd/yyyy",

    // Week-based formats
    "yyyy-'W'ww-e",
    "yyyy'W'ww",

    // Ordinal formats
    "yyyy-DDD",
    "DDD-yyyy",

    // RFC formats
    "EEE, dd MMM yyyy HH:mm:ss 'GMT'",
    "EEE MMM dd yyyy HH:mm:ss 'GMT'Z",

    // Additional common variations - 2-digit years first
    "yy/MM/dd",
    "yyyy/MM/dd",
    "yy/M/d",
    "yyyy/M/d",
    "MM/yyyy",
    "MMM yyyy",
    "MMMM yyyy",
    "yy",
    "yyyy",
  ];

  for (const formatString of formats) {
    try {
      // Use the reference date for parsing to handle 2-digit years correctly
      const testDate = parse(dateString, formatString, referenceDate);
      if (isValid(testDate)) {
        return {
          parsedDate: testDate,
          usedFormat: formatString,
        };
      }
    } catch (e) {
      // Continue to next format
    }
  }

  return {
    parsedDate: null,
    usedFormat: null,
  };
}

export function parseAndConvertToISO(dateString: string) {
  // Handle empty or invalid strings
  if (!dateString || typeof dateString !== "string") {
    return null;
  }

  // Trim whitespace
  const trimmedString = dateString.trim();
  if (!trimmedString) {
    return null;
  }

  // If it's already a valid ISO date, return as is
  if (isISODate(trimmedString)) {
    return trimmedString;
  }

  const { parsedDate, usedFormat } = tryParseDate(trimmedString);
  if (parsedDate) {
    return parsedDate.toISOString().split("T")[0];
  } else {
    return null;
  }
}
