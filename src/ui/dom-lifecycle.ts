export function replaceOwnedRoot(parent: HTMLElement, className: string): HTMLElement {
	for (const child of [...parent.children]) {
		if (child.classList.contains(className)) child.remove();
	}
	return parent.createDiv(className);
}
