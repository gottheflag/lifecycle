# Memory-safety guarantees

Lifecycle is designed to make resource retention explicit and deterministic, but no JavaScript library can prove that an entire application has zero memory leaks.

Garbage collection belongs to the JavaScript engine and is intentionally nondeterministic.

What Lifecycle *can* guarantee is that its own ownership rules release work deterministically.

## What destruction guarantees

For `Lifecycle`:

- every active deferred cleanup is executed at most once;
- every owned resource is destroyed at most once;
- active child lifecycles are destroyed;
- children that end early detach from their parent;
- event listener sets are cleared;
- events stop being delivered immediately;
- cleanup storage is cleared before teardown callbacks run;
- repeated `destroy()` calls do not repeat teardown.

For `AsyncLifecycle`, the same ownership rules apply, with asynchronous cleanups awaited sequentially.

## Why this matters for leaks

A common leak is accidental retention:

```text
parent
  -> listener
  -> callback closure
  -> large object graph
```

or:

```text
parent
  -> child
  -> resources
```

Lifecycle breaks those ownership paths during destruction by clearing listeners, executing cleanup, and detaching children.

## Playground leak-safety test

The playground includes a repeated stress test that creates and destroys many real lifecycles containing:

- actual timers;
- owned destroyable resources;
- event listeners;
- child lifecycles;
- deferred cleanup callbacks.

After every batch it verifies observable invariants:

```text
active timers                 = 0
active owned resources        = 0
active child work             = 0
callbacks after destruction   = 0
resources destroyed twice     = 0
```

If any invariant fails, the playground reports the batch as failed.

This is strong evidence that lifecycle-managed work is released correctly. It is not a claim that the browser has already garbage-collected every unreachable JavaScript object at that exact instant.

For heap-level leak investigation, use the browser's memory profiler alongside the deterministic lifecycle checks.
