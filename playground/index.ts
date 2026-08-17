import { Lifecycle } from "../src/index.js";
import type { Cleanup } from "../src/index.js";

type PlaygroundEvents = {
	ping: {
		sequence: number;
	};
};

type OwnedEntry = {
	id: number;
	label: string;
	kind: string;
};

type Metrics = {
	timers: number;
	resources: number;
	children: number;
	eventCalls: number;
	cleanupCalls: number;
};

type EarlyCleanup = {
	id: number;
	run: Cleanup;
};

const status = element<HTMLElement>("#status");
const statusDot = element<HTMLSpanElement>("#status-dot");
const generationLabel = element<HTMLSpanElement>("#generation");
const ownershipList = element<HTMLUListElement>("#ownership-list");
const logList = element<HTMLOListElement>("#log");
const stressButton = element<HTMLButtonElement>("#stress-test");
const stressSummary = element<HTMLParagraphElement>("#stress-summary");
const checks = [...document.querySelectorAll<HTMLElement>("#checks > div")];

const metricElements = {
	timers: element<HTMLElement>("#active-timers"),
	resources: element<HTMLElement>("#active-resources"),
	children: element<HTMLElement>("#active-children"),
	eventCalls: element<HTMLElement>("#event-calls"),
	cleanupCalls: element<HTMLElement>("#cleanup-calls"),
};

let lifecycle = new Lifecycle<PlaygroundEvents>();
let generation = 1;
let nextEntryId = 1;
let pingSequence = 0;
let metrics = freshMetrics();
let ownedEntries = new Map<number, OwnedEntry>();
let earlyCleanups: EarlyCleanup[] = [];

class PlaygroundResource {
	#destroyed = false;

	constructor(
		readonly id: number,
		readonly label: string,
	) {
		metrics.resources++;
		updateMetrics();
	}

	destroy(): void {
		if (this.#destroyed) return;

		this.#destroyed = true;
		metrics.resources--;
		metrics.cleanupCalls++;
		removeOwned(this.id);
		log(`${this.label}.destroy()`, "good");
		updateMetrics();
	}
}

function element<TElement extends Element>(selector: string): TElement {
	const found = document.querySelector<TElement>(selector);

	if (!found) {
		throw new Error(`Missing playground element: ${selector}`);
	}

	return found;
}

function freshMetrics(): Metrics {
	return {
		timers: 0,
		resources: 0,
		children: 0,
		eventCalls: 0,
		cleanupCalls: 0,
	};
}

function log(message: string, tone: "normal" | "good" | "warn" | "bad" = "normal"): void {
	const item = document.createElement("li");
	const time = document.createElement("time");
	const text = document.createElement("span");

	time.textContent = new Date().toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});

	text.textContent = message;

	if (tone !== "normal") {
		text.className = tone;
	}

	item.append(time, text);
	logList.prepend(item);
}

function updateMetrics(): void {
	metricElements.timers.textContent = String(metrics.timers);
	metricElements.resources.textContent = String(metrics.resources);
	metricElements.children.textContent = String(metrics.children);
	metricElements.eventCalls.textContent = String(metrics.eventCalls);
	metricElements.cleanupCalls.textContent = String(metrics.cleanupCalls);
}

function addOwned(label: string, kind: string): number {
	const id = nextEntryId++;

	ownedEntries.set(id, {
		id,
		label,
		kind,
	});

	renderOwnership();

	return id;
}

function removeOwned(id: number): void {
	ownedEntries.delete(id);
	earlyCleanups = earlyCleanups.filter((cleanup) => cleanup.id !== id);
	renderOwnership();
}

function renderOwnership(): void {
	ownershipList.replaceChildren();

	if (!ownedEntries.size) {
		const empty = document.createElement("li");
		empty.className = "empty";
		empty.textContent = lifecycle.destroyed
			? "The lifecycle owns nothing."
			: "Nothing owned yet.";
		ownershipList.append(empty);
		return;
	}

	for (const entry of [...ownedEntries.values()].reverse()) {
		const item = document.createElement("li");
		const label = document.createElement("span");
		const kind = document.createElement("small");

		label.textContent = entry.label;
		kind.textContent = entry.kind;
		item.append(label, kind);
		ownershipList.append(item);
	}
}

function updateStatus(): void {
	const destroyed = lifecycle.destroyed;

	status.textContent = destroyed ? "Destroyed" : "Alive";
	statusDot.classList.toggle("dead", destroyed);
	generationLabel.textContent = `Lifecycle #${generation}`;

	for (const button of document.querySelectorAll<HTMLButtonElement>("[data-action]")) {
		const action = button.dataset.action;

		button.disabled = destroyed
			&& action !== "new"
			&& action !== "emit";
	}
}

