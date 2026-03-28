// Genera métricas estructuradas para dashboard y gráficos
function generateDashboardData(data) {
	data = data || {};
	const spent = Number(data.spent) || 0;
	const budget = Number(data.budget) || 0;
	const creditDueInDays = Number(data.creditDueInDays) || 0;
	const possibleSavings = Number(data.possibleSavings) || 0;
	return {
		budgetUsage: budget > 0 ? (spent / budget) * 100 : 0,
		totalSpent: spent,
		remainingBudget: budget - spent,
		creditRisk:
			creditDueInDays <= 5 ? "high"
			: creditDueInDays <= 10 ? "medium"
			: "low",
		possibleSavings: possibleSavings
	};
}

// Actualiza indicadores visuales (KPIs)
function updateKPIs(metrics) {
	if (document.getElementById("budgetPercent")) {
		document.getElementById("budgetPercent").textContent =
			metrics.budgetUsage.toFixed(1) + "%";
	}
	// Puedes agregar más KPIs aquí
}

// Renderiza gráfico de resumen mensual tipo pizza
let budgetChartInstance = null;
function renderBudgetChart(data) {
	const ctx = document.getElementById("budgetChart");
	if (!ctx || typeof Chart === "undefined") return;
	// 🔥 Si ya existe, destruirlo
	if (budgetChartInstance) {
		budgetChartInstance.destroy();
	}
	// Datos para el resumen mensual
	const spent = Number(data.spent) || 0;
	const budget = Number(data.budget) || 0;
	const possibleSavings = Number(data.possibleSavings) || 0;
	const debts = Number(data.debts) || 0; // Si tienes campo deudas, si no, será 0
	// El presupuesto restante es lo que queda después de gastos, ahorros y deudas
	let remaining = budget - spent - possibleSavings - debts;
	if (remaining < 0) remaining = 0;
	// Etiquetas y colores pasteles
	const labels = ["Gastos", "Ahorros", "Deudas", "Restante"];
	const dataArr = [spent, possibleSavings, debts, remaining];
	const pastelColors = ["#ffd6e0", "#b5ead7", "#c7ceea", "#fdfd96"];
	budgetChartInstance = new Chart(ctx, {
		type: "pie",
		data: {
			labels: labels,
			datasets: [{
				data: dataArr,
				backgroundColor: pastelColors,
				borderWidth: 0
			}]
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: { display: true, position: 'bottom' },
				tooltip: {
					callbacks: {
						label: function(context) {
							let label = context.label || '';
							let value = context.parsed || 0;
							return `${label}: $${value}`;
						}
					}
				}
			},
			animation: false
		}
	});
}
// ========== BOTÓN PARA EDITAR DATOS FINANCIEROS ==========
// El evento de edición ahora está en el ícono de lápiz dentro del botón de perfil
function addProfileMenu() {
	const profileBtn = document.getElementById('profileBtn');
	console.log('profileBtn:', profileBtn);
	if (profileBtn) {
		profileBtn.onclick = (e) => {
			console.log('Click en profileBtn');
			e.preventDefault();
			const panel = document.getElementById('profilePanel');
			const overlay = document.getElementById('profileOverlay');
			console.log('panel:', panel, 'overlay:', overlay);
			if (panel && overlay) {
				panel.classList.add('active');
				overlay.classList.add('active');
			}
		};
	}
	// Acciones de los botones del panel lateral de perfil
	const loginBtn = document.getElementById('profile-login');
	if (loginBtn) loginBtn.onclick = () => { window.location.href = 'login.html'; };
	const signupBtn = document.getElementById('profile-signup');
	if (signupBtn) signupBtn.onclick = () => { window.location.href = 'signup.html'; };
	const viewBtn = document.getElementById('profile-view');
	if (viewBtn) viewBtn.onclick = () => { window.location.href = 'profile.html'; };
	const logoutBtn = document.getElementById('profile-logout');
	if (logoutBtn) logoutBtn.onclick = () => { window.location.href = 'index.html'; };
	// Cerrar panel de perfil al hacer clic en el overlay
	const overlay = document.getElementById('profileOverlay');
	console.log('profileOverlay:', overlay);
	if (overlay) {
		overlay.onclick = () => {
			overlay.classList.remove('active');
			const panel = document.getElementById('profilePanel');
			if (panel) panel.classList.remove('active');
		};
	}
}
// ========== FLUJO MODERNO AUTÓNOMO DE DATOS FINANCIEROS ==========
function getFinancialData() {
	const raw = localStorage.getItem("financialData");
	if (!raw) return null;
	try {
		return JSON.parse(raw);
	} catch (e) {
		return null;
	}
}

