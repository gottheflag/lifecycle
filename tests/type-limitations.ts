import { Lifecycle } from "../src/index.js";

type Events = {
	ready: void;
};

const lifecycle = new Lifecycle<Events>();

// Accepted TypeScript limitation:
// conditional types cannot reliably reject an explicitly `any`-typed return.
// These intentionally compile even though the runtime value may be a Promise.
// Type-aware linting is the authoring-side mitigation; the public generic
// contract still correctly rejects normally inferred Promise return types.
const anyCleanup: () => any = () => Promise.resolve();
const anyResource: { destroy(): any } = {
	destroy: () => Promise.resolve(),
};
const anyListener: () => any = () => Promise.resolve();

lifecycle.defer(anyCleanup);
lifecycle.own(anyResource);
lifecycle.on("ready", anyListener);
