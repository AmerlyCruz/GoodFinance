let creditChartInstance = null;
const plannerState = {
	selectedMode: "",
	capacity: "",
	targetMonths: "",
	planScope: "global",
	focusPrimary: "",
	focusSecondary: "",
	detailMode: ""
};

function getFocusTargetIds() {
	if (plannerState.planScope === "single") {
		return plannerState.focusPrimary ? [plannerState.focusPrimary] : [];
	}
	if (plannerState.planScope === "duo") {
		return [plannerState.focusPrimary, plannerState.focusSecondary].filter((value, index, items) => value && items.indexOf(value) === index);
	}
	return [];
}

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

function renderDebtPlans(plans, selectedMode) {
	const container = document.getElementById("debtPlanPicker");
	if (!container) return;
	if (!plans || plans.length === 0) {
		container.innerHTML = '<div class="empty-copy">No hay planes disponibles todavia.</div>';
		return;
	}

	container.innerHTML = plans.map((plan) => {
		const isActive = plan.mode === selectedMode;
		return `
			<button class="plan-pill ${isActive ? "active" : ""}" data-select-plan="${plan.mode}" type="button">${escapeHtml(plan.label)}</button>
		`;
	}).join("");
}

function renderDebtPlanSummary(plan, formatter) {
	const container = document.getElementById("debtPlanSummary");
	if (!container) return;
	if (!plan) {
		container.innerHTML = '<p class="empty-copy">Selecciona una estrategia para ver un plan compacto.</p>';
		return;
	}
	const scopeLabel = plan.scope === "single" && plan.focusAccount
		? `Enfocado en ${escapeHtml(plan.focusAccount.name)}`
		: plan.scope === "duo"
			? "Enfocado en dos deudas objetivo"
			: "Vista global de deuda";
	const sequence = (plan.attackSequence || []).slice(0, 3).map((item) => `
		<li>
			<strong>${item.step}. ${escapeHtml(item.name)}</strong><br>
			<small>${formatter(item.payment)} · ${escapeHtml(item.reason)}</small>
		</li>
	`).join("");
	const reasonBlock = plan.focusAccount
		? `<div class="plan-summary-metric"><strong>Por que va primero</strong><span>${escapeHtml(plan.focusAccount.prioritySummary || plan.focusAccount.rationale || "Sin detalle")}</span></div>`
		: `<div class="plan-summary-metric"><strong>Por que va primero</strong><span>Completa la simulacion para verlo.</span></div>`;
	container.innerHTML = `
		<h3>${escapeHtml(plan.label)}</h3>
		<p style="margin:0;color:#6c5a58;">${scopeLabel}. ${escapeHtml(plan.description)}</p>
		<div class="plan-summary-grid">
			<div class="plan-summary-metric"><strong>Deuda evaluada</strong><span>${formatter(plan.totalDebt)}</span></div>
			<div class="plan-summary-metric"><strong>Meta</strong><span>${plan.targetMonths > 0 ? `${plan.targetMonths} meses` : "Sin definir"}</span></div>
			<div class="plan-summary-metric"><strong>Pago mensual meta</strong><span>${plan.requiredMonthlyBudget > 0 ? formatter(plan.requiredMonthlyBudget) : "Completa datos"}</span></div>
			<div class="plan-summary-metric"><strong>Prioridad</strong><span>${plan.focusAccount ? escapeHtml(plan.focusAccount.name) : "Sin prioridad"}</span></div>
			${reasonBlock}
		</div>
		<div>
			<strong style="display:block;margin-bottom:10px;color:#7e4a54;">Orden sugerido</strong>
			<ul class="plan-sequence">${sequence || '<li>Completa modo, monto y plazo para ver un orden real.</li>'}</ul>
		</div>
		<div class="plan-summary-actions">
			<button class="plan-action-btn primary" data-save-favorite="${plan.mode}" type="button">Guardar favorita</button>
			<button class="plan-action-btn secondary" data-detail-plan="${plan.mode}" type="button">Ver detalles</button>
		</div>
	`;
}

