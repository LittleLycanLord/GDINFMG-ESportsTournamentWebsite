// script.js (ESM module)
// Assumes js/supabase.js exports `supabase` (createClient)
// Works with your DDL table/column names exactly as provided.

import { supabase } from "./supabase.js";

// Debug: Verify supabase client is initialized
console.log("Supabase client initialized:", !!supabase);
console.log("Supabase URL configured:", supabase?.supabaseUrl);

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

	// Login submit (username-based)
	submitLoginBtn.addEventListener("click", async () => {
		const username = document.getElementById("loginUsername").value.trim();
		const password = document.getElementById("loginPassword").value.trim();
		const errorEl = document.getElementById("loginError");
		errorEl.innerText = "";

		if (!username || !password) {
			errorEl.innerText = "Please enter username and password";
			return;
		}

		// synthesize an email for Supabase auth (client-only mapping)
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

	// Signup submit (username-based)
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

		// synthesize an email for Supabase auth (client-only mapping)
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
		// User is logged in
		loginBtn.style.display = "none";
		logoutBtn.style.display = "block";
		userInfo.style.display = "block";
		// display the username portion we synthesize (before the @)
		const userId = data.session.user.id;
		const email = data.session.user.email || "";
		const username = email.split("@")[0];
		localStorage.setItem("currentUserId", userId);

		userName.innerText = username;
		console.log("User logged in (username):", username);
		setupRealtimeListeners(userId);
	} else {
		// User is not logged in
		loginBtn.style.display = "block";
		logoutBtn.style.display = "none";
		userInfo.style.display = "none";
		localStorage.removeItem("currentUserId");
	}
}

