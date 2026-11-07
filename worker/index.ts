/**
 * GorgonBuilder Worker entrypoint (T0019).
 *
 * Static Assets still serves the Vite SPA (including deep-link fallback) without
 * invoking this code; `assets.run_worker_first` routes only `/api` and `/api/*` here.
 * Account API is fail-closed unless the canonical deployment has D1 and every auth secret.
 */
import { handleApiRequest, isApiPath } from './api/router';

export default {
  async fetch(request, env): Promise<Response> {
    if (isApiPath(new URL(request.url).pathname)) return handleApiRequest(request, env);
    // Defensive: if routing is ever widened, non-API requests still get assets/SPA behavior.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
