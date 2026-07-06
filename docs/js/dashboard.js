// js/dashboard.js
import { supabase } from "./supabase-config.js";
import { requireSession, writeCache } from "./session.js";
import { renderSidebar } from "./sidebar.js";
import { fmtCurrency, fmtTime, todayStr, monthStr, escapeHtml } from "./utils.js";

let profile;
let employeesCache = new Map(); // id -> employee row
let attendanceToday = new Map(); // employee_id -> record

init();

async function init() {
  profile = await requireSession();

  // Pull the company row once (plan/trial info rarely changes) and hydrate
  // the cached profile so the sidebar can show company name + plan.
  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", profile.company_id)
    .single();

  if (company) {
    profile.companyName = company.name;
    profile.planType = company.plan_type;
    writeCache(profile);
    renderTrialBadge(company);
  }

  renderSidebar("dashboard", profile);
  document.getElementById("today-label").textContent =
    "Today, " + new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  await loadEmployees();
  await loadAttendanceToday();
  await loadPayrollThisMonth();
  subscribeRealtime();
}

function renderTrialBadge(company) {
  const badge = document.getElementById("trial-badge");
  if (company.plan_type === "trial" && company.trial_ends_at) {
    const daysLeft = Math.max(0, Math.ceil((new Date(company.trial_ends_at) - new Date()) / 86400000));
    badge.style.display = "inline-flex";
    badge.textContent = `Trial · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
  } else if (company.plan_type) {
    badge.style.display = "inline-flex";
    badge.textContent = company.plan_type.charAt(0).toUpperCase() + company.plan_type.slice(1) + " plan";
  }
}

async function loadEmployees() {
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("company_id", profile.company_id);

  if (error) {
    console.error("Failed to load employees:", error);
    return;
  }

  employeesCache.clear();
  (data || []).forEach((e) => employeesCache.set(e.id, e));
  document.getElementById("stat-total").textContent = employeesCache.size;
  renderTodayTable();
  renderAttendanceStats();
}

async function loadAttendanceToday() {
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("company_id", profile.company_id)
    .eq("date", todayStr());

  if (error) {
    console.error("Failed to load today's attendance:", error);
    return;
  }

  attendanceToday.clear();
  (data || []).forEach((r) => attendanceToday.set(r.employee_id, r));
  renderTodayTable();
  renderAttendanceStats();
}

function subscribeRealtime() {
  supabase
    .channel("dashboard-employees")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "employees", filter: `company_id=eq.${profile.company_id}` },
      () => loadEmployees()
    )
    .subscribe();

  supabase
    .channel("dashboard-attendance")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "attendance", filter: `company_id=eq.${profile.company_id}` },
      () => loadAttendanceToday()
    )
    .subscribe();
}

function renderAttendanceStats() {
  const total = employeesCache.size;
  let present = 0;
  attendanceToday.forEach((r) => {
    if (r.status === "present" || r.status === "late") present++;
  });
  const absent = Math.max(0, total - present);
  document.getElementById("stat-present").textContent = present;
  document.getElementById("stat-absent").textContent = absent;
}

function renderTodayTable() {
  const tbody = document.getElementById("today-table-body");
  if (employeesCache.size === 0) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="em-icon">🧑‍💼</div><h3>No employees yet</h3><p>Add your first employee to start tracking attendance.</p><a class="btn btn-primary btn-sm" href="employees.html">Add employee</a></div></td></tr>`;
    return;
  }
  const rows = [...employeesCache.entries()]
    .sort((a, b) => (a[1].name || "").localeCompare(b[1].name || ""))
    .slice(0, 8)
    .map(([id, emp]) => {
      const rec = attendanceToday.get(id);
      const status = rec?.status || "absent";
      const badge =
        status === "present" ? '<span class="badge badge-success">Present</span>' :
        status === "late" ? '<span class="badge badge-warning">Late</span>' :
        '<span class="badge badge-danger">Absent</span>';
      const checkIn = rec?.check_in_time ? fmtTime(rec.check_in_time) : "—";
      return `<tr>
        <td class="cell-strong">${escapeHtml(emp.name || "—")}</td>
        <td class="cell-muted">${escapeHtml(emp.position || "—")}</td>
        <td>${badge}</td>
        <td class="cell-muted">${checkIn}</td>
      </tr>`;
    })
    .join("");
  tbody.innerHTML = rows;
}

async function loadPayrollThisMonth() {
  const { data, error } = await supabase
    .from("payroll")
    .select("final_salary")
    .eq("company_id", profile.company_id)
    .eq("month", monthStr());

  if (error) {
    console.error("Failed to load payroll:", error);
    return;
  }

  const rows = data || [];
  let total = 0;
  rows.forEach((r) => (total += Number(r.final_salary) || 0));
  document.getElementById("stat-payroll").textContent = fmtCurrency(total);
  document.getElementById("payroll-foot").textContent = rows.length === 0
    ? "no payroll run yet this month"
    : `across ${rows.length} employee${rows.length === 1 ? "" : "s"}`;
}