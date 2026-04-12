window.FlexiwayCreateSessionTools = function createSessionTools(deps) {
	const {
		backendState,
		STORAGE_KEYS,
		readJSON,
		writeJSON,
		isBackendConfigured
	} = deps;

	function buildStoredUserProfile(user) {
		return {
			id: user.id || user.user_id || null,
			name: user.name || user.user_metadata?.name || user.email?.split("@")[0] || "Usuario",
			email: user.email || ""
		};
	}

	function notifySessionChange(nextSessionKey) {
		if (backendState.lastSessionKey === nextSessionKey) {
			return;
		}
		backendState.lastSessionKey = nextSessionKey;
		window.dispatchEvent(new CustomEvent("flexiway:session-changed"));
	}

	function clearStoredSession() {
		const hadSession = Boolean(readJSON(STORAGE_KEYS.session, null) || readJSON(STORAGE_KEYS.user, null));
		backendState.lastSessionKey = "";
		localStorage.removeItem(STORAGE_KEYS.session);
		if (isBackendConfigured()) {
			localStorage.removeItem(STORAGE_KEYS.user);
		}
		if (hadSession) {
			window.dispatchEvent(new CustomEvent("flexiway:session-changed"));
		}
	}

	function writeStoredSession(profile) {
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
		notifySessionChange(`${mergedProfile.id || ""}:${mergedProfile.email || ""}:${mergedProfile.name || ""}`);
	}

	function saveSessionCache(user) {
		if (!user) {
			clearStoredSession();
			return;
		}
		writeStoredSession(buildStoredUserProfile(user));
	}

	function getCurrentUser(getRegisteredUser) {
		const session = readJSON(STORAGE_KEYS.session, null);
		const user = getRegisteredUser();
		if (!session || !user) return null;
		if (session.email && user.email && session.email !== user.email) return null;
		return user;
	}

	function getRememberedLogin() {
		const stored = readJSON(STORAGE_KEYS.rememberedLogin, null);
		if (!stored || typeof stored !== "object") return null;
		return {
			email: String(stored.email || "").trim(),
			password: String(stored.password || ""),
			enabled: Boolean(stored.enabled && stored.email)
		};
	}

	function saveRememberedLogin(email, password, enabled) {
		if (!enabled) {
			localStorage.removeItem(STORAGE_KEYS.rememberedLogin);
			return null;
		}

		const payload = {
			email: String(email || "").trim().toLowerCase(),
			password: String(password || ""),
			enabled: true,
			updatedAt: new Date().toISOString()
		};
		writeJSON(STORAGE_KEYS.rememberedLogin, payload);
		return payload;
	}

	return {
		buildStoredUserProfile,
		notifySessionChange,
		clearStoredSession,
		writeStoredSession,
		saveSessionCache,
		getCurrentUser,
		getRememberedLogin,
		saveRememberedLogin
	};
};