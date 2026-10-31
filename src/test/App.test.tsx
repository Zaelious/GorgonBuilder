import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test } from 'vitest';
import { App } from '../app/App';

test('renders the application shell and explains that the planner is forthcoming', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  try {
    await act(async () => { root.render(<App />); });

    const main = container.querySelector('main');
    expect(main).not.toBeNull();
    expect(main?.querySelector('h1')?.textContent).toBe('Gorgon Builder');
    expect(main?.querySelector('h2')?.textContent).toBe('Planner forthcoming');
    expect(main?.textContent).toContain('Build planning functionality is coming');
  } finally {
    await act(async () => { root.unmount(); });
    container.remove();
  }
});
