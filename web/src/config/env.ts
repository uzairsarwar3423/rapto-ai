import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().optional().default("http://localhost:5000"),
  API_URL: z.string().url().optional(),
  NEXT_PUBLIC_PADDLE_ENVIRONMENT: z.string().optional(),
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: z.string().optional(),
});

const parsedEnv = envSchema.safeParse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  API_URL: process.env.API_URL,
  NEXT_PUBLIC_PADDLE_ENVIRONMENT: process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT,
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
});

if (!parsedEnv.success) {
  console.error(
    "❌ Invalid environment variables:",
    parsedEnv.error.flatten().fieldErrors
  );
  throw new Error("Invalid environment variables");
}

export const env = {
  ...parsedEnv.data,
  // Fallback API_URL to NEXT_PUBLIC_API_URL for client-side usage
  API_URL: parsedEnv.data.API_URL || parsedEnv.data.NEXT_PUBLIC_API_URL,
};
