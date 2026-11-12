import assert from 'node:assert/strict';
import { launchObsidian } from './obsidian-harness.mjs';
const host = await launchObsidian({ files: { 'Fixture.md': 'Generated Folder Toolkit host fixture.\n' } });
try {
	const { page } = host;
	await page.evaluate(async () => {
		await window.app.vault.createFolder('Fixture'); await window.app.vault.createFolder('Fixture/One');
		const adapter = window.app.vault.adapter;
		await adapter.write('Fixture/copy-source.json', 'candidate'); await adapter.write('Fixture/copy-target.json', 'original');
		let rejected = false; try { await adapter.copy('Fixture/copy-source.json', 'Fixture/copy-target.json'); } catch { rejected = true; }
		if (!rejected || await adapter.read('Fixture/copy-target.json') !== 'original') throw new Error('The host copy operation is not create-only.');
	});
	const atomic = await page.evaluate(async () => {
		const plugin = window.app.plugins.getPlugin('folder-toolkit'); const adapter = window.app.vault.adapter;
		await plugin.setAppearance('Fixture', { text: { bold: true, strikethrough: true, cascade: true } });
		await plugin.setAppearance('Fixture/One', { text: { bold: true, strikethrough: false, cascade: false } });
		const path = '.obsidian/plugins/folder-toolkit/data.json';
		const originalRead = adapter.read.bind(adapter); let release; let started;
		const start = new Promise(resolve => { started = resolve; }); const barrier = new Promise(resolve => { release = resolve; }); let held = false;
		adapter.read = async target => { const text = await originalRead(target); if (target === path && !held) { held = true; started(); await barrier; } return text; };
		const pending = plugin.setAppearance('Fixture/One', { text: { bold: false, strikethrough: false, cascade: false } });
		await start;
		await adapter.process(path, text => { const value = JSON.parse(text); value.appearanceRules.External = { text: { bold: true, strikethrough: false, cascade: false }, future: 'fixture' }; return JSON.stringify(value); });
		release(); await pending; adapter.read = originalRead;
		const value = JSON.parse(await adapter.read(path));
		return { own: value.appearanceRules['Fixture/One'].text.bold, external: value.appearanceRules.External.future };
	});
	assert.deepEqual(atomic, { own: false, external: 'fixture' }); console.log('PASS atomic host edit preserves a writer committed after the captured read.');
	await page.evaluate(() => window.app.plugins.getPlugin('folder-toolkit').openAppearanceEditor('Fixture/One'));
	// Obsidian may place a modal in another document. Restrict selection to this verified instance's context.
	let ui;
	for (let attempt = 0; attempt < 100 && !ui; attempt++) {
		for (const candidate of page.context().pages()) if (await candidate.locator('.ft-appearance-modal').count()) { ui = candidate; break; }
		if (!ui) await new Promise(resolve => setTimeout(resolve, 100));
	}
	if (!ui) throw new Error('The appearance dialog did not open in the owned native context.');
	ui.setDefaultTimeout(15000);
	if (ui !== page) ui.on('pageerror', error => host.errors.push(error.message));
	const focusSession = await ui.context().newCDPSession(ui);
	await focusSession.send('Emulation.setFocusEmulationEnabled', { enabled: true });
	const modal = ui.locator('.ft-appearance-modal'); await modal.waitFor();
	console.log('PASS appearance dialog is in the verified native instance:', ui.url());
	const bold = modal.getByRole('button', { name: 'Bold', exact: true }); await bold.focus(); await bold.click();
	assert.equal(await ui.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Bold');
	const custom = modal.locator('.ft-color-card--text .ft-custom-trigger'); await custom.click();
	const hex = modal.locator('.ft-color-card--text input[aria-label="Custom hex color"]'); await hex.fill('invalid');
	assert.equal(await hex.getAttribute('aria-invalid'), 'true'); await hex.press('Escape');
	assert.equal(await modal.count(), 1); assert.equal(await custom.getAttribute('aria-expanded'), 'false');
	const describedBy = await hex.getAttribute('aria-describedby');
	assert.ok(describedBy); await modal.locator(`[id="${describedBy}"]`).waitFor({ state: 'attached' });
	await modal.locator('.ft-color-card--text .ft-swatch').first().click();
	await modal.getByRole('button', { name: 'Use inherited typography', exact: true }).click();
	assert.equal(await modal.getByRole('button', { name: 'Bold', exact: true }).getAttribute('aria-pressed'), 'true');
	assert.equal(await modal.getByRole('button', { name: 'Strikethrough', exact: true }).getAttribute('aria-pressed'), 'true');
	assert.equal(await modal.locator('.ft-color-card--text .ft-swatch.is-selected').count(), 1);
	await ui.screenshot({ path: '/private/tmp/foldertoolkit-native-light.png', fullPage: true });
	console.log('PASS rebuilt controls retain focus; valid ARIA tokens and picker Escape preserve the native modal.');
	await page.evaluate(() => {
		const adapter = window.app.vault.adapter; window.fixtureProcess = adapter.process.bind(adapter); window.fixtureStarted = false;
		adapter.process = async (path, edit, options) => {
			if (path === '.obsidian/plugins/folder-toolkit/data.json') { window.fixtureStarted = true; await new Promise(resolve => { window.fixtureRelease = resolve; }); }
			return window.fixtureProcess(path, edit, options);
		};
	});
	await modal.getByRole('button', { name: 'Save', exact: true }).click();
	await page.waitForFunction(() => window.fixtureStarted);
	const priorStrike = await modal.getByRole('button', { name: 'Strikethrough', exact: true }).getAttribute('aria-pressed');
	await modal.getByRole('button', { name: 'Strikethrough', exact: true }).click();
	assert.equal(await modal.getByRole('button', { name: 'Save', exact: true }).isDisabled(), true);
	await page.evaluate(() => { window.app.vault.adapter.process = window.fixtureProcess; window.fixtureRelease(); });
	await ui.waitForFunction(() => !document.querySelector('.ft-modal-footer .mod-cta')?.disabled);
	assert.equal(await modal.count(), 1);
	assert.equal(await modal.getByRole('button', { name: 'Strikethrough', exact: true }).getAttribute('aria-pressed'), priorStrike === 'true' ? 'false' : 'true');
	console.log('PASS native save completion retains a newer draft and prevents duplicate rebuilt Save controls.');
	// A second save must accept the same persisted rule after the host normalizer reordered its keys.
	await page.evaluate(() => {
		const adapter = window.app.vault.adapter; window.fixtureStarted = false;
		adapter.process = async (path, edit, options) => {
			if (path === '.obsidian/plugins/folder-toolkit/data.json') { window.fixtureStarted = true; await new Promise(resolve => { window.fixtureRelease = resolve; }); }
			return window.fixtureProcess(path, edit, options);
		};
	});
	await modal.getByRole('button', { name: 'Save', exact: true }).click();
	await page.waitForFunction(() => window.fixtureStarted);
	await modal.getByRole('button', { name: 'Bold', exact: true }).click();
	await page.evaluate(() => { window.app.vault.adapter.process = window.fixtureProcess; window.fixtureRelease(); });
	await ui.waitForFunction(() => !document.querySelector('.ft-modal-footer .mod-cta')?.disabled);
	assert.equal(await modal.count(), 1);
	console.log('PASS second native save accepts semantically unchanged stored JSON and keeps a later draft.');

	await page.evaluate(async () => { await window.app.vault.rename(window.app.vault.getAbstractFileByPath('Fixture/One'), 'Fixture/Two'); });
	await modal.getByRole('button', { name: 'Save', exact: true }).click();
	await modal.getByText('This item moved or changed. Reopen its appearance editor.').waitFor();
	await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
	console.log('PASS stale native folder identity cannot be saved after rename.');
	assert.deepEqual(host.errors, []);
} catch (error) {
	console.error('Original native failure:', error);
	if (!host.page.isClosed()) console.log('Fixture modal diagnostics:', JSON.stringify(await host.page.evaluate(() => ({ count: document.querySelectorAll('.ft-appearance-modal').length, modal: [...document.querySelectorAll('.modal')].map(el => ({ text: el.textContent?.slice(0, 400), display: getComputedStyle(el).display })), notices: [...document.querySelectorAll('.notice')].map(el => el.textContent) }))));
	throw error;
} finally { await host.close(); }
