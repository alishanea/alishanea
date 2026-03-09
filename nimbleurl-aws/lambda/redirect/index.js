/**
 * Lambda Function: URL Redirect
 * GET /r/{shortCode}
 * Redirects to original URL and tracks click analytics
 */

const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const TABLE_NAME = process.env.DYNAMODB_TABLE || "url-shortener-table";
const ANALYTICS_TABLE = process.env.ANALYTICS_TABLE || "url-analytics-table";

// Parse user agent for device type
function parseDevice(userAgent = "") {
  if (/mobile|android|iphone|ipad/i.test(userAgent)) return "mobile";
  if (/tablet/i.test(userAgent)) return "tablet";
  return "desktop";
}

// Extract country from CloudFront header (populated by AWS automatically)
function getCountry(event) {
  return (
    event.headers?.["CloudFront-Viewer-Country"] ||
    event.headers?.["cf-ipcountry"] ||
    "Unknown"
  );
}

exports.handler = async (event) => {
  console.log("Redirect event:", JSON.stringify(event, null, 2));

  const shortCode = event.pathParameters?.shortCode;

  if (!shortCode) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Short code is required" }),
    };
  }

  try {
    // Fetch URL record from DynamoDB
    const result = await client.send(
      new GetItemCommand({
        TableName: TABLE_NAME,
        Key: marshall({ shortCode }),
      })
    );

    if (!result.Item) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "text/html" },
        body: `
          <html>
            <head><title>Link Not Found</title></head>
            <body style="font-family:sans-serif;text-align:center;padding:50px;">
              <h1>🔗 Link Not Found</h1>
              <p>The short link <strong>${shortCode}</strong> doesn't exist or has expired.</p>
              <a href="/">Create a new short link</a>
            </body>
          </html>`,
      };
    }

    const item = unmarshall(result.Item);

    // Check if link is active
    if (!item.isActive) {
      return {
        statusCode: 410,
        body: JSON.stringify({ error: "This link has been deactivated." }),
      };
    }

    // Check TTL manually (DynamoDB TTL deletion is eventual, not instant)
    const now = Math.floor(Date.now() / 1000);
    if (item.ttl && item.ttl < now) {
      return {
        statusCode: 410,
        headers: { "Content-Type": "text/html" },
        body: `<html><body><h1>Link Expired</h1><p>This link has expired.</p></body></html>`,
      };
    }

    // --- Async: Update click count and log analytics ---
    // Fire-and-forget (don't await, to keep redirect fast)
    const clickTimestamp = new Date().toISOString();
    const userAgent = event.headers?.["User-Agent"] || "";
    const referer = event.headers?.["Referer"] || "direct";
    const ip = event.requestContext?.identity?.sourceIp || "unknown";
    const country = getCountry(event);
    const device = parseDevice(userAgent);

    // Increment click count in main table
    client.send(
      new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: marshall({ shortCode }),
        UpdateExpression: "SET clickCount = clickCount + :inc, lastClickedAt = :ts",
        ExpressionAttributeValues: marshall({ ":inc": 1, ":ts": clickTimestamp }),
      })
    ).catch(console.error);

    // Log detailed click to analytics table
    const { PutItemCommand } = require("@aws-sdk/client-dynamodb");
    client.send(
      new PutItemCommand({
        TableName: ANALYTICS_TABLE,
        Item: marshall({
          pk: shortCode,
          sk: `CLICK#${clickTimestamp}#${Math.random().toString(36).slice(2)}`,
          shortCode,
          clickedAt: clickTimestamp,
          referer,
          country,
          device,
          userAgent: userAgent.slice(0, 200), // Truncate long UAs
          ip: ip.slice(0, 15),
          originalUrl: item.originalUrl,
        }),
      })
    ).catch(console.error);

    // Redirect to original URL
    return {
      statusCode: 301,
      headers: {
        Location: item.originalUrl,
        "Cache-Control": "no-cache, no-store",
        "X-Short-Code": shortCode,
      },
      body: "",
    };
  } catch (error) {
    console.error("Redirect error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
