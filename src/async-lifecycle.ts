import { Eventful } from "./eventful.js";
import type {
	AsyncCleanup,
	AsyncDestroyable,
	Cleanup,
	NoEvents,
} from "./types.js";

type AsyncCleanupEntry = {
	cleanup: AsyncCleanup;
	active: boolean;
};


/**
 * Asynchronous counterpart to Lifecycle.
 *
 * Cleanup work is awaited sequentially in reverse registration order. Event
 * dispatch remains synchronous and follows the same rules as Lifecycle.
 */
export class AsyncLifecycle<
	// Using `NoEvents` here to allow using `AsyncLifecycle`
	// without handling events.
	TEvents extends object = NoEvents,
> extends Eventful<TEvents> implements AsyncDestroyable, AsyncDisposable {
	readonly #cleanups = new Set<AsyncCleanupEntry>();

	#destroyed = false;
	#destroyPromise: Promise<void> | undefined;
	#detachParent: Cleanup | undefined;

	/**
	 * Whether this lifecycle has been destroyed.
	 */
	get destroyed(): boolean {
		return this.#destroyed;
	}

	/**
	 * Registers sync or async cleanup work and returns an exactly-once cleanup
	 * function. Registration after destruction is rejected because asynchronous
	 * cleanup cannot be completed synchronously at registration time.
	 * 
	 * @example
	 * ```ts
	 * lifecycle.defer(async () => {
	 *   await someAsyncOperation();
	 * });
	 * ```
	 */
	defer(cleanup: AsyncCleanup): AsyncCleanup {
		this.#assertActive("defer cleanup");

		const entry = this.#register(cleanup);

		return async () => {
			await this.#run(entry);
		};
	}

	/**
	 * Owns a resource whose destroy() may be synchronous or asynchronous.
	 */
	own<TResource extends AsyncDestroyable>(resource: TResource): TResource {
		this.#assertActive("own a resource");

		this.defer(() => resource.destroy());

		return resource;
	}

	/**
	 * Creates an independently typed asynchronous child lifecycle.
	 */
	child<
		TChildEvents extends object = NoEvents,
	>(): AsyncLifecycle<TChildEvents> {
		this.#assertActive("create a child lifecycle");

		const child = new AsyncLifecycle<TChildEvents>();
		const entry = this.#register(() => child.destroy());

		child.#detachParent = () => {
			this.#detach(entry);
		};

		return child;
	}

	/**
	 * Ends this lifetime exactly once and resolves after all active cleanup work
	 * has settled. Concurrent destroy() calls receive the same promise.
	 */
	destroy(): Promise<void> {
		if (this.#destroyPromise) return this.#destroyPromise;

		this.#destroyed = true;

		this.#detachParent?.();
		this.#detachParent = undefined;

		this.clearListeners();

		const cleanups = [
			...this.#cleanups,
		].reverse();

		this.#cleanups.clear();

		this.#destroyPromise = this.#destroyAll(cleanups);

		return this.#destroyPromise;
	}

	[ Symbol.asyncDispose ](): Promise<void> {
		return this.destroy();
	}

	#register(cleanup: AsyncCleanup): AsyncCleanupEntry {
		const entry: AsyncCleanupEntry = {
			cleanup,
			active: true,
		};

		this.#cleanups.add(entry);

		return entry;
	}

	async #run(entry: AsyncCleanupEntry): Promise<void> {
		if (!entry.active) return;

		entry.active = false;
		this.#cleanups.delete(entry);

		await entry.cleanup();
	}

	#detach(entry: AsyncCleanupEntry): void {
		if (!entry.active) return;

		entry.active = false;
		this.#cleanups.delete(entry);
	}

	async #destroyAll(cleanups: AsyncCleanupEntry[]): Promise<void> {
		const errors: unknown[] = [];

		for (const cleanup of cleanups) {
			try {
				await this.#run(cleanup);
			} catch (error) {
				errors.push(error);
			}
		}

		if (errors.length) {
			throw new AggregateError(
				errors,
				"Errors occurred while destroying an async lifecycle.",
			);
		}
	}

	#assertActive(action: string): void {
		if (!this.#destroyed) return;

		throw new Error(`Cannot ${action} on a destroyed async lifecycle.`);
	}
}
