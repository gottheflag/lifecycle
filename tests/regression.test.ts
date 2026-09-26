import {
	describe,
	expect,
	it,
} from "vitest";

import {
	AsyncLifecycle,
	Lifecycle,
} from "../src/index.js";

type Events = {
	ready: void;
};

describe("regressions", () => {
	it("returns the same promise for reentrant async destruction and waits for full teardown", async () => {
		const lifecycle = new AsyncLifecycle();
		let releaseSlow: (() => void) | undefined;
		let slowFinished = false;
		let reentrantPromise: Promise<void> | undefined;

		const slowGate = new Promise<void>((resolve) => {
			releaseSlow = resolve;
		});

		// Registered first, so it runs second under LIFO teardown.
		lifecycle.defer(async () => {
			await slowGate;
			slowFinished = true;
		});

		// Registered second, so this synchronous cleanup runs first and reenters.
		lifecycle.defer(() => {
			reentrantPromise = lifecycle.destroy();
		});

		const outerPromise = lifecycle.destroy();

		// Let destruction cross its initial boundary and execute the reentrant
		// cleanup while the slow sibling remains blocked.
		await Promise.resolve();
		await Promise.resolve();

		expect(reentrantPromise).toBe(outerPromise);
		expect(slowFinished).toBe(false);

		if (!reentrantPromise || !releaseSlow) {
			throw new Error("Expected reentrant destruction to have started.");
		}

		let reentrantSettled = false;
		const observedReentrant = reentrantPromise.then(() => {
			reentrantSettled = true;
		});

		await Promise.resolve();
		expect(reentrantSettled).toBe(false);

		releaseSlow();
		await observedReentrant;

		expect(slowFinished).toBe(true);
	});

	it("defers a once listener added during emission until the next emission", () => {
		const lifecycle = new Lifecycle<Events>();
		const calls: string[] = [];
		let registered = false;

		lifecycle.on("ready", () => {
			calls.push("regular");

			if (!registered) {
				registered = true;
				lifecycle.once("ready", () => {
					calls.push("late-once");
				});
			}
		});

		lifecycle.emit("ready");
		expect(calls).toEqual([ "regular" ]);

		lifecycle.emit("ready");
		expect(calls).toEqual([
			"regular",
			"regular",
			"late-once",
		]);

		lifecycle.emit("ready");
		expect(calls).toEqual([
			"regular",
			"regular",
			"late-once",
			"regular",
		]);
	});

	it("does not retain or re-destroy individually destroyed children under stress", () => {
		const parent = new Lifecycle();
		let childCleanups = 0;

		for (let index = 0; index < 10_000; index++) {
			const child = parent.child();

			child.defer(() => {
				childCleanups++;
			});

			child.destroy();
		}

		expect(childCleanups).toBe(10_000);

		parent.destroy();

		// If self-destroyed children were still retained by the parent, their
		// cleanup would be revisited here.
		expect(childCleanups).toBe(10_000);
	});
});
