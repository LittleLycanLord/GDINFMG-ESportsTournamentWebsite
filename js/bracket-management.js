import { supabase } from "./supabase.js";

let selectedEventId = null;
let currentRootMatchupId = null;
let currentMatchupId = null;

document.addEventListener("DOMContentLoaded", () => {
	// Load tournaments
	loadTournaments();

	// Event listeners
	document.getElementById("tournament-select").addEventListener("change", onTournamentChange);
	document.getElementById("event-select").addEventListener("change", onEventChange);
	document.getElementById("load-bracket-btn").addEventListener("click", loadBracket);
	document.getElementById("create-bracket-btn").addEventListener("click", createBracket);
	document.getElementById("delete-bracket-btn").addEventListener("click", deleteBracket);
	
	// Modal listeners
	document.getElementById("close-modal-btn").addEventListener("click", closeModal);
	document.getElementById("cancel-modal-btn").addEventListener("click", closeModal);
	document.getElementById("save-result-btn").addEventListener("click", saveMatchResult);
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
	const loadBtn = document.getElementById("load-bracket-btn");

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
	const loadBtn = document.getElementById("load-bracket-btn");
	
	if (!eventId) {
		loadBtn.disabled = true;
		selectedEventId = null;
		return;
	}

	selectedEventId = eventId;
	loadBtn.disabled = false;
}

async function loadBracket() {
	if (!selectedEventId) return;

	// Show bracket info section
	document.getElementById("bracket-info-section").style.display = "block";

	// Check if matchups exist for this event
	const { data: matchups, error: matchupsError } = await supabase
		.from("matchups")
		.select("id, matchup_code")
		.eq("event_id", selectedEventId);

	if (matchupsError) {
		console.error("Error loading matchups:", matchupsError);
		document.getElementById("bracket-info").innerHTML = 
			`<div class="notification is-danger">${escapeHtml(matchupsError.message)}</div>`;
		return;
	}

	if (!matchups || matchups.length === 0) {
		// No bracket exists, show create form
		document.getElementById("bracket-info").innerHTML = 
			'<p class="has-text-white">No bracket exists for this event yet.</p>';
		document.getElementById("create-bracket-section").style.display = "block";
		document.getElementById("bracket-display-section").style.display = "none";
		currentRootMatchupId = null;
	} else {
		// Matchups exist, find the root matchup (not referenced by any other)
		const rootMatchup = await findRootMatchup(selectedEventId);
		
		if (!rootMatchup) {
			document.getElementById("bracket-info").innerHTML = 
				'<p class="has-text-white">Bracket structure is invalid. No root matchup found.</p>';
			return;
		}

		currentRootMatchupId = rootMatchup.id;
		document.getElementById("bracket-info").innerHTML = 
			`<p class="has-text-white"><strong>Root Matchup:</strong> ${escapeHtml(rootMatchup.matchup_code)} (${matchups.length} total matchups)</p>`;
		document.getElementById("create-bracket-section").style.display = "none";
		document.getElementById("bracket-display-section").style.display = "block";
		await displayBracket(selectedEventId);
	}
}

async function findRootMatchup(eventId) {
	// Get all matchups for this event
	const { data: matchups, error } = await supabase
		.from("matchups")
		.select("id, matchup_code, side_a_matchup_id, side_b_matchup_id")
		.eq("event_id", eventId);

	if (error || !matchups || matchups.length === 0) {
		return null;
	}

	// Collect all matchup IDs that are referenced by other matchups
	const referencedMatchupIds = new Set();
	matchups.forEach(m => {
		if (m.side_a_matchup_id) referencedMatchupIds.add(m.side_a_matchup_id);
		if (m.side_b_matchup_id) referencedMatchupIds.add(m.side_b_matchup_id);
	});

	// Find matchup that is NOT referenced by any other (that's the root/Finals)
	const rootMatchup = matchups.find(m => !referencedMatchupIds.has(m.id));
	return rootMatchup || null;
}

async function findParentMatchup(eventId, currentMatchupId) {
	// Find the matchup that references the current matchup as side_a or side_b
	const { data: matchups, error } = await supabase
		.from("matchups")
		.select("id, matchup_code, side_a_matchup_id, side_b_matchup_id")
		.eq("event_id", eventId)
		.or(`side_a_matchup_id.eq.${currentMatchupId},side_b_matchup_id.eq.${currentMatchupId}`);

	if (error || !matchups || matchups.length === 0) {
		return null;
	}

	const parentMatchup = matchups[0];
	// Determine which side this matchup is on
	const isLeftSide = parentMatchup.side_a_matchup_id === currentMatchupId;
	return { matchup: parentMatchup, isLeftSide };
}

async function createBracket() {
	if (!selectedEventId) return;

	const bracketType = document.getElementById("bracket-type-select").value;

	// Get participants for this event
	const { data: eventParticipants, error: participantsError } = await supabase
		.from("event_participants")
		.select(`
			seed,
			participant:participants(
				id,
				participant_code,
				player:players(name),
				team:teams(name)
			)
		`)
		.eq("event_id", selectedEventId)
		.order("seed", { ascending: true });

	if (participantsError) {
		console.error("Error loading participants:", participantsError);
		alert("Failed to load participants: " + participantsError.message);
		return;
	}

	if (!eventParticipants || eventParticipants.length === 0) {
		alert("No participants found for this event. Please add participants first.");
		return;
	}

	// Check if number of participants is power of 2
	const numParticipants = eventParticipants.length;
	if (!isPowerOfTwo(numParticipants)) {
		if (!confirm(`This event has ${numParticipants} participants, which is not a power of 2. Continue anyway? (Some matchups will have byes)`)) {
			return;
		}
	}

	// Generate matchups based on bracket type
	if (bracketType === "single") {
		await generateSingleEliminationMatchups(selectedEventId, eventParticipants);
	} else {
		await generateDoubleEliminationMatchups(selectedEventId, eventParticipants);
	}

	alert("Bracket created successfully!");
	await loadBracket();
}

async function generateSingleEliminationMatchups(eventId, participants) {
	const numParticipants = participants.length;
	const numRounds = Math.ceil(Math.log2(numParticipants));

	// Get current matchup count for code generation
	const { count: matchupCount } = await supabase
		.from("matchups")
		.select("*", { count: "exact", head: true });

	let matchupNumber = (matchupCount || 0) + 1;

	// Build bracket bottom-up: create leaf matchups first, then parent matchups
	const rounds = [];
	
	// Round 1: Create leaf matchups with participants
	const firstRoundMatches = Math.ceil(numParticipants / 2);
	const round1Matchups = [];

	for (let i = 0; i < firstRoundMatches; i++) {
		const seed1 = i * 2 + 1;
		const seed2 = i * 2 + 2;
		
		const participant1 = participants.find(p => p.seed === seed1);
		const participant2 = participants.find(p => p.seed === seed2);

		const matchupCode = `M${String(matchupNumber).padStart(4, '0')}`;
		matchupNumber++;

		round1Matchups.push({
			event_id: eventId,
			matchup_code: matchupCode,
			side_a_participant_id: participant1 ? participant1.participant.id : null,
			side_b_participant_id: participant2 ? participant2.participant.id : null,
			side_a_matchup_id: null,
			side_b_matchup_id: null,
			result_id: null
		});
	}

	// Insert round 1 matchups
	const { data: insertedRound1, error: round1Error } = await supabase
		.from("matchups")
		.insert(round1Matchups)
		.select("id, matchup_code");

	if (round1Error) {
		console.error("Error creating round 1 matchups:", round1Error);
		throw new Error("Failed to create matchups: " + round1Error.message);
	}

	rounds.push(insertedRound1);

	// Create subsequent rounds: each matchup references two matchups from previous round
	let previousRound = insertedRound1;
	for (let round = 2; round <= numRounds; round++) {
		const matchesInThisRound = Math.ceil(previousRound.length / 2);
		const roundMatchups = [];

		for (let i = 0; i < matchesInThisRound; i++) {
			const matchup1 = previousRound[i * 2];
			const matchup2 = previousRound[i * 2 + 1];

			const matchupCode = `M${String(matchupNumber).padStart(4, '0')}`;
			matchupNumber++;

			roundMatchups.push({
				event_id: eventId,
				matchup_code: matchupCode,
				side_a_participant_id: null,
				side_b_participant_id: null,
				side_a_matchup_id: matchup1.id,
				side_b_matchup_id: matchup2 ? matchup2.id : null,
				result_id: null
			});
		}

		// Insert this round's matchups
		const { data: insertedRound, error: roundError } = await supabase
			.from("matchups")
			.insert(roundMatchups)
			.select("id, matchup_code");

		if (roundError) {
			console.error(`Error creating round ${round} matchups:`, roundError);
			throw new Error(`Failed to create round ${round} matchups: ` + roundError.message);
		}

		rounds.push(insertedRound);
		previousRound = insertedRound;
	}
}

async function generateDoubleEliminationMatchups(eventId, participants) {
	// For now, just create single elimination with a note
	// Full double elimination would require winner's bracket and loser's bracket
	alert("Double elimination bracket generation is simplified. Creating winner's bracket only.");
	await generateSingleEliminationMatchups(eventId, participants);
}

async function displayBracket(eventId) {
	const container = document.getElementById("bracket-display");
	container.innerHTML = '<p class="has-text-white">Loading bracket...</p>';

	// Get all matchups for this event
	const { data: matchups, error: matchupsError } = await supabase
		.from("matchups")
		.select(`
			id,
			matchup_code,
			side_a_participant_id,
			side_b_participant_id,
			side_a_matchup_id,
			side_b_matchup_id,
			result_id
		`)
		.eq("event_id", eventId);

	if (matchupsError) {
		console.error("Error loading matchups:", matchupsError);
		container.innerHTML = `<div class="notification is-danger">${escapeHtml(matchupsError.message)}</div>`;
		return;
	}

	if (!matchups || matchups.length === 0) {
		container.innerHTML = '<p class="has-text-white">No matchups found.</p>';
		return;
	}

	// Get all unique participant IDs from matchups
	const participantIds = new Set();
	matchups.forEach(matchup => {
		if (matchup.side_a_participant_id) participantIds.add(matchup.side_a_participant_id);
		if (matchup.side_b_participant_id) participantIds.add(matchup.side_b_participant_id);
	});

	// Fetch participant details separately
	let participantMap = {};
	if (participantIds.size > 0) {
		const { data: participants, error: participantsError } = await supabase
			.from("participants")
			.select(`
				id,
				participant_code,
				player:players(name),
				team:teams(name)
			`)
			.in("id", Array.from(participantIds));

		if (!participantsError && participants) {
			participants.forEach(p => {
				participantMap[p.id] = p;
			});
		}
	}

	// Fetch results for matchups
	const resultIds = matchups.filter(m => m.result_id).map(m => m.result_id);
	let resultsMap = {};
	if (resultIds.length > 0) {
		const { data: results, error: resultsError } = await supabase
			.from("results")
			.select("id, matchup_id, winner_participant_id, score_a, score_b, status")
			.in("id", resultIds);

		if (!resultsError && results) {
			results.forEach(r => {
				resultsMap[r.matchup_id] = r;
			});
		}
	}

	// Create matchup map for easy lookup
	const matchupMap = {};
	matchups.forEach(m => {
		matchupMap[m.id] = m;
	});

	// Build tree structure by finding root and traversing
	const rootMatchup = await findRootMatchup(eventId);
	if (!rootMatchup) {
		container.innerHTML = '<p class="has-text-white">Cannot display bracket: no root matchup found.</p>';
		return;
	}

	// Build rounds by depth-first traversal
	const rounds = buildRoundsFromTree(rootMatchup, matchupMap, participantMap, resultsMap);

	// Render bracket
	container.innerHTML = "";
	
	rounds.forEach((round, roundIndex) => {
		const roundDiv = document.createElement("div");
		roundDiv.className = "bracket-round";

		const roundTitle = document.createElement("div");
		roundTitle.className = "bracket-round-title";
		const numRounds = rounds.length;
		const currentRound = rounds.length - roundIndex; // Reverse because we built from root
		
		if (currentRound === numRounds) {
			roundTitle.textContent = `Round 1`;
		} else if (currentRound === 1) {
			roundTitle.textContent = "Finals";
		} else if (currentRound === 2) {
			roundTitle.textContent = "Semi-Finals";
		} else {
			roundTitle.textContent = `Round ${numRounds - currentRound + 1}`;
		}
		
		roundDiv.appendChild(roundTitle);

		// Create matches container
		const matchesContainer = document.createElement("div");
		matchesContainer.className = "bracket-round-matches";

		round.forEach((matchup, matchupIndex) => {
			// Create wrapper for connector lines
			const wrapper = document.createElement("div");
			wrapper.className = "matchup-wrapper";
			
			// Add connector classes for visual lines
			if (matchupIndex % 2 === 0) {
				wrapper.classList.add("connect-down");
			} else {
				wrapper.classList.add("connect-up");
			}

			const matchupDiv = createMatchupElement(matchup);
			wrapper.appendChild(matchupDiv);
			matchesContainer.appendChild(wrapper);

			// Add spacer between pairs of matches (except after last match)
			if (matchupIndex % 2 === 1 && matchupIndex < round.length - 1) {
				const spacer = document.createElement("div");
				spacer.className = "matchup-spacer";
				matchesContainer.appendChild(spacer);
			}
		});

		roundDiv.appendChild(matchesContainer);
		container.appendChild(roundDiv);
	});
}

function buildRoundsFromTree(rootMatchup, matchupMap, participantMap, resultsMap) {
	// Build rounds array by traversing tree depth-first
	const rounds = [];

	function traverse(matchup, depth) {
		if (!rounds[depth]) {
			rounds[depth] = [];
		}

		// Enrich matchup with participant and result data
		const enrichedMatchup = {
			...matchup,
			participant_left: matchup.side_a_participant_id ? participantMap[matchup.side_a_participant_id] : null,
			participant_right: matchup.side_b_participant_id ? participantMap[matchup.side_b_participant_id] : null,
			result: matchup.result_id ? resultsMap[matchup.id] : null
		};

		rounds[depth].push(enrichedMatchup);

		// Traverse child matchups (if this matchup references other matchups)
		if (matchup.side_a_matchup_id) {
			const leftChild = matchupMap[matchup.side_a_matchup_id];
			if (leftChild) traverse(leftChild, depth + 1);
		}
		if (matchup.side_b_matchup_id) {
			const rightChild = matchupMap[matchup.side_b_matchup_id];
			if (rightChild) traverse(rightChild, depth + 1);
		}
	}

	traverse(rootMatchup, 0);

	// Reverse rounds so Round 1 is first
	return rounds.reverse();
}

function createMatchupElement(matchup) {
	const div = document.createElement("div");
	div.className = "matchup";

	const header = document.createElement("div");
	header.className = "matchup-header";
	header.textContent = matchup.matchup_code;
	div.appendChild(header);

	// Get result
	const result = matchup.result;
	const winnerId = result?.winner_participant_id;

	// Determine sides - prioritize participant_id over matchup_id
	// If participant_id exists, show participant (winner advanced)
	// Otherwise if matchup_id exists, show TBD
	// Otherwise show BYE
	let leftSide = null;
	if (matchup.side_a_participant_id && matchup.participant_left) {
		leftSide = {
			name: matchup.participant_left.player?.name || matchup.participant_left.team?.name || "Unknown",
			id: matchup.side_a_participant_id,
			code: matchup.participant_left.participant_code
		};
	} else if (matchup.side_a_matchup_id) {
		leftSide = {
			name: "TBD",
			id: null,
			code: null
		};
	}

	let rightSide = null;
	if (matchup.side_b_participant_id && matchup.participant_right) {
		rightSide = {
			name: matchup.participant_right.player?.name || matchup.participant_right.team?.name || "Unknown",
			id: matchup.side_b_participant_id,
			code: matchup.participant_right.participant_code
		};
	} else if (matchup.side_b_matchup_id) {
		rightSide = {
			name: "TBD",
			id: null,
			code: null
		};
	}

	// Left participant
	const leftRow = document.createElement("div");
	leftRow.className = `participant-row ${winnerId && leftSide?.id === winnerId ? "winner" : ""}`;
	
	const leftInfo = document.createElement("div");
	if (leftSide) {
		leftInfo.innerHTML = `<span class="participant-name">${escapeHtml(leftSide.name)}</span>`;
	} else {
		leftInfo.innerHTML = '<span class="tbd">BYE</span>';
	}
	
	const leftScore = document.createElement("div");
	leftScore.className = "participant-score";
	leftScore.textContent = result?.score_a != null ? result.score_a : "-";
	
	leftRow.appendChild(leftInfo);
	leftRow.appendChild(leftScore);
	div.appendChild(leftRow);

	// Right participant
	const rightRow = document.createElement("div");
	rightRow.className = `participant-row ${winnerId && rightSide?.id === winnerId ? "winner" : ""}`;
	
	const rightInfo = document.createElement("div");
	if (rightSide) {
		rightInfo.innerHTML = `<span class="participant-name">${escapeHtml(rightSide.name)}</span>`;
	} else {
		rightInfo.innerHTML = '<span class="tbd">BYE</span>';
	}
	
	const rightScore = document.createElement("div");
	rightScore.className = "participant-score";
	rightScore.textContent = result?.score_b != null ? result.score_b : "-";
	
	rightRow.appendChild(rightInfo);
	rightRow.appendChild(rightScore);
	div.appendChild(rightRow);

	// Add click handler to enter results if both sides are determined
	// Check if both sides have participant IDs (either originally or advanced from child matchups)
	const hasLeftParticipant = matchup.side_a_participant_id != null;
	const hasRightParticipant = matchup.side_b_participant_id != null;
	
	if (hasLeftParticipant && hasRightParticipant) {
		div.style.cursor = "pointer";
		div.addEventListener("click", () => {
			openResultModal(matchup, leftSide, rightSide);
		});
	} else if (!hasLeftParticipant || !hasRightParticipant) {
		// Visual indicator that matchup is not ready
		div.style.opacity = "0.6";
	}

	return div;
}

function openResultModal(matchup, leftSide, rightSide) {
	currentMatchupId = matchup.id;
	const modal = document.getElementById("result-modal");
	const modalContent = document.getElementById("modal-content");

	// Get existing result
	const result = matchup.result;

	modalContent.innerHTML = `
		<h4 class="title is-5 has-text-white">${escapeHtml(matchup.matchup_code)}</h4>
		
		<div class="field">
			<label class="label has-text-white">${escapeHtml(leftSide.name)} (Side A)</label>
			<div class="control">
				<input class="input" type="number" id="left-score" placeholder="Score" value="${result?.score_a ?? ''}">
			</div>
		</div>

		<div class="field">
			<label class="label has-text-white">${escapeHtml(rightSide.name)} (Side B)</label>
			<div class="control">
				<input class="input" type="number" id="right-score" placeholder="Score" value="${result?.score_b ?? ''}">
			</div>
		</div>

		<div class="field">
			<label class="label has-text-white">Winner</label>
			<div class="control">
				<label class="radio has-text-white">
					<input type="radio" name="winner" value="left" ${result?.winner_participant_id === leftSide.id ? "checked" : ""}>
					${escapeHtml(leftSide.name)}
				</label>
				<label class="radio has-text-white">
					<input type="radio" name="winner" value="right" ${result?.winner_participant_id === rightSide.id ? "checked" : ""}>
					${escapeHtml(rightSide.name)}
				</label>
			</div>
		</div>

		<input type="hidden" id="left-participant-id" value="${leftSide.id}">
		<input type="hidden" id="right-participant-id" value="${rightSide.id}">
	`;

	modal.classList.add("is-active");
}

function closeModal() {
	const modal = document.getElementById("result-modal");
	modal.classList.remove("is-active");
	currentMatchupId = null;
}

async function saveMatchResult() {
	if (!currentMatchupId) return;

	const leftScore = document.getElementById("left-score").value;
	const rightScore = document.getElementById("right-score").value;
	const winner = document.querySelector('input[name="winner"]:checked')?.value;
	const leftParticipantId = document.getElementById("left-participant-id").value;
	const rightParticipantId = document.getElementById("right-participant-id").value;

	if (!winner) {
		alert("Please select a winner.");
		return;
	}

	if (!leftScore || !rightScore) {
		alert("Please enter scores for both participants.");
		return;
	}

	const winnerParticipantId = winner === "left" ? leftParticipantId : rightParticipantId;

	// Check if result already exists for this matchup
	const { data: existingResults, error: fetchError } = await supabase
		.from("results")
		.select("id")
		.eq("matchup_id", currentMatchupId);

	let resultError;
	
	if (existingResults && existingResults.length > 0) {
		// Update existing result
		const { error } = await supabase
			.from("results")
			.update({
				winner_participant_id: winnerParticipantId,
				score_a: parseInt(leftScore),
				score_b: parseInt(rightScore),
				status: "final"
			})
			.eq("id", existingResults[0].id);
		
		resultError = error;
	} else {
		// Insert new result
		const { error } = await supabase
			.from("results")
			.insert([{
				matchup_id: currentMatchupId,
				winner_participant_id: winnerParticipantId,
				score_a: parseInt(leftScore),
				score_b: parseInt(rightScore),
				status: "final"
			}]);
		
		resultError = error;
	}

	if (resultError) {
		console.error("Error saving result:", resultError);
		alert("Failed to save result: " + resultError.message);
		return;
	}

	// Advance winner to parent matchup
	const parentInfo = await findParentMatchup(selectedEventId, currentMatchupId);
	if (parentInfo) {
		const { matchup: parentMatchup, isLeftSide } = parentInfo;
		
		// Update parent matchup with winner
		// Keep matchup_id references for tree traversal, just set participant_id
		const updateData = isLeftSide 
			? { side_a_participant_id: winnerParticipantId }
			: { side_b_participant_id: winnerParticipantId };
		
		const { error: advanceError } = await supabase
			.from("matchups")
			.update(updateData)
			.eq("id", parentMatchup.id);
		
		if (advanceError) {
			console.error("Error advancing winner:", advanceError);
			// Don't fail the whole operation if advancement fails
		}
	}

	alert("Result saved successfully!");
	closeModal();
	await displayBracket(selectedEventId);
}

async function deleteBracket() {
	if (!selectedEventId) return;

	if (!confirm("Are you sure you want to delete all matchups for this bracket? This will remove all matchups and results.")) {
		return;
	}

	// Delete all matchups for this event (cascade should handle results)
	const { error } = await supabase
		.from("matchups")
		.delete()
		.eq("event_id", selectedEventId);

	if (error) {
		console.error("Error deleting matchups:", error);
		alert("Failed to delete bracket: " + error.message);
		return;
	}

	alert("Bracket deleted successfully!");
	currentRootMatchupId = null;
	document.getElementById("bracket-info-section").style.display = "none";
	document.getElementById("bracket-display-section").style.display = "none";
}

function isPowerOfTwo(n) {
	return n > 0 && (n & (n - 1)) === 0;
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
