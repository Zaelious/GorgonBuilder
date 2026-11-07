import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../app/App';
import { createDefaultBuildDocument, type BuildDocument } from '../../core/build/document';
import { loadGameDataRepository } from '../../data/repository/load';
import { DRAFT_STORAGE_KEY } from '../../persistence/local/storage';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { createAccountApi } from '../account/api';
import { redirectTo } from '../account/browser';
import { createFakeAccountServer, type FakeAccountServer } from '../account/testing/fake-server';
import { CLOUD_LINK_KEY, MAX_REPLACED_DRAFTS, REPLACED_DRAFT_KEY, type ReplacedDraft } from './workspace';

vi.mock('../../data/repository/load', () => ({ loadGameDataRepository: vi.fn() }));
vi.mock('../account/browser', () => ({ redirectTo: vi.fn() }));
const loader = vi.mocked(loadGameDataRepository);
const redirect = vi.mocked(redirectTo);
let data: ReturnType<typeof loadPlannerFixture>;
let container: HTMLDivElement;
let root: Root;
let server: FakeAccountServer;

beforeAll(() => {
  data = loadPlannerFixture();
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value() { this.setAttribute('open', ''); } },
    close: { configurable: true, value() { this.removeAttribute('open'); } },
  });
});
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear(); sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  loader.mockReset().mockResolvedValue(data);
  redirect.mockReset();
  server = createFakeAccountServer();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const empty = () => createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
const doc = (title: string, a: string | null, b: string | null, extra: Partial<BuildDocument> = {}): BuildDocument =>
  ({ ...empty(), title, skillSlotA: { skillId: a, level: 90 }, skillSlotB: { skillId: b, level: 80 }, ...extra });
async function settle() { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); }
async function render(path = '/') {
  window.history.replaceState(null, '', path);
  await act(async () => { root.render(<App accountApi={createAccountApi(server.fetch)} />); });
  await settle();
}
function find<T extends HTMLElement = HTMLElement>(selector: string): T {
  const found = container.querySelector<T>(selector);
  if (!found) throw new Error(`Missing: ${selector}`);
  return found;
}
function button(text: string | RegExp, scope: ParentNode = container): HTMLButtonElement {
  const match = [...scope.querySelectorAll('button')].find(b => typeof text === 'string' ? b.textContent?.trim() === text : text.test(b.textContent ?? ''));
  if (!match) throw new Error(`Missing button: ${String(text)}`);
  return match;
}
const hasButton = (text: string | RegExp) => [...container.querySelectorAll('button')].some(b => typeof text === 'string' ? b.textContent?.trim() === text : text.test(b.textContent ?? ''));
async function click(target: HTMLElement | string) {
  const element = typeof target === 'string' ? button(target) : target;
  await act(async () => { element.click(); });
  await settle();
}
async function type(selector: string, value: string) {
  const element = find<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector);
  await act(async () => {
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}
async function submit(selector: string) { await act(async () => { find<HTMLFormElement>(selector).requestSubmit(); }); await settle(); }
async function tick(ms = 500) { await act(async () => { vi.advanceTimersByTime(ms); }); }
const draft = () => JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!) as BuildDocument;
const text = () => container.textContent ?? '';
const backups = () => (JSON.parse(localStorage.getItem(REPLACED_DRAFT_KEY)!) as { version: 2; entries: ReplacedDraft[] }).entries;
/** Make one storage key fail to write (quota/permission/per-key failure) while others work. */
function failWrites(key: string) {
  const original = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name: string, value: string) {
    if (name === key) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    original.call(this, name, value);
  });
}

