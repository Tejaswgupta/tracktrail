const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const nodemailer = require('nodemailer');

// Configuration
const CONFIG = {
  // AWS SES SMTP Configuration
  smtp: {
    host: process.env.SMTP_HOST || 'email-smtp.us-east-1.amazonaws.com', // Change to your AWS SES region
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER || 'your-smtp-username', // Your SMTP username from AWS SES
      pass: process.env.SMTP_PASS || 'your-smtp-password'  // Your SMTP password from AWS SES
    }
  },
  // Email configuration
  email: {
    from: process.env.EMAIL_FROM || 'sender@example.com', // Must be a verified email in AWS SES
    subject: process.env.EMAIL_SUBJECT || 'Important Communication from TrackTrail',
    // Email template - you can customize this
    template: `
Dear {{name}},

{{greeting}}

We hope this message finds you well. This is an important communication regarding the TrackTrail financial investigation platform.

{{customMessage}}

If you have any questions or need assistance, please don't hesitate to contact us.

Best regards,
TrackTrail Team
`
  },
  // File paths
  files: {
    divisionalCommissioner: './divisional_commissioner.csv',
    districtMagistrate: './dm.csv'
  },
  // Rate limiting (emails per second) - AWS SES has limits
  rateLimit: {
    emailsPerSecond: 10, // Adjust based on your SES sending limits
    batchSize: 5         // Send in batches to avoid overwhelming
  }
};

// Create transporter
let transporter;

async function initializeTransporter() {
  try {
    transporter = nodemailer.createTransport(CONFIG.smtp);

    // Verify connection configuration
    await transporter.verify();
    console.log('✓ SMTP transporter initialized successfully');
    return true;
  } catch (error) {
    console.error('✗ Failed to initialize SMTP transporter:', error.message);
    return false;
  }
}

