/**
 * Lambda Function: List User URLs
 * GET /urls
 * Lists all URLs created by the authenticated user
 */

const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const TABLE_NAME = process.env.DYNAMODB_TABLE || "url-shortener-table";
const BASE_URL = process.env.BASE_URL || "https://your-api-id.execute-api.us-east-1.amazonaws.com/prod";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

exports.handler = async (event) => {
  console.log("List URLs event:", JSON.stringify(event, null, 2));

  // Get userId from Cognito JWT claims (injected by API Gateway authorizer)
  const userId =
    event.requestContext?.authorizer?.claims?.sub ||
    event.requestContext?.authorizer?.claims?.email ||
    "anonymous";

  const limit = parseInt(event.queryStringParameters?.limit || "20");
  const lastKey = event.queryStringParameters?.lastKey;

  try {
    const params = {
      TableName: TABLE_NAME,
      IndexName: "userId-createdAt-index",
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: marshall({ ":uid": userId }),
      ScanIndexForward: false, // Newest first
      Limit: Math.min(limit, 100), // Cap at 100
    };

    // Pagination support
    if (lastKey) {
      try {
        params.ExclusiveStartKey = JSON.parse(Buffer.from(lastKey, "base64").toString());
      } catch {
        // Invalid cursor, ignore
      }
    }

    const result = await client.send(new QueryCommand(params));
    const items = (result.Items || []).map((item) => {
      const url = unmarshall(item);
      return {
        shortCode: url.shortCode,
        shortUrl: `${BASE_URL}/r/${url.shortCode}`,
        originalUrl: url.originalUrl,
        clickCount: url.clickCount || 0,
        createdAt: url.createdAt,
        expiresAt: url.ttl ? new Date(url.ttl * 1000).toISOString() : null,
        isActive: url.isActive,
        domain: url.metadata?.domain || "",
      };
    });

    // Encode next page cursor
    let nextKey = null;
    if (result.LastEvaluatedKey) {
      nextKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString("base64");
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        urls: items,
        count: items.length,
        nextKey,
        userId,
      }),
    };
  } catch (error) {
    console.error("List error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to list URLs", message: error.message }),
    };
  }
};
