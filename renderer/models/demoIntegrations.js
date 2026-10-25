// Demo only: integrations shown for a project as if it were connected to them, whatever its files say
// (keyed by the project's folder name, lowercase), each with its state: 'connected', 'incident' (it works
// but something is wrong) or 'disconnected'. Real projects get theirs from projectModel's detection.
export const DEMO_INTEGRATIONS = {
  platanus: { supabase: 'connected', vercel: 'connected', github: 'connected', clerk: 'incident', posthog: 'disconnected' },
  // the product's new name (Qubbot); a demo folder with the old one keeps working
  qubbot: { supabase: 'connected', vercel: 'connected', github: 'connected', clerk: 'incident', posthog: 'disconnected' },
};
