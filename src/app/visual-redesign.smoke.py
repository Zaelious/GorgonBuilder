"""T0022 real-browser visual/interaction smoke: build first, then run with Python Playwright and Chromium.
Serves dist/ locally with synthetic drafts; no private data and no project package changes.
Artifacts (screenshots, measurements.json) default to /tmp/gorgonbuilder-t0022. HTTPS verification stays enabled.
"""
import argparse
import functools
import json
import os
from pathlib import Path
import shutil
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import expect, sync_playwright

KEY = 'gorgonbuilder.current-draft'
DRAFT = {'schemaVersion': 1, 'gameDataVersion': 'v490', 'title': 'Untitled build', 'notes': '',
    'skillSlotA': {'skillId': 'Druid', 'level': 125}, 'skillSlotB': {'skillId': 'Archery', 'level': 125},
    'abilityBarA': [{'abilityId': 'ability_5392', 'rank': None}, {'abilityId': 'ability_5381', 'rank': None}],
    'abilityBarB': [{'abilityId': 'ability_2627', 'rank': None}, {'abilityId': 'ability_5392', 'rank': None}],
    'equipment': [{'slot': 'MainHand', 'item': {'kind': 'database', 'itemId': 'item_46107'},
        'candidateMods': [{'powerId': 'power_10302', 'tierId': 'id_25'}], 'sparks': {'mode': 'none'}}],
    'target': {'count': 1, 'damageTypes': {}}}

GEOMETRY = '''() => {
  const box = element => { const r = element.getBoundingClientRect(); return {x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom}; };
  const image = selector => { const element = document.querySelector(selector); return element && {src: element.currentSrc, loaded: element.complete && element.naturalWidth > 0}; };
  return {header: box(document.querySelector('.site-header')), skills: box(document.querySelector('.skills-section')),
    portrait: image('.brand-portrait'), banner: image('.site-banner-image'),
    wordmark: document.querySelector('.wordmark').textContent, overflow: document.documentElement.scrollWidth > innerWidth,
    rows: document.querySelectorAll('.equipment-primary > .equipment-row').length};
}'''

