const fs = require("fs");
const path = require("path");
const vm = require("vm");

function createStorage() {
	const store = new Map();
	return {
		getItem(key) {
			return store.has(key) ? store.get(key) : null;
		},
		setItem(key, value) {
			store.set(key, String(value));
		},
		removeItem(key) {
			store.delete(key);
		},
		clear() {
			store.clear();
		}
	};
}

function createEventTarget() {
	const listeners = new Map();
	return {
		addEventListener(type, handler) {
			const items = listeners.get(type) || [];
			items.push(handler);
			listeners.set(type, items);
		},
		removeEventListener(type, handler) {
			const items = listeners.get(type) || [];
			listeners.set(type, items.filter((item) => item !== handler));
		},
		dispatchEvent(event) {
			const items = listeners.get(event.type) || [];
			items.forEach((handler) => handler.call(null, event));
			return true;
		}
	};
}

function createFakeTimers() {
	let nextId = 1;
	const scheduled = new Map();

	function setTimeoutFake(callback, delay) {
		const id = nextId;
		nextId += 1;
		scheduled.set(id, {
			id,
			callback,
			delay: Number(delay) || 0
		});
		return id;
	}

	function clearTimeoutFake(id) {
		scheduled.delete(id);
	}

	function flushNext() {
		const nextTimer = Array.from(scheduled.values()).sort((left, right) => {
			if (left.delay !== right.delay) return left.delay - right.delay;
			return left.id - right.id;
		})[0];
		if (!nextTimer) return false;
		scheduled.delete(nextTimer.id);
		nextTimer.callback();
		return true;
	}

	function flushAll(limit) {
		const maxSteps = Number.isFinite(limit) ? limit : 100;
		let count = 0;
		while (count < maxSteps && flushNext()) {
			count += 1;
		}
		return count;
	}

	function getPendingTimers() {
		return Array.from(scheduled.values()).map((timer) => ({
			id: timer.id,
			delay: timer.delay
		}));
	}

	return {
		setTimeout: setTimeoutFake,
		clearTimeout: clearTimeoutFake,
		flushNext,
		flushAll,
		getPendingTimers
	};
}

function createSupabaseMock(options) {
	const settings = options || {};
	const authUser = settings.authUser || null;
	const operations = [];
	const tables = {
		user_profiles: settings.tables?.user_profiles || {},
		finance_items: settings.tables?.finance_items || {},
		finance_item_payments: settings.tables?.finance_item_payments || {}
	};

	function clone(value) {
		return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
	}

	function resolveTableResult(tableName, action, payload) {
		const table = tables[tableName] || {};
		const handler = table[action];
		if (typeof handler === "function") {
			return handler(payload, operations);
		}
		return handler || { data: null, error: null };
	}

	function createQuery(tableName) {
		const state = {
			tableName,
			filters: [],
			action: null,
			selectColumns: null,
			payload: null,
			options: null,
			executed: false,
			execution: null
		};

		function finalize(actionOverride) {
			if (state.executed) {
				return state.execution;
			}
			state.executed = true;
			const action = actionOverride || state.action || "select";
			const payload = {
				table: state.tableName,
				action,
				filters: clone(state.filters),
				selectColumns: state.selectColumns,
				payload: clone(state.payload),
				options: clone(state.options)
			};
			operations.push(payload);
			const result = resolveTableResult(state.tableName, action, payload);
			state.execution = Promise.resolve({
				data: result?.data ?? null,
				error: result?.error ?? null
			});
			return state.execution;
		}

		return {
			select(columns) {
				state.action = "select";
				state.selectColumns = columns;
				return this;
			},
			eq(column, value) {
				state.filters.push({ type: "eq", column, value });
				return this;
			},
			not(column, operator, value) {
				state.filters.push({ type: "not", column, operator, value });
				return finalize("delete");
			},
			maybeSingle() {
				return finalize("selectMaybeSingle");
			},
			order(column, options) {
				state.options = {
					...(state.options || {}),
					orderBy: column,
					orderOptions: options || {}
				};
				return finalize("selectOrdered");
			},
			upsert(rows, options) {
				state.action = "upsert";
				state.payload = rows;
				state.options = options || {};
				return finalize("upsert");
			},
			insert(rows) {
				state.action = "insert";
				state.payload = rows;
				return finalize("insert");
			},
			delete() {
				state.action = "delete";
				return this;
			},
			then(onFulfilled, onRejected) {
				return finalize().then(onFulfilled, onRejected);
			},
			catch(onRejected) {
				return finalize().catch(onRejected);
			},
			finally(onFinally) {
				return finalize().finally(onFinally);
			}
		};
	}

	const client = {
		auth: {
			getUser() {
				operations.push({ table: "auth", action: "getUser" });
				return Promise.resolve({ data: { user: clone(authUser) }, error: null });
			},
			onAuthStateChange(handler) {
				operations.push({ table: "auth", action: "onAuthStateChange" });
				return { data: { subscription: { unsubscribe() {} } } };
			},
			signOut() {
				operations.push({ table: "auth", action: "signOut" });
				return Promise.resolve({ error: null });
			}
		},
		from(tableName) {
			return createQuery(tableName);
		}
	};

	return {
		client,
		operations,
		tables
	};
}

