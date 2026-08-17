# Lifecycle

Lifetime, event, and resource management.

```bash
pnpm add @gottheflag/lifecycle
```

The package provides two primitives:

- `Lifecycle<TEvents>` — synchronous cleanup, ownership, child lifecycles, and typed events.
- `AsyncLifecycle<TEvents>` — the asynchronous counterpart with awaited teardown.

## Documentation

Open [`docs/index.html`](./docs/index.html) directly in a browser for the complete API reference. No documentation server or build step is required.

## Development

```bash
pnpm check
pnpm playground
```

[Apache-2.0](./LICENSE)
