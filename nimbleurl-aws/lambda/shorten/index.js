/**
 * Lambda Function: URL Shortener
 * POST /shorten
 * Creates a short URL and stores metadata in DynamoDB
 */

const { DynamoDBClient, PutItemCommand, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");
const crypto = require("crypto");

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const TABLE_NAME = process.env.DYNAMODB_TABLE || "url-shortener-table";
const BASE_URL = process.env.BASE_URL || "https://your-api-id.execute-api.us-east-1.amazonaws.com/prod";

// Generate a short unique code (6 chars)
function generateShortCode(length = 6) {
  return crypto.randomBytes(length).toString("base64url").slice(0, length);
}

// Validate URL format
function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

exports.handler = async (event) => {
  console.log("Event:", JSON.stringify(event, null, 2));

  // CORS headers
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
  };

  // Handle preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { originalUrl, customAlias, expiresInDays = 30, userId = "anonymous" } = body;

    // Validate input
    if (!originalUrl) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "originalUrl is required" }),
      };
    }

    if (!isValidUrl(originalUrl)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Invalid URL format. Must start with http:// or https://" }),
      };
    }

    // Use custom alias or generate random code
    const shortCode = customAlias || generateShortCode();

    // Check if custom alias already exists
    if (customAlias) {
      const existing = await client.send(
        new GetItemCommand({
          TableName: TABLE_NAME,
          Key: marshall({ shortCode: customAlias }),
        })
      );
      if (existing.Item) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({ error: "Custom alias already taken. Please choose another." }),
        };
      }
    }

    // Calculate TTL (Time To Live) for DynamoDB auto-expiry
    const now = Math.floor(Date.now() / 1000);
    const ttl = now + expiresInDays * 24 * 60 * 60;

    // Store in DynamoDB
    const item = {
      shortCode,
      originalUrl,
      userId,
      createdAt: new Date().toISOString(),
      clickCount: 0,
      ttl,
      isActive: true,
      metadata: {
        domain: new URL(originalUrl).hostname,
        expiresInDays,
      },
    };

    await client.send(
      new PutItemCommand({
        TableName: TABLE_NAME,
        Item: marshall(item),
      })
    );

    const shortUrl = `${BASE_URL}/r/${shortCode}`;

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        shortCode,
        shortUrl,
        originalUrl,
        expiresAt: new Date(ttl * 1000).toISOString(),
        createdAt: item.createdAt,
      }),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error", message: error.message }),
    };
  }
};
