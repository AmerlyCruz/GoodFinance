let creditChartInstance = null;

function escapeHtml(value) {
	return String(value || "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function formatDueMeta(account) {
	if (!account || !account.dueDate) return "Sin fecha registrada";
	if (account.dueInDays === null) return account.dueDate;
	if (account.dueInDays < 0) return `${account.dueDate} · vencida hace ${Math.abs(account.dueInDays)} dias`;
	if (account.dueInDays === 0) return `${account.dueDate} · vence hoy`;
	return `${account.dueDate} · vence en ${account.dueInDays} dias`;
}

function renderDebtPlans(plans, activeMode, formatter) {
	const container = document.getElementById("debtPlans");
	if (!container) return;
	if (!plans || plans.length === 0) {
		container.innerHTML = '<div class="empty-copy">No hay planes disponibles todavia.</div>';
		return;
	}

	container.innerHTML = plans.map((plan) => {
		const isActive = plan.mode === activeMode;
		const allocations = plan.allocations.slice(0, 3).map((item) => `
			<li>
				<strong>${escapeHtml(item.name)}</strong><br>
				Abono sugerido: ${formatter(item.recommendedPayment)}<br>
				<small>${escapeHtml(item.rationale)}</small>
			</li>
		`).join("");
		const warningBlock = plan.warnings.length > 0
			? `<div class="plan-warning">${plan.warnings.map((warning) => escapeHtml(warning)).join("<br>")}</div>`
			: "";
		return `
			<div class="plan-card ${isActive ? "is-active" : ""}">
				<span class="plan-chip">${escapeHtml(plan.strategy)}</span>
				${isActive ? '<span class="plan-active-flag">Modo activo</span>' : ""}
				<h3>${escapeHtml(plan.label)}</h3>
				<p>${escapeHtml(plan.description)}</p>
				<p><strong>Capacidad usada:</strong> ${formatter(plan.capacity)}</p>
				<p><strong>Deuda total:</strong> ${formatter(plan.totalDebt)}</p>
				<p><strong>Meses estimados:</strong> ${plan.projectedMonths ? `${plan.projectedMonths} aprox.` : "Define capacidad mensual"}</p>
				<ul>${allocations || '<li>Sin deudas activas en este momento.</li>'}</ul>
				${warningBlock}
			</div>
		`;
	}).join("");
}

function renderExpenseCuts(plan) {
	const list = document.getElementById("expenseCutTips");
	if (!list) return;
	const suggestions = plan?.expenseCuts || [];
	if (suggestions.length === 0) {
		list.innerHTML = '<li>Sin sugerencias todavia.</li>';
		return;
	}
	list.innerHTML = suggestions.map((item) => `
		<li>
			<strong>${escapeHtml(item.title)}</strong>
			<small>${escapeHtml(item.text)}</small>
		</li>
	`).join("");
}

function renderPrioritySummary(plan, formatter) {
	const container = document.getElementById("prioritySummary");
	if (!container) return;
	if (!plan || !plan.focusAccount) {
		container.innerHTML = '<div class="message"><div><p>No hay una prioridad activa todavia.</p><small>Registra deudas y define una capacidad mensual para recibir una recomendacion.</small></div></div>';
		return;
	}

	const focus = plan.focusAccount;
	container.innerHTML = `
		<div class="message">
			<div>
				<span class="tag suggestion-tag">Ataca primero</span>
				<p style="margin:6px 0 4px 0;font-weight:700;">${escapeHtml(focus.name)}</p>
				<small>${escapeHtml(focus.type)} · ${escapeHtml(formatDueMeta(focus))}</small>
			</div>
		</div>
		<div class="message">
			<div>
				<p style="margin:0 0 4px 0;">Abono recomendado este mes</p>
				<small>${formatter(focus.recommendedPayment)} de ${formatter(focus.amount)} pendientes</small>
			</div>
		</div>
		<div class="message">
			<div>
				<p style="margin:0 0 4px 0;">Motivo</p>
				<small>${escapeHtml(focus.rationale)}</small>
			</div>
		</div>
	`;
}

function renderMovementHistory(formatter) {
	const list = document.getElementById("creditMovementHistory");
	if (!list || !window.FlexiwayFinance) return;
	const history = window.FlexiwayFinance.getMovementHistory().slice(0, 12);
	if (history.length === 0) {
		list.innerHTML = '<li>Sin movimientos registrados.</li>';
		return;
	}

	list.innerHTML = history.map((entry) => `
		<li>
			<strong>${escapeHtml(entry.name)}</strong>
			<small>${escapeHtml(entry.date || "Sin fecha")} · ${escapeHtml(entry.description || entry.kind)}</small>
			<small>Monto: ${formatter(entry.amount)}${entry.kind === "pago" ? ` · Restante: ${formatter(entry.remainingAmount)}` : ""}</small>
		</li>
	`).join("");
}

function renderAccountList(summary, focusAccount, formatter) {
	const list = document.getElementById("creditAccountList");
	if (!list) return;
	if (summary.accounts.length === 0) {
		list.innerHTML = '<div class="message"><div><p>No hay tarjetas, prestamos o deudas registradas.</p><small>Ve a Registrar Gastos para cargar tus obligaciones.</small></div></div>';
		return;
	}

	list.innerHTML = summary.accounts.map((account) => {
		const isFocus = focusAccount && focusAccount.category === account.category && focusAccount.index === account.index;
		const rateLabel = account.rate > 0 ? `${account.rate.toFixed(1)}% anual` : "Sin tasa";
		const progressLabel = account.progress > 0 ? `${Math.round(account.progress)}% liquidado` : "Sin pagos aplicados";
		return `
			<div class="message" style="justify-content:space-between;align-items:flex-start;gap:14px;">
				<div>
					<span class="tag ${isFocus ? "alert-tag" : "suggestion-tag"}">${isFocus ? "Prioridad" : account.type}</span>
					<p style="margin:6px 0 2px 0;font-weight:700;">${escapeHtml(account.name)}</p>
					<small>${escapeHtml(formatDueMeta(account))} · ${rateLabel} · ${progressLabel}</small>
				</div>
				<div style="font-weight:700;text-align:right;">${formatter(account.amount)}</div>
			</div>
		`;
	}).join("");
}

function renderCreditChart(summary, formatter) {
	const canvas = document.getElementById("creditBreakdownChart");
	if (!canvas || typeof Chart === "undefined") return;
	if (creditChartInstance) creditChartInstance.destroy();

	const grouped = window.FlexiwayFinance.EXPENSE_GROUPS.filter((group) => ["cards", "loans", "debts"].includes(group.key))
		.map((group) => {
			const total = summary.accounts
				.filter((account) => account.category === group.key && account.amount > 0)
				.reduce((accumulator, account) => accumulator + account.amount, 0);
			return { label: group.label, color: group.color, total };
		});

	creditChartInstance = new Chart(canvas, {
		type: "bar",
		data: {
			labels: grouped.map((item) => item.label),
			datasets: [{
				data: grouped.map((item) => item.total),
				backgroundColor: grouped.map((item) => item.color),
				borderRadius: 12
			}]
		},
		options: {
			plugins: {
				legend: { display: false },
				tooltip: {
					callbacks: {
						label(context) {
							return formatter(context.parsed.y);
						}
					}
				}
			},
			scales: {
				y: { beginAtZero: true }
			}
		}
	});
}

function bindPlannerControls() {
	const saveButton = document.getElementById("saveDebtCapacity");
	const input = document.getElementById("debtPaymentCapacity");
	const strategySelect = document.getElementById("debtStrategyMode");
	if (!saveButton || !input || saveButton.dataset.bound === "true") return;

	const saveCapacity = () => {
		if (!window.FlexiwayFinance) return;
		window.FlexiwayFinance.saveDebtPaymentCapacity(Number(input.value || 0));
		renderCreditPage();
	};

	const saveStrategy = () => {
		if (!window.FlexiwayFinance || !strategySelect) return;
		window.FlexiwayFinance.saveDebtStrategyMode(strategySelect.value);
		renderCreditPage();
	};

	saveButton.addEventListener("click", saveCapacity);
	input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") saveCapacity();
	});
	if (strategySelect) {
		strategySelect.addEventListener("change", saveStrategy);
	}
	saveButton.dataset.bound = "true";
}

