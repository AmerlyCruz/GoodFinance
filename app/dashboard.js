function renderDashboardPage() {
	if (!window.FlexiwayFinance) return;
	const data = window.FlexiwayFinance.getFinancialData();
	const metrics = window.FlexiwayFinance.generateDashboardData(data);
	const formatter = window.FlexiwayFinance.formatCurrency;
	const activePlan = window.FlexiwayFinance.getActiveDebtActionPlan({
		capacityOverride: window.FlexiwayFinance.getDebtPaymentCapacity(),
		targetMonthsOverride: window.FlexiwayFinance.getDebtTargetMonths()
	});
	const history = window.FlexiwayFinance.getMovementHistory();
	const currentMonth = new Date().toISOString().slice(0, 7);
	const paymentCountThisMonth = history.filter((entry) => entry.kind === "pago" && String(entry.date || "").slice(0, 7) === currentMonth).length;
	const lastMovement = history[0] || null;

	const budgetPercent = document.getElementById("budgetPercent");
	if (budgetPercent) budgetPercent.textContent = window.FlexiwayFinance.formatPercent(metrics.budgetUsage);

	const possibleSavings = document.getElementById("possibleSavings");
	if (possibleSavings) possibleSavings.textContent = formatter(metrics.possibleSavings);

	const creditRisk = document.getElementById("creditRisk");
	if (creditRisk) {
		creditRisk.textContent = metrics.creditRisk === "high" ? "Alto" : metrics.creditRisk === "medium" ? "Medio" : "Bajo";
	}

	const income = document.getElementById("dashboardIncome");
	if (income) income.textContent = formatter(data.income);

	const expenses = document.getElementById("dashboardExpenses");
	if (expenses) expenses.textContent = formatter(metrics.totalSpent);

	const remaining = document.getElementById("dashboardRemaining");
	if (remaining) remaining.textContent = formatter(metrics.remainingBudget);

	const nextDue = document.getElementById("dashboardNextDue");
	if (nextDue) {
		nextDue.textContent = data.nextDueAccount
			? `${data.nextDueAccount.name} en ${data.nextDueAccount.dueInDays} dias`
			: "Sin vencimientos proximos";
	}

	const overlayMsg = document.getElementById("chartOverlayMsg");
	if (overlayMsg) overlayMsg.style.display = metrics.totalSpent === 0 && data.income === 0 ? "flex" : "none";

	const budgetStatus = document.getElementById("dashboardBudgetStatus");
	if (budgetStatus) {
		budgetStatus.textContent = metrics.remainingBudget > 0
			? `${formatter(metrics.remainingBudget)} disponibles`
			: "Presupuesto comprometido";
	}

	const priorityDebt = document.getElementById("dashboardPriorityDebt");
	if (priorityDebt) {
		priorityDebt.textContent = activePlan?.focusAccount
			? `${activePlan.focusAccount.name} · ${formatter(activePlan.focusAccount.recommendedPayment)}`
			: "Sin prioridad definida";
	}

	const paymentsThisMonth = document.getElementById("dashboardPaymentsThisMonth");
	if (paymentsThisMonth) {
		paymentsThisMonth.textContent = paymentCountThisMonth === 1 ? "1 pago" : `${paymentCountThisMonth} pagos`;
	}

	const debtCapacity = document.getElementById("dashboardDebtCapacity");
	if (debtCapacity) {
		debtCapacity.textContent = data.debtPaymentCapacity > 0
			? `${formatter(data.debtPaymentCapacity)}${data.debtTargetMonths > 0 ? ` · Meta ${data.debtTargetMonths} meses` : ""}`
			: "No definida";
	}

	const debtProjection = document.getElementById("dashboardDebtProjection");
	if (debtProjection) {
		debtProjection.textContent = activePlan?.projectedMonths
			? `Salida estimada: ${activePlan.projectedMonths} meses si sostienes ${formatter(activePlan.capacity)} al mes.`
			: activePlan?.requiredMonthlyBudget > 0
				? `Para cumplir tu meta necesitas ${formatter(activePlan.requiredMonthlyBudget)} al mes.`
				: "Define modo, monto y plazo para estimar salida de deuda.";
	}

	const lastMovementElement = document.getElementById("dashboardLastMovement");
	if (lastMovementElement) {
		lastMovementElement.textContent = lastMovement
			? `${lastMovement.name} · ${lastMovement.date}`
			: "Aun sin registros";
	}

	window.FlexiwayFinance.renderBudgetChart(data);
}

document.addEventListener("DOMContentLoaded", async () => {
	if (window.FlexiwayFinance?.ensureSessionReady) {
		await window.FlexiwayFinance.ensureSessionReady();
	}
	renderDashboardPage();
});
window.addEventListener("flexiway:data-updated", renderDashboardPage);
window.addEventListener("flexiway:session-changed", renderDashboardPage);