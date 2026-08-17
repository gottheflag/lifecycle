import { Eventful } from "./eventful.js";
import { throwCollectedErrors } from "./errors.js";
import type {
	Cleanup,
	Destroyable,
	LifecycleOptions,
	NoEvents,
	RejectPromiseReturn,
	SyncDestroyable,
} from "./types.js";

type CleanupEntry = {
	cleanup: Cleanup;
	active: boolean;
};

const doNothing: Cleanup = () => {};

/**
 * Owns everything that exists for one synchronous lifetime: cleanup work,
 * destroyable resources, child lifecycles, and event listeners.
 */
export class Lifecycle<
	TEvents extends object = NoEvents,
> extends Eventful<TEvents> implements Destroyable {
	readonly #cleanups = new Set<CleanupEntry>();

	#destroyed = false;
	#detachParent: Cleanup | undefined;

	constructor(options: LifecycleOptions = {}) {
		super();
		
		const { signal } = options;

		if (!signal) {
			return;
		}

		// The lifetime is already over before we even started.
		if (signal.aborted) {
			this.destroy();
			return;
		}

		const onAbort = (): void => {
			this.destroy();
		};

		signal.addEventListener(
			"abort",
			onAbort,
			{ once: true },
		);

		// If Lifecycle dies normally before the signal aborts,
		// stop listening to the signal.
		this.defer(() => {
			signal.removeEventListener(
				"abort",
				onAbort,
			);
		});
	}

	get destroyed(): boolean {
		return this.#destroyed;
	}

	/**
	 * Registers cleanup work and returns an exactly-once function that can run
	 * it early. Async cleanup functions are intentionally rejected; use
	 * AsyncLifecycle for asynchronous teardown.
	 */
	defer<TCleanup extends Cleanup>(
		cleanup: TCleanup & RejectPromiseReturn<TCleanup>,
	): Cleanup {
		if (this.#destroyed) {
			cleanup();

			return doNothing;
		}

		const entry = this.#register(cleanup);

		return () => {
			this.#run(entry);
		};
	}

	/**
	 * Owns a synchronous resource and returns it unchanged.
	 */
	own<TResource extends Destroyable>(
		resource: SyncDestroyable<TResource>,
	): TResource {
		this.defer(() => {
			resource.destroy();
		});

		return resource;
	}

	/**
	 * Creates an independently typed child lifecycle owned by this lifecycle.
	 * Event types never inherit or bubble implicitly.
	 */
	child<
		TChildEvents extends object = NoEvents,
	>(): Lifecycle<TChildEvents> {
		const child = new Lifecycle<TChildEvents>();

		if (this.#destroyed) {
			child.destroy();

			return child;
		}

		const entry = this.#register(() => {
			child.destroy();
		});

		child.#detachParent = () => {
			this.#detach(entry);
		};

		return child;
	}

	/**
	 * Ends this lifetime exactly once.
	 *
	 * Event delivery stops immediately. Remaining cleanups then run in reverse
	 * registration order. Every cleanup is attempted even when another fails.
	 */
	destroy(): void {
		if (this.#destroyed) return;

		this.#destroyed = true;

		this.#detachParent?.();
		this.#detachParent = undefined;

		this.clearListeners();

		const cleanups = [
			...this.#cleanups,
		].reverse();

		this.#cleanups.clear();

		const errors: unknown[] = [];

		for (const cleanup of cleanups) {
			try {
				this.#run(cleanup);
			} catch (error) {
				errors.push(error);
			}
		}

		throwCollectedErrors(
			errors,
			"Errors occurred while destroying a lifecycle.",
		);
	}

	[Symbol.dispose](): void {
		this.destroy();
	}

	#register(cleanup: Cleanup): CleanupEntry {
		const entry: CleanupEntry = {
			cleanup,
			active: true,
		};

		this.#cleanups.add(entry);

		return entry;
	}

	#run(entry: CleanupEntry): void {
		if (!entry.active) return;

		entry.active = false;
		this.#cleanups.delete(entry);
		entry.cleanup();
	}

	#detach(entry: CleanupEntry): void {
		if (!entry.active) return;

		entry.active = false;
		this.#cleanups.delete(entry);
	}
}
