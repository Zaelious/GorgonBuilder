"""T0010 real Chromium dev/production-preview workflow. Build first.
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
    powers = {p['id']: p for p in treasure['treasurePowers']}
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

                        def open_mods(index, slot):
                            row(slot)
                            opener = page.get_by_label(f'Plan candidate mods for equipment {index + 1}', exact=True)
                            opener.focus()
                            start = time.perf_counter()
                            page.keyboard.press('Enter')
                            expect(page.locator('#mod-search')).to_be_focused()
                            timings.append({'action': 'open', 'ms': (time.perf_counter() - start) * 1000})
                            return opener

                        def search(value):
                            start = time.perf_counter()
                            page.locator('#mod-search').fill(value)
                            page.locator('.mod-results-title').wait_for()
                            timings.append({'action': value, 'ms': (time.perf_counter() - start) * 1000})

                        def staged():
                            page.locator('dialog [aria-label="Mod planner views"] button').nth(1).click()

                        def close_mods():
                            page.keyboard.press('Escape')
                            expect(page.locator('dialog')).to_have_count(0)

                        def no_overflow():
                            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                            if page.locator('dialog').count():
                                assert page.locator('dialog').evaluate('(e) => e.scrollWidth <= e.clientWidth + 1')

                        for slot, skill in [('A', 'Cow'), ('B', 'Unarmed')]:
                            page.locator(f'#skill-{slot}').select_option(skill)
                            page.get_by_label(f'Open ability picker for bar {slot}', exact=True).click()
                            page.locator('.quick-add').first.click()
                        wait_saved()
                        equip('Head', head['id'])
                        equip('Ring', 'item_49070')
                        equip('OffHand', 'item_45052')
                        baseline = saved()
                        profile_orders = []
                        for index, slot in [(0, 'Head'), (1, 'Ring'), (2, 'OffHand')]:
                            opener = open_mods(index, slot)
                            profile_orders.append(page.locator('.mod-power').evaluate_all('(es) => es.map(e => e.dataset.powerId)'))
                            page.get_by_label('Power browsing', exact=True).select_option('all')
                            for query in ['Psychology', 'Cow', 'Unarmed']:
                                search(query)
                                assert page.locator('.mod-power').count() > 0
                            close_mods()
                            expect(opener).to_be_focused()
                        assert profile_orders[0] != profile_orders[2]
                        opener = open_mods(2, 'OffHand')
                        expected_mods = []
                        for power_id in ['power_4001', 'power_20001', 'power_3001']:
                            search(power_id)
                            expect(page.locator('.mod-association')).to_have_text(f"Skill: {powers[power_id]['skill']['sourceId']}")
                            tier_id = 'id_10'
                            page.get_by_label(f'Published tier for {power_id}', exact=True).select_option(tier_id)
                            tier = next(t for t in powers[power_id]['tiers'] if t['id'] == tier_id)
                            expect(page.locator('dialog .mod-tier-facts li').first).to_have_text(tier['effectDescriptions'][0])
                            page.get_by_label(f'Stage {power_id}', exact=True).click()
                            expected_mods.append({'powerId': power_id, 'tierId': tier_id})
                        page.get_by_label('Published tier for power_3001', exact=True).select_option('')
                        for _ in range(10):
                            page.get_by_label('Stage power_3001', exact=True).click()
                            expected_mods.append({'powerId': 'power_3001', 'tierId': None})
                        wait_saved()
                        page.get_by_label('Published tier for power_3001', exact=True).select_option('id_10')
                        page.locator('dialog').evaluate('(e) => e.scrollTop = 0')
                        page.screenshot(path=str(output / f'{mode}-browse-desktop.png'))
                        staged()
                        page.locator('dialog').get_by_label('Tier for candidate 1', exact=True).select_option('id_12')
                        expected_mods[0]['tierId'] = 'id_12'
                        move = page.locator('dialog').get_by_label('Move candidate 1 down', exact=True)
                        move.focus()
                        page.keyboard.press('Enter')
                        expected_mods[0], expected_mods[1] = expected_mods[1], expected_mods[0]
                        expect(page.locator('dialog [data-mod-index="1"]')).to_be_focused()
                        page.locator('dialog').get_by_label('Remove candidate 3', exact=True).click()
                        expected_mods.pop(2)
                        page.locator('dialog').get_by_label('Tier for candidate 2', exact=True).select_option('')
                        expected_mods[1]['tierId'] = None
                        wait_saved()
                        assert saved()['equipment'][2]['candidateMods'] == expected_mods
                        heap_with_mods = heap()
                        page.locator('dialog').evaluate('(e) => e.scrollTop = 0')
                        page.screenshot(path=str(output / f'{mode}-staged-desktop.png'))
                        page.set_viewport_size({'width': 375, 'height': 812})
                        no_overflow()
                        page.locator('dialog').evaluate('(e) => e.scrollTop = 0')
                        page.screenshot(path=str(output / f'{mode}-staged-mobile.png'))
                        close_mods()
                        expect(opener).to_be_focused()
                        page.reload()
                        page.locator('.equipment-section').wait_for()
                        restored = saved()
                        assert restored['equipment'][2]['candidateMods'] == expected_mods
                        restored['equipment'][2]['candidateMods'] = []
                        assert restored == baseline
                        open_mods(2, 'OffHand')
                        search('power_13501')
                        expect(page.locator('.mod-association')).to_contain_text('Unknown — association unknown')
                        page.get_by_label('Published tier for power_13501', exact=True).select_option('id_1')
                        expect(page.locator('dialog .mod-tier-facts li').first).to_have_text(powers['power_13501']['tiers'][0]['effectDescriptions'][0])
                        no_overflow()
                        page.screenshot(path=str(output / f'{mode}-browse-mobile.png'))
                        close_mods()
                        page.set_viewport_size({'width': 1440, 'height': 900})
                        # Import/manual powers, unknown saved IDs and Sparks survive edits.
                        rich = saved()
                        rich['equipment'][2]['item'] = {'kind': 'imported', 'instance': {'baseItemId': 'item_45052', 'metadata': {'keep': True}, 'existingPowers': [{'powerId': 'power_129', 'tierId': 'id_120'}]}}
                        rich['equipment'][2]['sparks'] = {'mode': 'simulated', 'input': {'category': 'skill-damage', 'skillId': 'Cow', 'count': 11, 'seed': 'keep'}}
                        rich['equipment'][2]['candidateMods'].append({'powerId': 'missing-power', 'tierId': 'missing-tier'})
                        page.evaluate('([key, build]) => localStorage.setItem(key, JSON.stringify(build))', [key, rich])
                        page.reload(); page.locator('.equipment-section').wait_for()
                        open_mods(2, 'OffHand'); staged()
                        expect(page.locator('dialog .candidate-list')).to_contain_text('Official power unavailable')
                        page.locator('dialog').get_by_label('Tier for candidate 1', exact=True).select_option('id_11')
                        wait_saved()
                        rich['equipment'][2]['candidateMods'][0]['tierId'] = 'id_11'
                        assert saved() == rich
                        close_mods()
                        expect(row('OffHand').locator('.existing-powers')).to_contain_text('power_129 / id_120')
                        # A mismatched snapshot is inspectable but never writable.
                        rich['gameDataVersion'] = 'other-version'
                        page.evaluate('([key, build]) => localStorage.setItem(key, JSON.stringify(build))', [key, rich])
                        page.reload(); page.locator('.equipment-section').wait_for()
                        open_mods(2, 'OffHand'); search('power_4001')
                        expect(page.get_by_label('Stage power_4001', exact=True)).to_be_disabled()
                        staged()
                        assert all(e.is_disabled() for e in page.locator('dialog .candidate-list button, dialog .candidate-list select').all())
                        page.wait_for_timeout(600)
                        assert saved() == rich
                        assert errors == [], errors
                        results.append({'chromiumVersion': browser.version, 'heapAfterGc': {'loaded': heap_loaded, 'withModDialog': heap_with_mods}, 'mode': mode, 'loadMs': load_ms, 'timings': timings, 'profileOrders': profile_orders, 'candidateCount': len(expected_mods), 'errors': errors})
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
