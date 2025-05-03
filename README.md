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

# 🧠 Brand Competitor Analysis Platform  
*A Cognitive Architecture for Competitive Intelligence Synthesis, Market Signal Enrichment, and Autonomous Outreach Communication*

## 🧭 Executive Synopsis

The **Brand Competitor Analysis Platform** is a state-of-the-art, full-stack intelligence system architected to enable **asymmetric market mapping, multimodal data enrichment**, and **large language model–orchestrated outreach synthesis**. This platform empowers marketing analysts, sales strategists, and research operatives to operationalize competitive insights and automate B2B engagement pipelines through artificial general intelligence.

## 🚀 Key Capabilities

- ### **Semantic Competitor Identification**
  Leverages GPT-4o (OpenAI) and Claude (Anthropic) to execute zero-shot and few-shot inference tasks for identifying and summarizing top competitors across geographic and vertical taxonomies.

- ### **Context-Aware Entity Enrichment**
  Facilitates structured editing and augmentation of competitive datasets (brand name, market region, platform footprint, URLs, etc.) via an intuitive, schema-aligned interface.  
  Includes LLM-enabled URL inference and content completion.

- ### **Temporal Knowledge Archival**
  Employs persistent vector and relational storage (Supabase/PostgreSQL) to construct a queryable historical ledger of all analytic sessions and strategic outputs.

- ### **Generative Outreach Fabrication**
  Incorporates transformer-based architectures to synthesize hyper-personalized outreach templates. Supports custom templates with structured JSON injection and multilingual surface realization.

- ### **Internationalization-Ready**
  Optimized for global operability; all user interactions default to English to ensure consistency across geopolitical deployments.

## 🧬 Technical Substrate

- **Frontend:** React (via Next.js 14), Tailwind CSS 4  
- **Backend:** Next.js API Routes, Supabase (PostgreSQL engine)  
- **AI/ML Integration:**  
  - **Large Language Models:** OpenAI GPT-4o, Anthropic Claude  
  - **Enrichment Agents:** `@anthropic-ai/sdk`, `apify-client`  
- **Data Flow & UX:** SWR, React Hot Toast, React Markdown  
- **Ecosystem Tooling:** ESlint, Tailwind PostCSS, Autoprefixer  

## 🛠️ Deployment Protocol

1. **Repository Initialization**
   ```bash
   git clone <repository-url>
   cd brand-research
   ```

2. **Dependency Injection**
   ```bash
   npm install
   ```

3. **Environment Provisioning**  
   Replicate `.env.example` to `.env.local` and provision credentials for OpenAI, Anthropic, Supabase, etc.

4. **Local Node Activation**
   ```bash
   npm run dev
   ```

5. **System Interface Engagement**  
   Navigate to: [http://localhost:3000](http://localhost:3000)

## 📁 System Taxonomy

- `app/` — Next.js composable interface modules & API routes  
- `lib/` — Domain-specific utilities, prompt engineering templates  
- `public/` — Static resources and marketing assets  
- `README.md` — Meta-documentation for onboarding and comprehension

## 🖼️ Visual Intelligence (Pending)

_Screenshots and interface demonstrations to be appended upon visual stabilization._

## 📜 License

Released under the MIT License — permissive and enterprise-ready.