// player-roster.js (ESM module)
// Handles player roster display with authentication and follow functionality

import { supabase } from "./supabase.js";

/* -------------------------
   AUTHENTICATION
   ------------------------- */
async function initAuthUI() {
	const loginBtn = document.getElementById("loginBtn");
	const logoutBtn = document.getElementById("logoutBtn");
	const closeLoginModal = document.getElementById("closeLoginModal");
	const loginTab = document.getElementById("loginTab");
	const signupTab = document.getElementById("signupTab");
	const loginForm = document.getElementById("loginForm");
	const signupForm = document.getElementById("signupForm");
	const submitLoginBtn = document.getElementById("submitLoginBtn");
	const submitSignupBtn = document.getElementById("submitSignupBtn");
	const loginModal = document.getElementById("loginModal");

	// Open/close modal
	loginBtn.addEventListener("click", () => {
		loginModal.classList.add("is-active");
	});

	closeLoginModal.addEventListener("click", () => {
		loginModal.classList.remove("is-active");
	});

	// Tab switching
	loginTab.addEventListener("click", () => {
		loginForm.style.display = "block";
		signupForm.style.display = "none";
		loginTab.parentElement.classList.add("is-active");
		signupTab.parentElement.classList.remove("is-active");
	});

	signupTab.addEventListener("click", () => {
		loginForm.style.display = "none";
		signupForm.style.display = "block";
		signupTab.parentElement.classList.add("is-active");
		loginTab.parentElement.classList.remove("is-active");
	});

	// Login submit
	submitLoginBtn.addEventListener("click", async () => {
		const username = document.getElementById("loginUsername").value.trim();
		const password = document.getElementById("loginPassword").value.trim();
		const errorEl = document.getElementById("loginError");
		errorEl.innerText = "";

		if (!username || !password) {
			errorEl.innerText = "Please enter username and password";
			return;
		}

		const email = username + "@gmail.com";

		try {
			const { data, error } = await supabase.auth.signInWithPassword({
				email,
				password,
			});

			if (error) {
				errorEl.innerText = error.message;
				return;
			}

			console.log("Login successful:", data.user.email);
			loginModal.classList.remove("is-active");
			checkAuthState();
		} catch (err) {
			errorEl.innerText = "Unexpected error: " + err.message;
		}
	});

	// Signup submit
	submitSignupBtn.addEventListener("click", async () => {
		const username = document.getElementById("signupUsername").value.trim();
		const password = document.getElementById("signupPassword").value.trim();
		const passwordConfirm = document
			.getElementById("signupPasswordConfirm")
			.value.trim();
		const errorEl = document.getElementById("signupError");
		errorEl.innerText = "";

		if (!username || !password || !passwordConfirm) {
			errorEl.innerText = "Please fill in all fields";
			return;
		}

		if (password !== passwordConfirm) {
			errorEl.innerText = "Passwords do not match";
			return;
		}

		if (password.length < 6) {
			errorEl.innerText = "Password must be at least 6 characters";
			return;
		}

		const email = username + "@gmail.com";

		try {
			const { data, error } = await supabase.auth.signUp({
				email,
				password,
			});

			if (error) {
				errorEl.innerText = error.message;
				return;
			}

			console.log("Signup successful:", data.user.email);
			alert(
				"Sign up successful! You can now log in with your username and password."
			);
			loginModal.classList.remove("is-active");
		} catch (err) {
			errorEl.innerText = "Unexpected error: " + err.message;
		}
	});

	// Logout
	logoutBtn.addEventListener("click", async () => {
		const { error } = await supabase.auth.signOut();
		if (error) {
			console.error("Logout error:", error);
		} else {
			console.log("Logged out");
			checkAuthState();
		}
	});
}

