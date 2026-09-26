/// <reference lib="esnext.disposable" preserve="true" />

export { AsyncLifecycle } from "./async-lifecycle.js";
export { Lifecycle } from "./lifecycle.js";

export type {
	LifecycleOptions,
	LifecycleSignal,
	NoEvents,

	AsyncCleanup,
	AsyncDestroyable,
	Cleanup,
	Destroyable,
	EventArguments,
	EventListener,
} from "./types.js";
