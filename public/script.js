//
// Clément Augustinowick
//

const tournamentDescriptions = {
    RoundRobin: "* Chaque équipe rencontre toutes les autres équipes.",
    NombreDeParties: "* Chaque équipe joue un nombre défini de parties. À chaque tour les rencontres sont tirées au sort.",
    SimpleKO: "* Les équipes sont placées dans un tableau de rencontre à élimination directe.",
    DoubleKO: "* Les équipes qui perdent au premier tour sont replacées dans un second tableau.",
    TournoisSuisse: "* Chaque équipe joue un nombre défini de parties. Les rencontres sont tirées au sort en fonction des performances.",
    TournoisPoule: "* Les équipes sont réparties dans différents groupes.",
    TournoisPouleTableau: "* Les équipes sont réparties dans différents groupes puis placées dans un tableau à élimination directe."
};

let state = {
    teamsList: [],
    tournamentInfos: {},
    matches: [],
    currentRound: 1
};

let currentMatch = 1;

///////////////////////////////////////////////////////////////////////////////////////////////////

async function api(url, options = {}) {
    const response = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...options
    });

    const data = await response.json();

    if (!response.ok || data.success === false) {
        throw new Error(data.error || "Erreur serveur.");
    }

    return data;
}

///////////////////////////////////////////////////////////////////////////////////////////////////

function showError(error) {
    console.error(error);
    alert(error.message);
}

///////////////////////////////////////////////////////////////////////////////////////////////////

function askingSaveTournament(){
    document.getElementById('overlayAskingSave').style.display = 'flex';
}

function closeAskingSaveOverlay(){
    document.getElementById('overlayAskingSave').style.display = 'none';
}

function checkOldTournament() {
    document.getElementById("input_loadTournament").click();
}

async function loadTournamentFile(event) {
    const file = event.target.files[0];
    event.target.value = ""; // permet de resélectionner le même fichier plus tard

    if (!file) return;

    try {
        const text = await file.text();
        const parsed = JSON.parse(text);

        const result = await api("/api/load", {
            method: "POST",
            body: JSON.stringify({ state: parsed })
        });

        state = result.state;
        // check result.state

        document.getElementById("creation").style.display = "none";
        document.getElementById("form_addTeams").style.display = "none";
        document.getElementById("form_selectTournamentSpec").style.display = "none";
        document.getElementById("div_PLAY").style.display = "flex";

        displayTournament();
    } catch (error) {
        showError(new Error("Impossible de charger ce fichier : " + error.message));
    }
}

function saveTournament(save) {
    api("/api/save", {
        method: "POST",
        body: JSON.stringify({ save })
    });

    document.getElementById("creation").style.display = "none";
    document.getElementById('overlayAskingSave').style.display = 'none';
    document.getElementById("form_addTeams").style.display = "flex";
}

///////////////////////////////////////////////////////////////////////////////////////////////////

let teamID = 1;

document.getElementById("input_teamName").value = `équipe${teamID}`;

function AddTeamToList() {
    const input = document.getElementById("input_teamName");
    const name = input.value.trim();

    if (!name) return;

    if (state.teamsList.some(team => team.name === name)) {
        alert(`Le nom d'équipe '${name}' a déjà été choisi !`);
        input.value = `équipe${teamID}`;
        return;
    }

    state.teamsList.push({
        name,
        teamNumber: teamID,
        nbVictory: 0,
        nbSetWon: 0,
        goalAverage: 0
    });

    teamID++;
    input.value = `équipe${teamID}`;

    document.getElementById("btn_teamsValidation").disabled =
        state.teamsList.length < 3;

    DisplayTeamsList();
}

function RemoveTeamFromList(id) {
    state.teamsList = state.teamsList.filter(team => team.teamNumber !== id);

    document.getElementById("btn_teamsValidation").disabled =
        state.teamsList.length < 3;

    DisplayTeamsList();
}

function DisplayTeamsList() {
    const list = document.getElementById("list_teamValidation");
    list.innerHTML = "";

    state.teamsList.forEach(team => {
        const li = document.createElement("li");
        const div = document.createElement("div");
        div.classList.add("list_teamValidationContent");

        const span = document.createElement("span");
        span.textContent = team.name;

        const btn = document.createElement("button");
        btn.textContent = "❌";
        btn.classList.add("btn_deleteTeam");
        btn.addEventListener("click", () => RemoveTeamFromList(team.teamNumber));

        div.appendChild(span);
        div.appendChild(btn);
        li.appendChild(div);
        list.appendChild(li);
    });
}

///////////////////////////////////////////////////////////////////////////////////////////////////

async function MoveToTournamentSpecForm() {
    if (state.teamsList.length < 3) return;

    try {
        const result = await api("/api/teams", {
            method: "POST",
            body: JSON.stringify({ teams: state.teamsList })
        });

        state = result.state;
        // check result.state

        document.getElementById("form_addTeams").style.display = "none";
        document.getElementById("form_selectTournamentSpec").style.display = "flex";
    } catch (error) {
        showError(error);
    }
}

