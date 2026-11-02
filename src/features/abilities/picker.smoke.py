"""T0008-F1: synthetic Chromium smoke on Vite dev and production preview.
Build first; screenshots/results go to --output. No customer exports are used.
"""
import argparse
import json
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
    parser.add_argument('--output', default='/tmp/gorgonbuilder-t0008-f1')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[3]
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    report = json.loads((repo / 'src/core/import/fixtures/character-sheet.json').read_text())
    customer_levels = [('Werewolf', 106, 6), ('Deer', 112, 12), ('Cow', 111, 11), ('Unarmed', 110, 10)]
    report['Skills'].update({skill: {'Level': level, 'BonusLevels': bonus, 'ProdigyLevel': 42} for skill, level, bonus in customer_levels})
    storage = repo / 'src/features/import/fixtures/storage.json'
    key = 'gorgonbuilder.current-draft'
    results = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=shutil.which('chromium'), headless=True,
                                    args=['--no-sandbox', '--disable-dev-shm-usage'])
        try:
            for mode, port in [('dev', 5180), ('preview', 4180)]:
                with (output / f'{mode}.log').open('w') as log:
                    process = subprocess.Popen(['npm', 'run', mode, '--', '--host', '127.0.0.1', '--port', str(port), '--strictPort'],
                                               cwd=repo, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                    try:
                        origin = f'http://127.0.0.1:{port}'
                        for _ in range(100):
                            try:
                                with urlopen(origin, timeout=1):
                                    break
                            except URLError:
                                time.sleep(.1)
                        for width in [1440, 375, 320]:
                            context = browser.new_context(viewport={'width': width, 'height': 960}, has_touch=width < 500, is_mobile=width < 500)
                            # Exercise the supported icon fallback without depending on CDN networking.
                            context.route('https://cdn.projectgorgon.com/**', lambda route: route.abort())
                            page = context.new_page()
                            errors = []
                            page.on('pageerror', lambda error: errors.append(str(error)))
                            page.goto(origin)
                            expect(page.locator('#skill-A')).to_be_visible(timeout=30000)
                            page.locator('#skill-A').select_option('Psychology')
                            page.locator('#level-A').fill('73')
                            page.wait_for_timeout(600)
                            baseline = page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', key)

                            def imported(replace=False):
                                page.get_by_role('button', name='Import Character', exact=True).click()
                                page.locator('#character-file').set_input_files({'name': 'Synthetic.json', 'mimeType': 'application/json', 'buffer': json.dumps(report).encode()})
                                if not replace:
                                    page.locator('#storage-file').set_input_files(str(storage))
                                page.get_by_role('button', name='Replace My Items inventory' if replace else 'Use these reports', exact=True).click()

                            imported()
                            assert page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', key) == baseline
                            for skill, level, bonus in customer_levels:
                                page.locator('#skill-A').select_option(skill)
                                expect(page.locator('#level-A')).to_have_value(str(level))
                            page.locator('#skill-A').select_option('Psychology')
                            page.locator('#skill-B').select_option('Psychology')
                            expect(page.locator('#level-A')).to_have_value('90')
                            expect(page.locator('#level-B')).to_have_value('90')
                            page.locator('#level-B').fill('102')
                            imported(True)
                            expect(page.locator('#level-A')).to_have_value('90')
                            expect(page.locator('#level-B')).to_have_value('102')
                            opener = page.get_by_role('button', name='Open ability picker for bar A', exact=True)
                            opener.click()
                            dialog = page.locator('dialog.ability-picker')
                            dialog.evaluate('(el) => window.originalPicker = el')
                            page.locator('#ability-search-A').fill('Psychoanalyze')
                            page.locator('.family summary').first.click()
                            page.locator('.tier-details-toggle').first.click()
                            choose = page.locator('.tier-add').nth(7)
                            scrolls = []
                            for count in range(1, 7):
                                choose.scroll_into_view_if_needed()
                                choose.evaluate('el => el.addEventListener("click", () => window.beforeScroll = el.closest("dialog").scrollTop, {once: true})')
                                choose.click()
                                expect(page.locator('.picker-count')).to_have_text(f'{count} / 6 abilities')
                                assert page.evaluate('window.beforeScroll > 0'), 'Exercise a nonzero results scroll'
                                assert dialog.evaluate('el => el === window.originalPicker')
                                assert dialog.evaluate('el => Math.abs(el.scrollTop - window.beforeScroll) <= 1')
                                scrolls.append(dialog.evaluate('el => el.scrollTop'))
                                expect(page.locator('#ability-search-A')).to_have_value('Psychoanalyze')
                                assert page.locator('.family details').first.evaluate('el => el.open')
                                expect(page.locator('.tier-details-toggle').first).to_have_attribute('aria-expanded', 'true')
                            expect(choose).to_be_disabled()
                            expect(page.locator('.picker-status')).to_contain_text('Bar A is full')
                            expect(page.locator('.selected-ability')).to_have_text('On this bar ×6')
                            assert page.locator('.picker-status').evaluate('el => el.getBoundingClientRect().top >= 0')
                            page.screenshot(path=str(output / f'{mode}-full-{width}.png'))
                            page.keyboard.press('Escape')
                            expect(dialog).to_have_count(0)
                            expect(opener).to_be_focused()
                            page.get_by_role('button', name='Open ability picker for bar B', exact=True).click()
                            expect(page.locator('.selected-ability')).to_have_count(0)
                            page.get_by_role('button', name='Close ability picker').click()
                            page.get_by_role('button', name='Add ability to bar B, empty slot 1', exact=True).click()
                            page.locator('.quick-add').first.click()
                            expect(dialog).to_have_count(0)
                            expect(page.locator('#bar-B').locator('..').locator('..').locator('.combat-slot .slot-button').first).to_be_focused()
                            selected = page.locator('.skill-panel').first.locator('.combat-slot .slot-button').nth(2)
                            selected.click()
                            page.locator('.bar-edit-actions summary').click()
                            page.get_by_role('button', name='Replace', exact=True).click()
                            page.locator('.quick-add').first.click()
                            expect(dialog).to_have_count(0)
                            expect(selected).to_be_focused()
                            page.keyboard.press('Escape')
                            # Repair a saved inflated level explicitly, preserving the entire build.
                            page.locator('#level-A').fill('95')
                            page.wait_for_timeout(600)
                            before_apply = page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', key)
                            imported(True)
                            expect(page.locator('#level-A')).to_have_value('95')
                            expect(page.locator('#level-B')).to_have_value('102')
                            page.screenshot(path=str(output / f'{mode}-apply-{width}.png'))
                            page.get_by_role('button', name='Apply imported level for skill A: 90', exact=True).click()
                            expect(page.locator('#level-A')).to_have_value('90')
                            expect(page.get_by_role('button', name='Apply imported level for skill A: 90', exact=True)).to_have_count(0)
                            page.wait_for_timeout(600)
                            after_apply = page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', key)
                            expected_apply = json.loads(json.dumps(before_apply))
                            expected_apply['skillSlotA']['level'] = 90
                            assert after_apply == expected_apply
                            # Remove the replaced entry by mouse or actual touch, then a duplicate by keyboard.
                            remove = page.locator('.skill-panel').first.locator('.quick-remove-ability').nth(2)
                            if width < 500:
                                expect(remove).to_be_visible()
                                assert remove.bounding_box()['width'] >= 28
                                remove.tap()
                            else:
                                page.locator('.skill-panel').first.locator('.combat-slot').nth(2).hover()
                                remove.hover()
                                remove.click()
                            expect(page.locator('.ability-popover')).to_have_count(0)
                            page.wait_for_timeout(600)
                            after_remove = page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', key)
                            expected_remove = json.loads(json.dumps(after_apply))
                            expected_remove['abilityBarA'].pop(2)
                            assert after_remove == expected_remove
                            page.locator('#level-A').focus()
                            page.keyboard.press('Tab')
                            expect(page.locator('.skill-panel').first.locator('.quick-remove-ability').first).to_be_focused()
                            expect(page.locator('.ability-popover')).to_have_count(0)
                            page.keyboard.press('Space' if width < 500 else 'Enter')
                            page.wait_for_timeout(600)
                            expect(page.locator('.ability-popover')).to_have_count(0)
                            after_keyboard = page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', key)
                            expected_remove['abilityBarA'].pop(0)
                            assert after_keyboard == expected_remove
                            # Numbered slot 6 still appends to the next available entry (slot 5).
                            page.get_by_role('button', name='Add ability to bar A, empty slot 6', exact=True).click()
                            page.locator('.quick-add').first.click()
                            expect(dialog).to_have_count(0)
                            page.keyboard.press('Escape')
                            page.wait_for_timeout(600)
                            saved = page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', key)
                            assert len(saved['abilityBarA']) == 5 and len(saved['abilityBarB']) == 1
                            page.reload()
                            expect(page.locator('#level-A')).to_have_value('90')
                            expect(page.locator('#level-B')).to_have_value('102')
                            assert page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', key) == saved
                            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                            page.screenshot(path=str(output / f'{mode}-planner-{width}.png'))
                            assert errors == [], errors
                            results.append({'mode': mode, 'width': width, 'levels': [90, 102], 'bars': [5, 1], 'customer_levels': {skill: level for skill, level, _ in customer_levels}, 'quick_remove': 'touch + Space' if width < 500 else 'mouse + Enter',
                                            'scroll_positions': scrolls, 'page_errors': errors, 'passed': True})
                            context.close()
                    finally:
                        import os
                        os.killpg(process.pid, signal.SIGTERM)
        finally:
            browser.close()
    (output / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
