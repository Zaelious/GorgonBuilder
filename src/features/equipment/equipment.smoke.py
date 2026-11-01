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
                        page.locator('#equipment-slot').wait_for()
                        load_ms = (time.perf_counter() - start) * 1000
                        cdp = context.new_cdp_session(page)
                        cdp.send('Performance.enable')

                        def heap():
                            return next(metric['value'] for metric in cdp.send('Performance.getMetrics')['metrics'] if metric['name'] == 'JSHeapUsedSize')

                        cdp.send('HeapProfiler.collectGarbage')
                        loaded_heap = heap()
                        expect(page.locator('#equipment-slot option')).to_have_count(19)
                        expect(page.get_by_text('No equipment selected.', exact=False)).to_be_visible()
                        empty_height = page.locator('.equipment-section').bounding_box()['height']
                        assert empty_height < 180, empty_height
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

                        def browse(slot):
                            page.locator('#equipment-slot').select_option(slot)
                            page.get_by_role('button', name='Browse items', exact=True).click()
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
                        browse('Feet')
                        expect(page.locator('#minimum-target-level')).to_have_value('90')
                        expect(page.get_by_label('Include unknown target level', exact=True)).to_be_checked()
                        search('item_40002')
                        expect(page.get_by_text('Unknown target level', exact=True)).to_be_visible()
                        page.get_by_label('Include unknown target level', exact=True).uncheck()
                        expect(page.get_by_text('No official equipment matches.', exact=False)).to_be_visible()
                        page.locator('#minimum-target-level').fill('')
                        expect(page.get_by_role('heading', name='Basic Boots', exact=True)).to_be_visible()
                        page.keyboard.press('Escape')
                        expect(page.get_by_role('button', name='Browse items', exact=True)).to_be_focused()
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
                        expect(page.locator('.item-meta')).to_have_text('Target level 90')
                        assert 'none published' not in page.locator('.item-requirements').inner_text()
                        page.screenshot(path=str(output / f'{mode}-picker-desktop.png'), full_page=True)
                        page.get_by_text('Description & official source', exact=True).click()
                        expect(page.locator('.item-description')).to_be_visible()
                        expect(page.get_by_role('link', name='items source', exact=True)).to_have_attribute('href', manifest['sources']['items']['sourceUrl'])
                        page.get_by_text('Exact published fixed effects', exact=True).click()
                        expect(page.locator('.item-more code').first).to_have_text(next(item for item in items if item['id'] == 'item_45640')['fixedEffects'][0]['description'])
                        page.get_by_text('Description & official source', exact=True).click()
                        page.locator('.equipment-result-heading button').click()
                        wait_saved()
                        page.locator('.equipment-selection > summary').click()
                        page.get_by_role('button', name='Replace MainHand', exact=True).click()
                        replacement = next(item for item in main_hand if item['id'] != 'item_45640')
                        search(replacement['id'])
                        page.locator('.equipment-result-heading button').click()
                        wait_saved()
                        browse('OffHandShield')
                        search('item_45052')
                        page.locator('.equipment-result-heading button').click()
                        wait_saved()
                        selected = saved()
                        assert len(selected['equipment']) == 2
                        for field in baseline:
                            if field != 'equipment':
                                assert selected[field] == baseline[field], field
                        page.reload()
                        page.locator('#equipment-slot').wait_for()
                        assert saved() == selected
                        page.screenshot(path=str(output / f'{mode}-overview-desktop.png'), full_page=True)

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
                        expect(page.get_by_role('button', name='Browse items', exact=True)).to_be_focused()

                        # Changed filters retain equipment, including after reload.
                        browse('MainHand')
                        page.locator('#minimum-target-level').fill('999')
                        page.get_by_label('Include unknown target level', exact=True).uncheck()
                        expect(page.locator('.equipment-result')).to_have_count(0)
                        page.keyboard.press('Escape')
                        page.reload()
                        page.locator('#equipment-slot').wait_for()
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
                        page.locator('.equipment-selection').filter(has=page.get_by_text('OffHandShield', exact=True)).locator(':scope > summary').click()
                        page.get_by_role('button', name='Clear OffHandShield', exact=True).click()
                        wait_saved()
                        page.reload()
                        page.locator('#equipment-slot').wait_for()
                        assert len(saved()['equipment']) == 1
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
                            'workflow': '19 slots; unknown on/off; null/90/999 minimum persistence; searches; equip/replace/multiple slots/clear/reload; both bars preserved; pagination; focus/Escape; desktop/mobile passed'})
                        context.close()
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
