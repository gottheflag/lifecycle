export function throwCollectedErrors(
	errors: readonly unknown[],
	message: string,
): void {
	if (!errors.length) return;

	throw new AggregateError(errors, message);
}