function renderPlanComparison(plans, selectedMode, formatter) {
	const container = document.getElementById("debtPlanComparison");
	if (!container) return;
	if (!plans || plans.length === 0) {
		container.innerHTML = "";
		return;
	}
	container.innerHTML = plans.map((plan) => `
		<div class="comparison-card ${plan.mode === selectedMode ? "active" : ""}">
			<h4>${escapeHtml(plan.label)}</h4>
			<div><strong>Pago meta:</strong> ${plan.requiredMonthlyBudget > 0 ? formatter(plan.requiredMonthlyBudget) : "Completa datos"}</div>
			<small><strong>Salida estimada:</strong> ${plan.projectedMonths ? `${plan.projectedMonths} meses` : "Sin simulacion"}</small>
			<small><strong>Prioridad:</strong> ${plan.focusAccount ? escapeHtml(plan.focusAccount.name) : "Sin prioridad"}</small>
			<small><strong>Motivo:</strong> ${plan.focusAccount ? escapeHtml(plan.focusAccount.prioritySummary || plan.focusAccount.rationale) : "Pendiente"}</small>
		</div>
	`).join("");
}

function renderPlanFavorites(favorites, formatter, summary) {
	const container = document.getElementById("debtPlanFavorites");
	if (!container) return;
	if (!favorites || favorites.length === 0) {
		container.innerHTML = '<div class="empty-copy">Todavia no has guardado simulaciones favoritas.</div>';
		return;
	}
	const accountLookup = new Map((summary?.accounts || []).map((account) => [account.id, account.name]));
	container.innerHTML = favorites.map((favorite) => {
		const scopeLabel = favorite.scope === "single"
			? `1 deuda: ${escapeHtml(accountLookup.get(favorite.focusTargetIds[0]) || "sin nombre")}`
			: favorite.scope === "duo"
				? `2 deudas: ${favorite.focusTargetIds.map((id) => escapeHtml(accountLookup.get(id) || "sin nombre")).join(" y ")}`
				: "Plan global";
		return `
			<div class="favorite-card">
				<strong>${escapeHtml(favorite.label)}</strong>
				<small>${scopeLabel}</small>
				<small>${escapeHtml(favorite.mode)} · ${formatter(favorite.capacity)} al mes · ${favorite.targetMonths} meses</small>
				<div class="favorite-actions">
					<button class="plan-action-btn secondary" data-load-favorite="${favorite.id}" type="button">Cargar</button>
					<button class="plan-action-btn secondary" data-delete-favorite="${favorite.id}" type="button">Eliminar</button>
				</div>
			</div>
		`;
	}).join("");
}

