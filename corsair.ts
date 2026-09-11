import dotenv from "dotenv";
dotenv.config({ override: true });

import { createCorsair } from 'corsair';
import { Pool } from 'pg';
import { z } from 'zod';

const POOLER_DB_URL = "postgresql://postgres.dbpcjfhrswhphitltpgb:SpeakEase%401234@aws-0-ap-south-1.pooler.supabase.com:6543/postgres";
const rawDbUrl = process.env.DATABASE_URL;
const isPlaceholder = !rawDbUrl || rawDbUrl.includes("YOUR_POSTGRES_URL") || rawDbUrl.includes("[YOUR-PASSWORD]") || rawDbUrl.includes("YOUR-PASSWORD");
const dbUrl = isPlaceholder ? POOLER_DB_URL : rawDbUrl;

// Initialize Postgres connection
const pool = new Pool({ 
  connectionString: dbUrl 
});

export const corsairClient = createCorsair({
  plugins: [
    {
      id: 'clinical',
      endpoints: {
        get_patients: async () => ({ patients: [] }),
        get_sessions: async () => ({ sessions: [] }),
        get_patient_summary: async () => ({ summary: null }),
        get_connection_requests: async () => ({ requests: [], count: 0 }),
        get_exercises_catalog: async () => ({ exercises: [], count: 0 }),
        create_exercise: async () => ({ success: false }),
        assign_exercise: async () => ({ success: false }),
        disable_exercise: async () => ({ success: false })
      },
      endpointMeta: {
        get_patients: { description: "Get a list of active patients assigned to the authenticated SLP. Can filter by practice activity (practiced_today, inactive)." },
        get_sessions: { description: "Get recent patient speech sessions for the SLP's connected patients. Can filter by patient name, review status, or date." },
        get_patient_summary: { description: "Summarize a patient's recent practice sessions, speech fluency metrics, AI observations, and notes." },
        get_connection_requests: { description: "Get incoming or past patient connection requests sent to the authenticated SLP." },
        get_exercises_catalog: { description: "Browse or search exercises in the clinical exercise library." },
        create_exercise: { description: "Create a new exercise routine in the Exercise Library as an AI Draft requiring SLP review." },
        assign_exercise: { description: "Enable/assign an approved exercise for one or all connected patients. Broad actions across all patients require explicit confirmation." },
        disable_exercise: { description: "Disable an exercise for one or all connected patients." }
      },
      endpointSchemas: {
        get_patients: {
          input: z.object({
            filter: z.enum(['all', 'practiced_today', 'inactive']).optional().describe("Filter patients by activity status"),
            search: z.string().optional().describe("Search patient by name")
          }),
          output: z.any()
        },
        get_sessions: { 
          input: z.object({ 
            patient_name: z.string().optional().describe("Filter sessions by patient name"),
            patient_id: z.string().optional().describe("Filter sessions by patient UUID"),
            review_status: z.string().optional().describe("Filter by review status (READY_FOR_REVIEW, NOT_REVIEWED, REVIEWED, or all)"),
            practiced_today: z.boolean().optional().describe("Only return sessions recorded today"),
            limit: z.number().optional().describe("Number of sessions to return (default 10)")
          }), 
          output: z.any() 
        },
        get_patient_summary: {
          input: z.object({
            patient_name: z.string().optional().describe("Name of the patient to summarize"),
            patient_id: z.string().optional().describe("UUID of the patient to summarize")
          }),
          output: z.any()
        },
        get_connection_requests: {
          input: z.object({
            status: z.enum(['pending', 'accepted', 'rejected', 'cancelled', 'all']).optional().describe("Filter requests by status (default: 'pending')"),
            limit: z.number().optional().describe("Maximum number of connection requests to return")
          }),
          output: z.any()
        },
        get_exercises_catalog: {
          input: z.object({
            search: z.string().optional().describe("Search exercise by title or description"),
            category: z.string().optional().describe("Filter by exercise category")
          }),
          output: z.any()
        },
        create_exercise: {
          input: z.object({
            name: z.string().describe("Clear, descriptive title for the exercise"),
            description: z.string().describe("Clinical purpose and therapeutic rationale"),
            instructions: z.string().describe("Step-by-step patient practice instructions"),
            category: z.string().optional().describe("Category, e.g. Phonation & Breath Control, Vocal Tension & Fluency, Motor Coordination"),
            duration: z.number().optional().describe("Estimated exercise duration in seconds (default 60)")
          }),
          output: z.any()
        },
        assign_exercise: {
          input: z.object({
            exercise_name_or_id: z.string().describe("Name or UUID of the exercise from the Exercise Library"),
            patient_name: z.string().optional().describe("Target patient name if assigning to a single patient"),
            target: z.enum(['single', 'all']).optional().describe("Whether to assign to a single patient or all connected patients"),
            confirmed: z.boolean().optional().describe("Set to true only when broad assignment (to all patients) is explicitly confirmed")
          }),
          output: z.any()
        },
        disable_exercise: {
          input: z.object({
            exercise_name_or_id: z.string().describe("Name or UUID of the exercise"),
            patient_name: z.string().optional().describe("Target patient name if disabling for a single patient"),
            target: z.enum(['single', 'all']).optional().describe("Whether to disable for a single patient or all connected patients"),
            confirmed: z.boolean().optional().describe("Set to true only when broad action is explicitly confirmed")
          }),
          output: z.any()
        }
      }
    }
  ],
  database: pool,
  kek: process.env.CORSAIR_KEK!,
  hub: {
    projectApiKey: process.env.CORSAIR_API_KEY!,
    signingSecret: process.env.CORSAIR_SIGNING_SECRET!,
    allowWorkflowExecution: true,
  },
});

(corsairClient as any).corsair = corsairClient;

export const corsair = corsairClient;
export default corsairClient;
