# Brand Competitor Analysis Platform

## Overview

This project is a full-stack web application for **brand competitor research, data enrichment, social media scraping, and AI-powered email generation**. It helps marketing, sales, and research teams quickly:

- Identify and summarize direct competitors across multiple channels.  
- Enrich competitor data with URLs, metadata, and social media metrics.  
- Scrape competitor social media profiles (Instagram, LinkedIn, TikTok, Twitter, YouTube).  
- Generate personalized outreach emails using a variety of AI models.  
- Manage search history and edit data via an intuitive UI.  
- Switch between light/dark theme and customize email templates.

## Key Features

- **Brand Competitor Search**  
  Enter a brand name and region to research top competitors via GPT-4o-mini and GPT-4o.

- **Competitor Data Enrichment**  
  - Edit/add competitor info (brand, region, platform, URL, etc.) in a table.  
  - AI-powered URL inference and content completion.

- **Social Media Scraping**  
  Automatically scrape competitor profiles and followers from:  
  - Instagram  
  - LinkedIn  
  - TikTok  
  - Twitter  
  - YouTube  
  (powered by Apify)

- **History & Data Management**  
  View, search, and restore previous competitor analysis sessions.

- **AI-Powered Email Generation**  
  - Support for Anthropic Claude, OpenAI GPT-4o, Google GPT, Perplexity.  
  - Customizable templates with JSON data injection.  
  - Live email editor with preview and light/dark mode.

- **Theme Toggle**  
  Switch between light and dark UI themes on the fly.

- **Multi-Model AI Integration**  
  - Anthropic Claude  
  - OpenAI GPT-4o  
  - Google GPT  
  - Perplexity

## Tech Stack

- **Frontend:** React (Next.js 14), Tailwind CSS 4  
- **Backend:** Next.js API Routes, Supabase (PostgreSQL engine)  
- **Scraping:** Apify client (`@apify/client`)  
- **AI/ML Integration:**  
  - **Large Language Models:** OpenAI GPT-4o, Anthropic Claude, Google GPT, Perplexity  
  - **Agents & SDKs:** `@anthropic-ai/sdk`, `@apify/client`, `perplexity-api`  
- **Utilities:** SWR, React Hot Toast, React Markdown  
- **Tooling:** ESLint, Prettier, PostCSS, Autoprefixer

## Code Statistics

- **Total Lines of Code:** 16,226 lines
- **Application Code:** ~8,787 lines (excluding package-lock.json)
- **Main Components:**
  - Frontend Pages: ~3,500 lines
  - API Routes: ~2,000 lines
  - Library & Utilities: ~500 lines
  - Configuration: ~7,500 lines (mostly dependencies)
- **Version:** 1.7.8

## Quick Start

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd brand-research
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**  
   Copy `.env.example` to `.env.local` and fill in:
   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ANTHROPIC_API_KEY=your_anthropic_key
   OPENAI_API_KEY=your_openai_key
   GOOGLE_GPT_API_KEY=your_google_gpt_key
   PERPLEXITY_API_KEY=your_perplexity_key
   APIFY_TOKEN=your_apify_token
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**  
   Visit [http://localhost:3000](http://localhost:3000)

## Folder Structure



app/
api/
anthropic/
openai/
google-gpt/
perplexity/
apify/
instagram/
linkedin/
tiktok/
twitter/
youtube/
competitor-history/
simple-mode/
history/
simple-mode/
competitor-scrape/
competitor-result/
email-editor/
ThemeToggle.tsx
layout.tsx
globals.css
lib/
prompts.ts
supabase.ts
supabase-utils.ts
apify-client.ts
public/
favicon.ico
...
README.md


## Pages

- `/` (Home)  
  - Brand competitor search entry point.  
  - Input brand name and region to run deep research via GPT-4o-mini and GPT-4o.  
  - Edit/add/delete competitors, save and navigate to the result page.

- `/history` (Search History)  
  - View and group all past search records.  
  - Paginate, expand/collapse each search session to see detailed tables.

- `/simple-mode` (Simple Mode)  
  - One-click simplified workflow.  
  - Step-by-step: create search session, analyze competitors, extract URLs, scrape followers, generate email.  
  - Built-in progress bar and debug logs.

- `/competitor-scrape` (Competitor Scrape)  
  - Batch scrape social media data for selected records (Instagram, LinkedIn, TikTok, Twitter, YouTube).  
  - Edit mode to modify fields and save changes back to the database.

- `/competitor-result` (Competitor Result)  
  - Display competitor search history and expand "all platform" rows into multiple platform entries.  
  - Auto-fill URLs via GPT prompts, edit, and save the final data.

- `/email-editor` (Email Editor)  
  - Select or customize email templates based on historical competitor data.  
  - Insert variables, attach JSON data, and preview in Markdown.  
  - Generate final email content with Anthropic Claude and view past results.

## Screenshots



## License

MIT