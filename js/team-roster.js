// team-roster.js (ESM module)
// Handles team roster display with authentication and follow functionality

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
				if (itemType === "team") {
					showNotification(
						"Team Updated",
						"A team you follow was updated"
					);
					renderTeams();
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
   TEAMS
   ------------------------- */
async function renderTeams() {
	const container = document.getElementById("teams-list");
	if (!container) return;

	container.innerHTML = `<div class="box has-background-dark has-text-white">Loading teams...</div>`;

	// Fetch teams with leader information
	const { data, error } = await supabase
		.from("teams")
		.select(`
			id,
			team_code,
			name,
			registration_date,
			region,
			leader_player_id,
			created_at,
			leader:leader_player_id(id, name, player_code)
		`)
		.order("registration_date", { ascending: true });

	if (error) {
		console.error("Error loading teams:", error);
		container.innerHTML = `<div class="notification is-danger">
			<strong>Error loading teams</strong><br>
			${escapeHtml(error.message || "Unknown error occurred")}
		</div>`;
		return;
	}

	if (!data || data.length === 0) {
		container.innerHTML = `<div class="box has-background-dark has-text-white">No teams yet.</div>`;
		return;
	}

	const currentUserId = localStorage.getItem("currentUserId");

	let followedTeamIds = [];
	if (currentUserId) {
		const { data: followedData } = await supabase
			.from("followed_items")
			.select("item_id")
			.eq("user_id", currentUserId)
			.eq("item_type", "team");
		followedTeamIds = followedData?.map((f) => f.item_id) || [];
	}

	// Fetch team members for all teams
	const teamIds = data.map(t => t.id);
	const { data: membersData } = await supabase
		.from("team_members")
		.select(`
			team_id,
			player:player_id(id, name, player_code)
		`)
		.in("team_id", teamIds)
		.is("left_at", null)
		.order("joined_at", { ascending: true });

	// Group members by team
	const teamMembersMap = {};
	if (membersData) {
		membersData.forEach(member => {
			if (!teamMembersMap[member.team_id]) {
				teamMembersMap[member.team_id] = [];
			}
			if (member.player) {
				teamMembersMap[member.team_id].push(member.player);
			}
		});
	}

	container.innerHTML = "";
	const accordionContainer = document.createElement("div");
	accordionContainer.className = "team-accordion";

	data.forEach((team) => {
		const isFollowed = followedTeamIds.includes(team.id);
		const members = teamMembersMap[team.id] || [];
		
		const membersHtml = members.length > 0
			? `
				<div class="team-detail-item">
					<strong class="detail-label">Team Members (${members.length})</strong>
					<ul class="member-list">
						${members.map(member => `
							<li>
								<span class="member-name">${escapeHtml(member.name)}</span>
								${member.player_code ? `<span class="member-code">${escapeHtml(member.player_code)}</span>` : ''}
							</li>
						`).join('')}
					</ul>
				</div>
			`
			: `<div class="team-detail-item"><p class="has-text-grey">No members yet</p></div>`;

		const leaderHtml = team.leader
			? `
				<div class="team-detail-item">
					<strong class="detail-label">Team Leader</strong>
					<p>${escapeHtml(team.leader.name)} ${team.leader.player_code ? `(${escapeHtml(team.leader.player_code)})` : ''}</p>
				</div>
			`
			: '';

		const teamItem = document.createElement("div");
		teamItem.className = "team-item";
		teamItem.dataset.teamId = team.id;
		teamItem.innerHTML = `
			<button class="team-header" data-team-id="${team.id}">
				<div class="team-header-content">
					<h3 class="team-name">${escapeHtml(team.name)}</h3>
					<span class="team-region">${escapeHtml(team.region || "Region Unknown")}</span>
				</div>
				<span class="expand-icon">▼</span>
			</button>
			<div class="team-details" style="display: none;">
				<div class="team-details-grid">
					<div class="team-detail-item">
						<strong class="detail-label">Team Code</strong>
						<p>${escapeHtml(team.team_code || "N/A")}</p>
					</div>
					<div class="team-detail-item">
						<strong class="detail-label">Region</strong>
						<p>${escapeHtml(team.region || "Unknown")}</p>
					</div>
					${leaderHtml}
					${membersHtml}
				</div>
				<div class="team-actions">
					${currentUserId ? `<button class="button is-small follow-btn" data-item-id="${team.id}" data-item-type="team">
						${isFollowed ? '★ Following' : '☆ Follow'}
					</button>` : ''}
				</div>
			</div>
		`;
		accordionContainer.appendChild(teamItem);
	});

	container.appendChild(accordionContainer);

	// Add event listeners for accordion toggle
	document.querySelectorAll(".team-header").forEach((btn) => {
		btn.addEventListener("click", (e) => {
			const teamId = btn.dataset.teamId;
			const teamItem = btn.closest(".team-item");
			const details = teamItem.querySelector(".team-details");
			const icon = btn.querySelector(".expand-icon");
			const isExpanded = details.style.display !== "none";

			// Collapse all other teams
			document.querySelectorAll(".team-item").forEach((item) => {
				if (item.dataset.teamId !== teamId) {
					const otherDetails = item.querySelector(".team-details");
					const otherIcon = item.querySelector(".expand-icon");
					otherDetails.style.display = "none";
					otherIcon.textContent = "▼";
					item.classList.remove("expanded");
				}
			});

			// Toggle current team
			if (isExpanded) {
				details.style.display = "none";
				icon.textContent = "▼";
				teamItem.classList.remove("expanded");
			} else {
				details.style.display = "block";
				icon.textContent = "▲";
				teamItem.classList.add("expanded");
			}
		});
	});

	document.querySelectorAll(".follow-btn").forEach((btn) => {
		btn.addEventListener("click", async (e) => {
			e.preventDefault();
			e.stopPropagation(); // Prevent accordion toggle
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

		await renderTeams();
	} catch (err) {
		console.error("Unexpected error toggling follow:", err);
		alert("Unexpected error. See console.");
	}
}

/* -------------------------
   TEAM REGISTRATION
   ------------------------- */
function initTeamRegistration() {
	const openBtn = document.getElementById("openRegisterTeamBtn");
	const closeBtn = document.getElementById("closeRegisterTeamModal");
	const cancelBtn = document.getElementById("cancelTeamBtn");
	const submitBtn = document.getElementById("submitTeamBtn");
	const modal = document.getElementById("registerTeamModal");
	const errorEl = document.getElementById("teamRegisterError");
	const successEl = document.getElementById("teamRegisterSuccess");

	// Open modal and load players
	openBtn.addEventListener("click", async () => {
		modal.classList.add("is-active");
		await loadPlayersForTeam();
	});

	// Close modal
	const closeModal = () => {
		modal.classList.remove("is-active");
		// Clear form
		document.getElementById("teamName").value = "";
		document.getElementById("teamRegion").value = "";
		document.getElementById("teamLeader").value = "";
		// Clear selected members
		const membersSelect = document.getElementById("teamMembers");
		Array.from(membersSelect.options).forEach(opt => opt.selected = false);
		errorEl.textContent = "";
		successEl.textContent = "";
	};

	closeBtn.addEventListener("click", closeModal);
	cancelBtn.addEventListener("click", closeModal);

	// Close on background click
	modal.querySelector(".modal-background").addEventListener("click", closeModal);

	// Submit registration
	submitBtn.addEventListener("click", async () => {
		const name = document.getElementById("teamName").value.trim();
		const region = document.getElementById("teamRegion").value;
		const leaderId = document.getElementById("teamLeader").value || null;
		const membersSelect = document.getElementById("teamMembers");
		const selectedMembers = Array.from(membersSelect.selectedOptions).map(opt => opt.value);

		errorEl.textContent = "";
		successEl.textContent = "";

		// Validation
		if (!name) {
			errorEl.textContent = "Team name is required";
			return;
		}

		if (!region) {
			errorEl.textContent = "Region is required";
			return;
		}

		try {
			submitBtn.classList.add("is-loading");

			// Insert team with current timestamp as registration_date
			const { data: teamData, error: teamError } = await supabase
				.from("teams")
				.insert([
					{
						name,
						region,
						registration_date: new Date().toISOString(),
						leader_player_id: leaderId,
					},
				])
				.select();

			if (teamError) {
				console.error("Error registering team:", teamError);
				errorEl.textContent = "Failed to register team: " + teamError.message;
				submitBtn.classList.remove("is-loading");
				return;
			}

			const teamId = teamData[0].id;

			// Add team members
			const memberInserts = [];
			
			// If there's a leader and they're not in selected members, add them
			if (leaderId && !selectedMembers.includes(leaderId)) {
				memberInserts.push({
					team_id: teamId,
					player_id: leaderId,
					joined_at: new Date().toISOString(),
				});
			}

			// Add all selected members
			selectedMembers.forEach(playerId => {
				memberInserts.push({
					team_id: teamId,
					player_id: playerId,
					joined_at: new Date().toISOString(),
				});
			});

			// Insert team members if any
			if (memberInserts.length > 0) {
				const { error: membersError } = await supabase
					.from("team_members")
					.insert(memberInserts);

				if (membersError) {
					console.error("Error adding team members:", membersError);
					errorEl.textContent = "Team created but failed to add members: " + membersError.message;
					submitBtn.classList.remove("is-loading");
					return;
				}
			}

			submitBtn.classList.remove("is-loading");
			successEl.textContent = "Team registered successfully!";
			
			// Refresh team list
			await renderTeams();

			// Close modal after 1.5 seconds
			setTimeout(closeModal, 1500);
		} catch (err) {
			submitBtn.classList.remove("is-loading");
			console.error("Unexpected error:", err);
			errorEl.textContent = "Unexpected error occurred. Please try again.";
		}
	});
}

// Load players for team selection
async function loadPlayersForTeam() {
	const leaderSelect = document.getElementById("teamLeader");
	const membersSelect = document.getElementById("teamMembers");

	try {
		const { data, error } = await supabase
			.from("players")
			.select("id, name, player_code")
			.order("name", { ascending: true });

		if (error) {
			console.error("Error loading players:", error);
			return;
		}

		// Clear and populate leader dropdown
		leaderSelect.innerHTML = '<option value="">Select team leader (optional)</option>';
		
		// Clear and populate members dropdown
		membersSelect.innerHTML = '';

		if (data && data.length > 0) {
			data.forEach(player => {
				const displayName = player.player_code 
					? `${player.name} (${player.player_code})`
					: player.name;

				// Add to leader select
				const leaderOption = document.createElement("option");
				leaderOption.value = player.id;
				leaderOption.textContent = displayName;
				leaderSelect.appendChild(leaderOption);

				// Add to members select
				const memberOption = document.createElement("option");
				memberOption.value = player.id;
				memberOption.textContent = displayName;
				membersSelect.appendChild(memberOption);
			});
		} else {
			membersSelect.innerHTML = '<option value="" disabled>No players available</option>';
		}
	} catch (err) {
		console.error("Unexpected error loading players:", err);
		membersSelect.innerHTML = '<option value="" disabled>Error loading players</option>';
	}
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
	renderTeams();
	initTeamRegistration();
});