//shows notif to userid's followed items changes
function setupRealtimeListeners(userId) {
    // Listen to followed_items table for this user
    supabase
        .channel(`user:${userId}:followed`)
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "followed_items",
                filter: `user_id=eq.${userId}`, // <-- ONLY this user's follows
            },
            async (payload) => {
                console.log("User's followed item changed:", payload);
                
                // Determine what type was followed (tournament, team, player)
                const itemType = payload.new?.item_type;
                const itemId = payload.new?.item_id;

                if (itemType === "tournament") {
                    showNotification(
                        "Tournament Updated",
                        "A tournament you follow was updated"
                    );
                    renderTournaments(); // refresh
                } else if (itemType === "team") {
                    showNotification(
                        "Team Updated",
                        "A team you follow was updated"
                    );
                    renderTeams();
                } else if (itemType === "player") {
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

// Simple notification toast
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

    // Auto-remove after 5 seconds
    setTimeout(() => notification.remove(), 5000);

    // Close button
    notification.querySelector(".delete").addEventListener("click", () => {
        notification.remove();
    });
}

// Toggle follow/unfollow an item
async function toggleFollow(itemId, itemType) {
    const currentUserId = localStorage.getItem("currentUserId");
    
    if (!currentUserId) {
        alert("Please log in to follow items");
        return;
    }

    try {
        // Check if already following
        const { data: existing } = await supabase
            .from("followed_items")
            .select("id")
            .eq("user_id", currentUserId)
            .eq("item_type", itemType)
            .eq("item_id", itemId)
            .single();

        if (existing) {
            // Unfollow
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
            // Follow
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

        // Refresh the view to update button state
        if (itemType === "tournament") {
            await renderTournaments();
        } else if (itemType === "team") {
            await renderTeams();
        } else if (itemType === "player") {
            await renderPlayers();
        }
    } catch (err) {
        console.error("Unexpected error toggling follow:", err);
        alert("Unexpected error. See console.");
    }
}

document.addEventListener("DOMContentLoaded", () => {
	// Initialize auth UI
	initAuthUI();
	
	// Check auth state on load
	checkAuthState();

	// load initial UI
	renderTournaments();

	// Event delegation for tournament view links
	document.addEventListener("click", (e) => {
		if (e.target.classList.contains("view-tournament")) {
			e.preventDefault();
			const tournamentId = e.target.dataset.tournamentId;
			if (tournamentId) {
				// For now, just log - you can implement a modal or detail view later
				console.log("View tournament:", tournamentId);
				alert(
					`Tournament ID: ${tournamentId}\n\nDetail view coming soon!`
				);
			}
		}
	});
}); /* -------------------------
   TOURNAMENTS
   ------------------------- */
export async function renderTournaments() {
	const container = document.getElementById("tournament-list");
	if (!container) return;

	container.innerHTML = `<div class="box has-background-dark has-text-white">Loading tournaments...</div>`;

	const { data, error } = await supabase
		.from("tournaments")
		.select(
			`
      id,
      tournament_code,
      name,
      registration_date,
      location,
      schedule,
      created_at,
      updated_at,
      events:events(id, event_code, name, game_title, schedule)
    `
		)
		.order("registration_date", { ascending: true });

	if (error) {
		console.error("Error fetching tournaments:", error);
		container.innerHTML = `<div class="notification is-danger">
			<strong>Error loading tournaments</strong><br>
			${escapeHtml(error.message || "Unknown error occurred")}
		</div>`;
		return;
	}

	if (!data || data.length === 0) {
		container.innerHTML = `<div class="box has-background-dark has-text-white"><strong>No tournaments yet.</strong></div>`;
		return;
	}

	// Get current user ID
    const currentUserId = localStorage.getItem("currentUserId");

	// Fetch followed items for this user
    let followedTournamentIds = [];
    if (currentUserId) {
        const { data: followedData } = await supabase
            .from("followed_items")
            .select("item_id")
            .eq("user_id", currentUserId)
            .eq("item_type", "tournament");
        followedTournamentIds = followedData?.map(f => f.item_id) || [];
    }

	// render accordion-style tournament list
	container.innerHTML = "";
	const accordionContainer = document.createElement("div");
	accordionContainer.className = "tournament-accordion";

	data.forEach((t) => {
		const sch = formatRange(t.schedule);
		const regDate = formatDateTime(t.registration_date);
		const isFollowed = followedTournamentIds.includes(t.id);
		
		const eventsHtml =
			t.events && t.events.length
				? `
          <div class="tournament-detail-item">
            <strong class="detail-label">Event Lineup</strong>
            <ul class="event-list">
              ${t.events
					.map(
						(e) =>
							`<li>
								<span class="event-name">${escapeHtml(e.name)}</span>
								<span class="event-game">${escapeHtml(e.game_title)}</span>
								<span class="event-schedule">${formatRange(e.schedule)}</span>
							</li>`
					)
					.join("")}
            </ul>
          </div>`
				: `<div class="tournament-detail-item"><p class="has-text-grey">No events scheduled</p></div>`;

		const tournamentItem = document.createElement("div");
		tournamentItem.className = "tournament-item";
		tournamentItem.dataset.tournamentId = t.id;
		tournamentItem.innerHTML = `
      <button class="tournament-header" data-tournament-id="${t.id}">
        <div class="tournament-header-content">
          <h3 class="tournament-name">${escapeHtml(t.name)}</h3>
          <span class="tournament-location">${escapeHtml(t.location || "Location TBD")}</span>
        </div>
        <span class="expand-icon">▼</span>
      </button>
      <div class="tournament-details" style="display: none;">
        <div class="tournament-details-grid">
          <div class="tournament-detail-item">
            <strong class="detail-label">Tournament Code</strong>
            <p>${escapeHtml(t.tournament_code || "N/A")}</p>
          </div>
          <div class="tournament-detail-item">
            <strong class="detail-label">Registration Date</strong>
            <p>${escapeHtml(regDate)}</p>
          </div>
          <div class="tournament-detail-item">
            <strong class="detail-label">Schedule</strong>
            <p>${escapeHtml(sch)}</p>
          </div>
          <div class="tournament-detail-item">
            <strong class="detail-label">Location</strong>
            <p>${escapeHtml(t.location || "TBD")}</p>
          </div>
          ${eventsHtml}
          <div class="tournament-detail-item">
            <strong class="detail-label">Sponsors</strong>
            <p class="has-text-grey">Coming soon</p>
          </div>
        </div>
        <div class="tournament-actions">
          ${currentUserId ? `<button class="button is-small follow-btn" data-item-id="${t.id}" data-item-type="tournament">
            ${isFollowed ? '★ Following' : '☆ Follow'}
          </button>` : ''}
        </div>
      </div>
    `;
		accordionContainer.appendChild(tournamentItem);
	});

	container.appendChild(accordionContainer);

	// Add event listeners for accordion toggle
	document.querySelectorAll(".tournament-header").forEach((btn) => {
		btn.addEventListener("click", (e) => {
			const tournamentId = btn.dataset.tournamentId;
			const tournamentItem = btn.closest(".tournament-item");
			const details = tournamentItem.querySelector(".tournament-details");
			const icon = btn.querySelector(".expand-icon");
			const isExpanded = details.style.display !== "none";

			// Collapse all other tournaments
			document.querySelectorAll(".tournament-item").forEach((item) => {
				if (item.dataset.tournamentId !== tournamentId) {
					const otherDetails = item.querySelector(".tournament-details");
					const otherIcon = item.querySelector(".expand-icon");
					otherDetails.style.display = "none";
					otherIcon.textContent = "▼";
					item.classList.remove("expanded");
				}
			});

			// Toggle current tournament
			if (isExpanded) {
				details.style.display = "none";
				icon.textContent = "▼";
				tournamentItem.classList.remove("expanded");
			} else {
				details.style.display = "block";
				icon.textContent = "▲";
				tournamentItem.classList.add("expanded");
			}
		});
	});

	// Add event listeners to follow buttons
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

/* -------------------------
   CREATE TOURNAMENT (dev / temp)
   ------------------------- */
async function handleCreateTournament() {
	const name = document.getElementById("tname")?.value?.trim();
	const game = document.getElementById("tgame")?.value?.trim(); // optional; used if you want to create an event too
	const dateVal = document.getElementById("tdate")?.value; // registration_date
	const location =
		document.getElementById("tlocation")?.value?.trim() || "TBD"; // optional input if you add one
	// schedule start/end inputs (optional fields in your form - if not present we will create a 1-day schedule)
	const scheduleStart =
		document.getElementById("schedule_start")?.value || null; // ISO dt input expected
	const scheduleEnd = document.getElementById("schedule_end")?.value || null;

	if (!name || !dateVal) {
		return alert(
			"Please enter at least a tournament name and registration date."
		);
	}

	// Build schedule as Postgres tstzrange literal: [start_iso,end_iso)
	// If start/end not provided, use registration_date as single-day schedule window
	let scheduleRange;
	if (scheduleStart && scheduleEnd) {
		// Ensure ISO strings - assume user input like 2025-06-01T09:00 (local). Convert to ISO with timezone
		const sISO = toUTCISOString(scheduleStart);
		const eISO = toUTCISOString(scheduleEnd);
		scheduleRange = `[${sISO},${eISO})`;
	} else {
		// fallback: make schedule from registration_date midnight to +1 day
		const start = new Date(dateVal);
		const sISO = new Date(
			start.getFullYear(),
			start.getMonth(),
			start.getDate(),
			9,
			0,
			0
		).toISOString(); // 09:00 local as default
		const e = new Date(
			start.getFullYear(),
			start.getMonth(),
			start.getDate(),
			23,
			59,
			59
		);
		const eISO = e.toISOString();
		scheduleRange = `[${sISO},${eISO})`;
	}

	try {
		// Insert into tournaments - note schedule is a tstzrange column; we send range literal string
		const insertObj = {
			tournament_code: null, // optional, let DB or later admin set
			name,
			registration_date: dateVal, // send date string; supabase will cast
			location,
			schedule: scheduleRange,
		};

		const { data, error } = await supabase
			.from("tournaments")
			.insert([insertObj])
			.select();

		if (error) {
			console.error("Insert tournament error:", error);
			alert("Failed to create tournament: " + error.message);
			return;
		}

		alert("Tournament created.");
		// refresh
		await renderTournaments();

		// optionally create a default event if game provided
		if (game && data && data[0] && data[0].id) {
			await createEventForTournament(
				data[0].id,
				game,
				name + " - Event 1",
				scheduleRange
			);
		}
	} catch (err) {
		console.error("Unexpected error creating tournament", err);
		alert("Unexpected error. See console.");
	}
}

/* create a sample event for tournament */
async function createEventForTournament(
	tournament_id,
	game_title,
	eventName,
	scheduleRange
) {
	const insertObj = {
		tournament_id,
		event_code: null,
		name: eventName,
		registration_date: new Date().toISOString(),
		game_title,
		location: "Main Venue",
		schedule: scheduleRange,
	};

	const { data, error } = await supabase
		.from("events")
		.insert([insertObj])
		.select();

	if (error) {
		console.error("Error creating event:", error);
	} else {
		console.log("Created event:", data);
		// re-render tournaments to show events (renderTournaments already fetches events)
		await renderTournaments();
	}
}

/* -------------------------
   TEAMS
   ------------------------- */
export async function renderTeams() {
	const container = document.getElementById("teams-list");
	if (!container) return;

	container.innerHTML = `<div class="box has-background-dark has-text-white">Loading teams...</div>`;

	const { data, error } = await supabase
		.from("teams")
		.select(
			"id,team_code,name,registration_date,region,leader_player_id,created_at"
		)
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

	// Get current user ID
    const currentUserId = localStorage.getItem("currentUserId");

    // Fetch followed items for this user
    let followedTeamIds = [];
    if (currentUserId) {
        const { data: followedData } = await supabase
            .from("followed_items")
            .select("item_id")
            .eq("user_id", currentUserId)
            .eq("item_type", "team");
        followedTeamIds = followedData?.map(f => f.item_id) || [];
    }

	container.innerHTML = "";
	const cols = document.createElement("div");
	cols.className = "columns is-multiline";

	data.forEach((team) => {
		const isFollowed = followedTeamIds.includes(team.id);
		const col = document.createElement("div");
		col.className = "column is-one-third";
		col.innerHTML = `
      <div class="card">
        <div class="card-content">
          <p class="title is-5">${escapeHtml(team.name)}</p>
          <p class="subtitle is-6">Code: ${escapeHtml(team.team_code || "")}</p>
          <p class="has-text-grey">Region: ${escapeHtml(team.region || "")}</p>
        </div>
		<footer class="card-footer">
          ${currentUserId ? `<button class="card-footer-item follow-btn" data-item-id="${team.id}" data-item-type="team" style="background: none; border: none; color: #3273dc; cursor: pointer;">
            ${isFollowed ? '★ Following' : '☆ Follow'}
          </button>` : ''}
        </footer>
      </div>
    `;
		cols.appendChild(col);
	});

	container.appendChild(cols);

	// Add event listeners to follow buttons
    document.querySelectorAll(".follow-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
            e.preventDefault();
            const itemId = btn.dataset.itemId;
            const itemType = btn.dataset.itemType;
            await toggleFollow(itemId, itemType);
        });
    });
}

