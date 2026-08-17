import {
	describe,
	expect,
	it,
	vi,
} from "vitest";

import { Lifecycle } from "../src/index.js";

describe("Lifecycle", () => {
	it("starts active and becomes destroyed", () => {
		const lifecycle = new Lifecycle();

		expect(lifecycle.destroyed).toBe(false);

		lifecycle.destroy();

		expect(lifecycle.destroyed).toBe(true);
	});

	it("runs cleanups in reverse order exactly once", () => {
		const lifecycle = new Lifecycle();
		const calls: string[] = [];

		lifecycle.defer(() => {
			calls.push("first");
		});

		lifecycle.defer(() => {
			calls.push("second");
		});

		lifecycle.destroy();
		lifecycle.destroy();

		expect(calls).toEqual([
			"second",
			"first",
		]);
	});

	it("allows a cleanup to run early", () => {
		const lifecycle = new Lifecycle();
		let calls = 0;

		const cleanup = lifecycle.defer(() => {
			calls++;
		});

		cleanup();
		cleanup();
		lifecycle.destroy();

		expect(calls).toBe(1);
	});

	it("registers the same cleanup function independently", () => {
		const lifecycle = new Lifecycle();
		let calls = 0;

		const cleanup = (): void => {
			calls++;
		};

		lifecycle.defer(cleanup);
		lifecycle.defer(cleanup);
		lifecycle.destroy();

		expect(calls).toBe(2);
	});

	it("immediately runs cleanups deferred after destruction", () => {
		const lifecycle = new Lifecycle();
		let calls = 0;

		lifecycle.destroy();

		const cleanup = lifecycle.defer(() => {
			calls++;
		});

		cleanup();

		expect(calls).toBe(1);
	});

	it("propagates errors from cleanups deferred after destruction", () => {
		const lifecycle = new Lifecycle();
		const failure = new Error("late cleanup failed");

		lifecycle.destroy();

		expect(() => {
			lifecycle.defer(() => {
				throw failure;
			});
		}).toThrow(failure);
	});

	it("immediately runs cleanups deferred during destruction", () => {
		const lifecycle = new Lifecycle();
		const calls: string[] = [];

		lifecycle.defer(() => {
			calls.push("outer");

			lifecycle.defer(() => {
				calls.push("inner");
			});
		});

		lifecycle.destroy();

		expect(calls).toEqual([
			"outer",
			"inner",
		]);
	});

	it("is safe to destroy reentrantly", () => {
		const lifecycle = new Lifecycle();
		let calls = 0;

		lifecycle.defer(() => {
			calls++;
			lifecycle.destroy();
		});

		lifecycle.destroy();

		expect(calls).toBe(1);
	});

	it("finishes every cleanup before reporting failures", () => {
		const lifecycle = new Lifecycle();
		const calls: string[] = [];
		const firstError = new Error("first");
		const secondError = new Error("second");

		lifecycle.defer(() => {
			calls.push("first");
			throw firstError;
		});

		lifecycle.defer(() => {
			calls.push("second");
			throw secondError;
		});

		let failure: unknown;

		try {
			lifecycle.destroy();
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
		expect(() => lifecycle.destroy()).not.toThrow();
	});

	it("does not retry an early cleanup that throws", () => {
		const lifecycle = new Lifecycle();
		const failure = new Error("cleanup failed");
		let calls = 0;

		const cleanup = lifecycle.defer(() => {
			calls++;
			throw failure;
		});

		expect(cleanup).toThrow(failure);
		expect(() => lifecycle.destroy()).not.toThrow();
		expect(calls).toBe(1);
	});

	it("owns and destroys resources", () => {
		const lifecycle = new Lifecycle();
		let calls = 0;

		const resource = {
			destroy(): void {
				calls++;
			},
		};

		expect(lifecycle.own(resource)).toBe(resource);

		lifecycle.destroy();
		lifecycle.destroy();

		expect(calls).toBe(1);
	});

	it("destroys resources owned after destruction immediately", () => {
		const lifecycle = new Lifecycle();
		let calls = 0;

		lifecycle.destroy();

		const resource = {
			destroy(): void {
				calls++;
			},
		};

		expect(lifecycle.own(resource)).toBe(resource);
		expect(calls).toBe(1);
	});

	it("propagates errors from resources owned after destruction", () => {
		const lifecycle = new Lifecycle();
		const failure = new Error("resource failed");

		lifecycle.destroy();

		expect(() => {
			lifecycle.own({
				destroy(): void {
					throw failure;
				},
			});
		}).toThrow(failure);
	});

	it("destroys active children with their parent", () => {
		const parent = new Lifecycle();
		const child = parent.child();
		let calls = 0;

		child.defer(() => {
			calls++;
		});

		parent.destroy();

		expect(parent.destroyed).toBe(true);
		expect(child.destroyed).toBe(true);
		expect(calls).toBe(1);
	});

	it("destroying a child does not destroy its parent", () => {
		const parent = new Lifecycle();
		const child = parent.child();

		child.destroy();

		expect(child.destroyed).toBe(true);
		expect(parent.destroyed).toBe(false);
	});

	it("destroys sibling children in reverse creation order", () => {
		const parent = new Lifecycle();
		const calls: string[] = [];
		const first = parent.child();
		const second = parent.child();

		first.defer(() => {
			calls.push("first");
		});

		second.defer(() => {
			calls.push("second");
		});

		parent.destroy();

		expect(calls).toEqual([
			"second",
			"first",
		]);
	});

	it("cascades destruction through descendants", () => {
		const root = new Lifecycle();
		const child = root.child();
		const grandchild = child.child();
		let calls = 0;

		grandchild.defer(() => {
			calls++;
		});

		root.destroy();

		expect(root.destroyed).toBe(true);
		expect(child.destroyed).toBe(true);
		expect(grandchild.destroyed).toBe(true);
		expect(calls).toBe(1);
	});

	it("creates already-destroyed children after destruction", () => {
		const parent = new Lifecycle();

		parent.destroy();

		const child = parent.child();

		expect(child.destroyed).toBe(true);
	});

	it("does not revisit a child destroyed by an earlier parent cleanup", () => {
		const parent = new Lifecycle();
		const child = parent.child();
		let calls = 0;

		child.defer(() => {
			calls++;
		});

		parent.defer(() => {
			child.destroy();
		});

		parent.destroy();

		expect(calls).toBe(1);
	});

	it("continues parent teardown when a child fails", () => {
		const parent = new Lifecycle();
		const calls: string[] = [];
		const child = parent.child();
		const childError = new Error("child failed");

		parent.defer(() => {
			calls.push("parent");
		});

		child.defer(() => {
			calls.push("child");
			throw childError;
		});

		let failure: unknown;

		try {
			parent.destroy();
		} catch (error) {
			failure = error;
		}

		expect(calls).toEqual([
			"parent",
			"child",
		]);
		expect(failure).toBeInstanceOf(AggregateError);

		if (!(failure instanceof AggregateError)) {
			throw new Error("Expected an AggregateError.");
		}

		expect(failure.errors).toHaveLength(1);
		expect(failure.errors[ 0 ]).toBeInstanceOf(AggregateError);

		const childFailure = failure.errors[ 0 ];

		if (!(childFailure instanceof AggregateError)) {
			throw new Error("Expected a child AggregateError.");
		}

		expect(childFailure.errors).toEqual([
			childError,
		]);
	});

	it("supports explicit resource management through Symbol.dispose", () => {
		const lifecycle = new Lifecycle();
		let calls = 0;

		lifecycle.defer(() => {
			calls++;
		});

		lifecycle[ Symbol.dispose ]();
		lifecycle[ Symbol.dispose ]();

		expect(lifecycle.destroyed).toBe(true);
		expect(calls).toBe(1);
	});
});

describe("AbortSignal", () => {
	it("destroys when the signal aborts", () => {
		const controller = new AbortController();

		const lifecycle = new Lifecycle({
			signal: controller.signal,
		});

		let cleanups = 0;

		lifecycle.defer(() => {
			cleanups++;
		});

		expect(lifecycle.destroyed).toBe(false);

		controller.abort();

		expect(lifecycle.destroyed).toBe(true);
		expect(cleanups).toBe(1);
	});

	it("is immediately destroyed when given an already-aborted signal", () => {
		const controller = new AbortController();

		controller.abort();

		const lifecycle = new Lifecycle({
			signal: controller.signal,
		});

		expect(lifecycle.destroyed).toBe(true);
	});

	it("runs later registrations immediately when constructed with an aborted signal", () => {
		const controller = new AbortController();

		controller.abort();

		const lifecycle = new Lifecycle({
			signal: controller.signal,
		});

		let cleanups = 0;

		lifecycle.defer(() => {
			cleanups++;
		});

		expect(cleanups).toBe(1);
	});

	it("does not destroy twice if manually destroyed before abort", () => {
		const controller = new AbortController();

		const lifecycle = new Lifecycle({
			signal: controller.signal,
		});

		let cleanups = 0;

		lifecycle.defer(() => {
			cleanups++;
		});

		lifecycle.destroy();

		expect(cleanups).toBe(1);

		controller.abort();

		expect(cleanups).toBe(1);
	});

	it("removes the abort listener when destroyed", () => {
		const controller = new AbortController();

		const removeEventListener = vi.spyOn(
			controller.signal,
			"removeEventListener",
		);

		const lifecycle = new Lifecycle({
			signal: controller.signal,
		});

		lifecycle.destroy();

		expect(removeEventListener).toHaveBeenCalledWith(
			"abort",
			expect.any(Function),
		);
	});

	it("still performs destruction exactly once when abort is repeated", () => {
		const controller = new AbortController();

		const lifecycle = new Lifecycle({
			signal: controller.signal,
		});

		let cleanups = 0;

		lifecycle.defer(() => {
			cleanups++;
		});

		controller.abort();
		controller.abort();

		expect(cleanups).toBe(1);
		expect(lifecycle.destroyed).toBe(true);
	});
});