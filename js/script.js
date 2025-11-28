// script.js (ESM module)
// Assumes js/supabase.js exports `supabase` (createClient)
// Works with your DDL table/column names exactly as provided.

import { supabase } from "./supabase.js";

// Debug: Verify supabase client is initialized
console.log("Supabase client initialized:", !!supabase);
console.log("Supabase URL configured:", supabase?.supabaseUrl);

document.addEventListener("DOMContentLoaded", () => {
	// load initial UI
	renderTournaments();
	renderTeams();
	renderPlayers();

	// wired to temp form in index.html (if present)
	const createBtn = document.getElementById("createTournamentBtn");
	if (createBtn) {
		createBtn.addEventListener("click", async () => {
			await handleCreateTournament();
		});
	}

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
      -- fetch related events count (optional)
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

	// render result grid
	container.innerHTML = "";
	const cols = document.createElement("div");
	cols.className = "columns is-multiline";

	data.forEach((t) => {
		const sch = formatRange(t.schedule);
		const regDate = formatDateTime(t.registration_date);
		const eventsHtml =
			t.events && t.events.length
				? `
      <div class="content">
        <strong>Events</strong>
        <ul>
          ${t.events
				.map(
					(e) =>
						`<li>${escapeHtml(e.name)} (${escapeHtml(
							e.game_title
						)}) — ${formatRange(e.schedule)}</li>`
				)
				.join("")}
        </ul>
      </div>`
				: `<p class="has-text-grey">No events</p>`;

		const col = document.createElement("div");
		col.className = "column is-one-third";
		col.innerHTML = `
      <div class="card">
        <header class="card-header">
          <p class="card-header-title">${escapeHtml(t.name)}</p>
        </header>
        <div class="card-content">
          <div class="content">
            <p><strong>Code:</strong> ${escapeHtml(t.tournament_code || "")}</p>
            <p><strong>Reg Date:</strong> ${escapeHtml(regDate)}</p>
            <p><strong>Location:</strong> ${escapeHtml(t.location || "")}</p>
            <p><strong>Schedule:</strong> ${escapeHtml(sch)}</p>
            ${eventsHtml}
          </div>
        </div>
        <footer class="card-footer">
          <a class="card-footer-item" href="#" data-id="${
				t.id
			}" onclick="window.open('/?tournament=' + '${
			t.id
		}', '_blank')">Open</a>
        </footer>
      </div>
    `;
		cols.appendChild(col);
	});

	container.appendChild(cols);
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

	container.innerHTML = "";
	const cols = document.createElement("div");
	cols.className = "columns is-multiline";

	data.forEach((team) => {
		const col = document.createElement("div");
		col.className = "column is-one-third";
		col.innerHTML = `
      <div class="card">
        <div class="card-content">
          <p class="title is-5">${escapeHtml(team.name)}</p>
          <p class="subtitle is-6">Code: ${escapeHtml(team.team_code || "")}</p>
          <p class="has-text-grey">Region: ${escapeHtml(team.region || "")}</p>
        </div>
      </div>
    `;
		cols.appendChild(col);
	});

	container.appendChild(cols);
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

	container.innerHTML = "";
	const cols = document.createElement("div");
	cols.className = "columns is-multiline";

	data.forEach((p) => {
		const col = document.createElement("div");
		col.className = "column is-one-quarter";
		col.innerHTML = `
      <div class="card">
        <div class="card-content">
          <p class="title is-6">${escapeHtml(p.name)}</p>
          <p class="subtitle is-7">Code: ${escapeHtml(p.player_code || "")}</p>
          <p class="has-text-grey">Region: ${escapeHtml(p.region || "")}</p>
        </div>
      </div>
    `;
		cols.appendChild(col);
	});

	container.appendChild(cols);
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
