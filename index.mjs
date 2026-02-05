import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

/*
  Initialize AWS clients using the region from environment variables
*/
const ses = new SESv2Client({ region: process.env.AWS_REGION });
const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });

/*
  Environment variables
*/
const TABLE = process.env.RATE_TABLE;                 // DynamoDB table for rate limiting
const LIMIT = Number(process.env.IP_LIMIT_PER_HOUR || 5); // Max requests per IP per hour
const FROM_EMAIL = process.env.FROM_EMAIL;            // Verified SES sender email
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "<ADD WEBSITE HERE>";

/*
  Generate CORS headers for browser requests
*/
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Vary": "Origin",
  };
}

/*
  Extract client IP address from API Gateway event
  (supports both HTTP API v2 and REST API formats)
*/
function ipFromEvent(event) {
  return (
    event.requestContext?.http?.sourceIp ||
    event.requestContext?.identity?.sourceIp ||
    "0.0.0.0"
  );
}

/*
  Attempt to consume one rate limit slot in DynamoDB.

  Uses conditional write to ensure:
  - A slot can only be used once
  - TTL automatically removes old entries
*/
async function consume(pk, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = now + ttlSeconds;

  const cmd = new PutItemCommand({
    TableName: TABLE,
    Item: {
      pk: { S: pk },
      ttl: { N: String(ttl) }, // DynamoDB TTL attribute
    },
    // Only allow insert if the key does not already exist
    ConditionExpression: "attribute_not_exists(pk)",
  });

  try {
    await ddb.send(cmd);
    return true; // Slot successfully consumed
  } catch (e) {
    if (e?.name === "ConditionalCheckFailedException") {
      return false; // Slot already used
    }
    throw e; // Unexpected error
  }
}

/*
  Check if an IP address is within allowed request limit for the current hour.

  Works by creating "slots" in DynamoDB:
  ip#<IP>#hour#<HOUR>#slot#<N>
*/
async function checkRateLimit(ip) {
  const now = Math.floor(Date.now() / 1000);
  const hour = Math.floor(now / 3600); // Current hour window
  const ttlSeconds = 3700; // Slightly longer than 1 hour for safety

  for (let i = 1; i <= LIMIT; i++) {
    const key = `ip#${ip}#hour#${hour}#slot#${i}`;

    // Try to claim a free slot
    if (await consume(key, ttlSeconds)) {
      return true; // Allowed request
    }
  }

  // All slots used → rate limit exceeded
  return false;
}

/*
  Main Lambda handler
*/
export const handler = async (event) => {
  const headers = corsHeaders();
  const method =
    event.requestContext?.http?.method || event.httpMethod;

  /*
    Handle CORS preflight request
  */
  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers,
      body: "",
    };
  }

  try {
    /*
      Validate required environment variables
    */
    if (!TABLE) {
      return { statusCode: 500, headers, body: "RATE_TABLE not set" };
    }

    if (!FROM_EMAIL) {
      return { statusCode: 500, headers, body: "FROM_EMAIL not set" };
    }

    /*
      Parse request body
    */
    const body = JSON.parse(event.body || "{}");

    /*
      Honeypot field (anti-bot protection)
      If "company" is filled → likely a bot → silently accept
    */
    if (String(body.company || "").trim()) {
      return { statusCode: 200, headers, body: "OK" };
    }

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const message = String(body.message || "").trim();

    /*
      Basic input validation
    */
    if (!name || !email || !message) {
      return {
        statusCode: 400,
        headers,
        body: "Missing fields",
      };
    }

    /*
      Rate limiting per IP address
    */
    const ip = ipFromEvent(event);
    const isAllowed = await checkRateLimit(ip);

    if (!isAllowed) {
      return {
        statusCode: 429,
        headers,
        body: "Too many requests",
      };
    }

    /*
      Send email using AWS SES v2
    */
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: FROM_EMAIL,
        Destination: {
          ToAddresses: ["cloudcanvas.team@gmail.com"],
        },
        ReplyToAddresses: [email],
        Content: {
          Simple: {
            Subject: {
              Data: `New CloudCanvas message from ${name}`,
            },
            Body: {
              Text: {
                Data: message,
              },
            },
          },
        },
      })
    );

    /*
      Success response
    */
    return {
      statusCode: 200,
      headers,
      body: "OK",
    };
  } catch (err) {
    console.error("contact error:", err);

    /*
      Generic server error
    */
    return {
      statusCode: 500,
      headers,
      body: "Server error",
    };
  }
};