function buildContext(options) {
	const settings = options || {};
	const events = createEventTarget();
	const timers = settings.fakeTimers ? createFakeTimers() : null;
	const setTimeoutImpl = timers ? timers.setTimeout : setTimeout;
	const clearTimeoutImpl = timers ? timers.clearTimeout : clearTimeout;
	const localStorage = createStorage();
	const sessionStorage = createStorage();
	const document = {
		head: {
			appendChild() {}
		},
		querySelector() {
			return null;
		},
		createElement() {
			return {
				async: false,
				dataset: {},
				addEventListener() {},
				removeEventListener() {}
			};
		}
	};

	const window = {
		...events,
		location: {
			protocol: "https:",
			origin: "https://example.com",
			pathname: "/flexiway/index.html"
		},
		localStorage,
		sessionStorage,
		setTimeout: setTimeoutImpl,
		clearTimeout: clearTimeoutImpl,
		Math,
		Date,
		JSON,
		Intl,
		console,
		FLEXIWAY_SUPABASE_CONFIG: {
			url: settings.supabaseConfig?.url || "",
			anonKey: settings.supabaseConfig?.anonKey || "",
			siteUrl: settings.supabaseConfig?.siteUrl || ""
		}
	};
	if (settings.supabaseFactory) {
		window.supabase = {
			createClient: settings.supabaseFactory
		};
	}

	class CustomEvent {
		constructor(type, init) {
			this.type = type;
			this.detail = init?.detail;
		}
	}

	const context = {
		window,
		document,
		localStorage,
		sessionStorage,
		console,
		CustomEvent,
		setTimeout: setTimeoutImpl,
		clearTimeout: clearTimeoutImpl,
		Math,
		Date,
		JSON,
		Intl
	};
	window.window = window;
	window.document = document;
	window.CustomEvent = CustomEvent;
	window.__timers = timers;
	context.globalThis = context;
	return vm.createContext(context);
}

function loadScripts(context, files) {
	files.forEach((relativePath) => {
		const filePath = path.join(process.cwd(), relativePath);
		const source = fs.readFileSync(filePath, "utf8");
		vm.runInContext(source, context, { filename: relativePath });
	});
	return context.window.FlexiwayFinance;
}

function createFinanceApp(options) {
	const settings = options || {};
	const context = buildContext(settings);
	const finance = loadScripts(context, [
		"app/finance-session.js",
		"app/finance-sync.js",
		"app/finance.js"
	]);
	return {
		context,
		window: context.window,
		finance
	};
}

module.exports = {
	createFinanceApp,
	createSupabaseMock
};