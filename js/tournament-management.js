import { supabase } from "./supabase.js";

let eventCounter = 0;

document.addEventListener("DOMContentLoaded", () => {
	const createBtn = document.getElementById("createTournamentBtn");
	const addEventBtn = document.getElementById("addEventBtn");

	if (addEventBtn) {
		addEventBtn.addEventListener("click", () => {
			addEventForm();
		});
	}

	if (createBtn) {
		createBtn.addEventListener("click", async () => {
			await handleCreateTournament();
		});
	}
});

function addEventForm() {
	eventCounter++;
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
			<label class="label has-text-white-ter">Event Registration Date</label>
			<div class="control">
				<input class="input event-reg-date" type="date" required>
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
	`;

	container.appendChild(eventBox);

	// Add event listener for remove button
	const removeBtn = eventBox.querySelector(".remove-event-btn");
	removeBtn.addEventListener("click", (e) => {
		const eventId = e.target.dataset.eventId;
		removeEventForm(eventId);
	});
}

function removeEventForm(eventId) {
	const container = document.getElementById("events-container");
	const eventBox = container.querySelector(`[data-event-id="${eventId}"]`);
	if (eventBox) {
		eventBox.remove();
	}
}

function collectEventData() {
	const container = document.getElementById("events-container");
	const eventBoxes = container.querySelectorAll(".box");
	const events = [];

	eventBoxes.forEach((box) => {
		const name = box.querySelector(".event-name").value.trim();
		const game = box.querySelector(".event-game").value.trim();
		const regDate = box.querySelector(".event-reg-date").value;
		const location = box.querySelector(".event-location").value.trim();
		const scheduleStart = box.querySelector(".event-schedule-start").value;
		const scheduleEnd = box.querySelector(".event-schedule-end").value;

		if (name && game && regDate) {
			let scheduleRange;
			if (scheduleStart && scheduleEnd) {
				const sISO = toUTCISOString(scheduleStart);
				const eISO = toUTCISOString(scheduleEnd);
				scheduleRange = `[${sISO},${eISO})`;
			} else {
				const start = new Date(regDate);
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

			events.push({
				name,
				game_title: game,
				registration_date: regDate,
				location: location || "TBD",
				schedule: scheduleRange,
			});
		}
	});

	return events;
}

async function handleCreateTournament() {
	const name = document.getElementById("tname")?.value?.trim();
	const dateVal = document.getElementById("tdate")?.value;
	const location = document.getElementById("tlocation")?.value?.trim() || "TBD";
	const scheduleStart = document.getElementById("schedule_start")?.value || null;
	const scheduleEnd = document.getElementById("schedule_end")?.value || null;

	if (!name || !dateVal) {
		return alert("Please enter at least a tournament name and registration date.");
	}

	let scheduleRange;
	if (scheduleStart && scheduleEnd) {
		const sISO = toUTCISOString(scheduleStart);
		const eISO = toUTCISOString(scheduleEnd);
		scheduleRange = `[${sISO},${eISO})`;
	} else {
		const start = new Date(dateVal);
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

	try {
		// Insert tournament
		const insertObj = {
			tournament_code: null,
			name,
			registration_date: dateVal,
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

		// Insert events for this tournament
		if (events.length > 0) {
			const eventsToInsert = events.map(event => ({
				...event,
				tournament_id: tournamentId,
				event_code: null,
			}));

			const { error: eventsError } = await supabase
				.from("events")
				.insert(eventsToInsert);

			if (eventsError) {
				console.error("Insert events error:", eventsError);
				alert("Tournament created but some events failed: " + eventsError.message);
				return;
			}
		}

		alert(`Tournament created successfully with ${events.length} event(s)!`);
		
		// Clear form
		clearForm();
	} catch (err) {
		console.error("Unexpected error creating tournament", err);
		alert("Unexpected error. See console.");
	}
}

function clearForm() {
	document.getElementById("tname").value = "";
	document.getElementById("tdate").value = "";
	document.getElementById("tlocation").value = "";
	document.getElementById("schedule_start").value = "";
	document.getElementById("schedule_end").value = "";
	
	// Clear all events
	const container = document.getElementById("events-container");
	container.innerHTML = "";
	eventCounter = 0;
}

function toUTCISOString(inputValue) {
	try {
		let d;
		if (inputValue.includes("T")) {
			d = new Date(inputValue);
		} else {
			d = new Date(inputValue + "T09:00:00");
		}
		return d.toISOString();
	} catch (e) {
		return inputValue;
	}
}
