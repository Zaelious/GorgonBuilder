"""T0009 real Chromium smoke in actual Vite dev and production preview.
Build first. Uses existing Python Playwright/Chromium; no npm dependency changes.
Writes screenshots, compressed-asset verification and interaction measurements.
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
    parser.add_argument('--output', default='/tmp/gorgonbuilder-equipment')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[3]
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((repo / 'src/generated/game-data/manifest.json').read_text())
    with gzip.open(repo / 'src/generated/game-data/itemsTreasure.json.gz') as file:
        items = json.load(file)['items']
    main_hand = [item for item in items if item['slot'] == 'MainHand' and item['level'] is not None and item['level'] >= 90]
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
            for mode, port in [('dev', 5175), ('preview', 4175)]:
                with (output / f'{mode}.log').open('w') as log:
                    process = subprocess.Popen(['npm', 'run', mode, '--', '--host', '127.0.0.1', '--port', str(port), '--strictPort'],
                        cwd=repo, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                    try:
                        origin = f'http://127.0.0.1:{port}'
                        for _ in range(200):
                            if process.poll() is not None:
                                raise RuntimeError(f'{mode} failed; see {log.name}')
                            try:
                                with urlopen(origin, timeout=1):
                                    break
                            except URLError:
                                time.sleep(0.1)
                        else:
                            raise RuntimeError(f'{mode} did not start')
                        context = browser.new_context(viewport={'width': 1440, 'height': 900})
                        page = context.new_page()
                        errors, urls, timings = [], [], []
                        page.on('pageerror', lambda error: errors.append(str(error)))
                        page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
                        page.on('response', lambda response: urls.append(response.url) if response.url.endswith('.gz') else None)
                        start = time.perf_counter()
                        page.goto(origin)
                        page.locator('.equipment-section').wait_for()
                        load_ms = (time.perf_counter() - start) * 1000
                        cdp = context.new_cdp_session(page)
                        cdp.send('Performance.enable')

                        def heap():
                            return next(metric['value'] for metric in cdp.send('Performance.getMetrics')['metrics'] if metric['name'] == 'JSHeapUsedSize')

                        cdp.send('HeapProfiler.collectGarbage')
                        loaded_heap = heap()
                        expect(page.locator('.equipment-primary > .equipment-row')).to_have_count(9)
                        expect(page.locator('[data-equipment-slot]')).to_have_count(18)
                        assert not page.locator('.equipment-other').evaluate('(element) => element.open')
                        expect(page.locator('.equipment-primary .equipment-row-name')).to_have_text(['No gear selected'] * 9)
                        for row in page.locator('.equipment-primary > .equipment-row').all():
                            assert row.bounding_box()['height'] <= 52
                            expect(row.locator(':scope > summary svg')).to_be_visible()
                        page.screenshot(path=str(output / f'{mode}-empty-desktop.png'), full_page=True)
                        empty_height = page.locator('.equipment-section').bounding_box()['height']
                        assert empty_height < 540, empty_height
                        responses = page.evaluate('''async urls => Promise.all([...new Set(urls)].map(async url => {
                            const response = await fetch(url); const bytes = await response.arrayBuffer();
                            return {url, status:response.status, headers:Object.fromEntries(response.headers), receivedBytes:bytes.byteLength,
                              sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('')};
                        }))''', urls)
                        assert len(responses) == 3, responses
                        for name, expected in manifest['artifacts'].items():
                            response = next(row for row in responses if f'/{name}.json' in row['url'])
                            assert response['status'] == 200 and response['receivedBytes'] == expected['bytes'], response
                            assert response['sha256'] == expected['sha256'], response
                            assert response['headers']['content-type'] == 'application/gzip', response
                            assert 'content-encoding' not in response['headers'], response

                        def saved():
                            return page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', key)

                        def wait_saved():
                            expect(page.locator('.save-status')).to_have_text('Saved in this browser')

                        last_opener = None

                        def browse(slot):
                            nonlocal last_opener
                            if slot == 'OffHandShield':
                                slot = 'OffHand'
                            row = page.locator(f'[data-equipment-row="{"OffHand" if slot == "OffHandShield" else slot}"]')
                            if row.locator('xpath=ancestor::details[contains(@class,"equipment-other")]').count() and not page.locator('.equipment-other').evaluate('(element) => element.open'):
                                page.locator('#other-equipment-summary').click()
                            if not row.evaluate('(element) => element.open'):
                                row.locator(':scope > summary').click()
                            replace = row.locator(f'[data-equipment-slot="{slot}"] .equipment-actions button').first
                            last_opener = replace if replace.count() else page.get_by_label(f'Browse {slot} items', exact=True)
                            last_opener.click()
                            expect(page.locator('#equipment-search')).to_be_focused()

                        def search(query):
                            start = time.perf_counter()
                            page.locator('#equipment-search').fill(query)
                            # Wait for the resulting DOM after the actual input event.
                            page.locator('.equipment-results-title').wait_for()
                            timings.append({'query': query, 'browserRoundTripMs': (time.perf_counter() - start) * 1000})

                        for slot, skill in [('A', 'Psychology'), ('B', 'Deer')]:
                            page.locator(f'#skill-{slot}').select_option(skill)
                            page.get_by_label(f'Open ability picker for bar {slot}', exact=True).click()
                            page.locator('.quick-add').first.click()
                        wait_saved()
                        baseline = saved()
                        # Empty primary rows are keyboard actionable; advanced slots stay collapsed.
                        for row in page.locator('.equipment-primary > .equipment-row').all():
                            summary = row.locator(':scope > summary')
                            summary.focus()
                            page.keyboard.press('Enter')
                            assert row.evaluate('(element) => element.open')
                            expect(row.get_by_role('button').first).to_be_visible()
                            page.keyboard.press('Enter')
                            assert not row.evaluate('(element) => element.open')
                        browse('Feet')
                        expect(page.locator('#minimum-target-level')).to_have_value('90')
                        expect(page.get_by_label('Include unknown target level', exact=True)).to_be_checked()
                        # Real pointer drag from search text to outside the dialog and a
                        # separate backdrop click must neither close it nor lose the query.
                        search('combat refresh')
                        box = page.locator('#equipment-search').bounding_box()
                        dialog_box = page.locator('dialog').bounding_box()
                        page.mouse.move(box['x'] + 15, box['y'] + box['height'] / 2)
                        page.mouse.down()
                        page.mouse.move(dialog_box['x'] - 15, box['y'] + box['height'] / 2, steps=15)
                        page.mouse.up()
                        expect(page.locator('dialog')).to_be_visible()
                        expect(page.locator('#equipment-search')).to_have_value('combat refresh')
                        page.mouse.click(2, 2)
                        expect(page.locator('dialog')).to_be_visible()
                        expect(page.locator('#equipment-search')).to_have_value('combat refresh')
                        search('item_40002')
                        expect(page.get_by_text('Unknown target level', exact=True)).to_be_visible()
                        page.get_by_label('Include unknown target level', exact=True).uncheck()
                        expect(page.get_by_text('No official equipment matches.', exact=False)).to_be_visible()
                        page.locator('#minimum-target-level').fill('')
                        expect(page.get_by_role('heading', name='Basic Boots', exact=True)).to_be_visible()
                        page.keyboard.press('Escape')
                        expect(last_opener).to_be_focused()
                        page.reload()
                        browse('Feet')
                        expect(page.locator('#minimum-target-level')).to_have_value('')
                        page.locator('#minimum-target-level').fill('90')
                        for term in ['lightning', 'electricity', 'psychic', 'taunt', 'kick', 'combat refresh']:
                            search(term)
                            if term != 'psychic':
                                expect(page.locator('.equipment-result').first).to_be_visible()
                        search('no-such-official-item')
                        expect(page.get_by_text('No official equipment matches.', exact=False)).to_be_visible()
                        page.keyboard.press('Escape')
                        assert saved() == baseline, 'Filters must not change the draft'

                        browse('MainHand')
                        search('item_45640')
                        expect(page.locator('dialog .item-meta')).to_have_text('Target level 90')
                        assert 'none published' not in page.locator('dialog .item-requirements').inner_text()
                        page.screenshot(path=str(output / f'{mode}-picker-desktop.png'), full_page=True)
                        page.locator('dialog').get_by_text('Description & official source', exact=True).click()
                        expect(page.locator('dialog .item-description')).to_be_visible()
                        expect(page.locator('dialog').get_by_role('link', name='items source', exact=True)).to_have_attribute('href', manifest['sources']['items']['sourceUrl'])
                        page.locator('dialog').get_by_text('Exact published fixed effects', exact=True).click()
                        expect(page.locator('dialog .item-more code').first).to_have_text(next(item for item in items if item['id'] == 'item_45640')['fixedEffects'][0]['description'])
                        page.locator('dialog').get_by_text('Description & official source', exact=True).click()
                        page.locator('.equipment-result-heading button').click()
                        wait_saved()
                        expect(page.locator('[data-equipment-row="MainHand"] > summary')).to_be_focused()
                        actual_icon = page.locator('[data-equipment-row="MainHand"] > summary img')
                        expect(actual_icon).to_have_attribute('src', 'https://cdn.projectgorgon.com/v490/icons/icon_15208.png')
                        expect(actual_icon).to_have_js_property('naturalWidth', 64)
                        browse('MainHand')
                        replacement = next(item for item in main_hand if item['id'] != 'item_45640')
                        search(replacement['id'])
                        page.locator('.equipment-result-heading button').click()
                        wait_saved()
                        # The same picker searches both canonical types. Every swap
                        # and reload must leave exactly one physical-position occupant.
                        offhand_swaps = []
                        for item_id, canonical_slot in [('item_45722', 'OffHand'), ('item_45052', 'OffHandShield'), ('item_45722', 'OffHand'), ('item_45052', 'OffHandShield')]:
                            browse('OffHand')
                            search(item_id)
                            expect(page.locator('dialog .item-meta').first).to_contain_text(canonical_slot)
                            page.locator('.equipment-result-heading button').click()
                            wait_saved()
                            page.reload()
                            page.locator('.equipment-section').wait_for()
                            offhands = [entry for entry in saved()['equipment'] if entry['slot'] in ['OffHand', 'OffHandShield']]
                            assert len(offhands) == 1, offhands
                            assert offhands[0]['slot'] == canonical_slot and offhands[0]['item'] == {'kind': 'database', 'itemId': item_id}, offhands
                            offhand_swaps.append({'itemId': item_id, 'slot': canonical_slot, 'occupantsAfterReload': len(offhands)})
                        shield_icon = page.locator('[data-equipment-row="OffHand"] > summary img')
                        expect(shield_icon).to_have_attribute('src', 'https://cdn.projectgorgon.com/v490/icons/icon_14009.png')
                        expect(shield_icon).to_have_js_property('naturalWidth', 64)
                        for slot, item_id in [('Head', next(item['id'] for item in items if item['slot'] == 'Head' and item['level'] == 90)), ('Ring', 'item_49070')]:
                            browse(slot)
                            search(item_id)
                            page.locator('.equipment-result-heading button').click()
                            wait_saved()
                            artwork = page.locator(f'[data-equipment-row="{slot}"] > summary img')
                            expected_icon = next(item['iconId'] for item in items if item['id'] == item_id)
                            expect(artwork).to_have_attribute('src', f'https://cdn.projectgorgon.com/v490/icons/icon_{expected_icon}.png')
                            expect(artwork).to_have_js_property('naturalWidth', 64)
                        selected = saved()
                        assert len(selected['equipment']) == 4
                        for field in baseline:
                            if field != 'equipment':
                                assert selected[field] == baseline[field], field
                        page.reload()
                        page.locator('.equipment-section').wait_for()
                        assert saved() == selected
                        # Advanced slots expose canonical controls without rewriting saved gear.
                        page.locator('#other-equipment-summary').click()
                        browse('Horseshoes')
                        expect(page.locator('dialog .eyebrow')).to_have_text('Horseshoes')
                        page.get_by_label('Close equipment picker', exact=True).click()
                        expect(last_opener).to_be_focused()
                        page.locator('#other-equipment-summary').click()
                        page.screenshot(path=str(output / f'{mode}-overview-desktop.png'), full_page=True)

                        # Expanded normal rows keep identity/artwork only in the
                        # persistent summary. Facts and edit actions remain available.
                        for slot in ['Head', 'Ring', 'MainHand', 'OffHand']:
                            row = page.locator(f'[data-equipment-row="{slot}"]')
                            row.locator(':scope > summary').click()
                            expect(row.locator('.equipment-icon')).to_have_count(1)
                            expect(row.locator('.equipment-row-content .equipment-icon, .equipment-selection-heading')).to_have_count(0)
                            expect(row.locator('.item-facts')).to_be_visible()
                            expect(row.locator('.equipment-actions button')).to_have_count(2)
                            if slot == 'OffHand':
                                page.screenshot(path=str(output / f'{mode}-compact-offhand-desktop.png'), full_page=True)
                            row.locator(':scope > summary').click()

                        # Empty/multi-page filtering and native keyboard focus containment.
                        browse('MainHand')
                        page.locator('#minimum-target-level').fill('')
                        search('')
                        expect(page.locator('.equipment-result')).to_have_count(10)
                        page.get_by_role('button', name='Next', exact=True).click()
                        expect(page.locator('.equipment-results-title')).to_contain_text('Page 2')
                        expect(page.locator('.equipment-results-title')).to_be_focused()
                        page.locator('#equipment-search').focus()
                        page.keyboard.press('Shift+Tab')
                        expect(page.get_by_label('Close equipment picker', exact=True)).to_be_focused()
                        page.keyboard.press('Shift+Tab')
                        assert page.evaluate("document.querySelector('dialog').contains(document.activeElement)")
                        page.keyboard.press('Escape')
                        expect(last_opener).to_be_focused()

                        # Changed filters retain equipment, including after reload.
                        browse('MainHand')
                        page.locator('#minimum-target-level').fill('999')
                        page.get_by_label('Include unknown target level', exact=True).uncheck()
                        expect(page.locator('.equipment-result')).to_have_count(0)
                        page.keyboard.press('Escape')
                        page.reload()
                        page.locator('.equipment-section').wait_for()
                        assert saved() == selected
                        browse('MainHand')
                        expect(page.locator('#minimum-target-level')).to_have_value('999')
                        page.locator('#minimum-target-level').fill('90')

                        page.set_viewport_size({'width': 375, 'height': 812})
                        search('item_45640')
                        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
                        assert page.locator('dialog').bounding_box()['width'] <= 375
                        page.screenshot(path=str(output / f'{mode}-picker-mobile.png'), full_page=True)
                        page.keyboard.press('Escape')
                        row = page.locator('[data-equipment-row="OffHand"]')
                        if not row.evaluate('(element) => element.open'):
                            row.locator(':scope > summary').click()
                        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
                        page.screenshot(path=str(output / f'{mode}-compact-offhand-mobile.png'), full_page=True)
                        page.get_by_role('button', name='Clear OffHandShield', exact=True).click()
                        wait_saved()
                        page.reload()
                        page.locator('.equipment-section').wait_for()
                        assert len(saved()['equipment']) == 3
                        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
                        page.screenshot(path=str(output / f'{mode}-overview-mobile.png'), full_page=True)
                        expect(page.get_by_role('alert')).to_have_count(0)
                        assert not errors, errors
                        workflow_heap = heap()
                        cdp.send('HeapProfiler.collectGarbage')
                        retained_heap = heap()
                        results.append({'mode': mode, 'loadMs': load_ms, 'emptyEquipmentHeight': empty_height,
                            'searchInteractions': timings, 'compressedAssets': responses, 'browserErrors': errors,
                            'chromiumVersion': browser.version,
                            'heapBytes': {'loadedAfterGc': loaded_heap, 'afterWorkflowBeforeGc': workflow_heap, 'afterWorkflowAfterGc': retained_heap},
                            'offhandSwaps': offhand_swaps,
                            'workflow': 'nine primary rows; all 19 official item slot types in 18 positions; compact details; exclusive offhand swaps/reloads; icons; advanced slots; drag/backdrop retention; filters/persistence; focus/Escape/X; desktop/mobile passed'})

                        # Seed an existing schema-v1 conflict, as an older accepted
                        # app could save both types. Restoration must preserve bytes;
                        # only a named, confirmed keep/remove action resolves it.
                        legacy = saved()
                        preserved_equipment = list(legacy['equipment'])
                        legacy['equipment'] += [
                            {'slot': 'OffHand', 'item': {'kind': 'manual', 'instance': {'baseItemId': 'item_45722', 'displayName': 'Legacy weapon', 'existingPowers': [], 'metadata': {'retainUntilConfirmed': True}}}, 'candidateMods': [{'powerId': 'power_10001', 'tierId': None}], 'sparks': {'mode': 'none'}},
                            {'slot': 'OffHandShield', 'item': {'kind': 'imported', 'instance': {'baseItemId': 'item_45052', 'displayName': 'Legacy shield', 'existingPowers': [{'powerId': 'power_129', 'tierId': 'id_120'}], 'metadata': {'retained': ['original', 42]}}}, 'candidateMods': [{'powerId': 'power_10001', 'tierId': 'id_9'}], 'sparks': {'mode': 'simulated', 'input': {'category': 'skill-damage', 'skillId': 'Psychology', 'count': 12, 'seed': 'keep'}}},
                        ]
                        legacy_bytes = json.dumps(legacy)
                        page.evaluate('([key,value]) => localStorage.setItem(key,value)', [key, legacy_bytes])
                        page.reload()
                        page.locator('.equipment-section').wait_for()
                        page.wait_for_timeout(600)
                        assert page.evaluate('(key) => localStorage.getItem(key)', key) == legacy_bytes
                        row = page.locator('[data-equipment-row="OffHand"]')
                        expect(row.locator(':scope > summary')).to_contain_text('Conflict · 2 saved')
                        row.locator(':scope > summary').click()
                        expect(row.get_by_role('alert')).to_contain_text('All entries are retained')
                        for button in row.get_by_role('button', name='Replace OffHand', exact=True).all():
                            expect(button).to_be_disabled()
                        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
                        page.screenshot(path=str(output / f'{mode}-legacy-conflict-mobile.png'), full_page=True)
                        page.set_viewport_size({'width': 1440, 'height': 900})
                        page.screenshot(path=str(output / f'{mode}-legacy-conflict-desktop.png'), full_page=True)
                        # An unrelated committed edit must retain every conflict entry.
                        page.locator('#level-A').fill('91')
                        wait_saved()
                        assert saved()['equipment'] == legacy['equipment']
                        decision, confirmations = {'accept': False}, []

                        def confirm(dialog):
                            confirmations.append(dialog.message)
                            if decision['accept']:
                                dialog.accept()
                            else:
                                dialog.dismiss()

                        page.on('dialog', confirm)
                        keep_index = len(legacy['equipment']) - 1
                        keep = row.locator(f'[data-selection-index="{keep_index}"] .equipment-actions button').last
                        before_resolution = page.evaluate('(key) => localStorage.getItem(key)', key)
                        keep.click()
                        assert page.evaluate('(key) => localStorage.getItem(key)', key) == before_resolution
                        assert 'Legacy weapon' in confirmations[-1] and 'Spark settings' in confirmations[-1]
                        decision['accept'] = True
                        keep.click()
                        wait_saved()
                        page.reload()
                        page.locator('.equipment-section').wait_for()
                        kept = legacy['equipment'][-1]
                        assert saved()['equipment'] == preserved_equipment + [kept]
                        assert saved()['abilityBarA'] == baseline['abilityBarA'] and saved()['abilityBarB'] == baseline['abilityBarB']
                        expect(page.locator('[data-equipment-row="OffHand"] > summary')).not_to_contain_text('Conflict')
                        # Cross-type replacement of the kept imported instance also
                        # requires confirmation; associated planning data is preserved.
                        decision['accept'] = False
                        browse('OffHand')
                        search('item_45722')
                        page.locator('.equipment-result-heading button').click()
                        assert saved()['equipment'] == preserved_equipment + [kept]
                        expect(page.locator('dialog')).to_be_visible()
                        decision['accept'] = True
                        page.locator('.equipment-result-heading button').click()
                        wait_saved()
                        page.reload()
                        page.locator('.equipment-section').wait_for()
                        swapped = {**kept, 'slot': 'OffHand', 'item': {'kind': 'database', 'itemId': 'item_45722'}}
                        assert saved()['equipment'] == preserved_equipment + [swapped]
                        expect(page.get_by_role('alert')).to_have_count(0)
                        assert not errors, errors
                        results[-1]['legacyConflict'] = {'restoreBytesPreserved': True, 'unrelatedEditPreservedEntries': True, 'cancelPreserved': True,
                            'confirmedKeepPreservedInstanceModsSparks': True, 'confirmedCrossTypeSwapPreservedModsSparks': True, 'confirmationMessages': confirmations}
                        results[-1]['browserErrors'] = list(errors)
                        context.close()

                        # A deliberate CDN 404 tests the actual image error path in an
                        # isolated context. Its expected network console error is recorded
                        # separately from the zero-error normal workflow above.
                        fallback_context = browser.new_context(viewport={'width': 1440, 'height': 900})
                        fallback_document = dict(baseline)
                        fallback_document['equipment'] = [{'slot': 'MainHand', 'item': {'kind': 'database', 'itemId': 'item_45640'}, 'candidateMods': [], 'sparks': {'mode': 'none'}}]
                        fallback_context.add_init_script(f'localStorage.setItem({json.dumps(key)}, {json.dumps(json.dumps(fallback_document))});')
                        fallback_context.route('**/icons/icon_15208.png', lambda route: route.fulfill(status=404, content_type='image/png', body=''))
                        fallback_page = fallback_context.new_page()
                        fallback_errors, fallback_console = [], []
                        fallback_page.on('pageerror', lambda error: fallback_errors.append(str(error)))
                        fallback_page.on('console', lambda message: fallback_console.append(message.text) if message.type == 'error' else None)
                        fallback_page.goto(origin)
                        summary = fallback_page.locator('[data-equipment-row="MainHand"] > summary')
                        summary.scroll_into_view_if_needed()
                        expect(summary.locator('.equipment-icon-fallback')).to_be_visible()
                        expect(summary.locator('img')).to_have_count(0)
                        expect(summary).to_contain_text("Nopec's Dreaded Dagger of Endless Nights")
                        fallback_page.screenshot(path=str(output / f'{mode}-icon-fallback.png'), full_page=True)
                        assert not fallback_errors, fallback_errors
                        assert all('404' in message for message in fallback_console), fallback_console
                        results[-1]['iconFallback'] = {'forcedStatus': 404, 'fallbackVisible': True, 'pageErrors': fallback_errors, 'expectedNetworkConsoleErrors': fallback_console}
                        fallback_context.close()
                    finally:
                        os.killpg(process.pid, signal.SIGTERM)
                        process.wait(timeout=10)
        finally:
            browser.close()
    (output / 'results.json').write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))
    print(f'PASS equipment workflow in Vite dev and preview. Artifacts: {output}')


if __name__ == '__main__':
    main()