const select = document.getElementById("select_tournamentType");
const selectNbGame = document.getElementById("div_selectNbGame");
const description = document.getElementById("tournamentDescription");

description.innerHTML = tournamentDescriptions[select.value];

select.addEventListener("change", function () {
    selectNbGame.style.display =
        this.value === "NombreDeParties" || this.value === "TournoisSuisse"
            ? "flex"
            : "none";

    description.innerHTML = tournamentDescriptions[this.value];
});

async function GetTournamentInfos() {
    try {
        const result = await api("/api/tournament", {
            method: "POST",
            body: JSON.stringify({
                tournamentType: select.value,
                nbGame: document.getElementById("input_nbGame").valueAsNumber,
                nbGameSet: document.getElementById("input_nbGameSet").valueAsNumber,
                nbSetPoint: document.getElementById("input_nbSetPoint").valueAsNumber,
                pointSpread: document.getElementById("input_pointSpread").valueAsNumber
            })
        });

        state = result.state;
        // check result.state

        document.getElementById("form_selectTournamentSpec").style.display = "none";
        document.getElementById("div_PLAY").style.display = "flex";

        // CreateScorePanel & CreateRoundsPanel en fonction du type de tournois
        displayTournament();
    } catch (error) {
        showError(error);
    }
}

// Table de correspondance type de tournoi -> fonction d'affichage du panneau de jeu.
// Permet d'adapter l'affichage à chaque type de tournoi (nouveau ou repris depuis un fichier),
// sans changer GetTournamentInfos() ni loadTournamentFile() à chaque ajout d'un nouveau type.
const tournamentDisplayBuilders = {
    RoundRobin: displayRoundRobinTournament
};

function displayTournament() {
    const builder = tournamentDisplayBuilders[state.tournamentInfos.tournamentType];

    if (!builder) {
        throw new Error(`Le type de tournoi "${state.tournamentInfos.tournamentType}" n'est pas géré côté affichage.`);
    }

    builder();
}

function displayRoundRobinTournament() {
    CreateScorePanel();
    CreateRoundsPanel();
}

function CreateScorePanel() {
    const panel = document.getElementById("div_scorePanel");
    panel.innerHTML = "";

    state.teamsList.forEach(team => {
        const div = document.createElement("div");
        div.classList.add("div_scoreTeam");

        const name = document.createElement("div");
        name.classList.add("div_panelTeamName");
        name.textContent = team.name;

        const victory = document.createElement("div");
        victory.classList.add("div_panelTeamStat");
        victory.textContent = team.nbVictory;
        victory.id = `${team.name}NbVictory`;

        const sets = document.createElement("div");
        sets.classList.add("div_panelTeamStat");
        sets.textContent = team.nbSetWon;
        sets.id = `${team.name}NbSetWon`;

        const average = document.createElement("div");
        average.classList.add("div_panelTeamStat");
        average.textContent = team.goalAverage;
        average.id = `${team.name}GoalAverage`;

        div.append(name, victory, sets, average);
        panel.appendChild(div);
    });
}

function CreateRoundsPanel() {
    const container = document.getElementById("div_rounds");
    container.innerHTML = "";

    state.matches.forEach((round, index) => {
        const divRound = document.createElement("div");
        divRound.classList.add("div_round");
        divRound.id = `div_round${index + 1}`;

        if (round.id !== state.currentRound) divRound.classList.add("hidden");

        const h3 = document.createElement("h3");
        h3.textContent = `Round ${round.id}`;
        divRound.appendChild(h3);

        const matches = document.createElement("div");
        matches.classList.add("div_roundMatches");

        round.matches.forEach(match => {
            const btn = document.createElement("button");
            btn.classList.add("btn_roundMatche");
            btn.textContent = `${match.team1.name} VS ${match.team2.name}`;
            btn.addEventListener("click", () => ShowMatchOverlay(round.id, match.id));
            matches.appendChild(btn);
        });

        divRound.appendChild(matches);
        container.appendChild(divRound);
    });
}

///////////////////////////////////////////////////////////////////////////////////////////////////

function PreviousRound() {
    if (state.currentRound > 1) {
        document.getElementById(`div_round${state.currentRound}`).classList.add("hidden");
        state.currentRound--;
        document.getElementById(`div_round${state.currentRound}`).classList.remove("hidden");
    }
}

function NextRound() {
    if (state.currentRound < state.matches.length) {
        document.getElementById(`div_round${state.currentRound}`).classList.add("hidden");
        state.currentRound++;
        document.getElementById(`div_round${state.currentRound}`).classList.remove("hidden");
    }
}

