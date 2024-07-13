import fastify from "fastify";

const server = fastify();

server.get("/", () => {
	return { ok: true };
});

let count = 0;
server.get('/counter', () => {
	count += 1;
	return { count };
})
try {
	await server.listen({ host: "0.0.0.0", port: 3000 });
} catch (error) {
	console.error(error);
	process.exit(1);
}
