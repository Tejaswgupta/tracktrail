// Simple test for regex functionality
const testDescriptions = [
  "UPI/AMAZON/1234567890/Payment for order",
  "NEFT/ICICI/1234567890/ABC CORP/",
  "IMPS-P2A/1234567890/XYZ LTD/TRANSFER",
  "POS/MCDONALDS/1234567890/Purchase",
  "RTGS/SBI/1234567890/XYZ CORP/Payment"
];

// Test the existing bank patterns
const bankPatterns = {
  generic: [
    /UPI\/([^\/]+)\/[^\/]+\/?/i, // UPI/COUNTERPARTY/number/optional
    /(?:NEFT|RTGS)\/[^\/]+\/([^\/\n]+)\/?/i,
    /POS\/([^\/\n]+)\/?/i,
    /IMPS(?:-[A-Z]+)?\/[^\/]+\/[^\/]+\/([^\/\n]+)\/?/i,
    /(?:.*\/)?([^\/\n]+)$/i, // General fallback: last segment after slash
  ]
};

console.log("Testing existing patterns:");
testDescriptions.forEach((desc, index) => {
  console.log(`\n${index + 1}. "${desc}"`);
  
  bankPatterns.generic.forEach((pattern, i) => {
    const match = desc.match(pattern);
    if (match && match[1]) {
      console.log(`   Pattern ${i + 1}: "${match[1].trim()}"`);
    } else {
      console.log(`   Pattern ${i + 1}: No match`);
    }
  });
});

// Test custom pattern
console.log("\n\nTesting custom pattern:");
const customPattern = /(?:UPI|NEFT|RTGS|IMPS|POS)\/([^\/]+)\/.*/i;

testDescriptions.forEach((desc, index) => {
  console.log(`\n${index + 1}. "${desc}"`);
  const match = desc.match(customPattern);
  if (match && match[1]) {
    console.log(`   Custom: "${match[1].trim()}"`);
  } else {
    console.log(`   Custom: No match`);
  }
});