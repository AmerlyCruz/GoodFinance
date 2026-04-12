const test = require("node:test");
const assert = require("node:assert/strict");

const { createFinanceApp } = require("./helpers/finance-test-env");

async function createAuthenticatedFinanceApp() {
	const app = createFinanceApp();
	await app.finance.signUpUser({
		name: "Ana",
		email: "ana@example.com",
		password: "secret123"
	});
	return app;
}

test("registro local crea sesion y usuario actual", async () => {
	const { finance } = createFinanceApp();
	const result = await finance.signUpUser({
		name: "Ana",
		email: "ana@example.com",
		password: "secret123"
	});

	assert.equal(result.ok, true);
	assert.equal(result.requiresEmailConfirmation, false);
	assert.equal(finance.getCurrentUser().email, "ana@example.com");
	assert.equal(finance.getCurrentUser().name, "Ana");
});

test("login local falla con credenciales incorrectas", async () => {
	const { finance } = await createAuthenticatedFinanceApp();
	await finance.logoutUser();

	const result = await finance.loginUser("ana@example.com", "bad-password");
	assert.equal(result.ok, false);
	assert.match(result.message, /incorrectos/i);
});

test("preferencias financieras persisten y alimentan el resumen", async () => {
	const { finance } = await createAuthenticatedFinanceApp();
	finance.saveFinancialData({
		budget: 25000,
		creditDueInDays: 4,
		possibleSavings: 4000,
		debts: 12000,
		debtTargetMonths: 10,
		debtStrategyMode: "aggressive",
		currency: "USD"
	});

	const data = finance.getFinancialData();
	assert.equal(data.budget, 25000);
	assert.equal(data.creditDueInDays, 4);
	assert.equal(data.debtTargetMonths, 10);
	assert.equal(finance.getCurrencyPreference(), "USD");
	assert.equal(finance.getDebtStrategyMode(), "aggressive");
});

test("recordDebtPayment reduce saldo y agrega historial", async () => {
	const { finance } = await createAuthenticatedFinanceApp();
	finance.saveCollection(finance.STORAGE_KEYS.debts, [
		{
			nombre: "Prestamo personal",
			monto: 10000,
			pagoMinimo: 1000,
			fechaPago: "2026-04-20",
			paymentHistory: []
		}
	]);

	const result = finance.recordDebtPayment("debts", 0, {
		amount: 2500,
		date: "2026-04-12",
		note: "Abono extra"
	});

	assert.equal(result.ok, true);
	assert.equal(result.account.monto, 7500);
	assert.equal(result.account.paymentHistory.length, 1);
	assert.equal(result.account.paymentHistory[0].remainingAmount, 7500);
	assert.equal(result.account.status, "active");
});

test("plan de deuda usa capacidad y meta para construir prioridad", async () => {
	const { finance } = await createAuthenticatedFinanceApp();
	finance.saveCollection(finance.STORAGE_KEYS.debts, [
		{
			id: "debt-a",
			nombre: "Tarjeta A",
			monto: 12000,
			pagoMinimo: 800,
			tasa: 48,
			fechaPago: "2026-04-18"
		},
		{
			id: "debt-b",
			nombre: "Prestamo B",
			monto: 8000,
			pagoMinimo: 500,
			tasa: 18,
			fechaPago: "2026-04-28"
		}
	]);
	finance.saveDebtPaymentCapacity(3000);
	finance.saveDebtTargetMonths(8);
	finance.saveDebtStrategyMode("aggressive");

	const plan = finance.getActiveDebtActionPlan({
		capacityOverride: 3000,
		targetMonthsOverride: 8
	});

	assert.equal(plan.capacity, 3000);
	assert.equal(plan.targetMonths, 8);
	assert.ok(plan.requiredMonthlyBudget > 0);
	assert.ok(Array.isArray(plan.allocations));
	assert.ok(plan.allocations.length >= 2);
	assert.ok(plan.focusAccount);
	assert.match(plan.focusAccount.name, /Tarjeta A|Prestamo B/);
	assert.ok(plan.warnings.length >= 0);
});

test("favoritos de simulacion se guardan y eliminan", async () => {
	const { finance } = await createAuthenticatedFinanceApp();
	const favorites = finance.saveDebtPlanFavorite({
		label: "Plan agresivo",
		mode: "aggressive",
		capacity: 4500,
		targetMonths: 12,
		scope: "global",
		focusTargetIds: []
	});

	assert.equal(favorites.length, 1);
	assert.equal(favorites[0].label, "Plan agresivo");

	const afterDelete = finance.removeDebtPlanFavorite(favorites[0].id);
	assert.equal(afterDelete.length, 0);
});