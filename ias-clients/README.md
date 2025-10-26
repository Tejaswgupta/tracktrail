# Email Campaign Sender

A Node.js script to send personalized emails to contacts in CSV files using AWS SES SMTP service. This script is designed to send emails to Divisional Commissioners and District Magistrates from the provided CSV files.

## Features

- 📧 Send personalized emails to CSV contacts
- 🔗 AWS SES SMTP integration
- 📊 Rate limiting to comply with AWS SES limits
- 📝 CSV parsing with email format cleanup
- 📋 Detailed campaign reports
- 🛡️ Error handling and logging
- ⚡ Batch processing for performance

## Prerequisites

1. **Node.js** (version 14 or higher)
2. **AWS SES Account** with:
   - Verified sender email address
   - SMTP credentials (username and password)
   - Appropriate sending limits

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure AWS SES SMTP

1. Log in to your AWS SES console
2. Navigate to "SMTP Settings"
3. Create SMTP credentials or use existing ones
4. Verify your sender email address in AWS SES

### 3. Set Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit the `.env` file with your configuration:

```bash
# AWS SES SMTP Configuration
SMTP_HOST=email-smtp.us-east-1.amazonaws.com  # Change to your region
SMTP_PORT=587
SMTP_USER=your-smtp-username                  # From AWS SES SMTP Settings
SMTP_PASS=your-smtp-password                  # From AWS SES SMTP Settings

# Email Configuration
EMAIL_FROM=your-verified-email@example.com    # Must be verified in AWS SES
EMAIL_SUBJECT=Important Communication from TrackTrail

# Optional: Custom message content
CUSTOM_MESSAGE=Your custom message here...
```

### 4. Verify CSV Files

Ensure the following CSV files are present in the same directory:
- `divisional_commissioner.csv` - Divisional Commissioners contact data
- `dm.csv` - District Magistrates contact data

## Usage

### Basic Usage (Interactive)

```bash
npm start
```

The script will:
1. Parse both CSV files
2. Show summary of recipients
3. Ask for confirmation before sending
4. Send emails with rate limiting
5. Generate a detailed report

### Auto-Confirm Usage

Skip confirmation prompt and start sending immediately:

```bash
npm run send
# or
node send-emails.js --auto
```

### Command Line Options

```bash
# Interactive mode (default)
node send-emails.js

# Auto-confirm (skip confirmation)
node send-emails.js --auto
# or
node send-emails.js -y
```

## Email Template

The script uses a default email template that automatically personalizes:
- Recipient name
- Division/District name
- Greeting based on role

You can customize the message content by setting the `CUSTOM_MESSAGE` environment variable.

## Rate Limiting

The script includes built-in rate limiting to comply with AWS SES limits:
- **Default**: 10 emails per second
- **Batch size**: 5 emails per batch
- **Adjustable**: Modify `CONFIG.rateLimit` in the script

## Output and Reports

### Console Output
The script provides real-time progress updates:
- ✓ Successful sends
- ✗ Failed sends with error messages
- ⏳ Rate limiting delays
- 📊 Final statistics

### JSON Report
A detailed report is saved as `email-campaign-report-YYYY-MM-DDTHH-MM-SS-sssZ.json` containing:
- Campaign summary
- Individual send results
- Error details
- Success rates

## AWS SES Considerations

### Sending Limits
- **Sandbox mode**: Limited to 200 emails per day
- **Production**: Can request higher limits
- **Rate limits**: Configure based on your account limits

### Email Requirements
- Sender email must be verified in AWS SES
- HTML and text versions are generated automatically
- Unsubscribe headers are not included (add if needed for compliance)

### Bounce and Complaint Handling
- Monitor your AWS SES dashboard for bounces/complaints
- Implement bounce handling for production use
- Consider using AWS SNS for bounce notifications

## Troubleshooting

### Common Issues

1. **"SMTP credentials failed"**
   - Verify SMTP username and password
   - Check AWS region in SMTP_HOST
   - Ensure SMTP credentials are active

2. **"Email address is not verified"**
   - Verify the sender email in AWS SES
   - Check if domain verification is needed

3. **"Rate limit exceeded"**
   - Reduce `CONFIG.rateLimit.emailsPerSecond`
   - Check your AWS SES sending limits

4. **"CSV file not found"**
   - Ensure CSV files are in the same directory
   - Check file names match exactly

### Debug Mode

Add console logging for debugging:
```javascript
// In send-emails.js, add this line after transporter creation:
console.log('Transporter config:', CONFIG.smtp);
```

## Security Considerations

- 🔐 Store SMTP credentials securely (use AWS Secrets Manager in production)
- 🚫 Never commit `.env` file to version control
- 📧 Use verified sender domains only
- 🔒 Consider implementing DKIM/SPF records for better deliverability

## Customization

### Modify Email Template

Edit the `CONFIG.email.template` in `send-emails.js`:

```javascript
template: `
Dear {{name}},

Your custom message here...

Best regards,
Your Name
`
```

### Change Rate Limiting

Modify `CONFIG.rateLimit` in the script:

```javascript
rateLimit: {
  emailsPerSecond: 5,  // Slower rate
  batchSize: 3         // Smaller batches
}
```

### Add Custom Fields

The CSV parser automatically makes all columns available. Use them in templates:

```javascript
// Reference any CSV column by name
{{Mobile No}}
{{Division Name}}
{{District Name}}
```

## Support

For issues related to:
- **AWS SES**: Check AWS documentation and console
- **Script functionality**: Review the console logs and JSON report
- **CSV formatting**: Ensure proper CSV format with headers

## License

MIT License