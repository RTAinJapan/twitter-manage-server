import * as puppeteer from "puppeteer";
import { env } from "./env";
import { writeFile } from "fs/promises";

export type TwitterManageOptions = {
	username: string;
	password: string;
	email: string;
};

const tweetTextInputSelector = 'div[data-testid="tweetTextarea_0"]';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class TwitterSession {
	#status: "loggedOut" | "loggedIn" | "waitingForConfirmationCode" =
		"loggedOut";

	get status() {
		return this.#status;
	}
	get username() {
		return this.#options.username;
	}

	#options: TwitterManageOptions;

	constructor(options: TwitterManageOptions) {
		this.#options = options;
	}

	#browser?: puppeteer.Browser;
	#loginPageWaitingForCode?: puppeteer.Page;

	async initialize() {
		const loginPage = await this.#getNewPage("https://x.com/login");

		const usernameInput = await loginPage.waitForSelector(
			'input[autocomplete="username"]',
		);
		if (!usernameInput) {
			throw new Error("no username input");
		}
		await usernameInput.type(this.#options.username);
		await usernameInput.press("Enter");
		console.log("entered username");

		let passwordAttempt = 0;

		const enterPassword = async (abortController: AbortController) => {
			if (passwordAttempt >= 3) {
				throw new Error("too many password attempts");
			}
			passwordAttempt += 1;
			const passwordInput = await loginPage.waitForSelector(
				"input[name=password]",
				{ signal: abortController.signal },
			);
			if (!passwordInput) {
				throw new Error("no password input");
			}
			await passwordInput.type(this.#options.password);
			await passwordInput.press("Enter");
			console.log("entered password");
		};

		const enterEmail = async (abortController: AbortController) => {
			const input = await loginPage.waitForSelector(
				'input[data-testid="ocfEnterTextTextInput"][name="text"][type="text"]',
				{ signal: abortController.signal },
			);
			if (!input) {
				throw new Error("no email input");
			}
			await input.type(this.#options.email);
			await input.press("Enter");
			console.log("entered email");
		};

		const enterConfirmationEmail = async (abortController: AbortController) => {
			const input = await loginPage.waitForSelector(
				'input[data-testid="ocfEnterTextTextInput"][type="email"]',
				{ signal: abortController.signal },
			);
			if (!input) {
				throw new Error("no email input");
			}
			await input.type(this.#options.email);
			await input.press("Enter");
			console.log("entered email confirmation");
		};

		const findConfirmationCodeInput = async (
			abortController: AbortController,
		) => {
			const input = await loginPage.waitForSelector(
				'input[data-testid="ocfEnterTextTextInput"]:not([name="text"]):not([type="text"]):not([type="email"])',
				{ signal: abortController.signal },
			);
			if (!input) {
				throw new Error("no confirmation input");
			}
			console.log("waiting for confirmation code");
			return { status: "waitingForConfirmationCode" } as const;
		};

		const waitForFinish = async (abortController: AbortController) => {
			await loginPage.waitForSelector(tweetTextInputSelector, {
				signal: abortController.signal,
			});
			console.log("logged in");
			return { status: "loggedIn" } as const;
		};

		let attempts = 0;
		while (true) {
			if (attempts >= 6) {
				throw new Error("too many attempts");
			}
			attempts += 1;
			const abortController = new AbortController();
			const result = await Promise.any([
				enterPassword(abortController),
				enterEmail(abortController),
				enterConfirmationEmail(abortController),
				findConfirmationCodeInput(abortController),
				waitForFinish(abortController),
			]).catch(async (error) => {
				await loginPage.screenshot({ path: "/tmp/initialization-error.png" });
				const html = await loginPage.content();
				await writeFile("/tmp/initialization-error.txt", html);
				await this.close();
				throw error;
			});
			abortController.abort();
			if (result) {
				this.#status = result.status;
				if (result.status === "loggedIn") {
					await loginPage.close();
				}
				return result;
			}
		}
	}

	async inputConfirmationCode(code: string) {
		const loginPage = this.#loginPageWaitingForCode;
		if (!loginPage || loginPage.isClosed()) {
			return;
		}

		try {
			const input = await loginPage.$(
				'input[data-testid="ocfEnterTextTextInput"]',
			);
			if (!input) {
				throw new Error("no confirmation input");
			}
			await input.type(code);
			await input.press("Enter");
			await loginPage.waitForSelector(tweetTextInputSelector);
			this.#status = "loggedIn";
			console.log("logged in with confirmation code");
			this.#loginPageWaitingForCode = undefined;
		} finally {
			await loginPage.close();
		}
	}

	async tweet(text: string, files: string[]) {
		const page = await this.#getNewPage("https://x.com/");
		try {
			const input = await page.waitForSelector(tweetTextInputSelector);
			if (!input) {
				throw new Error("No tweet input label");
			}
			await input.click({ count: 3 });
			await input.type(text);

			if (files.length >= 1) {
				const fileInput = await page.waitForSelector("input[type=file]");
				if (!fileInput) {
					throw new Error("No file input");
				}
				await fileInput.uploadFile(...files);
				await page.waitForSelector('div[data-testid="attachments"]');
			}

			page.on("response", async (response) => {
				console.log(await response.json());
			});

			const tweetButton = await page.waitForSelector(
				'button[data-testid="tweetButtonInline"]:not([aria-disabled="true"])',
			);
			if (!tweetButton) {
				throw new Error("No tweet button");
			}
			await tweetButton.click({ count: 2 });
			await page.waitForSelector("div[data-testid=toast]");
		} finally {
			await page.close();
		}
	}

	async deleteTweet(tweetId: string) {
		const page = await this.#getNewPage(
			`https://x.com/${this.#options.username}/status/${tweetId}`,
		);
		try {
			const menu = await page.waitForSelector("button[data-testid=caret]");
			if (!menu) {
				throw new Error("No menu");
			}
			await menu.click();
			await sleep(500);
			const deleteOption = await page.waitForSelector(
				"div[data-testid=Dropdown] > div:nth-child(1)",
			);
			if (!deleteOption) {
				throw new Error("No delete option");
			}
			await deleteOption.click();
			await sleep(500);
			const confirmButton = await page.waitForSelector(
				"button[data-testid=confirmationSheetConfirm]",
			);
			if (!confirmButton) {
				throw new Error("No confirm button");
			}
			await confirmButton.click();
			await sleep(500);
		} finally {
			await page.close();
		}
	}

	async reply(tweetId: string, text: string, files: string[]) {
		const page = await this.#getNewPage(
			`https://x.com/${this.#options.username}/status/${tweetId}`,
		);
		try {
			const replyButton = await page.waitForSelector(
				"button[data-testid=reply]:not([aria-disabled=true])",
			);
			if (!replyButton) {
				throw new Error("No reply button");
			}
			await replyButton.click();
			await sleep(500);

			if (files.length >= 1) {
				const fileInput = await page.waitForSelector("input[type=file]");
				if (!fileInput) {
					throw new Error("No file input");
				}
				await fileInput.uploadFile(...files);
			}

			const label = await page.waitForSelector(tweetTextInputSelector);
			if (!label) {
				throw new Error("No tweet input label");
			}
			await label.click({ count: 3 });
			await label.type(text);
			const tweetButton = await page.waitForSelector(
				'button[data-testid="tweetButton"]:not([aria-disabled="true"])',
			);
			if (!tweetButton) {
				throw new Error("No tweet button");
			}
			await tweetButton.click({ count: 2 });
			await page.waitForSelector("div[data-testid=toast]");
		} finally {
			await page.close();
		}
	}

	async getTweets() {
		const page = await this.#getNewPage(
			`https://x.com/${this.#options.username}`,
		);
		try {
			await page.setViewport({ width: 1280, height: 2000 });
			await page.waitForSelector("article[data-testid=tweet]");
			const tweetElements = await page.$$("article[data-testid=tweet]");
			const tweets = await Promise.all(
				tweetElements.slice(0, 10).map(async (tweetElement) => {
					const textElement = await tweetElement.$(
						"div[data-testid=tweetText]",
					);
					const text = await textElement?.evaluate((el) => el.textContent);
					const timeElement = await tweetElement.waitForSelector("time");
					if (!timeElement) {
						throw new Error("No time element");
					}
					const time = await timeElement.evaluate((el) =>
						el.getAttribute("datetime"),
					);
					if (!time) {
						throw new Error("No time");
					}
					const linkElement = await tweetElement.waitForSelector(
						"a[href*='/status/']",
					);
					if (!linkElement) {
						throw new Error("No link element");
					}
					const link = await linkElement.evaluate((el) =>
						el.getAttribute("href"),
					);
					if (!link) {
						throw new Error("No link");
					}
					const id = link.split("/").pop();
					if (!id) {
						throw new Error("No tweet ID");
					}

					const tweetTime = new Date(time);

					return {
						tweetId: id,
						text: text ?? "",
						tweetedAt: tweetTime,
					};
				}),
			);
			return tweets;
		} finally {
			await page.close();
		}
	}

	async close() {
		if (this.#browser) {
			await this.#browser.close();
		}
	}

	async #getBrowser() {
		if (this.#browser) {
			return this.#browser;
		}

		this.#browser = await puppeteer.launch({
			headless: env.PUPPETEER_HEADLESS,
			args: env.NODE_ENV === "production" ? ["--no-sandbox"] : [],
			defaultViewport: { width: 1920, height: 1080 },
		});

		return this.#browser;
	}

	async #getNewPage(url: string) {
		const browser = await this.#getBrowser();
		const page = await browser.newPage();
		await page.setUserAgent(
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
		);
		await page.goto(url);
		return page;
	}
}
