import {
	Lifecycle,
	type LifecycleSignal,
	type NoEvents,
} from "../src/index.js";

const signal: LifecycleSignal = {
	aborted: false,
	addEventListener(): void { },
	removeEventListener(): void { },
};

const lifecycle = new Lifecycle<NoEvents>({
	signal,
});

lifecycle.destroy();