function showFinancialDataForm(onSave, isEdit = false) {
	// Si es edición, precarga los datos
	let initial = getFinancialData() || { spent: '', budget: '', creditDueInDays: '', possibleSavings: '', debts: '' };
	Swal.fire({
		title: isEdit ? "Editar datos financieros" : "Ingresa tus datos financieros",
		html: `
			<div style='display:flex;flex-direction:column;gap:8px;'>
				<label style='text-align:left;font-size:14px;'>Gasto actual ($)
					<input id='swal-spent' class='swal2-input' type='number' min='0' placeholder='Ej: 850' value='${initial.spent}'>
				</label>
				<label style='text-align:left;font-size:14px;'>Presupuesto mensual ($)
					<input id='swal-budget' class='swal2-input' type='number' min='0' placeholder='Ej: 1000' value='${initial.budget}'>
				</label>
				<label style='text-align:left;font-size:14px;'>Días para vencimiento de tarjeta
					<input id='swal-credit' class='swal2-input' type='number' min='0' placeholder='Ej: 3' value='${initial.creditDueInDays}'>
				</label>
				<label style='text-align:left;font-size:14px;'>Ahorro posible ($)
					<input id='swal-savings' class='swal2-input' type='number' min='0' placeholder='Ej: 120' value='${initial.possibleSavings}'>
				</label>
				<label style='text-align:left;font-size:14px;'>Deudas ($)
					<input id='swal-debts' class='swal2-input' type='number' min='0' placeholder='Ej: 200' value='${initial.debts}'>
				</label>
			</div>
		`,
		confirmButtonText: "Guardar",
		focusConfirm: false,
		showCancelButton: isEdit,
		cancelButtonText: "Cancelar",
		preConfirm: () => {
			const spent = Number(document.getElementById('swal-spent').value);
			const budget = Number(document.getElementById('swal-budget').value);
			const creditDueInDays = Number(document.getElementById('swal-credit').value);
			const possibleSavings = Number(document.getElementById('swal-savings').value);
			const debts = Number(document.getElementById('swal-debts').value);
			if (isNaN(spent) || isNaN(budget) || isNaN(creditDueInDays) || isNaN(possibleSavings) || isNaN(debts)) {
				Swal.showValidationMessage('Todos los campos deben ser números válidos');
				return false;
			}
			if (budget <= 0) {
				Swal.showValidationMessage('El presupuesto debe ser mayor a 0');
				return false;
			}
			return { spent, budget, creditDueInDays, possibleSavings, debts };
		}
	}).then(result => {
		if (result.isConfirmed && result.value) {
			localStorage.setItem("financialData", JSON.stringify(result.value));
			if (typeof onSave === "function") onSave(result.value);
		}
	});
}

function runSmartAnalysis() {
	let data = getFinancialData();
	if (!data) {
		showFinancialDataForm((savedData) => {
			showStartupAlerts(savedData);
		});
	} else {
		showStartupAlerts(data);
	}
}

document.addEventListener("DOMContentLoaded", () => {
	addProfileMenu();
});
// ========== FUNCIÓN DE EJEMPLO PARA DATOS FINANCIEROS ==========
// ========== ANÁLISIS Y ALERTAS INTELIGENTES ==========
// Motor de reglas escalable para mensajes
const rules = [
	{
		id: "high_budget_usage",
		priority: "red",
		condition: (data) => {
			const spent = Number(data.spent) || 0;
			const budget = Number(data.budget) || 0;
			return budget > 0 && (spent / budget) >= 0.8;
		},
		message: (data) => "Has gastado más del 80% de tu presupuesto mensual.",
		date: () => "Hoy"
	},
	{
		id: "credit_due",
		priority: "yellow",
		condition: (data) => {
			const creditDueInDays = Number(data.creditDueInDays) || 0;
			return creditDueInDays > 0 && creditDueInDays <= 5;
		},
		message: (data) => `Tu tarjeta vence en ${data.creditDueInDays} días.`,
		date: () => "Próximo vencimiento"
	},
	{
		id: "possible_savings",
		priority: "green",
		condition: (data) => {
			const possibleSavings = Number(data.possibleSavings) || 0;
			return possibleSavings > 0;
		},
		message: (data) => `Puedes ahorrar $${data.possibleSavings} este mes.`,
		date: () => "Proyección"
	}
];

