"""T0011-F1 real Chromium checks using only synthetic committed fixtures.

Build first. Screenshots and a concise result summary go to --output.
Use --url to exercise a deployed branch preview instead of local Vite modes.
Never point this script at customer exports or capture their browser sessions.
"""
import argparse
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
    parser.add_argument('--output', default='/tmp/gorgonbuilder-import-smoke')
    parser.add_argument('--url')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[3]
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    character = repo / 'src/core/import/fixtures/character-sheet.json'
    storage = repo / 'src/features/import/fixtures/storage.json'
    draft_key = 'gorgonbuilder.current-draft'
    results = []
    with sync_playwright() as playwright:
        proxy = {'server': os.environ['HTTPS_PROXY'], 'bypass': '127.0.0.1,localhost'} if os.environ.get('HTTPS_PROXY') else None
        browser = playwright.chromium.launch(executable_path=shutil.which('chromium'), headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage'], proxy=proxy)
        try:
            modes = [('remote', args.url, None)] if args.url else [('dev', 'http://127.0.0.1:5177', 5177), ('preview', 'http://127.0.0.1:4177', 4177)]
            for mode, origin, port in modes:
                process = None
                log = None
                try:
                    if port:
                        log = (output / f'{mode}.log').open('w')
                        process = subprocess.Popen(['npm', 'run', mode, '--', '--host', '127.0.0.1', '--port', str(port), '--strictPort'],
                            cwd=repo, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                        for _ in range(100):
                            if process.poll() is not None:
                                raise RuntimeError(f'{mode} server failed')
                            try:
                                with urlopen(origin, timeout=1):
                                    break
                            except URLError:
                                time.sleep(0.1)
                        else:
                            raise RuntimeError('Server did not start')
                    for width in [1440, 375, 320]:
                        context = browser.new_context(viewport={'width': width, 'height': 960})
                        page = context.new_page()
                        errors, unsafe_requests = [], []
                        page.on('pageerror', lambda error: errors.append(str(error)))
                        page.on('request', lambda request: unsafe_requests.append(request.url)
                                if request.method != 'GET' or request.post_data or 'PRIVATE_IMPORT_SENTINEL' in request.url else None)
                        page.on('dialog', lambda dialog: dialog.accept())
                        page.goto(origin)
                        expect(page.get_by_role('button', name='Import Character', exact=True)).to_be_visible(timeout=30000)
                        page.locator('#skill-A').select_option('Psychology')
                        page.locator('#level-A').fill('90')
                        page.get_by_role('button', name='Open ability picker for bar A').click()
                        page.locator('.quick-add').first.click()
                        page.wait_for_function('(key) => !!localStorage.getItem(key)', arg=draft_key)
                        time.sleep(0.6)
                        baseline = page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', draft_key)
                        baseline['equipment'] = [
                            {'slot': 'MainHand', 'item': {'kind': 'database', 'itemId': 'item_45640'},
                             'candidateMods': [{'powerId': 'power_129', 'tierId': 'id_120'}],
                             'sparks': {'mode': 'simulated', 'input': {'category': 'skill-damage', 'skillId': 'Psychology', 'count': 7, 'seed': 'fixture'}}},
                            {'slot': 'Ring', 'item': {'kind': 'database', 'itemId': 'item_49070'}, 'candidateMods': [], 'sparks': {'mode': 'none'}},
                        ]
                        page.evaluate('([key,value]) => localStorage.setItem(key, JSON.stringify(value))', [draft_key, baseline])
                        page.reload()
                        page.get_by_role('button', name='Import Character', exact=True).click()
                        page.locator('#character-file').set_input_files({'name': 'Character.json', 'mimeType': 'application/json', 'buffer': b'{ PRIVATE_IMPORT_SENTINEL'})
                        expect(page.locator('dialog [role=alert]')).to_contain_text('invalid-json')
                        page.locator('#character-file').set_input_files(str(character))
                        mismatch = json.loads(storage.read_text())
                        mismatch['Character'] = 'Different Fixture'
                        page.locator('#storage-file').set_input_files({'name': 'Storage.json', 'mimeType': 'application/json', 'buffer': json.dumps(mismatch).encode()})
                        expect(page.locator('dialog [role=alert]')).to_contain_text('different characters')
                        expect(page.get_by_role('button', name='Use these reports')).to_be_disabled()
                        page.locator('#storage-file').set_input_files(str(storage))
                        page.get_by_text('Verify skill levels (2)', exact=True).click()
                        page.locator('#verify-skill').fill('Psychology')
                        expect(page.locator('tbody')).to_contain_text('90')
                        page.get_by_text('Import diagnostics · official v490', exact=True).click()
                        expect(page.locator('.import-counts')).to_contain_text('Equipment instances')
                        if width == 1440:
                            page.screenshot(path=str(output / f'{mode}-import-desktop.png'))
                        page.get_by_role('button', name='Use these reports').click()
                        assert page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', draft_key) == baseline
                        page.locator('.equipment-section > .section-heading button').click()
                        expect(page.locator('[data-import-path]')).to_have_count(5)
                        page.locator('#my-items-search').fill('twin')
                        expect(page.locator('[data-import-path]')).to_have_count(2)
                        page.locator('#my-items-minimum').fill('100')
                        expect(page.locator('[data-import-path]')).to_have_count(1)
                        expect(page.locator('[data-import-path]')).to_have_attribute('data-import-path', '/Items/1')
                        page.locator('#my-items-minimum').fill('')
                        first = page.locator('[data-import-path="/Items/0"]')
                        first.get_by_text('Exact powers & instance details', exact=True).click()
                        expect(first).to_contain_text('Exact source tier: 777')
                        expect(first).to_contain_text('power_10001 / id_9')
                        expect(first).to_contain_text('Imbues (1)')
                        assert page.locator('dialog').evaluate('(element) => element.scrollWidth <= element.clientWidth + 1'), f'Dialog overflow at {width}'
                        page.screenshot(path=str(output / f'{mode}-my-items-{width}.png'))
                        first.get_by_role('button', name='Equip owned').click()
                        page.wait_for_function('(key) => JSON.parse(localStorage.getItem(key)).equipment[0].item.kind === "imported"', arg=draft_key)
                        selected = page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', draft_key)
                        assert selected['equipment'][0]['item']['instance']['level'] == 91
                        assert selected['equipment'][0]['candidateMods'] == baseline['equipment'][0]['candidateMods']
                        assert selected['equipment'][0]['sparks'] == baseline['equipment'][0]['sparks']
                        assert selected['equipment'][1] == baseline['equipment'][1]
                        assert selected['abilityBarA'] == baseline['abilityBarA']
                        assert 'FixtureUnresolvedPower' in json.dumps(selected)
                        assert 'Fixture Tooth' not in json.dumps(selected)
                        page.reload()
                        expect(page.locator('.equipment-section > .section-heading button')).to_be_disabled()
                        page.locator('[data-equipment-row="MainHand"] > summary').click()
                        expect(page.locator('[data-equipment-row="MainHand"]')).to_contain_text('Actual level 91')
                        page.locator('[data-equipment-row="MainHand"]').get_by_text('Exact powers & instance details', exact=True).click()
                        expect(page.locator('[data-equipment-row="MainHand"]')).to_contain_text('Exact source tier: 777')
                        page.get_by_role('button', name='Import Character', exact=True).click()
                        page.locator('#character-file').set_input_files(str(character))
                        page.locator('#storage-file').set_input_files(str(storage))
                        page.get_by_role('button', name='Use these reports').click()
                        page.locator('.equipment-section > .section-heading button').click()
                        page.locator('[data-import-path="/Items/2"] button').click()
                        page.wait_for_function('(key) => JSON.parse(localStorage.getItem(key)).equipment.some(e=>e.slot==="OffHandShield")', arg=draft_key)
                        page.locator('.equipment-section > .section-heading button').click()
                        page.locator('[data-import-path="/Items/3"] button').click()
                        page.wait_for_function('(key) => JSON.parse(localStorage.getItem(key)).equipment.some(e=>e.slot==="OffHand")', arg=draft_key)
                        equipment = page.evaluate('(key) => JSON.parse(localStorage.getItem(key)).equipment', draft_key)
                        assert len([item for item in equipment if item['slot'] in ['OffHand', 'OffHandShield']]) == 1
                        page.locator('[data-equipment-row="OffHand"] > summary').click()
                        page.get_by_role('button', name='Clear OffHand', exact=True).click()
                        page.wait_for_function('(key) => !JSON.parse(localStorage.getItem(key)).equipment.some(e=>e.slot==="OffHand")', arg=draft_key)
                        overflow = page.evaluate('document.documentElement.scrollWidth > innerWidth')
                        assert not overflow, f'Page overflow at {width}'
                        assert not errors, errors
                        assert not unsafe_requests, 'Unexpected write/private-data request'
                        results.append({'mode': mode, 'width': width, 'import': 'passed', 'exact_tiers': 'passed',
                            'persistence': 'passed', 'offhand': 'passed', 'network_writes': 0, 'runtime_errors': 0, 'overflow': False})
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
