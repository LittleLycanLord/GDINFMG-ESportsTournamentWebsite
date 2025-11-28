// Placeholder for future Supabase connection

document.addEventListener("DOMContentLoaded", () => {
	const tournamentBox = document.getElementById("tournament-list");

	tournamentBox.innerHTML = `
    <div class="box has-background-dark has-text-white">
      <strong>No tournaments yet.</strong><br>
      Once Supabase is connected, tournaments will appear here automatically.
    </div>
  `;
});