function runRules(data) {
	let messages = [];
	rules.forEach(rule => {
		if (rule.condition(data)) {
			messages.push({
				id: rule.id,
				type: rule.priority,
				text: rule.message(data),
				priority: rule.priority,
				date: typeof rule.date === "function" ? rule.date(data) : ""
			});
		}
	});
	return messages.sort((a, b) => {
		const order = { red: 1, yellow: 2, green: 3 };
		return order[a.priority] - order[b.priority];
	});
}

// API compatible: generateMessages sigue funcionando igual
function generateMessages(data) {
	data = data || {};
	return runRules(data);
}

// PASO 1 — Hash simple de mensajes
function getMessagesHash(messages) {
	return JSON.stringify(messages);
}

// PASO 2 — Control de visibilidad
function shouldShowAlerts(messages) {
	const newHash = getMessagesHash(messages);
	const lastHash = localStorage.getItem("lastAlertsHash");
	const dontShowAgain = localStorage.getItem("hideStartupAlerts");
	// Solo mostrar una vez por sesión
	if (sessionStorage.getItem("alertsShown")) return false;
	if (dontShowAgain === "true") return false;
	if (lastHash === newHash) return false;
	localStorage.setItem("lastAlertsHash", newHash);
	sessionStorage.setItem("alertsShown", "true");
	return true;
}

function showStartupAlerts(data) {
	const messages = generateMessages(data);
	if (messages.length === 0) return;
	let htmlContent = "";
	messages.forEach(msg => {
		let iconSVG = "";
		if (msg.type === "alert" || msg.priority === "red") {
			iconSVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:8px;"><circle cx="12" cy="12" r="11" fill="#ffd6e0"/><path d="M12 7v5" stroke="#e63946" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16" r="1.2" fill="#e63946"/></svg>`;
		} else if (msg.type === "reminder" || msg.priority === "yellow") {
			iconSVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:8px;"><circle cx="12" cy="12" r="11" fill="#fff7e6"/><path d="M12 8v4l3 2" stroke="#e9a600" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
		} else if (msg.type === "suggestion" || msg.priority === "green") {
			iconSVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:8px;"><circle cx="12" cy="12" r="11" fill="#b5ead7"/><path d="M8 13l3 3 5-5" stroke="#38b000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
		}
		htmlContent += `
			<div style="margin-bottom:12px; text-align:left; display:flex; align-items:flex-start; gap:8px;">
				<span>${iconSVG}</span>
				<div>
					<strong style="color:${msg.priority}">${msg.type.toUpperCase()}</strong>
					<p style="margin:4px 0;">${msg.text}</p>
					<small>${msg.date}</small>
				</div>
			</div>
		`;
	});
	Swal.fire({
		title: "Resumen Inteligente",
		html: htmlContent,
		icon: "info",
		showCancelButton: true,
		confirmButtonText: "Entendido",
		cancelButtonText: "No volver a mostrar"
	}).then((result) => {
		if (result.dismiss === Swal.DismissReason.cancel) {
			localStorage.setItem("hideStartupAlerts", "true");
		}
	});
}

// Ejecutar al iniciar con control de visibilidad
document.addEventListener("DOMContentLoaded", () => {
	if (typeof getFinancialData === "function") {
		const data = getFinancialData();
		const messages = generateMessages(data);
		if (shouldShowAlerts(messages)) {
			showStartupAlerts(data);
		}
	}
});

const GOODFINANCE_DEMO_KEYS = [
	'financialData',
	'ingresos',
	'tarjetasCredito',
	'prestamos',
	'servicios',
	'deudas',
	'customCats'
];

const GOODFINANCE_DEMO_DATA = {
	financialData: {
		spent: 1730,
		budget: 3200,
		creditDueInDays: 4,
		possibleSavings: 420,
		debts: 310
	},
	ingresos: [
		{ descripcion: 'Salario mensual', monto: 3200, fecha: '2026-03-01' },
		{ descripcion: 'Trabajo freelance', monto: 480, fecha: '2026-03-18' }
	],
	tarjetasCredito: [
		{ nombre: 'Visa principal', monto: 640, fechaCorte: '2026-03-29', tasa: 24.5 },
		{ nombre: 'MasterCard viajes', monto: 230, fechaCorte: '2026-04-03', tasa: 21.9 }
	],
	prestamos: [
		{ nombre: 'Prestamo del auto', monto: 410, fechaPago: '2026-04-07', tasa: 11.2 }
	],
	servicios: [
		{ nombre: 'Internet y móvil', monto: 95, fechaPago: '2026-03-27' },
		{ nombre: 'Streaming y apps', monto: 38, fechaPago: '2026-03-30' }
	],
	deudas: [
		{ nombre: 'Saldo pendiente personal', monto: 310, fechaPago: '2026-04-11' }
	],
	customCats: [
		{ nombre: 'Comidas fuera', monto: 115, fecha: '2026-03-22' },
		{ nombre: 'Transporte', monto: 92, fecha: '2026-03-21' }
	]
};

