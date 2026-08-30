export function syncClass(element: Element, className: string, enabled: boolean): void {
	if (element.classList.contains(className) === enabled) return;
	if (enabled) element.classList.add(className);
	else element.classList.remove(className);
}

export function syncStyle(style: CSSStyleDeclaration, property: string, value: string | null): void {
	const current = style.getPropertyValue(property);
	if (value === null) {
		if (current) style.removeProperty(property);
		return;
	}
	if (current !== value) style.setProperty(property, value);
}
