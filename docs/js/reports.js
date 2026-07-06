// js/reports.js
import { supabase } from "./supabase-config.js";
import { requireSession } from "./session.js";
import { renderSidebar } from "./sidebar.js";
import { fmtCurrency, escapeHtml, monthStr } from "./utils.js";

let profile;
let selectedMonth = monthStr();

init();

async function init() {
  profile = await requireSession();
  renderSidebar("reports", profile);

  document.getElementById("month-picker").value = selectedMonth;
  document.getElementById("month-picker").addEventListener("change", (e) => {
    selectedMonth = e.target.value || monthStr();
    loadReport();
  });

  await loadReport();
}

async function loadReport() {
  const [employees, attendanceByEmployee, payrollByEmployee] = await Promise.all([
    fetchEmployees(),
    fetchAttendance(),
    fetchPayroll(),
  ]);

  renderAttendanceStats(attendanceByEmployee);
  renderPerformanceTable(employees, attendanceByEmployee);
  renderSalaryTable(employees, payrollByEmployee);
}

async function fetchEmployees() {
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("company_id", profile.company_id);

  if (error) {
    console.error("Failed to load employees:", error);
    return [];
  }
  const list = data || [];
  list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return list;
}

async function fetchAttendance() {
  const start = `${selectedMonth}-01`;
  const end = `${selectedMonth}-31`;

  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("company_id", profile.company_id)
    .gte("date", start)
    .lte("date", end);

  const byEmployee = new Map();
  if (error) {
    console.error("Failed to load attendance:", error);
    return byEmployee;
  }
  (data || []).forEach((r) => {
    if (!byEmployee.has(r.employee_id)) byEmployee.set(r.employee_id, []);
    byEmployee.get(r.employee_id).push(r);
  });
  return byEmployee;
}

async function fetchPayroll() {
  const { data, error } = await supabase
    .from("payroll")
    .select("*")
    .eq("company_id", profile.company_id)
    .eq("month", selectedMonth);

  const byEmployee = new Map();
  if (error) {
    console.error("Failed to load payroll:", error);
    return byEmployee;
  }
  (data || []).forEach((r) => byEmployee.set(r.employee_id, r));
  return byEmployee;
}

function renderAttendanceStats(attendanceByEmployee) {
  let present = 0, late = 0, absent = 0, totalMarked = 0;
  attendanceByEmployee.forEach((records) => {
    records.forEach((r) => {
      if (r.status === "present") present++;
      else if (r.status === "late") late++;
      else if (r.status === "absent") absent++;
      totalMarked++;
    });
  });
  document.getElementById("stat-present-days").textContent = present;
  document.getElementById("stat-late-days").textContent = late;
  document.getElementById("stat-absent-days").textContent = absent;
  const rate = totalMarked > 0 ? Math.round(((present + late) / totalMarked) * 100) : 0;
  document.getElementById("stat-avg-rate").textContent = totalMarked > 0 ? `${rate}%` : "—";
}

function renderPerformanceTable(employees, attendanceByEmployee) {
  const tbody = document.getElementById("performance-body");
  if (employees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">No employees yet.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = employees
    .map((emp) => {
      const records = attendanceByEmployee.get(emp.id) || [];
      const present = records.filter((r) => r.status === "present").length;
      const late = records.filter((r) => r.status === "late").length;
      const absent = records.filter((r) => r.status === "absent").length;
      const marked = present + late + absent;
      const rate = marked > 0 ? Math.round(((present + late) / marked) * 100) : null;
      return `<tr>
        <td data-label="Employee" class="cell-strong">${escapeHtml(emp.name || "—")}</td>
        <td data-label="Present" class="cell-muted">${present}</td>
        <td data-label="Late" class="cell-muted">${late}</td>
        <td data-label="Absent" class="cell-muted">${absent}</td>
        <td data-label="Rate">${rate === null ? '<span class="cell-muted">—</span>' : rateBadge(rate)}</td>
      </tr>`;
    })
    .join("");
}

function rateBadge(rate) {
  const cls = rate >= 90 ? "badge-success" : rate >= 70 ? "badge-warning" : "badge-danger";
  return `<span class="badge ${cls}">${rate}%</span>`;
}

function renderSalaryTable(employees, payrollByEmployee) {
  const tbody = document.getElementById("salary-body");
  if (employees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">No employees yet.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = employees
    .map((emp) => {
      const p = payrollByEmployee.get(emp.id);
      if (!p) {
        return `<tr>
          <td data-label="Employee" class="cell-strong">${escapeHtml(emp.name || "—")}</td>
          <td data-label="Base" class="cell-muted">${fmtCurrency(emp.salary || 0)}</td>
          <td data-label="Status" colspan="2" class="cell-muted">Payroll not generated for this month</td>
          <td data-label="Final" class="cell-muted">—</td>
        </tr>`;
      }
      return `<tr>
        <td data-label="Employee" class="cell-strong">${escapeHtml(emp.name || "—")}</td>
        <td data-label="Base" class="cell-muted">${fmtCurrency(p.base_salary)}</td>
        <td data-label="Deductions" class="cell-muted">−${fmtCurrency(p.deductions)}</td>
        <td data-label="Bonus" class="cell-muted">+${fmtCurrency(p.bonus)}</td>
        <td data-label="Final" class="cell-strong">${fmtCurrency(p.final_salary)}</td>
      </tr>`;
    })
    .join("");
}