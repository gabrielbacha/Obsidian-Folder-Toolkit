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
	const settings: FolderToolkitSettings = { schemaVersion: 6, paletteTemplateId: "default", tabStyle: "off", appearanceRules: {}, conditionalFormats: rules, hiddenPaths: [], showHiddenItems: false, nestedVaults: false, vaultMarker: 'off' };
	const removeConditionalFormat = vi.fn().mockResolvedValue(undefined);
	const addConditionalFormat = vi.fn<() => Promise<string>>();
	const updateConditionalFormat = vi.fn().mockResolvedValue(undefined);
	const previewConditionalFormat = vi.fn();
	const clearConditionalFormatPreview = vi.fn();
	const toolkit = Object.assign(Object.create(FolderToolkitPlugin.prototype), {
		app: {}, settings,
		addConditionalFormat, updateConditionalFormat,
		previewConditionalFormat, clearConditionalFormatPreview,
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
	return { toolkit, tab, update, render, removeConditionalFormat, addConditionalFormat, updateConditionalFormat, previewConditionalFormat, clearConditionalFormatPreview, settings };
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
		expect([...expanded.settingEl.querySelectorAll(".ft-color-card--border")]).toHaveLength(2);
		expect([...expanded.settingEl.querySelectorAll(".ft-shared-style-grid")[0].querySelectorAll(".ft-card-title")].map((heading) => heading.textContent)).toEqual(["Background", "Border", "Text"]);
		expanded.cleanup?.();
	});

	it("enables and summarizes a conditional border", () => {
		const borderRule = rule("border", "archive");
		borderRule.target = "file";
		borderRule.borderEnabled = true;
		borderRule.border = { style: "rail", color: { kind: "custom", hex: "#C8C8C8", strength: 75 }, thickness: "medium" };
		const { render, tab } = harness([borderRule]);
		(tab as unknown as { expandedConditionalIds: Set<string> }).expandedConditionalIds.add("border");
		const view = render();
		expect(view.settingEl.textContent).toContain("Border · Rail");
		const borderCard = view.settingEl.querySelector<HTMLElement>(".ft-conditional-editor .ft-color-card--border")!;
		const toggle = borderCard.querySelector<HTMLInputElement>("input[type=checkbox]")!;
		expect(toggle.checked).toBe(true);
		expect([...borderCard.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Medium")?.getAttribute("aria-pressed")).toBe("true");
		view.cleanup?.();
	});

	it("edits a draft and saves the rule only after Save", async () => {
		const borderRule = rule("border", "archive");
		const { render, tab, settings, update, updateConditionalFormat, previewConditionalFormat, clearConditionalFormatPreview } = harness([borderRule]);
		(tab as unknown as { expandedConditionalIds: Set<string> }).expandedConditionalIds.add("border");
		const view = render();
		const save = [...view.settingEl.querySelectorAll<HTMLButtonElement>(".ft-conditional-footer button")].find((button) => button.textContent === "Save")!;
		expect(save.disabled).toBe(true);
		const borderCard = view.settingEl.querySelector<HTMLElement>(".ft-conditional-editor .ft-color-card--border")!;
		const toggle = borderCard.querySelector<HTMLInputElement>("input[type=checkbox]")!;
		expect(toggle.checked).toBe(false);
		expect(borderCard.querySelector<HTMLButtonElement>(".ft-swatch")?.disabled).toBe(true);
		toggle.checked = true;
		toggle.dispatchEvent(new Event("change"));
		expect(settings.conditionalFormats[0]?.borderEnabled).toBeUndefined();
		expect(previewConditionalFormat.mock.lastCall?.[0]).toMatchObject({ borderEnabled: true });
		expect(update).toHaveBeenCalled();
		view.cleanup?.();

		const rerendered = render();
		expect(rerendered.settingEl.querySelector(".ft-conditional-status")?.textContent).toBe("Unsaved changes");
		expect(rerendered.settingEl.querySelector<HTMLElement>(".ft-style-badge--unsaved")?.hidden).toBe(false);
		const saveAgain = [...rerendered.settingEl.querySelectorAll<HTMLButtonElement>(".ft-conditional-footer button")].find((button) => button.textContent === "Save")!;
		expect(saveAgain.disabled).toBe(false);
		saveAgain.click();
		await Promise.resolve();
		expect(updateConditionalFormat.mock.lastCall?.[0]).toBe("border");
		expect(updateConditionalFormat.mock.lastCall?.[1]).toMatchObject({ borderEnabled: true, border: { style: "box", thickness: "thin" } });
		expect(clearConditionalFormatPreview).toHaveBeenCalledWith("border");
		rerendered.cleanup?.();
	});

	it("discards a draft on Cancel without saving", () => {
		const { render, tab, updateConditionalFormat, clearConditionalFormatPreview } = harness([rule("one", "__system")]);
		(tab as unknown as { expandedConditionalIds: Set<string> }).expandedConditionalIds.add("one");
		const view = render();
		const pattern = view.settingEl.querySelector<HTMLInputElement>(".ft-conditional-editor input[type=text]")!;
		pattern.value = "__archive";
		pattern.dispatchEvent(new Event("input"));
		expect(view.settingEl.querySelector(".ft-conditional-summary__pattern")?.textContent).toBe("__archive");
		const cancel = [...view.settingEl.querySelectorAll<HTMLButtonElement>(".ft-conditional-footer button")].find((button) => button.textContent === "Cancel")!;
		expect(cancel.disabled).toBe(false);
		cancel.click();
		expect(clearConditionalFormatPreview).toHaveBeenCalledWith("one");
		expect(updateConditionalFormat).not.toHaveBeenCalled();
		view.cleanup?.();
		const fresh = render();
		expect(fresh.settingEl.querySelector<HTMLInputElement>(".ft-conditional-editor input[type=text]")?.value).toBe("__system");
		fresh.cleanup?.();
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

	it("scrolls to the name rules on the next render after a reveal request", () => {
		const { tab, render } = harness();
		Object.assign(tab, { containerEl: document.createElement("div") });
		const scroll = vi.fn();
		HTMLElement.prototype.scrollIntoView = scroll;
		tab.revealConditionalFormats();
		expect(scroll).not.toHaveBeenCalled();
		const first = render();
		expect(scroll).toHaveBeenCalledOnce();
		first.cleanup?.();
		render().cleanup?.();
		expect(scroll).toHaveBeenCalledOnce();
	});

	it("scrolls immediately when the name rules are already on screen", () => {
		const { tab, render } = harness();
		const view = render();
		Object.assign(tab, { containerEl: document.body });
		const scroll = vi.fn();
		HTMLElement.prototype.scrollIntoView = scroll;
		tab.revealConditionalFormats();
		expect(scroll).toHaveBeenCalledOnce();
		view.cleanup?.();
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
