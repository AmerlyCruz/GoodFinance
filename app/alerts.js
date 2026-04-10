const FlexiwayAlerts = (() => {
	function buildNotifications() {
		if (!window.FlexiwayFinance) return [];
		const finance = window.FlexiwayFinance.getFinancialData();
		const metrics = window.FlexiwayFinance.generateDashboardData(finance);
		const credit = window.FlexiwayFinance.getCreditSummary();
		const user = window.FlexiwayFinance.getCurrentUser();
		const notifications = [];

		if (metrics.budgetUsage >= 90) {
			notifications.push({ type: "alert", title: "Presupuesto al limite", text: `Ya consumiste ${metrics.budgetUsage.toFixed(1)}% de tu presupuesto.`, time: "Hoy" });
		} else if (metrics.budgetUsage >= 75) {
			notifications.push({ type: "reminder", title: "Presupuesto alto", text: `Vas en ${metrics.budgetUsage.toFixed(1)}% de uso de presupuesto.`, time: "Hoy" });
		}

		if (credit.nextDue) {
			const tone = credit.nextDue.dueInDays <= 5 ? "alert" : "reminder";
			notifications.push({ type: tone, title: "Pago proximo", text: `${credit.nextDue.name} vence en ${credit.nextDue.dueInDays} dias.`, time: credit.nextDue.dueDate || "Proximo" });
		}

		if (finance.possibleSavings > 0) {
			notifications.push({ type: "suggestion", title: "Oportunidad de ahorro", text: `Tu margen actual permite ahorrar ${window.FlexiwayFinance.formatCurrency(finance.possibleSavings)}.`, time: "Este mes" });
		}

		if (!user) {
			notifications.push({ type: "suggestion", title: "Activa tu perfil", text: "Crea una cuenta para centralizar tus datos y acceder rapido a tu perfil.", time: "Configuracion" });
		}

		if (notifications.length === 0) {
			notifications.push({ type: "suggestion", title: "Todo en orden", text: "No hay alertas criticas. Sigue registrando movimientos para mejorar el analisis.", time: "Ahora" });
		}

		return notifications;
	}

	function countByType(items, type) {
		return items.filter((item) => item.type === type).length;
	}

	function renderNotificationPanel() {
		const notifications = buildNotifications();
		const summary = document.querySelector(".panel-summary");
		const list = document.querySelector(".panel-messages");
		if (!summary || !list) return notifications;

		summary.innerHTML = `
			<h2>Notificaciones</h2>
			<div class="summary-items">
				<p><span class="dot red"></span> ${countByType(notifications, "alert")} alertas</p>
				<p><span class="dot yellow"></span> ${countByType(notifications, "reminder")} recordatorios</p>
				<p><span class="dot green"></span> ${countByType(notifications, "suggestion")} sugerencias</p>
			</div>
		`;

		list.innerHTML = notifications.map((item) => {
			const tagClass = item.type === "alert"
				? "alert-tag"
				: item.type === "reminder"
					? "reminder-tag"
					: "suggestion-tag";
			const dotClass = item.type === "alert"
				? "red"
				: item.type === "reminder"
					? "yellow"
					: "green";
			return `
				<div class="message ${item.type}">
					<span class="dot ${dotClass}"></span>
					<div>
						<span class="tag ${tagClass}">${item.title}</span>
						<p>${item.text}</p>
						<small>${item.time}</small>
					</div>
				</div>
			`;
		}).join("");

		return notifications;
	}

	function maybeShowStartupAlert() {
		if (typeof Swal === "undefined") return;
		if (sessionStorage.getItem("flexiway-startup-alert")) return;
		const notifications = buildNotifications();
		const important = notifications.filter((item) => item.type === "alert");
		if (important.length === 0) return;
		sessionStorage.setItem("flexiway-startup-alert", "true");
		Swal.fire({
			title: "Atencion",
			html: important.map((item) => `<p style="margin:0 0 10px 0;">${item.text}</p>`).join(""),
			icon: "warning",
			confirmButtonText: "Revisar"
		});
	}

	return {
		buildNotifications,
		renderNotificationPanel,
		maybeShowStartupAlert
	};
})();

window.FlexiwayAlerts = FlexiwayAlerts;
