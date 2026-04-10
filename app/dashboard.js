function renderDashboardPage() {
	if (!window.FlexiwayFinance) return;
	const data = window.FlexiwayFinance.getFinancialData();
	const metrics = window.FlexiwayFinance.generateDashboardData(data);
	const formatter = window.FlexiwayFinance.formatCurrency;

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

	window.FlexiwayFinance.renderBudgetChart(data);
}

document.addEventListener("DOMContentLoaded", renderDashboardPage);
window.addEventListener("flexiway:data-updated", renderDashboardPage);