POPOVER = '''() => {
  const popover = document.querySelector('.ability-popover');
  const r = popover.getBoundingClientRect();
  const terms = [...popover.querySelectorAll('.ability-stats dt')];
  const damage = popover.querySelector('.ability-stats .damage-value');
  return {left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, viewport: [innerWidth, innerHeight],
    labels: terms.map(term => term.textContent), columns: new Set(terms.map(term => Math.round(term.getBoundingClientRect().left))).size,
    damageColor: damage && getComputedStyle(damage).color, textColor: getComputedStyle(popover).color,
    scrollable: popover.scrollHeight > popover.clientHeight};
}'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='/tmp/gorgonbuilder-t0022')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    dist = repo / 'dist'
    if not (dist / 'index.html').exists():
        raise SystemExit('Run npm run build before the T0022 smoke.')
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)

    class QuietHandler(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(dist)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}'
    errors, measurements = [], []
    try:
        with sync_playwright() as playwright:
            proxy = {'server': os.environ['HTTPS_PROXY'], 'bypass': '127.0.0.1,localhost'} if os.environ.get('HTTPS_PROXY') else None
            browser_env = dict(os.environ)
            if os.environ.get('CHROMIUM_TRUST_HOME'):
                browser_env['HOME'] = os.environ['CHROMIUM_TRUST_HOME']
            browser = playwright.chromium.launch(executable_path=shutil.which('chromium'), headless=True,
                args=['--no-sandbox', '--disable-dev-shm-usage'], proxy=proxy, env=browser_env)

            def open_page(width, height, touch):
                context = browser.new_context(viewport={'width': width, 'height': height}, has_touch=touch, is_mobile=touch)
                page = context.new_page()
                page.on('pageerror', lambda error: errors.append(f'{width}: {error}'))
                # Official CDN icons may be blocked offline; the app falls back to local placeholders.
                page.on('console', lambda message: errors.append(f'{width}: {message.text}')
                    if message.type == 'error' and 'Failed to load resource' not in message.text else None)
                page.goto(url)
                page.evaluate('([key, value]) => localStorage.setItem(key, JSON.stringify(value))', [KEY, DRAFT])
                page.reload()
                page.locator('#skill-A').wait_for()
                page.wait_for_load_state('networkidle')
                return context, page

            for width, height, touch in [(1440, 900, False), (1920, 1080, False), (375, 812, True), (320, 812, True)]:
                context, page = open_page(width, height, touch)
                geometry = page.evaluate(GEOMETRY)
                assert geometry['wordmark'] == 'Gorgon Builder', geometry
                for art in ['portrait', 'banner']:
                    assert geometry[art]['loaded'] and '/branding/' in geometry[art]['src'] and geometry[art]['src'].endswith('.webp'), geometry
                assert not geometry['overflow'], geometry
                assert geometry['rows'] == 9, geometry
                assert geometry['header']['height'] <= (100 if width >= 1024 else 80), geometry
                if width >= 1024:
                    assert geometry['skills']['y'] <= 200, geometry
                page.screenshot(path=str(output / f'{width}-planner.png'), full_page=touch)
                trigger = page.locator('.skill-panel').nth(1).locator('.slot-button').first
                if touch:
                    trigger.tap()
                else:
                    trigger.hover()
                expect(page.locator('.ability-popover')).to_be_visible()
                expect(page.locator('.ability-popover h3')).to_have_text('Acid Arrow 13')
                popover = page.evaluate(POPOVER)
                assert popover['left'] >= 0 and popover['right'] <= width and popover['top'] >= 0 and popover['bottom'] <= height, popover
                assert popover['labels'][:2] == ['Damage', 'Armor damage'] and popover['columns'] == 1, popover
                assert popover['damageColor'] != popover['textColor'], popover
                if width >= 1024:
                    assert 420 <= popover['width'] <= 460, popover
                expect(page.locator('.ability-popover .relevant-mods')).to_contain_text('Acid Arrow Damage +110%')
                if touch:
                    close = page.get_by_label('Close ability details', exact=True)
                    size = close.bounding_box()
                    assert size['width'] >= 44 and size['height'] >= 44, size
                page.screenshot(path=str(output / f'{width}-popover.png'))
                if touch:
                    close.tap()
                    expect(page.locator('.ability-popover')).to_have_count(0)
                measurements.append({'viewport': [width, height], 'touch': touch, **geometry, 'popover': popover})
                context.close()

            context, page = open_page(1440, 900, False)
            trigger = page.locator('.skill-panel').nth(1).locator('.slot-button').first
            # Keyboard focus opens details; Escape closes and keeps focus on the slot.
            trigger.focus()
            expect(page.locator('.ability-popover')).to_be_visible()
            page.keyboard.press('Escape')
            expect(page.locator('.ability-popover')).to_have_count(0)
            expect(trigger).to_be_focused()
            # Click pins the details; Technical details and Edit bar are working disclosures.
            trigger.click()
            page.locator('.ability-popover .technical-details > summary').click()
            expect(page.locator('.ability-popover .technical-records')).to_be_visible()
            page.locator('.ability-popover .bar-edit-actions > summary').click()
            expect(page.get_by_label('Move entry 1 down in bar B', exact=True)).to_be_visible()
            page.screenshot(path=str(output / '1440-popover-expanded.png'))
            page.get_by_label('Move entry 1 down in bar B', exact=True).click()
            page.wait_for_function('(key) => JSON.parse(localStorage.getItem(key)).abilityBarB[1].abilityId === "ability_2627"', arg=KEY)
            page.locator('.skill-panel').nth(1).locator('.slot-button').nth(1).click()
            page.get_by_label('Remove entry 2 from bar B', exact=True).click()
            page.wait_for_function('(key) => JSON.parse(localStorage.getItem(key)).abilityBarB.length === 1', arg=KEY)
            # Screen-edge placement: a short viewport keeps the floating card inside the window with internal scroll.
            page.set_viewport_size({'width': 1440, 'height': 520})
            page.locator('.skill-panel').nth(0).locator('.slot-button').first.click()
            edge = page.evaluate(POPOVER)
            assert edge['top'] >= 0 and edge['bottom'] <= 520 and edge['right'] <= 1440, edge
            page.keyboard.press('Escape')
            page.set_viewport_size({'width': 1440, 'height': 900})
            # Local Save writes immediately through the autosave flush path; Clear cancel keeps the exact draft.
            page.get_by_label('Edit build title:', exact=False).click()
            page.get_by_label('Build title', exact=True).fill('Mosaic smoke build')
            page.keyboard.press('Enter')
            page.get_by_role('button', name='Save local draft', exact=True).click()
            saved = page.evaluate('(key) => JSON.parse(localStorage.getItem(key)).title', KEY)
            assert saved == 'Mosaic smoke build', saved
            expect(page.locator('.save-status')).to_have_text('Saved in this browser')
            before = page.evaluate('(key) => localStorage.getItem(key)', KEY)
            page.once('dialog', lambda dialog: dialog.dismiss())
            page.get_by_role('button', name='Clear build', exact=True).click()
            assert page.evaluate('(key) => localStorage.getItem(key)', KEY) == before
            page.reload()
            expect(page.locator('h1')).to_have_text('Mosaic smoke build')
            # Expanded equipment, shared mod settings and dialogs share the dark design.
            page.locator('[data-equipment-row="MainHand"] > summary').click()
            page.locator('.mod-browser-settings > summary').click()
            expect(page.locator('.item-stats')).to_be_visible()
            page.screenshot(path=str(output / '1440-equipment-expanded.png'), full_page=True)
            page.get_by_role('button', name='Import Character', exact=True).click()
            expect(page.locator('#import-title')).to_be_visible()
            page.screenshot(path=str(output / '1440-import-dialog.png'))
            page.keyboard.press('Escape')
            expect(page.get_by_role('button', name='Import Character', exact=True)).to_be_focused()
            # Missing artwork degrades to the gradient header with a readable wordmark.
            page.route('**/branding/**', lambda route: route.abort())
            page.reload()
            page.locator('#skill-A').wait_for()
            expect(page.locator('.brand-portrait')).to_have_count(0)
            expect(page.locator('.site-banner-image')).to_have_count(0)
            expect(page.locator('.wordmark')).to_have_text('Gorgon Builder')
            page.screenshot(path=str(output / '1440-artwork-missing.png'))
            context.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    errors = [error for error in errors if 'branding' not in error]
    assert not errors, errors
    (output / 'measurements.json').write_text(json.dumps(measurements, indent=2))
    print(json.dumps([{'viewport': m['viewport'], 'header': round(m['header']['height']), 'skillsTop': round(m['skills']['y']),
        'popover': [round(m['popover']['left']), round(m['popover']['top']), round(m['popover']['width'])]} for m in measurements], indent=2))
    print(f'PASS T0022 header artwork, 1440/1920/375/320 layouts, ability inspector, local Save and dialogs. Artifacts: {output}')


if __name__ == '__main__':
    main()
