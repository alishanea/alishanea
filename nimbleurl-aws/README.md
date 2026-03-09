# ⚡ SnapLink — Serverless URL Shortener & Analytics

> B.Tech Final Year Cloud Computing Project | AWS Serverless Architecture

A **production-grade URL shortener** built entirely on AWS serverless services. Create short links, track real-time click analytics by device, country, and time — all powered by Lambda, DynamoDB, API Gateway, S3, CloudFront, and Cognito.

## 🏗️ Architecture

![AWS Architecture](docs/architecture-diagram.svg)

**8 AWS Services:**
- **Lambda** — 4 serverless functions (Shorten, Redirect, Analytics, List)
- **API Gateway** — REST API with JWT auth, rate limiting, CORS
- **DynamoDB** — Two tables (URLs + Analytics), TTL auto-expiry, GSI
- **S3** — Private static frontend hosting
- **CloudFront** — Global CDN, HTTPS enforcement, HTTP/2
- **Cognito** — User authentication, JWT tokens
- **CloudWatch** — Dashboards, alarms, metrics
- **X-Ray** — Distributed tracing

## ✨ Features

- 🔗 **URL Shortening** — Custom aliases or auto-generated 6-char codes
- 📊 **Real-time Analytics** — Clicks by day, device, country, hour
- ⏱️ **Link Expiry** — TTL-based auto-deletion (7/30/90/365 days)
- 🔐 **Authentication** — Cognito email/password with JWT
- ⚡ **Sub-50ms Redirects** — Async click logging keeps redirects fast
- 📱 **Responsive UI** — Works on mobile and desktop
- 💰 **Zero Cost** — Runs free on AWS Free Tier

## 🚀 Deploy in 5 Minutes

```bash
# Prerequisites: AWS CLI, SAM CLI, Node.js 18+

# 1. Clone
git clone https://github.com/yourusername/snaplink-aws.git
cd snaplink-aws

# 2. Build
sam build

# 3. Deploy (interactive)
sam deploy --guided

# 4. Upload frontend
aws s3 sync frontend/ s3://YOUR_BUCKET_NAME/
```

See [Full Deployment Guide](docs/deployment-guide.md) for detailed steps.

## 📁 Project Structure

```
snaplink-aws/
├── infrastructure/
│   └── template.yaml          # AWS SAM CloudFormation IaC
├── lambda/
│   ├── shorten/index.js       # POST /shorten
│   ├── redirect/index.js      # GET /r/{code}
│   ├── analytics/index.js     # GET /analytics/{code}
│   └── list/index.js          # GET /urls
├── frontend/
│   └── index.html             # Single-page app
└── docs/
    ├── architecture-diagram.svg
    └── deployment-guide.md
```

## 💡 Key Design Decisions

| Decision | Reasoning |
|---|---|
| PAY_PER_REQUEST DynamoDB | Serverless billing, no idle cost |
| Async click logging | Keeps redirect latency under 50ms |
| CloudFront OAC | Eliminates public S3 exposure |
| DynamoDB TTL | Auto-expiry without cron jobs |
| Lambda Layers | Shared dependencies, faster deploys |
| SAM template | Reproducible, version-controlled infra |

## 📝 Resume Bullet Points

- Architected a serverless URL shortener on AWS with Lambda, API Gateway, DynamoDB, S3, and CloudFront using Infrastructure-as-Code (AWS SAM)
- Implemented real-time click analytics with async event logging, achieving sub-50ms P99 redirect latency
- Secured the application with Cognito JWT auth, IAM least-privilege, CloudFront OAC, and DynamoDB encryption at rest
- Built production monitoring with CloudWatch dashboards, P99 latency alarms, and X-Ray distributed tracing

## 🛠️ Technologies

`AWS Lambda` `Amazon DynamoDB` `Amazon API Gateway` `Amazon S3` `Amazon CloudFront` `Amazon Cognito` `Amazon CloudWatch` `AWS X-Ray` `AWS SAM` `Node.js 18` `CloudFormation`

---
*Made with ☁️ for B.Tech Final Year | Cloud Computing*
