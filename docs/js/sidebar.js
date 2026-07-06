// js/sidebar.js
import { logout } from "./session.js";
import { initials } from "./utils.js";

const NAV_ITEMS = [
  { href: "dashboard.html", label: "Dashboard", icon: "grid", key: "dashboard" },
  { href: "employees.html", label: "Employees", icon: "users", key: "employees" },
  { href: "attendance.html", label: "Attendance", icon: "clock", key: "attendance" },
  { href: "payroll.html", label: "Payroll", icon: "wallet", key: "payroll" },
  { href: "reports.html", label: "Reports", icon: "chart", key: "reports" },
  { href: "settings.html", label: "Settings", icon: "gear", key: "settings" },
];

const ICONS = {
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M15.5 14.2c2.6.3 4.5 2.6 4.5 5.3"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="16.5" cy="14" r="1.2" fill="currentColor" stroke="none"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M12 20V4M20 20v-7"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V19a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
};

/**
 * @param {string} activeKey  matches NAV_ITEMS[].key
 * @param {object} profile    { name, role, companyId, companyName }
 */
export function renderSidebar(activeKey, profile) {
  const mount = document.getElementById("sidebar-mount");
  if (!mount) return;

  const navHtml = NAV_ITEMS.filter((item) => item.key !== "settings" || profile.role === "admin")
    .map(
      (item) => `
      <li>
        <a class="nav-link ${item.key === activeKey ? "active" : ""}" href="${item.href}">
          ${ICONS[item.icon]}<span>${item.label}</span>
        </a>
      </li>`
    )
    .join("");

  mount.innerHTML = `
    <button class="sidebar-toggle" id="sidebar-toggle" aria-label="Toggle menu">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
    </button>
    <div class="sidebar-overlay" id="sidebar-overlay"></div>
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-brand">
        <div class="brand-mark"></div>
        <div class="brand-name">HR Flow<small>Tunisia</small></div>
      </div>
      <div class="sidebar-company">
        <strong>${escapeSafe(profile.companyName || "Your company")}</strong>
        ${profile.planType ? `<span class="badge badge-muted" style="margin-top:4px;">${profile.planType} plan</span>` : ""}
      </div>
      <ul class="nav-list">${navHtml}</ul>
      <div class="sidebar-foot">
        <div class="user-chip">
          <div class="user-avatar">${initials(profile.name || "?")}</div>
          <div class="user-meta">
            <div class="name">${escapeSafe(profile.name || "")}</div>
            <div class="role">${escapeSafe(profile.role || "")}</div>
          </div>
        </div>
        <button class="logout-btn" id="logout-btn">Log out</button>
      </div>
    </aside>
  `;

  document.getElementById("logout-btn")?.addEventListener("click", logout);

  const toggle = document.getElementById("sidebar-toggle");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");

  function openSidebar() {
    sidebar.classList.add("open");
    overlay.classList.add("open");
  }
  function closeSidebar() {
    sidebar.classList.remove("open");
    overlay.classList.remove("open");
  }

  toggle?.addEventListener("click", () => {
    sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
  });
  overlay?.addEventListener("click", closeSidebar);
  sidebar?.addEventListener("click", (e) => {
    if (e.target.closest(".nav-link")) closeSidebar();
  });
}

function escapeSafe(s) {
  return String(s).replace(/</g, "&lt;");
}