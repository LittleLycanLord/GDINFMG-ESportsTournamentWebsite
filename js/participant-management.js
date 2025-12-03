import { supabase } from "./supabase.js";

let selectedEventId = null;
let teamMemberCounter = 0;

document.addEventListener("DOMContentLoaded", () => {
	// Load tournaments and players
	loadTournaments();
	loadPlayers();
	loadTeams();

	// Event listeners
	document.getElementById("tournament-select").addEventListener("change", onTournamentChange);
	document.getElementById("event-select").addEventListener("change", onEventChange);
	document.getElementById("load-participants-btn").addEventListener("click", loadParticipants);
	
	// Participant type radio buttons
	document.querySelectorAll('input[name="participant-type"]').forEach(radio => {
		radio.addEventListener("change", onParticipantTypeChange);
	});

	// Player selection radio buttons
	document.querySelectorAll('input[name="player-selection"]').forEach(radio => {
		radio.addEventListener("change", onPlayerSelectionChange);
	});

	// Team selection radio buttons
	document.querySelectorAll('input[name="team-selection"]').forEach(radio => {
		radio.addEventListener("change", onTeamSelectionChange);
	});

	// Add team member button
	document.getElementById("add-team-member-btn")?.addEventListener("click", addTeamMemberForm);

	// Add participant button
	document.getElementById("add-participant-btn").addEventListener("click", handleAddParticipant);
});

async function loadTournaments() {
	const select = document.getElementById("tournament-select");
	
	const { data, error } = await supabase
		.from("tournaments")
		.select("id, name, tournament_code")
		.order("created_at", { ascending: false });

	if (error) {
		console.error("Error loading tournaments:", error);
		select.innerHTML = '<option value="">Error loading tournaments</option>';
		return;
	}

	if (!data || data.length === 0) {
		select.innerHTML = '<option value="">No tournaments available</option>';
		return;
	}

	select.innerHTML = '<option value="">Select a tournament</option>';
	data.forEach(tournament => {
		const option = document.createElement("option");
		option.value = tournament.id;
		option.textContent = `${tournament.tournament_code} - ${tournament.name}`;
		select.appendChild(option);
	});
}

async function onTournamentChange(e) {
	const tournamentId = e.target.value;
	const eventSelect = document.getElementById("event-select");
	const loadBtn = document.getElementById("load-participants-btn");

	if (!tournamentId) {
		eventSelect.innerHTML = '<option value="">Select a tournament first</option>';
		eventSelect.disabled = true;
		loadBtn.disabled = true;
		return;
	}

	// Load events for this tournament
	const { data, error } = await supabase
		.from("events")
		.select("id, name, event_code, game_title")
		.eq("tournament_id", tournamentId)
		.order("created_at", { ascending: true });

	if (error) {
		console.error("Error loading events:", error);
		eventSelect.innerHTML = '<option value="">Error loading events</option>';
		eventSelect.disabled = true;
		return;
	}

	if (!data || data.length === 0) {
		eventSelect.innerHTML = '<option value="">No events for this tournament</option>';
		eventSelect.disabled = true;
		loadBtn.disabled = true;
		return;
	}

	eventSelect.innerHTML = '<option value="">Select an event</option>';
	data.forEach(event => {
		const option = document.createElement("option");
		option.value = event.id;
		option.textContent = `${event.event_code} - ${event.name} (${event.game_title})`;
		eventSelect.appendChild(option);
	});
	eventSelect.disabled = false;
}

async function onEventChange(e) {
	const eventId = e.target.value;
	const loadBtn = document.getElementById("load-participants-btn");
	
	if (!eventId) {
		loadBtn.disabled = true;
		selectedEventId = null;
		return;
	}

	selectedEventId = eventId;
	loadBtn.disabled = false;
}

