"""T0010 revised inline editor: real Chromium dev/production-preview workflow. Build first.
Uses installed Python Playwright/Chromium; adds no project dependencies.
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
    parser.add_argument('--output', default='/tmp/gorgonbuilder-mods')
    output = Path(parser.parse_args().output)
    output.mkdir(parents=True, exist_ok=True)
    repo = Path(__file__).resolve().parents[3]
    treasure = json.load(gzip.open(repo / 'src/generated/game-data/itemsTreasure.json.gz'))
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

                        def no_overflow():
                            overflow = page.evaluate('''() => ({width:innerWidth, scroll:document.documentElement.scrollWidth,
                              wide:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width}))})''')
                            if overflow['scroll'] > overflow['width']:
                                page.screenshot(path=str(output / f'{mode}-overflow.png'), full_page=True)
                            assert overflow['scroll'] <= overflow['width'], overflow
                            if page.locator('dialog').count():
                                assert page.locator('dialog').evaluate('(e) => e.scrollWidth <= e.clientWidth + 1')

                        def editor(index=0):
                            return page.locator(f'[data-selection-index="{index}"] .mod-planner')

                        def expand(slot):
                            row(slot)

                        def inline_search(value, index=0):
                            start = time.perf_counter()
                            editor(index).get_by_label('Search treasure powers', exact=True).fill(value)
                            timings.append({'action': value, 'ms': (time.perf_counter() - start) * 1000})

                        def preview_level(value, index=0):
                            editor(index).get_by_label('Mod target level', exact=True).fill(value)

                        def power(power_id='power_10001', index=0):
                            return editor(index).locator(f'[data-power-id="{power_id}"]')

                        def add(power_id='power_10001', index=0):
                            power(power_id, index).locator(':scope > .available-effect').click()

                        def candidate_details(number):
                            details = editor().locator(f'[data-mod-index="{number - 1}"] > details')
                            if not details.evaluate('(e) => e.open'):
                                details.locator(':scope > summary').click()
                            return details

                        def close_candidate_details():
                            while editor().locator('.candidate-details[open]').count():
                                editor().locator('.candidate-details[open]').first.locator(':scope > summary').click()

                        # Empty Available is mandatory until a combat skill is selected.
                        equip('Head', head['id'])
                        expect(editor().get_by_text('Select a combat skill to view mods.', exact=True)).to_be_visible()
                        expect(editor().locator('[data-power-id]')).to_have_count(0)
                        expect(page.locator('.skill-filter, [id^="skill-search"]')).to_have_count(0)
                        for slot, skill in [('A', 'Archery'), ('B', 'Cow')]:
                            page.locator(f'#skill-{slot}').select_option(skill)
                            page.get_by_label(f'Open ability picker for bar {slot}', exact=True).click()
                            page.locator('.quick-add').first.click()
                        wait_saved()
                        equip('Ring', 'item_49070')
                        equip('OffHand', 'item_45052')
                        baseline = saved()
                        expand('Head')
                        expect(editor().locator('[data-mod-group="Archery"]')).to_have_count(1)
                        expect(editor().locator('[data-mod-group="Cow"]')).to_have_count(1)
                        assert len(editor().locator('.mod-category-toggles input:checked').all()) == 3
                        for name, group in [('Generic', 'AnySkill'), ('Endurance', 'Endurance'), ('Shamanic Infusions', 'ShamanicInfusion')]:
                            editor().get_by_role('checkbox', name=name, exact=True).uncheck()
                            expect(editor().locator(f'[data-mod-group="{group}"]')).to_have_count(0)
                            editor().get_by_role('checkbox', name=name, exact=True).check()
                        # Normal Available lists only powers publishing the item's slot (and profile where applicable).
                        slots_by_power = {p['id']: p['slots'] for p in treasure['treasurePowers']}
                        profile_orders = []
                        for index, slot, treasure_slot in [(0, 'Head', 'Head'), (1, 'Ring', 'Ring'), (2, 'OffHand', 'OffHand')]:
                            expand(slot)
                            ids = editor(index).locator('[data-mod-group="Archery"] [data-power-id]').evaluate_all('(es) => es.map(e => e.dataset.powerId)')
                            assert all(treasure_slot in slots_by_power[i] for i in ids), (slot, ids)
                            assert len(ids) == len(set(ids)), ids
                            profile_orders.append(ids)
                        assert profile_orders[0] != profile_orders[1] and profile_orders[2] == []  # Archery has no Shield-profile powers
                        # Max and each numeric target stage the exact visible tier.
                        inline_search('power_10001')
                        expect(power()).to_have_attribute('data-preview-tier', 'id_12')
                        assert power().locator(':scope > button').inner_text().startswith('Archery Base Damage +60%')
                        power().locator(':scope > .available-effect').dblclick()  # a double click must not stage two copies
                        expect(power()).to_have_count(0)
                        stat = page.locator('[data-selection-index="0"] .item-stats [data-candidate-effect="0"]')
                        expect(stat.locator('.stat-chip')).to_have_text('Archery')
                        expect(page.locator('[data-selection-index="0"]')).not_to_contain_text('CANDIDATE')
                        expect(editor().locator('[data-mod-index]')).to_have_count(1)
                        preview_level('90')
                        expect(power()).to_have_count(0)
                        expect(editor().get_by_label('Tier for candidate 1', exact=True)).to_have_value('id_12')
                        expect(editor().locator('.mod-mismatch').first).to_be_visible()
                        editor().get_by_label('Remove candidate 1', exact=True).click()
                        expect(power()).to_have_attribute('data-preview-tier', 'id_9')
                        expect(stat).to_have_count(0)
                        power().locator(':scope > details > summary').click()
                        expect(power().locator(':scope > details > summary')).to_have_attribute('title', '3 preview tier options · Details and other tiers')
                        expect(power().locator('.mod-association')).to_have_text('Skill: Archery')
                        power().locator(':scope > details > summary').click()
                        preview_level('100')
                        expect(power()).to_have_attribute('data-preview-tier', 'id_10')
                        add()
                        expected_mods = [{'powerId': 'power_10001', 'tierId': 'id_10'}]
                        inline_search('')
                        group_rows = editor().locator('[data-mod-group="Archery"] [data-power-id]')
                        for _ in range(8):
                            first = group_rows.first
                            expected_mods.append({'powerId': first.get_attribute('data-power-id'), 'tierId': first.get_attribute('data-preview-tier')})
                            first.locator(':scope > .available-effect').click()
                            expect(editor().locator(f'[data-power-id="{expected_mods[-1]["powerId"]}"]')).to_have_count(0)
                        assert len({mod['powerId'] for mod in expected_mods}) == 9
                        inline_search('power_10001')
                        wait_saved()
                        assert saved()['equipment'][0]['candidateMods'] == expected_mods
                        candidate_details(1)
                        editor().get_by_label('Tier for candidate 1', exact=True).select_option('id_11')
                        expected_mods[0]['tierId'] = 'id_11'
                        expect(page.locator('[data-selection-index="0"] [data-candidate-effect="0"]')).to_contain_text('Archery Base Damage +55%')
                        editor().get_by_label('Move candidate 1 down', exact=True).focus()
                        page.keyboard.press('Enter')
                        expected_mods[0], expected_mods[1] = expected_mods[1], expected_mods[0]
                        expect(editor().locator('[data-mod-index="1"]')).to_be_focused()
                        editor().get_by_label('Remove candidate 3', exact=True).click()
                        expected_mods.pop(2)
                        candidate_details(2)
                        editor().get_by_label('Tier for candidate 2', exact=True).select_option('')
                        close_candidate_details()
                        expected_mods[1]['tierId'] = None
                        wait_saved()
                        assert saved()['equipment'][0]['candidateMods'] == expected_mods
                        expect(page.locator('[data-selection-index="0"] [data-candidate-effect]')).to_have_count(8)
                        heap_with_mods = heap()
                        inline_search('')
                        editor().locator('.candidate-list').evaluate('(e) => e.scrollTop = 0')
                        # Target changes are transient; complete restored build differs only in candidates.
                        page.reload(); page.locator('.equipment-section').wait_for(); expand('Head')
                        assert saved()['equipment'][0]['candidateMods'] == expected_mods
                        restored = saved(); restored['equipment'][0]['candidateMods'] = []
                        assert restored == baseline
                        expect(editor().get_by_label('Mod target level', exact=True)).to_have_value('Max')
                        # Skill changes: A=B keeps shared mods; removing the last Archery slot clears them, with Undo.
                        page.locator('#skill-B').select_option('Archery')
                        expect(editor().locator('[data-mod-group="Archery"]')).to_have_count(1)
                        expect(editor().locator('[data-mod-group="Cow"]')).to_have_count(0)
                        page.locator('#skill-A').select_option('')
                        expect(editor().locator('[data-mod-index]')).to_have_count(8)
                        expect(page.locator('.skill-change-notice p')).to_have_count(0)
                        page.locator('#skill-B').select_option('')
                        expect(editor().locator('[data-power-id]')).to_have_count(0)
                        expect(editor().get_by_text('Select a combat skill to view mods.', exact=True)).to_be_visible()
                        expect(page.locator('.skill-change-notice')).to_contain_text('Removed 8 staged Archery mods from 1 item.')
                        expect(editor().locator('[data-mod-index]')).to_have_count(0)
                        wait_saved(); assert saved()['equipment'][0]['candidateMods'] == [] and saved()['equipment'][1:] == baseline['equipment'][1:]
                        page.locator('.skill-change-notice button', has_text='Undo').click()
                        expect(editor().locator('[data-mod-index]')).to_have_count(8)
                        wait_saved(); assert saved()['equipment'][0]['candidateMods'] == expected_mods and saved()['skillSlotB']['skillId'] == 'Archery'
                        # Restore original bars then test source-unknown exploration and mobile stacking.
                        rich = baseline
                        rich['equipment'][0]['candidateMods'] = expected_mods
                        rich['equipment'][0]['item'] = {'kind': 'imported', 'instance': {'baseItemId': head['id'], 'metadata': {'keep': True}, 'existingPowers': [{'powerId': 'power_129', 'tierId': 'id_120'}]}}
                        rich['equipment'][0]['sparks'] = {'mode': 'simulated', 'input': {'category': 'skill-damage', 'skillId': 'Cow', 'count': 11, 'seed': 'keep'}}
                        rich['equipment'][0]['candidateMods'].append({'powerId': 'missing-power', 'tierId': 'missing-tier'})
                        page.evaluate('([key, build]) => localStorage.setItem(key, JSON.stringify(build))', [key, rich])
                        page.reload(); page.locator('.equipment-section').wait_for(); expand('Head')
                        expect(editor().locator('.candidate-list')).to_contain_text('Official power unavailable')
                        candidate_details(1)
                        editor().get_by_label('Tier for candidate 1', exact=True).select_option('id_10')
                        close_candidate_details()
                        wait_saved(); rich['equipment'][0]['candidateMods'][0]['tierId'] = 'id_10'
                        assert saved() == rich
                        expect(page.locator('[data-selection-index="0"] .item-stats [data-existing-power="0"]')).to_have_attribute('data-tier-id', 'id_120')
                        expect(page.locator('[data-selection-index="0"] .item-stats [data-existing-power="0"] .stat-chip')).to_have_text('◇ Endurance')
                        editor().get_by_label('All skills', exact=True).check()
                        editor().get_by_label('Other slots & profiles', exact=True).check()
                        for query in ['Psychology', 'Cow', 'Unarmed']:
                            inline_search(query)
                            assert editor().locator('[data-power-id]').count() > 0
                        inline_search('power_13501')
                        power('power_13501').locator(':scope > details > summary').click()
                        expect(power('power_13501').locator('.mod-association')).to_contain_text('Unknown — association unknown')
                        power('power_13501').locator(':scope > details > summary').click()
                        # Actual icons + readable templates + measured row density.
                        proof = copy.deepcopy(rich)
                        proof['skillSlotA']['skillId'] = 'AnimalHandling'
                        proof['abilityBarA'] = []
                        proof['equipment'][0]['candidateMods'] = []
                        proof['equipment'][0]['item']['instance']['existingPowers'] = [{'powerId': 'power_12301', 'tierId': 'id_25'}]
                        page.evaluate('([key, build]) => localStorage.setItem(key, JSON.stringify(build))', [key, proof])
                        page.reload(); page.locator('.equipment-section').wait_for(); expand('Head')
                        editor().get_by_label('Other slots & profiles', exact=True).check()
                        icon_power_ids = [p['id'] for p in treasure['treasurePowers'] if p['skill']['sourceId'] == 'AnimalHandling'][:8]
                        for power_id in icon_power_ids:
                            inline_search(power_id)
                            shown_tier = power(power_id).get_attribute('data-preview-tier')
                            add(power_id)
                            proof['equipment'][0]['candidateMods'].append({'powerId': power_id, 'tierId': shown_tier})
                        wait_saved(); assert saved() == proof
                        inline_search('power_12301')
                        icon = power('power_12301').locator(':scope > button img.effect-icon')
                        expect(icon).to_have_attribute('src', 'https://cdn.projectgorgon.com/v490/icons/icon_2160.png')
                        expect(icon).to_have_js_property('complete', True)
                        page.wait_for_function('(img) => img.naturalWidth > 0', arg=icon.element_handle())
                        for selector in ['.candidate-effect', '.item-stats [data-candidate-effect]', '.item-stats [data-existing-power]']:
                            image = page.locator('[data-selection-index="0"]').locator(selector).locator('img.effect-icon').first
                            image.scroll_into_view_if_needed()
                            page.wait_for_function('(img) => img.complete && img.naturalWidth > 0', arg=image.element_handle())
                        # Keyboard expansion exposes full tier/source facts with images.
                        summary = editor().get_by_label('Details and tier for candidate 1', exact=True)
                        summary.focus(); page.keyboard.press('Enter')
                        fact_icon = editor().locator('[data-mod-index="0"] .mod-tier-facts img').first
                        expect(fact_icon).to_be_visible()
                        page.wait_for_function('(img) => img.naturalWidth > 0', arg=fact_icon.element_handle())
                        close_candidate_details()
                        inline_search('')
                        editor().locator('.mod-available-scroll, .candidate-list').evaluate_all('(es) => es.forEach(e => e.scrollTop=0)')
                        editor().scroll_into_view_if_needed()
                        geometry = editor().locator('.mod-available-scroll').evaluate("""panel => {
                            const b = panel.getBoundingClientRect();
                            const rows = [...panel.querySelectorAll('.mod-available-power')].map(e=>e.getBoundingClientRect());
                            const texts = [...panel.querySelectorAll('.available-effect-text')];
                            return {height:b.height, width:b.width, visibleRows:rows.filter(r=>r.top>=b.top && r.bottom<=b.bottom).length,
                              rowHeights:rows.slice(0,15).map(r=>r.height),
                              clamped:texts.filter(t=>t.scrollHeight>t.clientHeight+1).length, total:texts.length};
                        }""")
                        editor().screenshot(path=str(output / f'{mode}-inline-desktop.png'))
                        page.screenshot(path=str(output / f'{mode}-page-desktop.png'), full_page=True)
                        # Readability over a fixed count: wider columns, 1-2 line rows, still dense.
                        assert 400 <= geometry['height'] <= 430, geometry
                        assert geometry['width'] >= 600, geometry
                        assert geometry['visibleRows'] >= 8, geometry
                        assert max(geometry['rowHeights']) <= 50, geometry
                        normal_rows = editor().locator('.available-effect, .candidate-effect')
                        assert all('<icon=' not in r.inner_text() and '{MOD_' not in r.inner_text() and 'source value' not in r.inner_text() for r in normal_rows.all())
                        # Paired Animal Handling attributes: one readable +25%/+25% effect, fully visible without the details control.
                        paired = 'Direct Electricity Damage +25%, Fire Damage (Direct & Per-Tick) +25%'
                        inline_search('power_12192')
                        expect(power('power_12192')).to_have_attribute('data-preview-tier', 'id_25')
                        paired_text = power('power_12192').locator('.available-effect-text')
                        expect(paired_text).to_have_text(paired)
                        clip = '(e) => e.scrollHeight <= e.clientHeight + 1 && e.scrollWidth <= e.clientWidth + 1'
                        assert paired_text.evaluate(clip), 'paired Available effect clipped'
                        add('power_12192')
                        expect(power('power_12192')).to_have_count(0)
                        proof['equipment'][0]['candidateMods'].append({'powerId': 'power_12192', 'tierId': 'id_25'})
                        paired_candidate = editor().locator('.candidate-effect').last
                        paired_candidate.scroll_into_view_if_needed()
                        expect(paired_candidate).to_have_text(paired)
                        expect(page.locator('[data-selection-index="0"] [data-candidate-effect]').last).to_contain_text(paired)
                        for locator in [paired_candidate, page.locator('[data-selection-index="0"] [data-candidate-effect] > span:last-child').last]:
                            assert locator.evaluate('(e) => e.scrollHeight <= e.clientHeight + 1 && e.scrollWidth <= e.clientWidth + 1'), 'paired effect clipped'
                        overlap = editor().evaluate("""root => {
                            const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
                            const bad = [];
                            for (const row of root.querySelectorAll('.mod-available-power, .candidate-list > li')) {
                              const text = row.querySelector('.available-effect-text, .candidate-effect');
                              if (!text) continue;
                              const t = text.getBoundingClientRect();
                              for (const control of row.querySelectorAll(':scope .mod-add-mark, :scope > details > summary, :scope > .candidate-remove'))
                                if (hit(t, control.getBoundingClientRect())) bad.push(control.className || control.tagName);
                            }
                            return bad;
                        }""")
                        assert overlap == [], overlap
                        wait_saved(); assert saved() == proof
                        editor().screenshot(path=str(output / f'{mode}-paired-desktop.png'))
                        inline_search('')
                        # Missing icon fallback is intentional, isolated and recorded separately.
                        before_fallback = len(errors)
                        page.route('**/icons/icon_2160.png', lambda route: route.fulfill(status=404, body='missing icon'))
                        inline_search('power_12301'); page.reload(); page.locator('.equipment-section').wait_for(); expand('Head')
                        editor().get_by_label('Other slots & profiles', exact=True).check()
                        inline_search('power_12301')
                        expect(power('power_12301').locator('.effect-icon-fallback')).to_be_visible()
                        assert '<icon=' not in power('power_12301').locator(':scope > button').inner_text()
                        fallback_errors = errors[before_fallback:]
                        assert all('404' in error for error in fallback_errors), fallback_errors
                        del errors[before_fallback:]
                        page.unroute('**/icons/icon_2160.png')
                        page.reload(); page.locator('.equipment-section').wait_for(); expand('Head')
                        page.set_viewport_size({'width': 375, 'height': 812})
                        inline_search('')
                        no_overflow()
                        assert editor().evaluate('(e) => e.scrollWidth <= e.clientWidth + 1')
                        available_box = editor().locator('.mod-available').bounding_box()
                        selected_box = editor().locator('.mod-selected').bounding_box()
                        assert selected_box['y'] >= available_box['y'] + available_box['height']
                        editor().locator('.mod-available-scroll, .candidate-list').evaluate_all('(es) => es.forEach(e => e.scrollTop=0)')
                        editor().screenshot(path=str(output / f'{mode}-inline-mobile.png'))
                        page.screenshot(path=str(output / f'{mode}-page-mobile.png'), full_page=True)
                        for width in [320, 768]:
                            page.set_viewport_size({'width': width, 'height': 900}); no_overflow()
                        rich = proof
                        # Druid + Chest (item_42705): one entry per official Druid Chest power, STATS panel, skill clearing.
                        page.set_viewport_size({'width': 1440, 'height': 900})
                        druid_build = copy.deepcopy(baseline)
                        druid_build['skillSlotA'] = {'skillId': 'Druid', 'level': 100}
                        druid_build['skillSlotB'] = {'skillId': None, 'level': 70}
                        druid_build['abilityBarA'] = []; druid_build['abilityBarB'] = []
                        druid_build['equipment'] = [e for e in druid_build['equipment'] if e['slot'] != 'Chest'] + [{'slot': 'Chest', 'item': {'kind': 'database', 'itemId': 'item_42705'}, 'candidateMods': [], 'sparks': {'mode': 'none'}}]
                        chest_index = len(druid_build['equipment']) - 1
                        page.evaluate('([key, build]) => localStorage.setItem(key, JSON.stringify(build))', [key, druid_build])
                        page.reload(); page.locator('.equipment-section').wait_for(); expand('Chest')
                        chest = page.locator(f'[data-selection-index="{chest_index}"]')
                        chest_editor = chest.locator('.mod-planner')
                        druid_rows = chest_editor.locator('[data-mod-group="Druid"] [data-power-id]')
                        druid_ids = sorted(druid_rows.evaluate_all('(es) => es.map(e => e.dataset.powerId)'))
                        assert druid_ids == ['power_14005', 'power_14012', 'power_14051', 'power_14052', 'power_14101', 'power_14154', 'power_14159', 'power_14201', 'power_14351', 'power_14501', 'power_14602'], druid_ids
                        max_previews = druid_rows.evaluate_all('(es) => Object.fromEntries(es.map(e => [e.dataset.powerId, e.dataset.previewTier]))')
                        chest_editor.get_by_label('Mod target level', exact=True).fill('100')
                        expect(druid_rows).to_have_count(11)
                        level_previews = druid_rows.evaluate_all('(es) => Object.fromEntries(es.map(e => [e.dataset.powerId, e.dataset.previewTier]))')
                        assert sorted(level_previews) == druid_ids and level_previews != max_previews, (max_previews, level_previews)
                        chest_editor.get_by_label('Mod target level', exact=True).fill('Max')
                        base_rows = chest.locator('.item-stats [data-stat-kind="base"] .stat-text')
                        expect(base_rows).to_have_count(8)
                        assert 'Vulnerability to Electricity -20%' in base_rows.all_inner_texts() and 'Armor from Combat Refresh Abilities +45' in base_rows.all_inner_texts()
                        expect(chest).not_to_contain_text('more fixed effects')
                        druid_mods = []
                        for power_id in ['power_14005', 'power_14154', 'power_14201']:
                            druid_row = chest_editor.locator(f'[data-power-id="{power_id}"]')
                            druid_mods.append({'powerId': power_id, 'tierId': druid_row.get_attribute('data-preview-tier')})
                            druid_row.locator(':scope > .available-effect').click()
                        expect(druid_rows).to_have_count(8)
                        planned = chest.locator('.item-stats [data-stat-kind="planned"]')
                        expect(planned).to_have_count(3)
                        expect(planned.locator('.stat-chip')).to_have_text(['Druid', 'Druid', 'Druid'])
                        chip_x = chest.locator('.item-stats .stat-text').evaluate_all('(es) => [...new Set(es.map(e => Math.round(e.getBoundingClientRect().left)))]')
                        assert len(chip_x) == 1, chip_x  # every STATS effect starts in one aligned column
                        expect(chest).not_to_contain_text('CANDIDATE')
                        wait_saved(); assert saved()['equipment'][chest_index]['candidateMods'] == druid_mods
                        chest.scroll_into_view_if_needed()
                        page.locator('[data-equipment-row="Chest"]').screenshot(path=str(output / f'{mode}-druid-chest-desktop.png'))
                        page.set_viewport_size({'width': 375, 'height': 812})
                        no_overflow()
                        page.locator('[data-equipment-row="Chest"]').screenshot(path=str(output / f'{mode}-druid-chest-mobile.png'))
                        page.set_viewport_size({'width': 1440, 'height': 900})
                        page.locator('#skill-A').select_option('Psychology')
                        expect(page.locator('.skill-change-notice')).to_contain_text('Removed 3 staged Druid mods from 1 item.')
                        expect(planned).to_have_count(0)
                        wait_saved(); assert saved()['equipment'][chest_index]['candidateMods'] == [] and saved()['equipment'][:chest_index] == druid_build['equipment'][:chest_index]
                        page.locator('.skill-change-notice button', has_text='Undo').click()
                        expect(planned).to_have_count(3)
                        wait_saved(); assert saved()['equipment'][chest_index]['candidateMods'] == druid_mods and saved()['skillSlotA']['skillId'] == 'Druid'
                        # A mismatched snapshot is inspectable but never writable.
                        rich['gameDataVersion'] = 'other-version'
                        page.evaluate('([key, build]) => localStorage.setItem(key, JSON.stringify(build))', [key, rich])
                        page.reload(); page.locator('.equipment-section').wait_for(); expand('Head')
                        editor().get_by_label('Other slots & profiles', exact=True).check()
                        inline_search('power_12301'); preview_level('90')
                        expect(power('power_12301').locator(':scope > button')).to_be_disabled()
                        assert all(e.is_disabled() for e in editor().locator('.candidate-list button, .candidate-list select').all())
                        page.wait_for_timeout(600); assert saved() == rich
                        assert errors == [], errors
                        results.append({'chromiumVersion': browser.version, 'heapAfterGc': {'loaded': heap_loaded, 'withModEditor': heap_with_mods}, 'mode': mode,
                            'loadMs': load_ms, 'timings': timings, 'profileOrders': profile_orders, 'candidateCountAfterEdits': 8, 'density': geometry, 'expectedIcon404Errors': fallback_errors, 'errors': errors})
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
