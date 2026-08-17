const search = document.querySelector("#docs-search");
const sections = [...document.querySelectorAll(".doc-section")];
const navLinks = [...document.querySelectorAll("#docs-nav a")];
const emptyState = document.querySelector("#empty-state");

function normalize(value) {
	return value.toLowerCase().trim();
}

function applySearch() {
	const query = normalize(search.value);
	let visible = 0;

	for (const section of sections) {
		const haystack = normalize(
			`${section.dataset.search ?? ""} ${section.textContent ?? ""}`,
		);
		const matches = !query || haystack.includes(query);
		section.classList.toggle("hidden-by-search", !matches);
		if (matches) visible++;
	}

	for (const link of navLinks) {
		const target = document.querySelector(link.getAttribute("href"));
		link.classList.toggle("hidden-by-search", Boolean(query) && target?.classList.contains("hidden-by-search"));
	}

	emptyState.hidden = visible !== 0;
}

search.addEventListener("input", applySearch);

document.addEventListener("keydown", (event) => {
	if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
		event.preventDefault();
		search.focus();
		search.select();
	}

	if (event.key === "Escape" && document.activeElement === search) {
		search.value = "";
		applySearch();
		search.blur();
	}
});

for (const button of document.querySelectorAll("[data-copy]")) {
	button.addEventListener("click", async () => {
		const text = button.dataset.copy;
		try {
			await navigator.clipboard.writeText(text);
			button.textContent = "Copied";
			setTimeout(() => { button.textContent = "Copy"; }, 1000);
		} catch {
			button.textContent = "Select";
			setTimeout(() => { button.textContent = "Copy"; }, 1000);
		}
	});
}

const observer = new IntersectionObserver((entries) => {
	const visible = entries
		.filter((entry) => entry.isIntersecting)
		.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];

	if (!visible) return;

	const id = `#${visible.target.id}`;
	for (const link of navLinks) {
		link.classList.toggle("active", link.getAttribute("href") === id);
	}
}, {
	rootMargin: "-90px 0px -70% 0px",
	threshold: 0,
});

for (const section of sections) {
	if (section.id) observer.observe(section);
}
