import {
	AsyncLifecycle,
	Lifecycle,
	type AsyncCleanup,
	type AsyncDestroyable,
	type Cleanup,
	type Destroyable,
	type EventListener,
} from "../src/index.js";

type Events = {
	ready: void;
	change: {
		from: number;
		to: number;
	};
	message: string;
};

type ChildEvents = {
	close: void;
};

const lifecycle = new Lifecycle<Events>();

const cleanup: Cleanup = lifecycle.defer(() => { });
const child: Lifecycle<ChildEvents> = lifecycle.child<ChildEvents>();
const disposable: Disposable = lifecycle;

const resource = lifecycle.own({
	name: "resource",
	destroy(): void { },
});

const destroyable: Destroyable = resource;
const name: string = resource.name;

const offChange: Cleanup = lifecycle.on("change", (change) => {
	const from: number = change.from;
	const to: number = change.to;

	void from;
	void to;
});

const readyListener: EventListener<void> = () => { };
const offReady: Cleanup = lifecycle.once("ready", readyListener);

lifecycle.emit("ready");
lifecycle.emit("message", "hello");
lifecycle.emit("change", {
	from: 1,
	to: 2,
});
lifecycle.clear("change");
lifecycle.clear();
child.emit("close");

// @ts-expect-error unknown event
lifecycle.emit("missing");
// @ts-expect-error payload is required
lifecycle.emit("message");
// @ts-expect-error void events do not accept a payload
lifecycle.emit("ready", undefined);
// @ts-expect-error wrong payload
lifecycle.emit("message", 123);
// @ts-expect-error unknown event
lifecycle.on("missing", () => { });
// @ts-expect-error async listeners would be silently ignored by synchronous emit
lifecycle.on("ready", async () => { });
// @ts-expect-error async cleanup belongs to AsyncLifecycle
lifecycle.defer(async () => { });
// @ts-expect-error async resources belong to AsyncLifecycle
lifecycle.own({
	async destroy(): Promise<void> { },
});

const asyncLifecycle = new AsyncLifecycle<Events>();
const asyncDisposable: AsyncDisposable = asyncLifecycle;
const asyncCleanup: AsyncCleanup = asyncLifecycle.defer(async () => { });

const asyncResource = asyncLifecycle.own({
	name: "async resource",
	async destroy(): Promise<void> { },
});

const asyncDestroyable: AsyncDestroyable = asyncResource;

asyncLifecycle.on("ready", () => { });
asyncLifecycle.emit("ready");

// Events remain synchronous even on AsyncLifecycle.
// @ts-expect-error async event listeners are not awaited
asyncLifecycle.on("ready", async () => { });

void cleanup;
void child;
void disposable;
void destroyable;
void name;
void offChange;
void offReady;
void asyncDisposable;
void asyncCleanup;
void asyncDestroyable;

export function usingLifecycle(): void {
	using scope = new Lifecycle();

	scope.defer(() => { });
}

export async function usingAsyncLifecycle(): Promise<void> {
	await using scope = new AsyncLifecycle();

	scope.defer(async () => {
		await Promise.resolve();
	});
}