function renderPlanDetails(plan, formatter) {
	const drawer = document.getElementById("planDetailsDrawer");
	const overlay = document.getElementById("planDetailsOverlay");
	const content = document.getElementById("planDetailsContent");
	if (!drawer || !overlay || !content) return;
	if (!plan) {
		plannerState.detailMode = "";
		drawer.classList.remove("active");
		overlay.classList.remove("active");
		drawer.setAttribute("aria-hidden", "true");
		content.innerHTML = "";
		return;
	}

	const canShowAllocations = plan.capacity > 0 && plan.targetMonths > 0;
	const allocations = canShowAllocations ? plan.allocations.slice(0, 5).map((item) => `
		<li>
			<strong>${escapeHtml(item.name)}</strong><br>
			Pago asignado en este plan: ${formatter(item.recommendedPayment)}<br>
			<small>${escapeHtml(item.rationale)}</small>
		</li>
	`).join("") : "";
	const sequenceItems = (plan.attackSequence || []).map((item) => `
		<li>
			<strong>${item.step}. ${escapeHtml(item.name)}</strong><br>
			Pago recomendado: ${formatter(item.payment)}<br>
			<small>${escapeHtml(item.reason)}</small>
		</li>
	`).join("");
	const parallelCopy = (plan.parallelAccounts || []).length >= 2
		? `<p style="margin:0;">Si prefieres atacar dos juntas: ${plan.parallelAccounts.map((item) => `${escapeHtml(item.name)} con ${formatter(item.recommendedPayment)}`).join(" y ")}.</p>`
		: "";
	const warningBlock = plan.warnings.length > 0
		? `<div class="plan-warning">${plan.warnings.map((warning) => escapeHtml(warning)).join("<br>")}</div>`
		: "";
	const cuts = (plan.expenseCuts || []).map((item) => `<li><strong>${escapeHtml(item.title)}</strong><br><small>${escapeHtml(item.text)}</small></li>`).join("");

	content.innerHTML = `
		<h2 style="margin-top:0;font-family:'Cormorant Garamond', serif;font-size:2rem;">${escapeHtml(plan.label)}</h2>
		<p>${escapeHtml(plan.description)}</p>
		<div class="drawer-block">
			<strong>Tipo de simulacion:</strong> ${plan.scope === "single" ? "Una deuda puntual" : plan.scope === "duo" ? "Dos deudas objetivo" : "Plan global"}<br>
			<strong>Capacidad usada:</strong> ${formatter(plan.capacity)}<br>
			<strong>Meta elegida:</strong> ${plan.targetMonths > 0 ? `${plan.targetMonths} meses` : "Sin definir"}<br>
			<strong>Pago total necesario:</strong> ${plan.requiredMonthlyBudget > 0 ? formatter(plan.requiredMonthlyBudget) : "Define plazo"}<br>
			<strong>Deuda total:</strong> ${formatter(plan.totalDebt)}<br>
			<strong>Meses estimados:</strong> ${plan.projectedMonths ? `${plan.projectedMonths} aprox.` : "Completa modo, monto y plazo"}
		</div>
		<div class="drawer-block">
			<h3>Prioridad sugerida</h3>
			${plan.focusAccount ? `<p style="margin:0;">${escapeHtml(plan.focusAccount.name)} · ${formatter(plan.focusAccount.recommendedPayment)}</p><small>${escapeHtml(plan.focusAccount.prioritySummary || plan.focusAccount.rationale)}</small>` : '<p style="margin:0;">Sin prioridad activa.</p>'}
		</div>
		<div class="drawer-block">
			<h3>Orden de ataque</h3>
			<ul class="history-list">${sequenceItems || '<li>Completa modo, monto y plazo para ver el orden recomendado.</li>'}</ul>
			${parallelCopy}
		</div>
		<div class="drawer-block">
			<h3>Asignaciones sugeridas</h3>
			<ul class="history-list">${allocations || '<li>Sin deudas activas en este momento.</li>'}</ul>
		</div>
		<div class="drawer-block">
			<h3>Recortes sugeridos</h3>
			<ul class="tips-list">${cuts || '<li>Sin sugerencias todavia.</li>'}</ul>
		</div>
		${warningBlock}
	`;

	drawer.classList.add("active");
	overlay.classList.add("active");
	drawer.setAttribute("aria-hidden", "false");
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
	const nextAccount = plan.nextAccount;
	const parallelAccounts = plan.parallelAccounts || [];
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
				<p style="margin:0 0 4px 0;">Pago sugerido en este plan</p>
				<small>${formatter(focus.recommendedPayment)} de ${formatter(focus.amount)} pendientes</small>
			</div>
		</div>
		<div class="message">
			<div>
				<p style="margin:0 0 4px 0;">Por que va primero</p>
				<small>${escapeHtml(focus.prioritySummary || focus.rationale)}</small>
			</div>
		</div>
		<div class="message">
			<div>
				<p style="margin:0 0 4px 0;">Despues sigue</p>
				<small>${nextAccount ? `${escapeHtml(nextAccount.name)} con ${formatter(nextAccount.recommendedPayment)}` : "No hay segunda prioridad por ahora."}</small>
			</div>
		</div>
		<div class="message">
			<div>
				<p style="margin:0 0 4px 0;">Si atacas dos juntas</p>
				<small>${parallelAccounts.length >= 2 ? parallelAccounts.map((item) => `${item.name}: ${formatter(item.recommendedPayment)}`).join(" · ") : "Este plan hoy conviene mas enfocado en una sola deuda."}</small>
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
	const resetButton = document.getElementById("resetDebtPlanner");
	const input = document.getElementById("debtPaymentCapacity");
	const targetInput = document.getElementById("debtTargetMonths");
	const scopeSelect = document.getElementById("debtPlanScope");
	const focusPrimaryField = document.getElementById("debtFocusPrimaryField");
	const focusSecondaryField = document.getElementById("debtFocusSecondaryField");
	const focusPrimarySelect = document.getElementById("debtFocusPrimary");
	const focusSecondarySelect = document.getElementById("debtFocusSecondary");
	const strategySelect = document.getElementById("debtStrategyMode");
	const closeDrawerButton = document.getElementById("closePlanDetails");
	const detailsOverlay = document.getElementById("planDetailsOverlay");
	const accountToggle = document.getElementById("toggleCreditAccounts");
	const accountBody = document.getElementById("creditAccountList");
	const historyToggle = document.getElementById("toggleCreditHistory");
	const historyBody = document.getElementById("creditMovementHistory");
	if (!saveButton || !input || saveButton.dataset.bound === "true") return;

	const saveCapacity = () => {
		if (!window.FlexiwayFinance) return;
		const capacity = Number(input.value || 0);
		const targetMonths = Number(targetInput?.value || 0);
		const mode = strategySelect ? strategySelect.value : "";
		const focusTargetIds = getFocusTargetIds();
		if (!mode || capacity <= 0 || targetMonths <= 0) {
			if (typeof window.showError === "function") {
				window.showError("Selecciona modo, capacidad mensual y plazo objetivo mayor que cero.");
			}
			return;
		}
		if (plannerState.planScope === "single" && focusTargetIds.length !== 1) {
			window.showError?.("Selecciona la deuda puntual que quieres simular.");
			return;
		}
		if (plannerState.planScope === "duo" && focusTargetIds.length !== 2) {
			window.showError?.("Selecciona dos deudas distintas para la simulacion dual.");
			return;
		}
		window.FlexiwayFinance.saveDebtStrategyMode(mode);
		window.FlexiwayFinance.saveDebtPaymentCapacity(capacity);
		window.FlexiwayFinance.saveDebtTargetMonths(targetMonths);
		plannerState.detailMode = mode;
		plannerState.selectedMode = mode;
		plannerState.capacity = String(capacity);
		plannerState.targetMonths = String(targetMonths);
		renderCreditPage();
	};

	const resetPlanner = () => {
		plannerState.selectedMode = "";
		plannerState.capacity = "";
		plannerState.targetMonths = "";
		plannerState.planScope = "global";
		plannerState.focusPrimary = "";
		plannerState.focusSecondary = "";
		plannerState.detailMode = "";
		renderCreditPage();
	};

	const handlePreviewChange = () => {
		plannerState.selectedMode = strategySelect ? strategySelect.value : "";
		plannerState.capacity = input.value || "";
		plannerState.targetMonths = targetInput ? targetInput.value || "" : "";
		plannerState.planScope = scopeSelect ? scopeSelect.value || "global" : "global";
		plannerState.focusPrimary = focusPrimarySelect ? focusPrimarySelect.value || "" : "";
		plannerState.focusSecondary = focusSecondarySelect ? focusSecondarySelect.value || "" : "";
		renderCreditPage();
	};

	saveButton.addEventListener("click", saveCapacity);
	input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") saveCapacity();
	});
	input.addEventListener("input", handlePreviewChange);
	if (targetInput) {
		targetInput.addEventListener("keydown", (event) => {
			if (event.key === "Enter") saveCapacity();
		});
		targetInput.addEventListener("input", handlePreviewChange);
	}
	if (scopeSelect) {
		scopeSelect.addEventListener("change", handlePreviewChange);
	}
	if (focusPrimarySelect) {
		focusPrimarySelect.addEventListener("change", handlePreviewChange);
	}
	if (focusSecondarySelect) {
		focusSecondarySelect.addEventListener("change", handlePreviewChange);
	}
	if (strategySelect) {
		strategySelect.addEventListener("change", handlePreviewChange);
	}
	if (resetButton) {
		resetButton.addEventListener("click", resetPlanner);
	}
	if (closeDrawerButton) {
		closeDrawerButton.addEventListener("click", () => renderPlanDetails(null));
	}
	if (detailsOverlay) {
		detailsOverlay.addEventListener("click", () => renderPlanDetails(null));
	}
	if (accountToggle && accountBody) {
		accountToggle.addEventListener("click", () => {
			const hidden = accountBody.hasAttribute("hidden");
			if (hidden) accountBody.removeAttribute("hidden");
			else accountBody.setAttribute("hidden", "hidden");
			accountToggle.textContent = hidden ? "Ocultar cuentas" : "Ver cuentas";
		});
	}
	if (historyToggle && historyBody) {
		historyToggle.addEventListener("click", () => {
			const hidden = historyBody.hasAttribute("hidden");
			if (hidden) historyBody.removeAttribute("hidden");
			else historyBody.setAttribute("hidden", "hidden");
			historyToggle.textContent = hidden ? "Ocultar historial" : "Ver historial";
		});
	}
	saveButton.dataset.bound = "true";
}