async function loadParticipants() {
	if (!selectedEventId) return;

	// Show sections
	document.getElementById("participants-section").style.display = "block";
	document.getElementById("participants-divider").style.display = "block";
	document.getElementById("add-participant-section").style.display = "block";

	const container = document.getElementById("participants-list");
	container.innerHTML = '<div class="has-text-white">Loading participants...</div>';

	const { data, error } = await supabase
		.from("event_participants")
		.select(`
			seed,
			participant:participants(
				id,
				participant_code,
				player:players(id, player_code, name),
				team:teams(id, team_code, name)
			)
		`)
		.eq("event_id", selectedEventId)
		.order("seed", { ascending: true });

	if (error) {
		console.error("Error loading participants:", error);
		container.innerHTML = `<div class="notification is-danger">${escapeHtml(error.message)}</div>`;
		return;
	}

	if (!data || data.length === 0) {
		container.innerHTML = '<div class="has-text-white">No participants yet.</div>';
		return;
	}

	// Render participants table
	container.innerHTML = "";
	const table = document.createElement("table");
	table.className = "table is-fullwidth is-hoverable has-background-grey-dark has-text-white";
	table.innerHTML = `
		<thead>
			<tr>
				<th class="has-text-white">Seed</th>
				<th class="has-text-white">Type</th>
				<th class="has-text-white">Code</th>
				<th class="has-text-white">Name</th>
				<th class="has-text-white">Actions</th>
			</tr>
		</thead>
		<tbody id="participants-tbody"></tbody>
	`;
	container.appendChild(table);

	const tbody = document.getElementById("participants-tbody");
	data.forEach(row => {
		const participant = row.participant;
		const isPlayer = participant.player !== null;
		const entity = isPlayer ? participant.player : participant.team;
		
		const tr = document.createElement("tr");
		tr.innerHTML = `
			<td>${row.seed || "N/A"}</td>
			<td>${isPlayer ? "Player" : "Team"}</td>
			<td>${escapeHtml(entity.player_code || entity.team_code)}</td>
			<td>${escapeHtml(entity.name)}</td>
			<td>
				<button class="button is-small is-danger remove-participant-btn" 
					data-participant-id="${participant.id}">Remove</button>
			</td>
		`;
		tbody.appendChild(tr);
	});

	// Add event listeners for remove buttons
	document.querySelectorAll(".remove-participant-btn").forEach(btn => {
		btn.addEventListener("click", async (e) => {
			const participantId = e.target.dataset.participantId;
			await removeParticipant(participantId);
		});
	});
}

async function loadPlayers() {
	const selects = [
		document.getElementById("player-select"),
		document.getElementById("team-leader-select")
	];

	const { data, error } = await supabase
		.from("players")
		.select("id, player_code, name, region")
		.order("name", { ascending: true });

	if (error) {
		console.error("Error loading players:", error);
		selects.forEach(select => {
			if (select) select.innerHTML = '<option value="">Error loading players</option>';
		});
		return;
	}

	if (!data || data.length === 0) {
		selects.forEach(select => {
			if (select) select.innerHTML = '<option value="">No players available</option>';
		});
		return;
	}

	selects.forEach(select => {
		if (!select) return;
		select.innerHTML = '<option value="">Select a player</option>';
		data.forEach(player => {
			const option = document.createElement("option");
			option.value = player.id;
			option.textContent = `${player.player_code} - ${player.name} (${player.region})`;
			select.appendChild(option);
		});
	});
}

async function loadTeams() {
	const select = document.getElementById("team-select");

	const { data, error } = await supabase
		.from("teams")
		.select("id, team_code, name, region")
		.order("name", { ascending: true });

	if (error) {
		console.error("Error loading teams:", error);
		select.innerHTML = '<option value="">Error loading teams</option>';
		return;
	}

	if (!data || data.length === 0) {
		select.innerHTML = '<option value="">No teams available</option>';
		return;
	}

	select.innerHTML = '<option value="">Select a team</option>';
	data.forEach(team => {
		const option = document.createElement("option");
		option.value = team.id;
		option.textContent = `${team.team_code} - ${team.name} (${team.region})`;
		select.appendChild(option);
	});
}

function onParticipantTypeChange(e) {
	const type = e.target.value;
	const playerForm = document.getElementById("player-form");
	const teamForm = document.getElementById("team-form");

	if (type === "player") {
		playerForm.style.display = "block";
		teamForm.style.display = "none";
	} else {
		playerForm.style.display = "none";
		teamForm.style.display = "block";
	}
}

function onPlayerSelectionChange(e) {
	const selection = e.target.value;
	const existingSection = document.getElementById("existing-player-section");
	const newSection = document.getElementById("new-player-section");

	if (selection === "existing") {
		existingSection.style.display = "block";
		newSection.style.display = "none";
	} else {
		existingSection.style.display = "none";
		newSection.style.display = "block";
	}
}

function onTeamSelectionChange(e) {
	const selection = e.target.value;
	const existingSection = document.getElementById("existing-team-section");
	const newSection = document.getElementById("new-team-section");

	if (selection === "existing") {
		existingSection.style.display = "block";
		newSection.style.display = "none";
	} else {
		existingSection.style.display = "none";
		newSection.style.display = "block";
	}
}

