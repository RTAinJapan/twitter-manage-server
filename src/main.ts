import fastify from "fastify";

const server = fastify();

server.get("/", () => {
	return { ok: true };
});

try {
	await server.listen({ host: "0.0.0.0", port: 3000 });
} catch (error) {
	console.error(error);
	process.exit(1);
}
