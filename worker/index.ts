/**
 * GorgonBuilder Worker entrypoint (T0018).
 *
 * Static Assets still serves the Vite SPA (including deep-link fallback) without
 * invoking this code; `assets.run_worker_first` routes only `/api` and `/api/*` here.
 * No authentication, sessions or build CRUD are mounted yet (T0019).
 */
import { handleApiRequest, isApiPath } from './api/router';

export default {
  async fetch(request, env): Promise<Response> {
    if (isApiPath(new URL(request.url).pathname)) return handleApiRequest(request, env);
    // Defensive: if routing is ever widened, non-API requests still get assets/SPA behavior.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
