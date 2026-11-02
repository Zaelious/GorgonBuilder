"""Optional real-browser layout check: build first, then run with Python Playwright.
Uses an installed Chromium (or Playwright browser), no project package changes.
Artifacts default to /tmp/gorgonbuilder-layout. HTTPS verification stays enabled.
"""
import argparse
import copy
import functools
import json
import os
from pathlib import Path
import shutil
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import expect, sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='/tmp/gorgonbuilder-layout')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    dist = repo / 'dist'
    if not (dist / 'index.html').exists():
        raise SystemExit('Run npm run build before the layout check.')
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)

    class QuietHandler(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(dist)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}'
    key = 'gorgonbuilder.current-draft'
    measurements = []
    errors = []
    try:
        with sync_playwright() as playwright:
            proxy = {'server': os.environ['HTTPS_PROXY'], 'bypass': '127.0.0.1,localhost'} if os.environ.get('HTTPS_PROXY') else None
            browser_env = dict(os.environ)
            if os.environ.get('CHROMIUM_TRUST_HOME'):
                browser_env['HOME'] = os.environ['CHROMIUM_TRUST_HOME']
            browser = playwright.chromium.launch(executable_path=shutil.which('chromium'), headless=True,
                args=['--no-sandbox', '--disable-dev-shm-usage'], proxy=proxy, env=browser_env)
            page = browser.new_page(viewport={'width': 1440, 'height': 900})
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
            page.goto(url)
            page.locator('#skill-A').select_option('Psychology')
            expect(page.get_by_role('status')).to_have_text('Saved in this browser')
            base = page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', key)

            def restore(document):
                page.evaluate('([key, value]) => localStorage.setItem(key, JSON.stringify(value))', [key, document])
                page.reload()
                page.locator('#skill-A').wait_for()

            def document(state):
                value = copy.deepcopy(base)
                if state == 'empty':
                    value['skillSlotA']['skillId'] = None
                else:
                    value['skillSlotB'] = {'skillId': 'Deer', 'level': 90}
                    value['skillSlotA']['level'] = 90
                    value['abilityBarA'] = [{'abilityId': 'ability_1201', 'rank': None}] * (6 if state == 'full' else 2)
                    value['abilityBarB'] = [{'abilityId': 'ability_1578', 'rank': None}] * (6 if state == 'full' else 1)
                return value

            for width, height in [(1440, 900), (1920, 1080), (2560, 1440)]:
                page.set_viewport_size({'width': width, 'height': height})
                for state in ['empty', 'partial', 'full']:
                    restore(document(state))
                    metric = page.evaluate('''() => {
                        const box = element => {const r = element.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height};};
                        return {section:box(document.querySelector('.skills-section')), equipment:box(document.querySelector('.equipment-section')), titleSize:parseFloat(getComputedStyle(document.querySelector('h1')).fontSize),
                          rows:[...document.querySelectorAll('.skill-panel')].map(row => ({box:box(row),
                            controls:[row.querySelector('select'),row.querySelector('input[type=number]'),...row.querySelectorAll('.slot-button'),row.querySelector('.open-picker')].map(box)})),
                          overflow:document.documentElement.scrollWidth > innerWidth};
                    }''')
                    assert 190 <= metric['section']['height'] <= 250, metric
                    assert metric['section']['y'] <= 160, metric
                    assert 22 <= metric['titleSize'] <= 28, metric
                    assert not metric['overflow'], metric
                    # Full planner width at 100% zoom: 16-32px gutters, up to 100rem; no 832px section cap.
                    shell = min(width - min(max(32, width * 0.04), 64), 1600)
                    assert abs(metric['section']['width'] - shell) <= 2, (shell, metric['section'])
                    assert abs(metric['equipment']['width'] - shell) <= 2, (shell, metric['equipment'])
                    assert metric['section']['width'] > 832 * 1.5, metric['section']
                    for row in metric['rows']:
                        assert 70 <= row['box']['height'] <= 95, row
                        centers = [control['y'] + control['height'] / 2 for control in row['controls']]
                        assert max(centers) - min(centers) <= 2, row
                        for icon in row['controls'][2:8]:
                            assert 44 <= icon['width'] <= 48 and 44 <= icon['height'] <= 48, icon
                    for image in page.locator('.combat-slot img').all():
                        expect(image).to_have_js_property('naturalWidth', 64)
                    page.screenshot(path=str(output / f'{width}-{state}.png'), full_page=True)
                    measurements.append({'viewport': [width, height], 'state': state, **metric})

            def level_fits(target):
                return target.evaluate('''() => [...document.querySelectorAll('.skill-level input')].map(input => {
                    const style = getComputedStyle(input); const context = document.createElement('canvas').getContext('2d');
                    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`; const text = context.measureText(input.value).width;
                    const room = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 16;
                    return {value: input.value, text, room, fits: text <= room, right: input.getBoundingClientRect().right};
                })''')

            # Three-digit skill levels: fully visible with room for native spin controls at 100% zoom.
            level_checks = []
            for width in [1440, 1920, 2560]:
                page.set_viewport_size({'width': width, 'height': 900})
                restore(document('full'))
                for value in ['90', '100', '110', '125']:
                    for slot in ['A', 'B']:
                        page.locator(f'#level-{slot}').fill(value)
                    page.wait_for_function('([key, level]) => { const d = JSON.parse(localStorage.getItem(key)); return d.skillSlotA.level === level && d.skillSlotB.level === level; }', arg=[key, int(value)])
                    checks = level_fits(page)
                    assert all(check['fits'] and check['value'] == value for check in checks), checks
                    level_checks.append({'viewport': width, 'value': value, 'checks': checks})
                saved_levels = page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', key)
                assert saved_levels['skillSlotA']['level'] == 125 and saved_levels['skillSlotB']['level'] == 125, saved_levels
                page.locator('#level-A').hover()
                page.locator('.skills-section').screenshot(path=str(output / f'{width}-levels-125.png'))
                assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
            measurements.append({'levelChecks': level_checks})
            # Secondary regression only: 80% browser zoom on a 1440px screen (1800 CSS px at 0.8 DPR).
            zoomed = browser.new_context(viewport={'width': 1800, 'height': 1125}, device_scale_factor=0.8)
            zoom_page = zoomed.new_page()
            zoom_page.goto(url)
            zoom_page.evaluate('([key, value]) => localStorage.setItem(key, JSON.stringify(value))', [key, document('full')])
            zoom_page.reload(); zoom_page.locator('#skill-A').wait_for()
            zoom_page.locator('#level-A').fill('125')
            assert all(check['fits'] for check in level_fits(zoom_page))
            assert not zoom_page.evaluate('document.documentElement.scrollWidth > innerWidth')
            zoom_page.screenshot(path=str(output / '1440-at-80-percent-zoom.png'))
            zoomed.close()

            restore(document('partial'))
            expect(page.locator('.skill-filter, [id^="skill-search"]')).to_have_count(0)
            page.locator('#skill-A').focus()
            expect(page.locator('#skill-A')).to_be_focused()
            page.locator('.skill-panel').first.locator('.slot-button').first.focus()
            expect(page.locator('.ability-popover')).to_be_visible()
            page.keyboard.press('Escape')
            page.get_by_label('Open ability picker for bar A', exact=True).click()
            expect(page.get_by_label('Search abilities', exact=True)).to_be_focused()
            page.keyboard.press('Escape')
            page.get_by_label('Edit build title:', exact=False).click()
            page.get_by_label('Build title', exact=True).fill('Compact build')
            page.keyboard.press('Enter')
            expect(page.get_by_role('status')).to_have_text('Saved in this browser')
            page.reload()
            expect(page.locator('h1')).to_have_text('Compact build')

            legacy = document('full')
            legacy['abilityBarA'] += legacy['abilityBarA'][:2]
            restore(legacy)
            expect(page.get_by_text('Legacy draft has 8 abilities', exact=False)).to_be_visible()
            assert page.locator('.skill-panel').first.locator('.combat-slot').count() == 8

            context = browser.new_context(viewport={'width': 375, 'height': 812}, has_touch=True)
            mobile = context.new_page()
            mobile.on('pageerror', lambda error: errors.append(str(error)))
            mobile.goto(url)
            mobile.locator('#skill-A').select_option('Psychology')
            mobile.locator('#skill-B').select_option('Deer')
            mobile.get_by_label('Open ability picker for bar A', exact=True).tap()
            mobile.locator('.quick-add').first.tap()
            expect(mobile.get_by_role('status')).to_have_text('Saved in this browser')
            assert not mobile.evaluate('document.documentElement.scrollWidth > innerWidth')
            mobile.screenshot(path=str(output / '375-touch.png'), full_page=True)
            for button in mobile.locator('.slot-button, .open-picker').all():
                rect = button.bounding_box()
                assert rect['width'] >= 44 and rect['height'] >= 44, rect
            mobile.locator('.slot-button[aria-haspopup]').first.tap()
            expect(mobile.locator('.ability-popover')).to_be_visible()
            mobile.get_by_label('Close ability details', exact=True).tap()
            expect(mobile.locator('.skill-filter, [id^="skill-search"]')).to_have_count(0)
            mobile.locator('#skill-A').select_option('Archery')
            expect(mobile.locator('#skill-A')).to_have_value('Archery')
            mobile.locator('#level-A').fill('125')
            assert all(check['fits'] for check in level_fits(mobile)), level_fits(mobile)
            mobile.set_viewport_size({'width': 320, 'height': 812})
            assert not mobile.evaluate('document.documentElement.scrollWidth > innerWidth')
            assert all(check['fits'] and check['right'] <= 320 for check in level_fits(mobile)), level_fits(mobile)
            mobile.screenshot(path=str(output / '320-touch.png'), full_page=True)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    assert not errors, errors
    (output / 'measurements.json').write_text(json.dumps(measurements, indent=2))
    print(json.dumps([{'viewport': item['viewport'], 'state': item['state'], 'section': item['section'], 'rows': [row['box']['height'] for row in item['rows']]} for item in measurements if 'state' in item], indent=2))
    print(f'PASS desktop empty/partial/full layout, responsive touch, keyboard, title and legacy checks. Artifacts: {output}')


if __name__ == '__main__':
    main()
