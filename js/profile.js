import { supabase } from "./supabase.js";

let currentUserId = null;

document.addEventListener("DOMContentLoaded", () => {
    initAuthUI();
    checkAuthState();
});

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
    const loginBtnRequired = document.getElementById("loginBtnRequired");

    // Open/close modal
    loginBtn.addEventListener("click", () => {
        loginModal.classList.add("is-active");
    });

    loginBtnRequired.addEventListener("click", () => {
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
        const passwordConfirm = document.getElementById("signupPasswordConfirm").value.trim();
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
            alert("Sign up successful! You can now log in with your username and password.");
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
    const loginRequiredSection = document.getElementById("login-required-section");
    const profileContent = document.getElementById("profile-content");

    if (data.session) {
        // User is logged in
        loginBtn.style.display = "none";
        logoutBtn.style.display = "block";
        userInfo.style.display = "block";
        loginRequiredSection.style.display = "none";
        profileContent.style.display = "block";

        const userId = data.session.user.id;
        const email = data.session.user.email || "";
        const username = email.split("@")[0];

        currentUserId = userId;
        localStorage.setItem("currentUserId", userId);
        userName.innerText = username;

        // Load profile
        loadProfile(userId, email);
    } else {
        // User is not logged in
        loginBtn.style.display = "block";
        logoutBtn.style.display = "none";
        userInfo.style.display = "none";
        loginRequiredSection.style.display = "block";
        profileContent.style.display = "none";
        localStorage.removeItem("currentUserId");
        currentUserId = null;
    }
}

async function loadProfile(userId, email) {
    // Set profile header
    const username = email.split("@")[0];
    document.getElementById("profileUsername").textContent = username;
    document.getElementById("profileEmail").textContent = email;

    // Load followed items
    await loadFollowedTournaments(userId);
    await loadFollowedTeams(userId);
    await loadFollowedPlayers(userId);
}

async function loadFollowedTournaments(userId) {
    const container = document.getElementById("followed-tournaments-list");
    container.innerHTML = '<div class="has-text-white">Loading tournaments...</div>';

    // Get followed tournament IDs
    const { data: followedData, error: followError } = await supabase
        .from("followed_items")
        .select("item_id")
        .eq("user_id", userId)
        .eq("item_type", "tournament");

    if (followError) {
        console.error("Error loading followed tournaments:", followError);
        container.innerHTML = '<div class="notification is-danger">Error loading tournaments</div>';
        return;
    }

    if (!followedData || followedData.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📅</div>
                <p>You haven't followed any tournaments yet.</p>
                <p style="margin-top: 1rem;"><a href="index.html" class="button is-info is-small">Browse Tournaments</a></p>
            </div>
        `;
        return;
    }

    const tournamentIds = followedData.map(f => f.item_id);

    // Get tournament details
    const { data: tournaments, error: tournamentsError } = await supabase
        .from("tournaments")
        .select(`
            id,
            tournament_code,
            name,
            registration_date,
            location,
            schedule,
            events:events(id, event_code, name, game_title, schedule)
        `)
        .in("id", tournamentIds)
        .order("registration_date", { ascending: false });

    if (tournamentsError) {
        console.error("Error fetching tournaments:", tournamentsError);
        container.innerHTML = '<div class="notification is-danger">Error fetching tournaments</div>';
        return;
    }

    if (!tournaments || tournaments.length === 0) {
        container.innerHTML = '<div class="has-text-white">No followed tournaments found.</div>';
        return;
    }

    container.innerHTML = "";
    const cols = document.createElement("div");
    cols.className = "columns is-multiline";

    tournaments.forEach(t => {
        const sch = formatRange(t.schedule);
        const regDate = formatDateTime(t.registration_date);
        const eventsHtml = t.events && t.events.length
            ? `<div class="content"><strong>Events</strong><ul>${t.events.map(e => `<li>${escapeHtml(e.name)} (${escapeHtml(e.game_title)})</li>`).join("")}</ul></div>`
            : '<p class="has-text-grey">No events</p>';

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
                        <p><strong>Location:</strong> ${escapeHtml(t.location || "")}</p>
                        <p><strong>Schedule:</strong> ${escapeHtml(sch)}</p>
                        ${eventsHtml}
                    </div>
                </div>
                <footer class="card-footer">
                    <button class="card-footer-item unfollow-btn" data-item-id="${t.id}" data-item-type="tournament" style="background: none; border: none; color: #f14668; cursor: pointer;">
                        ★ Unfollow
                    </button>
                </footer>
            </div>
        `;
        cols.appendChild(col);
    });

    container.appendChild(cols);

    // Add unfollow listeners
    document.querySelectorAll(".unfollow-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const itemId = btn.dataset.itemId;
            const itemType = btn.dataset.itemType;
            await unfollowItem(userId, itemId, itemType);
        });
    });
}

