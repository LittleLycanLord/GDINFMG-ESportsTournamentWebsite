import { supabase } from "./supabase.js";

document.addEventListener("DOMContentLoaded", () => {
	const createBtn = document.getElementById("createTournamentBtn");
	if (createBtn) {
		createBtn.addEventListener("click", async () => {
			await handleCreateTournament();
		});
	}
});

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

	try {
		const insertObj = {
			tournament_code: null,
			name,
			registration_date: dateVal,
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

		alert("Tournament created successfully!");
		
		// Clear form
		document.getElementById("tname").value = "";
		document.getElementById("tdate").value = "";
		document.getElementById("tlocation").value = "";
		document.getElementById("schedule_start").value = "";
		document.getElementById("schedule_end").value = "";
	} catch (err) {
		console.error("Unexpected error creating tournament", err);
		alert("Unexpected error. See console.");
	}
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
