let analysisChartInstance = null;

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderAnalysisPlanDrawer(plan, formatter) {
  const drawer = document.getElementById("analysisPlanDrawer");
  const overlay = document.getElementById("analysisPlanOverlay");
  const content = document.getElementById("analysisPlanContent");
  if (!drawer || !overlay || !content) return;

  if (!plan) {
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
      Pago asignado en este plan: ${formatter(item.recommendedPayment)}
      <small>${escapeHtml(item.rationale)}</small>
    </li>
  `).join("") : "";
  const sequenceItems = (plan.attackSequence || []).map((item) => `
    <li>
      <strong>${item.step}. ${escapeHtml(item.name)}</strong><br>
      Pago recomendado: ${formatter(item.payment)}
      <small>${escapeHtml(item.reason)}</small>
    </li>
  `).join("");
  const parallelCopy = (plan.parallelAccounts || []).length >= 2
    ? `<p style="margin:0;">Si prefieres atacar dos juntas: ${plan.parallelAccounts.map((item) => `${escapeHtml(item.name)} con ${formatter(item.recommendedPayment)}`).join(" y ")}.</p>`
    : "";
  const cuts = (plan.expenseCuts || []).map((item) => `
    <li>
      <strong>${escapeHtml(item.title)}</strong>
      <small>${escapeHtml(item.text)}</small>
    </li>
  `).join("");
  const warnings = (plan.warnings || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");

  content.innerHTML = `
    <h2 style="margin-top:0;font-family:'Cormorant Garamond', serif;font-size:2rem;">Plan ${escapeHtml(plan.label)}</h2>
    <p>${escapeHtml(plan.description)}</p>
    <div class="drawer-block">
      <strong>Capacidad usada:</strong> ${formatter(plan.capacity)}<br>
      <strong>Meta elegida:</strong> ${plan.targetMonths > 0 ? `${plan.targetMonths} meses` : "Sin definir"}<br>
      <strong>Pago total necesario:</strong> ${plan.requiredMonthlyBudget > 0 ? formatter(plan.requiredMonthlyBudget) : "Define plazo"}<br>
      <strong>Deuda total:</strong> ${formatter(plan.totalDebt)}<br>
      <strong>Salida estimada:</strong> ${plan.projectedMonths ? `${plan.projectedMonths} meses aprox.` : "Sin proyeccion"}
    </div>
    <div class="drawer-block">
      <h3>Prioridad sugerida</h3>
      <p style="margin:0;">${plan.focusAccount ? `${escapeHtml(plan.focusAccount.name)} · ${formatter(plan.focusAccount.recommendedPayment)}` : "Sin prioridad activa."}</p>
    </div>
    <div class="drawer-block">
      <h3>Orden de ataque</h3>
      <ul class="drawer-list">${sequenceItems || '<li>Completa modo, monto y plazo para ver el orden recomendado.</li>'}</ul>
      ${parallelCopy}
    </div>
    <div class="drawer-block">
      <h3>Asignaciones sugeridas</h3>
      <ul class="drawer-list">${allocations || '<li>Sin deudas activas en este momento.</li>'}</ul>
    </div>
    <div class="drawer-block">
      <h3>Recortes sugeridos</h3>
      <ul class="drawer-list">${cuts || '<li>Sin sugerencias todavia.</li>'}</ul>
    </div>
    ${(warnings ? `<div class="drawer-block"><h3>Alertas</h3><ul class="drawer-list">${warnings}</ul></div>` : "")}
  `;

  drawer.classList.add("active");
  overlay.classList.add("active");
  drawer.setAttribute("aria-hidden", "false");
}

function renderAnalysisPage() {
  if (!window.FlexiwayFinance) return;
  const summary = window.FlexiwayFinance.getExpenseSummary();
  const breakdown = summary.breakdown;
  const formatter = window.FlexiwayFinance.formatCurrency;
  const activePlan = window.FlexiwayFinance.getActiveDebtActionPlan({
    capacityOverride: window.FlexiwayFinance.getDebtPaymentCapacity(),
    targetMonthsOverride: window.FlexiwayFinance.getDebtTargetMonths()
  });
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

  const planMode = document.getElementById("analysisPlanMode");
  if (planMode) {
    planMode.textContent = activePlan?.capacity > 0 && activePlan?.targetMonths > 0
      ? `${activePlan.label} · ${activePlan.strategy} · meta ${activePlan.targetMonths} meses`
      : "Todavia no hay una estrategia aplicada.";
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
    debtPressure.textContent = activePlan?.requiredMonthlyBudget > 0
      ? `${formatter(activePlan.requiredMonthlyBudget)} al mes`
      : "Sin capacidad definida";
  }

  const debtPressureDetail = document.getElementById("analysisDebtPressureDetail");
  if (debtPressureDetail) {
    debtPressureDetail.textContent = activePlan?.projectedMonths
      ? `Con ${formatter(activePlan.capacity)} al mes, tu salida estimada es de ${activePlan.projectedMonths} meses.`
      : activePlan?.requiredMonthlyBudget > 0
        ? `Para cumplir la meta de ${activePlan.targetMonths} meses necesitas ${formatter(activePlan.requiredMonthlyBudget)} al mes.`
        : "Define modo, abono mensual y plazo en Creditos para proyectar salida.";
  }

  const expenseCut = document.getElementById("analysisExpenseCut");
  if (expenseCut) {
    expenseCut.textContent = expenseCuts[0]?.title || "Sigue registrando movimientos";
  }

  const expenseCutDetail = document.getElementById("analysisExpenseCutDetail");
  if (expenseCutDetail) {
    expenseCutDetail.textContent = expenseCuts[0]?.text || "La app te mostrara oportunidades para liberar efectivo.";
  }

  const openPlanButton = document.getElementById("openAnalysisPlan");
  if (openPlanButton) {
    openPlanButton.onclick = () => renderAnalysisPlanDrawer(activePlan, formatter);
  }

  const closePlanButton = document.getElementById("closeAnalysisPlan");
  if (closePlanButton) {
    closePlanButton.onclick = () => renderAnalysisPlanDrawer(null, formatter);
  }

  const planOverlay = document.getElementById("analysisPlanOverlay");
  if (planOverlay) {
    planOverlay.onclick = () => renderAnalysisPlanDrawer(null, formatter);
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

document.addEventListener("DOMContentLoaded", async () => {
  if (window.FlexiwayFinance?.ensureSessionReady) {
    await window.FlexiwayFinance.ensureSessionReady();
  }
  renderAnalysisPage();
});
window.addEventListener("flexiway:data-updated", renderAnalysisPage);
window.addEventListener("flexiway:session-changed", renderAnalysisPage);
