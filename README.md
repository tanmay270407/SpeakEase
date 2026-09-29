# SpeakEase

SpeakEase is a clinical support tool for Speech-Language Pathologists (SLPs) and their patients. It provides a platform for patients to practice speech exercises, record sessions, and receive preliminary AI-driven analysis, while giving SLPs a comprehensive dashboard to monitor progress, review sessions, and manage assignments.

**Important Note:** SpeakEase is an experimental prototype. It is **NOT** a certified medical device. It does not diagnose, treat, or cure any medical conditions. It does not claim HIPAA, GDPR, or other medical compliance certifications.

## Project Overview

SpeakEase solves the problem of disconnected speech therapy practice by bridging the gap between clinical sessions. 

**For Patients:**
- View assigned exercises
- Record practice sessions
- Receive immediate AI-driven speech metrics (wpm, pauses, repetitions)

**For SLPs:**
- Assign exercises to patients
- Review patient practice sessions and AI observations
- Use an AI assistant to query patient data and find exercises
- Automate session review pipelines via Corsair Workflows

## Architecture

- **Frontend:** React 18 with Vite, Tailwind CSS, and shadcn/ui.
- **Backend:** Node.js Express server.
- **Database & Auth:** Supabase (PostgreSQL, Row Level Security, GoTrue Auth).
- **AI Integration:** Google Gemini API (`@google/genai`) for speech analysis and SLP assistant capabilities.
- **Integrations Layer:** Corsair (`corsair` & `@corsair-dev/mcp`) for workflow automation and MCP (Model Context Protocol) tool exposure.

## Local Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment Variables:**
   Copy `.env.example` to `.env` and fill in the required values.

3. **Database Setup:**
   Run the Supabase migrations to initialize the PostgreSQL schema.
   *(Note: In the AI Studio environment, this is managed via `supabase/migrations/`)*

4. **Start Development Server:**
   ```bash
   npm run dev
   ```

5. **Build for Production:**
   ```bash
   npm run build
   ```

## Environment Variables

Refer to `.env.example` for required variables:
- `GEMINI_API_KEY`: Google Gemini API key.
- `VITE_SUPABASE_URL`: Supabase project URL.
- `VITE_SUPABASE_ANON_KEY`: Supabase anonymous public key.
- `CORSAIR_API_KEY`: API key for Corsair integration.
- `CORSAIR_SIGNING_SECRET`: Secret for Corsair webhooks and workflows.

**Security Note:** Never commit `.env` containing real secrets to version control.

## Integrations

### Database Setup
The application uses Supabase. Ensure Row Level Security (RLS) is enabled and migrations are applied to isolate patient data.

### AI Setup
Gemini API is used strictly server-side (`server.ts`). The API key is never exposed to the client.

### Corsair & MCP Setup
Corsair is used for workflow automation. The MCP (Model Context Protocol) server is initialized in `server.ts` to expose database queries as tools to the Gemini AI assistant.

### Workflow Setup
When a patient completes a practice session, a Corsair Workflow (`wf_session_review`) is triggered. 
- If the workflow succeeds, the session is marked for review.
- If it fails or is unconfigured, the system gracefully falls back to local processing and logs the failure in the Workflow Admin dashboard (`/slp/workflows`).

## Development Commands

- `npm run dev`: Starts the Vite dev server and Express backend using `tsx`.
- `npm run build`: Bundles the React frontend and transpiles the Express backend for production.
- `npm run start`: Runs the compiled production server.

## Deployment Instructions

The application is built to run as a single Docker container (e.g., on Cloud Run). 
1. Build the application: `npm run build`
2. Start the server: `npm run start`
3. Ensure all environment variables from `.env.example` are provided to the runtime environment.
4. Ensure port `3000` is exposed.

## Known Limitations

- **Medical Compliance:** Not HIPAA or GDPR certified.
- **Audio Storage:** Audio blobs are currently processed in-memory for analysis but not durably stored due to privacy constraints and implementation limits.
- **Corsair Knowledge Base:** Not implemented as Corsair does not natively support a built-in Knowledge Base service.