async function checkAuthState() {
	const { data } = await supabase.auth.getSession();
	const loginBtn = document.getElementById("loginBtn");
	const logoutBtn = document.getElementById("logoutBtn");
	const userInfo = document.getElementById("userInfo");
	const userName = document.getElementById("userName");

	if (data.session) {
		loginBtn.style.display = "none";
		logoutBtn.style.display = "block";
		userInfo.style.display = "block";
		const userId = data.session.user.id;
		const email = data.session.user.email || "";
		const username = email.split("@")[0];
		localStorage.setItem("currentUserId", userId);
		userName.innerText = username;
		console.log("User logged in (username):", username);
		setupRealtimeListeners(userId);
	} else {
		loginBtn.style.display = "block";
		logoutBtn.style.display = "none";
		userInfo.style.display = "none";
		localStorage.removeItem("currentUserId");
	}
}

function setupRealtimeListeners(userId) {
	supabase
		.channel(`user:${userId}:followed`)
		.on(
			"postgres_changes",
			{
				event: "*",
				schema: "public",
				table: "followed_items",
				filter: `user_id=eq.${userId}`,
			},
			async (payload) => {
				console.log("User's followed item changed:", payload);
				const itemType = payload.new?.item_type;
				if (itemType === "player") {
					showNotification(
						"Player Updated",
						"A player you follow was updated"
					);
					renderPlayers();
				}
			}
		)
		.subscribe();
}

function showNotification(title, message) {
	const notification = document.createElement("div");
	notification.className = "notification is-info";
	notification.style.position = "fixed";
	notification.style.top = "20px";
	notification.style.right = "20px";
	notification.style.zIndex = "9999";
	notification.style.minWidth = "300px";

	notification.innerHTML = `
		<button class="delete"></button>
		<strong>${escapeHtml(title)}</strong><br>
		${escapeHtml(message)}
	`;

	document.body.appendChild(notification);
	setTimeout(() => notification.remove(), 5000);

	notification.querySelector(".delete").addEventListener("click", () => {
		notification.remove();
	});
}

/* -------------------------
   PLAYERS
   ------------------------- */
async function renderPlayers() {
	const container = document.getElementById("players-list");
	if (!container) return;

	container.innerHTML = `<div class="box has-background-dark has-text-white">Loading players...</div>`;

	const { data, error } = await supabase
		.from("players")
		.select("id,player_code,name,registration_date,region,created_at")
		.order("registration_date", { ascending: true });

	if (error) {
		console.error("Error loading players:", error);
		container.innerHTML = `<div class="notification is-danger">
			<strong>Error loading players</strong><br>
			${escapeHtml(error.message || "Unknown error occurred")}
		</div>`;
		return;
	}

	if (!data || data.length === 0) {
		container.innerHTML = `<div class="box has-background-dark has-text-white">No players yet.</div>`;
		return;
	}

	const currentUserId = localStorage.getItem("currentUserId");

	let followedPlayerIds = [];
	if (currentUserId) {
		const { data: followedData } = await supabase
			.from("followed_items")
			.select("item_id")
			.eq("user_id", currentUserId)
			.eq("item_type", "player");
		followedPlayerIds = followedData?.map((f) => f.item_id) || [];
	}

	container.innerHTML = "";
	const cols = document.createElement("div");
	cols.className = "columns is-multiline";

	data.forEach((p) => {
		const isFollowed = followedPlayerIds.includes(p.id);
		const col = document.createElement("div");
		col.className = "column is-one-quarter";
		col.innerHTML = `
      <div class="card">
        <div class="card-content">
          <p class="title is-6">${escapeHtml(p.name)}</p>
          <p class="subtitle is-7">Code: ${escapeHtml(p.player_code || "")}</p>
          <p class="has-text-grey">Region: ${escapeHtml(p.region || "")}</p>
        </div>
		<footer class="card-footer">
          ${
				currentUserId
					? `<button class="card-footer-item follow-btn" data-item-id="${
							p.id
					  }" data-item-type="player" style="background: none; border: none; color: #3273dc; cursor: pointer;">
            ${isFollowed ? "★ Following" : "☆ Follow"}
          </button>`
					: ""
			}
        </footer>
      </div>
    `;
		cols.appendChild(col);
	});

	container.appendChild(cols);

	document.querySelectorAll(".follow-btn").forEach((btn) => {
		btn.addEventListener("click", async (e) => {
			e.preventDefault();
			const itemId = btn.dataset.itemId;
			const itemType = btn.dataset.itemType;
			await toggleFollow(itemId, itemType);
		});
	});
}

