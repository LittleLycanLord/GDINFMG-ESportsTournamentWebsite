import { supabase } from "./supabase.js";

let eventCounter = 0;
let prizeCounters = {}; // Track prize counter per event
let sponsorCounter = 0; // Track tournament-level sponsors
let eventSponsorCounters = {}; // Track event-level sponsors per event
let editingTournamentId = null; // Track if we're editing a tournament

document.addEventListener("DOMContentLoaded", () => {
	const createBtn = document.getElementById("createTournamentBtn");
	const addEventBtn = document.getElementById("addEventBtn");
	const addTournamentSponsorBtn = document.getElementById("addTournamentSponsorBtn");

	// Load existing tournaments
	loadTournaments();

	if (addEventBtn) {
		addEventBtn.addEventListener("click", () => {
			addEventForm();
		});
	}

	if (addTournamentSponsorBtn) {
		addTournamentSponsorBtn.addEventListener("click", () => {
			addTournamentSponsorForm();
		});
	}

	if (createBtn) {
		createBtn.addEventListener("click", async () => {
			await handleCreateTournament();
		});
	}
});

async function loadTournaments() {
	const container = document.getElementById("tournaments-list");
	if (!container) return;

	container.innerHTML = `<div class="has-text-white">Loading tournaments...</div>`;

	const { data, error } = await supabase
		.from("tournaments")
		.select("id, tournament_code, name, registration_date, location, schedule, created_at")
		.order("created_at", { ascending: false });

	if (error) {
		console.error("Error loading tournaments:", error);
		container.innerHTML = `<div class="notification is-danger">${escapeHtml(error.message)}</div>`;
		return;
	}

	if (!data || data.length === 0) {
		container.innerHTML = `<div class="has-text-white">No tournaments yet.</div>`;
		return;
	}

	container.innerHTML = "";
	const table = document.createElement("table");
	table.className = "table is-fullwidth is-hoverable has-background-grey-dark has-text-white";
	table.innerHTML = `
		<thead>
			<tr>
				<th class="has-text-white">Name</th>
				<th class="has-text-white">Code</th>
				<th class="has-text-white">Location</th>
				<th class="has-text-white">Created</th>
				<th class="has-text-white">Actions</th>
			</tr>
		</thead>
		<tbody id="tournaments-tbody"></tbody>
	`;
	container.appendChild(table);

	const tbody = document.getElementById("tournaments-tbody");
	data.forEach(tournament => {
		const row = document.createElement("tr");
		row.innerHTML = `
			<td>${escapeHtml(tournament.name)}</td>
			<td>${escapeHtml(tournament.tournament_code || "N/A")}</td>
			<td>${escapeHtml(tournament.location)}</td>
			<td>${new Date(tournament.created_at).toLocaleDateString()}</td>
			<td>
				<div class="buttons are-small">
					<button class="button is-small is-info edit-tournament-btn" data-id="${tournament.id}">Edit Tournament Details</button>
					<button class="button is-small is-link edit-events-btn" data-id="${tournament.id}">Edit Event Details</button>
					<button class="button is-small is-danger delete-tournament-btn" data-id="${tournament.id}">Delete</button>
				</div>
			</td>
		`;
		tbody.appendChild(row);
	});

	// Add event listeners for buttons
	document.querySelectorAll(".edit-tournament-btn").forEach(btn => {
		btn.addEventListener("click", (e) => {
			const id = e.target.dataset.id;
			loadTournamentDetailsForEdit(id);
		});
	});

	document.querySelectorAll(".edit-events-btn").forEach(btn => {
		btn.addEventListener("click", (e) => {
			const id = e.target.dataset.id;
			loadEventsForEdit(id);
		});
	});

	document.querySelectorAll(".delete-tournament-btn").forEach(btn => {
		btn.addEventListener("click", (e) => {
			const id = e.target.dataset.id;
			deleteTournament(id);
		});
	});
}