describe('deployments without the account backend (production, PR previews)', () => {
  it('shows the unchanged guest planner with no account or cloud controls', async () => {
    server.setMode('disabled');
    await render();
    expect(container.querySelector('.app-nav')).toBeNull();
    expect(container.querySelector('.cloud-save')).toBeNull();
    expect(find('.save-draft').textContent).toBe('Save');
    expect(text()).toContain('Local draft only');
    expect(server.calls.map(c => c.path)).toEqual(['/api/auth/get-session']);
    await type('#skill-A', 'Cow'); await tick();
    expect(draft().title).toBe('Cow');
  });
  it.each(['/my-builds', '/builds/build00000000001', '/profile'])('account-only page %s explains it is unavailable', async path => {
    server.setMode('disabled');
    await render(path);
    expect(text()).toMatch(/not available (on this site|here)/);
    expect(container.querySelector('.app-nav')).toBeNull();
  });
  it('a configured but failing service offers retry and never blocks planning', async () => {
    server.setMode('unavailable');
    await render();
    expect(hasButton('Accounts offline · Retry')).toBe(true);
    expect(find<HTMLSelectElement>('#skill-A').disabled).toBe(false);
    server.setMode('enabled');
    await click('Accounts offline · Retry');
    expect(hasButton('Sign in')).toBe(true);
  });
});

describe('guest and sign-in', () => {
  it('guest plans freely; Save build asks to sign in; the provider redirect flushes the local draft first', async () => {
    await render();
    expect(hasButton('Sign in')).toBe(true);
    expect(find('.save-draft').textContent).toBe('Save locally');
    expect(find('#cloud-status').textContent).toContain('Not saved to My Builds · sign in to save');
    await type('#skill-A', 'Cow'); await type('#skill-B', 'Unarmed');
    await click(find('.cloud-save'));
    expect(find('#sign-in-title').textContent).toBe('Sign in to GorgonBuilder');
    expect(find('.sign-in-dialog').textContent).toContain('Sign in to save this build to My Builds.');
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull(); // still inside the 500 ms autosave debounce
    await click('Continue with Google');
    expect(draft().title).toBe('Cow/Unarmed');
    expect(server.calls.find(c => c.path === '/api/auth/sign-in/social')?.body).toEqual({ provider: 'google', callbackURL: '/' });
    expect(redirect).toHaveBeenCalledWith('https://accounts.example/google?return=%2F');
  });
  it('does not leave for the provider when the local draft cannot be saved, unless the user explicitly accepts the loss', async () => {
    await render();
    const writes = failWrites(DRAFT_STORAGE_KEY);
    await type('#skill-A', 'Cow');
    await click(find('.cloud-save'));
    await click('Continue with Google');
    expect(redirect).not.toHaveBeenCalled();
    expect(server.calls.some(c => c.path === '/api/auth/sign-in/social')).toBe(false);
    expect(find('.unsaved-before-sign-in').textContent).toContain('those unsaved changes would be lost');
    await click('Try saving again');
    expect(redirect).not.toHaveBeenCalled();
    writes.mockRestore();
    await click('Try saving again');
    expect(draft().skillSlotA.skillId).toBe('Cow');
    expect(redirect).toHaveBeenCalledTimes(1);
  });
  it('an explicit "sign in anyway" proceeds even though local saving failed', async () => {
    await render();
    failWrites(DRAFT_STORAGE_KEY);
    await type('#skill-A', 'Cow');
    await click(find('.cloud-save'));
    await click('Continue with Discord');
    expect(redirect).not.toHaveBeenCalled();
    await click('Sign in anyway and lose unsaved changes');
    expect(redirect).toHaveBeenCalledWith('https://accounts.example/discord?return=%2F');
  });
  it('returns to the shared page after sign-in (copy context is preserved)', async () => {
    const id = server.insert('Author', doc('Cow/Unarmed', 'Cow', 'Unarmed'), { visibility: 'public' }).id;
    await render(`/builds/${id}`);
    await click('Sign in to copy');
    expect(find('.sign-in-dialog').textContent).toContain('You will return to this page.');
    await click('Continue with Discord');
    expect(server.calls.find(c => c.path === '/api/auth/sign-in/social')?.body).toEqual({ provider: 'discord', callbackURL: `/builds/${id}` });
  });
  it('a failed or cancelled OAuth return shows a friendly notice and removes the query', async () => {
    await render('/?signin=failed&error=access_denied');
    expect(text()).toContain('Sign-in was not completed. Your work is unchanged.');
    expect(window.location.search).toBe('');
  });
  it('new accounts choose a username (no template prefill) and must confirm it cannot be changed', async () => {
    server.signInAs('Taken');
    server.signOutServerSide();
    server.signInAs(null);
    await render();
    const input = find<HTMLInputElement>('#username-input');
    expect(input.value).toBe('');
    expect(text()).not.toContain('YourUsername');
    for (const [name, message] of [['ab', 'at least 3'], ['admin', 'reserved'], ['bad name', 'letters, numbers']]) {
      await type('#username-input', name!); await submit('.account-form');
      expect(find('[role=alert]', ).textContent).toContain(message);
    }
    await type('#username-input', 'taken'); await submit('.account-form');
    expect(text()).toContain('cannot currently be changed');
    await click('Confirm “taken”');
    expect(text()).toContain('already taken');
    await type('#username-input', 'CowFan'); await submit('.account-form');
    await click('Confirm “CowFan”');
    expect(server.calls.filter(c => c.path === '/api/me/username').map(c => c.body)).toEqual([{ username: 'taken' }, { username: 'CowFan' }]);
    expect(container.querySelector('#username-input')).toBeNull();
    expect(find('.account-name').textContent).toBe('CowFan');
    expect(text()).toContain('Welcome, CowFan!');
  });
  it('sign-out keeps the working build and returns to guest controls', async () => {
    server.signInAs('CowFan');
    await render();
    await type('#skill-A', 'Cow'); await tick();
    const before = localStorage.getItem(DRAFT_STORAGE_KEY);
    await click(find('.account-button'));
    await click('Sign out');
    expect(hasButton('Sign in')).toBe(true);
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(before);
    expect(text()).toContain('Signed out. Your working build is still saved in this browser.');
  });
});

