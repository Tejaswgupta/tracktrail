// Simple test for regex functionality
import {readFileSync} from 'fs';

// read csv file and column name from command line arguments
const filePath = process.argv[2];
const columnName = process.argv[3];

if (!filePath) {
  console.error("Please provide a CSV file path as a command line argument.");
  process.exit(1);
}

if (!columnName) {
  console.error("Please provide a column name as the second command line argument.");
  process.exit(1);
}

const fileContent = readFileSync(filePath, 'utf-8');
const lines = fileContent.split('\n').filter(line => line.trim() !== '');

if (lines.length === 0) {
  console.error("The CSV file appears to be empty.");
  process.exit(1);
}

// -- CSV parsing helper -------------------------------------------------
// Parses a single CSV line into fields, handling quoted fields and escaped quotes
function parseCSVLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // Handle escaped double-quote inside quoted field: "" -> "
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        cur += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}
// ------------------------------------------------------------------------

// Parse header to find the column index
const headers = parseCSVLine(lines[0]).map(h => h.trim().replace(/^"|"$/g, ''));
const columnIndex = headers.findIndex(header => header === columnName);

console.log(`Headers found: ${headers.join(', ')}`);
console.log(`Searching for column "${columnName}"...`);
console.log(`Column index: ${columnIndex}`);

if (columnIndex === -1) {
  console.error(`Column "${columnName}" not found in CSV. Available columns: ${headers.join(', ')}`);
  process.exit(1);
}

console.log(`Using column "${columnName}" (index ${columnIndex}) for testing.`);

// Extract the specified column
const testDescriptions = lines.slice(1).map(line => {
  const columns = parseCSVLine(line);
  const raw = columns[columnIndex] ? columns[columnIndex].trim() : '';
  // remove surrounding quotes if any
  return raw.replace(/^"|"$/g, '');
}).filter(desc => desc !== '');

// Find unique transactions with targeted and random sampling, similar to Python version
function findUniqueTransactions(descriptions, maxSamplesPerType = 10, numRandomSamples = 10) {
  const paymentTypes = ['NEFT', 'RTGS', 'IMPS', 'UPI'];
  const samples = {};
  paymentTypes.forEach(pType => samples[pType] = []);

  // 1. Targeted Sampling
  descriptions.forEach(desc => {
    if (typeof desc !== 'string') return;
    for (const pType of paymentTypes) {
      if (desc.includes(pType) && samples[pType].length < maxSamplesPerType) {
        samples[pType].push(desc);
        break;
      }
    }
  });

  // Flatten the samples into a single list
  let targetedSamples = [];
  paymentTypes.forEach(pType => {
    targetedSamples = targetedSamples.concat(samples[pType]);
  });

  // 2. Random Sampling
  const remainingDescriptions = descriptions.filter(d => !targetedSamples.includes(d));
  let randomSamples = [];

  if (remainingDescriptions.length > 0) {
    // Ensure we don't try to sample more than what is available
    const numToSample = Math.min(numRandomSamples, remainingDescriptions.length);
    randomSamples = getRandomElements(remainingDescriptions, numToSample);
  }

  // 3. Combine samples
  return targetedSamples.concat(randomSamples);
}

// Helper function to get random elements from an array
function getRandomElements(arr, count) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, arr.length));
}

// Test the existing bank patterns
const bankPatterns = {
  generic: [
  "^(?:NEFT|RTGS)/[^/]+/([^/]+)/[^/]+",
  "^IMPS-[^/]+/Fund Trf/[^/]+/([^/]+)/",
  "^TRANSFER (?:TO|FROM) DEPOSIT: CHEQUE NO\\. \\d+/FT TO (.+)",
  "^IFT/[^/]+/([^/\\r\\n]*)",
  "^CHQ Paid/[^/]+/([^/]+)/",
  "^CASH DEPOSIT AT [^/]+ BY (.+)"
  ]
};

console.log("Testing existing patterns:");
const allSamples = findUniqueTransactions(testDescriptions);

console.log("Found the following transaction samples:");
allSamples.forEach((sample, index) => {
  console.log(`- ${sample}`);
});

// Test each sample against the patterns
allSamples.forEach((desc, sampleIdx) => {
  console.log(`
${sampleIdx + 1}. Original: "${desc}"`);

  let foundMatch = false;
  bankPatterns.generic.forEach((pattern, i) => {
    const match = desc.match(pattern);
    if (match && match[1]) {
      const extracted = match[1].trim();
      console.log(`   Pattern ${i + 1} ✓: Extracted: "${extracted}"`);
      foundMatch = true;
    }
  });

  if (!foundMatch) {
    console.log(`   No patterns matched: "${desc}"`);
  }
});