const FlexiwayFinance = (() => {
	const STORAGE_KEYS = {
		incomes: "ingresos",
		cards: "tarjetasCredito",
		loans: "prestamos",
		services: "servicios",
		debts: "deudas",
		custom: "customCats",
		financialData: "financialData",
		syncMeta: "syncMeta",
		user: "flexiwayUser",
		session: "flexiwaySession",
		rememberedLogin: "flexiwayRememberedLogin"
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

	const DEBT_STRATEGY_MODES = ["regular", "medium", "aggressive"];

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
		syncRetryTimeout: null,
		syncAttempt: 0,
		hydrationPromise: null,
		initPromise: Promise.resolve(),
		pendingLocalChanges: false,
		lastSessionKey: "",
		lastBudgetChartKey: "",
		syncStatus: {
			state: "idle",
			message: "Listo",
			updatedAt: new Date().toISOString()
		},
		lastSyncDiagnostic: null,
		statusTimeout: null
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

	function createStableId(prefix) {
		return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	}

	function getCollectionPrefix(storageKey) {
		const mapping = {
			[STORAGE_KEYS.incomes]: "income",
			[STORAGE_KEYS.cards]: "card",
			[STORAGE_KEYS.loans]: "loan",
			[STORAGE_KEYS.services]: "service",
			[STORAGE_KEYS.debts]: "debt",
			[STORAGE_KEYS.custom]: "custom"
		};
		return mapping[storageKey] || "item";
	}

	function getFinanceOwnerKey() {
		const session = readJSON(STORAGE_KEYS.session, null);
		const owner = session?.userId || session?.email || "";
		return String(owner).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
	}

	function getScopedFinanceKey(key) {
		const owner = getFinanceOwnerKey();
		if (!owner) return "";
		return `flexiway:${owner}:${key}`;
	}

	function readFinanceJSON(key, fallback) {
		const scopedKey = getScopedFinanceKey(key);
		if (!scopedKey) return fallback;
		return readJSON(scopedKey, fallback);
	}

	function writeFinanceJSON(key, value) {
		const scopedKey = getScopedFinanceKey(key);
		if (!scopedKey) return false;
		writeJSON(scopedKey, value);
		return true;
	}

	const sessionTools = typeof window.FlexiwayCreateSessionTools === "function"
		? window.FlexiwayCreateSessionTools({
			backendState,
			STORAGE_KEYS,
			readJSON,
			writeJSON,
			isBackendConfigured
		})
		: null;

	const syncTools = typeof window.FlexiwayCreateSyncTools === "function"
		? window.FlexiwayCreateSyncTools({
			backendState,
			STORAGE_KEYS,
			readFinanceJSON,
			writeFinanceJSON,
			getPersistRemoteState: () => persistRemoteState,
			isBackendConfigured
		})
		: null;

	function toNumber(value) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}

	function normalizeCurrency(value) {
		const code = String(value || "").trim().toUpperCase();
		return CURRENCY_CONFIG[code] ? code : "DOP";
	}

	function normalizeDebtStrategyMode(value) {
		const mode = String(value || "").trim().toLowerCase();
		return DEBT_STRATEGY_MODES.includes(mode) ? mode : "medium";
	}

	function getBackendConfig() {
		const config = window.FLEXIWAY_SUPABASE_CONFIG || {};
		const url = String(config.url || "").trim();
		const anonKey = String(config.anonKey || "").trim();
		const siteUrl = String(config.siteUrl || "").trim();
		return {
			enabled: Boolean(url && anonKey),
			url,
			anonKey,
			siteUrl
		};
	}

	function getAppBaseUrl() {
		const configuredSiteUrl = getBackendConfig().siteUrl;
		if (configuredSiteUrl) return configuredSiteUrl.replace(/\/+$/, "");

		if (window.location.protocol !== "http:" && window.location.protocol !== "https:") {
			return "";
		}

		const pathname = window.location.pathname || "/";
		const lastSlashIndex = pathname.lastIndexOf("/");
		const basePath = lastSlashIndex >= 0 ? pathname.slice(0, lastSlashIndex + 1) : "/";
		return `${window.location.origin}${basePath}`.replace(/\/+$/, "");
	}

	function getEmailRedirectUrl() {
		const baseUrl = getAppBaseUrl();
		return baseUrl ? `${baseUrl}/login.html` : undefined;
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
		return readFinanceJSON(STORAGE_KEYS.financialData, {}) || {};
	}

	function normalizeDebtPlanFavorites(value) {
		if (!Array.isArray(value)) return [];
		return value
			.filter((item) => item && typeof item === "object")
			.map((item, index) => ({
				id: String(item.id || `favorite-${index + 1}`),
				label: String(item.label || "Simulacion guardada"),
				mode: normalizeDebtStrategyMode(item.mode),
				capacity: Math.max(toNumber(item.capacity), 0),
				targetMonths: Math.max(Math.round(toNumber(item.targetMonths)), 0),
				scope: ["global", "single", "duo"].includes(String(item.scope || "").toLowerCase()) ? String(item.scope).toLowerCase() : "global",
				focusTargetIds: normalizeFocusTargetIds(item.focusTargetIds || item.focusTargetId),
				createdAt: item.createdAt || new Date().toISOString()
			}))
			.slice(0, 8);
	}

	function getDebtPlanFavorites() {
		return normalizeDebtPlanFavorites(getStoredFinancialData().debtPlanFavorites);
	}

	function writeFinancialStatePatch(patch) {
		const current = getStoredFinancialData();
		writeFinanceJSON(STORAGE_KEYS.financialData, {
			...current,
			...patch
		});
		markLocalChangesPending();
		dispatchDataUpdate();
	}

	function saveDebtPlanFavorite(favorite) {
		const normalizedFavorite = normalizeDebtPlanFavorites([{ 
			id: favorite?.id || createStableId("favorite"),
			label: favorite?.label,
			mode: favorite?.mode,
			capacity: favorite?.capacity,
			targetMonths: favorite?.targetMonths,
			scope: favorite?.scope,
			focusTargetIds: favorite?.focusTargetIds || favorite?.focusTargetId,
			createdAt: favorite?.createdAt || new Date().toISOString()
		}])[0];
		const favorites = getDebtPlanFavorites().filter((item) => item.id !== normalizedFavorite.id);
		favorites.unshift(normalizedFavorite);
		writeFinancialStatePatch({ debtPlanFavorites: favorites.slice(0, 8) });
		return getDebtPlanFavorites();
	}

	function removeDebtPlanFavorite(favoriteId) {
		const favorites = getDebtPlanFavorites().filter((item) => item.id !== String(favoriteId || ""));
		writeFinancialStatePatch({ debtPlanFavorites: favorites });
		return favorites;
	}

	function getCurrencyPreference() {
		const stored = getStoredFinancialData();
		return normalizeCurrency(stored.currency);
	}

	function getMonthlyInterestRate(rate) {
		return Math.max(toNumber(rate), 0) / 1200;
	}

	function calculateRequiredMonthlyPayment(balance, annualRate, months, minimumPayment) {
		const normalizedBalance = Math.max(toNumber(balance), 0);
		const normalizedMonths = Math.max(Math.round(toNumber(months)), 0);
		const normalizedMinimum = Math.max(toNumber(minimumPayment), 0);
		if (normalizedBalance <= 0 || normalizedMonths <= 0) return 0;
		const monthlyRate = getMonthlyInterestRate(annualRate);
		let payment = normalizedBalance / normalizedMonths;
		if (monthlyRate > 0) {
			const denominator = 1 - Math.pow(1 + monthlyRate, -normalizedMonths);
			payment = denominator > 0 ? (normalizedBalance * monthlyRate) / denominator : normalizedBalance / normalizedMonths;
		}
		return Math.min(normalizedBalance, Math.max(Math.ceil(payment), normalizedMinimum));
	}

	function buildMonthlyDebtAllocation(accounts, monthlyBudget, mode, targetMonths) {
		const orderedAccounts = [...(accounts || [])].sort((left, right) => compareAccountsForPlan(mode, left, right));
		let remainingBudget = Math.max(toNumber(monthlyBudget), 0);
		const allocations = orderedAccounts.map((account) => ({
			id: account.id,
			payment: 0,
			requiredPayment: calculateRequiredMonthlyPayment(account.amount, account.rate, targetMonths, account.minimumPayment)
		}));
		const allocationById = new Map(allocations.map((item) => [item.id, item]));

		for (const account of orderedAccounts) {
			if (remainingBudget <= 0) break;
			const basePayment = Math.min(account.amount, Math.max(account.minimumPayment, 0));
			const applied = Math.min(basePayment, remainingBudget);
			allocationById.get(account.id).payment += applied;
			remainingBudget -= applied;
		}

		for (const account of orderedAccounts) {
			if (remainingBudget <= 0) break;
			const current = allocationById.get(account.id);
			const desiredExtra = Math.max(current.requiredPayment - current.payment, 0);
			if (desiredExtra <= 0) continue;
			const headroom = Math.max(account.amount - current.payment, 0);
			const applied = Math.min(desiredExtra, headroom, remainingBudget);
			current.payment += applied;
			remainingBudget -= applied;
		}

		for (const account of orderedAccounts) {
			if (remainingBudget <= 0) break;
			const current = allocationById.get(account.id);
			const headroom = Math.max(account.amount - current.payment, 0);
			if (headroom <= 0) continue;
			const applied = Math.min(headroom, remainingBudget);
			current.payment += applied;
			remainingBudget -= applied;
		}

		return orderedAccounts.map((account) => ({
			...account,
			recommendedPayment: Math.max(Math.round(toNumber(allocationById.get(account.id)?.payment)), 0),
			requiredPaymentForGoal: Math.max(Math.round(toNumber(allocationById.get(account.id)?.requiredPayment)), 0)
		}));
	}

	function simulateDebtPayoffMonths(accounts, monthlyBudget, mode) {
		const budget = Math.max(toNumber(monthlyBudget), 0);
		if (budget <= 0 || !Array.isArray(accounts) || accounts.length === 0) return null;
		const workingAccounts = accounts.map((account) => ({
			id: account.id,
			name: account.name,
			amount: Math.max(toNumber(account.amount), 0),
			minimumPayment: Math.max(toNumber(account.minimumPayment), 0),
			rate: Math.max(toNumber(account.rate), 0),
			dueInDays: account.dueInDays,
			createdAt: account.createdAt
		}));
		for (let month = 1; month <= 600; month += 1) {
			workingAccounts.forEach((account) => {
				if (account.amount <= 0) return;
				const monthlyRate = getMonthlyInterestRate(account.rate);
				if (monthlyRate > 0) {
					account.amount += account.amount * monthlyRate;
				}
			});
			const allocations = buildMonthlyDebtAllocation(workingAccounts.filter((account) => account.amount > 0), budget, mode, 0);
			if (allocations.length === 0) return null;
			let totalPaidThisMonth = 0;
			allocations.forEach((allocation) => {
				const target = workingAccounts.find((account) => account.id === allocation.id);
				if (!target) return;
				const applied = Math.min(target.amount, allocation.recommendedPayment);
				target.amount = Math.max(target.amount - applied, 0);
				totalPaidThisMonth += applied;
			});
			if (workingAccounts.every((account) => account.amount <= 1)) return month;
			if (totalPaidThisMonth <= 0) return null;
		}
		return null;
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

	const updateSyncStatus = syncTools ? syncTools.updateSyncStatus : () => backendState.syncStatus;
	const getSyncStatus = syncTools ? syncTools.getSyncStatus : () => ({ ...backendState.syncStatus });
	const setSyncDiagnostic = syncTools ? syncTools.setSyncDiagnostic : () => null;
	const getSyncDiagnostics = syncTools ? syncTools.getSyncDiagnostics : () => null;
	const getSyncMeta = syncTools ? syncTools.getSyncMeta : () => ({});
	const writeSyncMeta = syncTools ? syncTools.writeSyncMeta : () => undefined;
	const markLocalChangesPending = syncTools ? syncTools.markLocalChangesPending : () => undefined;
	const markSyncRetryPending = syncTools ? syncTools.markSyncRetryPending : () => undefined;
	const clearPendingLocalChanges = syncTools ? syncTools.clearPendingLocalChanges : () => undefined;

	function normalizeFocusTargetIds(value) {
		const values = Array.isArray(value) ? value : value ? [value] : [];
		return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean)));
	}

	function getDebtPriorityInsight(account, mode) {
		const drivers = [];
		let score = 0;
		if (account.dueInDays !== null && account.dueInDays <= 7) {
			drivers.push(`vence en ${Math.max(account.dueInDays, 0)} dias`);
			score += 35;
		}
		if (account.rate > 0) {
			drivers.push(`tasa ${account.rate.toFixed(1)}%`);
			score += Math.min(account.rate, 35);
		}
		if (mode === "regular") {
			if (account.amount <= 25000) {
				drivers.push("saldo corto para cerrarla rapido");
				score += 22;
			}
		} else if (mode === "aggressive") {
			if (account.amount >= 25000) {
				drivers.push("saldo alto que conviene bajar fuerte");
				score += 16;
			}
		} else {
			drivers.push("mezcla urgencia, costo y monto");
			score += 12;
		}
		if (drivers.length === 0) {
			drivers.push("se prioriza por orden natural del plan");
			score += 10;
		}
		return {
			score: Math.round(score),
			summary: drivers.join(", "),
			drivers
		};
	}

	function sanitizePaymentHistory(history, itemId) {
		if (!Array.isArray(history)) return [];
		return history
			.map((entry, index) => ({
				id: entry.id || `${itemId || "payment"}-${index + 1}`,
				amount: Math.max(toNumber(entry.amount), 0),
				date: entry.date || entry.fecha || getTodayDate(),
				note: String(entry.note || entry.nota || "").trim(),
				remainingAmount: Math.max(toNumber(entry.remainingAmount ?? entry.restante), 0),
				previousAmount: Math.max(toNumber(entry.previousAmount ?? entry.anterior), 0),
				type: entry.type || entry.tipo || "partial"
			}))
			.filter((entry) => entry.amount > 0)
			.sort((left, right) => String(left.date).localeCompare(String(right.date)));
	}

	function normalizeCollectionItemForStorage(storageKey, item, index) {
		if (!item || typeof item !== "object") return item;
		const normalized = { ...item };
		if (!normalized.id) {
			normalized.id = createStableId(getCollectionPrefix(storageKey));
		}
		if (!normalized.createdAt) {
			normalized.createdAt = normalized.fecha || normalized.fechaPago || normalized.fechaCorte || getTodayDate();
		}
		if ([STORAGE_KEYS.cards, STORAGE_KEYS.loans, STORAGE_KEYS.debts].includes(storageKey)) {
			normalized.paymentHistory = sanitizePaymentHistory(normalized.paymentHistory || normalized.historialPagos, normalized.id);
		}
		return normalized;
	}

	function normalizeCollectionForStorage(storageKey, items) {
		if (!Array.isArray(items)) return [];
		return items.map((item, index) => normalizeCollectionItemForStorage(storageKey, item, index));
	}

	function getCollection(storageKey) {
		const items = readFinanceJSON(storageKey, []);
		const payload = normalizeCollectionForStorage(storageKey, Array.isArray(items) ? items : []);
		if (JSON.stringify(payload) !== JSON.stringify(items || [])) {
			writeFinanceJSON(storageKey, payload);
		}
		return payload;
	}

	function saveCollection(storageKey, items, options) {
		const shouldDispatch = !options || options.dispatch !== false;
		const payload = normalizeCollectionForStorage(storageKey, Array.isArray(items) ? items : []);
		const written = writeFinanceJSON(storageKey, payload);
		if (written && shouldDispatch) {
			markLocalChangesPending();
			dispatchDataUpdate();
		}
		return written;
	}

	function getTodayDate() {
		return new Date().toISOString().slice(0, 10);
	}

	function getCreditCategoryMeta(category) {
		const mapping = {
			cards: { storageKey: STORAGE_KEYS.cards, type: "Tarjeta", dueFields: ["fechaCorte", "fechaPago", "fecha"] },
			loans: { storageKey: STORAGE_KEYS.loans, type: "Prestamo", dueFields: ["fechaPago", "fecha"] },
			debts: { storageKey: STORAGE_KEYS.debts, type: "Deuda", dueFields: ["fechaPago", "fecha"] }
		};
		return mapping[category] || null;
	}

	function getCreditCategories() {
		return ["cards", "loans", "debts"];
	}

	function normalizeCreditItem(category, item, index) {
		const meta = getCreditCategoryMeta(category);
		const raw = item && typeof item === "object" ? item : {};
		const currentAmount = Math.max(toNumber(raw.monto), 0);
		const originalAmount = Math.max(toNumber(raw.originalMonto), currentAmount);
		const minimumPayment = Math.max(toNumber(raw.pagoMinimo), 0);
		const paymentHistory = sanitizePaymentHistory(raw.paymentHistory || raw.historialPagos, raw.id || `${category}-${index}`);
		const paidAmount = paymentHistory.reduce((total, entry) => total + entry.amount, 0);
		const dueDate = meta ? meta.dueFields.map((field) => raw[field]).find(Boolean) || "" : "";
		const status = currentAmount <= 0 ? "paid" : raw.status === "paid" ? "paid" : "active";
		const createdAt = raw.createdAt || raw.fechaRegistro || dueDate || getTodayDate();

		return {
			...raw,
			id: raw.id || `${category}-${index}-${createdAt}`,
			nombre: raw.nombre || raw.descripcion || meta?.type || "Cuenta",
			monto: currentAmount,
			originalMonto: originalAmount,
			pagoMinimo: minimumPayment,
			paymentHistory,
			status,
			createdAt,
			paidAmount,
			type: meta?.type || "Cuenta",
			dueDate,
			dueInDays: daysUntil(dueDate),
			progress: originalAmount > 0 ? Math.min((paidAmount / originalAmount) * 100, 100) : 0
		};
	}

	function getCreditAccounts() {
		const accounts = [];
		getCreditCategories().forEach((category) => {
			const meta = getCreditCategoryMeta(category);
			getCollection(meta.storageKey).forEach((item, index) => {
				const normalized = normalizeCreditItem(category, item, index);
				accounts.push({
					id: normalized.id,
					category,
					storageKey: meta.storageKey,
					index,
					name: normalized.nombre,
					amount: normalized.monto,
					originalAmount: normalized.originalMonto,
					minimumPayment: normalized.pagoMinimo,
					rate: toNumber(normalized.tasa),
					dueDate: normalized.dueDate,
					dueInDays: normalized.dueInDays,
					status: normalized.status,
					type: normalized.type,
					createdAt: normalized.createdAt,
					paymentHistory: normalized.paymentHistory,
					paidAmount: normalized.paidAmount,
					progress: normalized.progress,
					raw: normalized
				});
			});
		});
		return accounts;
	}

	function setCollectionByCategory(category, items) {
		const meta = getCreditCategoryMeta(category);
		if (!meta) throw new Error("Categoria de credito no soportada.");
		saveCollection(meta.storageKey, items);
		return items;
	}

	function saveDebtPaymentCapacity(amount) {
		const current = getStoredFinancialData();
		writeFinanceJSON(STORAGE_KEYS.financialData, {
			...current,
			debtPaymentCapacity: Math.max(toNumber(amount), 0)
		});
		markLocalChangesPending();
		dispatchDataUpdate();
		return Math.max(toNumber(amount), 0);
	}

	function getDebtPaymentCapacity() {
		return Math.max(toNumber(getStoredFinancialData().debtPaymentCapacity), 0);
	}

	function saveDebtTargetMonths(months) {
		const current = getStoredFinancialData();
		const normalizedMonths = Math.max(Math.round(toNumber(months)), 0);
		writeFinanceJSON(STORAGE_KEYS.financialData, {
			...current,
			debtTargetMonths: normalizedMonths
		});
		markLocalChangesPending();
		dispatchDataUpdate();
		return normalizedMonths;
	}

	function getDebtTargetMonths() {
		return Math.max(Math.round(toNumber(getStoredFinancialData().debtTargetMonths)), 0);
	}

	function getDebtStrategyMode() {
		return normalizeDebtStrategyMode(getStoredFinancialData().debtStrategyMode);
	}

	function saveDebtStrategyMode(mode) {
		const current = getStoredFinancialData();
		const normalizedMode = normalizeDebtStrategyMode(mode);
		writeFinanceJSON(STORAGE_KEYS.financialData, {
			...current,
			debtStrategyMode: normalizedMode
		});
		markLocalChangesPending();
		dispatchDataUpdate();
		return normalizedMode;
	}

	function updateCreditItem(category, index, updater) {
		const meta = getCreditCategoryMeta(category);
		if (!meta) {
			return { ok: false, message: "Categoria de credito no soportada." };
		}

		const items = getCollection(meta.storageKey);
		if (!items[index]) {
			return { ok: false, message: "No se encontro la cuenta seleccionada." };
		}

		const current = normalizeCreditItem(category, items[index], index);
		let updated;
		try {
			updated = updater(current);
		} catch (error) {
			return { ok: false, message: error.message || "No se pudo actualizar la cuenta." };
		}
		const persisted = { ...updated };
		delete persisted.type;
		delete persisted.dueDate;
		delete persisted.dueInDays;
		delete persisted.progress;
		delete persisted.paidAmount;
		items[index] = persisted;
		setCollectionByCategory(category, items);
		return { ok: true, account: normalizeCreditItem(category, persisted, index) };
	}

	function recordDebtPayment(category, index, paymentData) {
		return updateCreditItem(category, index, (current) => {
			const amount = Math.max(toNumber(paymentData?.amount), 0);
			if (amount <= 0) {
				throw new Error("El abono debe ser mayor que cero.");
			}

			const appliedAmount = Math.min(amount, current.monto);
			const remainingAmount = Math.max(current.monto - appliedAmount, 0);
			const entryDate = paymentData?.date || getTodayDate();
			const entry = {
				id: `${current.id}-payment-${Date.now()}`,
				amount: appliedAmount,
				date: entryDate,
				note: String(paymentData?.note || "").trim(),
				previousAmount: current.monto,
				remainingAmount,
				type: remainingAmount === 0 ? "full" : "partial"
			};

			return {
				...current,
				monto: remainingAmount,
				lastPaymentDate: entryDate,
				lastPaymentAmount: appliedAmount,
				paymentHistory: [...current.paymentHistory, entry],
				status: remainingAmount === 0 ? "paid" : "active"
			};
		});
	}

	function markDebtAsPaid(category, index, paymentData) {
		const accounts = getCreditAccounts();
		const account = accounts.find((item) => item.category === category && item.index === index);
		if (!account || account.amount <= 0) {
			return { ok: false, message: "La cuenta ya no tiene saldo pendiente." };
		}
		return recordDebtPayment(category, index, {
			...paymentData,
			amount: account.amount
		});
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
		const withDueDays = getCreditAccounts()
			.filter((account) => account.amount > 0)
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
			debtPaymentCapacity: Math.max(toNumber(stored.debtPaymentCapacity), 0),
			debtTargetMonths: Math.max(Math.round(toNumber(stored.debtTargetMonths)), 0),
			debtStrategyMode: normalizeDebtStrategyMode(stored.debtStrategyMode),
			income,
			nextDueAccount: nextDue,
			expenseSummary
		};
	}

	function getRegisteredUser() {
		return readJSON(STORAGE_KEYS.user, null);
	}

	const buildStoredUserProfile = sessionTools ? sessionTools.buildStoredUserProfile : (user) => user;
	const notifySessionChange = sessionTools ? sessionTools.notifySessionChange : () => undefined;
	const clearStoredSession = sessionTools ? sessionTools.clearStoredSession : () => undefined;
	const writeStoredSession = sessionTools ? sessionTools.writeStoredSession : () => undefined;
	function saveSessionCache(user) {
		if (sessionTools) {
			sessionTools.saveSessionCache(user);
			return;
		}
		if (!user) {
			clearStoredSession();
			return;
		}
		writeStoredSession(buildStoredUserProfile(user));
	}

	function getCurrentUser() {
		return sessionTools ? sessionTools.getCurrentUser(getRegisteredUser) : null;
	}

	function getRememberedLogin() {
		return sessionTools ? sessionTools.getRememberedLogin() : null;
	}

	function saveRememberedLogin(email, password, enabled) {
		return sessionTools ? sessionTools.saveRememberedLogin(email, password, enabled) : null;
	}

	async function finalizeBackendAuthentication(user, syncFailureMessage) {
		saveSessionCache(user);
		try {
			await hydrateRemoteState();
		} catch (hydrateError) {
			setSyncDiagnostic(hydrateError, "auth-hydration", syncFailureMessage);
			console.error(syncFailureMessage, hydrateError);
			updateSyncStatus("error", syncFailureMessage);
		}
		return { ok: true, user: getCurrentUser() };
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

	function getRemoteItemDetails(item) {
		const details = { ...(item || {}) };
		delete details.type;
		delete details.dueDate;
		delete details.dueInDays;
		delete details.progress;
		delete details.paidAmount;
		return details;
	}

	function mapCollectionItem(category, item) {
		const normalizedItem = item && typeof item === "object" ? item : {};
		const itemKey = normalizedItem.id || createStableId(category);
		const paymentHistory = sanitizePaymentHistory(normalizedItem.paymentHistory || normalizedItem.historialPagos, itemKey);
		return {
			item_key: itemKey,
			category,
			name: normalizedItem.nombre || normalizedItem.descripcion || category,
			amount: toNumber(normalizedItem.monto),
			original_amount: Math.max(toNumber(normalizedItem.originalMonto), toNumber(normalizedItem.monto)),
			minimum_payment: Math.max(toNumber(normalizedItem.pagoMinimo), 0),
			paid_amount: paymentHistory.reduce((total, entry) => total + toNumber(entry.amount), 0),
			rate: normalizedItem.tasa === null || normalizedItem.tasa === undefined || normalizedItem.tasa === "" ? null : toNumber(normalizedItem.tasa),
			due_date: normalizedItem.fechaPago || normalizedItem.fechaCorte || null,
			event_date: normalizedItem.fecha || normalizedItem.fechaPago || normalizedItem.fechaCorte || null,
			status: normalizedItem.status || (toNumber(normalizedItem.monto) <= 0 ? "paid" : "active"),
			details: getRemoteItemDetails({ ...normalizedItem, id: itemKey, paymentHistory })
		};
	}

	function mapPaymentRows(snapshot, userId) {
		const rows = [];
		getCreditCategories().forEach((category) => {
			(snapshot[category] || []).forEach((item) => {
				const itemKey = item.id || null;
				if (!itemKey) return;
				sanitizePaymentHistory(item.paymentHistory || item.historialPagos, itemKey).forEach((entry) => {
					rows.push({
						user_id: userId,
						payment_key: entry.id || createStableId(`${itemKey}-payment`),
						item_key: itemKey,
						category,
						amount: toNumber(entry.amount),
						payment_date: entry.date || getTodayDate(),
						note: String(entry.note || "").trim(),
						previous_amount: toNumber(entry.previousAmount),
						remaining_amount: toNumber(entry.remainingAmount),
						payment_type: entry.type || "partial"
					});
				});
			});
		});
		return rows;
	}

	function buildPaymentLookup(paymentRows) {
		const lookup = new Map();
		(paymentRows || []).forEach((row) => {
			const itemKey = String(row.item_key || "").trim();
			if (!itemKey) return;
			const entries = lookup.get(itemKey) || [];
			entries.push({
				id: row.payment_key || (row.id ? `payment-${row.id}` : `${itemKey}-${entries.length + 1}`),
				amount: toNumber(row.amount),
				date: row.payment_date || row.date || getTodayDate(),
				note: String(row.note || "").trim(),
				previousAmount: toNumber(row.previous_amount),
				remainingAmount: toNumber(row.remaining_amount),
				type: row.payment_type || "partial"
			});
			lookup.set(itemKey, entries);
		});
		return lookup;
	}

	function writeCollectionsToLocal(snapshot) {
		Object.entries(CATEGORY_STORAGE_MAP).forEach(([category, storageKey]) => {
			saveCollection(storageKey, snapshot[category] || [], { dispatch: false });
		});
		writeFinanceJSON(STORAGE_KEYS.financialData, snapshot.financialData || {});
	}

	function buildRemoteSnapshot(profileRow, itemRows, paymentRows) {
		const paymentLookup = buildPaymentLookup(paymentRows);
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
				debtPaymentCapacity: toNumber(profileRow?.debt_payment_capacity),
				debtTargetMonths: Math.max(Math.round(toNumber(profileRow?.debt_target_months)), 0),
				debtStrategyMode: normalizeDebtStrategyMode(profileRow?.debt_strategy_mode),
				debtPlanFavorites: normalizeDebtPlanFavorites(profileRow?.debt_plan_favorites),
				currency: normalizeCurrency(profileRow?.currency)
			}
		};

		(itemRows || []).forEach((row) => {
			const category = row.category;
			if (!snapshot[category]) return;
			const original = row.details && typeof row.details === "object" ? row.details : {};
			const paymentHistory = paymentLookup.get(String(row.item_key || "").trim())
				|| sanitizePaymentHistory(original.paymentHistory || original.historialPagos);
			snapshot[category].push({
				...original,
				id: original.id || row.item_key || undefined,
				nombre: original.nombre || row.name || undefined,
				descripcion: original.descripcion || row.name || undefined,
				monto: toNumber(original.monto ?? row.amount),
				originalMonto: Math.max(toNumber(original.originalMonto ?? row.original_amount), toNumber(original.monto ?? row.amount)),
				pagoMinimo: toNumber(original.pagoMinimo ?? row.minimum_payment),
				tasa: original.tasa ?? row.rate,
				fecha: original.fecha || row.event_date || undefined,
				fechaPago: original.fechaPago || row.due_date || undefined,
				fechaCorte: original.fechaCorte || row.due_date || undefined,
				status: original.status || row.status || undefined,
				paymentHistory
			});
		});

		return snapshot;
	}

	function hasMeaningfulSnapshot(snapshot) {
		if (!snapshot) return false;
		const hasItems = Object.keys(CATEGORY_STORAGE_MAP).some((category) => (snapshot[category] || []).length > 0);
		const financialData = snapshot.financialData || {};
		const hasFinancialState = ["budget", "creditDueInDays", "possibleSavings", "debts", "debtPaymentCapacity", "debtTargetMonths"]
			.some((key) => toNumber(financialData[key]) > 0);
		const hasStrategyState = normalizeDebtStrategyMode(financialData.debtStrategyMode) !== "medium";
		return hasItems || hasFinancialState || hasStrategyState;
	}

	async function upsertRemoteProfile(client, payload) {
		let result = await client.from("user_profiles").upsert(payload, { onConflict: "user_id" });
		if (!result.error) return result;

		if (/(debt_payment_capacity|debt_target_months|debt_strategy_mode|debt_plan_favorites)/i.test(String(result.error.message || ""))) {
			const legacyPayload = { ...payload };
			delete legacyPayload.debt_payment_capacity;
			delete legacyPayload.debt_target_months;
			delete legacyPayload.debt_strategy_mode;
			delete legacyPayload.debt_plan_favorites;
			result = await client.from("user_profiles").upsert(legacyPayload, { onConflict: "user_id" });
		}

		return result;
	}

	const isReplaceStrategyError = syncTools ? syncTools.isReplaceStrategyError : () => false;
	const replaceRemoteRows = syncTools ? syncTools.replaceRemoteRows : async () => ({ error: null });
	const deleteRemoteKeys = syncTools ? syncTools.deleteRemoteKeys : async () => ({ error: null });

	async function syncRemoteFinanceItems(client, userId, itemRows) {
		if (itemRows.length === 0) {
			return client.from("finance_items").delete().eq("user_id", userId);
		}
		const itemKeys = itemRows.map((row) => row.item_key).filter(Boolean);
		let result = await client.from("finance_items").upsert(itemRows, { onConflict: "user_id,item_key" });
		if (!result.error) {
			const deleteResult = await deleteRemoteKeys(client, "finance_items", userId, "item_key", itemKeys);
			return deleteResult.error || result.error ? (deleteResult.error ? deleteResult : result) : result;
		}

		const errorMessage = String(result.error.message || "");
		const requiresLegacyColumns = /(item_key|original_amount|minimum_payment|paid_amount|status)/i.test(errorMessage);
		const requiresReplaceStrategy = isReplaceStrategyError(errorMessage);
		if (requiresLegacyColumns || requiresReplaceStrategy) {
			if (requiresReplaceStrategy && !requiresLegacyColumns) {
				result = await replaceRemoteRows(client, "finance_items", userId, itemRows);
				return result;
			}
			const legacyRows = itemRows.map(({ item_key, original_amount, minimum_payment, paid_amount, status, ...rest }) => rest);
			result = await replaceRemoteRows(client, "finance_items", userId, legacyRows);
		}

		return result;
	}

	async function syncRemotePaymentRows(client, userId, paymentRows) {
		if (paymentRows.length === 0) {
			return client.from("finance_item_payments").delete().eq("user_id", userId);
		}
		const paymentKeys = paymentRows.map((row) => row.payment_key).filter(Boolean);
		let result = await client.from("finance_item_payments").upsert(paymentRows, { onConflict: "user_id,payment_key" });
		if (!result.error) {
			const deleteResult = await deleteRemoteKeys(client, "finance_item_payments", userId, "payment_key", paymentKeys);
			if (deleteResult.error) {
				console.warn("No se pudieron limpiar pagos remotos obsoletos.", deleteResult.error);
				return deleteResult;
			}
			return result;
		}

		const errorMessage = String(result.error.message || "");
		const requiresLegacyColumns = /payment_key/i.test(errorMessage);
		const requiresReplaceStrategy = isReplaceStrategyError(errorMessage);
		if (requiresLegacyColumns || requiresReplaceStrategy) {
			if (requiresReplaceStrategy && !requiresLegacyColumns) {
				result = await replaceRemoteRows(client, "finance_item_payments", userId, paymentRows);
				if (result.error) {
					console.warn("No se pudieron sincronizar los pagos en Supabase.", result.error);
				}
				return result;
			}
			const legacyRows = paymentRows.map(({ payment_key, ...rest }) => rest);
			result = await replaceRemoteRows(client, "finance_item_payments", userId, legacyRows);
		}
		if (result.error) {
			console.warn("No se pudieron sincronizar los pagos en Supabase.", result.error);
		}
		return result;
	}

	async function hydrateRemoteState() {
		if (!isBackendConfigured()) return null;
		if (backendState.hydrationPromise) return backendState.hydrationPromise;
		updateSyncStatus("loading", "Cargando datos...");

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

			const [profileResult, itemResult, paymentResult] = await Promise.all([
				client.from("user_profiles").select("*").eq("user_id", authUser.id).maybeSingle(),
				client.from("finance_items").select("*").eq("user_id", authUser.id).order("created_at", { ascending: true }),
				client.from("finance_item_payments").select("*").eq("user_id", authUser.id).order("payment_date", { ascending: true })
			]);

			if (itemResult.error) {
				throw itemResult.error;
			}
			if (paymentResult.error) {
				console.warn("No se pudo leer la tabla de pagos en Supabase.", paymentResult.error);
			}

			const profileRow = profileResult.data || null;
			const itemRows = itemResult.data || [];
			const paymentRows = paymentResult.data || [];

			const snapshot = buildRemoteSnapshot(profileRow, itemRows, paymentRows);
			const localSnapshot = getStorageSnapshot();
			const syncMeta = getSyncMeta();
			backendState.pendingLocalChanges = Boolean(syncMeta.pendingLocalChanges);
			backendState.syncAttempt = Math.max(toNumber(syncMeta.retryCount), 0);
			const remoteHasMeaningfulState = hasMeaningfulSnapshot(snapshot);
			const localHasMeaningfulState = hasMeaningfulSnapshot(localSnapshot);
			if (backendState.pendingLocalChanges && localHasMeaningfulState) {
				window.dispatchEvent(new CustomEvent("flexiway:data-updated", { detail: getFinancialData() }));
				updateSyncStatus("pending", "Guardado local pendiente de sincronizar");
				scheduleRemoteSync();
				return localSnapshot;
			}
			if (localHasMeaningfulState && !remoteHasMeaningfulState) {
				updateSyncStatus("syncing", "Sincronizando datos locales...");
				await persistRemoteState();
				window.dispatchEvent(new CustomEvent("flexiway:data-updated", { detail: getFinancialData() }));
				updateSyncStatus("synced", "Datos sincronizados", { autoReset: 2200 });
				return localSnapshot;
			}
			writeCollectionsToLocal(snapshot);
			window.dispatchEvent(new CustomEvent("flexiway:data-updated", { detail: getFinancialData() }));
			updateSyncStatus("synced", "Datos cargados", { autoReset: 1800 });
			return snapshot;
		})();

		try {
			return await backendState.hydrationPromise;
		} catch (error) {
			setSyncDiagnostic(error, "hydrateRemoteState", "No se pudo hidratar el estado desde Supabase.");
			updateSyncStatus("error", "Error al cargar datos");
			throw error;
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
		window.clearTimeout(backendState.syncRetryTimeout);
		updateSyncStatus("syncing", "Guardando cambios...");

		const snapshot = getStorageSnapshot();
		const financialData = snapshot.financialData || {};
		const profileResult = await upsertRemoteProfile(client, {
			user_id: authUser.id,
			name: snapshot.user?.name || authUser.user_metadata?.name || authUser.email?.split("@")[0] || "Usuario",
			email: authUser.email,
			currency: normalizeCurrency(financialData.currency),
			budget: toNumber(financialData.budget),
			credit_due_in_days: toNumber(financialData.creditDueInDays),
			possible_savings: toNumber(financialData.possibleSavings),
			debts: toNumber(financialData.debts),
			debt_payment_capacity: toNumber(financialData.debtPaymentCapacity),
			debt_target_months: Math.max(Math.round(toNumber(financialData.debtTargetMonths)), 0),
			debt_strategy_mode: normalizeDebtStrategyMode(financialData.debtStrategyMode),
			debt_plan_favorites: normalizeDebtPlanFavorites(financialData.debtPlanFavorites),
			updated_at: new Date().toISOString()
		});
		if (profileResult.error) throw profileResult.error;

		const itemRows = [];
		Object.keys(CATEGORY_STORAGE_MAP).forEach((category) => {
			(snapshot[category] || []).forEach((item) => {
				itemRows.push({
					user_id: authUser.id,
					...mapCollectionItem(category, item)
				});
			});
		});
		const paymentRows = mapPaymentRows(snapshot, authUser.id);

		const itemInsertResult = await syncRemoteFinanceItems(client, authUser.id, itemRows);
		if (itemInsertResult.error) throw itemInsertResult.error;
		const paymentResult = await syncRemotePaymentRows(client, authUser.id, paymentRows);
		if (paymentResult.error) throw paymentResult.error;
		clearPendingLocalChanges();
		updateSyncStatus("synced", "Cambios guardados", { autoReset: 2000 });
	}

	const scheduleRemoteSync = syncTools ? syncTools.scheduleRemoteSync : () => undefined;
	const handleSyncFailure = syncTools ? syncTools.handleSyncFailure : () => undefined;

	function saveFinancialData(data) {
		const current = getStoredFinancialData();
		const payload = {
			...current,
			budget: toNumber(data.budget),
			creditDueInDays: toNumber(data.creditDueInDays),
			possibleSavings: toNumber(data.possibleSavings),
			debts: toNumber(data.debts),
			debtTargetMonths: Math.max(Math.round(toNumber(data.debtTargetMonths || current.debtTargetMonths)), 0),
			debtStrategyMode: normalizeDebtStrategyMode(data.debtStrategyMode || current.debtStrategyMode),
			debtPlanFavorites: normalizeDebtPlanFavorites(data.debtPlanFavorites || current.debtPlanFavorites),
			currency: normalizeCurrency(data.currency || current.currency)
		};
		writeFinanceJSON(STORAGE_KEYS.financialData, payload);
		markLocalChangesPending();
		dispatchDataUpdate();
		return getFinancialData();
	}

	function saveCurrencyPreference(currency) {
		const current = getStoredFinancialData();
		writeFinanceJSON(STORAGE_KEYS.financialData, {
			...current,
			currency: normalizeCurrency(currency)
		});
		markLocalChangesPending();
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
		const breakdown = getExpenseBreakdown().filter((item) => toNumber(item.total) > 0);
		const labels = breakdown.map((item) => item.label);
		const values = breakdown.map((item) => item.total);
		const colors = breakdown.map((item) => item.color);
		if (metrics.remainingBudget > 0) {
			labels.push("Disponible");
			values.push(metrics.remainingBudget);
			colors.push("#c7ceea");
		}
		if (labels.length === 0 && source.income > 0) {
			labels.push("Disponible");
			values.push(source.income);
			colors.push("#c7ceea");
		}
		const chartKey = JSON.stringify({ labels, values, colors });
		if (backendState.lastBudgetChartKey === chartKey && budgetChartInstance) {
			return;
		}
		backendState.lastBudgetChartKey = chartKey;

		if (budgetChartInstance) budgetChartInstance.destroy();

		budgetChartInstance = new Chart(canvas, {
			type: "doughnut",
			data: {
				labels,
				datasets: [{
					data: values,
					backgroundColor: colors,
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
		const accounts = getCreditAccounts().filter((account) => account.amount > 0 || account.paymentHistory.length > 0);

		const exposure = accounts.reduce((total, account) => total + account.amount, 0);
		const accountsWithRate = accounts.filter((account) => account.rate > 0);
		const averageRate = accountsWithRate.length > 0
			? accountsWithRate.reduce((total, account) => total + account.rate, 0) / accountsWithRate.length
			: 0;
		const nextDue = accounts
			.filter((account) => account.amount > 0)
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

	function compareAccountsForPlan(mode, left, right) {
		const leftUrgent = left.dueInDays !== null && left.dueInDays <= 7 ? 1 : 0;
		const rightUrgent = right.dueInDays !== null && right.dueInDays <= 7 ? 1 : 0;
		if (leftUrgent !== rightUrgent) return rightUrgent - leftUrgent;

		if (mode === "regular") {
			if (left.amount !== right.amount) return left.amount - right.amount;
			if (left.rate !== right.rate) return right.rate - left.rate;
		} else if (mode === "aggressive") {
			if (left.rate !== right.rate) return right.rate - left.rate;
			if (left.amount !== right.amount) return right.amount - left.amount;
		} else {
			const leftScore = (left.rate * 1.3) + (left.dueInDays !== null ? Math.max(30 - left.dueInDays, 0) : 0) + (left.amount / 1000);
			const rightScore = (right.rate * 1.3) + (right.dueInDays !== null ? Math.max(30 - right.dueInDays, 0) : 0) + (right.amount / 1000);
			if (leftScore !== rightScore) return rightScore - leftScore;
		}

		if ((left.dueInDays ?? 9999) !== (right.dueInDays ?? 9999)) {
			return (left.dueInDays ?? 9999) - (right.dueInDays ?? 9999);
		}
		return left.name.localeCompare(right.name);
	}

	function getExpenseReductionSuggestions() {
		const collections = getCollections();
		const suggestions = [];
		const serviceTotal = sumAmounts(collections.services);
		const customTotal = sumAmounts(collections.custom);
		const topServices = [...collections.services]
			.sort((left, right) => toNumber(right.monto) - toNumber(left.monto))
			.slice(0, 2);
		const topCustom = [...collections.custom]
			.sort((left, right) => toNumber(right.monto) - toNumber(left.monto))
			.slice(0, 2);

		if (serviceTotal > 0) {
			suggestions.push({
				title: "Ajusta servicios fijos",
				text: `Tus servicios suman ${formatCurrency(serviceTotal)}. Revisa ${topServices.map((item) => item.nombre || "servicio").join(" y ")} para renegociar o pausar.`
			});
		}

		if (customTotal > 0) {
			suggestions.push({
				title: "Recorta gastos variables",
				text: `Las categorias personalizadas representan ${formatCurrency(customTotal)}. Empieza por ${topCustom.map((item) => item.nombre || "categoria").join(" y ")}.`
			});
		}

		if (suggestions.length === 0) {
			suggestions.push({
				title: "Sigue registrando",
				text: "Mientras mas gastos clasifiques, mas precisas seran las sugerencias para liberar dinero y acelerar el pago de deudas."
			});
		}

		return suggestions;
	}

	function getDebtActionPlan(mode, options) {
		const normalizedMode = normalizeDebtStrategyMode(mode);
		const configOptions = options && typeof options === "object"
			? options
			: { capacityOverride: options };
		const modeMeta = {
			regular: {
				label: "Regular",
				description: "Prioriza victorias rapidas y protege liquidez.",
				strategy: "Bola de nieve guiada",
				multiplier: 1
			},
			medium: {
				label: "Medio",
				description: "Balancea urgencia, tasa y avance mensual.",
				strategy: "Plan hibrido",
				multiplier: 1.15
			},
			aggressive: {
				label: "Agresivo",
				description: "Ataca interes y saldos grandes con la mayor velocidad posible.",
				strategy: "Avalancha enfocada",
				multiplier: 1.35
			}
		};

		const config = modeMeta[normalizedMode] || modeMeta.medium;
		const focusTargetIds = normalizeFocusTargetIds(configOptions.focusTargetIds || configOptions.focusTargetId);
		const allAccounts = getCreditAccounts()
			.filter((account) => account.amount > 0)
			.sort((left, right) => compareAccountsForPlan(normalizedMode, left, right));
		const accounts = focusTargetIds.length > 0
			? allAccounts.filter((account) => focusTargetIds.includes(account.id))
			: allAccounts;
		const ignoredAccounts = focusTargetIds.length > 0
			? allAccounts.filter((account) => !focusTargetIds.includes(account.id))
			: [];
		const storedCapacity = getDebtPaymentCapacity();
		const storedTargetMonths = getDebtTargetMonths();
		const selectedCapacity = Math.max(toNumber(configOptions.capacityOverride), 0) || storedCapacity;
		const targetMonths = Math.max(Math.round(toNumber(configOptions.targetMonthsOverride)), 0) || storedTargetMonths;
		const capacity = Math.max(selectedCapacity, 0);
		const totalDebt = accounts.reduce((total, account) => total + account.amount, 0);
		const totalMinimum = accounts.reduce((total, account) => total + account.minimumPayment, 0);
		const requiredMonthlyBudget = targetMonths > 0 && totalDebt > 0
			? accounts.reduce((total, account) => total + calculateRequiredMonthlyPayment(account.amount, account.rate, targetMonths, account.minimumPayment), 0)
			: 0;
		const canRecommend = capacity > 0 && targetMonths > 0;
		const planningCapacity = canRecommend ? capacity : 0;
		const monthlyAllocations = canRecommend ? buildMonthlyDebtAllocation(accounts, planningCapacity, normalizedMode, targetMonths) : [];
		const allocationLookup = new Map(monthlyAllocations.map((account) => [account.id, account]));
		const allocations = accounts.map((account, index) => {
			const priorityInsight = getDebtPriorityInsight(account, normalizedMode);
			const monthlyAllocation = allocationLookup.get(account.id);
			return {
				...account,
				recommendedPayment: canRecommend ? Math.min(account.amount, Math.max(toNumber(monthlyAllocation?.recommendedPayment), 0)) : 0,
				requiredPaymentForGoal: targetMonths > 0 ? calculateRequiredMonthlyPayment(account.amount, account.rate, targetMonths, account.minimumPayment) : 0,
				priorityScore: priorityInsight.score,
				prioritySummary: priorityInsight.summary,
				priorityDrivers: priorityInsight.drivers,
				rationale: index === 0
					? `Objetivo principal por ${config.strategy.toLowerCase()} porque ${priorityInsight.summary}.`
					: account.minimumPayment > 0
						? "Mantener pago minimo para no caer en atraso."
						: "Monitorear, sin asignacion inicial en este plan."
			};
		});

		const projectedMonths = canRecommend ? simulateDebtPayoffMonths(accounts, capacity, normalizedMode) : null;
		const focusAccount = canRecommend ? allocations[0] || null : null;
		const nextAccount = canRecommend ? allocations[1] || null : null;
		const acceleratedAccounts = allocations.filter((account) => account.recommendedPayment > Math.max(account.minimumPayment, 0));
		const parallelAccounts = canRecommend ? acceleratedAccounts.slice(0, 2) : [];
		const attackSequence = canRecommend
			? allocations.slice(0, 3).map((account, index) => ({
				step: index + 1,
				name: account.name,
				payment: account.recommendedPayment,
				remainingAmount: account.amount,
				reason: account.rationale
			}))
			: [];
		const warnings = [];
		if (accounts.length === 0) warnings.push("No hay deudas activas para planificar.");
		if (focusTargetIds.length === 1 && ignoredAccounts.length > 0) warnings.push("Esta simulacion esta enfocada en una deuda puntual. Las demas quedan fuera del calculo principal.");
		if (focusTargetIds.length >= 2 && ignoredAccounts.length > 0) warnings.push("Esta simulacion solo mezcla las deudas objetivo seleccionadas. El resto queda fuera del calculo principal.");
		if (capacity <= 0) warnings.push("Registra tu capacidad mensual de abono para generar un plan accionable.");
		if (targetMonths <= 0) warnings.push("Define en cuantos meses quieres terminar tu deuda para calcular un plan real.");
		if (capacity > 0 && totalMinimum > capacity) warnings.push("Tu capacidad no cubre todos los pagos minimos. Ajusta gastos antes de acelerar la deuda objetivo.");
		if (targetMonths > 0 && requiredMonthlyBudget > capacity) warnings.push(`Para salir en ${targetMonths} meses necesitas al menos ${formatCurrency(requiredMonthlyBudget)} al mes.`);

		return {
			mode: normalizedMode,
			label: config.label,
			description: config.description,
			strategy: config.strategy,
			focusTargetId: focusTargetIds[0] || "",
			focusTargetIds,
			scope: focusTargetIds.length >= 2 ? "duo" : focusTargetIds.length === 1 ? "single" : "global",
			capacity,
			targetMonths,
			requiredMonthlyBudget,
			totalDebt,
			totalMinimum,
			projectedMonths,
			focusAccount,
			nextAccount,
			parallelAccounts,
			attackSequence,
			allocations,
			warnings,
			expenseCuts: getExpenseReductionSuggestions()
		};
	}

	function getDebtActionPlans(options) {
		return DEBT_STRATEGY_MODES.map((mode) => getDebtActionPlan(mode, options));
	}

	function getActiveDebtActionPlan(options) {
		return getDebtActionPlan(getDebtStrategyMode(), options);
	}

	function getMovementHistory() {
		const history = [];

		getCreditAccounts().forEach((account) => {
			history.push({
				kind: "registro",
				category: account.category,
				accountType: account.type,
				name: account.name,
				amount: account.originalAmount,
				remainingAmount: account.amount,
				date: account.createdAt || account.dueDate || getTodayDate(),
				status: account.status,
				description: `Registro inicial de ${account.type.toLowerCase()}`
			});

			account.paymentHistory.forEach((entry) => {
				history.push({
					kind: "pago",
					category: account.category,
					accountType: account.type,
					name: account.name,
					amount: entry.amount,
					remainingAmount: entry.remainingAmount,
					date: entry.date,
					status: entry.remainingAmount <= 0 ? "paid" : "active",
					description: entry.note || (entry.type === "full" ? "Pago completado" : "Abono parcial")
				});
			});
		});

		getExpenseBreakdown()
			.filter((group) => !getCreditCategories().includes(group.key))
			.forEach((group) => {
				group.items.forEach((item) => {
					const dateValue = group.dateFields.map((field) => item[field]).find(Boolean) || item.createdAt || getTodayDate();
					history.push({
						kind: "gasto",
						category: group.key,
						accountType: group.label,
						name: item.nombre || item.descripcion || group.label,
						amount: toNumber(item.monto),
						remainingAmount: 0,
						date: dateValue,
						status: "logged",
						description: `Gasto registrado en ${group.label.toLowerCase()}`
					});
				});
			});

		return history.sort((left, right) => {
			const dateCompare = String(right.date).localeCompare(String(left.date));
			if (dateCompare !== 0) return dateCompare;
			return left.kind.localeCompare(right.kind);
		});
	}

	async function signUpUser(userData) {
		const payload = {
			name: (userData.name || "Usuario").trim(),
			email: (userData.email || "").trim().toLowerCase(),
			password: userData.password || ""
		};

		if (isBackendConfigured()) {
			updateSyncStatus("auth", "Creando cuenta...");
			const client = await getSupabaseClient();
			const emailRedirectTo = getEmailRedirectUrl();
			const { data, error } = await client.auth.signUp({
				email: payload.email,
				password: payload.password,
				options: {
					data: { name: payload.name },
					...(emailRedirectTo ? { emailRedirectTo } : {})
				}
			});

			if (error) {
				setSyncDiagnostic(error, "signUpUser", "Error devuelto por Supabase Auth durante el registro.");
				updateSyncStatus("error", "No se pudo crear la cuenta");
				return { ok: false, message: error.message };
			}

			if (data?.user) {
				const authResult = await finalizeBackendAuthentication(
					{ ...data.user, name: payload.name },
					"Cuenta creada. La sincronizacion inicial fallo."
				);
				return {
					...authResult,
					requiresEmailConfirmation: !data?.session
				};
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
			updateSyncStatus("auth", "Iniciando sesion...");
			const client = await getSupabaseClient();
			const { data, error } = await client.auth.signInWithPassword({
				email: String(email || "").trim().toLowerCase(),
				password
			});

			if (error) {
				setSyncDiagnostic(error, "loginUser", "Error devuelto por Supabase Auth durante el inicio de sesion.");
				updateSyncStatus("error", "No se pudo iniciar sesion");
				return { ok: false, message: error.message };
			}
			return finalizeBackendAuthentication(data?.user, "Sesion iniciada. No se pudo cargar todo desde Supabase.");
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
		updateSyncStatus(isBackendConfigured() ? "idle" : "local", isBackendConfigured() ? "Sesion cerrada" : "Modo local", { autoReset: 1800, resetState: isBackendConfigured() ? "idle" : "local", resetMessage: isBackendConfigured() ? "Listo" : "Modo local" });
	}

	function dispatchDataUpdate() {
		if (isBackendConfigured() && backendState.pendingLocalChanges) {
			updateSyncStatus("pending", "Cambios guardados en este dispositivo");
		}
		scheduleRemoteSync();
		window.dispatchEvent(new CustomEvent("flexiway:data-updated", {
			detail: getFinancialData()
		}));
	}

	function ensureSessionReady() {
		return backendState.initPromise || Promise.resolve();
	}

	async function initBackendSession() {
		if (!isBackendConfigured()) {
			updateSyncStatus("local", "Modo local");
			return;
		}
		updateSyncStatus("loading", "Conectando con Supabase...");
		const client = await getSupabaseClient();
		if (!client) return;

		client.auth.onAuthStateChange((event, session) => {
			if (event === "TOKEN_REFRESHED") return;
			if (event === "PASSWORD_RECOVERY") return;
			if (session?.user) {
				saveSessionCache(session.user);
				if (event !== "INITIAL_SESSION") {
					hydrateRemoteState().catch((error) => console.error(error));
				}
			} else {
				saveSessionCache(null);
			}
		});

		await hydrateRemoteState();
	}

	backendState.initPromise = initBackendSession().catch((error) => {
		setSyncDiagnostic(error, "initBackendSession", "Fallo la inicializacion de Supabase al cargar la app.");
		console.error("No se pudo inicializar Supabase.", error);
	});

	return {
		STORAGE_KEYS,
		EXPENSE_GROUPS,
		DEBT_STRATEGY_MODES,
		formatCurrency,
		formatPercent,
		getSyncStatus,
		getSyncDiagnostics,
		getCurrencyPreference,
		getCurrencyConfig,
		saveCurrencyPreference,
		getDebtStrategyMode,
		saveDebtStrategyMode,
		toNumber,
		getCollection,
		saveCollection,
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
		getCreditAccounts,
		getDebtPaymentCapacity,
		saveDebtPaymentCapacity,
		getDebtTargetMonths,
		saveDebtTargetMonths,
		getDebtPlanFavorites,
		saveDebtPlanFavorite,
		removeDebtPlanFavorite,
		recordDebtPayment,
		markDebtAsPaid,
		getDebtActionPlan,
		getDebtActionPlans,
		getActiveDebtActionPlan,
		getMovementHistory,
		getExpenseReductionSuggestions,
		getCurrentUser,
		getRegisteredUser,
		getRememberedLogin,
		saveRememberedLogin,
		signUpUser,
		loginUser,
		logoutUser,
		dispatchDataUpdate,
		ensureSessionReady,
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