describe('saving to My Builds', () => {
  beforeEach(() => { server.signInAs('CowFan'); });
  async function saveNew() {
    await click(find('.cloud-save'));
    await submit('.account-form');
  }
  it('creates a Private record with the exact working BuildDocument; Save changes is revision-aware and single-flight', async () => {
    await render();
    await type('#skill-A', 'Cow'); await type('#skill-B', 'Unarmed'); await type('#level-A', '95');
    await click(find('.cloud-save'));
    expect(find<HTMLInputElement>('#save-title').value).toBe('Cow/Unarmed');
    expect(find<HTMLInputElement>('input[name=save-visibility][value=private]').checked).toBe(true);
    await submit('.account-form');
    const [row] = [...server.rows.values()];
    await tick();
    expect(row).toMatchObject({ owner: 'CowFan', visibility: 'private', title: 'Cow/Unarmed', revision: 1 });
    expect(row!.document).toEqual(draft());
    expect(find('#cloud-status').textContent).toContain('All changes saved');
    expect(find('#cloud-status').textContent).toContain('Private');
    expect(button('Saved').disabled).toBe(true);

    await type('#level-B', '70');
    expect(find('#cloud-status').textContent).toContain('Unsaved changes');
    const release = server.hold(c => c.method === 'PATCH');
    await click('Save changes');
    await click(button('Saving…'));
    expect(server.calls.filter(c => c.method === 'PATCH')).toHaveLength(1);
    release(); await settle();
    expect(server.calls.find(c => c.method === 'PATCH')!.body).toMatchObject({ expectedRevision: 1, title: 'Cow/Unarmed' });
    expect(row!.document.skillSlotB.level).toBe(70);
    expect(find('#cloud-status').textContent).toContain('All changes saved');
    await type('#level-B', '71');
    await click('Save changes');
    expect(server.calls.filter(c => c.method === 'PATCH')[1]!.body).toMatchObject({ expectedRevision: 2 });
    // The local Save stays separate: it writes only this browser and never calls the API.
    const writes = server.writes().length;
    await click(find('.save-draft'));
    expect(server.writes()).toHaveLength(writes);
  });
  it('a custom title chosen in the save dialog is kept when skills change later', async () => {
    await render();
    await type('#skill-A', 'Deer'); await type('#skill-B', 'Psychology');
    await click(find('.cloud-save'));
    await type('#save-title', 'Deer/Psychology Tank');
    await submit('.account-form');
    await type('#skill-B', 'Unarmed');
    expect(find('.title-button').textContent).toBe('Deer/Psychology Tank');
  });
  it('Save as new creates an independent record and leaves the original untouched', async () => {
    await render();
    await type('#skill-A', 'Cow'); await saveNew();
    const original = [...server.rows.values()][0]!;
    const savedDocument = structuredClone(original.document);
    await type('#level-A', '50');
    await click('Save as new');
    expect(find('#save-build-title').textContent).toBe('Save as a new build');
    await type('#save-title', 'Cow variant');
    await submit('.account-form');
    expect(server.rows.size).toBe(2);
    expect(original.revision).toBe(1);
    expect(original.document).toEqual(savedDocument);
    expect([...server.rows.values()][1]!.document.skillSlotA.level).toBe(50);
    expect(JSON.parse(localStorage.getItem(CLOUD_LINK_KEY)!).buildId).not.toBe(original.id);
  });
  it('a revision conflict offers safe choices; loading the saved version keeps a restorable backup', async () => {
    await render();
    await type('#skill-A', 'Cow'); await saveNew();
    const row = [...server.rows.values()][0]!;
    row.revision = 2; row.document = { ...row.document, skillSlotA: { skillId: 'Cow', level: 11 } };
    await type('#level-A', '77');
    await click('Save changes');
    expect(text()).toContain('changed somewhere else');
    for (const label of ['Save mine as a new build', 'Load the saved version', 'Overwrite with mine']) expect(hasButton(label)).toBe(true);
    await click('Load the saved version');
    expect(find<HTMLInputElement>('#level-A').value).toBe('11');
    expect(backups().map(entry => entry.document.skillSlotA.level)).toEqual([77]);
    await click(find('[aria-label="Restore “Cow”"]'));
    expect(find<HTMLInputElement>('#level-A').value).toBe('77');
    expect(localStorage.getItem(REPLACED_DRAFT_KEY)).toBeNull();
  });
  async function conflictWithEdit(level: string) {
    await render();
    await type('#skill-A', 'Cow'); await saveNew();
    const row = [...server.rows.values()][0]!;
    row.revision = 2; row.document = { ...row.document, skillSlotA: { skillId: 'Cow', level: 11 } };
    await type('#level-A', level);
    await click('Save changes');
    expect(hasButton('Load the saved version')).toBe(true);
  }
  it('loading the saved version is refused, keeping the edits, when the backup cannot be written', async () => {
    await conflictWithEdit('77');
    const writes = failWrites(REPLACED_DRAFT_KEY);
    await click('Load the saved version');
    expect(text()).toContain('Nothing was replaced: this browser could not save a backup of your current build');
    expect(find<HTMLInputElement>('#level-A').value).toBe('77');
    expect(localStorage.getItem(REPLACED_DRAFT_KEY)).toBeNull();
    expect(hasButton('Load the saved version')).toBe(true);
    writes.mockRestore();
    await click('Load the saved version');
    expect(find<HTMLInputElement>('#level-A').value).toBe('11');
    expect(backups().map(entry => entry.document.skillSlotA.level)).toEqual([77]);
  });
  it('earlier backups are never overwritten; a full backup list refuses further replacement', async () => {
    const earlier = Array.from({ length: MAX_REPLACED_DRAFTS - 1 }, (_, index) => ({ replacedAt: index + 1, document: doc(`Earlier ${index}`, 'Deer', null), link: null }));
    localStorage.setItem(REPLACED_DRAFT_KEY, JSON.stringify({ version: 2, entries: earlier }));
    await conflictWithEdit('77');
    await click('Load the saved version');
    expect(backups().map(entry => entry.document.title)).toEqual([...earlier.map(entry => entry.document.title), 'Cow']);
    await type('#level-A', '12');
    server.rows.values().next().value!.revision = 9;
    await click('Save changes');
    await click('Load the saved version');
    expect(text()).toContain(`${MAX_REPLACED_DRAFTS} earlier builds are already kept`);
    expect(find<HTMLInputElement>('#level-A').value).toBe('12');
    expect(backups()).toHaveLength(MAX_REPLACED_DRAFTS);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await click(find('[aria-label="Discard “Earlier 0”"]'));
    await click('Load the saved version');
    expect(find<HTMLInputElement>('#level-A').value).toBe('11');
    expect(backups().map(entry => entry.document.title).slice(-2)).toEqual(['Cow', 'Cow']);
  });
  it('overwrite after a conflict requires confirmation and then saves against the latest revision', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await render();
    await type('#skill-A', 'Cow'); await saveNew();
    const row = [...server.rows.values()][0]!;
    row.revision = 5;
    await type('#level-A', '66');
    await click('Save changes');
    await click('Overwrite with mine');
    expect(confirm).toHaveBeenCalled();
    expect(server.calls.filter(c => c.method === 'PATCH').at(-1)!.body).toMatchObject({ expectedRevision: 5 });
    expect(row.document.skillSlotA.level).toBe(66);
  });
  it('an expired session during save keeps the work, explains, and returns to guest controls', async () => {
    await render();
    await type('#skill-A', 'Cow'); await tick();
    server.failNext(c => c.path === '/api/builds', 401, 'unauthenticated');
    await saveNew();
    expect(text()).toContain('Your sign-in has ended');
    expect(hasButton('Sign in')).toBe(true);
    expect(draft().skillSlotA.skillId).toBe('Cow');
    expect(server.rows.size).toBe(0);
  });
  it.each([[413, 'payload_too_large', 'too large'], [422, 'invalid_metadata', 'rejected'], [429, 'rate_limited', 'one minute'],
    [503, 'unavailable', 'temporarily unavailable'], [0, 'network', 'offline']] as const)('%s failures explain and can be retried', async (status, code, message) => {
    await render();
    await type('#skill-A', 'Cow');
    server.failNext(c => c.path === '/api/builds', status, code, 'Title must be at most 120 characters.');
    await saveNew();
    expect(find('.cloud-notice.warning').textContent).toContain(message);
    expect(server.rows.size).toBe(0);
    await click('Retry');
    expect(server.rows.size).toBe(1);
  });
  it('clearing a linked build starts a new unsaved build and never empties the saved copy', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await render();
    await type('#skill-A', 'Cow'); await saveNew();
    await click(find('.clear-build'));
    expect(localStorage.getItem(CLOUD_LINK_KEY)).toBeNull();
    expect(find('#cloud-status').textContent).toContain('Not saved to My Builds');
    expect([...server.rows.values()][0]!.document.skillSlotA.skillId).toBe('Cow');
  });
});