/* -------------------------
   PLAYERS
   ------------------------- */
export async function renderPlayers() {
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

	// Get current user ID
    const currentUserId = localStorage.getItem("currentUserId");

    // Fetch followed items for this user
    let followedPlayerIds = [];
    if (currentUserId) {
        const { data: followedData } = await supabase
            .from("followed_items")
            .select("item_id")
            .eq("user_id", currentUserId)
            .eq("item_type", "player");
        followedPlayerIds = followedData?.map(f => f.item_id) || [];
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
          ${currentUserId ? `<button class="card-footer-item follow-btn" data-item-id="${p.id}" data-item-type="player" style="background: none; border: none; color: #3273dc; cursor: pointer;">
            ${isFollowed ? '★ Following' : '☆ Follow'}
          </button>` : ''}
        </footer>
      </div>
    `;
		cols.appendChild(col);
	});

	container.appendChild(cols);

	// Add event listeners to follow buttons
    document.querySelectorAll(".follow-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
            e.preventDefault();
            const itemId = btn.dataset.itemId;
            const itemType = btn.dataset.itemType;
            await toggleFollow(itemId, itemType);
        });
    });
}

/* -------------------------
   PARTICIPANTS / EVENT_PARTICIPANTS
   ------------------------- */
export async function renderEventParticipants(event_id) {
	// list participants for an event (joins event_participants -> participants -> players/teams)
	const container = document.getElementById("participants-list");
	if (!container) return;

	container.innerHTML = `<div class="box has-background-dark has-text-white">Loading participants...</div>`;

	// We will select from event_participants and expand participant row via foreign keys
	const { data, error } = await supabase
		.from("event_participants")
		.select(
			`
      id,
      seed,
      participant:participants (
        id,
        participant_code,
        player_id,
        team_id,
        created_at,
        player:players(id, name, player_code),
        team:teams(id, name, team_code)
      )
    `
		)
		.eq("event_id", event_id)
		.order("seed", { ascending: true });

	if (error) {
		console.error("Error loading event participants:", error);
		container.innerHTML = `<div class="notification is-danger">
			<strong>Error loading participants</strong><br>
			${escapeHtml(error.message || "Unknown error occurred")}
		</div>`;
		return;
	}

	if (!data || data.length === 0) {
		container.innerHTML = `<div class="box has-background-dark has-text-white">No participants for this event.</div>`;
		return;
	}

	container.innerHTML = "";
	const list = document.createElement("div");
	data.forEach((row) => {
		const part = row.participant;
		let label = "Unknown";
		if (part.player) label = `${escapeHtml(part.player.name)} (player)`;
		else if (part.team) label = `${escapeHtml(part.team.name)} (team)`;
		const item = document.createElement("div");
		item.className = "box has-background-dark has-text-white";
		item.innerHTML = `<strong>Seed ${row.seed}</strong>: ${label}`;
		list.appendChild(item);
	});

	container.appendChild(list);
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

function formatDateTime(dt) {
	if (!dt) return "";
	const d = new Date(dt);
	if (isNaN(d)) return dt;
	return d.toLocaleString();
}

/* format tstzrange like "[2025-06-01T09:00:00Z,2025-06-02T18:00:00Z)" to a human string */
function formatRange(rangeStr) {
	if (!rangeStr) return "TBD";
	try {
		// naive parse: remove leading [ or ( and trailing ) or ]
		const inner = rangeStr.replace(/^\[|\(|\]|\)$/g, "");
		const [start, end] = inner.split(",");
		const s = start ? new Date(start).toLocaleString() : "";
		const e = end ? new Date(end).toLocaleString() : "";
		return `${s} — ${e}`;
	} catch (e) {
		return String(rangeStr);
	}
}

/* Convert an input value (date or datetime string) to an ISO string with timezone (UTC) */
function toUTCISOString(inputValue) {
	// If input contains 'T', assume full datetime, otherwise treat as date only
	try {
		let d;
		if (inputValue.includes("T")) {
			d = new Date(inputValue);
		} else {
			// date only: create date at 09:00 local time to avoid timezone day-shift
			d = new Date(inputValue + "T09:00:00");
		}
		return d.toISOString();
	} catch (e) {
		return inputValue;
	}
}