function addTeamMemberForm() {
	teamMemberCounter++;
	const container = document.getElementById("team-members-container");
	
	const memberDiv = document.createElement("div");
	memberDiv.className = "box has-background-grey-lighter mb-2";
	memberDiv.dataset.memberId = teamMemberCounter;
	memberDiv.innerHTML = `
		<div class="columns">
			<div class="column">
				<div class="field">
					<label class="label is-small">Team Member</label>
					<div class="control">
						<div class="select is-fullwidth is-small">
							<select class="team-member-select">
								<option value="">Loading players...</option>
							</select>
						</div>
					</div>
				</div>
			</div>
			<div class="column is-narrow">
				<label class="label is-small" style="visibility: hidden;">Remove</label>
				<button class="button is-danger is-small remove-member-btn" data-member-id="${teamMemberCounter}" type="button">×</button>
			</div>
		</div>
	`;
	
	container.appendChild(memberDiv);

	// Populate the select with players
	const memberSelect = memberDiv.querySelector(".team-member-select");
	populatePlayerSelect(memberSelect);

	// Add remove event listener
	const removeBtn = memberDiv.querySelector(".remove-member-btn");
	removeBtn.addEventListener("click", (e) => {
		const memberId = e.target.dataset.memberId;
		removeTeamMemberForm(memberId);
	});
}

function removeTeamMemberForm(memberId) {
	const memberDiv = document.querySelector(`[data-member-id="${memberId}"]`);
	if (memberDiv) {
		memberDiv.remove();
	}
}

async function populatePlayerSelect(selectElement) {
	const { data, error } = await supabase
		.from("players")
		.select("id, player_code, name")
		.order("name", { ascending: true });

	if (error) {
		console.error("Error loading players:", error);
		selectElement.innerHTML = '<option value="">Error loading players</option>';
		return;
	}

	if (!data || data.length === 0) {
		selectElement.innerHTML = '<option value="">No players available</option>';
		return;
	}

	selectElement.innerHTML = '<option value="">Select a player</option>';
	data.forEach(player => {
		const option = document.createElement("option");
		option.value = player.id;
		option.textContent = `${player.player_code} - ${player.name}`;
		selectElement.appendChild(option);
	});
}

async function handleAddParticipant() {
	if (!selectedEventId) {
		alert("Please select an event first.");
		return;
	}

	const participantType = document.querySelector('input[name="participant-type"]:checked').value;
	const seed = document.getElementById("participant-seed").value || null;

	try {
		if (participantType === "player") {
			await addPlayerParticipant(seed);
		} else {
			await addTeamParticipant(seed);
		}
	} catch (err) {
		console.error("Error adding participant:", err);
		alert("Failed to add participant. See console for details.");
	}
}

async function addPlayerParticipant(seed) {
	const playerSelection = document.querySelector('input[name="player-selection"]:checked').value;
	let playerId;

	if (playerSelection === "existing") {
		playerId = document.getElementById("player-select").value;
		if (!playerId) {
			alert("Please select a player.");
			return;
		}
	} else {
		// Create new player
		const name = document.getElementById("new-player-name").value.trim();
		const region = document.getElementById("new-player-region").value.trim();

		if (!name) {
			alert("Please enter a player name.");
			return;
		}

		// Generate player code
		const { count, error: countError } = await supabase
			.from("players")
			.select("*", { count: "exact", head: true });

		if (countError) {
			console.error("Error counting players:", countError);
			alert("Failed to generate player code.");
			return;
		}

		const playerNumber = (count || 0) + 1;
		const playerCode = `P${String(playerNumber).padStart(4, '0')}`;
		const registrationDate = new Date().toISOString().split('T')[0];

		const { data: playerData, error: playerError } = await supabase
			.from("players")
			.insert([{
				player_code: playerCode,
				name: name,
				registration_date: registrationDate,
				region: region || "Unknown"
			}])
			.select();

		if (playerError) {
			console.error("Error creating player:", playerError);
			alert("Failed to create player: " + playerError.message);
			return;
		}

		playerId = playerData[0].id;
	}

	// Create participant
	await createParticipant(playerId, null, seed);
}

