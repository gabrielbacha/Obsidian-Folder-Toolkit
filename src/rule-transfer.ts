import { hasOwn } from './record-utils';
import { isSameOrDescendant, replacePathRoot } from './path-utils';
import { normalizeAppearance } from './settings';
import type { AppearanceRule } from './types';

/** A rule path that no longer exists, with the number of missing rules at or below it. */
export interface MissingRoot {
	path: string;
	count: number;
}

/**
 * Lists the topmost rule paths that no longer exist. A missing rule inside a missing
 * folder is counted under that folder, so one reattach moves the whole group.
 */
export function findMissingRoots(rules: Record<string, AppearanceRule>, exists: (path: string) => boolean): MissingRoot[] {
	const missing = Object.keys(rules).filter((path) => !exists(path)).map(path => ({ path, parts: path.split('/') })).sort((a, b) => {
		for (let index = 0; index < Math.min(a.parts.length, b.parts.length); index++) {
			if (a.parts[index] !== b.parts[index]) return a.parts[index] < b.parts[index] ? -1 : 1;
		}
		return a.parts.length - b.parts.length;
	}).map(entry => entry.path);
	const roots: MissingRoot[] = [];
	for (const path of missing) {
		const last = roots.at(-1);
		const root = last && isSameOrDescendant(path, last.path) ? last : undefined;
		if (root) root.count += 1;
		else roots.push({ path, count: 1 });
	}
	return roots;
}

export interface ReattachResult {
	rules: Record<string, AppearanceRule>;
	moved: number;
	/** Rules not moved because the new path already has its own rule. */
	skipped: number;
}

/** Moves the rules at or below `oldRoot` to `newRoot`. A rule that already exists at the new path wins. */
export function reattachRules(rules: Record<string, AppearanceRule>, oldRoot: string, newRoot: string): ReattachResult {
	const result: Record<string, AppearanceRule> = Object.create(null) as Record<string, AppearanceRule>;
	const moving: [string, AppearanceRule][] = [];
	for (const [path, rule] of Object.entries(rules)) {
		if (isSameOrDescendant(path, oldRoot)) moving.push([replacePathRoot(path, oldRoot, newRoot), rule]);
		else result[path] = rule;
	}
	let moved = 0;
	let skipped = 0;
	for (const [path, rule] of moving) {
		if (hasOwn(result, path)) skipped += 1;
		else {
			result[path] = rule;
			moved += 1;
		}
	}
	return { rules: result, moved, skipped };
}

/** Removes the rules at or below `root`. */
export function removeRulesUnder(rules: Record<string, AppearanceRule>, root: string): Record<string, AppearanceRule> {
	return Object.assign(Object.create(null) as Record<string, AppearanceRule>, Object.fromEntries(Object.entries(rules).filter(([path]) => !isSameOrDescendant(path, root))));
}

const CLIPBOARD_TYPE = 'folder-toolkit/appearance';
const CLIPBOARD_VERSION = 1;
/** The key of the copied item's own rule. Other keys are paths relative to the copied item. */
export const OWN_RULE_KEY = '.';

/** Appearance copied from one item and its descendants, with paths relative to that item. */
export type CopiedAppearance = Record<string, AppearanceRule>;

/** Collects the rules of `root` and everything below it, with relative paths. */
export function collectAppearance(rules: Record<string, AppearanceRule>, root: string): CopiedAppearance {
	const copied: CopiedAppearance = Object.create(null) as Record<string, AppearanceRule>;
	for (const [path, rule] of Object.entries(rules)) {
		if (path === root) copied[OWN_RULE_KEY] = structuredClone(rule);
		else if (isSameOrDescendant(path, root)) copied[path.slice(root.length + 1)] = structuredClone(rule);
	}
	return copied;
}

export function serializeAppearance(copied: CopiedAppearance): string {
	return JSON.stringify({ type: CLIPBOARD_TYPE, version: CLIPBOARD_VERSION, rules: copied }, null, 2);
}

/**
 * Reads appearance copied by Folder Toolkit in any vault. Returns null for other clipboard text.
 * Every rule goes through the same checks as saved settings, so runtime-only fields are dropped.
 */
export function parseAppearance(text: string, paletteLength: number): CopiedAppearance | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return null;
	}
	if (!isRecord(parsed) || parsed.type !== CLIPBOARD_TYPE || parsed.version !== CLIPBOARD_VERSION || !isRecord(parsed.rules)) return null;
	const copied: CopiedAppearance = Object.create(null) as Record<string, AppearanceRule>;
	for (const [key, value] of Object.entries(parsed.rules)) {
		if (!isSafeRelativeKey(key)) continue;
		const rule = normalizeAppearance(value, paletteLength);
		if (rule) copied[key] = rule;
	}
	return Object.keys(copied).length > 0 ? copied : null;
}

export interface PastePlan {
	/** Target path → rule, only for items that exist. */
	writes: Record<string, AppearanceRule>;
	/** Copied descendant rules whose item does not exist under the target. */
	skipped: number;
}

/** Maps copied rules onto `target`. Rules for items that do not exist there are skipped. */
export function planPaste(copied: CopiedAppearance, target: string, exists: (path: string) => boolean): PastePlan {
	const writes: Record<string, AppearanceRule> = Object.create(null) as Record<string, AppearanceRule>;
	let skipped = 0;
	for (const [key, rule] of Object.entries(copied)) {
		const path = key === OWN_RULE_KEY ? target : `${target}/${key}`;
		if (key === OWN_RULE_KEY || exists(path)) writes[path] = rule;
		else skipped += 1;
	}
	return { writes, skipped };
}

function isSafeRelativeKey(key: string): boolean {
	if (key === OWN_RULE_KEY) return true;
	if (!key || key.startsWith('/')) return false;
	return key.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