async function loadTournamentDetailsForEdit(tournamentId) {
	const { data, error } = await supabase
		.from("tournaments")
		.select(`
			id, name, location, schedule,
			sponsors:sponsors!sponsors_tournament_id_fkey(id, name, website)
		`)
		.eq("id", tournamentId)
		.single();

	if (error) {
		console.error("Error loading tournament:", error);
		alert("Failed to load tournament: " + error.message);
		return;
	}

	// Set editing mode
	editingTournamentId = tournamentId;

	// Show all tournament fields (in case they were hidden from event edit mode)
	document.getElementById("tname").parentElement.parentElement.style.display = "block";
	document.getElementById("tlocation").parentElement.parentElement.style.display = "block";
	
	// Show the entire schedule columns container (both start and end fields)
	const scheduleStartField = document.querySelector("#schedule_start");
	const scheduleColumnsContainer = scheduleStartField.closest(".columns");
	if (scheduleColumnsContainer) {
		scheduleColumnsContainer.style.display = "flex";
	}
	
	// Hide events section but show sponsors
	document.querySelector("#events-container").parentElement.style.display = "none";
	document.querySelector("#tournament-sponsors-section").style.display = "block";

	// Populate form
	document.getElementById("tname").value = data.name;
	document.getElementById("tlocation").value = data.location;

	// Parse schedule range
	if (data.schedule) {
		const scheduleMatch = data.schedule.match(/\[([^,]+),([^\]]+)\)/);
		if (scheduleMatch) {
			const startISO = scheduleMatch[1].replace(/"/g, '');
			const endISO = scheduleMatch[2].replace(/"/g, '');
			document.getElementById("schedule_start").value = formatDatetimeLocal(startISO);
			document.getElementById("schedule_end").value = formatDatetimeLocal(endISO);
		}
	}

	// Clear events
	document.getElementById("events-container").innerHTML = "";
	eventCounter = 0;
	prizeCounters = {};
	
	// Clear and load tournament sponsors
	document.getElementById("tournament-sponsors-container").innerHTML = "";
	sponsorCounter = 0;
	eventSponsorCounters = {};
	
	if (data.sponsors && data.sponsors.length > 0) {
		for (const sponsor of data.sponsors) {
			addTournamentSponsorForm();
			const sponsorBox = document.querySelector(`#tournament-sponsors-container [data-sponsor-id="${sponsorCounter}"]`);
			if (sponsorBox) {
				const nameInput = sponsorBox.querySelector(".sponsor-name");
				const websiteInput = sponsorBox.querySelector(".sponsor-website");
				if (nameInput) nameInput.value = sponsor.name;
				if (websiteInput && sponsor.website) websiteInput.value = sponsor.website;
			}
		}
	}

	// Change button text
	document.getElementById("createTournamentBtn").textContent = "Update Tournament Details";

	// Scroll to form
	document.querySelector(".box.has-background-grey-dark").scrollIntoView({ behavior: "smooth" });
}

async function loadEventsForEdit(tournamentId) {
	const { data, error } = await supabase
		.from("tournaments")
		.select(`
			id, name,
			events:events(
				id, name, game_title, location, schedule, event_code,
				prize_distributions(id, placement, prize_description, distribution_code),
				sponsors:sponsors!sponsors_event_id_fkey(id, name, website)
			)
		`)
		.eq("id", tournamentId)
		.single();

	if (error) {
		console.error("Error loading events:", error);
		alert("Failed to load events: " + error.message);
		return;
	}

	// Set editing mode
	editingTournamentId = tournamentId;

	// Hide tournament fields and sponsors
	document.getElementById("tname").value = data.name;
	document.getElementById("tname").parentElement.parentElement.style.display = "none";
	document.getElementById("tlocation").parentElement.parentElement.style.display = "none";
	
	// Hide the entire schedule columns container (both start and end fields)
	const scheduleStartField = document.querySelector("#schedule_start");
	const scheduleColumnsContainer = scheduleStartField.closest(".columns");
	if (scheduleColumnsContainer) {
		scheduleColumnsContainer.style.display = "none";
	}
	
	document.querySelector("#tournament-sponsors-section").style.display = "none";

	// Show events section
	document.querySelector("#events-container").parentElement.style.display = "block";

	// Clear existing events
	document.getElementById("events-container").innerHTML = "";
	eventCounter = 0;
	prizeCounters = {};
	eventSponsorCounters = {};

	// Load events with prizes and sponsors
	if (data.events && data.events.length > 0) {
		for (const event of data.events) {
			addEventForm();
			const currentEventId = eventCounter;
			const eventBox = document.querySelector(`[data-event-id="${currentEventId}"]`);
			
			if (!eventBox) {
				console.error(`Could not find event box with id ${currentEventId}`);
				continue;
			}
			
			eventBox.querySelector(".event-name").value = event.name;
			eventBox.querySelector(".event-game").value = event.game_title;
			eventBox.querySelector(".event-location").value = event.location;

			if (event.schedule) {
				const scheduleMatch = event.schedule.match(/\[([^,]+),([^\]]+)\)/);
				if (scheduleMatch) {
					const startISO = scheduleMatch[1].replace(/"/g, '');
					const endISO = scheduleMatch[2].replace(/"/g, '');
					eventBox.querySelector(".event-schedule-start").value = formatDatetimeLocal(startISO);
					eventBox.querySelector(".event-schedule-end").value = formatDatetimeLocal(endISO);
				}
			}

			// Load prizes for this event
			if (event.prize_distributions && event.prize_distributions.length > 0) {
				for (const prize of event.prize_distributions) {
					addPrizeForm(currentEventId);
					
					const prizesContainer = eventBox.querySelector(".prizes-container");
					const prizeBoxes = prizesContainer.querySelectorAll(".box[data-prize-id]");
					const lastPrizeBox = prizeBoxes[prizeBoxes.length - 1];
					
					if (lastPrizeBox) {
						const placementInput = lastPrizeBox.querySelector(".prize-placement");
						const descriptionInput = lastPrizeBox.querySelector(".prize-description");
						if (placementInput && descriptionInput) {
							placementInput.value = prize.placement;
							descriptionInput.value = prize.prize_description;
						}
					}
				}
			}

			// Load event sponsors
			if (event.sponsors && event.sponsors.length > 0) {
				for (const sponsor of event.sponsors) {
					addEventSponsorForm(currentEventId);
					
					const sponsorsContainer = eventBox.querySelector(".event-sponsors-container");
					const sponsorBoxes = sponsorsContainer.querySelectorAll("[data-event-sponsor-id]");
					const lastSponsorBox = sponsorBoxes[sponsorBoxes.length - 1];
					
					if (lastSponsorBox) {
						const nameInput = lastSponsorBox.querySelector(".event-sponsor-name");
						const websiteInput = lastSponsorBox.querySelector(".event-sponsor-website");
						if (nameInput) nameInput.value = sponsor.name;
						if (websiteInput && sponsor.website) websiteInput.value = sponsor.website;
					}
				}
			}
		}
	}

	// Change button text
	document.getElementById("createTournamentBtn").textContent = "Update Event Details";

	// Scroll to form
	document.querySelector(".box.has-background-grey-dark").scrollIntoView({ behavior: "smooth" });
}

async function loadTournamentForEdit(tournamentId) {
	const { data, error } = await supabase
		.from("tournaments")
		.select(`
			id, name, location, schedule,
			events:events(
				id, name, game_title, location, schedule,
				prize_distributions(id, placement, prize_description, distribution_code)
			)
		`)
		.eq("id", tournamentId)
		.single();

	if (error) {
		console.error("Error loading tournament:", error);
		alert("Failed to load tournament: " + error.message);
		return;
	}

	// Set editing mode
	editingTournamentId = tournamentId;

	// Populate form
	document.getElementById("tname").value = data.name;
	document.getElementById("tlocation").value = data.location;

	// Parse schedule range
	if (data.schedule) {
		const scheduleMatch = data.schedule.match(/\[([^,]+),([^\]]+)\)/);
		if (scheduleMatch) {
			const startISO = scheduleMatch[1].replace(/"/g, '');
			const endISO = scheduleMatch[2].replace(/"/g, '');
			document.getElementById("schedule_start").value = formatDatetimeLocal(startISO);
			document.getElementById("schedule_end").value = formatDatetimeLocal(endISO);
		}
	}

	// Clear existing events
	document.getElementById("events-container").innerHTML = "";
	eventCounter = 0;
	prizeCounters = {};

	// Load events with prizes
	if (data.events && data.events.length > 0) {
		for (const event of data.events) {
			addEventForm();
			const eventBox = document.querySelector(`[data-event-id="${eventCounter}"]`);
			eventBox.querySelector(".event-name").value = event.name;
			eventBox.querySelector(".event-game").value = event.game_title;
			eventBox.querySelector(".event-location").value = event.location;

			if (event.schedule) {
				const scheduleMatch = event.schedule.match(/\[([^,]+),([^\]]+)\)/);
				if (scheduleMatch) {
					const startISO = scheduleMatch[1].replace(/"/g, '');
					const endISO = scheduleMatch[2].replace(/"/g, '');
					eventBox.querySelector(".event-schedule-start").value = formatDatetimeLocal(startISO);
					eventBox.querySelector(".event-schedule-end").value = formatDatetimeLocal(endISO);
				}
			}

			// Load prizes for this event
			if (event.prize_distributions && event.prize_distributions.length > 0) {
				const currentEventId = eventCounter;
				for (const prize of event.prize_distributions) {
					addPrizeForm(currentEventId);
					
					// Get the event box again to ensure we have the updated DOM
					const currentEventBox = document.querySelector(`[data-event-id="${currentEventId}"]`);
					const prizesContainer = currentEventBox.querySelector(".prizes-container");
					const prizeBoxes = prizesContainer.querySelectorAll(".box[data-prize-id]");
					const lastPrizeBox = prizeBoxes[prizeBoxes.length - 1];
					
					if (lastPrizeBox) {
						const placementInput = lastPrizeBox.querySelector(".prize-placement");
						const descriptionInput = lastPrizeBox.querySelector(".prize-description");
						if (placementInput && descriptionInput) {
							placementInput.value = prize.placement;
							descriptionInput.value = prize.prize_description;
						}
					}
				}
			}
		}
	}

	// Change button text
	document.getElementById("createTournamentBtn").textContent = "Update Tournament";

	// Scroll to form
	document.querySelector(".box.has-background-grey-dark").scrollIntoView({ behavior: "smooth" });
}

async function deleteTournament(tournamentId) {
	if (!confirm("Are you sure you want to delete this tournament? This will also delete all associated events and data.")) {
		return;
	}

	const { error } = await supabase
		.from("tournaments")
		.delete()
		.eq("id", tournamentId);

	if (error) {
		console.error("Error deleting tournament:", error);
		alert("Failed to delete tournament: " + error.message);
		return;
	}

	alert("Tournament deleted successfully!");
	loadTournaments();
}

function formatDatetimeLocal(isoString) {
	const date = new Date(isoString);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	return `${year}-${month}-${day}T${hours}:${minutes}`;
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

function addEventForm() {
	eventCounter++;
	prizeCounters[eventCounter] = 0; // Initialize prize counter for this event
	const container = document.getElementById("events-container");
	
	const eventBox = document.createElement("div");
	eventBox.className = "box has-background-grey mb-3";
	eventBox.dataset.eventId = eventCounter;
	eventBox.innerHTML = `
		<div class="level">
			<div class="level-left">
				<div class="level-item">
					<h5 class="title is-6 has-text-white">Event #${eventCounter}</h5>
				</div>
			</div>
			<div class="level-right">
				<div class="level-item">
					<button class="button is-danger is-small remove-event-btn" data-event-id="${eventCounter}" type="button">Remove</button>
				</div>
			</div>
		</div>

		<div class="field">
			<label class="label has-text-white-ter">Event Name</label>
			<div class="control">
				<input class="input event-name" type="text" placeholder="e.g., Valorant Finals" required>
			</div>
		</div>

		<div class="field">
			<label class="label has-text-white-ter">Game Title</label>
			<div class="control">
				<input class="input event-game" type="text" placeholder="e.g., Valorant" required>
			</div>
		</div>

		<div class="field">
			<label class="label has-text-white-ter">Event Location</label>
			<div class="control">
				<input class="input event-location" type="text" placeholder="e.g., Arena B">
			</div>
		</div>

		<div class="columns">
			<div class="column">
				<div class="field">
					<label class="label has-text-white-ter">Event Schedule Start</label>
					<div class="control">
						<input class="input event-schedule-start" type="datetime-local">
					</div>
				</div>
			</div>
			<div class="column">
				<div class="field">
					<label class="label has-text-white-ter">Event Schedule End</label>
					<div class="control">
						<input class="input event-schedule-end" type="datetime-local">
					</div>
				</div>
			</div>
		</div>

		<hr class="has-background-grey-light">

		<!-- PRIZE DISTRIBUTIONS FOR THIS EVENT -->
		<div class="prize-distributions-section">
			<h6 class="subtitle is-6 has-text-white-ter">Prize Distributions</h6>
			<div class="prizes-container">
				<!-- Prize distributions will be added here -->
			</div>
			<button class="button is-small is-info add-prize-btn" type="button">
				<span class="icon"><i>+</i></span>
				<span>Add Prize</span>
			</button>
		</div>

		<hr class="has-background-grey-light">

		<!-- EVENT SPONSORS -->
		<div class="event-sponsors-section">
			<h6 class="subtitle is-6 has-text-white-ter">Event Sponsors</h6>
			<div class="event-sponsors-container">
				<!-- Event sponsors will be added here -->
			</div>
			<button class="button is-small is-info add-event-sponsor-btn" type="button">
				<span class="icon"><i>+</i></span>
				<span>Add Event Sponsor</span>
			</button>
		</div>
	`;

	container.appendChild(eventBox);

	// Add event listener for remove button
	const removeBtn = eventBox.querySelector(".remove-event-btn");
	removeBtn.addEventListener("click", (e) => {
		const eventId = e.target.dataset.eventId;
		removeEventForm(eventId);
	});

	// Add event listener for add prize button
	const addPrizeBtn = eventBox.querySelector(".add-prize-btn");
	addPrizeBtn.addEventListener("click", () => {
		addPrizeForm(eventCounter);
	});

	// Add event listener for add event sponsor button
	const addEventSponsorBtn = eventBox.querySelector(".add-event-sponsor-btn");
	addEventSponsorBtn.addEventListener("click", () => {
		addEventSponsorForm(eventCounter);
	});
}

function removeEventForm(eventId) {
	const container = document.getElementById("events-container");
	const eventBox = container.querySelector(`[data-event-id="${eventId}"]`);
	if (eventBox) {
		eventBox.remove();
		delete prizeCounters[eventId]; // Clean up prize counter
	}
}

function addPrizeForm(eventId) {
	prizeCounters[eventId]++;
	const prizeId = `${eventId}-${prizeCounters[eventId]}`;
	
	const eventBox = document.querySelector(`[data-event-id="${eventId}"]`);
	const prizesContainer = eventBox.querySelector(".prizes-container");
	
	const prizeDiv = document.createElement("div");
	prizeDiv.className = "box has-background-grey-lighter mb-2";
	prizeDiv.dataset.prizeId = prizeId;
	prizeDiv.innerHTML = `
		<div class="columns is-mobile">
			<div class="column is-narrow">
				<div class="field">
					<label class="label is-small">Placement</label>
					<div class="control">
						<input class="input is-small prize-placement" type="text" placeholder="e.g., 1st" required>
					</div>
				</div>
			</div>
			<div class="column">
				<div class="field">
					<label class="label is-small">Prize Description</label>
					<div class="control">
						<input class="input is-small prize-description" type="text" placeholder="e.g., $10,000 + Trophy" required>
					</div>
				</div>
			</div>
			<div class="column is-narrow">
				<label class="label is-small" style="visibility: hidden;">Remove</label>
				<button class="button is-danger is-small remove-prize-btn" data-prize-id="${prizeId}" type="button">×</button>
			</div>
		</div>
	`;
	
	prizesContainer.appendChild(prizeDiv);
	
	// Add event listener for remove button
	const removeBtn = prizeDiv.querySelector(".remove-prize-btn");
	removeBtn.addEventListener("click", (e) => {
		const prizeIdToRemove = e.target.dataset.prizeId;
		removePrizeForm(prizeIdToRemove);
	});
}

function removePrizeForm(prizeId) {
	const prizeDiv = document.querySelector(`[data-prize-id="${prizeId}"]`);
	if (prizeDiv) {
		prizeDiv.remove();
	}
}

function addTournamentSponsorForm() {
	sponsorCounter++;
	const container = document.getElementById("tournament-sponsors-container");
	
	const sponsorDiv = document.createElement("div");
	sponsorDiv.className = "box has-background-grey-lighter mb-2";
	sponsorDiv.dataset.sponsorId = sponsorCounter;
	sponsorDiv.innerHTML = `
		<div class="columns">
			<div class="column">
				<div class="field">
					<label class="label is-small">Sponsor Name</label>
					<div class="control">
						<input class="input is-small sponsor-name" type="text" placeholder="e.g., Red Bull" required>
					</div>
				</div>
			</div>
			<div class="column">
				<div class="field">
					<label class="label is-small">Website</label>
					<div class="control">
						<input class="input is-small sponsor-website" type="text" placeholder="e.g., https://redbull.com">
					</div>
				</div>
			</div>
			<div class="column is-narrow">
				<label class="label is-small" style="visibility: hidden;">Remove</label>
				<button class="button is-danger is-small remove-sponsor-btn" data-sponsor-id="${sponsorCounter}" type="button">×</button>
			</div>
		</div>
	`;
	
	container.appendChild(sponsorDiv);
	
	const removeBtn = sponsorDiv.querySelector(".remove-sponsor-btn");
	removeBtn.addEventListener("click", (e) => {
		const sponsorIdToRemove = e.target.dataset.sponsorId;
		removeTournamentSponsorForm(sponsorIdToRemove);
	});
}

function removeTournamentSponsorForm(sponsorId) {
	const sponsorDiv = document.querySelector(`#tournament-sponsors-container [data-sponsor-id="${sponsorId}"]`);
	if (sponsorDiv) {
		sponsorDiv.remove();
	}
}

function addEventSponsorForm(eventId) {
	if (!eventSponsorCounters[eventId]) {
		eventSponsorCounters[eventId] = 0;
	}
	eventSponsorCounters[eventId]++;
	const sponsorId = `${eventId}-${eventSponsorCounters[eventId]}`;
	
	const eventBox = document.querySelector(`[data-event-id="${eventId}"]`);
	const sponsorsContainer = eventBox.querySelector(".event-sponsors-container");
	
	const sponsorDiv = document.createElement("div");
	sponsorDiv.className = "box has-background-grey-lighter mb-2";
	sponsorDiv.dataset.eventSponsorId = sponsorId;
	sponsorDiv.innerHTML = `
		<div class="columns is-mobile">
			<div class="column">
				<div class="field">
					<label class="label is-small">Sponsor Name</label>
					<div class="control">
						<input class="input is-small event-sponsor-name" type="text" placeholder="e.g., Monster Energy" required>
					</div>
				</div>
			</div>
			<div class="column">
				<div class="field">
					<label class="label is-small">Website</label>
					<div class="control">
						<input class="input is-small event-sponsor-website" type="text" placeholder="e.g., https://monsterenergy.com">
					</div>
				</div>
			</div>
			<div class="column is-narrow">
				<label class="label is-small" style="visibility: hidden;">Remove</label>
				<button class="button is-danger is-small remove-event-sponsor-btn" data-event-sponsor-id="${sponsorId}" type="button">×</button>
			</div>
		</div>
	`;
	
	sponsorsContainer.appendChild(sponsorDiv);
	
	const removeBtn = sponsorDiv.querySelector(".remove-event-sponsor-btn");
	removeBtn.addEventListener("click", (e) => {
		const sponsorIdToRemove = e.target.dataset.eventSponsorId;
		removeEventSponsorForm(sponsorIdToRemove);
	});
}

function removeEventSponsorForm(sponsorId) {
	const sponsorDiv = document.querySelector(`[data-event-sponsor-id="${sponsorId}"]`);
	if (sponsorDiv) {
		sponsorDiv.remove();
	}
}

function collectEventData() {
	const container = document.getElementById("events-container");
	const eventBoxes = container.querySelectorAll(".box");
	const events = [];
	const registrationDate = new Date().toISOString().split('T')[0]; // Current date

	eventBoxes.forEach((box) => {
		const nameInput = box.querySelector(".event-name");
		const gameInput = box.querySelector(".event-game");
		const locationInput = box.querySelector(".event-location");
		const scheduleStartInput = box.querySelector(".event-schedule-start");
		const scheduleEndInput = box.querySelector(".event-schedule-end");

		if (!nameInput || !gameInput) return; // Skip if essential fields don't exist

		const name = nameInput.value.trim();
		const game = gameInput.value.trim();
		const location = locationInput ? locationInput.value.trim() : "";
		const scheduleStart = scheduleStartInput ? scheduleStartInput.value : "";
		const scheduleEnd = scheduleEndInput ? scheduleEndInput.value : "";

		if (name && game) {
			let scheduleRange;
			if (scheduleStart && scheduleEnd) {
				const sISO = toUTCISOString(scheduleStart, true); // true = start of day
				const eISO = toUTCISOString(scheduleEnd, false); // false = end of day
				scheduleRange = `[${sISO},${eISO})`;
			} else {
				const start = new Date();
				const sISO = new Date(
					start.getFullYear(),
					start.getMonth(),
					start.getDate(),
					9,
					0,
					0
				).toISOString();
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

			// Collect prizes for this event
			const prizes = [];
			const prizeBoxes = box.querySelectorAll(".prizes-container [data-prize-id]");
			prizeBoxes.forEach((prizeBox) => {
				const placementInput = prizeBox.querySelector(".prize-placement");
				const descriptionInput = prizeBox.querySelector(".prize-description");
				if (placementInput && descriptionInput) {
					const placement = placementInput.value;
					const description = descriptionInput.value.trim();
					if (placement && description) {
						prizes.push({
							placement: placement,
							prize_description: description,
						});
					}
				}
			});

			// Collect event sponsors
			const eventSponsors = [];
			const eventSponsorBoxes = box.querySelectorAll(".event-sponsors-container [data-event-sponsor-id]");
			eventSponsorBoxes.forEach((sponsorBox) => {
				const nameInput = sponsorBox.querySelector(".event-sponsor-name");
				const websiteInput = sponsorBox.querySelector(".event-sponsor-website");
				if (nameInput) {
					const sponsorName = nameInput.value.trim();
					const sponsorWebsite = websiteInput ? websiteInput.value.trim() : "";
					if (sponsorName) {
						eventSponsors.push({
							name: sponsorName,
							website: sponsorWebsite || ""
						});
					}
				}
			});

			events.push({
				name,
				game_title: game,
				registration_date: registrationDate,
				location: location || "TBD",
				schedule: scheduleRange,
				prizes: prizes, // Include prizes array
				sponsors: eventSponsors, // Include event sponsors
			});
		}
	});

	return events;
}

function collectTournamentSponsors() {
	const sponsors = [];
	const sponsorBoxes = document.querySelectorAll("#tournament-sponsors-container [data-sponsor-id]");
	
	sponsorBoxes.forEach((sponsorBox) => {
		const nameInput = sponsorBox.querySelector(".sponsor-name");
		const websiteInput = sponsorBox.querySelector(".sponsor-website");
		
		if (nameInput) {
			const name = nameInput.value.trim();
			const website = websiteInput ? websiteInput.value.trim() : "";
			
			if (name) {
				sponsors.push({
					name: name,
					website: website || ""
				});
			}
		}
	});
	
	return sponsors;
}

async function handleCreateTournament() {
	const name = document.getElementById("tname")?.value?.trim();
	const location = document.getElementById("tlocation")?.value?.trim() || "TBD";
	const scheduleStart = document.getElementById("schedule_start")?.value || null;
	const scheduleEnd = document.getElementById("schedule_end")?.value || null;

	if (!name) {
		return alert("Please enter a tournament name.");
	}

	const registrationDate = new Date().toISOString().split('T')[0]; // Current date

	let scheduleRange;
	if (scheduleStart && scheduleEnd) {
		const sISO = toUTCISOString(scheduleStart, true); // Start of day
		const eISO = toUTCISOString(scheduleEnd, false); // End of day
		scheduleRange = `[${sISO},${eISO})`;
	} else {
		const start = new Date();
		const sISO = new Date(
			start.getFullYear(),
			start.getMonth(),
			start.getDate(),
			9,
			0,
			0
		).toISOString();
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

	const events = collectEventData();
	const tournamentSponsors = collectTournamentSponsors();

	try {
		const buttonText = document.getElementById("createTournamentBtn").textContent;
		
		if (buttonText === "Update Tournament Details") {
			// Only update tournament details, not events
			await updateTournamentDetailsOnly(editingTournamentId, name, location, scheduleRange, tournamentSponsors);
		} else if (buttonText === "Update Event Details") {
			// Only update events, not tournament
			await updateEventsOnly(editingTournamentId, events);
		} else if (editingTournamentId) {
			// Full update (legacy)
			await updateTournament(editingTournamentId, name, location, scheduleRange, events, tournamentSponsors);
		} else {
			// Create new tournament
			await createTournament(name, registrationDate, location, scheduleRange, events, tournamentSponsors);
		}
	} catch (err) {
		console.error("Unexpected error:", err);
		alert("Unexpected error. See console.");
	}
}

async function createTournament(name, registrationDate, location, scheduleRange, events, tournamentSponsors) {
	// Get count of existing tournaments to generate tournament_code
	const { count, error: countError } = await supabase
		.from("tournaments")
		.select("*", { count: "exact", head: true });

	if (countError) {
		console.error("Error counting tournaments:", countError);
		alert("Failed to generate tournament code: " + countError.message);
		return;
	}

	const tournamentNumber = (count || 0) + 1;
	const tournamentCode = `T${String(tournamentNumber).padStart(4, '0')}`;

	const insertObj = {
		tournament_code: tournamentCode,
		name,
		registration_date: registrationDate,
		location,
		schedule: scheduleRange,
	};

	const { data: tournamentData, error: tournamentError } = await supabase
		.from("tournaments")
		.insert([insertObj])
		.select();

	if (tournamentError) {
		console.error("Insert tournament error:", tournamentError);
		alert("Failed to create tournament: " + tournamentError.message);
		return;
	}

	const tournamentId = tournamentData[0].id;

	// Insert tournament sponsors
	if (tournamentSponsors.length > 0) {
		const sponsorsToInsert = tournamentSponsors.map(sponsor => ({
			...sponsor,
			tournament_id: tournamentId
		}));

		const { error: sponsorsError } = await supabase
			.from("sponsors")
			.insert(sponsorsToInsert);

		if (sponsorsError) {
			console.error("Insert tournament sponsors error:", sponsorsError);
		}
	}

	// Insert events for this tournament
	if (events.length > 0) {
		// Get count of existing events to generate event_codes
		const { count: eventCount, error: eventCountError } = await supabase
			.from("events")
			.select("*", { count: "exact", head: true });

		if (eventCountError) {
			console.error("Error counting events:", eventCountError);
		}

		let eventNumber = (eventCount || 0) + 1;

		for (const event of events) {
			const { prizes, sponsors, ...eventData } = event;
			
			const eventCode = `E${String(eventNumber).padStart(4, '0')}`;
			eventNumber++;

			const eventsToInsert = {
				...eventData,
				tournament_id: tournamentId,
				event_code: eventCode,
			};

			const { data: eventInsertData, error: eventsError } = await supabase
				.from("events")
				.insert([eventsToInsert])
				.select();

			if (eventsError) {
				console.error("Insert events error:", eventsError);
				alert("Tournament created but some events failed: " + eventsError.message);
				return;
			}

			const eventId = eventInsertData[0].id;

			// Insert prize distributions for this event
			if (prizes && prizes.length > 0) {
				const prizesToInsert = prizes.map((prize, index) => ({
					...prize,
					distribution_code: `${eventCode}-P${String(index + 1).padStart(2, '0')}`,
					event_id: eventId
				}));

				const { error: prizesError } = await supabase
					.from("prize_distributions")
					.insert(prizesToInsert);

				if (prizesError) {
					console.error("Insert prizes error:", prizesError);
				}
			}

			// Insert event sponsors
			if (sponsors && sponsors.length > 0) {
				const eventSponsorsToInsert = sponsors.map(sponsor => ({
					...sponsor,
					event_id: eventId
				}));

				const { error: eventSponsorsError } = await supabase
					.from("sponsors")
					.insert(eventSponsorsToInsert);

				if (eventSponsorsError) {
					console.error("Insert event sponsors error:", eventSponsorsError);
				}
			}
		}
	}

	alert(`Tournament created successfully with ${events.length} event(s)!`);
	clearForm();
	loadTournaments();
}

async function updateTournamentDetailsOnly(tournamentId, name, location, scheduleRange, tournamentSponsors) {
	const updateObj = {
		name,
		location,
		schedule: scheduleRange,
	};

	const { error: tournamentError } = await supabase
		.from("tournaments")
		.update(updateObj)
		.eq("id", tournamentId);

	if (tournamentError) {
		console.error("Update tournament error:", tournamentError);
		alert("Failed to update tournament: " + tournamentError.message);
		return;
	}

	// Delete existing tournament sponsors
	const { error: deleteSponsorsError } = await supabase
		.from("sponsors")
		.delete()
		.eq("tournament_id", tournamentId)
		.is("event_id", null);

	if (deleteSponsorsError) {
		console.error("Delete tournament sponsors error:", deleteSponsorsError);
	}

	// Re-insert tournament sponsors
	if (tournamentSponsors.length > 0) {
		const sponsorsToInsert = tournamentSponsors.map(sponsor => ({
			...sponsor,
			tournament_id: tournamentId
		}));

		const { error: sponsorsError } = await supabase
			.from("sponsors")
			.insert(sponsorsToInsert);

		if (sponsorsError) {
			console.error("Insert tournament sponsors error:", sponsorsError);
		}
	}

	alert("Tournament details updated successfully!");
	clearForm();
	editingTournamentId = null;
	document.getElementById("createTournamentBtn").textContent = "Create Tournament with Events";
	loadTournaments();
}

async function updateEventsOnly(tournamentId, events) {
	// Delete existing events
	const { error: deleteError } = await supabase
		.from("events")
		.delete()
		.eq("tournament_id", tournamentId);

	if (deleteError) {
		console.error("Delete events error:", deleteError);
	}

	// Re-insert events
	if (events.length > 0) {
		const { count: eventCount, error: eventCountError } = await supabase
			.from("events")
			.select("*", { count: "exact", head: true });

		if (eventCountError) {
			console.error("Error counting events:", eventCountError);
		}

		let eventNumber = (eventCount || 0) + 1;

		for (const event of events) {
			const { prizes, sponsors, ...eventData } = event;
			
			const eventCode = `E${String(eventNumber).padStart(4, '0')}`;
			eventNumber++;

			const eventsToInsert = {
				...eventData,
				tournament_id: tournamentId,
				event_code: eventCode,
			};

			const { data: eventInsertData, error: eventsError } = await supabase
				.from("events")
				.insert([eventsToInsert])
				.select();

			if (eventsError) {
				console.error("Insert events error:", eventsError);
				continue;
			}

			const eventId = eventInsertData[0].id;

			// Insert prize distributions
			if (prizes && prizes.length > 0) {
				const prizesToInsert = prizes.map((prize, index) => ({
					...prize,
					distribution_code: `${eventCode}-P${String(index + 1).padStart(2, '0')}`,
					event_id: eventId
				}));

				const { error: prizesError } = await supabase
					.from("prize_distributions")
					.insert(prizesToInsert);

				if (prizesError) {
					console.error("Insert prizes error:", prizesError);
				}
			}

			// Insert event sponsors
			if (sponsors && sponsors.length > 0) {
				const eventSponsorsToInsert = sponsors.map(sponsor => ({
					...sponsor,
					event_id: eventId
				}));

				const { error: eventSponsorsError } = await supabase
					.from("sponsors")
					.insert(eventSponsorsToInsert);

				if (eventSponsorsError) {
					console.error("Insert event sponsors error:", eventSponsorsError);
				}
			}
		}
	}

	alert("Event details updated successfully!");
	clearForm();
	editingTournamentId = null;
	document.getElementById("createTournamentBtn").textContent = "Create Tournament with Events";
	loadTournaments();
}

async function updateTournament(tournamentId, name, location, scheduleRange, events, tournamentSponsors) {
	const updateObj = {
		name,
		location,
		schedule: scheduleRange,
	};

	const { error: tournamentError } = await supabase
		.from("tournaments")
		.update(updateObj)
		.eq("id", tournamentId);

	if (tournamentError) {
		console.error("Update tournament error:", tournamentError);
		alert("Failed to update tournament: " + tournamentError.message);
		return;
	}

	// Delete existing tournament sponsors
	const { error: deleteSponsorsError } = await supabase
		.from("sponsors")
		.delete()
		.eq("tournament_id", tournamentId)
		.is("event_id", null);

	if (deleteSponsorsError) {
		console.error("Delete tournament sponsors error:", deleteSponsorsError);
	}

	// Re-insert tournament sponsors
	if (tournamentSponsors.length > 0) {
		const sponsorsToInsert = tournamentSponsors.map(sponsor => ({
			...sponsor,
			tournament_id: tournamentId
		}));

		const { error: sponsorsError } = await supabase
			.from("sponsors")
			.insert(sponsorsToInsert);

		if (sponsorsError) {
			console.error("Insert tournament sponsors error:", sponsorsError);
		}
	}

	// Delete existing events (simplified approach)
	const { error: deleteError } = await supabase
		.from("events")
		.delete()
		.eq("tournament_id", tournamentId);

	if (deleteError) {
		console.error("Delete events error:", deleteError);
	}

	// Re-insert events
	if (events.length > 0) {
		// Get count of existing events to generate event_codes
		const { count: eventCount, error: eventCountError } = await supabase
			.from("events")
			.select("*", { count: "exact", head: true });

		if (eventCountError) {
			console.error("Error counting events:", eventCountError);
		}

		let eventNumber = (eventCount || 0) + 1;

		for (const event of events) {
			const { prizes, sponsors, ...eventData } = event;
			
			const eventCode = `E${String(eventNumber).padStart(4, '0')}`;
			eventNumber++;

			const eventsToInsert = {
				...eventData,
				tournament_id: tournamentId,
				event_code: eventCode,
			};

			const { data: eventInsertData, error: eventsError } = await supabase
				.from("events")
				.insert([eventsToInsert])
				.select();

			if (eventsError) {
				console.error("Insert events error:", eventsError);
				continue;
			}

			const eventId = eventInsertData[0].id;

			// Insert prize distributions
			if (prizes && prizes.length > 0) {
				const prizesToInsert = prizes.map((prize, index) => ({
					...prize,
					distribution_code: `${eventCode}-P${String(index + 1).padStart(2, '0')}`,
					event_id: eventId
				}));

				const { error: prizesError } = await supabase
					.from("prize_distributions")
					.insert(prizesToInsert);

				if (prizesError) {
					console.error("Insert prizes error:", prizesError);
				}
			}

			// Insert event sponsors
			if (sponsors && sponsors.length > 0) {
				const eventSponsorsToInsert = sponsors.map(sponsor => ({
					...sponsor,
					event_id: eventId
				}));

				const { error: eventSponsorsError } = await supabase
					.from("sponsors")
					.insert(eventSponsorsToInsert);

				if (eventSponsorsError) {
					console.error("Insert event sponsors error:", eventSponsorsError);
				}
			}
		}
	}

	alert("Tournament updated successfully!");
	clearForm();
	editingTournamentId = null;
	document.getElementById("createTournamentBtn").textContent = "Create Tournament with Events";
	loadTournaments();
}

function clearForm() {
	document.getElementById("tname").value = "";
	document.getElementById("tlocation").value = "";
	document.getElementById("schedule_start").value = "";
	document.getElementById("schedule_end").value = "";
	
	// Show all hidden fields
	document.getElementById("tname").parentElement.parentElement.style.display = "block";
	document.getElementById("tlocation").parentElement.parentElement.style.display = "block";
	
	// Show the entire schedule columns container (both start and end fields)
	const scheduleStartField = document.querySelector("#schedule_start");
	const scheduleColumnsContainer = scheduleStartField.closest(".columns");
	if (scheduleColumnsContainer) {
		scheduleColumnsContainer.style.display = "flex";
	}
	document.querySelector("#events-container").parentElement.style.display = "block";
	document.querySelector("#tournament-sponsors-section").style.display = "block";
	
	// Clear all events
	const container = document.getElementById("events-container");
	container.innerHTML = "";
	eventCounter = 0;
	prizeCounters = {};
	eventSponsorCounters = {};
	
	// Clear tournament sponsors
	const sponsorContainer = document.getElementById("tournament-sponsors-container");
	sponsorContainer.innerHTML = "";
	sponsorCounter = 0;
	
	// Reset editing mode
	editingTournamentId = null;
	document.getElementById("createTournamentBtn").textContent = "Create Tournament with Events";
}

function toUTCISOString(inputValue, isStartTime = true) {
	try {
		let d;
		if (inputValue.includes("T")) {
			d = new Date(inputValue);
		} else {
			// If no time specified, use start of day for start times, end of day for end times
			const timeString = isStartTime ? "T09:00:00" : "T23:59:59";
			d = new Date(inputValue + timeString);
		}
		return d.toISOString();
	} catch (e) {
		return inputValue;
	}
}
