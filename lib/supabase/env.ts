// Supabase connection settings, read once. Accepts either key name: Supabase's dashboard now
// calls it NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, older docs NEXT_PUBLIC_SUPABASE_ANON_KEY.
// (Each process.env.NEXT_PUBLIC_* must be written out literally so Next.js inlines it.)

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

// When settings are missing (e.g. a preview deploy without them), clients are built with
// placeholders instead of throwing, so the build succeeds and the landing page can show
// "Setup needed" rather than the whole deploy failing.
export const CLIENT_URL = SUPABASE_URL || "http://supabase-not-configured.invalid";
export const CLIENT_KEY = SUPABASE_KEY || "supabase-not-configured";
