"""T0010-F1 browser regression: synthetic data, Vite dev + production preview.
Build first. Requires Python Playwright and Chromium; no project dependencies.
"""
import argparse
import copy
import gzip
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import time
from urllib.error import URLError
from urllib.request import urlopen
from playwright.sync_api import expect, sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='/tmp/gorgonbuilder-t0010-f1')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[3]
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    key, pref = 'gorgonbuilder.current-draft', 'gorgonbuilder.preferences'
    items = json.loads(gzip.decompress((repo / 'src/generated/game-data/itemsTreasure.json.gz').read_bytes()))['items']
    report = json.loads((repo / 'src/features/mods/fixtures/imported-cow-unarmed.json').read_text())
    source = copy.deepcopy(report['Items'][0])
    report['Items'] = []
    for slot in ['Head', 'Necklace']:
        item = next(item for item in items if item['slot'] == slot)
        entry = copy.deepcopy(source)
        entry.update(TypeID=int(item['id'].split('_')[1]), Slot=slot, Name=f'Synthetic {slot}', ID=f'fixture-{slot}')
        report['Items'].append(entry)
    default = {'schemaVersion': 1, 'gameDataVersion': 'v490', 'title': 'Untitled build', 'notes': '',
        'skillSlotA': {'skillId': None, 'level': 0}, 'skillSlotB': {'skillId': None, 'level': 0},
        'abilityBarA': [], 'abilityBarB': [], 'equipment': [], 'target': {'count': 1, 'damageTypes': {}}}
    populated = copy.deepcopy(default)
    populated.update(title='Synthetic populated build', notes='Reset verification',
        skillSlotA={'skillId': 'Druid', 'level': 125}, skillSlotB={'skillId': 'Archery', 'level': 100},
        abilityBarA=[{'abilityId': 'ability_5386', 'rank': None}], abilityBarB=[{'abilityId': 'ability_2627', 'rank': None}],
        target={'count': 9, 'damageTypes': {'Acid': {'resistance': 5}}})
    populated['equipment'] = [{'slot': slot, 'item': {'kind': 'database', 'itemId': item_id},
        'candidateMods': [], 'sparks': {'mode': 'simulated', 'input': {'category': 'skill-damage', 'skillId': 'Druid', 'count': 10, 'seed': 'fixture'}}}
        for slot, item_id in [('Chest', 'item_42705'), ('Ring', 'item_49070')]]
    results = []
    with sync_playwright() as p:
        proxy = {'server': os.environ['HTTPS_PROXY'], 'bypass': '127.0.0.1,localhost'} if os.environ.get('HTTPS_PROXY') else None
        browser_env = dict(os.environ)
        if os.environ.get('CHROMIUM_TRUST_HOME'):
            browser_env['HOME'] = os.environ['CHROMIUM_TRUST_HOME']
        browser = p.chromium.launch(executable_path=shutil.which('chromium'), headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage'], proxy=proxy, env=browser_env)
        try:
            for mode, port in [('dev', 5186), ('preview', 4186)]:
                log = (output / f'{mode}.log').open('w')
                process = subprocess.Popen(['npm', 'run', mode, '--', '--host', '127.0.0.1', '--port', str(port), '--strictPort'], cwd=repo, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                origin = f'http://127.0.0.1:{port}'
                try:
                    for _ in range(100):
                        if process.poll() is not None:
                            raise RuntimeError('Server failed')
                        try:
                            with urlopen(origin, timeout=1):
                                break
                        except URLError:
                            time.sleep(0.1)
                    else:
                        raise RuntimeError('Server did not start')
                    for width in [1440, 375, 320]:
                        context = browser.new_context(viewport={'width': width, 'height': 1000})
                        page = context.new_page()
                        errors = []
                        page.on('pageerror', lambda error: errors.append(str(error)))
                        page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
                        decision = {'accept': True, 'messages': []}
                        def respond(dialog):
                            decision['messages'].append(dialog.message)
                            dialog.accept() if decision['accept'] else dialog.dismiss()
                        page.on('dialog', respond)
                        page.goto(origin)
                        expect(page.locator('#skill-A')).to_be_visible(timeout=30000)
                        page.evaluate('([key, pref, build]) => { localStorage.setItem(key, JSON.stringify(build)); localStorage.setItem(pref, JSON.stringify({schemaVersion:1, minimumEquipmentLevel:80})); localStorage.setItem("unrelated-owner", "keep"); }', [key, pref, populated])
                        page.reload()
                        expect(page.locator('#skill-A')).to_have_value('Druid')
                        def row(slot):
                            return page.locator(f'[data-equipment-row="{slot}"]')
                        def open_row(slot):
                            if not row(slot).evaluate('(e) => e.open'):
                                row(slot).locator(':scope > summary').click()
                        def saved():
                            return page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', key)
                        def wait_saved():
                            expect(page.locator('.save-status')).to_have_text('Saved in this browser')
                        def no_overflow():
                            if not page.evaluate('document.documentElement.scrollWidth <= innerWidth'):
                                page.screenshot(path=str(output / f'{mode}-{width}-overflow.png'), full_page=True)
                                offenders = page.locator('body *').evaluate_all('(es) => es.filter(e => e.getBoundingClientRect().right > innerWidth + 1 && e.getBoundingClientRect().width > 0).map(e => ({tag:e.tagName, cls:e.className, text:e.textContent.slice(0,100), width:e.getBoundingClientRect().width, right:e.getBoundingClientRect().right})).slice(0,25)')
                                raise AssertionError((width, offenders))
                        # Published per-item relevance is still strict by default.
                        open_row('Chest')
                        expect(row('Chest').locator('[data-mod-group="Druid"] [data-power-id]')).to_have_count(11)
                        stats = row('Chest').locator('.item-stats')
                        expect(stats).to_be_visible()
                        assert row('Chest').locator('.equipment-selection').evaluate('(e) => e.firstElementChild.className === "item-stats"')
                        details = row('Chest').locator('.item-details-source')
                        expect(details).not_to_have_attribute('open', '')
                        expect(details.locator('.item-meta')).not_to_be_visible()
                        # Import remains a separate session and does not overwrite existing build.
                        page.get_by_role('button', name='Import Character', exact=True).click()
                        page.locator('#character-file').set_input_files(str(repo / 'src/core/import/fixtures/character-sheet.json'))
                        page.locator('#storage-file').set_input_files({'name': 'Synthetic.json', 'mimeType': 'application/json', 'buffer': json.dumps(report).encode()})
                        page.get_by_role('button', name='Use these reports').click()
                        page.locator('.equipment-section > .section-heading button').click()
                        for slot in ['Head', 'Necklace']:
                            page.locator(f'[data-import-path="/Items/{0 if slot == "Head" else 1}"] .equipment-result-heading button').click()
                        page.get_by_role('button', name='Close equipment picker', exact=True).click()
                        wait_saved()
                        # One visible equipment-scoped search and a closed, keyboard-operable settings disclosure.
                        search = page.get_by_role('searchbox', name='Search treasure powers', exact=True)
                        settings = page.locator('.mod-browser-settings')
                        expect(search).to_have_count(1)
                        expect(settings).to_have_count(1)
                        expect(settings).not_to_have_attribute('open', '')
                        settings.locator('summary').focus(); page.keyboard.press('Enter')
                        expect(settings).to_have_attribute('open', '')
                        search.fill('lightning')
                        page.get_by_role('checkbox', name='Generic', exact=True).uncheck()
                        page.get_by_role('checkbox', name='All skills', exact=True).check()
                        page.get_by_role('checkbox', name='Other slots & profiles', exact=True).check()
                        target = page.get_by_label('Mod target level', exact=True)
                        target.fill('100')
                        for slot in ['Head', 'Chest', 'Ring', 'Necklace']:
                            open_row(slot)
                            expect(search).to_have_value('lightning')
                            expect(target).to_have_value('100')
                            expect(row(slot).locator('.available-effect').first).to_be_visible()
                            expect(row(slot).locator('input[type="search"], .mod-category-toggles')).to_have_count(0)
                            row(slot).locator(':scope > summary').click()
                        # Exact Max/90/100/custom previews; invalid values retain last valid preview.
                        open_row('Ring'); search.fill('power_10001')
                        power = row('Ring').locator('.mod-available-power[data-power-id="power_10001"]')
                        for value, tier in [('Max', 'id_12'), ('90', 'id_9'), ('100', 'id_10'), ('125', 'id_12')]:
                            target.fill(value); expect(power).to_have_attribute('data-preview-tier', tier)
                        for invalid in ['-1', '1.5', 'bad', '9007199254740992']:
                            target.fill(invalid)
                            expect(target).to_have_attribute('aria-invalid', 'true')
                            expect(power).to_have_attribute('data-preview-tier', 'id_12')
                            search.focus(); expect(target).to_have_value('125')
                        row('Ring').get_by_role('button', name='Replace Ring', exact=True).click()
                        minimum = page.locator('#minimum-target-level')
                        expect(minimum).to_have_value('80'); minimum.fill('90')
                        page.get_by_role('button', name='Close equipment picker', exact=True).click()
                        expect(target).to_have_value('125'); target.fill('90')
                        # Exact tier staging; selecting the same mod in another row remains independent.
                        power.locator(':scope > button').click(); wait_saved()
                        assert saved()['equipment'][1]['candidateMods'] == [{'powerId': 'power_10001', 'tierId': 'id_9'}]
                        row('Ring').get_by_role('button', name='Remove candidate 1', exact=True).click()
                        search.fill(''); open_row('Head')
                        head = row('Head'); metadata = head.locator('.item-details-source')
                        expect(head.locator('.item-stats')).to_be_visible()
                        expect(metadata).not_to_have_attribute('open', '')
                        expect(head.locator('.equipment-selection > .warning')).to_be_visible()
                        expect(metadata.locator('.imported-item-details')).not_to_be_visible()
                        metadata.locator(':scope > summary').focus(); page.keyboard.press('Enter')
                        evidence = metadata.locator('.imported-item-details')
                        expect(evidence).to_contain_text('Historical export evidence only')
                        expect(evidence).to_contain_text('FixtureUnknownPower')
                        expect(evidence).to_contain_text('Imbues (1)')
                        expect(metadata).to_contain_text('Published skill requirements')
                        original_source = evidence.text_content()
                        metadata.locator(':scope > summary').click()
                        # Effective imported edit/remove/restore keeps historical evidence unchanged.
                        head.get_by_label('Details and tier for imported mod 1', exact=True).click()
                        head.get_by_label('Tier for imported mod 1', exact=True).select_option('id_8')
                        expect(head.locator('[data-existing-power="0"]')).to_have_attribute('data-tier-id', 'id_8')
                        head.get_by_role('button', name='Remove imported mod 1', exact=True).click()
                        head.get_by_role('button', name='Restore Imported Mods', exact=True).click()
                        wait_saved()
                        assert evidence.text_content() == original_source
                        no_overflow()
                        # Save evidence with controls and expanded content at all requested widths.
                        search.scroll_into_view_if_needed()
                        page.screenshot(path=str(output / f'{mode}-{width}.png'), full_page=True)
                        # Cancel does not change even the serialized stored draft or status.
                        decision['accept'] = False
                        before = page.evaluate('(key) => localStorage.getItem(key)', key)
                        status = page.locator('.save-status').inner_text()
                        page.get_by_role('button', name='Clear build', exact=True).click()
                        page.wait_for_timeout(600)
                        assert page.evaluate('(key) => localStorage.getItem(key)', key) == before
                        expect(page.locator('.save-status')).to_have_text(status)
                        # Create stale skill Undo, then confirm a complete reset.
                        search.fill('power_14005'); open_row('Chest')
                        row('Chest').locator('.available-effect').click(); wait_saved()
                        page.locator('#skill-A').select_option('Cow')
                        expect(page.locator('.skill-change-notice button').first).to_have_text('Undo')
                        decision['accept'] = True
                        page.get_by_role('button', name='Clear build', exact=True).focus(); page.keyboard.press('Enter')
                        wait_saved()
                        assert saved() == default, saved()
                        expect(page.locator('.skill-change-notice button')).to_have_count(0)
                        expect(page.locator('.equipment-section > .section-heading button')).to_be_enabled()
                        page.locator('.equipment-section > .section-heading button').click()
                        expect(page.locator('[data-import-path]')).to_have_count(2)
                        page.get_by_role('button', name='Close equipment picker', exact=True).click()
                        assert page.evaluate('(pref) => JSON.parse(localStorage.getItem(pref)).minimumEquipmentLevel', pref) == 90
                        assert page.evaluate('localStorage.getItem("unrelated-owner")') == 'keep'
                        page.reload(); expect(page.locator('#skill-A')).to_have_value('')
                        expect(page.locator('.save-status')).to_have_text('Local draft restored')
                        assert saved() == default
                        no_overflow()
                        assert not errors, errors
                        results.append({'mode': mode, 'width': width, 'errors': errors, 'shared_controls': True, 'metadata_and_working_mods': True, 'confirmed_reset_and_refresh': True})
                        context.close()
                    for protected in ['schema', 'snapshot', 'read-failed']:
                        context = browser.new_context()
                        page = context.new_page(); page.goto(origin)
                        expect(page.locator('#skill-A')).to_be_visible(timeout=30000)
                        value = copy.deepcopy(populated)
                        if protected == 'schema':
                            value['schemaVersion'] = 2
                        if protected == 'snapshot':
                            value['gameDataVersion'] = 'unavailable'
                        page.evaluate('([key, value]) => localStorage.setItem(key, JSON.stringify(value))', [key, value])
                        if protected == 'read-failed':
                            page.add_init_script('const get = Storage.prototype.getItem; Storage.prototype.getItem = function(key) { if (key === "gorgonbuilder.current-draft") throw new Error("synthetic denied read"); return get.call(this, key); };')
                        page.reload(); expect(page.locator('.clear-build')).to_be_disabled(timeout=30000)
                        page.wait_for_timeout(600)
                        assert page.evaluate('JSON.parse(localStorage["gorgonbuilder.current-draft"])') == value
                        results.append({'mode': mode, 'protected': protected, 'reset_disabled': True})
                        context.close()
                finally:
                    os.killpg(process.pid, signal.SIGTERM); process.wait(timeout=10); log.close()
        finally:
            browser.close()
    (output / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