// Parse CSV file
function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];

    if (!fs.existsSync(filePath)) {
      reject(new Error(`CSV file not found: ${filePath}`));
      return;
    }

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => {
        // Clean email addresses (convert [at] to @ and [dot] to .)
        if (data['Email ID']) {
          data['Email ID'] = data['Email ID']
            .replace(/\[at\]/g, '@')
            .replace(/\[dot\]/g, '.');
        }
        results.push(data);
      })
      .on('end', () => {
        console.log(`✓ Parsed ${results.length} records from ${path.basename(filePath)}`);
        resolve(results);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

// Personalize email template
function personalizeEmail(template, recipient) {
  return template
    .replace(/{{name}}/g, recipient['Name of Divisional Commissioner'] || recipient['Name of DM'] || 'Sir/Madam')
    .replace(/{{greeting}}/g, recipient['Division Name'] ?
      `As the Divisional Commissioner of ${recipient['Division Name']} division,` :
      `As the District Magistrate of ${recipient['District Name']},`)
    .replace(/{{customMessage}}/g, process.env.CUSTOM_MESSAGE ||
      'We would like to inform you about our ongoing efforts to enhance financial investigation capabilities.');
}

// Send email to a single recipient
async function sendEmail(recipient, source) {
  try {
    const emailContent = personalizeEmail(CONFIG.email.template, recipient);

    const mailOptions = {
      from: CONFIG.email.from,
      to: recipient['Email ID'],
      subject: CONFIG.email.subject,
      text: emailContent,
      html: emailContent.replace(/\n/g, '<br>')
    };

    const result = await transporter.sendMail(mailOptions);

    console.log(`✓ Email sent to ${recipient['Email ID']} (${source}) - Message ID: ${result.messageId}`);

    return {
      success: true,
      email: recipient['Email ID'],
      name: recipient['Name of Divisional Commissioner'] || recipient['Name of DM'],
      messageId: result.messageId,
      source: source
    };
  } catch (error) {
    console.error(`✗ Failed to send email to ${recipient['Email ID']}:`, error.message);

    return {
      success: false,
      email: recipient['Email ID'],
      name: recipient['Name of Divisional Commissioner'] || recipient['Name of DM'],
      error: error.message,
      source: source
    };
  }
}

// Rate limiting helper
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Send emails in batches with rate limiting
async function sendEmailsBatch(recipients, source) {
  const results = {
    successful: [],
    failed: [],
    total: recipients.length
  };

  console.log(`\n📧 Starting to send emails to ${recipients.length} ${source}...`);

  for (let i = 0; i < recipients.length; i += CONFIG.rateLimit.batchSize) {
    const batch = recipients.slice(i, i + CONFIG.rateLimit.batchSize);

    // Send batch concurrently
    const batchPromises = batch.map(recipient => sendEmail(recipient, source));
    const batchResults = await Promise.all(batchPromises);

    // Categorize results
    batchResults.forEach(result => {
      if (result.success) {
        results.successful.push(result);
      } else {
        results.failed.push(result);
      }
    });

    // Rate limiting - wait before next batch
    if (i + CONFIG.rateLimit.batchSize < recipients.length) {
      const delayMs = Math.ceil(1000 / CONFIG.rateLimit.emailsPerSecond * CONFIG.rateLimit.batchSize);
      console.log(`⏳ Waiting ${delayMs}ms before next batch...`);
      await delay(delayMs);
    }
  }

  return results;
}

// Main execution function
async function main() {
  console.log('🚀 Starting email campaign...\n');

  // Check environment variables
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('❌ Error: SMTP_USER and SMTP_PASS environment variables are required');
    console.log('💡 Set them with: export SMTP_USER="your-smtp-username"');
    console.log('💡 And: export SMTP_PASS="your-smtp-password"');
    process.exit(1);
  }

  if (!process.env.EMAIL_FROM || process.env.EMAIL_FROM === 'sender@example.com') {
    console.error('❌ Error: EMAIL_FROM environment variable must be set to a verified email in AWS SES');
    console.log('💡 Set it with: export EMAIL_FROM="your-verified-email@example.com"');
    process.exit(1);
  }

  // Initialize transporter
  const transportReady = await initializeTransporter();
  if (!transportReady) {
    process.exit(1);
  }

  try {
    // Parse both CSV files
    const [divisionalCommissioners, districtMagistrates] = await Promise.all([
      parseCSV(CONFIG.files.divisionalCommissioner),
      parseCSV(CONFIG.files.districtMagistrate)
    ]);

    // Filter out records without email addresses
    const validCommissioners = divisionalCommissioners.filter(r => r['Email ID'] && r['Email ID'].includes('@'));
    const validMagistrates = districtMagistrates.filter(r => r['Email ID'] && r['Email ID'].includes('@'));

    console.log(`\n📊 Summary:`);
    console.log(`  Divisional Commissioners: ${validCommissioners.length} valid emails out of ${divisionalCommissioners.length} total`);
    console.log(`  District Magistrates: ${validMagistrates.length} valid emails out of ${districtMagistrates.length} total`);
    console.log(`  Total emails to send: ${validCommissioners.length + validMagistrates.length}`);

    // Ask for confirmation
    if (process.argv.includes('--auto') || process.argv.includes('-y')) {
      console.log('\n✓ Auto-confirmed. Starting email campaign...\n');
    } else {
      console.log('\n❓ Do you want to proceed? (y/N)');
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      const confirmation = await new Promise(resolve => {
        process.stdin.on('data', data => {
          process.stdin.pause();
          resolve(data.toString().trim().toLowerCase());
        });
      });

      if (confirmation !== 'y' && confirmation !== 'yes') {
        console.log('❌ Email campaign cancelled.');
        process.exit(0);
      }
    }

    // Send emails
    const commissionerResults = await sendEmailsBatch(validCommissioners, 'Divisional Commissioner');
    const magistrateResults = await sendEmailsBatch(validMagistrates, 'District Magistrate');

    // Generate report
    const totalSuccessful = commissionerResults.successful.length + magistrateResults.successful.length;
    const totalFailed = commissionerResults.failed.length + magistrateResults.failed.length;
    const totalSent = totalSuccessful + totalFailed;

    console.log('\n📋 Email Campaign Report');
    console.log('='.repeat(50));
    console.log(`✅ Successful: ${totalSuccessful}/${totalSent}`);
    console.log(`❌ Failed: ${totalFailed}/${totalSent}`);
    console.log(`📊 Success Rate: ${((totalSuccessful / totalSent) * 100).toFixed(2)}%`);

    // Save detailed report
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: totalSent,
        successful: totalSuccessful,
        failed: totalFailed,
        successRate: ((totalSuccessful / totalSent) * 100).toFixed(2)
      },
      commissioners: commissionerResults,
      magistrates: magistrateResults
    };

    const reportFileName = `email-campaign-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.writeFileSync(reportFileName, JSON.stringify(report, null, 2));
    console.log(`\n💾 Detailed report saved to: ${reportFileName}`);

    if (totalFailed > 0) {
      console.log('\n⚠️  Failed emails:');
      [...commissionerResults.failed, ...magistrateResults.failed].forEach(failed => {
        console.log(`  - ${failed.email} (${failed.name}): ${failed.error}`);
      });
    }

    // Close transporter
    transporter.close();
    console.log('\n🎉 Email campaign completed!');

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    if (transporter) {
      transporter.close();
    }
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Email campaign interrupted by user');
  if (transporter) {
    transporter.close();
  }
  process.exit(0);
});

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = {
  sendEmail,
  parseCSV,
  initializeTransporter
};