# SpeakEase Production Deployment Environment Configuration

This document lists the required and optional server-side and client-side environment variables needed for deploying SpeakEase (e.g., on Vercel, Google Cloud Run, AWS, or Docker).

> **IMPORTANT SECURITY NOTE**: Never commit actual API keys or secrets to source control. Set these values in your hosting provider's secure Environment Variables dashboard.

---

## 1. Multi-AI Processing Pipeline (Server-Side Secrets)

These secrets are strictly processed by backend server routines (`server.ts`, `src/services/ai/*`) and are **never** exposed to the client bundle.

| Variable Name | Required / Optional | Description |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | **Required** | Google Gemini API key for deep speech reasoning, clinical observations, and personalized practice recommendations. |
| `GNANI_API_KEY` | **Optional** (Has Fallback) | Gnani.ai ASR Voice-to-Text API key. If absent, the pipeline automatically falls back to Gemini speech transcription. |
| `GROQ_API_KEY` | **Optional** (Has Fallback) | Groq API key for fast language processing and transcript structuring. If absent, the pipeline uses a local deterministic parsing fallback. |
| `GNANI_API_ENDPOINT`| **Optional** | Custom Gnani ASR endpoint (defaults to `https://asr.gnani.ai/v1/recognize`). |

---

## 2. Database & Corsair Integration (Server-Side)

| Variable Name | Required / Optional | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | **Required** | PostgreSQL connection URI for Supabase transaction pooler or direct database connection. |
| `CORSAIR_API_KEY` | **Required for SLP Assistant** | Corsair MCP platform API key for clinician assistant tools. |
| `CORSAIR_SIGNING_SECRET` | **Required for SLP Assistant** | Webhook / request signing secret for Corsair integrations. |
| `CORSAIR_KEK` | **Required for SLP Assistant** | Key Encryption Key for Corsair account storage. |

---

## 3. Supabase Frontend Authentication (Client-Side)

These public identifiers are used by the Supabase JavaScript client in the browser.

| Variable Name | Required / Optional | Description |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | **Required** | Your Supabase project URL (e.g., `https://xyzcompany.supabase.co`). |
| `VITE_SUPABASE_ANON_KEY` | **Required** | Your Supabase project public anonymous key (browser safe with RLS). |

---

## 4. Multi-AI Pipeline Architecture Summary

```
PATIENT VOICE RECORDING
          ↓
      GNANI.AI
  (Voice → Text)
          ↓
        GROQ
 (Fast Processing)
          ↓
       GEMINI
 (Deep Reasoning)
          ↓
      SUPABASE
 (Source of Truth)
          ↓
  PATIENT & SLP DASHBOARDS
```

* **Graceful Fallbacks**: If any 3rd-party provider key (`GNANI_API_KEY`, `GROQ_API_KEY`) is omitted or temporarily unreachable, the built-in fallback engine ensures seamless patient practice without errors.