function renderCreditPage() {
	if (!window.FlexiwayFinance) return;
	const formatter = window.FlexiwayFinance.formatCurrency;
	const summary = window.FlexiwayFinance.getCreditSummary();
	const appliedCapacity = window.FlexiwayFinance.getDebtPaymentCapacity();
	const appliedTargetMonths = window.FlexiwayFinance.getDebtTargetMonths();
	const focusTargetIds = getFocusTargetIds();
	const previewCapacity = plannerState.capacity !== "" ? Number(plannerState.capacity || 0) : 0;
	const previewTargetMonths = plannerState.targetMonths !== "" ? Number(plannerState.targetMonths || 0) : 0;
	const planningOptions = {
		capacityOverride: previewCapacity,
		targetMonthsOverride: previewTargetMonths,
		focusTargetIds
	};
	const appliedOptions = {
		capacityOverride: appliedCapacity,
		targetMonthsOverride: appliedTargetMonths,
		focusTargetIds
	};
	const plans = window.FlexiwayFinance.getDebtActionPlans(planningOptions);
	const favorites = typeof window.FlexiwayFinance.getDebtPlanFavorites === "function"
		? window.FlexiwayFinance.getDebtPlanFavorites()
		: [];
	const currentMode = plannerState.selectedMode || window.FlexiwayFinance.getDebtStrategyMode();
	const selectedPlan = plans.find((plan) => plan.mode === currentMode) || plans[0] || null;
	const appliedPlan = window.FlexiwayFinance.getActiveDebtActionPlan(appliedOptions);
	const detailMode = plannerState.detailMode;
	const detailPlan = detailMode ? window.FlexiwayFinance.getDebtActionPlan(detailMode, { ...planningOptions, capacityOverride: previewCapacity || appliedCapacity, targetMonthsOverride: previewTargetMonths || appliedTargetMonths }) : null;

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
	if (capacityInput && capacityInput.value !== plannerState.capacity) capacityInput.value = plannerState.capacity;

	const targetInput = document.getElementById("debtTargetMonths");
	if (targetInput && targetInput.value !== plannerState.targetMonths) targetInput.value = plannerState.targetMonths;

	const focusOptions = ['<option value="">Selecciona una deuda</option>']
		.concat(summary.accounts.filter((account) => account.amount > 0).map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)} · ${formatter(account.amount)}</option>`));
	const scopeSelect = document.getElementById("debtPlanScope");
	if (scopeSelect) scopeSelect.value = plannerState.planScope;
	const focusPrimarySelect = document.getElementById("debtFocusPrimary");
	if (focusPrimarySelect) {
		focusPrimarySelect.innerHTML = focusOptions.join("");
		focusPrimarySelect.value = plannerState.focusPrimary;
	}
	const focusSecondarySelect = document.getElementById("debtFocusSecondary");
	if (focusSecondarySelect) {
		focusSecondarySelect.innerHTML = focusOptions.join("");
		focusSecondarySelect.value = plannerState.focusSecondary;
	}
	const focusPrimaryField = document.getElementById("debtFocusPrimaryField");
	const focusSecondaryField = document.getElementById("debtFocusSecondaryField");
	if (focusPrimaryField) {
		if (plannerState.planScope === "global") focusPrimaryField.setAttribute("hidden", "hidden");
		else focusPrimaryField.removeAttribute("hidden");
	}
	if (focusSecondaryField) {
		if (plannerState.planScope === "duo") focusSecondaryField.removeAttribute("hidden");
		else focusSecondaryField.setAttribute("hidden", "hidden");
	}

	const strategySelect = document.getElementById("debtStrategyMode");
	if (strategySelect && strategySelect.value !== plannerState.selectedMode) strategySelect.value = plannerState.selectedMode;

	renderAccountList(summary, appliedPlan?.focusAccount, formatter);
	renderDebtPlans(plans, currentMode);
	renderDebtPlanSummary(selectedPlan, formatter);
	renderPlanComparison(plans, currentMode, formatter);
	renderPlanFavorites(favorites, formatter, summary);
	renderExpenseCuts(appliedPlan);
	renderPrioritySummary(appliedPlan, formatter);
	renderMovementHistory(formatter);
	renderCreditChart(summary, formatter);
	renderPlanDetails(detailPlan, formatter);

	document.querySelectorAll("[data-select-plan]").forEach((button) => {
		button.onclick = () => {
			plannerState.selectedMode = button.dataset.selectPlan || "";
			const strategyField = document.getElementById("debtStrategyMode");
			if (strategyField) strategyField.value = plannerState.selectedMode;
			renderCreditPage();
		};
	});

	document.querySelectorAll("[data-detail-plan]").forEach((button) => {
		button.onclick = () => {
			const mode = button.dataset.detailPlan || "";
			const detailOptions = {
				capacityOverride: previewCapacity || appliedCapacity,
				targetMonthsOverride: previewTargetMonths || appliedTargetMonths,
				focusTargetIds
			};
			const plan = window.FlexiwayFinance.getDebtActionPlan(mode, detailOptions);
			plannerState.detailMode = mode;
			renderPlanDetails(plan, formatter);
		};
	});

	document.querySelectorAll("[data-save-favorite]").forEach((button) => {
		button.onclick = () => {
			if (!selectedPlan || typeof window.FlexiwayFinance?.saveDebtPlanFavorite !== "function") return;
			const scopeLabel = plannerState.planScope === "single" ? "deuda puntual" : plannerState.planScope === "duo" ? "dos deudas" : "global";
			window.FlexiwayFinance.saveDebtPlanFavorite({
				label: `${selectedPlan.label} · ${scopeLabel} · ${selectedPlan.targetMonths || 0}m`,
				mode: selectedPlan.mode,
				capacity: previewCapacity || appliedCapacity,
				targetMonths: previewTargetMonths || appliedTargetMonths,
				scope: plannerState.planScope,
				focusTargetIds
			});
			renderCreditPage();
		};
	});

	document.querySelectorAll("[data-load-favorite]").forEach((button) => {
		button.onclick = () => {
			const favorite = favorites.find((item) => item.id === button.dataset.loadFavorite);
			if (!favorite) return;
			plannerState.selectedMode = favorite.mode;
			plannerState.capacity = String(favorite.capacity || "");
			plannerState.targetMonths = String(favorite.targetMonths || "");
			plannerState.planScope = favorite.scope || "global";
			plannerState.focusPrimary = favorite.focusTargetIds[0] || "";
			plannerState.focusSecondary = favorite.focusTargetIds[1] || "";
			renderCreditPage();
		};
	});

	document.querySelectorAll("[data-delete-favorite]").forEach((button) => {
		button.onclick = () => {
			window.FlexiwayFinance?.removeDebtPlanFavorite?.(button.dataset.deleteFavorite);
			renderCreditPage();
		};
	});
	bindPlannerControls();
}

document.addEventListener("DOMContentLoaded", async () => {
	if (window.FlexiwayFinance?.ensureSessionReady) {
		await window.FlexiwayFinance.ensureSessionReady();
	}
	bindPlannerControls();
	renderCreditPage();
});
window.addEventListener("flexiway:data-updated", renderCreditPage);
window.addEventListener("flexiway:session-changed", renderCreditPage);
