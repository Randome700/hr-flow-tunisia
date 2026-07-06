// js/payroll.js
import { supabase } from "./supabase-config.js";
import { requireSession } from "./session.js";
import { renderSidebar } from "./sidebar.js";
import { toast, fmtCurrency, escapeHtml, workingDaysInMonth, monthStr } from "./utils.js";

let profile;
let company = {};
let employees = [];
let selectedMonth = monthStr(); // "YYYY-MM"
let rows = new Map(); // employee_id -> computed row

init();

async function init() {
  profile = await requireSession({ requireAdmin: true });
  renderSidebar("payroll", profile);

  const { data } = await supabase
    .from("companies")
    .select("*")
    .eq("id", profile.company_id)
    .single();
  company = data || {};

  document.getElementById("month-picker").value = selectedMonth;
  document.getElementById("month-picker").addEventListener("change", async (e) => {
    selectedMonth = e.target.value || monthStr();
    document.getElementById("month-label").textContent = selectedMonth;
    await loadExistingPayroll();
    renderTable();
  });
  document.getElementById("month-label").textContent = selectedMonth;

  document.getElementById("generate-btn").addEventListener("click", generatePayroll);
  document.getElementById("print-btn").addEventListener("click", () => window.print());

  await loadEmployees();
  await loadExistingPayroll();
  renderTable();
}

async function loadEmployees() {
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("company_id", profile.company_id)
    .eq("active", true);

  if (error) {
    console.error("Failed to load employees:", error);
    employees = [];
  } else {
    employees = data || [];
  }
  employees.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

async function loadExistingPayroll() {
  rows.clear();
  const { data, error } = await supabase
    .from("payroll")
    .select("*")
    .eq("company_id", profile.company_id)
    .eq("month", selectedMonth);

  if (error) {
    console.error("Failed to load payroll:", error);
  } else {
    (data || []).forEach((r) => rows.set(r.employee_id, r));
  }
  updateTotals();
}

async function generatePayroll() {
  const btn = document.getElementById("generate-btn");
  btn.disabled = true;
  btn.textContent = "Calculating…";

  try {
    const [year, month] = selectedMonth.split("-").map(Number);
    const start = `${selectedMonth}-01`;
    const end = `${selectedMonth}-31`;

    // One query for the whole company's attendance this month, grouped
    // client-side per employee (cheaper than one query per employee).
    const { data: records, error } = await supabase
      .from("attendance")
      .select("*")
      .eq("company_id", profile.company_id)
      .gte("date", start)
      .lte("date", end);

    if (error) throw error;

    const byEmployee = new Map();
    (records || []).forEach((r) => {
      if (!byEmployee.has(r.employee_id)) byEmployee.set(r.employee_id, []);
      byEmployee.get(r.employee_id).push(r);
    });

    const workDays = workingDaysInMonth(year, month);
    const latePenaltyFraction = Number(company.late_penalty_fraction ?? 0.5);

    for (const emp of employees) {
      const empRecords = byEmployee.get(emp.id) || [];
      const absentDays = empRecords.filter((r) => r.status === "absent").length;
      const lateDays = empRecords.filter((r) => r.status === "late").length;
      const baseSalary = Number(emp.salary) || 0;
      const dailyRate = workDays > 0 ? baseSalary / workDays : 0;
      const deductions = absentDays * dailyRate + lateDays * dailyRate * latePenaltyFraction;

      const existing = rows.get(emp.id);
      const bonus = Number(existing?.bonus) || 0;
      const finalSalary = Math.max(0, baseSalary - deductions + bonus);

      rows.set(emp.id, {
        id: existing?.id, // undefined for a fresh row; upsert will create it
        employee_id: emp.id,
        company_id: profile.company_id,
        month: selectedMonth,
        base_salary: baseSalary,
        absent_days: absentDays,
        late_days: lateDays,
        deductions: round3(deductions),
        bonus,
        final_salary: round3(finalSalary),
      });
    }

    renderTable();
    toast("Payroll calculated — review and save each row", "success");
  } catch (err) {
    console.error(err);
    toast("Couldn't calculate payroll", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "⚙️ Generate payroll for this month";
  }
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function renderTable() {
  const tbody = document.getElementById("payroll-body");
  if (employees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><h3>No employees yet</h3><p>Add employees before running payroll.</p></div></td></tr>`;
    updateTotals();
    return;
  }

  tbody.innerHTML = employees
    .map((emp) => {
      const r = rows.get(emp.id);
      if (!r) {
        return `<tr>
          <td data-label="Employee" class="cell-strong">${escapeHtml(emp.name)}</td>
          <td data-label="Base" class="cell-muted">${fmtCurrency(emp.salary || 0)}</td>
          <td data-label="Status" colspan="4" class="cell-muted">Not generated yet</td>
          <td data-label="Final" class="cell-muted">—</td><td data-label="" class="no-print"></td>
        </tr>`;
      }
      return `<tr data-uid="${emp.id}">
        <td data-label="Employee" class="cell-strong">${escapeHtml(emp.name)}</td>
        <td data-label="Base" class="cell-muted">${fmtCurrency(r.base_salary)}</td>
        <td data-label="Absent days" class="cell-muted">${r.absent_days}</td>
        <td data-label="Late days" class="cell-muted">${r.late_days}</td>
        <td data-label="Deductions" class="cell-muted">−${fmtCurrency(r.deductions)}</td>
        <td data-label="Bonus">
          <input type="number" min="0" step="0.001" class="search-input bonus-input" data-uid="${emp.id}"
                 style="padding:6px 8px; width:100px;" value="${r.bonus}" />
        </td>
        <td data-label="Final salary" class="cell-strong" id="final-${emp.id}">${fmtCurrency(r.final_salary)}</td>
        <td data-label="" class="no-print"><button class="btn btn-ghost btn-sm save-row-btn" data-uid="${emp.id}">Save</button></td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".bonus-input").forEach((inp) =>
    inp.addEventListener("input", () => recomputeFinal(inp.dataset.uid))
  );
  tbody.querySelectorAll(".save-row-btn").forEach((b) =>
    b.addEventListener("click", () => saveRow(b.dataset.uid))
  );

  updateTotals();
}

function recomputeFinal(uid) {
  const r = rows.get(uid);
  if (!r) return;
  const bonusInput = document.querySelector(`.bonus-input[data-uid="${uid}"]`);
  r.bonus = Number(bonusInput.value) || 0;
  r.final_salary = round3(Math.max(0, r.base_salary - r.deductions + r.bonus));
  document.getElementById(`final-${uid}`).textContent = fmtCurrency(r.final_salary);
  updateTotals();
}

function updateTotals() {
  let total = 0;
  let count = 0;
  rows.forEach((r) => {
    total += Number(r.final_salary) || 0;
    count++;
  });
  document.getElementById("total-payroll").textContent = fmtCurrency(total);
  document.getElementById("total-count").textContent = count;
}

async function saveRow(uid) {
  const r = rows.get(uid);
  if (!r) return;
  try {
    const payload = { ...r, updated_at: new Date().toISOString() };
    delete payload.id; // let onConflict handle matching; omit undefined id
    const { error } = await supabase
      .from("payroll")
      .upsert(payload, { onConflict: "employee_id,month" });
    if (error) throw error;
    toast("Payroll saved for this employee", "success");
  } catch (err) {
    console.error(err);
    toast("Couldn't save payroll", "error");
  }
}