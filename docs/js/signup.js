// js/signup.js
import { supabase } from "./supabase-config.js";

const form = document.getElementById("signup-form");
const errBox = document.getElementById("signup-error");
const btn = document.getElementById("signup-btn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errBox.classList.remove("show");
  btn.disabled = true;
  btn.textContent = "Creating your workspace…";

  const companyName = document.getElementById("company-name").value.trim();
  const industry = document.getElementById("industry").value;
  const adminName = document.getElementById("admin-name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  // 1. Create the Supabase Auth account first (we need the user id).
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (signUpError) {
    showError(mapAuthError(signUpError.message));
    btn.disabled = false;
    btn.textContent = "Create company workspace";
    return;
  }

  const uid = signUpData.user.id;

  // --- DEBUG: remove these two lines once signup works ---
  console.log("Session after signup:", signUpData.session);
  console.log("User id used as owner_id:", uid);
  // ---------------------------------------------------------

  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + 14);

  // 2. Create the company row.
  const { data: companyRow, error: companyError } = await supabase
    .from("companies")
    .insert({
      name: companyName,
      industry,
      owner_id: uid,
      plan_type: "trial",
      trial_ends_at: trialEnds.toISOString(),
    })
    .select()
    .single();

  if (companyError) {
    console.error("Signup failed (company insert):", companyError);
    showError(
      "The database rejected the write. Check that your RLS policies are set up, then try again."
    );
    btn.disabled = false;
    btn.textContent = "Create company workspace";
    return;
  }

  // 3. Create the profile row.
  const { error: profileError } = await supabase.from("profiles").insert({
    id: uid,
    company_id: companyRow.id,
    name: adminName,
    email,
    role: "admin",
    position: "HR Manager / Owner",
    salary: 0,
    active: true,
  });

  if (profileError) {
    console.error("Signup failed (profile insert):", profileError);
    showError(
      "The database rejected the write. Check that your RLS policies are set up, then try again."
    );
    btn.disabled = false;
    btn.textContent = "Create company workspace";
    return;
  }

  window.location.href = "dashboard.html";
});

function showError(msg) {
  errBox.textContent = msg;
  errBox.classList.add("show");
}

function mapAuthError(message) {
  if (message.includes("already registered")) {
    return "An account already exists with that email.";
  }
  if (message.includes("Password")) {
    return "Please choose a password with at least 6 characters.";
  }
  return "We couldn't create your workspace. Please try again.";
}