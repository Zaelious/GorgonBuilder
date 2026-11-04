"""T0010-F2 real Chromium checks in Vite dev and production preview. Build first.
Uses pinned official data and synthetic builds; requires machine Python Playwright/Chromium.
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
    parser.add_argument('--output', default='/tmp/gorgonbuilder-t0010-f2')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[3]
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    items = json.loads(gzip.decompress((repo / 'src/generated/game-data/itemsTreasure.json.gz').read_bytes()))['items']
    abilities = json.loads(gzip.decompress((repo / 'src/generated/game-data/abilities.json.gz').read_bytes()))['abilities']
    slots = ['Head', 'Chest', 'Legs', 'Hands', 'Feet', 'Ring', 'Necklace', 'MainHand', 'OffHand']
    key = 'gorgonbuilder.current-draft'
    default = {'schemaVersion': 1, 'gameDataVersion': 'v490', 'title': 'T0010-F2 browser fixture', 'notes': 'Preserve',
        'skillSlotA': {'skillId': 'Druid', 'level': 90}, 'skillSlotB': {'skillId': 'Archery', 'level': 90},
        'abilityBarA': [], 'abilityBarB': [], 'equipment': [], 'target': {'count': 1, 'damageTypes': {}}}
    for slot in slots:
        item = next(i for i in items if i['slot'] == slot)
        default['equipment'].append({'slot': slot, 'item': {'kind': 'database', 'itemId': item['id']},
            'candidateMods': [], 'sparks': {'mode': 'none'}})
    default['equipment'][7]['item']['itemId'] = 'item_46107'  # Sword profile; Druid powers remain outside-profile
    default['equipment'][5]['item'] = {'kind': 'imported', 'instance': {'baseItemId': 'item_49070',
        'displayName': 'Synthetic imported ring', 'existingPowers': [{'powerId': 'power_14005', 'tierId': 'id_9'}],
        'metadata': {'sourceItem': {'TSysPowers': [{'Power': 'power_14005', 'Tier': 9}]}}}}
    default['equipment'][0]['candidateMods'] = [{'powerId': 'power_153', 'tierId': 'id_1'}]
    default['equipment'].append({'slot': 'Racial', 'item': {'kind': 'manual', 'instance': {
        'baseItemId': None, 'displayName': 'Unknown base retained', 'existingPowers': []}}, 'candidateMods': [], 'sparks': {'mode': 'none'}})
    results = []
    with sync_playwright() as p:
        proxy = {'server': os.environ['HTTPS_PROXY'], 'bypass': '127.0.0.1,localhost'} if os.environ.get('HTTPS_PROXY') else None
        browser = p.chromium.launch(executable_path=shutil.which('chromium'), headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage'], proxy=proxy)
        try:
            for mode, port in [('dev', 5187), ('preview', 4187)]:
                log = (output / f'{mode}.log').open('w')
                process = subprocess.Popen(['npm', 'run', mode, '--', '--host', '127.0.0.1', '--port', str(port), '--strictPort'], cwd=repo,
                    stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                origin = f'http://127.0.0.1:{port}'
                try:
                    for _ in range(100):
                        try:
                            with urlopen(origin, timeout=1):
                                break
                        except URLError:
                            time.sleep(0.1)
                    else:
                        raise RuntimeError('Server did not start')
                    for width in [1440, 375, 320]:
                        context = browser.new_context(viewport={'width': width, 'height': 900})
                        page = context.new_page()
                        errors = []
                        page.on('pageerror', lambda error: errors.append(str(error)))
                        page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
                        page.on('dialog', lambda dialog: dialog.accept())
                        page.goto(origin)
                        expect(page.locator('#skill-A')).to_be_visible(timeout=30000)

                        def seed(build):
                            page.evaluate('([key, build]) => localStorage.setItem(key, JSON.stringify(build))', [key, build])
                            page.reload()
                            expect(page.locator('#skill-A')).to_have_value(build['skillSlotA']['skillId'] or '')

                        def saved():
                            return page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', key)

                        def row(slot):
                            return page.locator(f'[data-equipment-row="{slot}"]')

                        def open_row(slot):
                            if slot not in slots and not page.locator('.equipment-other').evaluate('(e) => e.open'):
                                page.locator('#other-equipment-summary').click()
                            if not row(slot).evaluate('(e) => e.open'):
                                row(slot).locator(':scope > summary').click()

                        def parity():
                            counts = {}
                            for element in page.locator('.equipment-row:not([hidden])').all():
                                slot = element.get_attribute('data-equipment-row')
                                open_row(slot)
                                count = int(element.locator('.equipment-mod-count').inner_text().split()[0])
                                assert count == element.locator('.mod-available-power').count(), slot
                                selected = int(element.get_attribute('data-selected-count'))
                                assert selected == element.locator('.candidate-list > [data-mod-origin]:not([hidden])').count(), slot
                                counts[slot] = {'Available': count, 'Selected': selected}
                            return counts

                        def geometry():
                            # Known pre-existing planner-help overflow at 320 is recorded separately; search controls and rows must fit.
                            return page.locator('.equipment-section').evaluate('e => ({left:e.getBoundingClientRect().left, right:e.getBoundingClientRect().right, width:e.getBoundingClientRect().width, scrollWidth:document.documentElement.scrollWidth, viewport:innerWidth})')

                        print(f'{mode} {width}: start', flush=True)
                        seed(default)
                        search = page.get_by_role('searchbox', name='Search treasure powers')
                        show_all = page.get_by_label('Show all equipment', exact=True)
                        def search_for(value):
                            search.fill(value)
                            expect(page.locator('.equipment-section')).to_have_attribute('data-effective-query', value)

                        expect(page.locator('.equipment-primary > .equipment-row:visible')).to_have_count(9)
                        open_row('Ring')
                        search.focus()
                        page.evaluate('''() => {
                            window.inputFrames = [];
                            document.querySelector('[aria-label="Search treasure powers"]').addEventListener('input', () => {
                                const start = performance.now(); requestAnimationFrame(() => window.inputFrames.push(performance.now() - start));
                            });
                        }''')
                        search.press_sequentially('core', delay=25)
                        expect(search).to_have_value('core')
                        expect(page.locator('.equipment-section')).to_have_attribute('data-effective-query', 'core')
                        input_frames = page.evaluate('window.inputFrames')
                        assert input_frames and max(input_frames) < 150, input_frames
                        search.fill('paste then cancel before debounce')
                        search_for('')
                        page.wait_for_timeout(250)
                        expect(page.locator('.equipment-section')).to_have_attribute('data-effective-query', '')
                        search_for('core')
                        expect(search).to_be_focused()
                        counts = parity()
                        assert counts and all(n['Available'] + n['Selected'] > 0 for n in counts.values())
                        assert len(counts) < 10
                        for element in page.locator('.equipment-row[hidden]').all():
                            expect(element).not_to_be_visible()
                        search_for('power_14005')
                        expect(row('Ring')).to_be_visible()  # working import matches Selected despite Available exclusion
                        expect(row('Ring')).to_have_attribute('data-available-count', '0')
                        expect(row('Ring')).to_have_attribute('data-selected-count', '1')
                        search_for('no matching official power')
                        expect(page.locator('.equipment-row:visible')).to_have_count(0)
                        expect(page.locator('.equipment-search-status [role="status"]')).to_contain_text('No equipment has matching Available or Selected mods')
                        show_all.check()
                        expect(row('Ring')).to_be_visible()
                        assert row('Ring').evaluate('(e) => e.open')
                        expect(row('Ring').locator('.mod-available-power')).to_have_count(0)
                        show_all.uncheck()
                        search_for('')
                        expect(page.locator('.equipment-primary > .equipment-row:visible')).to_have_count(9)
                        assert row('Ring').evaluate('(e) => e.open')
                        assert saved() == default
                        # Shared settings and exact count/list parity, including outside-profile and no-range previews.
                        search_for('core')
                        page.locator('.mod-browser-settings > summary').click()
                        for label in ['Generic', 'Endurance', 'Shamanic Infusions', 'All skills', 'Other slots & profiles']:
                            page.get_by_label(label, exact=True).check() if label in ['All skills', 'Other slots & profiles'] else page.get_by_label(label, exact=True).uncheck()
                            parity()
                        for target in ['Max', '90', '100', '125', '0']:
                            page.get_by_label('Mod target level', exact=True).fill(target)
                            parity()
                        expect(page.locator('.equipment-section')).to_contain_text('No published tier range at this target')
                        page.get_by_label('Mod target level', exact=True).fill('100')
                        search_for('power_14005')
                        parity()
                        expect(row('MainHand').locator('[data-fit="other-slot"]')).to_have_count(1)
                        search_for('core')
                        for label in ['Generic', 'Endurance', 'Shamanic Infusions']:
                            page.get_by_label(label, exact=True).check()
                        page.get_by_label('All skills', exact=True).uncheck()
                        page.get_by_label('Other slots & profiles', exact=True).uncheck()
                        screenshot_counts = parity()
                        # Compact screenshot: collapse rows/settings without changing the query or search results.
                        for element in page.locator('.equipment-row:not([hidden])').all():
                            if element.evaluate('(e) => e.open'):
                                element.locator(':scope > summary').click()
                        page.locator('.mod-browser-settings > summary').click()
                        page.locator('.equipment-section').scroll_into_view_if_needed()
                        page.screenshot(path=str(output / f'{mode}-{width}-search.png'), full_page=True)
                        dimensions = geometry()
                        assert dimensions['right'] <= width + 1, dimensions
                        print(f'{mode} {width}: search/settings passed', flush=True)
                        # Keyboard controls keep focus and hidden rows stay outside the accessibility tree.
                        search.focus()
                        page.keyboard.press('Tab')
                        assert page.evaluate('document.activeElement.closest("[hidden]") === null')
                        # Last-result stage hides an expanded row and returns focus to the shared search.
                        search_for('power_14005')
                        open_row('Chest')
                        add = row('Chest').locator('.available-effect')
                        add.focus()
                        page.keyboard.press('Enter')
                        expect(row('Chest')).to_be_visible()
                        expect(row('Chest')).to_have_attribute('data-available-count', '0')
                        expect(row('Chest')).to_have_attribute('data-selected-count', '1')
                        expect(search).to_be_focused()
                        show_all.check()
                        expect(row('Chest')).to_be_visible()
                        assert row('Chest').evaluate('(e) => e.open')
                        expect(row('Chest').locator('.mod-selected [data-mod-index]')).to_have_count(1)
                        page.wait_for_timeout(650)
                        edited = saved()
                        assert edited['equipment'][1]['candidateMods'][0]['powerId'] == 'power_14005'
                        assert edited['equipment'][5] == default['equipment'][5]
                        page.reload()
                        expect(page.locator('.equipment-primary > .equipment-row:visible')).to_have_count(9)
                        assert saved() == edited
                        print(f'{mode} {width}: stage/focus/refresh passed', flush=True)
                        # Removing a Selected-only match uses its saved index and can hide the row.
                        search_for('power_153')
                        page.locator('.mod-browser-settings > summary').click()
                        page.get_by_label('Generic', exact=True).uncheck()
                        open_row('Head')
                        expect(row('Head')).to_have_attribute('data-available-count', '0')
                        expect(row('Head')).to_have_attribute('data-selected-count', '1')
                        row('Head').get_by_role('button', name='Remove candidate 1', exact=True).focus()
                        page.keyboard.press('Enter')
                        expect(row('Head')).not_to_be_visible()
                        expect(search).to_be_focused()
                        page.wait_for_timeout(650)
                        assert saved()['equipment'][0]['candidateMods'] == []
                        assert saved()['equipment'][5] == default['equipment'][5]
                        # A profile-changing replacement can hide the picker opener; focus still has a visible home.
                        replaced = copy.deepcopy(default)
                        replaced['equipment'][7]['item']['itemId'] = 'item_45511'
                        seed(replaced)
                        search_for('HealthFromCombatRefreshBoost')
                        open_row('MainHand')
                        row('MainHand').get_by_role('button', name='Replace MainHand', exact=True).click()
                        page.locator('#minimum-target-level').fill('')
                        page.locator('#equipment-search').fill('item_46026')
                        page.locator('.equipment-result-heading button').click()
                        expect(row('MainHand')).not_to_be_visible()
                        expect(search).to_be_focused()
                        page.wait_for_timeout(650)  # finish the deliberate replacement autosave before reseeding storage
                        # Protected read-only build still supports presentation controls.
                        protected = copy.deepcopy(default)
                        protected['gameDataVersion'] = 'other'
                        seed(protected)
                        search_for('core')
                        parity()
                        for button in page.locator('.mod-available-power .available-effect, .candidate-remove').all():
                            expect(button).to_be_disabled()
                        assert saved() == protected
                        # Empty gear and no skills have a useful search empty state; clearing restores all primary rows.
                        empty = copy.deepcopy(default)
                        empty.update(equipment=[], skillSlotA={'skillId': None, 'level': 0}, skillSlotB={'skillId': None, 'level': 0})
                        seed(empty)
                        search_for('core')
                        expect(page.locator('.equipment-row:visible')).to_have_count(0)
                        show_all.check()
                        search_for('')
                        expect(page.locator('.equipment-primary > .equipment-row:visible')).to_have_count(9)
                        print(f'{mode} {width}: read-only/empty passed', flush=True)
                        # Damage+taunt/reuse: no misleading warning; every remainder is inspectable.
                        damage_build = copy.deepcopy(default)
                        fire = next(a for a in abilities if 'BOOST_ABILITY_FIREARROW' in a['pve']['attributeHooks'].get('AttributesThatDeltaDamage', []))
                        damage_build.update(skillSlotA={'skillId': 'Archery', 'level': 90}, skillSlotB={'skillId': None, 'level': 0},
                            abilityBarA=[{'abilityId': fire['id'], 'rank': None}], equipment=[{'slot': 'Feet',
                                'item': {'kind': 'database', 'itemId': 'item_40350'}, 'sparks': {'mode': 'none'},
                                'candidateMods': [{'powerId': 'power_10305', 'tierId': 'id_9'}, {'powerId': 'power_10202', 'tierId': 'id_9'}]}])
                        seed(damage_build)
                        page.locator('.damage-analysis-toggle input').check()
                        page.locator('.skill-panel').first.locator('.slot-button').first.click()
                        analysis = page.locator('.ability-popover .ability-results')
                        expect(analysis.locator('.damage-value')).to_be_visible()
                        hit = analysis.locator('.damage-value').inner_text()
                        expect(analysis.locator('.result-build-limits')).to_have_count(0)
                        expect(analysis.locator('.result-status')).to_have_text('Estimated')
                        expect(page.locator('.calc-breakdown:not(.damage-breakdown), .technical-details, [data-unsupported], .result-limits')).to_have_count(0)
                        breakdown = analysis.locator('.damage-breakdown')
                        assert not breakdown.evaluate('(e) => e.open')
                        breakdown.locator('summary').click()
                        expect(breakdown.locator('.public-final-hit .calc-step-total')).to_have_text('96')
                        expect(breakdown).to_contain_text('Fire Arrow Damage — Feet')
                        assert 'Partial' not in analysis.inner_text()
                        page.screenshot(path=str(output / f'{mode}-{width}-damage.png'), full_page=True)
                        page.keyboard.press('Escape')
                        damage_build['equipment'][0]['candidateMods'].append({'powerId': 'power_4002', 'tierId': 'id_9'})
                        seed(damage_build)
                        page.locator('.skill-panel').first.locator('.slot-button').first.click()
                        expect(analysis.locator('.result-status')).to_have_text('Estimated')
                        expect(analysis.locator('.result-build-limits, .calc-breakdown:not(.damage-breakdown)')).to_have_count(0)
                        expect(analysis.locator('.damage-value')).to_have_text(hit)
                        page.keyboard.press('Escape')
                        # Explicit debug flag exposes preserved inventories in dev; production ignores it.
                        page.goto(origin + '/?debugDamage=1')
                        expect(page.locator('#skill-A')).to_have_value('Archery')
                        page.locator('.skill-panel').first.locator('.slot-button').first.click()
                        if mode == 'dev':
                            analysis.locator('.calc-breakdown:not(.damage-breakdown) > summary').click()
                            expect(analysis.locator('[data-relevance="non-damage"]')).to_have_count(2)
                            expect(analysis.locator('.result-build-limits')).to_contain_text('unknown damage relevance')
                            expect(page.locator('.technical-details')).to_have_count(1)
                            page.screenshot(path=str(output / f'{mode}-{width}-debug.png'), full_page=True)
                        else:
                            expect(page.locator('.calc-breakdown:not(.damage-breakdown), .technical-details')).to_have_count(0)
                        page.keyboard.press('Escape')
                        # Invalid net resistance is an unresolved scenario, never a numeric/validated result.
                        damage_build['target']['damageTypes'] = {'Fire': {'resistance': 200}}
                        seed(damage_build)
                        page.locator('.skill-panel').first.locator('.slot-button').first.click()
                        expect(analysis.locator('.result-status')).to_have_text('Unavailable')
                        expect(analysis.locator('.result-row[data-component="damage"] dd')).to_have_text('Unavailable')
                        print(f'{mode} {width}: damage passed', flush=True)
                        assert not errors, errors
                        results.append({'mode': mode, 'width': width, 'coreCounts': screenshot_counts, 'geometry': dimensions,
                            'damage': hit, 'inputFrameMs': input_frames, 'debugMode': 'dev opt-in only', 'consoleErrors': errors, 'checks': '190ms debounce, rapid input/paste/clear, Available/Selected parity, settings, target previews, imported working pairs, staging, focus, refresh, read-only, public numerical breakdown, Estimated/Unavailable, dev-only diagnostics'})
                        context.close()
                finally:
                    os.killpg(process.pid, signal.SIGTERM)
                    process.wait(timeout=10)
                    log.close()
        finally:
            browser.close()
    (output / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