describe('My Builds, sharing and profiles', () => {
  beforeEach(() => { server.signInAs('CowFan'); });
  it('lists only own builds with sort, combat-skill filters, duplicate and confirmed delete', async () => {
    server.insert('CowFan', doc('Zeta', 'Cow', 'Unarmed'));
    server.insert('CowFan', doc('Alpha', 'Deer', 'Psychology'), { visibility: 'public', publicDescription: 'Tank build' });
    server.insert('CowFan', doc('Mid', 'Psychology', 'Cow'), { visibility: 'unlisted' });
    server.insert('Other', doc('Not mine', 'Cow', 'Unarmed'));
    await render('/my-builds');
    const titles = () => [...container.querySelectorAll('.build-row-title')].map(a => a.textContent);
    expect(titles()).toEqual(['Mid', 'Alpha', 'Zeta']);
    expect(text()).toContain('Tank build');
    expect([...container.querySelectorAll('.visibility-badge')].map(b => b.textContent)).toEqual(['Unlisted', 'Public', 'Private']);
    await type('[aria-label="Sort builds"]', 'name');
    expect(titles()).toEqual(['Alpha', 'Mid', 'Zeta']);
    await type('[aria-label="Filter by combat skill"]', 'Cow');
    expect(titles()).toEqual(['Mid', 'Zeta']);
    await type('[aria-label="Filter by second combat skill"]', 'Unarmed');
    expect(titles()).toEqual(['Zeta']);
    await type('[aria-label="Filter by combat skill"]', '');
    await type('[aria-label="Filter by second combat skill"]', '');
    await click(find('[aria-label="Duplicate Zeta"]'));
    expect(titles()).toContain('Zeta (copy)');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await click(find('[aria-label="Delete Alpha"]'));
    expect(server.calls.some(c => c.method === 'DELETE')).toBe(false);
    await click(find('[aria-label="Delete Alpha"]'));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(server.calls.find(c => c.method === 'DELETE')!.body).toEqual({ expectedRevision: 1 });
    expect(titles()).not.toContain('Alpha');
  });
  it('global notices never reload the library', async () => {
    server.insert('CowFan', doc('Zeta', 'Cow', 'Unarmed'));
    await render('/my-builds?signin=failed');
    const lists = () => server.calls.filter(c => c.path.startsWith('/api/me/builds')).length;
    expect(lists()).toBe(1);
    await click(find('[aria-label="Dismiss notice"]'));
    expect(lists()).toBe(1);
    expect(container.querySelectorAll('.build-row')).toHaveLength(1);
  });
  it('shows a helpful empty state and a sign-in prompt for guests', async () => {
    await render('/my-builds');
    expect(text()).toContain('No saved builds yet');
    await click(find('.account-button'));
    await click('Sign out');
    await render('/my-builds');
    expect(text()).toContain('Sign in to see and manage your saved builds');
  });
  it('opening a build protects unsaved local work with a confirmation and a backup', async () => {
    const local = doc('My experiment', 'Cow', null);
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(local));
    server.insert('CowFan', doc('Alpha', 'Deer', 'Psychology'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await render('/my-builds');
    await click(find('[aria-label="Open Alpha in the planner"]'));
    expect(window.location.pathname).toBe('/my-builds');
    expect(draft()).toEqual(local);
    await click(find('[aria-label="Open Alpha in the planner"]'));
    expect(confirm.mock.calls[1]![0]).toContain('My experiment');
    expect(window.location.pathname).toBe('/');
    expect(find('.title-button').textContent).toBe('Alpha');
    expect(find('#cloud-status').textContent).toContain('All changes saved');
    expect(text()).toContain('“My experiment” was kept on this device');
    await click(find('[aria-label="Restore “My experiment”"]'));
    expect(find('.title-button').textContent).toBe('My experiment');
  });
  it('publishing needs a review; share links exist only for Unlisted/Public; Private revokes them', async () => {
    const id = server.insert('CowFan', doc('Alpha', 'Deer', 'Psychology', { notes: 'private notes' })).id;
    await render('/my-builds');
    await click(find('[aria-label="Share Alpha"]'));
    expect(container.querySelector('#share-link-input')).toBeNull();
    await click(find<HTMLInputElement>('input[name=visibility][value=public]'));
    expect(find('.publication-review').textContent).toContain('Never shared');
    expect(find('.publication-review').textContent).toContain('CharacterSheet/Storage files');
    expect(button('Save sharing settings').disabled).toBe(true);
    await click(find<HTMLInputElement>('.review-confirm input'));
    await type('#share-description', 'Stampede tank');
    await click('Save sharing settings');
    expect(server.calls.find(c => c.method === 'PATCH')!.body).toEqual({ expectedRevision: 1, visibility: 'public', publicDescription: 'Stampede tank' });
    expect(find<HTMLInputElement>('#share-link-input').value).toBe(`${window.location.origin}/builds/${id}`);
    expect(text()).toContain('Search Builds directory arrives in the next update');
    await click(find<HTMLInputElement>('input[name=visibility][value=private]'));
    await click('Save sharing settings');
    expect(server.rows.get(id)!.visibility).toBe('private');
    expect(container.querySelector('#share-link-input')).toBeNull();
    expect(text()).toContain('shared links no longer work');
  });
  it('profile shows the username and only Public builds', async () => {
    server.insert('CowFan', doc('Public one', 'Cow', 'Unarmed'), { visibility: 'public' });
    server.insert('CowFan', doc('Secret one', 'Cow', 'Unarmed'), { visibility: 'unlisted' });
    await render('/profile');
    expect(text()).toContain('Signed in as CowFan');
    expect(text()).toContain('cannot currently be changed');
    expect(text()).toContain('Public one');
    expect(text()).not.toContain('Secret one');
  });
});

describe('shared build pages', () => {
  it('guests get a read-only planner with no editing and no local draft changes; Private looks missing', async () => {
    const local = doc('Mine', 'Cow', null);
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(local));
    const before = localStorage.getItem(DRAFT_STORAGE_KEY);
    const shared = server.insert('Author', doc('Cow/Unarmed', 'Cow', 'Unarmed', { notes: 'PRIVATE_NOTES', characterImport: { characterName: 'PRIVATE_CHARACTER' } }), { visibility: 'unlisted', publicDescription: 'Shared tank' });
    const hidden = server.insert('Author', doc('Hidden', 'Cow', 'Unarmed'));
    await render(`/builds/${shared.id}`);
    expect(find('#shared-build-title').textContent).toBe('Cow/Unarmed');
    expect(text()).toContain('by Author');
    expect(text()).toContain('Shared tank');
    expect(text()).toContain('Read-only view');
    expect(find<HTMLSelectElement>('#skill-A').value).toBe('Cow');
    expect(find<HTMLSelectElement>('#skill-A').closest('fieldset')!.disabled).toBe(true);
    expect(text()).not.toMatch(/PRIVATE_|Edit in planner|Delete/);
    await tick(2000);
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(before);
    await click('Sign in to copy');
    expect(container.querySelector('#sign-in-title')).not.toBeNull();
    await act(async () => { root.unmount(); });
    root = createRoot(container);
    await render(`/builds/${hidden.id}`);
    expect(text()).toContain('Build not available');
    expect(text()).not.toContain('Hidden');
  });
  it('another signed-in user copies to a new independent Private build', async () => {
    server.signInAs('CowFan');
    const source = server.insert('Author', doc('Cow/Unarmed', 'Cow', 'Unarmed', { notes: 'PRIVATE_NOTES' }), { visibility: 'public' });
    await render(`/builds/${source.id}`);
    await click('Copy to My Builds');
    const copy = [...server.rows.values()].find(row => row.owner === 'CowFan')!;
    expect(copy).toMatchObject({ visibility: 'private', revision: 1 });
    expect(copy.id).not.toBe(source.id);
    expect(copy.document.notes).toBe('');
    expect(source.revision).toBe(1);
    expect(source.owner).toBe('Author');
    expect(window.location.pathname).toBe(`/builds/${copy.id}`);
    expect(text()).toContain('Copied to My Builds as a Private build. The original is unchanged.');
    expect(hasButton('Edit in planner')).toBe(true);
  });
  it('the owner sees edit controls and Edit opens the build into the planner', async () => {
    server.signInAs('CowFan');
    const own = server.insert('CowFan', doc('Owned', 'Deer', 'Psychology'));
    await render(`/builds/${own.id}`);
    expect(text()).toContain('Only you can see this Private build');
    await click('Edit in planner');
    expect(window.location.pathname).toBe('/');
    expect(find('.title-button').textContent).toBe('Owned');
    expect(find('#cloud-status').textContent).toContain('In My Builds');
  });
});
