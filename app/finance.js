const FlexiwayFinance = (() => {
	const STORAGE_KEYS = {
		incomes: "ingresos",
		cards: "tarjetasCredito",
		loans: "prestamos",
		services: "servicios",
		debts: "deudas",
		custom: "customCats",
		financialData: "financialData",
		user: "flexiwayUser",
		session: "flexiwaySession"
	};

	const CATEGORY_STORAGE_MAP = {
		incomes: STORAGE_KEYS.incomes,
		cards: STORAGE_KEYS.cards,
		loans: STORAGE_KEYS.loans,
		services: STORAGE_KEYS.services,
		debts: STORAGE_KEYS.debts,
		custom: STORAGE_KEYS.custom
	};

	const CURRENCY_CONFIG = {
		DOP: { locale: "es-DO", label: "Peso dominicano" },
		USD: { locale: "en-US", label: "Dolar estadounidense" },
		EUR: { locale: "es-ES", label: "Euro" }
	};

	const EXPENSE_GROUPS = [
		{ key: "cards", label: "Tarjetas", storageKey: STORAGE_KEYS.cards, color: "#ffd6e0", dateFields: ["fechaCorte", "fechaPago", "fecha"] },
		{ key: "loans", label: "Prestamos", storageKey: STORAGE_KEYS.loans, color: "#c7ceea", dateFields: ["fechaPago", "fecha"] },
		{ key: "services", label: "Servicios", storageKey: STORAGE_KEYS.services, color: "#b5ead7", dateFields: ["fechaPago", "fecha"] },
		{ key: "debts", label: "Deudas", storageKey: STORAGE_KEYS.debts, color: "#f4a261", dateFields: ["fechaPago", "fecha"] },
		{ key: "custom", label: "Personalizado", storageKey: STORAGE_KEYS.custom, color: "#fdfd96", dateFields: ["fecha"] }
	];

	const backendState = {
		client: null,
		libraryPromise: null,
		clientPromise: null,
		syncTimeout: null,
		hydrationPromise: null
	};

	function readJSON(key, fallback) {
		try {
			const raw = localStorage.getItem(key);
			return raw ? JSON.parse(raw) : fallback;
		} catch (error) {
			return fallback;
		}
	}

	function writeJSON(key, value) {
		localStorage.setItem(key, JSON.stringify(value));
	}

	function toNumber(value) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}

	function normalizeCurrency(value) {
		const code = String(value || "").trim().toUpperCase();
		return CURRENCY_CONFIG[code] ? code : "DOP";
	}

	function getBackendConfig() {
		const config = window.FLEXIWAY_SUPABASE_CONFIG || {};
		const url = String(config.url || "").trim();
		const anonKey = String(config.anonKey || "").trim();
		return {
			enabled: Boolean(url && anonKey),
			url,
			anonKey
		};
	}

	function isBackendConfigured() {
		return getBackendConfig().enabled;
	}

	function ensureSupabaseLibrary() {
		if (!isBackendConfigured()) return Promise.resolve(null);
		if (window.supabase && typeof window.supabase.createClient === "function") {
			return Promise.resolve(window.supabase);
		}
		if (backendState.libraryPromise) return backendState.libraryPromise;

		backendState.libraryPromise = new Promise((resolve, reject) => {
			const existing = document.querySelector('script[data-flexiway-supabase="true"]');
			if (existing) {
				existing.addEventListener("load", () => resolve(window.supabase || null), { once: true });
				existing.addEventListener("error", () => reject(new Error("No se pudo cargar Supabase.")), { once: true });
				return;
			}

			const script = document.createElement("script");
			script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
			script.async = true;
			script.dataset.flexiwaySupabase = "true";
			script.onload = () => resolve(window.supabase || null);
			script.onerror = () => reject(new Error("No se pudo cargar Supabase."));
			document.head.appendChild(script);
		});

		return backendState.libraryPromise;
	}

	async function getSupabaseClient() {
		if (!isBackendConfigured()) return null;
		if (backendState.client) return backendState.client;
		if (backendState.clientPromise) return backendState.clientPromise;

		backendState.clientPromise = ensureSupabaseLibrary().then((library) => {
			if (!library || typeof library.createClient !== "function") return null;
			const config = getBackendConfig();
			backendState.client = library.createClient(config.url, config.anonKey, {
				auth: {
					autoRefreshToken: true,
					persistSession: true,
					detectSessionInUrl: true
				}
			});
			return backendState.client;
		});

		return backendState.clientPromise;
	}

	function getStoredFinancialData() {
		return readJSON(STORAGE_KEYS.financialData, {}) || {};
	}

	function getCurrencyPreference() {
		const stored = getStoredFinancialData();
		return normalizeCurrency(stored.currency);
	}

	function getCurrencyConfig() {
		const currency = getCurrencyPreference();
		return {
			currency,
			...CURRENCY_CONFIG[currency]
		};
	}

	function formatCurrency(value) {
		const settings = getCurrencyConfig();
		return new Intl.NumberFormat(settings.locale, {
			style: "currency",
			currency: settings.currency,
			maximumFractionDigits: 0
		}).format(toNumber(value));
	}

	function formatPercent(value) {
		return `${toNumber(value).toFixed(1)}%`;
	}

	function getCollection(storageKey) {
		const items = readJSON(storageKey, []);
		return Array.isArray(items) ? items : [];
	}

	function getCollections() {
		return {
			incomes: getCollection(STORAGE_KEYS.incomes),
			cards: getCollection(STORAGE_KEYS.cards),
			loans: getCollection(STORAGE_KEYS.loans),
			services: getCollection(STORAGE_KEYS.services),
			debts: getCollection(STORAGE_KEYS.debts),
			custom: getCollection(STORAGE_KEYS.custom)
		};
	}

	function sumAmounts(items) {
		return items.reduce((total, item) => total + toNumber(item.monto), 0);
	}

	function getExpenseBreakdown() {
		const collections = getCollections();
		return EXPENSE_GROUPS.map((group) => {
			const items = collections[group.key] || [];
			return {
				...group,
				items,
				total: sumAmounts(items)
			};
		});
	}

	function getExpenseSummary() {
		const breakdown = getExpenseBreakdown();
		const totals = breakdown.reduce((accumulator, item) => {
			accumulator[item.key] = item.total;
			return accumulator;
		}, {});
		const totalExpenses = breakdown.reduce((accumulator, item) => accumulator + item.total, 0);
		return {
			breakdown,
			totals,
			totalExpenses
		};
	}

	function getTotalIncome() {
		return sumAmounts(getCollections().incomes);
	}

	function parseDate(value) {
		if (!value) return null;
		const parsed = new Date(`${value}T00:00:00`);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}

	function daysUntil(dateValue) {
		const target = parseDate(dateValue);
		if (!target) return null;
		const now = new Date();
		now.setHours(0, 0, 0, 0);
		const diffMs = target.getTime() - now.getTime();
		return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
	}

	function getNextDueAccount() {
		const creditAccounts = [];
		getCollection(STORAGE_KEYS.cards).forEach((item) => {
			creditAccounts.push({
				type: "Tarjeta",
				name: item.nombre || "Tarjeta",
				amount: toNumber(item.monto),
				rate: toNumber(item.tasa),
				dueDate: item.fechaCorte || item.fechaPago || item.fecha || ""
			});
		});
		getCollection(STORAGE_KEYS.loans).forEach((item) => {
			creditAccounts.push({
				type: "Prestamo",
				name: item.nombre || "Prestamo",
				amount: toNumber(item.monto),
				rate: toNumber(item.tasa),
				dueDate: item.fechaPago || item.fecha || ""
			});
		});
		getCollection(STORAGE_KEYS.debts).forEach((item) => {
			creditAccounts.push({
				type: "Deuda",
				name: item.nombre || "Deuda",
				amount: toNumber(item.monto),
				rate: toNumber(item.tasa),
				dueDate: item.fechaPago || item.fecha || ""
			});
		});

		const withDueDays = creditAccounts
			.map((account) => ({ ...account, dueInDays: daysUntil(account.dueDate) }))
			.filter((account) => account.dueInDays !== null)
			.sort((left, right) => left.dueInDays - right.dueInDays);

		return withDueDays[0] || null;
	}

	function getFinancialData() {
		const stored = getStoredFinancialData();
		const income = getTotalIncome();
		const expenseSummary = getExpenseSummary();
		const totalExpenses = expenseSummary.totalExpenses;
		const nextDue = getNextDueAccount();
		const explicitBudget = toNumber(stored.budget);
		const explicitSavings = toNumber(stored.possibleSavings);
		const explicitDebts = toNumber(stored.debts);

		const budget = explicitBudget > 0 ? explicitBudget : Math.max(income, totalExpenses);
		const possibleSavings = income > 0 ? Math.max(income - totalExpenses, 0) : explicitSavings;
		const debtLoad = expenseSummary.totals.debts > 0 ? expenseSummary.totals.debts : explicitDebts;

		return {
			spent: totalExpenses,
			budget,
			creditDueInDays: nextDue ? Math.max(nextDue.dueInDays, 0) : toNumber(stored.creditDueInDays),
			possibleSavings,
			debts: debtLoad,
			income,
			nextDueAccount: nextDue,
			expenseSummary
		};
	}

	function getRegisteredUser() {
		return readJSON(STORAGE_KEYS.user, null);
	}

	function saveSessionCache(user) {
		if (!user) {
			localStorage.removeItem(STORAGE_KEYS.session);
			if (isBackendConfigured()) {
				localStorage.removeItem(STORAGE_KEYS.user);
			}
			window.dispatchEvent(new CustomEvent("flexiway:session-changed"));
			return;
		}

		const profile = {
			id: user.id || user.user_id || null,
			name: user.name || user.user_metadata?.name || user.email?.split("@")[0] || "Usuario",
			email: user.email || ""
		};
		const existing = readJSON(STORAGE_KEYS.user, null);
		const mergedProfile = existing && existing.email === profile.email
			? { ...existing, ...profile }
			: profile;

		writeJSON(STORAGE_KEYS.user, mergedProfile);
		writeJSON(STORAGE_KEYS.session, {
			email: mergedProfile.email,
			userId: mergedProfile.id,
			loggedAt: new Date().toISOString()
		});
		window.dispatchEvent(new CustomEvent("flexiway:session-changed"));
	}

	function getCurrentUser() {
		const session = readJSON(STORAGE_KEYS.session, null);
		const user = getRegisteredUser();
		if (!session || !user) return null;
		if (session.email && user.email && session.email !== user.email) return null;
		return user;
	}

	function getStorageSnapshot() {
		return {
			incomes: getCollection(STORAGE_KEYS.incomes),
			cards: getCollection(STORAGE_KEYS.cards),
			loans: getCollection(STORAGE_KEYS.loans),
			services: getCollection(STORAGE_KEYS.services),
			debts: getCollection(STORAGE_KEYS.debts),
			custom: getCollection(STORAGE_KEYS.custom),
			financialData: getStoredFinancialData(),
			user: getRegisteredUser()
		};
	}

	function mapCollectionItem(category, item) {
		return {
			category,
			name: item.nombre || item.descripcion || category,
			amount: toNumber(item.monto),
			rate: item.tasa === null || item.tasa === undefined || item.tasa === "" ? null : toNumber(item.tasa),
			due_date: item.fechaPago || item.fechaCorte || null,
			event_date: item.fecha || item.fechaPago || item.fechaCorte || null,
			details: item
		};
	}

	function writeCollectionsToLocal(snapshot) {
		Object.entries(CATEGORY_STORAGE_MAP).forEach(([category, storageKey]) => {
			writeJSON(storageKey, snapshot[category] || []);
		});
		writeJSON(STORAGE_KEYS.financialData, snapshot.financialData || {});
	}

	function buildRemoteSnapshot(profileRow, itemRows) {
		const snapshot = {
			incomes: [],
			cards: [],
			loans: [],
			services: [],
			debts: [],
			custom: [],
			financialData: {
				budget: toNumber(profileRow?.budget),
				creditDueInDays: toNumber(profileRow?.credit_due_in_days),
				possibleSavings: toNumber(profileRow?.possible_savings),
				debts: toNumber(profileRow?.debts),
				currency: normalizeCurrency(profileRow?.currency)
			}
		};

		(itemRows || []).forEach((row) => {
			const category = row.category;
			if (!snapshot[category]) return;
			const original = row.details && typeof row.details === "object" ? row.details : {};
			snapshot[category].push({
				...original,
				nombre: original.nombre || row.name || undefined,
				descripcion: original.descripcion || row.name || undefined,
				monto: toNumber(original.monto ?? row.amount),
				tasa: original.tasa ?? row.rate,
				fecha: original.fecha || row.event_date || undefined,
				fechaPago: original.fechaPago || row.due_date || undefined,
				fechaCorte: original.fechaCorte || row.due_date || undefined
			});
		});

		return snapshot;
	}

	function hasMeaningfulSnapshot(snapshot) {
		if (!snapshot) return false;
		const hasItems = Object.keys(CATEGORY_STORAGE_MAP).some((category) => (snapshot[category] || []).length > 0);
		const financialData = snapshot.financialData || {};
		const hasFinancialState = ["budget", "creditDueInDays", "possibleSavings", "debts"]
			.some((key) => toNumber(financialData[key]) > 0);
		return hasItems || hasFinancialState;
	}

	async function hydrateRemoteState() {
		if (!isBackendConfigured()) return null;
		if (backendState.hydrationPromise) return backendState.hydrationPromise;

		backendState.hydrationPromise = (async () => {
			const client = await getSupabaseClient();
			if (!client) return null;

			const { data: authData } = await client.auth.getUser();
			const authUser = authData?.user;
			if (!authUser) {
				saveSessionCache(null);
				return null;
			}

			saveSessionCache(authUser);

			const [{ data: profileRow }, { data: itemRows }] = await Promise.all([
				client.from("user_profiles").select("*").eq("user_id", authUser.id).maybeSingle(),
				client.from("finance_items").select("category,name,amount,rate,due_date,event_date,details").eq("user_id", authUser.id).order("created_at", { ascending: true })
			]);

			const snapshot = buildRemoteSnapshot(profileRow, itemRows || []);
			const localSnapshot = getStorageSnapshot();
			if (!profileRow && (!itemRows || itemRows.length === 0) && hasMeaningfulSnapshot(localSnapshot)) {
				await persistRemoteState();
				window.dispatchEvent(new CustomEvent("flexiway:data-updated", { detail: getFinancialData() }));
				return localSnapshot;
			}
			writeCollectionsToLocal(snapshot);
			window.dispatchEvent(new CustomEvent("flexiway:data-updated", { detail: getFinancialData() }));
			return snapshot;
		})();

		try {
			return await backendState.hydrationPromise;
		} finally {
			backendState.hydrationPromise = null;
		}
	}

	async function persistRemoteState() {
		if (!isBackendConfigured()) return;
		const client = await getSupabaseClient();
		if (!client) return;

		const { data: authData } = await client.auth.getUser();
		const authUser = authData?.user;
		if (!authUser) return;

		const snapshot = getStorageSnapshot();
		const financialData = snapshot.financialData || {};
		await client.from("user_profiles").upsert({
			user_id: authUser.id,
			name: snapshot.user?.name || authUser.user_metadata?.name || authUser.email?.split("@")[0] || "Usuario",
			email: authUser.email,
			currency: normalizeCurrency(financialData.currency),
			budget: toNumber(financialData.budget),
			credit_due_in_days: toNumber(financialData.creditDueInDays),
			possible_savings: toNumber(financialData.possibleSavings),
			debts: toNumber(financialData.debts),
			updated_at: new Date().toISOString()
		}, { onConflict: "user_id" });

		await client.from("finance_items").delete().eq("user_id", authUser.id);

		const itemRows = [];
		Object.keys(CATEGORY_STORAGE_MAP).forEach((category) => {
			(snapshot[category] || []).forEach((item) => {
				itemRows.push({
					user_id: authUser.id,
					...mapCollectionItem(category, item)
				});
			});
		});

		if (itemRows.length > 0) {
			await client.from("finance_items").insert(itemRows);
		}
	}

	function scheduleRemoteSync() {
		if (!isBackendConfigured()) return;
		window.clearTimeout(backendState.syncTimeout);
		backendState.syncTimeout = window.setTimeout(() => {
			persistRemoteState().catch((error) => {
				console.error("No se pudo sincronizar con Supabase.", error);
			});
		}, 500);
	}

	function saveFinancialData(data) {
		const current = getStoredFinancialData();
		const payload = {
			...current,
			budget: toNumber(data.budget),
			creditDueInDays: toNumber(data.creditDueInDays),
			possibleSavings: toNumber(data.possibleSavings),
			debts: toNumber(data.debts),
			currency: normalizeCurrency(data.currency || current.currency)
		};
		writeJSON(STORAGE_KEYS.financialData, payload);
		dispatchDataUpdate();
		return getFinancialData();
	}

	function saveCurrencyPreference(currency) {
		const current = getStoredFinancialData();
		writeJSON(STORAGE_KEYS.financialData, {
			...current,
			currency: normalizeCurrency(currency)
		});
		dispatchDataUpdate();
		return getCurrencyPreference();
	}

	function generateDashboardData(data) {
		const source = data || getFinancialData();
		const spent = toNumber(source.spent);
		const budget = toNumber(source.budget);
		const possibleSavings = toNumber(source.possibleSavings);
		const debts = toNumber(source.debts);
		const remainingBudget = Math.max(budget - spent, 0);
		let creditRisk = "low";
		if (source.creditDueInDays <= 5) creditRisk = "high";
		else if (source.creditDueInDays <= 10) creditRisk = "medium";

		return {
			budgetUsage: budget > 0 ? (spent / budget) * 100 : 0,
			totalSpent: spent,
			remainingBudget,
			creditRisk,
			possibleSavings,
			debts
		};
	}

	let budgetChartInstance = null;
	function renderBudgetChart(data) {
		const canvas = document.getElementById("budgetChart");
		if (!canvas || typeof Chart === "undefined") return;
		const source = data || getFinancialData();
		const metrics = generateDashboardData(source);
		const chartData = [metrics.totalSpent, metrics.possibleSavings, metrics.debts, metrics.remainingBudget];

		if (budgetChartInstance) budgetChartInstance.destroy();

		budgetChartInstance = new Chart(canvas, {
			type: "doughnut",
			data: {
				labels: ["Gastos", "Ahorro posible", "Deudas", "Disponible"],
				datasets: [{
					data: chartData,
					backgroundColor: ["#ffd6e0", "#b5ead7", "#f4a261", "#c7ceea"],
					borderWidth: 0
				}]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: { position: "bottom" },
					tooltip: {
						callbacks: {
							label(context) {
								return `${context.label}: ${formatCurrency(context.parsed)}`;
							}
						}
					}
				}
			}
		});
	}

	function getMonthlySavingsHistory() {
		const collections = getCollections();
		const monthly = new Map();

		collections.incomes.forEach((item) => {
			const key = (item.fecha || "").slice(0, 7);
			if (!key) return;
			const entry = monthly.get(key) || { month: key, income: 0, expenses: 0 };
			entry.income += toNumber(item.monto);
			monthly.set(key, entry);
		});

		getExpenseBreakdown().forEach((group) => {
			group.items.forEach((item) => {
				const dateValue = group.dateFields.map((field) => item[field]).find(Boolean) || "";
				const key = dateValue.slice(0, 7);
				if (!key) return;
				const entry = monthly.get(key) || { month: key, income: 0, expenses: 0 };
				entry.expenses += toNumber(item.monto);
				monthly.set(key, entry);
			});
		});

		return Array.from(monthly.values())
			.sort((left, right) => left.month.localeCompare(right.month))
			.map((item) => ({
				...item,
				savings: item.income - item.expenses
			}));
	}

	function getCreditSummary() {
		const accounts = [];
		getCollection(STORAGE_KEYS.cards).forEach((item) => {
			accounts.push({ type: "Tarjeta", name: item.nombre || "Tarjeta", amount: toNumber(item.monto), rate: toNumber(item.tasa), dueDate: item.fechaCorte || item.fechaPago || "" });
		});
		getCollection(STORAGE_KEYS.loans).forEach((item) => {
			accounts.push({ type: "Prestamo", name: item.nombre || "Prestamo", amount: toNumber(item.monto), rate: toNumber(item.tasa), dueDate: item.fechaPago || "" });
		});
		getCollection(STORAGE_KEYS.debts).forEach((item) => {
			accounts.push({ type: "Deuda", name: item.nombre || "Deuda", amount: toNumber(item.monto), rate: toNumber(item.tasa), dueDate: item.fechaPago || "" });
		});

		const exposure = accounts.reduce((total, account) => total + account.amount, 0);
		const accountsWithRate = accounts.filter((account) => account.rate > 0);
		const averageRate = accountsWithRate.length > 0
			? accountsWithRate.reduce((total, account) => total + account.rate, 0) / accountsWithRate.length
			: 0;
		const nextDue = accounts
			.map((account) => ({ ...account, dueInDays: daysUntil(account.dueDate) }))
			.filter((account) => account.dueInDays !== null)
			.sort((left, right) => left.dueInDays - right.dueInDays)[0] || null;

		let risk = "Bajo";
		if (nextDue && nextDue.dueInDays <= 5) risk = "Alto";
		else if (nextDue && nextDue.dueInDays <= 10) risk = "Medio";

		return {
			accounts,
			exposure,
			averageRate,
			nextDue,
			risk
		};
	}

	async function signUpUser(userData) {
		const payload = {
			name: (userData.name || "Usuario").trim(),
			email: (userData.email || "").trim().toLowerCase(),
			password: userData.password || ""
		};

		if (isBackendConfigured()) {
			const client = await getSupabaseClient();
			const { data, error } = await client.auth.signUp({
				email: payload.email,
				password: payload.password,
				options: {
					data: { name: payload.name }
				}
			});

			if (error) return { ok: false, message: error.message };

			if (data?.user) {
				saveSessionCache({ ...data.user, name: payload.name });
				await hydrateRemoteState();
			}

			return {
				ok: true,
				user: getCurrentUser(),
				requiresEmailConfirmation: !data?.session
			};
		}

		writeJSON(STORAGE_KEYS.user, payload);
		saveSessionCache(payload);
		return { ok: true, user: payload, requiresEmailConfirmation: false };
	}

	async function loginUser(email, password) {
		if (isBackendConfigured()) {
			const client = await getSupabaseClient();
			const { data, error } = await client.auth.signInWithPassword({
				email: String(email || "").trim().toLowerCase(),
				password
			});

			if (error) return { ok: false, message: error.message };
			saveSessionCache(data?.user);
			await hydrateRemoteState();
			return { ok: true, user: getCurrentUser() };
		}

		const user = getRegisteredUser();
		if (!user) {
			return { ok: false, message: "Primero crea una cuenta." };
		}
		if (user.email !== String(email || "").trim().toLowerCase() || user.password !== password) {
			return { ok: false, message: "Email o contrasena incorrectos." };
		}
		saveSessionCache(user);
		return { ok: true, user };
	}

	async function logoutUser() {
		if (isBackendConfigured()) {
			const client = await getSupabaseClient();
			if (client) await client.auth.signOut();
		}
		saveSessionCache(null);
	}

	function dispatchDataUpdate() {
		scheduleRemoteSync();
		window.dispatchEvent(new CustomEvent("flexiway:data-updated", {
			detail: getFinancialData()
		}));
	}

	async function initBackendSession() {
		if (!isBackendConfigured()) return;
		const client = await getSupabaseClient();
		if (!client) return;

		client.auth.onAuthStateChange((_event, session) => {
			if (session?.user) {
				saveSessionCache(session.user);
				hydrateRemoteState().catch((error) => console.error(error));
			} else {
				saveSessionCache(null);
			}
		});

		await hydrateRemoteState();
	}

	initBackendSession().catch((error) => {
		console.error("No se pudo inicializar Supabase.", error);
	});

	return {
		STORAGE_KEYS,
		EXPENSE_GROUPS,
		formatCurrency,
		formatPercent,
		getCurrencyPreference,
		getCurrencyConfig,
		saveCurrencyPreference,
		toNumber,
		getCollection,
		getCollections,
		getExpenseBreakdown,
		getExpenseSummary,
		getTotalIncome,
		getFinancialData,
		saveFinancialData,
		generateDashboardData,
		renderBudgetChart,
		getMonthlySavingsHistory,
		getCreditSummary,
		getCurrentUser,
		getRegisteredUser,
		signUpUser,
		loginUser,
		logoutUser,
		dispatchDataUpdate,
		persistRemoteState,
		hydrateRemoteState,
		isBackendConfigured,
		daysUntil
	};
})();

window.FlexiwayFinance = FlexiwayFinance;
window.getFinancialData = FlexiwayFinance.getFinancialData;
window.generateDashboardData = FlexiwayFinance.generateDashboardData;
window.renderBudgetChart = FlexiwayFinance.renderBudgetChart;
