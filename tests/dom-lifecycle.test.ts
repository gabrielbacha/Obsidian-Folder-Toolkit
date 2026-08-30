import { describe, expect, it } from 'vitest';
import { replaceOwnedRoot } from '../src/ui/dom-lifecycle';

describe('settings DOM lifecycle', () => {
	it('replaces every stale owned root with one current root', () => {
		HTMLElement.prototype.createDiv = function (className?: string): HTMLDivElement {
			const element = document.createElement('div');
			if (className) element.className = className;
			this.append(element);
			return element;
		};
		const parent = document.createElement('div');
		parent.append(
			Object.assign(document.createElement('div'), { className: 'ft-settings-manager' }),
			Object.assign(document.createElement('div'), { className: 'unrelated' }),
			Object.assign(document.createElement('div'), { className: 'ft-settings-manager' }),
		);
		const current = replaceOwnedRoot(parent, 'ft-settings-manager');
		expect(parent.querySelectorAll('.ft-settings-manager')).toHaveLength(1);
		expect(parent.querySelector('.ft-settings-manager')).toBe(current);
		expect(parent.querySelector('.unrelated')).not.toBeNull();
	});
});
