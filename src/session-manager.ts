import { TwitterSession, type TwitterManageOptions } from "./twitter-session";

const sessions = new Map<string, TwitterSession>();

export const createSession = async (options: TwitterManageOptions) => {
	const twitterSession = new TwitterSession(options);
	const { status } = await twitterSession.initialize();
	while (true) {
		const id = crypto.randomUUID();
		if (!sessions.has(id)) {
			sessions.set(id, twitterSession);
			return { id, status };
		}
	}
};

export const getSession = (id: string) => {
	return sessions.get(id);
};

export const closeSession = (id: string) => {
	const session = sessions.get(id);
	if (session) {
		session.close();
		sessions.delete(id);
	}
};
