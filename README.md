# Serverless Contact Form Backend

AWS Lambda · Amazon SES · DynamoDB Rate Limiting

## Overview

This project is a production-oriented serverless backend for a website contact form.

It provides:

- • Email delivery using Amazon SES v2
- • IP-based rate limiting using DynamoDB with TTL
- • Basic bot protection via honeypot field
- • CORS handling for browser-based clients

The system is designed to be lightweight, secure, and scalable with minimal operational overhead.

## Key Features

- Serverless architecture (AWS Lambda + API Gateway)
- Email sending through Amazon SES (v2 SDK)
- Atomic rate limiting using DynamoDB conditional writes
- Automatic cleanup using DynamoDB TTL
- Honeypot field for bot filtering
- CORS protection
- Minimal dependencies (AWS SDK v3 only)
- High-Level Flow
- Client sends POST request to /contact
- Lambda parses request body
- Honeypot field is checked
- Rate limit is enforced per IP per hour
- Email is sent via Amazon SES
- Response is returned to client

## API Specification
# Endpoint

POST /contact

Request Body (JSON)

{
"name": "Danyar",
"email": "danyar@example.com
",
"message": "Hello! I’d like a quote for a website.",
"company": ""
}

Note:
The company field is a honeypot field and should remain empty for real users.

## Responses

200 OK
→ Email successfully sent

400 Bad Request
→ Missing required fields

429 Too Many Requests
→ Rate limit exceeded

500 Server Error
→ Internal or configuration error

## Environment Variables

AWS_REGION
Region for AWS services (example: eu-north-1)

RATE_TABLE
DynamoDB table name for rate limiting

IP_LIMIT_PER_HOUR
Maximum requests per IP per hour (default: 5)

FROM_EMAIL
Verified SES sender address

ALLOWED_ORIGIN
Allowed CORS origin (your website URL)

## DynamoDB Table Setup

Table name: defined in RATE_TABLE

Partition key:

pk (String)

TTL attribute:

ttl (Number)

Example stored keys:

ip#203.0.113.10#hour#473290#slot#1

TTL automatically removes expired rate limit entries after approximately one hour.

## AWS SES Configuration

FROM_EMAIL must be verified in Amazon SES

If SES is in sandbox mode, recipient email must also be verified

Production access is recommended for real-world usage

## IAM Permissions Required

The Lambda execution role must allow:

ses:SendEmail

dynamodb:PutItem

## Example minimal policy:

{
"Version": "2012-10-17",
"Statement": [
{
"Effect": "Allow",
"Action": ["ses:SendEmail"],
"Resource": "*"
},
{
"Effect": "Allow",
"Action": ["dynamodb:PutItem"],
"Resource": "arn:aws:dynamodb:REGION:ACCOUNT_ID:table/RATE_TABLE_NAME"
}
]
}

## Security Considerations

• Rate limiting protects against spam and abuse
• Honeypot field blocks simple bots
• CORS prevents unauthorized origins

## Optional improvements:

AWS WAF integration

Email format validation

Message length limits

Monitoring with CloudWatch metrics

## Deployment

Typical setup:

Deploy Lambda function

Create API Gateway route POST /contact

Connect route to Lambda

Set environment variables

Verify SES sender email

Create DynamoDB table with TTL enabled

## Architecture Benefits

✔ Fully serverless
✔ Low cost at small scale
✔ Automatically scalable
✔ No servers to manage
✔ Secure by design

## License

MIT License (or your preferred license)
