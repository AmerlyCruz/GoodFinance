let savingsChartInstance = null;

function renderSavingsPage() {
	if (!window.FlexiwayFinance) return;
	const formatter = window.FlexiwayFinance.formatCurrency;
	const history = window.FlexiwayFinance.getMonthlySavingsHistory();
	const data = window.FlexiwayFinance.getFinancialData();

	const currentSavings = document.getElementById("savingsCurrent");
	if (currentSavings) currentSavings.textContent = formatter(data.possibleSavings);

	const totalIncome = document.getElementById("savingsIncome");
	if (totalIncome) totalIncome.textContent = formatter(data.income);

	const totalExpenses = document.getElementById("savingsExpenses");
	if (totalExpenses) totalExpenses.textContent = formatter(data.spent);

	const table = document.getElementById("historial-ahorros");
	if (table) {
		if (history.length === 0) {
			table.innerHTML = '<div class="message"><div><p>No hay historial suficiente para calcular ahorros.</p><small>Registra ingresos y gastos con fecha para generar la serie mensual.</small></div></div>';
		} else {
			table.innerHTML = `
				<table style="width:100%;max-width:720px;margin:18px 0;border-collapse:collapse;overflow:hidden;border-radius:16px;">
					<tr style="background:#ffd6e0;color:#3a2c2a;">
						<th style="padding:12px;">Mes</th>
						<th style="padding:12px;">Ingresos</th>
						<th style="padding:12px;">Gastos</th>
						<th style="padding:12px;">Ahorro</th>
					</tr>
					${history.map((item) => `
						<tr style="text-align:center;background:#fffaf7;">
							<td style="padding:10px;">${item.month}</td>
							<td style="padding:10px;">${formatter(item.income)}</td>
							<td style="padding:10px;">${formatter(item.expenses)}</td>
							<td style="padding:10px;color:${item.savings >= 0 ? "#2a9d8f" : "#e63946"};font-weight:700;">${formatter(item.savings)}</td>
						</tr>
					`).join("")}
				</table>
			`;
		}
	}

	const canvas = document.getElementById("ahorroChart");
	if (!canvas || typeof Chart === "undefined") return;
	if (savingsChartInstance) savingsChartInstance.destroy();

	savingsChartInstance = new Chart(canvas, {
		type: "bar",
		data: {
			labels: history.map((item) => item.month),
			datasets: [{
				label: "Ahorro mensual",
				data: history.map((item) => item.savings),
				backgroundColor: history.map((item) => item.savings >= 0 ? "#b5ead7" : "#ffd6e0"),
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

document.addEventListener("DOMContentLoaded", renderSavingsPage);
window.addEventListener("flexiway:data-updated", renderSavingsPage);