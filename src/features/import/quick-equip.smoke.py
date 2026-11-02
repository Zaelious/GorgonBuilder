"""T0011-F3 Chromium verification with synthetic reports only. Build first.
Run with --url to verify a deployed branch preview; otherwise tests dev + preview.
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
    parser.add_argument('--output', default='/tmp/gorgonbuilder-quick-equip')
    parser.add_argument('--url')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[3]
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    report = json.loads((repo / 'src/features/import/fixtures/storage.json').read_text())
    official = json.loads(gzip.decompress((repo / 'src/generated/game-data/itemsTreasure.json.gz').read_bytes()))['items']
    report['Items'] = [copy.deepcopy(report['Items'][0]) for _ in range(23)]
    for index, slot in enumerate(['Head', 'Chest', 'Legs', 'Ring'], 11):
        item = next(item for item in official if item['slot'] == slot)
        report['Items'][index] = {'TypeID': int(item['id'].split('_')[1]), 'Name': f'Quick Fixture {slot}',
            'Slot': slot, 'Level': 91, 'Rarity': 'Legendary', 'IsInInventory': True}
    key = 'gorgonbuilder.current-draft'
    results = []
    with sync_playwright() as p:
        proxy = {'server': os.environ['HTTPS_PROXY'], 'bypass': '127.0.0.1,localhost'} if os.environ.get('HTTPS_PROXY') else None
        browser = p.chromium.launch(executable_path=shutil.which('chromium'), headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage'], proxy=proxy)
        try:
            modes = [('remote', args.url, None)] if args.url else [('dev', 'http://127.0.0.1:5183', 5183), ('preview', 'http://127.0.0.1:4183', 4183)]
            for mode, origin, port in modes:
                process, log = None, None
                try:
                    if port:
                        log = (output / f'{mode}.log').open('w')
                        process = subprocess.Popen(['npm', 'run', mode, '--', '--host', '127.0.0.1', '--port', str(port), '--strictPort'], cwd=repo, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
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
                        errors, writes = [], []
                        page.on('pageerror', lambda error: errors.append(str(error)))
                        page.on('request', lambda request: writes.append(request.url) if request.method != 'GET' or request.post_data else None)
                        cancel = {'value': False}
                        page.on('dialog', lambda prompt: prompt.dismiss() if cancel['value'] else prompt.accept())
                        page.goto(origin)
                        expect(page.get_by_role('button', name='Import Character', exact=True)).to_be_visible(timeout=30000)

                        def import_reports():
                            page.get_by_role('button', name='Import Character', exact=True).click()
                            page.locator('#character-file').set_input_files(str(repo / 'src/core/import/fixtures/character-sheet.json'))
                            page.locator('#storage-file').set_input_files({'name': 'Synthetic.json', 'mimeType': 'application/json', 'buffer': json.dumps(report).encode()})
                            page.get_by_role('button', name='Use these reports').click()

                        import_reports()
                        page.locator('.equipment-section > .section-heading button').click()
                        page.locator('#my-items-search').fill('Fixture')
                        page.locator('#my-items-minimum').fill('90')
                        page.locator('#my-items-maximum').fill('100')
                        page.locator('#my-items-rarity').select_option('Legendary')
                        page.locator('#my-items-location').select_option('Inventory')
                        page.get_by_role('button', name='Next', exact=True).click()
                        dialog = page.locator('dialog')
                        dialog.evaluate('(e) => { e.dataset.retained = "yes"; }')
                        expect(page.locator('[data-import-path]')).to_have_count(10)
                        snapshots = []

                        def action(index):
                            return page.locator(f'[data-import-path="/Items/{index}"] .equipment-result-heading button')

                        for index in [11, 12, 13, 14]:
                            action(index).click()
                            expect(dialog).to_be_visible()
                            expect(dialog).to_have_attribute('data-retained', 'yes')
                            expect(action(index)).to_have_text('Unequip')
                            expect(page.locator('.equipment-results-title')).to_contain_text('Page 2 of 3')
                            snapshots.append(page.locator('.owned-equipped').count())
                        assert snapshots == [1, 2, 3, 4]
                        page.locator('[data-import-path="/Items/11"]').scroll_into_view_if_needed()
                        page.screenshot(path=str(output / f'{mode}-equipped-{width}.png'))
                        before_scroll = dialog.evaluate('(e) => e.scrollTop')
                        # Use native dialogs with a Python flag, without page evaluation in the handler.
                        cancel['value'] = True
                        action(11).click()
                        expect(action(11)).to_have_text('Unequip')
                        cancel['value'] = False
                        action(11).click()
                        expect(action(11)).to_have_text('Equip')
                        expect(page.locator('.owned-equipped')).to_have_count(3)
                        assert abs(dialog.evaluate('(e) => e.scrollTop') - before_scroll) < 80
                        expect(page.locator('#my-items-search')).to_have_value('Fixture')
                        expect(page.locator('#my-items-rarity')).to_have_value('Legendary')
                        expect(page.locator('#my-items-location')).to_have_value('Inventory')
                        expect(page.locator('#my-items-minimum')).to_have_value('90')
                        expect(page.locator('#my-items-maximum')).to_have_value('100')
                        action(10).click(); expect(action(10)).to_have_text('Unequip')
                        expect(action(15)).to_have_text('Replace')
                        action(15).click(); expect(action(10)).to_have_text('Replace')
                        expect(action(15)).to_have_text('Unequip')
                        expect(page.locator('.owned-equipped')).to_have_count(4)
                        assert dialog.evaluate('(e) => e.scrollWidth <= e.clientWidth + 1')
                        page.locator('[aria-label="Close equipment picker"]').click()
                        page.wait_for_function('(key) => JSON.parse(localStorage.getItem(key) || "{}").equipment?.length === 4', arg=key)
                        page.reload()
                        expect(page.locator('.equipment-section > .section-heading button')).to_be_disabled()
                        import_reports(); page.locator('.equipment-section > .section-heading button').click()
                        page.get_by_role('button', name='Next', exact=True).click()
                        expect(action(15)).to_have_text('Unequip')
                        expect(page.locator('.owned-equipped')).to_have_count(4)
                        page.locator('[aria-label="Close equipment picker"]').click()
                        page.locator('[data-equipment-row="Head"] > summary').click()
                        page.locator('[aria-label="Browse Head items"]').click()
                        dialog.get_by_role('button', name='My Items (23)', exact=True).click()
                        expect(page.locator('[data-import-path]')).to_have_count(1)
                        expect(page.locator('#my-items-slot')).to_be_disabled()
                        action(11).click(); expect(dialog).to_have_count(0)
                        expect(page.locator('[data-equipment-row="Head"] > summary')).to_be_focused()
                        page.screenshot(path=str(output / f'{mode}-slot-closed-{width}.png'))
                        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                        assert not errors, errors
                        assert not writes, writes
                        results.append({'mode': mode, 'width': width, 'multi_equip_counts': snapshots,
                            'same_dialog': True, 'cancel_confirm': True, 'filters_page_scroll': True,
                            'twins_replace': True, 'refresh_reimport': True, 'slot_close_focus': True,
                            'runtime_errors': 0, 'network_writes': 0, 'overflow': False})
                        context.close()
                finally:
                    if process:
                        os.killpg(process.pid, signal.SIGTERM)
                        process.wait(timeout=10)
                    if log:
                        log.close()
        finally:
            browser.close()
    (output / 'results.json').write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