function ensureDemoData() {
	if (typeof localStorage === 'undefined') return;

	const hasExistingData = GOODFINANCE_DEMO_KEYS.some((key) => {
		const value = localStorage.getItem(key);
		return typeof value === 'string' && value.trim() !== '' && value.trim() !== '[]' && value.trim() !== '{}';
	});

	if (hasExistingData) return;

	GOODFINANCE_DEMO_KEYS.forEach((key) => {
		localStorage.setItem(key, JSON.stringify(GOODFINANCE_DEMO_DATA[key]));
	});

	localStorage.removeItem('hideStartupAlerts');
	localStorage.removeItem('lastAlertsHash');
	sessionStorage.removeItem('alertsShown');
	localStorage.setItem('goodfinance-demo-seeded', 'true');
}

ensureDemoData();

// ========== SIDEBAR & OVERLAY ==========
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const openSidebarBtn = document.getElementById('toggleSidebar');
const closeSidebarBtn = document.getElementById('closeSidebar');

if (openSidebarBtn && sidebar && overlay) {
	openSidebarBtn.addEventListener('click', () => {
		sidebar.classList.add('active');
		overlay.classList.add('active');
	});
}
if (closeSidebarBtn && sidebar && overlay) {
	closeSidebarBtn.addEventListener('click', () => {
		sidebar.classList.remove('active');
		overlay.classList.remove('active');
	});
}
if (overlay && sidebar) {
	overlay.addEventListener('click', () => {
		sidebar.classList.remove('active');
		overlay.classList.remove('active');
	});
}

// ========== PANEL DE NOTIFICACIONES ==========
const notificationPanel = document.getElementById('notificationPanel');
const notificationOverlay = document.getElementById('notificationOverlay');
const openPanelBtn = document.getElementById('notificationBtn');
// No hay botón cerrar panel, se puede cerrar haciendo click en el overlay o agregando uno si se desea

if (openPanelBtn && notificationPanel && notificationOverlay) {
	openPanelBtn.addEventListener('click', () => {
		notificationPanel.classList.add('active');
		notificationOverlay.classList.add('active');
	});
}
if (notificationOverlay && notificationPanel) {
	notificationOverlay.addEventListener('click', () => {
		notificationPanel.classList.remove('active');
		notificationOverlay.classList.remove('active');
	});
}

// ========== LÓGICA INTELIGENTE DE NOTIFICACIONES ==========
// Ejemplo: mostrar notificaciones inteligentes según reglas
function getSmartNotifications() {
	// Aquí puedes agregar reglas inteligentes
	const now = new Date();
	const hour = now.getHours();
	const notifications = [];
	if (hour < 12) {
		notifications.push({
			tag: 'reminder',
			text: '¡No olvides revisar tus movimientos de la mañana!',
			time: 'Hoy',
		});
	} else if (hour < 18) {
		notifications.push({
			tag: 'suggestion',
			text: '¿Ya revisaste tus metas de ahorro para la tarde?',
			time: 'Hoy',
		});
	} else {
		notifications.push({
			tag: 'alert',
			text: 'Recuerda cerrar sesión si no usarás la app.',
			time: 'Noche',
		});
	}
	return notifications;
}

function renderSmartNotifications() {
	const container = document.querySelector('.panel-messages');
	if (!container) return;
	container.innerHTML = '';
	const notifications = getSmartNotifications();
	notifications.forEach(n => {
		const div = document.createElement('div');
		div.className = 'message';
		let tagClass = 'tag';
		if (n.tag === 'alert') tagClass += ' alert-tag';
		else if (n.tag === 'reminder') tagClass += ' reminder-tag';
		else if (n.tag === 'suggestion') tagClass += ' suggestion-tag';
		div.innerHTML = `<span class="${tagClass}">${n.tag.toUpperCase()}</span><div><p>${n.text}</p><small>${n.time}</small></div>`;
		container.appendChild(div);
	});
}

// Renderizar al abrir el panel
if (openPanelBtn) {
	openPanelBtn.addEventListener('click', renderSmartNotifications);
}

// ========== SWEETALERT2 (si está presente) ==========
if (typeof Swal !== 'undefined') {
	window.showSuccess = (msg) => Swal.fire('¡Éxito!', msg, 'success');
	window.showError = (msg) => Swal.fire('Error', msg, 'error');
}
