// js/session.js
import { supabase } from "./supabase-config.js";

const CACHE_KEY = "hrflow_profile";

export function requireSession({ requireAdmin = false } = {}) {
  return new Promise(async (resolve) => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "index.html";
      return;
    }

    let profile = readCache();
    if (!profile || profile.id !== user.id) {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error || !data) {
        console.error("requireSession: failed to load profile", error);
        await supabase.auth.signOut();
        clearCache();
        window.location.href = "index.html?err=profile_missing";
        return;
      }

      profile = data;
      writeCache(profile);
    }

    if (requireAdmin && profile.role !== "admin") {
      window.location.href = "dashboard.html";
      return;
    }

    resolve(profile);
  });
}

export function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeCache(profile) {
  sessionStorage.setItem(CACHE_KEY, JSON.stringify(profile));
}

export function clearCache() {
  sessionStorage.removeItem(CACHE_KEY);
}

export async function logout() {
  clearCache();
  await supabase.auth.signOut();
  window.location.href = "index.html";
}