async function toggleFollow(itemId, itemType) {
	const currentUserId = localStorage.getItem("currentUserId");

	if (!currentUserId) {
		alert("Please log in to follow items");
		return;
	}

	try {
		const { data: existing } = await supabase
			.from("followed_items")
			.select("id")
			.eq("user_id", currentUserId)
			.eq("item_type", itemType)
			.eq("item_id", itemId)
			.single();

		if (existing) {
			const { error } = await supabase
				.from("followed_items")
				.delete()
				.eq("id", existing.id);

			if (error) {
				console.error("Error unfollowing:", error);
				alert("Failed to unfollow");
				return;
			}

			showNotification("Unfollowed", `You unfollowed this ${itemType}`);
		} else {
			const { error } = await supabase
				.from("followed_items")
				.insert([
					{
						user_id: currentUserId,
						item_type: itemType,
						item_id: itemId,
					},
				]);

			if (error) {
				console.error("Error following:", error);
				alert("Failed to follow");
				return;
			}

			showNotification("Followed", `You're now following this ${itemType}`);
		}

		await renderPlayers();
	} catch (err) {
		console.error("Unexpected error toggling follow:", err);
		alert("Unexpected error. See console.");
	}
}

/* -------------------------
   PLAYER REGISTRATION
   ------------------------- */
function initPlayerRegistration() {
	const openBtn = document.getElementById("openRegisterPlayerBtn");
	const closeBtn = document.getElementById("closeRegisterPlayerModal");
	const cancelBtn = document.getElementById("cancelPlayerBtn");
	const submitBtn = document.getElementById("submitPlayerBtn");
	const modal = document.getElementById("registerPlayerModal");
	const errorEl = document.getElementById("playerRegisterError");
	const successEl = document.getElementById("playerRegisterSuccess");

	// Open modal
	openBtn.addEventListener("click", () => {
		modal.classList.add("is-active");
	});

	// Close modal
	const closeModal = () => {
		modal.classList.remove("is-active");
		// Clear form
		document.getElementById("playerName").value = "";
		document.getElementById("playerRegion").value = "";
		errorEl.textContent = "";
		successEl.textContent = "";
	};

	closeBtn.addEventListener("click", closeModal);
	cancelBtn.addEventListener("click", closeModal);

	// Close on background click
	modal.querySelector(".modal-background").addEventListener("click", closeModal);

	// Submit registration
	submitBtn.addEventListener("click", async () => {
		const name = document.getElementById("playerName").value.trim();
		const region = document.getElementById("playerRegion").value;

		errorEl.textContent = "";
		successEl.textContent = "";

		// Validation
		if (!name) {
			errorEl.textContent = "Player name is required";
			return;
		}

		if (!region) {
			errorEl.textContent = "Region is required";
			return;
		}

		try {
			submitBtn.classList.add("is-loading");

			// Insert player with current timestamp as registration_date
			const { data, error } = await supabase
				.from("players")
				.insert([
					{
						name,
						region,
						registration_date: new Date().toISOString(),
					},
				])
				.select();

			submitBtn.classList.remove("is-loading");

			if (error) {
				console.error("Error registering player:", error);
				errorEl.textContent = "Failed to register player: " + error.message;
				return;
			}

			successEl.textContent = "Player registered successfully!";
			
			// Refresh player list
			await renderPlayers();

			// Close modal after 1.5 seconds
			setTimeout(closeModal, 1500);
		} catch (err) {
			submitBtn.classList.remove("is-loading");
			console.error("Unexpected error:", err);
			errorEl.textContent = "Unexpected error occurred. Please try again.";
		}
	});
}

/* -------------------------
   UTILITIES
   ------------------------- */
function escapeHtml(unsafe) {
	if (unsafe == null) return "";
	return String(unsafe)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

/* -------------------------
   INITIALIZATION
   ------------------------- */
document.addEventListener("DOMContentLoaded", () => {
	initAuthUI();
	checkAuthState();
	renderPlayers();
	initPlayerRegistration();
});
