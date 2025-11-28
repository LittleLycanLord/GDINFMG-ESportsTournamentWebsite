import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SUPABASE_URL = "https://fdosmfeoobkxrpjshlwj.supabase.co";   // replace
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkb3NtZmVvb2JreHJwanNobHdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMDIzNzMsImV4cCI6MjA3OTg3ODM3M30.GRi7BeIxFGVy3Ak-FGi2FArVD-Ie15FEY-K_3Atc_x8";             // replace

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
