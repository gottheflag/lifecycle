import { EventStore } from "./event-store.js";
import type {
	Cleanup,
	EventArguments,
	EventListener,
	RejectPromiseReturn,
} from "./types.js";

export abstract class Eventful<TEvents extends object> {
	readonly #events = new EventStore<TEvents>();

	abstract get destroyed(): boolean;

	on<
		TKey extends keyof TEvents,
		TListener extends EventListener<TEvents[TKey]>,
	>(
		type: TKey,
		listener: TListener & RejectPromiseReturn<TListener>,
	): Cleanup {
		this.#assertActive();

		return this.#events.on(type, listener);
	}

	once<
		TKey extends keyof TEvents,
		TListener extends EventListener<TEvents[TKey]>,
	>(
		type: TKey,
		listener: TListener & RejectPromiseReturn<TListener>,
	): Cleanup {
		this.#assertActive();

		return this.#events.once(type, listener);
	}

	emit<TKey extends keyof TEvents>(
		type: TKey,
		...args: EventArguments<TEvents[TKey]>
	): void {
		if (this.destroyed) return;

		const payload = (
			args as readonly unknown[]
		)[0] as TEvents[TKey];

		this.#events.emit(type, payload);
	}

	clear(): void;
	clear<TKey extends keyof TEvents>(type: TKey): void;
	clear(type?: keyof TEvents): void {
		if (type === undefined) {
			this.#events.clear();
			return;
		}

		this.#events.clear(type);
	}

	protected clearListeners(): void {
		this.#events.clear();
	}

	#assertActive(): void {
		if (!this.destroyed) return;

		throw new Error("Cannot subscribe to a destroyed lifecycle.");
	}
}
