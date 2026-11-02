import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { SkillPlanner } from './SkillPlanner';

it('synchronizes an external level commit for the same skill and input node, including invalid draft text', async () => {
  const data = loadPlannerFixture();
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  const render = async (level: number) => act(async () => root.render(<SkillPlanner slot="A" skill={{ skillId: 'Psychology', level }}
    bar={[]} data={data} onEdit={() => {}} readOnly={false} detailSlot={null} onDetailOpen={() => {}} />));
  try {
    await render(70);
    const input = container.querySelector<HTMLInputElement>('#level-A')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(input.value).toBe('');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    await render(95);
    expect(container.querySelector('#level-A')).toBe(input);
    expect(input.value).toBe('95');
    expect(input.getAttribute('aria-invalid')).toBe('false');
    await render(71);
    expect(input.value).toBe('71');
  } finally {
    await act(async () => root.unmount()); container.remove();
  }
});
