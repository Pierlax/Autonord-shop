# Blog Researcher Agent - API Research

## Available Search APIs

### 1. Manus Built-in Reddit API (Recommended for Reddit)
- **Already available** in the project via `callDataApi("Reddit/AccessAPI")`
- Can fetch hot posts from any subreddit
- No additional API key needed
- Subreddits to scan: r/tools, r/construction, r/electricians, r/plumbing, r/HVAC

### 2. Exa.ai (Recommended for Web Search)
- **URL:** https://exa.ai
- **Pricing:** Pay-as-you-go, ~$0.001 per search
- **Features:**
  - Neural search (embeddings-based)
  - Can search specific domains (forums, Reddit)
  - Returns full content, not just snippets
- **Use case:** Search for forum discussions, blog posts, reviews

### 3. Tavily (Alternative)
- **URL:** https://tavily.com
- **Pricing:** 1000 free credits, then $0.005-0.008 per credit
- **Features:**
  - Optimized for AI/RAG applications
  - Returns structured results
- **Use case:** General web search for trending topics

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    BLOG RESEARCHER AGENT                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. SEARCH PHASE                                            │
│     ├── Reddit API (Manus built-in)                        │
│     │   └── r/tools, r/construction, r/electricians        │
│     └── Exa.ai (optional, for broader web search)          │
│                                                             │
│  2. ANALYSIS PHASE                                          │
│     └── Claude: Identify recurring pain points              │
│         - Group similar complaints                          │
│         - Score by frequency and engagement                 │
│         - Select top topic for article                      │
│                                                             │
│  3. DRAFTING PHASE                                          │
│     └── Claude: Write TAYA-style article                    │
│         - Honest title                                      │
│         - Problem description                               │
│         - Technical analysis                                │
│         - Impartial verdict                                 │
│                                                             │
│  4. PUBLISHING PHASE                                        │
│     ├── Shopify Blog API: Create draft article             │
│     └── Notification: Email/Slack alert                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Environment Variables Needed

```env
# Already have
ANTHROPIC_API_KEY=sk-ant-xxxxx

# For Exa.ai (optional, for broader search)
EXA_API_KEY=xxxxx

# For Shopify Blog
SHOPIFY_SHOP_DOMAIN=xxxxx
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxxxx

# For notifications
NOTIFICATION_EMAIL=xxxxx
# or
SLACK_WEBHOOK_URL=xxxxx
```

## Vercel Cron Schedule

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/blog-researcher",
      "schedule": "0 8 * * 1"  // Every Monday at 8am
    }
  ]
}
```