function renderCreditPage() {
	if (!window.FlexiwayFinance) return;
	const formatter = window.FlexiwayFinance.formatCurrency;
	const summary = window.FlexiwayFinance.getCreditSummary();
	const storedCapacity = window.FlexiwayFinance.getDebtPaymentCapacity();
	const activeMode = window.FlexiwayFinance.getDebtStrategyMode();
	const plans = window.FlexiwayFinance.getDebtActionPlans(storedCapacity);
	const activePlan = plans.find((plan) => plan.mode === activeMode) || plans[0];

	const totalElement = document.getElementById("creditExposure");
	if (totalElement) totalElement.textContent = formatter(summary.exposure);

	const nextDueElement = document.getElementById("creditNextDue");
	if (nextDueElement) {
		nextDueElement.textContent = summary.nextDue
			? `${summary.nextDue.name} en ${summary.nextDue.dueInDays} dias`
			: "Sin vencimientos cargados";
	}

	const averageRateElement = document.getElementById("creditAverageRate");
	if (averageRateElement) averageRateElement.textContent = `${summary.averageRate.toFixed(1)}%`;

	const riskElement = document.getElementById("creditRiskLabel");
	if (riskElement) riskElement.textContent = summary.risk;

	const capacityInput = document.getElementById("debtPaymentCapacity");
	if (capacityInput) capacityInput.value = storedCapacity || "";

	const strategySelect = document.getElementById("debtStrategyMode");
	if (strategySelect) strategySelect.value = activeMode;

	renderAccountList(summary, activePlan?.focusAccount, formatter);
	renderDebtPlans(plans, activeMode, formatter);
	renderExpenseCuts(activePlan);
	renderPrioritySummary(activePlan, formatter);
	renderMovementHistory(formatter);
	renderCreditChart(summary, formatter);
	bindPlannerControls();
}

document.addEventListener("DOMContentLoaded", () => {
	bindPlannerControls();
	renderCreditPage();
});
window.addEventListener("flexiway:data-updated", renderCreditPage);
