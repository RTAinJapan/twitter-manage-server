import fastify from "fastify";
import { z } from "zod";
import { createSession, getSession } from "./session-manager";
import { env } from "./env";
import { createReadStream } from "fs";

const server = fastify();

server.get("/", () => {
	return { ok: true };
});

await server.register(async (server) => {
	server.addHook("onRequest", async (request, reply) => {
		const authHeader = request.headers.authorization;
		if (authHeader !== env.AUTHORIZATION) {
			reply.code(403).send("unauthorized");
		}
	});

	server.get("/initialization-error.png", async (_, reply) => {
		const file = createReadStream("/tmp/initialization-error.png");
		reply.type("image/png").send(file);
	});

	server.get("/initialization-error.txt", async (_, reply) => {
		const file = createReadStream("/tmp/initialization-error.txt");
		reply.type("text/plain").send(file);
	});

	server.post("/create-session", async (request) => {
		const schema = z.object({
			username: z.string().min(1),
			password: z.string().min(1),
			email: z.string().email(),
		});
		const body = schema.parse(request.body);
		const { id, status } = await createSession(body);
		return { id, status };
	});

	server.post("/get-status", async (request, reply) => {
		const schema = z.object({ sessionId: z.string().min(1) });
		const body = schema.parse(request.body);
		const session = getSession(body.sessionId);
		if (!session) {
			return reply.code(404).send("session not found");
		}
		return { status: session.status };
	});

	server.post("/input-confirmation-code", async (request, reply) => {
		const schema = z.object({
			sessionId: z.string().min(1),
			code: z.string().min(1),
		});
		const body = schema.parse(request.body);
		const session = getSession(body.sessionId);
		if (!session) {
			return reply.code(404).send("session not found");
		}
		await session.inputConfirmationCode(body.code);
	});

	server.post("/tweet", async (request, reply) => {
		const schema = z.object({
			sessionId: z.string().min(1),
			text: z.string().min(1),
			files: z.array(z.string().base64()),
		});
		const body = schema.parse(request.body);
		const session = getSession(body.sessionId);
		if (!session) {
			return reply.code(404).send("session not found");
		}
		await session.tweet(body.text, body.files);
	});

	server.post("/delete-tweet", async (request, reply) => {
		const schema = z.object({
			sessionId: z.string().min(1),
			tweetId: z.string().min(1),
		});
		const body = schema.parse(request.body);
		const session = getSession(body.sessionId);
		if (!session) {
			return reply.code(404).send("session not found");
		}
		await session.deleteTweet(body.tweetId);
	});

	server.post("/reply", async (request, reply) => {
		const schema = z.object({
			sessionId: z.string().min(1),
			tweetId: z.string().min(1),
			text: z.string().min(1),
			files: z.array(z.string().base64()),
		});
		const body = schema.parse(request.body);
		const session = getSession(body.sessionId);
		if (!session) {
			return reply.code(404).send("session not found");
		}
		await session.reply(body.tweetId, body.text, body.files);
	});

	server.post("/get-tweets", async (request, reply) => {
		const schema = z.object({
			sessionId: z.string().min(1),
		});
		const body = schema.parse(request.body);
		const session = getSession(body.sessionId);
		if (!session) {
			return reply.code(404).send("session not found");
		}
		const tweets = await session.getTweets();
		return tweets;
	});

	server.post("/close-session", async (request, reply) => {
		const schema = z.object({ sessionId: z.string().min(1) });
		const body = schema.parse(request.body);
		const session = getSession(body.sessionId);
		if (!session) {
			return reply.code(404).send("session not found");
		}
		await session.close();
	});
});

try {
	const address = await server.listen({ host: "0.0.0.0", port: 3000 });
	console.log(`server listening at ${address}`);
} catch (error) {
	console.error(error);
	process.exit(1);
}
