"""T0010 revised inline editor: real Chromium dev/production-preview workflow. Build first.
Uses installed Python Playwright/Chromium; adds no project dependencies.
"""
import argparse
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
    parser.add_argument('--output', default='/tmp/gorgonbuilder-mods')
    output = Path(parser.parse_args().output)
    output.mkdir(parents=True, exist_ok=True)
    repo = Path(__file__).resolve().parents[3]
    treasure = json.load(gzip.open(repo / 'src/generated/game-data/itemsTreasure.json.gz'))
    head = next(i for i in treasure['items'] if i['slot'] == 'Head' and (i['level'] or 0) >= 90)
    key = 'gorgonbuilder.current-draft'
    results = []
    with sync_playwright() as playwright:
        proxy = {'server': os.environ['HTTPS_PROXY'], 'bypass': '127.0.0.1,localhost'} if os.environ.get('HTTPS_PROXY') else None
        browser_env = dict(os.environ)
        if os.environ.get('CHROMIUM_TRUST_HOME'):
            browser_env['HOME'] = os.environ['CHROMIUM_TRUST_HOME']
        browser = playwright.chromium.launch(executable_path=shutil.which('chromium'), headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage'], proxy=proxy, env=browser_env)
        try:
            for mode, port in [('dev', 5176), ('preview', 4176)]:
                with (output / f'{mode}.log').open('w') as log:
                    process = subprocess.Popen(['npm', 'run', mode, '--', '--host', '127.0.0.1', '--port', str(port), '--strictPort'], cwd=repo,
                        stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                    try:
                        origin = f'http://127.0.0.1:{port}'
                        for _ in range(200):
                            try:
                                with urlopen(origin, timeout=1):
                                    break
                            except URLError:
                                assert process.poll() is None
                                time.sleep(0.1)
                        else:
                            raise RuntimeError('Vite did not start')
                        context = browser.new_context(viewport={'width': 1440, 'height': 900})
                        page = context.new_page()
                        errors, timings = [], []
                        page.on('pageerror', lambda error: errors.append(str(error)))
                        page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
                        start = time.perf_counter()
                        page.goto(origin)
                        page.locator('.equipment-section').wait_for()
                        load_ms = (time.perf_counter() - start) * 1000
                        cdp = context.new_cdp_session(page)
                        cdp.send('Performance.enable')

                        def heap():
                            cdp.send('HeapProfiler.collectGarbage')
                            return next(m['value'] for m in cdp.send('Performance.getMetrics')['metrics'] if m['name'] == 'JSHeapUsedSize')

                        heap_loaded = heap()

                        def saved():
                            return page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', key)

                        def wait_saved():
                            expect(page.locator('.save-status')).to_have_text('Saved in this browser')

                        def row(slot):
                            element = page.locator(f'[data-equipment-row="{slot}"]')
                            if not element.evaluate('(e) => e.open'):
                                element.locator(':scope > summary').click()
                            return element

                        def equip(slot, item_id):
                            element = row(slot)
                            replace = element.locator('.equipment-actions button').first
                            if replace.count():
                                replace.click()
                            else:
                                page.get_by_label(f'Browse {slot} items', exact=True).click()
                            page.locator('#equipment-search').fill(item_id)
                            page.locator('.equipment-result-heading button').first.click()
                            wait_saved()

                        def no_overflow():
                            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                            if page.locator('dialog').count():
                                assert page.locator('dialog').evaluate('(e) => e.scrollWidth <= e.clientWidth + 1')

                        def editor(index=0):
                            return page.locator(f'[data-selection-index="{index}"] .mod-planner')

                        def expand(slot):
                            row(slot)

                        def inline_search(value, index=0):
                            start = time.perf_counter()
                            editor(index).get_by_label('Search treasure powers', exact=True).fill(value)
                            timings.append({'action': value, 'ms': (time.perf_counter() - start) * 1000})

                        def preview_level(value, index=0):
                            editor(index).get_by_label('Mod target level', exact=True).fill(value)

                        def power(power_id='power_10001', index=0):
                            return editor(index).locator(f'[data-power-id="{power_id}"]')

                        def add(power_id='power_10001', index=0):
                            power(power_id, index).locator(':scope > .available-effect').click()

                        # Empty Available is mandatory until a combat skill is selected.
                        equip('Head', head['id'])
                        expect(editor().get_by_text('Select a combat skill to view mods.', exact=True)).to_be_visible()
                        expect(editor().locator('[data-power-id]')).to_have_count(0)
                        expect(page.locator('.skill-filter, [id^="skill-search"]')).to_have_count(0)
                        for slot, skill in [('A', 'Archery'), ('B', 'Cow')]:
                            page.locator(f'#skill-{slot}').select_option(skill)
                            page.get_by_label(f'Open ability picker for bar {slot}', exact=True).click()
                            page.locator('.quick-add').first.click()
                        wait_saved()
                        equip('Ring', 'item_49070')
                        equip('OffHand', 'item_45052')
                        baseline = saved()
                        expand('Head')
                        expect(editor().locator('[data-mod-group="Archery"]')).to_have_count(1)
                        expect(editor().locator('[data-mod-group="Cow"]')).to_have_count(1)
                        assert len(editor().locator('.mod-category-toggles input:checked').all()) == 3
                        for name, group in [('Generic', 'AnySkill'), ('Endurance', 'Endurance'), ('Shamanic Infusions', 'ShamanicInfusion')]:
                            editor().get_by_role('checkbox', name=name, exact=True).uncheck()
                            expect(editor().locator(f'[data-mod-group="{group}"]')).to_have_count(0)
                            editor().get_by_role('checkbox', name=name, exact=True).check()
                        profile_orders = []
                        for index, slot in [(0, 'Head'), (1, 'Ring'), (2, 'OffHand')]:
                            expand(slot)
                            profile_orders.append(editor(index).locator('[data-mod-group="Archery"] [data-power-id]').evaluate_all('(es) => es.map(e => e.dataset.powerId)'))
                        assert profile_orders[0] != profile_orders[2]
                        # Max and each numeric target stage the exact visible tier.
                        inline_search('power_10001')
                        expect(power()).to_have_attribute('data-preview-tier', 'id_12')
                        assert power().locator(':scope > button').inner_text().startswith('{MOD_SKILL_ARCHERY}{0.6}')
                        add()
                        expect(page.locator('[data-selection-index="0"] [data-candidate-effect="0"]')).to_contain_text('CANDIDATE · Archery')
                        preview_level('90')
                        expect(power()).to_have_attribute('data-preview-tier', 'id_9')
                        expect(editor().get_by_label('Tier for candidate 1', exact=True)).to_have_value('id_12')
                        expect(editor().locator('.mod-mismatch').first).to_be_visible()
                        for _ in range(7):
                            add()
                        preview_level('100')
                        expect(power()).to_have_attribute('data-preview-tier', 'id_10')
                        add()
                        expected_mods = [{'powerId': 'power_10001', 'tierId': 'id_12'}] + [{'powerId': 'power_10001', 'tierId': 'id_9'} for _ in range(7)] + [{'powerId': 'power_10001', 'tierId': 'id_10'}]
                        wait_saved()
                        assert saved()['equipment'][0]['candidateMods'] == expected_mods
                        editor().get_by_label('Tier for candidate 1', exact=True).select_option('id_11')
                        expected_mods[0]['tierId'] = 'id_11'
                        expect(page.locator('[data-selection-index="0"] [data-candidate-effect="0"]')).to_contain_text('{MOD_SKILL_ARCHERY}{0.55}')
                        editor().get_by_label('Move candidate 1 down', exact=True).focus()
                        page.keyboard.press('Enter')
                        expected_mods[0], expected_mods[1] = expected_mods[1], expected_mods[0]
                        expect(editor().locator('[data-mod-index="1"]')).to_be_focused()
                        editor().get_by_label('Remove candidate 3', exact=True).click()
                        expected_mods.pop(2)
                        editor().get_by_label('Tier for candidate 2', exact=True).select_option('')
                        expected_mods[1]['tierId'] = None
                        wait_saved()
                        assert saved()['equipment'][0]['candidateMods'] == expected_mods
                        expect(page.locator('[data-selection-index="0"] [data-candidate-effect]')).to_have_count(8)
                        preview_level('90')
                        power().locator(':scope > details > summary').click()
                        expect(power().locator(':scope > details > summary')).to_contain_text('3 tier options')
                        expect(power().locator('.mod-association')).to_have_text('Skill: Archery')
                        power().locator(':scope > details > summary').click()
                        heap_with_mods = heap()
                        inline_search('')
                        editor().locator('.candidate-list').evaluate('(e) => e.scrollTop = 0')
                        editor().screenshot(path=str(output / f'{mode}-inline-desktop.png'))
                        page.screenshot(path=str(output / f'{mode}-page-desktop.png'), full_page=True)
                        # Target changes are transient; complete restored build differs only in candidates.
                        page.reload(); page.locator('.equipment-section').wait_for(); expand('Head')
                        assert saved()['equipment'][0]['candidateMods'] == expected_mods
                        restored = saved(); restored['equipment'][0]['candidateMods'] = []
                        assert restored == baseline
                        expect(editor().get_by_label('Mod target level', exact=True)).to_have_value('Max')
                        # Skill changes update groups immediately, retaining all candidates.
                        page.locator('#skill-B').select_option('Archery')
                        expect(editor().locator('[data-mod-group="Archery"]')).to_have_count(1)
                        expect(editor().locator('[data-mod-group="Cow"]')).to_have_count(0)
                        page.locator('#skill-A').select_option('')
                        page.locator('#skill-B').select_option('')
                        expect(editor().locator('[data-power-id]')).to_have_count(0)
                        expect(editor().get_by_text('Select a combat skill to view mods.', exact=True)).to_be_visible()
                        expect(editor().locator('[data-mod-index]')).to_have_count(8)
                        wait_saved()
                        # Restore original bars then test source-unknown exploration and mobile stacking.
                        rich = baseline
                        rich['equipment'][0]['candidateMods'] = expected_mods
                        rich['equipment'][0]['item'] = {'kind': 'imported', 'instance': {'baseItemId': head['id'], 'metadata': {'keep': True}, 'existingPowers': [{'powerId': 'power_129', 'tierId': 'id_120'}]}}
                        rich['equipment'][0]['sparks'] = {'mode': 'simulated', 'input': {'category': 'skill-damage', 'skillId': 'Cow', 'count': 11, 'seed': 'keep'}}
                        rich['equipment'][0]['candidateMods'].append({'powerId': 'missing-power', 'tierId': 'missing-tier'})
                        page.evaluate('([key, build]) => localStorage.setItem(key, JSON.stringify(build))', [key, rich])
                        page.reload(); page.locator('.equipment-section').wait_for(); expand('Head')
                        expect(editor().locator('.candidate-list')).to_contain_text('Official power unavailable')
                        editor().get_by_label('Tier for candidate 1', exact=True).select_option('id_10')
                        wait_saved(); rich['equipment'][0]['candidateMods'][0]['tierId'] = 'id_10'
                        assert saved() == rich
                        expect(page.locator('[data-selection-index="0"] .existing-powers')).to_contain_text('power_129 / id_120')
                        editor().get_by_label('All skills', exact=True).check()
                        for query in ['Psychology', 'Cow', 'Unarmed']:
                            inline_search(query)
                            assert editor().locator('[data-power-id]').count() > 0
                        inline_search('power_13501')
                        power('power_13501').locator(':scope > details > summary').click()
                        expect(power('power_13501').locator('.mod-association')).to_contain_text('Unknown — association unknown')
                        power('power_13501').locator(':scope > details > summary').click()
                        page.set_viewport_size({'width': 375, 'height': 812})
                        inline_search('power_10001'); preview_level('100')
                        no_overflow()
                        assert editor().evaluate('(e) => e.scrollWidth <= e.clientWidth + 1')
                        columns = editor().locator('.mod-columns').bounding_box()
                        available_box = editor().locator('.mod-available').bounding_box()
                        selected_box = editor().locator('.mod-selected').bounding_box()
                        assert selected_box['y'] >= available_box['y'] + available_box['height']
                        assert columns['width'] <= 375
                        editor().locator('.candidate-list').evaluate('(e) => e.scrollTop = 0')
                        editor().screenshot(path=str(output / f'{mode}-inline-mobile.png'))
                        page.screenshot(path=str(output / f'{mode}-page-mobile.png'), full_page=True)
                        # A mismatched snapshot is inspectable but never writable.
                        rich['gameDataVersion'] = 'other-version'
                        page.evaluate('([key, build]) => localStorage.setItem(key, JSON.stringify(build))', [key, rich])
                        page.reload(); page.locator('.equipment-section').wait_for(); expand('Head')
                        inline_search('power_10001'); preview_level('90')
                        expect(power().locator(':scope > button')).to_be_disabled()
                        assert all(e.is_disabled() for e in editor().locator('.candidate-list button, .candidate-list select').all())
                        page.wait_for_timeout(600); assert saved() == rich
                        assert errors == [], errors
                        results.append({'chromiumVersion': browser.version, 'heapAfterGc': {'loaded': heap_loaded, 'withModEditor': heap_with_mods}, 'mode': mode,
                            'loadMs': load_ms, 'timings': timings, 'profileOrders': profile_orders, 'candidateCountAfterEdits': 8, 'errors': errors})
                        context.close()
                    finally:
                        os.killpg(process.pid, signal.SIGTERM)
                        process.wait(timeout=10)
        finally:
            browser.close()
    (output / 'results.json').write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
