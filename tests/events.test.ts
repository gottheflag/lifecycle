import {
	describe,
	expect,
	it,
} from "vitest";

import { Lifecycle } from "../src/index.js";

type Events = {
	ready: void;
	change: {
		from: number;
		to: number;
	};
	message: string;
};

describe("Lifecycle events", () => {
	it("subscribes and emits typed payload events", () => {
		const lifecycle = new Lifecycle<Events>();
		const calls: Events["change"][] = [];

		lifecycle.on("change", (change) => {
			calls.push(change);
		});

		lifecycle.emit("change", {
			from: 1,
			to: 2,
		});

		expect(calls).toEqual([
			{
				from: 1,
				to: 2,
			},
		]);
	});

	it("supports events without payloads", () => {
		const lifecycle = new Lifecycle<Events>();
		let calls = 0;

		lifecycle.on("ready", () => {
			calls++;
		});

		lifecycle.emit("ready");

		expect(calls).toBe(1);
	});

	it("returns an idempotent off function", () => {
		const lifecycle = new Lifecycle<Events>();
		let calls = 0;

		const off = lifecycle.on("ready", () => {
			calls++;
		});

		lifecycle.emit("ready");
		off();
		off();
		lifecycle.emit("ready");

		expect(calls).toBe(1);
	});

	it("registers duplicate listeners independently", () => {
		const lifecycle = new Lifecycle<Events>();
		let calls = 0;

		const listener = (): void => {
			calls++;
		};

		const offFirst = lifecycle.on("ready", listener);
		lifecycle.on("ready", listener);

		offFirst();
		lifecycle.emit("ready");

		expect(calls).toBe(1);
	});

	it("runs once listeners only once", () => {
		const lifecycle = new Lifecycle<Events>();
		let calls = 0;

		lifecycle.once("ready", () => {
			calls++;
		});

		lifecycle.emit("ready");
		lifecycle.emit("ready");

		expect(calls).toBe(1);
	});

	it("removes once listeners before invoking them", () => {
		const lifecycle = new Lifecycle<Events>();
		let calls = 0;

		lifecycle.once("ready", () => {
			calls++;
			lifecycle.emit("ready");
		});

		lifecycle.emit("ready");

		expect(calls).toBe(1);
	});

	it("allows cancelling a once listener before it fires", () => {
		const lifecycle = new Lifecycle<Events>();
		let calls = 0;

		const off = lifecycle.once("ready", () => {
			calls++;
		});

		off();
		lifecycle.emit("ready");

		expect(calls).toBe(0);
	});

	it("clears one event without touching another", () => {
		const lifecycle = new Lifecycle<Events>();
		const calls: string[] = [];

		lifecycle.on("ready", () => {
			calls.push("ready");
		});

		lifecycle.on("message", () => {
			calls.push("message");
		});

		lifecycle.clear("ready");
		lifecycle.emit("ready");
		lifecycle.emit("message", "hello");

		expect(calls).toEqual([
			"message",
		]);
	});

	it("clears every event listener", () => {
		const lifecycle = new Lifecycle<Events>();
		let calls = 0;

		lifecycle.on("ready", () => {
			calls++;
		});

		lifecycle.on("message", () => {
			calls++;
		});

		lifecycle.clear();
		lifecycle.emit("ready");
		lifecycle.emit("message", "hello");

		expect(calls).toBe(0);
	});

	it("dispatches listeners in registration order", () => {
		const lifecycle = new Lifecycle<Events>();
		const calls: string[] = [];

		lifecycle.on("ready", () => {
			calls.push("first");
		});

		lifecycle.on("ready", () => {
			calls.push("second");
		});

		lifecycle.emit("ready");

		expect(calls).toEqual([
			"first",
			"second",
		]);
	});

	it("does not call listeners added during the current emission", () => {
		const lifecycle = new Lifecycle<Events>();
		const calls: string[] = [];
		let added = false;

		lifecycle.on("ready", () => {
			calls.push("first");

			if (!added) {
				added = true;
				lifecycle.on("ready", () => {
					calls.push("late");
				});
			}
		});

		lifecycle.emit("ready");
		expect(calls).toEqual(["first"]);

		lifecycle.emit("ready");
		expect(calls).toEqual([
			"first",
			"first",
			"late",
		]);
	});

	it("skips a listener removed before its turn", () => {
		const lifecycle = new Lifecycle<Events>();
		const calls: string[] = [];
		let offSecond = (): void => {};

		lifecycle.on("ready", () => {
			calls.push("first");
			offSecond();
		});

		offSecond = lifecycle.on("ready", () => {
			calls.push("second");
		});

		lifecycle.emit("ready");

		expect(calls).toEqual([
			"first",
		]);
	});

	it("stops remaining listeners when the event is cleared during emission", () => {
		const lifecycle = new Lifecycle<Events>();
		const calls: string[] = [];

		lifecycle.on("ready", () => {
			calls.push("first");
			lifecycle.clear("ready");
		});

		lifecycle.on("ready", () => {
			calls.push("second");
		});

		lifecycle.emit("ready");

		expect(calls).toEqual([
			"first",
		]);
	});

	it("attempts every active listener before reporting failures", () => {
		const lifecycle = new Lifecycle<Events>();
		const calls: string[] = [];
		const firstError = new Error("first");
		const secondError = new Error("second");

		lifecycle.on("ready", () => {
			calls.push("first");
			throw firstError;
		});

		lifecycle.on("ready", () => {
			calls.push("second");
			throw secondError;
		});

		let failure: unknown;

		try {
			lifecycle.emit("ready");
		} catch (error) {
			failure = error;
		}

		expect(calls).toEqual([
			"first",
			"second",
		]);
		expect(failure).toBeInstanceOf(AggregateError);

		if (!(failure instanceof AggregateError)) {
			throw new Error("Expected an AggregateError.");
		}

		expect(failure.errors).toEqual([
			firstError,
			secondError,
		]);
	});

	it("once listeners stay removed even if they throw", () => {
		const lifecycle = new Lifecycle<Events>();
		let calls = 0;

		lifecycle.once("ready", () => {
			calls++;
			throw new Error("boom");
		});

		expect(() => lifecycle.emit("ready")).toThrow(AggregateError);
		expect(() => lifecycle.emit("ready")).not.toThrow();
		expect(calls).toBe(1);
	});

	it("clears listeners when the lifecycle is destroyed", () => {
		const lifecycle = new Lifecycle<Events>();
		let calls = 0;

		lifecycle.on("ready", () => {
			calls++;
		});

		lifecycle.destroy();
		lifecycle.emit("ready");

		expect(calls).toBe(0);
	});

	it("does not emit after destruction", () => {
		const lifecycle = new Lifecycle<Events>();
		let calls = 0;

		lifecycle.on("ready", () => {
			calls++;
		});

		lifecycle.destroy();

		expect(() => lifecycle.emit("ready")).not.toThrow();
		expect(calls).toBe(0);
	});

	it("rejects subscriptions after destruction", () => {
		const lifecycle = new Lifecycle<Events>();

		lifecycle.destroy();

		expect(() => {
			lifecycle.on("ready", () => {});
		}).toThrow("Cannot subscribe to a destroyed lifecycle.");

		expect(() => {
			lifecycle.once("ready", () => {});
		}).toThrow("Cannot subscribe to a destroyed lifecycle.");
	});

	it("stops event delivery immediately when destroyed by a listener", () => {
		const lifecycle = new Lifecycle<Events>();
		const calls: string[] = [];

		lifecycle.on("ready", () => {
			calls.push("first");
			lifecycle.destroy();
		});

		lifecycle.on("ready", () => {
			calls.push("second");
		});

		lifecycle.emit("ready");

		expect(calls).toEqual([
			"first",
		]);
		expect(lifecycle.destroyed).toBe(true);
	});

	it("does not bubble events between parent and child lifecycles", () => {
		type ParentEvents = { parent: string };
		type ChildEvents = { child: string };

		const parent = new Lifecycle<ParentEvents>();
		const child = parent.child<ChildEvents>();
		const calls: string[] = [];

		parent.on("parent", (value) => {
			calls.push(`parent:${value}`);
		});

		child.on("child", (value) => {
			calls.push(`child:${value}`);
		});

		child.emit("child", "one");
		parent.emit("parent", "two");

		expect(calls).toEqual([
			"child:one",
			"parent:two",
		]);
	});
});
