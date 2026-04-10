let creditChartInstance = null;

function renderCreditPage() {
	if (!window.FlexiwayFinance) return;
	const formatter = window.FlexiwayFinance.formatCurrency;
	const summary = window.FlexiwayFinance.getCreditSummary();

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

	const list = document.getElementById("creditAccountList");
	if (list) {
		if (summary.accounts.length === 0) {
			list.innerHTML = '<div class="message"><div><p>No hay tarjetas, prestamos o deudas registradas.</p><small>Ve a Registrar Gastos para cargar tus obligaciones.</small></div></div>';
		} else {
			list.innerHTML = summary.accounts.map((account) => {
				const dueLabel = account.dueDate ? account.dueDate : "Sin fecha";
				const rateLabel = account.rate > 0 ? `${account.rate.toFixed(1)}% anual` : "Sin tasa";
				return `
					<div class="message" style="justify-content:space-between;align-items:center;">
						<div>
							<span class="tag suggestion-tag">${account.type}</span>
							<p style="margin:6px 0 2px 0;font-weight:700;">${account.name}</p>
							<small>${dueLabel} · ${rateLabel}</small>
						</div>
						<div style="font-weight:700;">${formatter(account.amount)}</div>
					</div>
				`;
			}).join("");
		}
	}

	const canvas = document.getElementById("creditBreakdownChart");
	if (!canvas || typeof Chart === "undefined") return;
	if (creditChartInstance) creditChartInstance.destroy();

	const grouped = window.FlexiwayFinance.EXPENSE_GROUPS.filter((group) => ["cards", "loans", "debts"].includes(group.key))
		.map((group) => {
			const total = summary.accounts
				.filter((account) =>
					(group.key === "cards" && account.type === "Tarjeta") ||
					(group.key === "loans" && account.type === "Prestamo") ||
					(group.key === "debts" && account.type === "Deuda")
				)
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

document.addEventListener("DOMContentLoaded", renderCreditPage);
window.addEventListener("flexiway:data-updated", renderCreditPage);
