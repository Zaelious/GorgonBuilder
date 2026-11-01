"""KI-0008 Chromium regression: build first, then run with Python Playwright.
Starts the actual npm dev/preview commands. No project dependencies are added.
Records response headers, browser byte counts/hashes and planner screenshots.
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
    parser.add_argument('--output', default='/tmp/gorgonbuilder-vite-transport')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((repo / 'src/generated/game-data/manifest.json').read_text())
    processes = []
    logs = []
    results = []
    try:
        for mode, port in [('dev', 5174), ('preview', 4174)]:
            log = (output / f'{mode}.log').open('w')
            logs.append(log)
            process = subprocess.Popen(['npm', 'run', mode, '--', '--host', '127.0.0.1',
                '--port', str(port), '--strictPort'], cwd=repo, stdout=log,
                stderr=subprocess.STDOUT, start_new_session=True)
            processes.append(process)
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
                raise RuntimeError(f'{mode} did not start; see {log.name}')

        with sync_playwright() as playwright:
            proxy = {'server': os.environ['HTTPS_PROXY'], 'bypass': '127.0.0.1,localhost'} if os.environ.get('HTTPS_PROXY') else None
            browser_env = dict(os.environ)
            if os.environ.get('CHROMIUM_TRUST_HOME'):
                browser_env['HOME'] = os.environ['CHROMIUM_TRUST_HOME']
            browser = playwright.chromium.launch(executable_path=shutil.which('chromium'),
                headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'], proxy=proxy, env=browser_env)
            for mode, port in [('dev', 5174), ('preview', 4174)]:
                origin = f'http://127.0.0.1:{port}'
                context = browser.new_context(viewport={'width': 1440, 'height': 900})
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
                gzip_urls = []
                page.on('response', lambda response: gzip_urls.append(response.url) if response.url.endswith('.gz') else None)
                page.goto(origin)
                page.locator('#skill-A').wait_for()
                assert len(set(gzip_urls)) == 3, gzip_urls
                responses = page.evaluate('''async urls => {
                    const results = [];
                    for (const url of [...new Set(urls)]) {
                        const response = await fetch(url);
                        const bytes = await response.arrayBuffer();
                        results.push({url, status:response.status, headers:Object.fromEntries(response.headers),
                            receivedBytes:bytes.byteLength, sha256:Array.from(new Uint8Array(
                                await crypto.subtle.digest('SHA-256', bytes)), b=>b.toString(16).padStart(2,'0')).join('')});
                    }
                    return results;
                }''', list(gzip_urls))
                paths = {}
                for name, expected in manifest['artifacts'].items():
                    response = next(r for r in responses if f'/{name}.json' in r['url'])
                    paths[name] = response['url']
                    assert response['status'] == 200, response
                    assert response['headers']['content-type'] == 'application/gzip', response
                    assert 'content-encoding' not in response['headers'], response
                    assert int(response['headers']['content-length']) == expected['bytes'], response
                    assert response['receivedBytes'] == expected['bytes'], response
                    assert response['sha256'] == expected['sha256'], response

                # Exercise the existing UI and reload the actual autosaved document.
                for a, b in [('Psychology', 'Deer'), ('Cow', 'Unarmed'), ('Psychology', 'Psychology')]:
                    page.locator('#skill-A').select_option(a)
                    page.locator('#skill-B').select_option(b)
                    page.locator('#level-A').fill('90')
                    for slot in ['A', 'B']:
                        page.get_by_label(f'Open ability picker for bar {slot}', exact=True).click()
                        page.locator('.quick-add').first.click()
                    expect(page.get_by_role('status')).to_have_text('Saved in this browser')
                    saved = page.evaluate("JSON.parse(localStorage.getItem('gorgonbuilder.current-draft'))")
                    assert saved['skillSlotA'] == {'skillId': a, 'level': 90}, saved
                    assert saved['skillSlotB']['skillId'] == b, saved
                    assert len(saved['abilityBarA']) == len(saved['abilityBarB']) == 1, saved
                    page.reload()
                    page.locator('#skill-A').wait_for()
                    assert page.evaluate("JSON.parse(localStorage.getItem('gorgonbuilder.current-draft'))") == saved
                    # Clear both bars through the accepted UI for the next pair.
                    for slot in ['A', 'B']:
                        page.get_by_label(f'Bar {slot} slot 1:', exact=False).click()
                        page.get_by_label(f'Remove entry 1 from bar {slot}', exact=True).click()
                    expect(page.get_by_role('status')).to_have_text('Saved in this browser')
                page.locator('#skill-B').select_option('')
                expect(page.get_by_role('status')).to_have_text('Saved in this browser')
                expect(page.get_by_role('alert')).to_have_count(0)
                page.screenshot(path=str(output / f'{mode}-planner.png'), full_page=True)
                assert not errors, errors
                context.close()

                # Flip a byte in each HTTP response without modifying pinned files.
                for name, expected in manifest['artifacts'].items():
                    context = browser.new_context()
                    broken = context.new_page()
                    corrupt = bytearray((repo / 'src/generated/game-data' / expected['file']).read_bytes())
                    corrupt[20] ^= 1
                    broken.route(paths[name], lambda route, _request, body=bytes(corrupt): route.fulfill(
                        status=200, body=body, headers={'Content-Type': 'application/gzip'}))
                    broken.goto(origin)
                    expect(broken.get_by_role('alert')).to_contain_text('Game data could not be loaded')
                    expect(broken.locator('#skill-A')).to_have_count(0)
                    broken.unroute(paths[name])
                    broken.get_by_role('button', name='Retry loading game data', exact=True).click()
                    broken.locator('#skill-A').wait_for()
                    context.close()
                results.append({'mode': mode, 'responses': responses, 'expected': manifest['artifacts'],
                    'planner': 'Psychology/Deer, Cow/Unarmed, same skill, A-only, add/remove, levels and reload passed',
                    'corruption': 'all three same-size corrupt responses rejected; retry recovered', 'browserErrors': errors})
            browser.close()
    finally:
        for process in processes:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=10)
        for log in logs:
            log.close()
    (output / 'results.json').write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))
    print(f'PASS both Vite modes, compressed integrity, planner and corruption/retry. Artifacts: {output}')


if __name__ == '__main__':
    main()
