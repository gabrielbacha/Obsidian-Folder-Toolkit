/** Keep logical focus and text selection when a local control tree is replaced. */
export function captureFocus(root: HTMLElement): (() => void) {
	const active = root.ownerDocument.activeElement as HTMLElement | null;
	const focusable = 'button,input,select,summary,.checkbox-container,.extra-setting-button';
	if (!active || !active.matches(focusable) || !root.contains(active)) return () => {};
	const key = (element: HTMLElement): string => [
		element.tagName, element.getAttribute('aria-label'), element.getAttribute('type'), element.textContent?.trim(),
		element.closest('.ft-color-card')?.className, element.closest('.setting-item')?.querySelector('.setting-item-name')?.textContent,
	].join('|');
	const identity = key(active);
	const index = [...root.querySelectorAll<HTMLElement>(focusable)].filter((element) => key(element) === identity).indexOf(active);
	const input = active as HTMLInputElement;
	const selection = typeof input.selectionStart === 'number' ? [input.selectionStart, input.selectionEnd] : null;
	return () => {
		let target = [...root.querySelectorAll<HTMLElement>(focusable)].filter((element) => key(element) === identity)[Math.max(0, index)];
		if (target?.matches(':disabled')) target = target.closest('.ft-color-strength')?.querySelector<HTMLElement>('input[type=range]') ?? target;
		target?.focus();
		if (selection && target?.tagName === 'INPUT') (target as HTMLInputElement).setSelectionRange(selection[0], selection[1]);
	};
}
