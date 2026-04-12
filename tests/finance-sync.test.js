const test = require("node:test");
const assert = require("node:assert/strict");

const { createFinanceApp, createSupabaseMock } = require("./helpers/finance-test-env");

const AUTH_USER = {
	id: "user-123",
	email: "ana@example.com",
	user_metadata: {
		name: "Ana"
	}
};

function createRemoteFinanceApp(tables) {
	const mock = createSupabaseMock({
		authUser: AUTH_USER,
		tables
	});
	const app = createFinanceApp({
		fakeTimers: true,
		supabaseConfig: {
			url: "https://demo.supabase.co",
			anonKey: "anon-key",
			siteUrl: "https://flexiway.test"
		},
		supabaseFactory: () => mock.client
	});
	return {
		...app,
		mock
	};
}

async function flushScheduledWork(window, limit) {
	const timers = window.__timers;
	if (!timers) return 0;
	const maxSteps = Number.isFinite(limit) ? limit : 20;
	let total = 0;

	async function flushMicrotasks() {
		for (let index = 0; index < 12; index += 1) {
			await Promise.resolve();
		}
	}

	for (let step = 0; step < maxSteps; step += 1) {
		const flushed = timers.flushNext();
		await flushMicrotasks();
		if (!flushed) {
			if (timers.getPendingTimers().length === 0) break;
			continue;
		}
		total += 1;
	}
	return total;
}

test("hydrateRemoteState carga perfil, items y pagos remotos en almacenamiento local", async () => {
	const { finance, mock } = createRemoteFinanceApp({
		user_profiles: {
			selectMaybeSingle: {
				data: {
					user_id: AUTH_USER.id,
					name: "Ana",
					email: AUTH_USER.email,
					currency: "USD",
					budget: 32000,
					credit_due_in_days: 3,
					possible_savings: 6000,
					debts: 14000,
					debt_payment_capacity: 2500,
					debt_target_months: 9,
					debt_strategy_mode: "aggressive",
					debt_plan_favorites: [{ id: "fav-1", label: "Plan rem." }]
				},
				error: null
			}
		},
		finance_items: {
			selectOrdered: {
				data: [
					{
						item_key: "debt-1",
						category: "debts",
						name: "Tarjeta Visa",
						amount: 14000,
						original_amount: 18000,
						minimum_payment: 1200,
						paid_amount: 4000,
						rate: 42,
						due_date: "2026-04-20",
						event_date: "2026-01-10",
						status: "active",
						details: {
							id: "debt-1",
							nombre: "Tarjeta Visa",
							monto: 14000,
							originalMonto: 18000,
							pagoMinimo: 1200,
							tasa: 42,
							fechaPago: "2026-04-20"
						}
					}
				],
				error: null
			}
		},
		finance_item_payments: {
			selectOrdered: {
				data: [
					{
						payment_key: "pay-1",
						item_key: "debt-1",
						category: "debts",
						amount: 1500,
						payment_date: "2026-03-15",
						note: "Abono remoto",
						previous_amount: 15500,
						remaining_amount: 14000,
						payment_type: "partial"
					}
				],
				error: null
			}
		}
	});

	await finance.ensureSessionReady();

	const user = finance.getCurrentUser();
	const data = finance.getFinancialData();
	const debts = finance.getCollection(finance.STORAGE_KEYS.debts);

	assert.equal(user.email, AUTH_USER.email);
	assert.equal(data.budget, 32000);
	assert.equal(data.debtPaymentCapacity, 2500);
	assert.equal(finance.getCurrencyPreference(), "USD");
	assert.equal(finance.getDebtPlanFavorites().length, 1);
	assert.equal(debts.length, 1);
	assert.equal(debts[0].paymentHistory.length, 1);
	assert.equal(debts[0].paymentHistory[0].id, "pay-1");
	assert.equal(finance.getSyncStatus().state, "synced");
	assert.ok(mock.operations.some((entry) => entry.table === "finance_items" && entry.action === "selectOrdered"));
});

test("persistRemoteState envia perfil, items y pagos al cliente Supabase", async () => {
	const profileCalls = [];
	const itemCalls = [];
	const paymentCalls = [];

	const { finance } = createRemoteFinanceApp({
		user_profiles: {
			selectMaybeSingle: { data: null, error: null },
			upsert(payload) {
				profileCalls.push(payload.payload);
				return { data: null, error: null };
			}
		},
		finance_items: {
			selectOrdered: { data: [], error: null },
			upsert(payload) {
				itemCalls.push(payload.payload);
				return { data: null, error: null };
			},
			delete: { data: null, error: null }
		},
		finance_item_payments: {
			selectOrdered: { data: [], error: null },
			upsert(payload) {
				paymentCalls.push(payload.payload);
				return { data: null, error: null };
			},
			delete: { data: null, error: null }
		}
	});

	await finance.ensureSessionReady();
	finance.saveFinancialData({
		budget: 28000,
		creditDueInDays: 5,
		possibleSavings: 4500,
		debts: 18000,
		debtTargetMonths: 12,
		debtStrategyMode: "medium",
		currency: "EUR"
	});
	finance.saveDebtPaymentCapacity(2200);
	finance.saveCollection(finance.STORAGE_KEYS.debts, [
		{
			id: "debt-remote-1",
			nombre: "Prestamo remoto",
			monto: 9000,
			originalMonto: 12000,
			pagoMinimo: 700,
			tasa: 24,
			fechaPago: "2026-04-25",
			paymentHistory: [
				{
					id: "pay-remote-1",
					amount: 1000,
					date: "2026-04-01",
					note: "Pago inicial",
					previousAmount: 10000,
					remainingAmount: 9000,
					type: "partial"
				}
			]
		}
	]);

	await finance.persistRemoteState();

	assert.equal(profileCalls.length, 1);
	assert.equal(profileCalls[0].user_id, AUTH_USER.id);
	assert.equal(profileCalls[0].currency, "EUR");
	assert.equal(profileCalls[0].debt_payment_capacity, 2200);
	assert.equal(profileCalls[0].debt_target_months, 12);
	assert.equal(itemCalls.length, 1);
	assert.equal(itemCalls[0].length, 1);
	assert.equal(itemCalls[0][0].item_key, "debt-remote-1");
	assert.equal(itemCalls[0][0].minimum_payment, 700);
	assert.equal(paymentCalls.length, 1);
	assert.equal(paymentCalls[0].length, 1);
	assert.equal(paymentCalls[0][0].payment_key, "pay-remote-1");
	assert.equal(finance.getSyncStatus().state, "synced");
});

