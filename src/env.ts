import { z } from "zod";

const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	PUPPETEER_HEADLESS: z.coerce.boolean().default(false),
	AUTHORIZATION: z.string().min(1),
});

export const env = envSchema.parse(process.env);
