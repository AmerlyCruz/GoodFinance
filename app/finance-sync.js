window.FlexiwayCreateSyncTools = function createSyncTools(deps) {
	const {
		backendState,
		STORAGE_KEYS,
		readFinanceJSON,
		writeFinanceJSON,
		getPersistRemoteState,
		isBackendConfigured
	} = deps;

	function updateSyncStatus(state, message, options) {
		backendState.syncStatus = {
			state: state || "idle",
			message: String(message || "Listo"),
			updatedAt: new Date().toISOString()
		};
		if (["idle", "local", "synced"].includes(backendState.syncStatus.state)) {
			backendState.lastSyncDiagnostic = null;
		}
		window.dispatchEvent(new CustomEvent("flexiway:sync-status", {
			detail: backendState.syncStatus
		}));
		window.clearTimeout(backendState.statusTimeout);
		if (options && options.autoReset) {
			backendState.statusTimeout = window.setTimeout(() => {
				updateSyncStatus(options.resetState || "idle", options.resetMessage || "Listo");
			}, options.autoReset);
		}
		return backendState.syncStatus;
	}

	function getSyncStatus() {
		return { ...backendState.syncStatus };
	}

	function setSyncDiagnostic(error, source, hint) {
		backendState.lastSyncDiagnostic = {
			source: String(source || "sync"),
			message: String(error?.message || error || "Error desconocido"),
			code: String(error?.code || ""),
			details: String(error?.details || error?.hint || ""),
			hint: String(hint || ""),
			updatedAt: new Date().toISOString()
		};
		return { ...backendState.lastSyncDiagnostic };
	}

	function getSyncDiagnostics() {
		return backendState.lastSyncDiagnostic ? { ...backendState.lastSyncDiagnostic } : null;
	}

	function getSyncMeta() {
		return readFinanceJSON(STORAGE_KEYS.syncMeta, {}) || {};
	}

	function writeSyncMeta(patch) {
		const current = getSyncMeta();
		writeFinanceJSON(STORAGE_KEYS.syncMeta, {
			...current,
			...patch
		});
	}

	function markLocalChangesPending() {
		backendState.pendingLocalChanges = true;
		writeSyncMeta({ pendingLocalChanges: true, retryCount: backendState.syncAttempt, updatedAt: new Date().toISOString() });
	}

	function markSyncRetryPending() {
		backendState.pendingLocalChanges = true;
		writeSyncMeta({ pendingLocalChanges: true, retryCount: backendState.syncAttempt, updatedAt: new Date().toISOString() });
	}

	function clearPendingLocalChanges() {
		backendState.pendingLocalChanges = false;
		backendState.syncAttempt = 0;
		window.clearTimeout(backendState.syncRetryTimeout);
		writeSyncMeta({ pendingLocalChanges: false, retryCount: 0, updatedAt: new Date().toISOString() });
	}

	function isReplaceStrategyError(message) {
		return /(constraint|conflict|unique|exclusion|on conflict)/i.test(String(message || ""));
	}

	async function replaceRemoteRows(client, table, userId, rows) {
		const deleteResult = await client.from(table).delete().eq("user_id", userId);
		if (deleteResult.error) {
			return deleteResult;
		}
		if (rows.length === 0) {
			return { error: null };
		}
		return client.from(table).insert(rows);
	}

	function buildInFilter(values) {
		return `(${values.map((value) => `"${String(value).replace(/"/g, '\\"')}"`).join(",")})`;
	}

	async function deleteRemoteKeys(client, table, userId, column, keys) {
		if (keys.length === 0) {
			return client.from(table).delete().eq("user_id", userId);
		}
		return client.from(table).delete().eq("user_id", userId).not(column, "in", buildInFilter(keys));
	}

	function scheduleRemoteSync() {
		if (!isBackendConfigured()) {
			updateSyncStatus("local", "Modo local");
			return;
		}
		window.clearTimeout(backendState.syncTimeout);
		backendState.syncTimeout = window.setTimeout(() => {
			const persistRemoteState = getPersistRemoteState();
			persistRemoteState().catch(handleSyncFailure);
		}, 500);
	}

	function handleSyncFailure(error) {
		backendState.syncAttempt += 1;
		markSyncRetryPending();
		const errorMessage = String(error?.message || "");
		const schemaHint = /(column|schema|relation|policy|permission|row level|row-level|debt_target_months|debt_payment_capacity|debt_plan_favorites|payment_key|item_key|finance_item_payments|finance_items|user_profiles)/i.test(errorMessage);
		if (backendState.syncAttempt < 3) {
			setSyncDiagnostic(error, "persistRemoteState", schemaHint ? "Puede faltar aplicar la migracion o alguna policy en Supabase." : "La app volvera a intentar sincronizar automaticamente.");
			updateSyncStatus("retrying", `Guardado local. Reintentando sincronizar (${backendState.syncAttempt}/2)...`);
			window.clearTimeout(backendState.syncRetryTimeout);
			backendState.syncRetryTimeout = window.setTimeout(() => {
				const persistRemoteState = getPersistRemoteState();
				persistRemoteState().catch(handleSyncFailure);
			}, 2500 * backendState.syncAttempt);
			return;
		}
		updateSyncStatus(
			"error",
			schemaHint ? "Guardado local. Revisa la migracion de Supabase." : "Guardado local. No se pudo sincronizar por ahora."
		);
		setSyncDiagnostic(error, "persistRemoteState", schemaHint ? "Revisa `supabase/schema.sql` y las politicas RLS del proyecto." : "Verifica conexion, clave publica y estado de Supabase.");
		console.error("No se pudo sincronizar con Supabase.", error);
	}

	return {
		updateSyncStatus,
		getSyncStatus,
		setSyncDiagnostic,
		getSyncDiagnostics,
		getSyncMeta,
		writeSyncMeta,
		markLocalChangesPending,
		markSyncRetryPending,
		clearPendingLocalChanges,
		isReplaceStrategyError,
		replaceRemoteRows,
		deleteRemoteKeys,
		scheduleRemoteSync,
		handleSyncFailure
	};
};