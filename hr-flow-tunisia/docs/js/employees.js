// js/employees.js
import { supabase } from "./supabase-config.js";
import { requireSession } from "./session.js";
import { renderSidebar } from "./sidebar.js";
import { toast, fmtCurrency, escapeHtml, openModal, closeModal, debounce } from "./utils.js";

let profile;
let company = {};
let employees = []; // [{id, ...data}]
let searchTerm = "";
let pendingDeleteId = null;

init();

async function init() {
  profile = await requireSession({ requireAdmin: true });
  renderSidebar("employees", profile);

  const { data } = await supabase
    .from("companies")
    .select("plan_type")
    .eq("id", profile.company_id)
    .single();
  company = data || {};

  await loadEmployees();
  bindUi();
}

async function loadEmployees() {
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("company_id", profile.company_id);

  if (error) {
    console.error("Failed to load employees:", error);
    toast("Couldn't load employees", "error");
    employees = [];
  } else {
    employees = data || [];
  }

  employees.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  render();
}

function render() {
  const tbody = document.getElementById("employees-body");
  const filtered = employees.filter((e) => {
    if (!searchTerm) return true;
    const hay = `${e.name || ""} ${e.position || ""}`.toLowerCase();
    return hay.includes(searchTerm);
  });

  document.getElementById("count-label").textContent = `${employees.length} total`;
  document.getElementById("filtered-count").textContent =
    searchTerm ? `${filtered.length} match${filtered.length === 1 ? "" : "es"}` : "";

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="em-icon">🧑‍💼</div><h3>${
      employees.length === 0 ? "No employees yet" : "No matches"
    }</h3><p>${
      employees.length === 0 ? "Add your first employee to get started." : "Try a different search."
    }</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map((e) => {
      const active = e.active !== false;
      return `<tr data-id="${e.id}">
        <td data-label="Name" class="cell-strong">${escapeHtml(e.name || "—")}</td>
        <td data-label="Position" class="cell-muted">${escapeHtml(e.position || "—")}</td>
        <td data-label="Role"><span class="badge badge-muted">${escapeHtml(e.role || "employee")}</span></td>
        <td data-label="Salary" class="cell-muted">${fmtCurrency(e.salary || 0)}</td>
        <td data-label="Status">${active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Inactive</span>'}</td>
        <td data-label="">
          <div class="row-actions">
            <button class="icon-btn edit-btn" title="Edit" data-id="${e.id}">✎</button>
            <button class="icon-btn danger delete-btn" title="Remove" data-id="${e.id}">🗑</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".edit-btn").forEach((b) => b.addEventListener("click", () => openEdit(b.dataset.id)));
  tbody.querySelectorAll(".delete-btn").forEach((b) => b.addEventListener("click", () => openDelete(b.dataset.id)));
}

function bindUi() {
  document.getElementById("add-employee-btn").addEventListener("click", () => openAdd());
  document.getElementById("cancel-modal-btn").addEventListener("click", () => closeModal("employee-modal"));
  document.getElementById("employee-form").addEventListener("submit", onSave);

  document.getElementById("cancel-delete-btn").addEventListener("click", () => closeModal("delete-modal"));
  document.getElementById("confirm-delete-btn").addEventListener("click", onConfirmDelete);

  document.getElementById("search-input").addEventListener(
    "input",
    debounce((e) => {
      searchTerm = e.target.value.trim().toLowerCase();
      render();
    }, 150)
  );
}

function openAdd() {
  if (company.plan_type === "free" && employees.length >= 3) {
    toast("Free plan is limited to 3 employees — upgrade in Settings to add more", "error");
    return;
  }
  document.getElementById("modal-title").textContent = "Add employee";
  document.getElementById("employee-form").reset();
  document.getElementById("emp-id").value = "";
  openModal("employee-modal");
}

function openEdit(id) {
  const emp = employees.find((e) => e.id === id);
  if (!emp) return;
  document.getElementById("modal-title").textContent = "Edit employee";
  document.getElementById("emp-id").value = emp.id;
  document.getElementById("emp-name").value = emp.name || "";
  document.getElementById("emp-position").value = emp.position || "";
  document.getElementById("emp-role").value = emp.role || "employee";
  document.getElementById("emp-salary").value = emp.salary || 0;
  document.getElementById("emp-email").value = emp.email || "";
  document.getElementById("emp-status").value = String(emp.active !== false);
  openModal("employee-modal");
}

async function onSave(e) {
  e.preventDefault();
  const id = document.getElementById("emp-id").value;

  // Free plan cap: 3 employees max. Only blocks NEW hires (id is empty on
  // add, populated on edit) so editing an existing employee is never blocked.
  if (!id && company.plan_type === "free" && employees.length >= 3) {
    toast("Free plan is limited to 3 employees — upgrade in Settings to add more", "error");
    return;
  }

  const btn = document.getElementById("save-emp-btn");
  btn.disabled = true;
  btn.textContent = "Saving…";

  const payload = {
    name: document.getElementById("emp-name").value.trim(),
    position: document.getElementById("emp-position").value.trim(),
    role: document.getElementById("emp-role").value,
    salary: Number(document.getElementById("emp-salary").value) || 0,
    email: document.getElementById("emp-email").value.trim() || null,
    active: document.getElementById("emp-status").value === "true",
    company_id: profile.company_id,
  };

  try {
    if (id) {
      const { error } = await supabase.from("employees").update(payload).eq("id", id);
      if (error) throw error;
      toast("Employee updated", "success");
    } else {
      const { error } = await supabase.from("employees").insert(payload);
      if (error) throw error;
      toast("Employee added", "success");
    }
    closeModal("employee-modal");
    await loadEmployees();
  } catch (err) {
    console.error(err);
    toast("Something went wrong, please try again", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save employee";
  }
}

function openDelete(id) {
  pendingDeleteId = id;
  openModal("delete-modal");
}

async function onConfirmDelete() {
  if (!pendingDeleteId) return;
  try {
    const { error } = await supabase.from("employees").delete().eq("id", pendingDeleteId);
    if (error) throw error;
    toast("Employee removed", "success");
    closeModal("delete-modal");
    await loadEmployees();
  } catch (err) {
    console.error(err);
    toast("Couldn't remove employee", "error");
  }
  pendingDeleteId = null;
}