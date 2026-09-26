import { throwCollectedErrors } from "./errors.js";
import type {
	Cleanup,
	EventListener,
} from "./types.js";

type StoredListener = (payload: unknown) => void;

export class EventStore<TEvents extends object> {
	readonly #listeners = new Map<
		keyof TEvents,
		Set<StoredListener>
	>();

	on<TKey extends keyof TEvents>(
		type: TKey,
		listener: EventListener<TEvents[ TKey ]>,
	): Cleanup {
		let listeners = this.#listeners.get(type);

		if (!listeners) {
			listeners = new Set();
			this.#listeners.set(type, listeners);
		}

		const storedListener: StoredListener = (payload) => {
			(listener as (value: TEvents[ TKey ]) => void)(
				payload as TEvents[ TKey ],
			);
		};

		listeners.add(storedListener);

		let active = true;

		return () => {
			if (!active) return;

			active = false;
			listeners.delete(storedListener);

			if (
				!listeners.size
				&& this.#listeners.get(type) === listeners
			) {
				this.#listeners.delete(type);
			}
		};
	}

	once<TKey extends keyof TEvents>(
		type: TKey,
		listener: EventListener<TEvents[ TKey ]>,
	): Cleanup {
		let off: Cleanup = () => { };

		off = this.on(type, ((payload: TEvents[ TKey ]) => {
			off();

			(listener as (value: TEvents[ TKey ]) => void)(payload);
		}) as EventListener<TEvents[ TKey ]>);

		return off;
	}

	emit<TKey extends keyof TEvents>(
		type: TKey,
		payload: TEvents[ TKey ],
	): void {
		const listeners = this.#listeners.get(type);
		if (!listeners?.size) return;

		const errors: unknown[] = [];

		for (const listener of [ ...listeners ]) {
			if (!listeners.has(listener)) continue;

			try {
				listener(payload);
			} catch (error) {
				errors.push(error);
			}
		}

		throwCollectedErrors(
			errors,
			`Errors occurred while emitting "${String(type)}".`,
		);
	}

	clear(): void;
	clear<TKey extends keyof TEvents>(type: TKey): void;
	clear(type?: keyof TEvents): void {
		if (type === undefined) {
			for (const listeners of this.#listeners.values()) {
				listeners.clear();
			}

			this.#listeners.clear();
			return;
		}

		const listeners = this.#listeners.get(type);
		if (!listeners) return;

		listeners.clear();
		this.#listeners.delete(type);
	}
}