function addTimer(): void {
	if (lifecycle.destroyed) return;

	const id = addOwned(`Timer #${nextEntryId}`, "defer()");
	let ticks = 0;

	const timer = window.setInterval(() => {
		ticks++;

		if (ticks <= 3) {
			log(`Timer ${id} ticked (${ticks})`);
		}
	}, 1000);

	metrics.timers++;
	updateMetrics();

	lifecycle.defer(() => {
		window.clearInterval(timer);
		metrics.timers--;
		metrics.cleanupCalls++;
		removeOwned(id);
		log(`Timer ${id} cleared`, "good");
		updateMetrics();
	});

	log(`Added real interval timer ${id}`);
}

function ownResource(): void {
	if (lifecycle.destroyed) return;

	const id = addOwned(`Resource #${nextEntryId}`, "own()");
	const resource = new PlaygroundResource(id, `Resource ${id}`);

	lifecycle.own(resource);
	log(`Lifecycle now owns Resource ${id}`);
}

function createChild(): void {
	if (lifecycle.destroyed) return;

	const child = lifecycle.child();
	const id = addOwned(`Child lifecycle #${nextEntryId}`, "child()");

	metrics.children++;
	updateMetrics();

	child.defer(() => {
		metrics.children--;
		metrics.cleanupCalls++;
		removeOwned(id);
		log(`Child ${id} cleanup ran`, "good");
		updateMetrics();
	});

	log(`Created child lifecycle ${id}`);
}

function deferCleanup(): void {
	if (lifecycle.destroyed) return;

	const id = addOwned(`Deferred cleanup #${nextEntryId}`, "defer()");

	const run = lifecycle.defer(() => {
		metrics.cleanupCalls++;
		removeOwned(id);
		log(`Deferred cleanup ${id} executed`, "good");
		updateMetrics();
	});

	earlyCleanups.push({ id, run });
	log(`Registered deferred cleanup ${id}`);
}

function runLatestEarly(): void {
	if (lifecycle.destroyed) return;

	const latest = earlyCleanups.at(-1);

	if (!latest) {
		log("No deferred cleanup is waiting to run early.", "warn");
		return;
	}

	log(`Running deferred cleanup ${latest.id} early`);
	latest.run();
}

function listen(once: boolean): void {
	if (lifecycle.destroyed) return;

	const id = addOwned(
		once ? `Once listener #${nextEntryId}` : `Ping listener #${nextEntryId}`,
		once ? "once()" : "on()",
	);

	const listener = (event: PlaygroundEvents["ping"]): void => {
		metrics.eventCalls++;
		log(`${once ? "Once listener" : "Listener"} ${id} received ping ${event.sequence}`);

		if (once) {
			removeOwned(id);
		}

		updateMetrics();
	};

	if (once) {
		lifecycle.once("ping", listener);
	} else {
		lifecycle.on("ping", listener);
	}

	log(`Registered ${once ? "one-time" : "persistent"} ping listener ${id}`);
}

function emitPing(): void {
	const before = metrics.eventCalls;
	const sequence = ++pingSequence;

	lifecycle.emit("ping", { sequence });

	if (lifecycle.destroyed) {
		const delivered = metrics.eventCalls - before;
		log(
			`Emitted ping ${sequence} after destroy: ${delivered} callbacks`,
			delivered === 0 ? "good" : "bad",
		);
		return;
	}

	log(`Emitted ping ${sequence}`);
}

function clearPing(): void {
	if (lifecycle.destroyed) return;

	lifecycle.clear("ping");

	for (const [id, entry] of ownedEntries) {
		if (entry.kind === "on()" || entry.kind === "once()") {
			removeOwned(id);
		}
	}

	log("Cleared every ping listener", "good");
}

function destroyCurrent(): void {
	if (lifecycle.destroyed) {
		log("destroy() called again — no-op", "good");
		return;
	}

	log("Destroying lifecycle…", "warn");
	lifecycle.destroy();

	for (const [id, entry] of ownedEntries) {
		if (entry.kind === "on()" || entry.kind === "once()") {
			removeOwned(id);
		}
	}

	updateStatus();
	updateMetrics();
	log("Lifecycle destroyed. Remaining active counters should be zero.", "good");
}

function newLifecycle(): void {
	if (!lifecycle.destroyed) {
		lifecycle.destroy();
	}

	generation++;
	lifecycle = new Lifecycle<PlaygroundEvents>();
	metrics = freshMetrics();
	ownedEntries = new Map();
	earlyCleanups = [];
	pingSequence = 0;

	updateMetrics();
	updateStatus();
	renderOwnership();
	log(`Created Lifecycle #${generation}`, "good");
}

