export type Cleanup = () => void;

export type AsyncCleanup = () => void | PromiseLike<void>;

export interface Destroyable {
	destroy(): void;
}

export interface LifecycleSignal {
	readonly aborted: boolean;

	addEventListener(
		type: "abort",
		listener: () => void,
		options?: {
			once?: boolean;
		},
	): void;

	removeEventListener(
		type: "abort",
		listener: () => void,
	): void;
}

export interface LifecycleOptions {
	signal?: LifecycleSignal;
}

export interface AsyncDestroyable {
	destroy(): void | PromiseLike<void>;
}

export type EventArguments<TPayload> =
	[ TPayload ] extends [ void ]
	? []
	: [ payload: TPayload ];

export type EventListener<TPayload> = (
	...args: EventArguments<TPayload>
) => void;

export type NoEvents = Record<never, never>;

export type RejectPromiseReturn<TFunction extends (...args: never[]) => unknown> =
	Extract<ReturnType<TFunction>, PromiseLike<unknown>> extends never
	? unknown
	: never;

export type SyncDestroyable<TResource extends Destroyable> =
	Extract<ReturnType<TResource[ "destroy" ]>, PromiseLike<unknown>> extends never
	? TResource
	: never;
