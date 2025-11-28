import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// NOTE: These credentials are exposed in the frontend code.
// The anon key is safe to expose as it's meant for client-side use,
// but ensure your Supabase Row Level Security (RLS) policies are properly configured.
// For production, consider using environment variables with a build tool.
export const SUPABASE_URL = "https://fdosmfeoobkxrpjshlwj.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkb3NtZmVvb2JreHJwanNobHdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMDIzNzMsImV4cCI6MjA3OTg3ODM3M30.GRi7BeIxFGVy3Ak-FGi2FArVD-Ie15FEY-K_3Atc_x8";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