function ShowMatchOverlay(roundID, matchID) {
    currentMatch = matchID;

    const round = state.matches.find(r => r.id === roundID);
    const match = round.matches.find(m => m.id === matchID);

    document.getElementById("overlayInputResult").style.display = "flex";
    document.getElementById("overlayMatchTitle").textContent =
        `${match.team1.name} VS ${match.team2.name}`;

    const score1 = match.set.filter(res => res.score1 > res.score2).length;
    const score2 = match.set.filter(res => res.score2 > res.score1).length;

    document.getElementById("p_nbSetTeam1").textContent = score1;
    document.getElementById("p_nbSetTeam2").textContent = score2;
    document.getElementById("p_inputSetResult").textContent =
        `Set ${match.set.length + 1} :`;

    displaySetResult(match.set);
}

function CloseMatchOverlay() {
    document.getElementById("overlayInputResult").style.display = "none";
    document.getElementById("div_overlayContentResult").innerHTML = "";
    document.getElementById("inputTeam1").value = 0;
    document.getElementById("inputTeam2").value = 0;
}

function CloseRankOverlay() {
    document.getElementById("overlayRank").style.display = "none";
    document.getElementById("div_rankList").innerHTML = "";
}

///////////////////////////////////////////////////////////////////////////////////////////////////

async function ValidInputSetResult() {
    const inputTeam1 = document.getElementById("inputTeam1").valueAsNumber;
    const inputTeam2 = document.getElementById("inputTeam2").valueAsNumber;

    try {
        const result = await api(
            `/api/matches/${state.currentRound}/${currentMatch}/score`,
            {
                method: "POST",
                body: JSON.stringify({
                    score1: inputTeam1,
                    score2: inputTeam2
                })
            }
        );

        state = result.state;
        // check result.state

        const round = state.matches.find(r => r.id === state.currentRound);
        const match = round.matches.find(m => m.id === currentMatch);

        const score1 = match.set.filter(res => res.score1 > res.score2).length;
        const score2 = match.set.filter(res => res.score2 > res.score1).length;

        document.getElementById("p_nbSetTeam1").textContent = score1;
        document.getElementById("p_nbSetTeam2").textContent = score2;
        document.getElementById("p_inputSetResult").textContent =
            `Set ${match.set.length + 1} :`;

        displaySetResult(match.set);
        CreateScorePanel();

        document.getElementById("inputTeam1").value = 0;
        document.getElementById("inputTeam2").value = 0;
    } catch (error) {
        showError(error);
    }
}

function displaySetResult(setResult) {
    const divSetResult = document.getElementById("div_overlayContentResult");
    divSetResult.innerHTML = "";

    setResult.forEach((result, index) => {
        const div = document.createElement("div");
        div.style.display = "flex";
        div.style.gap = "10px";

        const divResult = document.createElement("div");
        divResult.classList.add("div_resultText");

        const p1 = document.createElement("p");
        p1.textContent = `Set ${index + 1} :`;

        const p2 = document.createElement("p");
        p2.textContent = result.score1;

        const p3 = document.createElement("p");
        p3.textContent = "-";

        const p4 = document.createElement("p");
        p4.textContent = result.score2;

        div.append(p1);
        divResult.append(p2, p3, p4);
        div.appendChild(divResult);
        divSetResult.appendChild(div);
    });
}

async function CalculateRanking() {
    try {
        const result = await api("/api/ranking");
        const ranking = result.ranking;

        document.getElementById("overlayRank").style.display = "flex";

        const div = document.getElementById("div_rankList");
        div.innerHTML = "";

        let rank = 0;
        let previous = null;

        ranking.forEach(team => {
            if (
                !previous ||
                team.nbVictory !== previous.nbVictory ||
                team.nbSetWon !== previous.nbSetWon ||
                team.goalAverage !== previous.goalAverage
            ) {
                rank++;
            }

            const list = document.createElement("div");
            list.classList.add("overlayRankContent");

            const position = document.createElement("p");
            position.textContent = rank;

            const name = document.createElement("p");
            name.textContent = team.name;

            const victories = document.createElement("p");
            victories.textContent = "";

            list.append(position, name, victories);
            div.appendChild(list);

            previous = team;
        });
    } catch (error) {
        showError(error);
    }
}

///////////////////////////////////////////////////////////////////////////////////////////////////

window.newTournament = newTournament;
window.checkOldTournament = checkOldTournament;
window.loadTournamentFile = loadTournamentFile;
window.AddTeamToList = AddTeamToList;
window.RemoveTeamFromList = RemoveTeamFromList;
window.DisplayTeamsList = DisplayTeamsList;
window.MoveToTournamentSpecForm = MoveToTournamentSpecForm;
window.GetTournamentInfos = GetTournamentInfos;
window.PreviousRound = PreviousRound;
window.NextRound = NextRound;
window.ShowMatchOverlay = ShowMatchOverlay;
window.CloseMatchOverlay = CloseMatchOverlay;
window.CloseRankOverlay = CloseRankOverlay;
window.ValidInputSetResult = ValidInputSetResult;
window.CalculateRanking = CalculateRanking;
