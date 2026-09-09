import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Setting } from "obsidian";
import FolderToolkitPlugin from "../src/main";
import { ConfirmRemoveModal } from "../src/ui/confirm-remove-modal";
import { FolderToolkitSettingTab } from "../src/ui/settings-tab";
import type { ConditionalFormatRule, FolderToolkitSettings } from "../src/types";

function installDomHelpers(): void {
	HTMLElement.prototype.createDiv = function (options?: string | { text?: string; cls?: string; attr?: Record<string, string> }) { return this.createEl("div", options); };
	HTMLElement.prototype.createSpan = function (options?: string | { text?: string; cls?: string; attr?: Record<string, string> }) { return this.createEl("span", options); };
	HTMLElement.prototype.createEl = function <K extends keyof HTMLElementTagNameMap>(tag: K, options?: string | { text?: string; cls?: string; attr?: Record<string, string>; type?: string; value?: string; placeholder?: string }) {
		const element = document.createElement(tag);
		if (typeof options === "string") element.className = options;
		else if (options) {
			if (options.text !== undefined) element.textContent = options.text;
			if (options.cls) element.className = options.cls;
			if (options.type) element.setAttribute("type", options.type);
			if (options.value !== undefined) (element as HTMLInputElement).value = options.value;
			if (options.placeholder) (element as HTMLInputElement).placeholder = options.placeholder;
			for (const [name, value] of Object.entries(options.attr ?? {})) element.setAttribute(name, value);
		}
		this.append(element);
		return element;
	};
	HTMLElement.prototype.addClass = function (...classes: string[]) { this.classList.add(...classes); };
	HTMLElement.prototype.removeClass = function (...classes: string[]) { this.classList.remove(...classes); };
	HTMLElement.prototype.toggleClass = function (className: string, value: boolean) { this.classList.toggle(className, value); };
	HTMLElement.prototype.empty = function () { this.replaceChildren(); };
	HTMLElement.prototype.setText = function (text: string) { this.textContent = text; };
}

function rule(id: string, pattern: string): ConditionalFormatRule {
	return { id, target: "folder", match: "equals", pattern, fontEnabled: true, color: { kind: "custom", hex: "#C8C8C8", strength: 100 }, bold: false, strikethrough: false };
}

function harness(rules = [rule("one", "__system"), rule("two", "_basefiles")]) {
	const settings: FolderToolkitSettings = { schemaVersion: 5, paletteTemplateId: "default", tabStyle: "off", appearanceRules: {}, conditionalFormats: rules, hiddenPaths: [], showHiddenItems: false };
	const removeConditionalFormat = vi.fn().mockResolvedValue(undefined);
	const addConditionalFormat = vi.fn<() => Promise<string>>();
	const toolkit = Object.assign(Object.create(FolderToolkitPlugin.prototype), {
		app: {}, settings,
		addConditionalFormat, updateConditionalFormat: vi.fn().mockResolvedValue(undefined),
		moveConditionalFormat: vi.fn().mockResolvedValue(undefined), removeConditionalFormat,
	}) as FolderToolkitPlugin;
	const tab = new FolderToolkitSettingTab(toolkit);
	const update = vi.fn();
	Object.assign(tab, { update });
	const conditionalRenderer = tab as unknown as { renderConditionalFormats(setting: Setting): () => void };
	const render = () => {
		const settingEl = document.createElement("div");
		document.body.append(settingEl);
		const controlEl = settingEl.createDiv();
		const setting = { settingEl, controlEl, setName() { return this; }, setHeading() { return this; } } as unknown as Setting;
		const cleanup = conditionalRenderer.renderConditionalFormats(setting);
		return { settingEl, cleanup };
	};
	return { toolkit, tab, update, render, removeConditionalFormat, addConditionalFormat, settings };
}

describe("name-rule settings UI", () => {
	beforeEach(() => {
		document.body.replaceChildren();
		installDomHelpers();
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
	});

	it("renders compact accessible summaries and allows multiple expanded editors", () => {
		const { render, update } = harness();
		const first = render();
		const disclosures = [...first.settingEl.querySelectorAll<HTMLButtonElement>(".ft-conditional-disclosure")];
		expect(disclosures).toHaveLength(2);
		expect(disclosures.every((button) => button.getAttribute("aria-expanded") === "false")).toBe(true);
		disclosures[0]?.click();
		disclosures[1]?.click();
		expect(update).toHaveBeenCalledTimes(2);
		first.cleanup?.();

		const expanded = render();
		expect(expanded.settingEl.querySelectorAll(".ft-conditional-editor")).toHaveLength(2);
		expect(expanded.settingEl.querySelectorAll(".ft-shared-style-grid")).toHaveLength(2);
		expect(expanded.settingEl.querySelectorAll(".ft-style-toggle[aria-pressed]")).toHaveLength(4);
		expanded.cleanup?.();
	});

	it("opens and focuses a newly added rule", async () => {
		const { render, addConditionalFormat, settings } = harness([]);
		addConditionalFormat.mockImplementation(async () => {
			settings.conditionalFormats.push(rule("new", ""));
			return "new";
		});
		const empty = render();
		empty.settingEl.querySelector<HTMLButtonElement>(".ft-conditional-add")!.click();
		await Promise.resolve();
		empty.cleanup?.();
		empty.settingEl.remove();

		const added = render();
		const pattern = added.settingEl.querySelector<HTMLInputElement>(".ft-conditional-editor input[type=text]");
		expect(pattern).not.toBeNull();
		expect(document.activeElement).toBe(pattern);
		added.cleanup?.();
		added.settingEl.remove();
	});

	it("disables unavailable moves and asks for confirmation before deletion", () => {
		const { render, removeConditionalFormat } = harness([rule("one", "__system")]);
		const open = vi.spyOn(ConfirmRemoveModal.prototype, "open");
		const view = render();
		const actions = [...view.settingEl.querySelectorAll<HTMLButtonElement>(".ft-conditional-actions button")];
		expect(actions[0]?.disabled).toBe(true);
		expect(actions[1]?.disabled).toBe(true);
		actions[2]?.click();
		expect(open).toHaveBeenCalledOnce();
		expect(removeConditionalFormat).not.toHaveBeenCalled();
		view.cleanup?.();
		open.mockRestore();
	});
});
