import { installDomHelpers } from "./dom-helpers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FolderToolkitPlugin from "../src/main";
import { ConditionalRuleModal, describeConditionalRule } from "../src/ui/conditional-rule-modal";
import { ConfirmRemoveModal } from "../src/ui/confirm-remove-modal";
import type { ConditionalFormatRule, FolderToolkitSettings } from "../src/types";

function rule(id: string, pattern: string, extra: Partial<ConditionalFormatRule> = {}): ConditionalFormatRule {
	return { id, target: "folder", match: "equals", pattern, fontEnabled: true, color: { kind: "custom", hex: "#C8C8C8", strength: 100 }, bold: false, strikethrough: false, ...extra };
}

function harness(rules = [rule("one", "__system"), rule("two", "_basefiles")]) {
	const settings = { paletteTemplateId: "default", appearanceRules: {}, conditionalFormats: rules } as unknown as FolderToolkitSettings;
	const files = [{ path: "Draft plan.md", name: "Draft plan.md" }, { path: "Other.md", name: "Other.md" }];
	const toolkit = {
		previewConditionalFormat: vi.fn(),
		clearConditionalFormatPreview: vi.fn(),
		updateConditionalFormat: vi.fn(async (id: string, next: ConditionalFormatRule) => {
			settings.conditionalFormats = settings.conditionalFormats.map((candidate) => candidate.id === id ? next : candidate);
		}),
		removeConditionalFormat: vi.fn(async (id: string) => {
			settings.conditionalFormats = settings.conditionalFormats.filter((candidate) => candidate.id !== id);
		}),
		moveConditionalFormat: vi.fn().mockResolvedValue(undefined),
		duplicateConditionalFormat: vi.fn(async (id: string) => {
			const index = settings.conditionalFormats.findIndex((candidate) => candidate.id === id);
			settings.conditionalFormats.splice(index + 1, 0, { ...structuredClone(settings.conditionalFormats[index]), id: "copy" });
			return "copy";
		}),
	};
	const plugin = Object.assign(Object.create(FolderToolkitPlugin.prototype), { settings, app: { vault: { getAllLoadedFiles: () => files } }, ...toolkit }) as FolderToolkitPlugin;
	const onClose = vi.fn();
	const open = (id = "one", isNew = false) => {
		const modal = new ConditionalRuleModal(plugin, id, { isNew, onClose });
		document.body.append(modal.contentEl);
		modal.open();
		return modal;
	};
	return { toolkit, settings, onClose, open };
}

const headings = (modal: ConditionalRuleModal) => [...modal.contentEl.querySelectorAll(".setting-group > .setting-item-heading")].map((heading) => heading.textContent);
const group = (modal: ConditionalRuleModal, heading: string) => [...modal.contentEl.querySelectorAll<HTMLElement>(".setting-group")].find((candidate) => candidate.querySelector(".setting-item-heading")?.textContent === heading)!;
const row = (modal: ConditionalRuleModal, heading: string, name: string) => [...group(modal, heading).querySelectorAll<HTMLElement>(".setting-items > .setting-item")].find((candidate) => candidate.querySelector(".setting-item-name")?.textContent === name)!;
const footerButton = (modal: ConditionalRuleModal, text: string) => [...modal.contentEl.querySelectorAll<HTMLButtonElement>(".ft-rule-editor__footer button")].find((button) => button.textContent === text)!;

