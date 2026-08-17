import {
	describe,
	expect,
	it,
} from "vitest";

import { AsyncLifecycle } from "../src/index.js";

type Events = {
	ready: void;
	change: number;
};

describe("AsyncLifecycle", () => {
	it("starts active and becomes destroyed as destruction begins", async () => {
		const lifecycle = new AsyncLifecycle();

		expect(lifecycle.destroyed).toBe(false);

		const destroying = lifecycle.destroy();

		expect(lifecycle.destroyed).toBe(true);

		await destroying;
	});

	it("runs async cleanups sequentially in reverse order exactly once", async () => {
		const lifecycle = new AsyncLifecycle();
		const calls: string[] = [];

		lifecycle.defer(async () => {
			calls.push("first:start");
			await Promise.resolve();
			calls.push("first:end");
		});

		lifecycle.defer(async () => {
			calls.push("second:start");
			await Promise.resolve();
			calls.push("second:end");
		});

		await lifecycle.destroy();
		await lifecycle.destroy();

		expect(calls).toEqual([
			"second:start",
			"second:end",
			"first:start",
			"first:end",
		]);
	});

	it("returns the same promise for concurrent destruction", () => {
		const lifecycle = new AsyncLifecycle();

		const first = lifecycle.destroy();
		const second = lifecycle.destroy();

		expect(second).toBe(first);

		return first;
	});

	it("allows async cleanup to run early exactly once", async () => {
		const lifecycle = new AsyncLifecycle();
		let calls = 0;

		const cleanup = lifecycle.defer(async () => {
			calls++;
			await Promise.resolve();
		});

		await cleanup();
		await cleanup();
		await lifecycle.destroy();

		expect(calls).toBe(1);
	});

	it("owns and awaits asynchronous resources", async () => {
		const lifecycle = new AsyncLifecycle();
		const calls: string[] = [];

		const resource = {
			async destroy(): Promise<void> {
				calls.push("start");
				await Promise.resolve();
				calls.push("end");
			},
		};

		expect(lifecycle.own(resource)).toBe(resource);

		await lifecycle.destroy();

		expect(calls).toEqual([
			"start",
			"end",
		]);
	});

	it("can own synchronous resources too", async () => {
		const lifecycle = new AsyncLifecycle();
		let calls = 0;

		lifecycle.own({
			destroy(): void {
				calls++;
			},
		});

		await lifecycle.destroy();

		expect(calls).toBe(1);
	});

	it("destroys active children with their parent", async () => {
		const parent = new AsyncLifecycle();
		const child = parent.child();
		let calls = 0;

		child.defer(async () => {
			await Promise.resolve();
			calls++;
		});

		await parent.destroy();

		expect(parent.destroyed).toBe(true);
		expect(child.destroyed).toBe(true);
		expect(calls).toBe(1);
	});

	it("allows a child to destroy and detach independently", async () => {
		const parent = new AsyncLifecycle();
		const child = parent.child();
		let calls = 0;

		child.defer(() => {
			calls++;
		});

		await child.destroy();
		await parent.destroy();

		expect(calls).toBe(1);
	});

	it("attempts every cleanup before reporting failures", async () => {
		const lifecycle = new AsyncLifecycle();
		const calls: string[] = [];
		const firstError = new Error("first");
		const secondError = new Error("second");

		lifecycle.defer(async () => {
			calls.push("first");
			throw firstError;
		});

		lifecycle.defer(async () => {
			calls.push("second");
			throw secondError;
		});

		let failure: unknown;

		try {
			await lifecycle.destroy();
		} catch (error) {
			failure = error;
		}

		expect(calls).toEqual([
			"second",
			"first",
		]);
		expect(failure).toBeInstanceOf(AggregateError);

		if (!(failure instanceof AggregateError)) {
			throw new Error("Expected an AggregateError.");
		}

		expect(failure.errors).toEqual([
			secondError,
			firstError,
		]);
	});

	it("preserves nested child failure boundaries", async () => {
		const parent = new AsyncLifecycle();
		const child = parent.child();
		const childError = new Error("child");

		child.defer(async () => {
			throw childError;
		});

		let failure: unknown;

		try {
			await parent.destroy();
		} catch (error) {
			failure = error;
		}

		expect(failure).toBeInstanceOf(AggregateError);

		if (!(failure instanceof AggregateError)) {
			throw new Error("Expected a parent AggregateError.");
		}

		const childFailure = failure.errors[0];
		expect(childFailure).toBeInstanceOf(AggregateError);

		if (!(childFailure instanceof AggregateError)) {
			throw new Error("Expected a child AggregateError.");
		}

		expect(childFailure.errors).toEqual([
			childError,
		]);
	});

	it("supports typed synchronous events", async () => {
		const lifecycle = new AsyncLifecycle<Events>();
		const calls: number[] = [];

		lifecycle.on("change", (value) => {
			calls.push(value);
		});

		lifecycle.emit("change", 42);
		await lifecycle.destroy();
		lifecycle.emit("change", 43);

		expect(calls).toEqual([
			42,
		]);
	});

	it("rejects new ownership after destruction begins", async () => {
		const lifecycle = new AsyncLifecycle();

		await lifecycle.destroy();

		expect(() => lifecycle.defer(() => {})).toThrow(
			"Cannot defer cleanup on a destroyed async lifecycle.",
		);

		expect(() => lifecycle.own({ destroy(): void {} })).toThrow(
			"Cannot own a resource on a destroyed async lifecycle.",
		);

		expect(() => lifecycle.child()).toThrow(
			"Cannot create a child lifecycle on a destroyed async lifecycle.",
		);
	});

	it("supports explicit async resource management", async () => {
		const lifecycle = new AsyncLifecycle();
		let calls = 0;

		lifecycle.defer(async () => {
			await Promise.resolve();
			calls++;
		});

		await lifecycle[Symbol.asyncDispose]();
		await lifecycle[Symbol.asyncDispose]();

		expect(lifecycle.destroyed).toBe(true);
		expect(calls).toBe(1);
	});
});
