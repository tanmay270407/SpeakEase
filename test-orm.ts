import { createCorsair } from 'corsair';
import { z } from 'zod';
import dotenv from "dotenv";
dotenv.config();

const corsairClient = createCorsair({
  plugins: [],
  kek: process.env.CORSAIR_KEK!,
  database: { query: async () => ({ rows: [] }) } as any,
});

console.log(Object.keys(corsairClient));