describe("name rule editor", () => {
	beforeEach(() => {
		document.body.replaceChildren();
		installDomHelpers();
	});
	afterEach(() => vi.restoreAllMocks());

	it("describes a rule as a sentence", () => {
		expect(describeConditionalRule(rule("a", "__system"))).toBe("Folders named exactly “__system”");
		expect(describeConditionalRule(rule("a", "Draft", { target: "file", match: "startsWith" }))).toBe("Files starting with “Draft”");
		expect(describeConditionalRule(rule("a", " ", { target: "both", match: "contains" }))).toBe("Files and folders with no name yet");
	});

	it("groups the controls and shows color controls only for styles that are on", () => {
		const { open, toolkit, settings } = harness();
		const modal = open();
		expect(headings(modal)).toEqual(["Match", "Preview", "Text", "Background", "Border", "Rule"]);
		expect(group(modal, "Background").querySelectorAll(".setting-items > .setting-item")).toHaveLength(1);
		expect(row(modal, "Text", "Color")).toBeDefined();
		row(modal, "Background", "Background color").querySelector<HTMLElement>(".checkbox-container")!.click();
		expect(row(modal, "Background", "Color").querySelector(".ft-color-controls")).not.toBeNull();
		expect(toolkit.previewConditionalFormat.mock.lastCall?.[0]).toMatchObject({ backgroundEnabled: true, backgroundColor: { hex: "#A8ADB5" } });
		expect(settings.conditionalFormats[0]?.backgroundEnabled).toBeUndefined();
		row(modal, "Border", "Border").querySelector<HTMLElement>(".checkbox-container")!.click();
		expect(["Border", "Shape", "Thickness", "Color"].every((name) => row(modal, "Border", name))).toBe(true);
	});

	it("saves only with Save and then closes", async () => {
		const { open, toolkit, onClose } = harness();
		const modal = open();
		expect(footerButton(modal, "Save").disabled).toBe(true);
		row(modal, "Text", "Bold").querySelector<HTMLElement>(".checkbox-container")!.click();
		expect(modal.contentEl.querySelector(".ft-rule-editor__status")?.textContent).toBe("Unsaved changes");
		expect(footerButton(modal, "Save").disabled).toBe(false);
		footerButton(modal, "Save").click();
		await Promise.resolve(); await Promise.resolve();
		expect(toolkit.updateConditionalFormat).toHaveBeenCalledWith("one", expect.objectContaining({ bold: true }));
		expect(toolkit.clearConditionalFormatPreview).toHaveBeenCalledWith("one");
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("discards changes on Cancel", () => {
		const { open, toolkit, settings, onClose } = harness();
		const modal = open();
		const pattern = modal.contentEl.querySelector<HTMLInputElement>('input[aria-label="Name pattern"]')!;
		pattern.value = "__archive";
		pattern.dispatchEvent(new Event("input"));
		footerButton(modal, "Cancel").click();
		expect(toolkit.updateConditionalFormat).not.toHaveBeenCalled();
		expect(toolkit.clearConditionalFormatPreview).toHaveBeenCalledWith("one");
		expect(settings.conditionalFormats[0]?.pattern).toBe("__system");
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("removes a new rule that was closed without saving", async () => {
		const { open, toolkit, settings } = harness([rule("new", "")]);
		const modal = open("new", true);
		expect(headings(modal)).not.toContain("Rule");
		expect(modal.contentEl.querySelector(".ft-rule-editor__status")?.textContent).toBe("Type a name pattern to save this rule.");
		expect(footerButton(modal, "Save").disabled).toBe(true);
		modal.close();
		await Promise.resolve();
		expect(toolkit.removeConditionalFormat).toHaveBeenCalledWith("new");
		expect(settings.conditionalFormats).toHaveLength(0);
	});

	it("keeps a new rule once it is saved", async () => {
		const { open, toolkit, settings } = harness([rule("new", "")]);
		const modal = open("new", true);
		const pattern = modal.contentEl.querySelector<HTMLInputElement>('input[aria-label="Name pattern"]')!;
		pattern.value = "Draft";
		pattern.dispatchEvent(new Event("input"));
		pattern.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
		await Promise.resolve(); await Promise.resolve();
		expect(toolkit.removeConditionalFormat).not.toHaveBeenCalled();
		expect(settings.conditionalFormats[0]?.pattern).toBe("Draft");
	});

	it("repaints the preview while typing without losing focus", () => {
		const { open } = harness([rule("one", "Draft", { match: "startsWith", target: "both" })]);
		const modal = open();
		const names = () => [...modal.contentEl.querySelectorAll(".ft-rule-sample .ft-live-preview__name")].map((element) => element.textContent);
		expect(names()).toEqual(["Draft notes", "Draft notes", "Other note"]);
		expect(modal.contentEl.querySelector(".ft-rule-sample__matches")?.textContent).toBe("Matches 1 item in this vault: Draft plan.md");
		const pattern = modal.contentEl.querySelector<HTMLInputElement>('input[aria-label="Name pattern"]')!;
		pattern.focus();
		pattern.value = "Idea";
		pattern.dispatchEvent(new Event("input"));
		expect(names()).toEqual(["Idea notes", "Idea notes", "Other note"]);
		expect(document.activeElement).toBe(pattern);
		pattern.value = "";
		pattern.dispatchEvent(new Event("input"));
		expect(modal.contentEl.querySelector(".ft-conditional-preview__hint")?.textContent).toBe("Type a pattern to see a preview.");
		expect(footerButton(modal, "Save").disabled).toBe(true);
	});

	it("keeps focus on a switch that adds or removes rows", () => {
		const { open } = harness();
		const modal = open();
		const toggle = () => row(modal, "Background", "Background color").querySelector<HTMLElement>(".checkbox-container")!;
		toggle().focus();
		toggle().click();
		expect(document.activeElement).toBe(toggle());
	});

	it("moves, duplicates and deletes a saved rule", async () => {
		const { open, toolkit, settings, onClose } = harness();
		const modal = open();
		const position = row(modal, "Rule", "Position");
		expect(position.querySelector(".setting-item-description")?.textContent).toBe("Rule 1 of 2. When rules overlap, the lower rule wins.");
		expect(position.querySelector('[aria-label="Move up"]')?.classList.contains("is-disabled")).toBe(true);
		position.querySelector<HTMLElement>('[aria-label="Move down"]')!.click();
		expect(toolkit.moveConditionalFormat).toHaveBeenCalledWith("one", 1);

		row(modal, "Text", "Bold").querySelector<HTMLElement>(".checkbox-container")!.click();
		const duplicate = row(modal, "Rule", "Duplicate rule").querySelector("button")!;
		expect(duplicate.disabled).toBe(true);
		row(modal, "Text", "Bold").querySelector<HTMLElement>(".checkbox-container")!.click();
		const ready = row(modal, "Rule", "Duplicate rule").querySelector("button")!;
		expect(ready.disabled).toBe(false);
		ready.click();
		await Promise.resolve(); await Promise.resolve();
		expect(settings.conditionalFormats.map((candidate) => candidate.id)).toEqual(["one", "copy", "two"]);
		expect(onClose).toHaveBeenCalledOnce();

		const confirm = vi.spyOn(ConfirmRemoveModal.prototype, "open").mockImplementation(() => {});
		const again = open("two");
		row(again, "Rule", "Delete rule").querySelector("button")!.click();
		expect(confirm).toHaveBeenCalledOnce();
		expect(toolkit.removeConditionalFormat).not.toHaveBeenCalled();
	});
});
