// js/attendance.js
import { supabase } from "./supabase-config.js";
import { requireSession } from "./session.js";
import { renderSidebar } from "./sidebar.js";
import { toast, todayStr, escapeHtml } from "./utils.js";

let profile;
let company = {};
let employees = [];
let attendanceMap = new Map(); // employee_id -> record for selectedDate
let selectedDate = todayStr();

init();

async function init() {
  profile = await requireSession({ requireAdmin: true });
  renderSidebar("attendance", profile);

  const { data } = await supabase
    .from("companies")
    .select("*")
    .eq("id", profile.company_id)
    .single();
  company = data || {};
  document.getElementById("work-start-label").textContent = company.work_start_time || "08:30";

  document.getElementById("date-picker").value = selectedDate;
  document.getElementById("date-picker").addEventListener("change", (e) => {
    selectedDate = e.target.value || todayStr();
    loadAttendance();
  });

  await loadEmployees();
  await loadAttendance();
  bindKiosk();
  tickClock();
  setInterval(tickClock, 1000 * 30);
}

function tickClock() {
  const el = document.getElementById("clock");
  if (el) el.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

  const select = document.getElementById("kiosk-employee");
  select.innerHTML = employees.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join("") ||
    `<option value="">No employees yet</option>`;
}

async function loadAttendance() {
  document.getElementById("selected-date-label").textContent = selectedDate;

  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("company_id", profile.company_id)
    .eq("date", selectedDate);

  if (error) {
    console.error("Failed to load attendance:", error);
    attendanceMap.clear();
  } else {
    attendanceMap.clear();
    (data || []).forEach((r) => attendanceMap.set(r.employee_id, r));
  }
  render();
}

function render() {
  const tbody = document.getElementById("attendance-body");
  if (employees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><h3>No employees yet</h3><p>Add employees first, then track attendance here.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = employees
    .map((emp) => {
      const rec = attendanceMap.get(emp.id);
      const status = rec?.status || "absent";
      return `<tr data-uid="${emp.id}">
        <td data-label="Employee" class="cell-strong">${escapeHtml(emp.name)}</td>
        <td data-label="Status">
          <select class="search-input status-select" data-uid="${emp.id}" style="padding:6px 8px;">
            <option value="present" ${status === "present" ? "selected" : ""}>Present</option>
            <option value="late" ${status === "late" ? "selected" : ""}>Late</option>
            <option value="absent" ${status === "absent" ? "selected" : ""}>Absent</option>
          </select>
        </td>
        <td data-label="Check-in">
          <input type="time" class="search-input checkin-input" data-uid="${emp.id}" style="padding:6px 8px;" value="${toTimeInput(rec?.check_in_time)}" />
        </td>
        <td data-label="Check-out">
          <input type="time" class="search-input checkout-input" data-uid="${emp.id}" style="padding:6px 8px;" value="${toTimeInput(rec?.check_out_time)}" />
        </td>
        <td data-label=""><button class="btn btn-ghost btn-sm save-row-btn" data-uid="${emp.id}">Save</button></td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".save-row-btn").forEach((b) =>
    b.addEventListener("click", () => saveRow(b.dataset.uid))
  );
}

/**
 * check_in_time / check_out_time are now a plain Postgres `time` column —
 * no date, no timezone. Postgres returns "HH:mm:ss", the <input type="time">
 * needs "HH:mm". No Date object, no UTC/local conversion, no drift — ever.
 */
function toTimeInput(pgTime) {
  if (!pgTime) return "";
  return pgTime.slice(0, 5);
}

function timeInputToPg(inputVal) {
  return inputVal ? `${inputVal}:00` : null;
}

async function saveRow(uid) {
  const row = document.querySelector(`tr[data-uid="${uid}"]`);
  const status = row.querySelector(".status-select").value;
  const inVal = row.querySelector(".checkin-input").value;
  const outVal = row.querySelector(".checkout-input").value;

  const checkInTime = timeInputToPg(inVal);
  const checkOutTime = timeInputToPg(outVal);

  await writeAttendance(uid, { status, check_in_time: checkInTime, check_out_time: checkOutTime });
  toast("Attendance saved", "success");
  await loadAttendance();
}

function bindKiosk() {
  document.getElementById("kiosk-checkin").addEventListener("click", async () => {
    const uid = document.getElementById("kiosk-employee").value;
    if (!uid) return toast("Add an employee first", "error");
    const now = new Date();
    const status = isLate(now) ? "late" : "present";
    const nowTime = now.toTimeString().slice(0, 8); // "HH:mm:ss" local wall-clock, no conversion
    await writeAttendance(uid, { status, check_in_time: nowTime }, todayStr());
    toast(`Checked in — marked ${status}`, "success");
    if (selectedDate === todayStr()) await loadAttendance();
  });

  document.getElementById("kiosk-checkout").addEventListener("click", async () => {
    const uid = document.getElementById("kiosk-employee").value;
    if (!uid) return toast("Add an employee first", "error");
    const now = new Date();
    const nowTime = now.toTimeString().slice(0, 8);
    await writeAttendance(uid, { check_out_time: nowTime }, todayStr());
    toast("Checked out", "success");
    if (selectedDate === todayStr()) await loadAttendance();
  });
}

function isLate(now) {
  const [h, m] = (company.work_start_time || "08:30").split(":").map(Number);
  const grace = Number(company.grace_minutes ?? 15);
  const threshold = new Date(now);
  threshold.setHours(h, m + grace, 0, 0);
  return now > threshold;
}

/**
 * Upserts one attendance record per employee per day.
 * Relies on the unique (employee_id, date) constraint on the attendance
 * table so this is a true upsert instead of a query-then-write round trip.
 */
async function writeAttendance(uid, fields, date = selectedDate) {
  const payload = {
    employee_id: uid,
    company_id: profile.company_id,
    date,
    updated_at: new Date().toISOString(), // this column IS timestamptz, that's fine — it's a log timestamp, not a wall-clock field
    ...fields,
  };
  const { error } = await supabase
    .from("attendance")
    .upsert(payload, { onConflict: "employee_id,date" });

  if (error) {
    console.error("Failed to save attendance:", error);
    toast("Couldn't save attendance", "error");
  }
}