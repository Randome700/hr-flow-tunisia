// js/settings.js
import { supabase } from "./supabase-config.js";
import { requireSession, writeCache } from "./session.js";
import { renderSidebar } from "./sidebar.js";
import { toast, openModal, closeModal } from "./utils.js";

let profile;
let company = {};
let pendingPlan = null; // plan the upgrade modal is currently asking about

init();

async function init() {
  profile = await requireSession({ requireAdmin: true });
  renderSidebar("settings", profile);

  const { data } = await supabase
    .from("companies")
    .select("*")
    .eq("id", profile.company_id)
    .single();
  company = data || {};

  document.getElementById("company-name").value = company.name || "";
  document.getElementById("industry").value = company.industry || "Other Services";
  document.getElementById("work-start").value = company.work_start_time || "08:30";
  document.getElementById("grace-minutes").value = company.grace_minutes ?? 15;
  document.getElementById("late-penalty").value = company.late_penalty_fraction ?? 0.5;

  highlightCurrentPlan();

  document.getElementById("company-form").addEventListener("submit", saveCompanyProfile);
  document.getElementById("rules-form").addEventListener("submit", saveWorkRules);
  document.querySelectorAll(".plan-select-btn").forEach((b) =>
    b.addEventListener("click", () => selectPlan(b.dataset.plan))
  );

  document.getElementById("cancel-upgrade-btn").addEventListener("click", () => closeModal("upgrade-modal"));
  document.getElementById("upgrade-form").addEventListener("submit", onUpgradeSubmit);
}

function highlightCurrentPlan() {
  document.querySelectorAll(".plan-card").forEach((c) => c.classList.remove("current"));
  const current = document.getElementById(`plan-${company.plan_type}`);
  current?.classList.add("current");
}

async function saveCompanyProfile(e) {
  e.preventDefault();
  const btn = document.getElementById("save-company-btn");
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    const name = document.getElementById("company-name").value.trim();
    const industry = document.getElementById("industry").value;
    const { error } = await supabase
      .from("companies")
      .update({ name, industry })
      .eq("id", profile.company_id);
    if (error) throw error;

    company.name = name;
    company.industry = industry;
    profile.companyName = name;
    writeCache(profile);
    toast("Company profile saved", "success");
  } catch (err) {
    console.error(err);
    toast("Couldn't save profile", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save company profile";
  }
}

async function saveWorkRules(e) {
  e.preventDefault();
  const btn = document.getElementById("save-rules-btn");
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    const work_start_time = document.getElementById("work-start").value;
    const grace_minutes = Number(document.getElementById("grace-minutes").value) || 0;
    const late_penalty_fraction = Number(document.getElementById("late-penalty").value) || 0;

    const { error } = await supabase
      .from("companies")
      .update({ work_start_time, grace_minutes, late_penalty_fraction })
      .eq("id", profile.company_id);
    if (error) throw error;

    toast("Work rules saved", "success");
  } catch (err) {
    console.error(err);
    toast("Couldn't save work rules", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save work rules";
  }
}

/**
 * Free is the only plan that switches instantly — it costs nothing, so
 * there's nothing to collect. Every paid plan (basic/pro/enterprise) opens
 * the upgrade-request modal instead of touching the database directly;
 * the actual plan_type only changes once payment is really set up.
 */
async function selectPlan(planKey) {
  if (planKey === "free") {
    try {
      const { error } = await supabase
        .from("companies")
        .update({ plan_type: "free" })
        .eq("id", profile.company_id);
      if (error) throw error;

      company.plan_type = "free";
      profile.planType = "free";
      writeCache(profile);
      highlightCurrentPlan();
      toast("Switched to the Free plan", "success");
    } catch (err) {
      console.error(err);
      toast("Couldn't update plan", "error");
    }
    return;
  }

  pendingPlan = planKey;
  const label = planKey.charAt(0).toUpperCase() + planKey.slice(1);
  document.getElementById("upgrade-modal-title").textContent = `Request the ${label} plan`;
  document.getElementById("upgrade-form").reset();
  openModal("upgrade-modal");
}

async function onUpgradeSubmit(e) {
  e.preventDefault();
  // Placeholder only — no payment processor connected yet. This just
  // captures interest; a human follows up to actually collect payment
  // and flip plan_type once that's done.
  const btn = document.getElementById("submit-upgrade-btn");
  btn.disabled = true;
  btn.textContent = "Sending…";

  // Simulate a short delay so the button feedback feels real.
  await new Promise((r) => setTimeout(r, 400));

  closeModal("upgrade-modal");
  toast(`Thanks — we'll reach out to set up payment for the ${pendingPlan} plan`, "success");

  btn.disabled = false;
  btn.textContent = "Request upgrade";
  pendingPlan = null;
}