test("persistRemoteState hace fallback a delete más insert cuando upsert remoto falla por conflicto", async () => {
	const itemInsertCalls = [];
	const paymentInsertCalls = [];

	const { finance, mock } = createRemoteFinanceApp({
		user_profiles: {
			selectMaybeSingle: { data: null, error: null },
			upsert: { data: null, error: null }
		},
		finance_items: {
			selectOrdered: { data: [], error: null },
			upsert: { data: null, error: { message: "duplicate key value violates unique constraint" } },
			delete: { data: null, error: null },
			insert(payload) {
				itemInsertCalls.push(payload.payload);
				return { data: null, error: null };
			}
		},
		finance_item_payments: {
			selectOrdered: { data: [], error: null },
			upsert: { data: null, error: { message: "on conflict do update command cannot affect row a second time" } },
			delete: { data: null, error: null },
			insert(payload) {
				paymentInsertCalls.push(payload.payload);
				return { data: null, error: null };
			}
		}
	});

	await finance.ensureSessionReady();
	finance.saveCollection(finance.STORAGE_KEYS.debts, [
		{
			id: "debt-fallback-1",
			nombre: "Tarjeta fallback",
			monto: 5000,
			originalMonto: 7000,
			pagoMinimo: 400,
			paymentHistory: [
				{
					id: "pay-fallback-1",
					amount: 800,
					date: "2026-04-10",
					remainingAmount: 5000,
					previousAmount: 5800,
					type: "partial"
				}
			]
		}
	]);

	await finance.persistRemoteState();

	assert.equal(itemInsertCalls.length, 1);
	assert.equal(itemInsertCalls[0].length, 1);
	assert.equal(itemInsertCalls[0][0].item_key, "debt-fallback-1");
	assert.equal(paymentInsertCalls.length, 1);
	assert.equal(paymentInsertCalls[0].length, 1);
	assert.equal(paymentInsertCalls[0][0].payment_key, "pay-fallback-1");
	assert.ok(mock.operations.some((entry) => entry.table === "finance_items" && entry.action === "delete"));
	assert.ok(mock.operations.some((entry) => entry.table === "finance_item_payments" && entry.action === "delete"));
	assert.equal(finance.getSyncStatus().state, "synced");
});

test("dispatchDataUpdate deja diagnostico util cuando falla la sync por schema o RLS", async () => {
	const { finance, window } = createRemoteFinanceApp({
		user_profiles: {
			selectMaybeSingle: { data: null, error: null },
			upsert: {
				data: null,
				error: {
					message: 'column "debt_target_months" does not exist',
					code: "42703"
				}
			}
		},
		finance_items: {
			selectOrdered: { data: [], error: null }
		},
		finance_item_payments: {
			selectOrdered: { data: [], error: null }
		}
	});

	await finance.ensureSessionReady();
	finance.saveFinancialData({
		budget: 18000,
		debtTargetMonths: 7
	});
	finance.dispatchDataUpdate();
	await flushScheduledWork(window, 4);

	const status = finance.getSyncStatus();
	const diagnostic = finance.getSyncDiagnostics();

	assert.equal(status.state, "error");
	assert.match(status.message, /supabase/i);
	assert.ok(diagnostic);
	assert.equal(diagnostic.source, "persistRemoteState");
	assert.match(diagnostic.message, /debt_target_months/i);
	assert.match(diagnostic.hint, /schema\.sql|migracion|RLS/i);
});

test("dispatchDataUpdate programa reintentos y conserva guardado local cuando Supabase falla temporalmente", async () => {
	let attemptCount = 0;
	const { finance, window } = createRemoteFinanceApp({
		user_profiles: {
			selectMaybeSingle: { data: null, error: null },
			upsert() {
				attemptCount += 1;
				return {
					data: null,
					error: {
						message: "network timeout while reaching Supabase"
					}
				};
			}
		},
		finance_items: {
			selectOrdered: { data: [], error: null }
		},
		finance_item_payments: {
			selectOrdered: { data: [], error: null }
		}
	});

	await finance.ensureSessionReady();
	finance.saveFinancialData({ budget: 21000 });
	finance.dispatchDataUpdate();
	await flushScheduledWork(window, 4);

	let status = finance.getSyncStatus();
	let diagnostic = finance.getSyncDiagnostics();

	assert.equal(attemptCount, 3);
	assert.equal(status.state, "error");
	assert.match(status.message, /no se pudo sincronizar por ahora/i);
	assert.ok(diagnostic);
	assert.match(diagnostic.hint, /conexion|supabase/i);
	assert.ok(window.__timers.getPendingTimers().length === 0);
	assert.equal(finance.getSyncStatus().state, "error");
});