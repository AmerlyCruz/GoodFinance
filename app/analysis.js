let analysisChartInstance = null;

function renderAnalysisPage() {
  if (!window.FlexiwayFinance) return;
  const summary = window.FlexiwayFinance.getExpenseSummary();
  const breakdown = summary.breakdown;
  const formatter = window.FlexiwayFinance.formatCurrency;
  const activePlan = window.FlexiwayFinance.getActiveDebtActionPlan(window.FlexiwayFinance.getDebtPaymentCapacity());
  const creditAccounts = window.FlexiwayFinance.getCreditAccounts();
  const paidAmount = creditAccounts.reduce((total, account) => total + Number(account.paidAmount || 0), 0);
  const originalAmount = creditAccounts.reduce((total, account) => total + Number(account.originalAmount || 0), 0);
  const progressPercent = originalAmount > 0 ? (paidAmount / originalAmount) * 100 : 0;
  const expenseCuts = window.FlexiwayFinance.getExpenseReductionSuggestions();

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

  const focusDebt = document.getElementById("analysisFocusDebt");
  if (focusDebt) {
    focusDebt.textContent = activePlan?.focusAccount
      ? `${activePlan.focusAccount.name} · ${formatter(activePlan.focusAccount.amount)}`
      : "Sin prioridad activa";
  }

  const paymentProgress = document.getElementById("analysisPaymentProgress");
  if (paymentProgress) paymentProgress.textContent = `${progressPercent.toFixed(0)}% liquidado`;

  const paymentDetail = document.getElementById("analysisPaymentDetail");
  if (paymentDetail) {
    paymentDetail.textContent = paidAmount > 0
      ? `Has abonado ${formatter(paidAmount)} de ${formatter(originalAmount)} originalmente registrados.`
      : "Todavia no hay abonos registrados.";
  }

  const debtPressure = document.getElementById("analysisDebtPressure");
  if (debtPressure) {
    debtPressure.textContent = activePlan?.capacity > 0
      ? `${formatter(activePlan.capacity)} al mes`
      : "Sin capacidad definida";
  }

  const debtPressureDetail = document.getElementById("analysisDebtPressureDetail");
  if (debtPressureDetail) {
    debtPressureDetail.textContent = activePlan?.projectedMonths
      ? `Con ese ritmo, tu salida estimada es de ${activePlan.projectedMonths} meses.`
      : "Define tu abono mensual en Creditos para proyectar salida.";
  }

  const expenseCut = document.getElementById("analysisExpenseCut");
  if (expenseCut) {
    expenseCut.textContent = expenseCuts[0]?.title || "Sigue registrando movimientos";
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
