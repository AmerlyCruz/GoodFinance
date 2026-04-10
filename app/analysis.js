let analysisChartInstance = null;

function renderAnalysisPage() {
  if (!window.FlexiwayFinance) return;
  const summary = window.FlexiwayFinance.getExpenseSummary();
  const breakdown = summary.breakdown;
  const formatter = window.FlexiwayFinance.formatCurrency;

  const mapping = {
    cards: "kpi-tarjetas",
    loans: "kpi-prestamos",
    services: "kpi-servicios",
    debts: "kpi-deudas",
    custom: "kpi-custom"
  };

  breakdown.forEach((item) => {
    const element = document.getElementById(mapping[item.key]);
    if (element) element.textContent = formatter(item.total);
  });

  const totalElement = document.getElementById("kpi-total");
    if (totalElement) totalElement.textContent = formatter(summary.totalExpenses);

  const emptyState = document.getElementById("analysisEmptyState");
    if (emptyState) {
      emptyState.hidden = summary.totalExpenses > 0;
    }

  const canvas = document.getElementById("gastosChart");
    if (!canvas || typeof Chart === "undefined") return;

    if (analysisChartInstance) analysisChartInstance.destroy();

    analysisChartInstance = new Chart(canvas, {
      type: "pie",
      data: {
        labels: breakdown.map((item) => item.label),
        datasets: [{
          data: breakdown.map((item) => item.total),
          backgroundColor: breakdown.map((item) => item.color),
          borderWidth: 0
        }]
      },
      options: {
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              label(context) {
                return `${context.label}: ${formatter(context.parsed)}`;
              }
            }
          }
        }
      }
    });
}

document.addEventListener("DOMContentLoaded", renderAnalysisPage);
window.addEventListener("flexiway:data-updated", renderAnalysisPage);