async function loadFollowedTeams(userId) {
    const container = document.getElementById("followed-teams-list");
    container.innerHTML = '<div class="has-text-white">Loading teams...</div>';

    // Get followed team IDs
    const { data: followedData, error: followError } = await supabase
        .from("followed_items")
        .select("item_id")
        .eq("user_id", userId)
        .eq("item_type", "team");

    if (followError) {
        console.error("Error loading followed teams:", followError);
        container.innerHTML = '<div class="notification is-danger">Error loading teams</div>';
        return;
    }

    if (!followedData || followedData.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🏆</div>
                <p>You haven't followed any teams yet.</p>
                <p style="margin-top: 1rem;"><a href="index.html" class="button is-info is-small">Browse Teams</a></p>
            </div>
        `;
        return;
    }

    const teamIds = followedData.map(f => f.item_id);

    // Get team details
    const { data: teams, error: teamsError } = await supabase
        .from("teams")
        .select("id, team_code, name, registration_date, region")
        .in("id", teamIds)
        .order("registration_date", { ascending: false });

    if (teamsError) {
        console.error("Error fetching teams:", teamsError);
        container.innerHTML = '<div class="notification is-danger">Error fetching teams</div>';
        return;
    }

    if (!teams || teams.length === 0) {
        container.innerHTML = '<div class="has-text-white">No followed teams found.</div>';
        return;
    }

    container.innerHTML = "";
    const cols = document.createElement("div");
    cols.className = "columns is-multiline";

    teams.forEach(team => {
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
                    <button class="card-footer-item unfollow-btn" data-item-id="${team.id}" data-item-type="team" style="background: none; border: none; color: #f14668; cursor: pointer;">
                        ★ Unfollow
                    </button>
                </footer>
            </div>
        `;
        cols.appendChild(col);
    });

    container.appendChild(cols);

    // Add unfollow listeners
    document.querySelectorAll(".unfollow-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const itemId = btn.dataset.itemId;
            const itemType = btn.dataset.itemType;
            await unfollowItem(userId, itemId, itemType);
        });
    });
}

async function loadFollowedPlayers(userId) {
    const container = document.getElementById("followed-players-list");
    container.innerHTML = '<div class="has-text-white">Loading players...</div>';

    // Get followed player IDs
    const { data: followedData, error: followError } = await supabase
        .from("followed_items")
        .select("item_id")
        .eq("user_id", userId)
        .eq("item_type", "player");

    if (followError) {
        console.error("Error loading followed players:", followError);
        container.innerHTML = '<div class="notification is-danger">Error loading players</div>';
        return;
    }

    if (!followedData || followedData.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">👤</div>
                <p>You haven't followed any players yet.</p>
                <p style="margin-top: 1rem;"><a href="index.html" class="button is-info is-small">Browse Players</a></p>
            </div>
        `;
        return;
    }

    const playerIds = followedData.map(f => f.item_id);

    // Get player details
    const { data: players, error: playersError } = await supabase
        .from("players")
        .select("id, player_code, name, registration_date, region")
        .in("id", playerIds)
        .order("registration_date", { ascending: false });

    if (playersError) {
        console.error("Error fetching players:", playersError);
        container.innerHTML = '<div class="notification is-danger">Error fetching players</div>';
        return;
    }

    if (!players || players.length === 0) {
        container.innerHTML = '<div class="has-text-white">No followed players found.</div>';
        return;
    }

    container.innerHTML = "";
    const cols = document.createElement("div");
    cols.className = "columns is-multiline";

    players.forEach(player => {
        const col = document.createElement("div");
        col.className = "column is-one-quarter";
        col.innerHTML = `
            <div class="card">
                <div class="card-content">
                    <p class="title is-6">${escapeHtml(player.name)}</p>
                    <p class="subtitle is-7">Code: ${escapeHtml(player.player_code || "")}</p>
                    <p class="has-text-grey">Region: ${escapeHtml(player.region || "")}</p>
                </div>
                <footer class="card-footer">
                    <button class="card-footer-item unfollow-btn" data-item-id="${player.id}" data-item-type="player" style="background: none; border: none; color: #f14668; cursor: pointer;">
                        ★ Unfollow
                    </button>
                </footer>
            </div>
        `;
        cols.appendChild(col);
    });

    container.appendChild(cols);

    // Add unfollow listeners
    document.querySelectorAll(".unfollow-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const itemId = btn.dataset.itemId;
            const itemType = btn.dataset.itemType;
            await unfollowItem(userId, itemId, itemType);
        });
    });
}

async function unfollowItem(userId, itemId, itemType) {
    try {
        const { error } = await supabase
            .from("followed_items")
            .delete()
            .eq("user_id", userId)
            .eq("item_type", itemType)
            .eq("item_id", itemId);

        if (error) {
            console.error("Error unfollowing:", error);
            alert("Failed to unfollow");
            return;
        }

        alert(`Unfollowed ${itemType}!`);
        
        // Reload profile
        loadProfile(userId, `${localStorage.getItem("currentUsername")}@gmail.com`);
    } catch (err) {
        console.error("Unexpected error:", err);
        alert("Unexpected error. See console.");
    }
}

function formatDateTime(dt) {
    if (!dt) return "";
    const d = new Date(dt);
    if (isNaN(d)) return dt;
    return d.toLocaleString();
}

function formatRange(rangeStr) {
    if (!rangeStr) return "TBD";
    try {
        const inner = rangeStr.replace(/^\[|\(|\]|\)$/g, "");
        const [start, end] = inner.split(",");
        const s = start ? new Date(start).toLocaleString() : "";
        const e = end ? new Date(end).toLocaleString() : "";
        return `${s} — ${e}`;
    } catch (e) {
        return String(rangeStr);
    }
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