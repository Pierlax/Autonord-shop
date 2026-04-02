---
name: blog-research
description: Discovers trending topics in the power tools industry, researches content from Reddit, forums, and news, and generates TAYA-compliant article drafts. Use when the blog needs new content or topic discovery.
---

# Blog Research Skill

Discover trending topics and generate article drafts for the Autonord blog.

## Actions

### discover-topics
Search Reddit, forums, and news for trending power tool topics.

### generate-article
Generate a full TAYA-compliant article draft from a given topic.

### full-pipeline
Run the complete pipeline: discover topics, pick the best one, generate an article.

## Payload Format

```typescript
{
  action: 'discover-topics' | 'generate-article' | 'full-pipeline';
  topic?: string;        // Required for generate-article
  articleType?: string;   // e.g., 'guide', 'comparison', 'review'
  keywords?: string[];    // Target SEO keywords
}
```

## Triggers

- **cron**: Runs weekly (Monday 8:00 AM)
- **manual**: Can be triggered from the Admin Dashboard
