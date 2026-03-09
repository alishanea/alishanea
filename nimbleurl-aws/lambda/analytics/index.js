/**
 * Lambda Function: Analytics API
 * GET /analytics/{shortCode}
 * Returns click stats, device breakdown, country breakdown, time-series data
 */

const { DynamoDBClient, GetItemCommand, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const TABLE_NAME = process.env.DYNAMODB_TABLE || "url-shortener-table";
const ANALYTICS_TABLE = process.env.ANALYTICS_TABLE || "url-analytics-table";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

exports.handler = async (event) => {
  console.log("Analytics event:", JSON.stringify(event, null, 2));

  const shortCode = event.pathParameters?.shortCode;

  if (!shortCode) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "shortCode required" }) };
  }

  try {
    // Get URL metadata
    const urlResult = await client.send(
      new GetItemCommand({
        TableName: TABLE_NAME,
        Key: marshall({ shortCode }),
      })
    );

    if (!urlResult.Item) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: "Short URL not found" }) };
    }

    const urlData = unmarshall(urlResult.Item);

    // Query all click events for this shortCode
    const clicksResult = await client.send(
      new QueryCommand({
        TableName: ANALYTICS_TABLE,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: marshall({
          ":pk": shortCode,
          ":prefix": "CLICK#",
        }),
        ScanIndexForward: false, // Newest first
        Limit: 1000,
      })
    );

    const clicks = (clicksResult.Items || []).map(unmarshall);

    // --- Aggregate analytics ---

    // 1. Device breakdown
    const deviceBreakdown = clicks.reduce((acc, click) => {
      const device = click.device || "unknown";
      acc[device] = (acc[device] || 0) + 1;
      return acc;
    }, {});

    // 2. Country breakdown (top 10)
    const countryCount = clicks.reduce((acc, click) => {
      const country = click.country || "Unknown";
      acc[country] = (acc[country] || 0) + 1;
      return acc;
    }, {});
    const topCountries = Object.entries(countryCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([country, count]) => ({ country, count }));

    // 3. Referer breakdown
    const refererCount = clicks.reduce((acc, click) => {
      const ref = click.referer || "direct";
      const key = ref === "direct" ? "direct" : new URL(ref).hostname;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const topReferers = Object.entries(refererCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([source, count]) => ({ source, count }));

    // 4. Clicks over time (last 30 days, grouped by day)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyClicks = {};
    clicks.forEach((click) => {
      const date = click.clickedAt?.split("T")[0];
      if (date && new Date(date) >= thirtyDaysAgo) {
        dailyClicks[date] = (dailyClicks[date] || 0) + 1;
      }
    });

    // Fill in zero-click days
    const clicksTimeSeries = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      clicksTimeSeries.push({ date: dateStr, clicks: dailyClicks[dateStr] || 0 });
    }

    // 5. Hourly distribution (what hour of day gets most clicks)
    const hourlyDist = Array(24).fill(0);
    clicks.forEach((click) => {
      if (click.clickedAt) {
        const hour = new Date(click.clickedAt).getUTCHours();
        hourlyDist[hour]++;
      }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        shortCode,
        originalUrl: urlData.originalUrl,
        createdAt: urlData.createdAt,
        expiresAt: urlData.ttl ? new Date(urlData.ttl * 1000).toISOString() : null,
        isActive: urlData.isActive,
        summary: {
          totalClicks: urlData.clickCount || 0,
          uniqueDays: Object.keys(dailyClicks).length,
          lastClickedAt: urlData.lastClickedAt || null,
        },
        deviceBreakdown,
        topCountries,
        topReferers,
        clicksTimeSeries,
        hourlyDistribution: hourlyDist.map((count, hour) => ({ hour, count })),
      }),
    };
  } catch (error) {
    console.error("Analytics error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to fetch analytics", message: error.message }),
    };
  }
};
