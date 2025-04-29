# Brand Competitor Analysis Platform

## Overview

This project is a full-stack web application for **brand competitor research, data enrichment, and AI-powered email generation**. It is designed to help marketing, sales, and research teams quickly analyze a brand's competitive landscape, enrich competitor data, and generate personalized outreach emails using advanced AI models (Anthropic Claude, OpenAI GPT-4o, etc.).

## Features

- **Brand Competitor Search**  
  Enter a brand name and region to automatically research and summarize the top direct competitors using GPT-4o-mini and GPT-4o.

- **Competitor Data Enrichment**  
  Edit, add, and manage competitor information (brand, region, competitor name, platform, URL, etc.) in a user-friendly table.  
  Auto-fill competitor URLs using AI.

- **History & Data Management**  
  View and manage all previous competitor searches and results in a searchable history page.

- **AI-Powered Email Generation**  
  Select a template, fill in brand and competitor data, and generate high-quality, data-driven outreach emails using Anthropic Claude.  
  Supports custom templates and JSON data input.

- **Multi-language Support**  
  All user-facing content is in English for international usability.

## Tech Stack

- **Frontend:** React (Next.js), Tailwind CSS
- **Backend:** Next.js API routes, Supabase (PostgreSQL)
- **AI Integration:** OpenAI GPT-4o, Anthropic Claude
- **Other:** React Hot Toast, React Markdown

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
   Copy `.env.example` to `.env.local` and fill in your API keys for OpenAI, Anthropic, Supabase, etc.

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**  
   Visit [http://localhost:3000](http://localhost:3000) to use the app.

## Folder Structure

- `app/` — Main Next.js app, including pages and API routes
- `lib/` — Utility functions and prompts
- `public/` — Static assets
- `README.md` — Project documentation

## Screenshots

> _You can add screenshots here to illustrate the workflow: competitor search, data editing, email generation, etc._

## License

MIT
