// js/supabase-config.js
// Central Supabase initialization. Every page imports from here so there is
// only ever one client instance.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://nrmrknztpimshcxdsyxl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_S-VCwtFTTEvxP3X4QrBsXg_E7KLjA4j";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