async function runStressTest(): Promise<void> {
	const iterations = 2000;
	const batchSize = 100;

	stressButton.disabled = true;
	stressButton.textContent = "Running…";
	stressSummary.textContent = `Creating and destroying ${iterations.toLocaleString()} independent lifecycles…`;
	resetChecks();

	let activeTimers = 0;
	let activeResources = 0;
	let activeChildren = 0;
	let postDestroyEvents = 0;
	let doubleDestroys = 0;
	let resourcesDestroyed = 0;
	let deferredCleanups = 0;
	let timerFiresAfterDestroy = 0;

	for (let index = 0; index < iterations; index++) {
		const test = new Lifecycle<{ ping: void }>();

		activeTimers++;
		let testDestroyed = false;

		const timer = window.setTimeout(() => {
			if (testDestroyed) {
				timerFiresAfterDestroy++;
			}
		}, 0);

		test.defer(() => {
			window.clearTimeout(timer);
			activeTimers--;
			deferredCleanups++;
		});

		activeResources++;
		let resourceDestroyed = false;

		test.own({
			destroy(): void {
				if (resourceDestroyed) {
					doubleDestroys++;
					return;
				}

				resourceDestroyed = true;
				activeResources--;
				resourcesDestroyed++;
			},
		});

		const child = test.child();
		activeChildren++;

		child.defer(() => {
			activeChildren--;
		});

		let eventCalls = 0;

		test.on("ping", () => {
			eventCalls++;
		});

		test.emit("ping");
		testDestroyed = true;
		test.destroy();
		test.destroy();

		const before = eventCalls;
		test.emit("ping");

		if (eventCalls !== before) {
			postDestroyEvents++;
		}

		if ((index + 1) % batchSize === 0) {
			stressSummary.textContent = `Verified ${(index + 1).toLocaleString()} / ${iterations.toLocaleString()} lifecycles…`;
			await nextFrame();
		}
	}

	await new Promise<void>((resolve) => {
		window.setTimeout(resolve, 20);
	});

	const results = [
		activeTimers === 0
			&& deferredCleanups === iterations
			&& timerFiresAfterDestroy === 0,
		activeResources === 0 && resourcesDestroyed === iterations,
		activeChildren === 0,
		postDestroyEvents === 0,
		doubleDestroys === 0,
	];

	showChecks(results);

	const passed = results.every(Boolean);

	stressSummary.textContent = passed
		? `PASS — ${iterations.toLocaleString()} lifecycles returned every tracked active counter to zero; no timer or event callback survived destruction, and no resource was destroyed twice.`
		: "FAIL — at least one lifecycle teardown invariant did not return to zero. Inspect the failed check above.";

	stressSummary.classList.toggle("bad", !passed);
	stressSummary.classList.toggle("good", passed);
	stressButton.disabled = false;
	stressButton.textContent = "Run stress test";

	log(
		`Stress test ${passed ? "passed" : "failed"}: ${iterations.toLocaleString()} lifecycles`,
		passed ? "good" : "bad",
	);
}

function resetChecks(): void {
	for (const check of checks) {
		const value = check.querySelector("strong");

		if (!value) continue;

		value.textContent = "…";
		value.className = "";
	}
}

function showChecks(results: boolean[]): void {
	for (const [index, check] of checks.entries()) {
		const value = check.querySelector("strong");
		const passed = results[index];

		if (!value || passed === undefined) continue;

		value.textContent = passed ? "PASS" : "FAIL";
		value.className = passed ? "pass" : "fail";
	}
}

function nextFrame(): Promise<void> {
	return new Promise((resolve) => {
		requestAnimationFrame(() => resolve());
	});
}

document.addEventListener("click", (event) => {
	const target = event.target;

	if (!(target instanceof HTMLButtonElement)) return;

	switch (target.dataset.action) {
		case "timer":
			addTimer();
			break;
		case "resource":
			ownResource();
			break;
		case "child":
			createChild();
			break;
		case "defer":
			deferCleanup();
			break;
		case "early":
			runLatestEarly();
			break;
		case "listen":
			listen(false);
			break;
		case "once":
			listen(true);
			break;
		case "emit":
			emitPing();
			break;
		case "clear":
			clearPing();
			break;
		case "destroy":
			destroyCurrent();
			break;
		case "new":
			newLifecycle();
			break;
	}
});

stressButton.addEventListener("click", () => {
	void runStressTest();
});

element<HTMLButtonElement>("#clear-log").addEventListener("click", () => {
	logList.replaceChildren();
});

updateMetrics();
updateStatus();
renderOwnership();
log("Lifecycle #1 created", "good");
