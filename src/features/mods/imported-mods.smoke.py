"""T0011-F2 Chromium verification. Synthetic fixtures only; build first.
Uses installed Python Playwright/Chromium. --url checks an existing preview.
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
    parser.add_argument('--output', default='/tmp/gorgonbuilder-imported-mods')
    parser.add_argument('--url')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[3]
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    key = 'gorgonbuilder.current-draft'
    results = []
    with sync_playwright() as p:
        proxy = {'server': os.environ['HTTPS_PROXY'], 'bypass': '127.0.0.1,localhost'} if os.environ.get('HTTPS_PROXY') else None
        browser_env = dict(os.environ)
        if os.environ.get('CHROMIUM_TRUST_HOME'):
            browser_env['HOME'] = os.environ['CHROMIUM_TRUST_HOME']
        browser = p.chromium.launch(executable_path=shutil.which('chromium'), headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage'], proxy=proxy, env=browser_env)
        modes = [('remote', args.url, None)] if args.url else [('dev', 'http://127.0.0.1:5181', 5181), ('preview', 'http://127.0.0.1:4181', 4181)]
        try:
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
                    for width, scheme in [(1440, 'dark'), (375, 'light'), (320, 'dark')]:
                        context = browser.new_context(viewport={'width': width, 'height': 1000}, color_scheme=scheme)
                        page = context.new_page()
                        errors, writes = [], []
                        page.on('pageerror', lambda error: errors.append(str(error)))
                        page.on('request', lambda request: writes.append(request.url) if request.method != 'GET' or request.post_data else None)
                        page.goto(origin)
                        expect(page.get_by_role('button', name='Import Character', exact=True)).to_be_visible(timeout=30000)
                        page.locator('#skill-A').select_option('Cow'); page.locator('#skill-B').select_option('Unarmed')
                        page.get_by_role('button', name='Import Character', exact=True).click()
                        page.locator('#character-file').set_input_files(str(repo / 'src/core/import/fixtures/character-sheet.json'))
                        page.locator('#storage-file').set_input_files(str(repo / 'src/features/mods/fixtures/imported-cow-unarmed.json'))
                        page.get_by_role('button', name='Use these reports').click()
                        page.locator('.equipment-section > .section-heading button').click()
                        page.locator('[data-import-path] button').click()
                        page.wait_for_function('(key) => JSON.parse(localStorage.getItem(key) || "{} ").equipment?.length === 1', arg=key)
                        initial = page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', key)
                        initial['equipment'][0]['sparks'] = {'mode': 'simulated', 'input': {'category': 'skill-damage', 'skillId': 'Cow', 'count': 5, 'seed': 'fixture'}}
                        page.evaluate('([key,value]) => localStorage.setItem(key, JSON.stringify(value))', [key, initial])
                        page.reload()
                        page.locator('[data-equipment-row="MainHand"] > summary').click()
                        scope = page.locator('[data-selection-index="0"]')
                        editor = scope.locator('.mod-planner')
                        expect(editor.locator('.mod-selected h3')).to_have_text('Selected (6)')
                        expect(editor.locator('[data-mod-origin="imported"]')).to_have_count(6)
                        expect(scope.locator('.item-stats [data-existing-power]')).to_have_count(6)
                        page.get_by_role('searchbox', name='Search treasure powers').fill('power_20006')
                        expect(editor.locator('.available-effect')).to_have_count(0)
                        page.get_by_role('searchbox', name='Search treasure powers').fill('power_20204')
                        editor.locator('[data-power-id="power_20204"] > .available-effect').click()
                        expect(editor.locator('.mod-selected h3')).to_have_text('Selected (7)')
                        chips = editor.locator('.candidate-list .stat-chip').evaluate_all('elements => elements.map(e => ({text:e.textContent, tone:e.dataset.tone, bg:getComputedStyle(e).backgroundColor, fg:getComputedStyle(e).color, border:getComputedStyle(e).borderStyle}))')
                        cow = [chip for chip in chips if chip['text'] == 'Cow']
                        unarmed = [chip for chip in chips if chip['text'] == 'Unarmed']
                        assert len(cow) == 4 and len(unarmed) == 3
                        assert len(set(chip['bg'] for chip in cow)) == 1 and cow[0]['bg'] == 'rgb(26, 95, 192)'
                        assert all(chip['border'] == 'solid' and chip['tone'] == 'skill-a' for chip in cow)
                        assert all(chip['bg'] == 'rgb(242, 194, 48)' and chip['tone'] == 'skill-b' for chip in unarmed)
                        ids = editor.locator('[data-selected-power-id]').evaluate_all('es => es.map(e=>e.dataset.selectedPowerId)')
                        assert scope.locator('.item-stats [data-power-id]').evaluate_all('es => es.map(e=>e.dataset.powerId)') == ids
                        assert editor.evaluate('(e) => e.scrollWidth <= e.clientWidth + 1')
                        scope.locator('.item-stats').screenshot(path=str(output / f'{mode}-stats-{width}.png'))
                        editor.locator('.mod-selected').screenshot(path=str(output / f'{mode}-selected-{width}.png'))
                        if width == 1440:
                            scope.screenshot(path=str(output / f'{mode}-working-item-desktop.png'))
                        editor.get_by_label('Details and tier for imported mod 1', exact=True).click()
                        editor.get_by_label('Tier for imported mod 1', exact=True).select_option('id_8')
                        expect(scope.locator('[data-existing-power="0"]')).to_have_attribute('data-tier-id', 'id_8')
                        editor.get_by_role('button', name='Remove imported mod 2', exact=True).click()
                        expect(editor.locator('.mod-selected h3')).to_have_text('Selected (6)')
                        expect(scope.locator('.item-stats [data-power-id="power_3001"]')).to_have_count(0)
                        page.wait_for_function('(key) => JSON.parse(localStorage.getItem(key)).equipment[0].item.instance.existingPowers.length === 5', arg=key)
                        edited = page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', key)
                        assert edited['equipment'][0]['item']['instance']['metadata'] == initial['equipment'][0]['item']['instance']['metadata']
                        assert edited['equipment'][0]['sparks'] == initial['equipment'][0]['sparks']
                        page.reload(); page.locator('[data-equipment-row="MainHand"] > summary').click()
                        scope = page.locator('[data-selection-index="0"]'); editor = scope.locator('.mod-planner')
                        expect(editor.locator('.mod-selected h3')).to_have_text('Selected (6)')
                        expect(scope.locator('[data-existing-power="0"]')).to_have_attribute('data-tier-id', 'id_8')
                        expect(scope.locator('.item-stats [data-power-id="power_3001"]')).to_have_count(0)
                        scope.locator('.item-details-source > summary').click()
                        evidence = scope.locator('.imported-item-details')
                        expect(evidence).to_contain_text('Historical export evidence only')
                        expect(evidence).to_contain_text('Source power: power_3001')
                        expect(evidence).to_contain_text('FixtureUnknownPower'); expect(evidence).to_contain_text('Imbues (1)')
                        assert evidence.locator('button, select').count() == 0
                        scope.locator('.item-details-source > summary').click()
                        editor.get_by_role('button', name='Restore Imported Mods', exact=True).click()
                        expect(editor.locator('.mod-selected h3')).to_have_text('Selected (7)')
                        page.wait_for_function('(key) => JSON.parse(localStorage.getItem(key)).equipment[0].item.instance.existingPowers.length === 6', arg=key)
                        restored = page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', key)
                        assert restored['equipment'][0]['item'] == initial['equipment'][0]['item']
                        assert restored['equipment'][0]['candidateMods'] == edited['equipment'][0]['candidateMods']
                        page.locator('#skill-A').select_option('Unarmed'); page.locator('#skill-B').select_option('Cow')
                        expect(editor.locator('[data-mod-origin="imported"]')).to_have_count(6)
                        assert editor.locator('.candidate-list .stat-chip').first.text_content() == 'Unarmed'
                        assert editor.locator('.candidate-list .stat-chip').first.get_attribute('data-tone') == 'skill-a'
                        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
                        assert not errors, errors
                        assert not writes, 'Unexpected network write'
                        results.append({'mode': mode, 'width': width, 'preference': scheme, 'selected_initial': 6, 'selected_with_planned': 7,
                            'filled_shared_tones': True, 'working_edit_reload_restore': True, 'immutable_source': True, 'network_writes': 0, 'runtime_errors': 0})
                        context.close()
                finally:
                    if process:
                        os.killpg(process.pid, signal.SIGTERM); process.wait(timeout=10)
                    if log:
                        log.close()
        finally:
            browser.close()
    (output / 'results.json').write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
