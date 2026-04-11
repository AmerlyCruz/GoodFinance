function createNavItem(item, activePath) {
	const activeClass = activePath === item.href ? " active" : "";
	return `
		<a href="${item.href}" class="nav-item${activeClass}">
			${item.icon}
			<span>${item.label}</span>
		</a>
	`;
}

function getActivePath() {
	const fileName = window.location.pathname.split("/").pop() || "index.html";
	return fileName || "index.html";
}

function ensureSidebar() {
	const toggleButton = document.getElementById("toggleSidebar");
	if (!toggleButton || document.getElementById("sidebar")) return;

	const items = [
		{ href: "index.html", label: "Inicio", icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="7" width="18" height="13" rx="4" fill="#ffd6e0"></rect><path d="M7 14v-2a5 5 0 0110 0v2" stroke="#e63946" stroke-width="1.7" stroke-linecap="round"></path></svg>' },
		{ href: "registrar-gastos.html", label: "Registrar Gastos", icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="4" y="6" width="16" height="12" rx="3" fill="#e9a6b2"></rect><path d="M8 10h8M8 14h5" stroke="#e63946" stroke-width="1.7" stroke-linecap="round"></path></svg>' },
		{ href: "analysis.html", label: "Analisis", icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="5" fill="#b5ead7"></rect><path d="M7 15l3-3 3 3 4-4" stroke="#38b000" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg>' },
		{ href: "credit.html", label: "Creditos", icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="2" y="6" width="20" height="12" rx="3" fill="#c7ceea"></rect><rect x="6" y="10" width="6" height="2" rx="1" fill="#a8dadc"></rect></svg>' },
		{ href: "savings.html", label: "Ahorro", icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><ellipse cx="12" cy="14" rx="8" ry="6" fill="#fdfd96"></ellipse><path d="M12 8v8M8 12h8" stroke="#e9a600" stroke-width="1.7" stroke-linecap="round"></path></svg>' }
	];

	const wrapper = document.createElement("div");
	wrapper.innerHTML = `
		<aside class="sidebar" id="sidebar">
			<button id="closeSidebar" class="close-btn" aria-label="Cerrar menu">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="18" y1="6" x2="6" y2="18"></line>
					<line x1="6" y1="6" x2="18" y2="18"></line>
				</svg>
			</button>
			<div class="sidebar-header">
				<a href="index.html" class="logo" style="text-decoration:none;color:inherit;cursor:pointer;">Flexiway</a>
			</div>
			<nav class="nav">${items.map((item) => createNavItem(item, getActivePath())).join("")}</nav>
		</aside>
		<div class="overlay" id="overlay"></div>
	`;

	document.body.insertBefore(wrapper.firstElementChild, document.body.firstChild);
	document.body.insertBefore(wrapper.lastElementChild, document.body.children[1] || null);
}

function ensureNotificationPanel() {
	if (document.getElementById("notificationPanel")) return;
	const wrapper = document.createElement("div");
	wrapper.innerHTML = `
		<aside id="notificationPanel" class="notification-panel">
			<div class="panel-summary"></div>
			<div class="panel-messages"></div>
		</aside>
		<div id="notificationOverlay" class="notification-overlay"></div>
	`;
	document.body.appendChild(wrapper.firstElementChild);
	document.body.appendChild(wrapper.lastElementChild);
}

function ensureProfilePanel() {
	if (document.getElementById("profilePanel")) return;
	const wrapper = document.createElement("div");
	wrapper.innerHTML = `
		<aside id="profilePanel" class="profile-panel">
			<div class="profile-header"><h2>Mi Perfil</h2></div>
			<div class="profile-content" id="profilePanelContent" style="display:flex;flex-direction:column;gap:16px;"></div>
		</aside>
		<div id="profileOverlay" class="profile-overlay"></div>
	`;
	document.body.appendChild(wrapper.firstElementChild);
	document.body.appendChild(wrapper.lastElementChild);
}

function ensureStatusChip() {
	if (document.getElementById("appSyncStatus")) return;
	const chip = document.createElement("div");
	chip.id = "appSyncStatus";
	chip.className = "app-sync-status";
	document.body.appendChild(chip);
}

function getProfileButton() {
	return document.getElementById("profileBtn") || document.querySelector('[aria-label="Perfil"]');
}

function renderProfilePanel() {
	if (!window.FlexiwayFinance) return;
	const content = document.getElementById("profilePanelContent") || document.querySelector("#profilePanel .profile-content");
	if (!content) return;
	const user = window.FlexiwayFinance.getCurrentUser();
	const data = window.FlexiwayFinance.getFinancialData();
	const formatter = window.FlexiwayFinance.formatCurrency;

	if (user) {
		const currency = window.FlexiwayFinance.getCurrencyConfig();
		content.innerHTML = `
			<div style="padding:12px 0;border-bottom:1px solid #e5e5e5;">
				<strong style="display:block;font-size:1.1rem;">${user.name}</strong>
				<small>${user.email}</small>
			</div>
			<div style="display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr));">
				<div class="kpi-card" style="min-width:auto;padding:14px;">
					<div class="kpi-label">Ingresos</div>
					<div class="kpi-value">${formatter(data.income)}</div>
				</div>
				<div class="kpi-card" style="min-width:auto;padding:14px;">
					<div class="kpi-label">Gastos</div>
					<div class="kpi-value">${formatter(data.spent)}</div>
				</div>
			</div>
			<div class="profile-meta-row">
				<span>Moneda activa</span>
				<strong>${currency.currency}</strong>
			</div>
			<button id="profile-view" class="profile-btn">Ver perfil</button>
			<button id="profile-edit" class="profile-btn">Editar finanzas</button>
			<button id="profile-logout" class="profile-btn" style="background:#e63946;color:#fff;">Cerrar sesion</button>
		`;
	} else {
		content.innerHTML = `
			<p style="margin:0;color:#3a2c2a;">Inicia sesion para acceder a tu perfil y tus preferencias.</p>
			<button id="profile-login" class="profile-btn">Iniciar sesion</button>
			<button id="profile-signup" class="profile-btn">Crear cuenta</button>
			<a href="profile.html" class="profile-btn" style="text-decoration:none;text-align:center;display:block;">Vista general</a>
		`;
	}

	const loginBtn = document.getElementById("profile-login");
	if (loginBtn) loginBtn.onclick = () => { window.location.href = "login.html"; };

	const signupBtn = document.getElementById("profile-signup");
	if (signupBtn) signupBtn.onclick = () => { window.location.href = "signup.html"; };

	const viewBtn = document.getElementById("profile-view");
	if (viewBtn) viewBtn.onclick = () => { window.location.href = "profile.html"; };

	const editBtn = document.getElementById("profile-edit");
	if (editBtn) editBtn.onclick = () => { window.location.href = "edit-profile.html"; };

	const logoutBtn = document.getElementById("profile-logout");
	if (logoutBtn) {
		logoutBtn.onclick = async () => {
			await window.FlexiwayFinance.logoutUser();
			window.location.href = "index.html";
		};
	}
}

function renderSyncStatus() {
	if (!window.FlexiwayFinance || typeof window.FlexiwayFinance.getSyncStatus !== "function") return;
	const chip = document.getElementById("appSyncStatus");
	if (!chip) return;
	const status = window.FlexiwayFinance.getSyncStatus();
	chip.className = `app-sync-status ${status.state || "idle"}`;
	chip.textContent = status.message || "Listo";
	chip.hidden = !status.message;
}

function bindSidebar() {
	const sidebar = document.getElementById("sidebar");
	const overlay = document.getElementById("overlay");
	const openButton = document.getElementById("toggleSidebar");
	const closeButton = document.getElementById("closeSidebar");
	if (openButton && sidebar && overlay) {
		openButton.onclick = () => {
			sidebar.classList.add("active");
			overlay.classList.add("active");
		};
	}
	if (closeButton && sidebar && overlay) {
		closeButton.onclick = () => {
			sidebar.classList.remove("active");
			overlay.classList.remove("active");
		};
	}
	if (overlay && sidebar) {
		overlay.onclick = () => {
			sidebar.classList.remove("active");
			overlay.classList.remove("active");
		};
	}
}

function bindNotifications() {
	const openButton = document.getElementById("notificationBtn");
	const panel = document.getElementById("notificationPanel");
	const overlay = document.getElementById("notificationOverlay");
	if (openButton && panel && overlay) {
		openButton.onclick = () => {
			if (window.FlexiwayAlerts) window.FlexiwayAlerts.renderNotificationPanel();
			panel.classList.add("active");
			overlay.classList.add("active");
		};
	}
	if (overlay && panel) {
		overlay.onclick = () => {
			panel.classList.remove("active");
			overlay.classList.remove("active");
		};
	}
}

function bindProfilePanel() {
	const button = getProfileButton();
	const panel = document.getElementById("profilePanel");
	const overlay = document.getElementById("profileOverlay");
	if (button && panel && overlay) {
		button.id = "profileBtn";
		button.onclick = (event) => {
			event.preventDefault();
			renderProfilePanel();
			panel.classList.add("active");
			overlay.classList.add("active");
		};
	}
	if (overlay && panel) {
		overlay.onclick = () => {
			panel.classList.remove("active");
			overlay.classList.remove("active");
		};
	}
}

async function initLayout() {
	if (window.FlexiwayFinance && typeof window.FlexiwayFinance.ensureSessionReady === "function") {
		await window.FlexiwayFinance.ensureSessionReady();
	}
	ensureSidebar();
	ensureNotificationPanel();
	ensureProfilePanel();
	ensureStatusChip();
	renderProfilePanel();
	renderSyncStatus();
	if (window.FlexiwayAlerts) {
		window.FlexiwayAlerts.renderNotificationPanel();
		window.FlexiwayAlerts.maybeShowStartupAlert();
	}
	bindSidebar();
	bindNotifications();
	bindProfilePanel();
	if (typeof Swal !== "undefined") {
		window.showSuccess = (message) => Swal.fire("Listo", message, "success");
		window.showError = (message) => Swal.fire("Error", message, "error");
	}
}

document.addEventListener("DOMContentLoaded", initLayout);
window.addEventListener("flexiway:data-updated", () => {
	renderProfilePanel();
	renderSyncStatus();
	if (window.FlexiwayAlerts) window.FlexiwayAlerts.renderNotificationPanel();
});
window.addEventListener("flexiway:session-changed", () => {
	renderProfilePanel();
	renderSyncStatus();
	if (window.FlexiwayAlerts) window.FlexiwayAlerts.renderNotificationPanel();
});
window.addEventListener("flexiway:sync-status", renderSyncStatus);