async function addTeamParticipant(seed) {
	const teamSelection = document.querySelector('input[name="team-selection"]:checked').value;
	let teamId;

	if (teamSelection === "existing") {
		teamId = document.getElementById("team-select").value;
		if (!teamId) {
			alert("Please select a team.");
			return;
		}
	} else {
		// Create new team
		const name = document.getElementById("new-team-name").value.trim();
		const region = document.getElementById("new-team-region").value.trim();
		const leaderId = document.getElementById("team-leader-select").value;

		if (!name) {
			alert("Please enter a team name.");
			return;
		}

		if (!leaderId) {
			alert("Please select a team leader.");
			return;
		}

		// Generate team code
		const { count, error: countError } = await supabase
			.from("teams")
			.select("*", { count: "exact", head: true });

		if (countError) {
			console.error("Error counting teams:", countError);
			alert("Failed to generate team code.");
			return;
		}

		const teamNumber = (count || 0) + 1;
		const teamCode = `T${String(teamNumber).padStart(4, '0')}`;
		const registrationDate = new Date().toISOString().split('T')[0];

		const { data: teamData, error: teamError } = await supabase
			.from("teams")
			.insert([{
				team_code: teamCode,
				name: name,
				registration_date: registrationDate,
				region: region || "Unknown",
				leader_player_id: leaderId
			}])
			.select();

		if (teamError) {
			console.error("Error creating team:", teamError);
			alert("Failed to create team: " + teamError.message);
			return;
		}

		teamId = teamData[0].id;

		// Add team members
		const memberSelects = document.querySelectorAll(".team-member-select");
		const memberPlayerIds = [];
		
		memberSelects.forEach(select => {
			const playerId = select.value;
			if (playerId) {
				memberPlayerIds.push(playerId);
			}
		});

		// Add leader as member if not already in list
		if (!memberPlayerIds.includes(leaderId)) {
			memberPlayerIds.push(leaderId);
		}

		if (memberPlayerIds.length > 0) {
			const teamMembersToInsert = memberPlayerIds.map(playerId => ({
				team_id: teamId,
				player_id: playerId,
				joined_at: new Date().toISOString()
			}));

			const { error: membersError } = await supabase
				.from("team_members")
				.insert(teamMembersToInsert);

			if (membersError) {
				console.error("Error adding team members:", membersError);
				// Continue anyway, team is created
			}
		}
	}

	// Create participant
	await createParticipant(null, teamId, seed);
}

async function createParticipant(playerId, teamId, seed) {
	// Generate participant code
	const { count, error: countError } = await supabase
		.from("participants")
		.select("*", { count: "exact", head: true });

	if (countError) {
		console.error("Error counting participants:", countError);
		alert("Failed to generate participant code.");
		return;
	}

	const participantNumber = (count || 0) + 1;
	const participantCode = `PT${String(participantNumber).padStart(4, '0')}`;

	// Create participant record
	const participantData = {
		participant_code: participantCode,
		player_id: playerId,
		team_id: teamId
	};

	const { data: participant, error: participantError } = await supabase
		.from("participants")
		.insert([participantData])
		.select();

	if (participantError) {
		console.error("Error creating participant:", participantError);
		alert("Failed to create participant: " + participantError.message);
		return;
	}

	const participantId = participant[0].id;

	// Auto-assign seed if not provided
	let finalSeed = seed;
	if (!finalSeed) {
		const { count: participantCount } = await supabase
			.from("event_participants")
			.select("*", { count: "exact", head: true })
			.eq("event_id", selectedEventId);

		finalSeed = (participantCount || 0) + 1;
	}

	// Link participant to event
	const { error: linkError } = await supabase
		.from("event_participants")
		.insert([{
			event_id: selectedEventId,
			participant_id: participantId,
			seed: finalSeed
		}]);

	if (linkError) {
		console.error("Error linking participant to event:", linkError);
		alert("Failed to link participant to event: " + linkError.message);
		return;
	}

	alert("Participant added successfully!");
	
	// Clear form
	clearParticipantForm();
	
	// Reload participants
	loadParticipants();
}

async function removeParticipant(participantId) {
	if (!confirm("Are you sure you want to remove this participant from the event?")) {
		return;
	}

	// Remove from event_participants
	const { error } = await supabase
		.from("event_participants")
		.delete()
		.eq("participant_id", participantId)
		.eq("event_id", selectedEventId);

	if (error) {
		console.error("Error removing participant:", error);
		alert("Failed to remove participant: " + error.message);
		return;
	}

	alert("Participant removed successfully!");
	loadParticipants();
}

function clearParticipantForm() {
	// Reset radio buttons
	document.querySelector('input[name="participant-type"][value="player"]').checked = true;
	document.querySelector('input[name="player-selection"][value="existing"]').checked = true;
	document.querySelector('input[name="team-selection"][value="existing"]').checked = true;

	// Clear inputs
	document.getElementById("new-player-name").value = "";
	document.getElementById("new-player-region").value = "";
	document.getElementById("new-team-name").value = "";
	document.getElementById("new-team-region").value = "";
	document.getElementById("participant-seed").value = "";

	// Reset selects
	document.getElementById("player-select").selectedIndex = 0;
	document.getElementById("team-select").selectedIndex = 0;
	document.getElementById("team-leader-select").selectedIndex = 0;

	// Clear team members
	document.getElementById("team-members-container").innerHTML = "";
	teamMemberCounter = 0;

	// Show/hide sections
	document.getElementById("player-form").style.display = "block";
	document.getElementById("team-form").style.display = "none";
	document.getElementById("existing-player-section").style.display = "block";
	document.getElementById("new-player-section").style.display = "none";
	document.getElementById("existing-team-section").style.display = "block";
	document.getElementById("new-team-section").style.display = "none";
}

function escapeHtml(unsafe) {
	if (unsafe == null) return "";
	return String(unsafe)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}
