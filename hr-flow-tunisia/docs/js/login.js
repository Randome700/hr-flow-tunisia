// js/login.js
import { supabase } from "./supabase-config.js";
import { clearCache } from "./session.js";

const form = document.getElementById("login-form");
const errBox = document.getElementById("login-error");
const btn = document.getElementById("login-btn");

const params = new URLSearchParams(window.location.search);
if (params.get("err") === "profile_missing") {
  showError(
    "We logged you in, but couldn't find your company profile in the database. " +
      "This usually means the signup process didn't finish creating your profile row. " +
      "Try signing up again."
  );
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errBox.classList.remove("show");
  btn.disabled = true;
  btn.textContent = "Logging in…";

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  clearCache();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    showError(mapAuthError(error.message));
    btn.disabled = false;
    btn.textContent = "Log in";
    return;
  }

  window.location.href = "dashboard.html";
});

function showError(msg) {
  errBox.textContent = msg;
  errBox.classList.add("show");
}

function mapAuthError(message) {
  if (message.includes("Invalid login credentials")) {
    return "Incorrect email or password.";
  }
  if (message.includes("Email not confirmed")) {
    return "Please confirm your email before logging in.";
  }
  return "We couldn't log you in. Please try again.";
}
