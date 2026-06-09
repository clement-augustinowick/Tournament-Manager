//
// Clément Augustinowick
// 

let teamsList = [];
const defaultTeam = {
    name: `Nom par défaut`,
    teamNumber: 0,
    nbVictory: 0,
    nbSetWon: 0,
    goalAverage: 0
};

let teamID = 1;

const tournamentInfos = {
    tournamentType: "",
    nbGame: 0,
    nbGameSet: 0,
    nbSetPoint: 0,
    // nbSportFields: 0,
    currentRound: 1,
    pointSpread: 0
};

const tournamentDescriptions = {
    "RoundRobin": "* Chaque équipe rencontre toutes les autres équipes.",
    "NombreDeParties": "* Chaque équipe joue un nombre définis de partie. ~~~A~~~ chaque tour les rencontres sont tirées au ~~~sor~~~.",
    "SimpleKO": "* Les équipe sont placées dans un tableau de rencontre à élimination directe.",
    "DoubleKO": "* Les équipe sont placées dans un tableau de rencontre. Les équipes qui perdent au premier tour sont replacées dans un second tableau (à élimination directe). Chaque équipe joue au moins 2 matchs.",
    "TournoisSuisse": "* Chaque équipe joue un nombre définis de partie. Les rencontres sont tirées au ~~~sor~~~ en fonction des performances (les équipes affrontent des équipes qui ont gagné le même nombre de partie qu'elles).",
    "TournoisPoule": "* Les équipes sont réparties dans différents groupes et affrontent les équipes du même groupe.",
    "TournoisPouleTableau": "* Les équipes sont réparties dans différents groupes et affrontent les équipes du même groupe. Un nombre définis d'équipe est ensuite placé dans un tableau à élimination directe en fonction de leur performance durant les matches de poule."
};

let matches = [];

const defaultMatch = {
    id: 0,
    team1: "",
    team2: "",
    set: []
};

let currentRound = 1;
let currentMatch = 1;

///////////////////////////////////////////////////////////////////////////////////////////////////


function newTournament(){
    document.getElementById("creation").style.display = "none";
    document.getElementById("form_addTeams").style.display = "flex";
}

///////////////////////////////////////////////////////////////////////////////////////////////////

document.getElementById("input_teamName").value = `équipe${teamID}`;

function AddTeamToList(){
    const input_teamName = document.getElementById("input_teamName");
    
    if (input_teamName.value === ""){ return; }

    if (teamsList.find(team => team.name === input_teamName.value)){
        alert(`Le nom d'équipe '${input_teamName.value}' à déjà été choisi !`);
        document.getElementById("input_teamName").value = `équipe${teamID}`;
        return;
    }
    
    let team = {...defaultTeam};
    team.name = input_teamName.value;
    team.teamNumber = teamID;
    teamsList.push(team);

    if (teamsList.length > 2){ document.getElementById("btn_teamsValidation").disabled = false; }

    input_teamName.value = `équipe${teamID + 1}`;
    teamID += 1;
    DisplayTeamsList();
}

function RemoveTeamFromList(id){
    teamsList = teamsList.filter(team => team.teamNumber !== id);

    if (teamsList.length < 3){ document.getElementById("btn_teamsValidation").disabled = true; }

    DisplayTeamsList();
}

function DisplayTeamsList(){
    const list_teamValidation = document.getElementById("list_teamValidation");

    list_teamValidation.innerHTML = "";
    teamsList.forEach(element => {
        const li = document.createElement("li");

        const div = document.createElement("div");
        div.classList.add("list_teamValidationContent");

        const span = document.createElement("span");
        span.textContent = element.name;

        const btn = document.createElement("button");
        btn.textContent = "❌";
        btn.addEventListener("click", () => RemoveTeamFromList(element.teamNumber));
        btn.classList.add("btn_deleteTeam");

        div.appendChild(span);
        div.appendChild(btn);
        li.appendChild(div);
        list_teamValidation.appendChild(li);
    });
}

function MoveToTournamentSpecForm(){
    if (teamsList.length < 3){ return; }

    document.getElementById("form_addTeams").style.display = "none";
    document.getElementById("form_selectTournamentSpec").style.display = "flex";
}

///////////////////////////////////////////////////////////////////////////////////////////////////

const select = document.getElementById("select_tournamentType");
const selectNbGame = document.getElementById("div_selectNbGame");
const description = document.getElementById('tournamentDescription');
description.innerHTML = tournamentDescriptions[select.value];

select.addEventListener("change", function(){
    if (this.value === "NombreDeParties" || this.value === "TournoisSuisse"){
        selectNbGame.style.display = "flex";
    } else {
        selectNbGame.style.display = "none";
    }
    description.innerHTML = tournamentDescriptions[this.value];
});

function GetTournamentInfos(){
    tournamentInfos.tournamentType = select.value;
    tournamentInfos.nbGame = document.getElementById("input_nbGame").valueAsNumber;
    tournamentInfos.nbGameSet = document.getElementById("input_nbGameSet").valueAsNumber;
    tournamentInfos.nbSetPoint = document.getElementById("input_nbSetPoint").valueAsNumber;
    tournamentInfos.pointSpread = document.getElementById("input_pointSpread").valueAsNumber;
    // tournamentInfos.nbSportFields = document.getElementById("input_nbSportField").valueAsNumber;

    document.getElementById("form_selectTournamentSpec").style.display = "none";
    document.getElementById("div_PLAY").style.display = "flex";
    CreateScorePanel();
    CalculMatches();
    CreateRoundsPanel();
}

///////////////////////////////////////////////////////////////////////////////////////////////////

function CreateScorePanel(){
    teamsList.forEach(team => {
        const div_scoreTeam = document.createElement('div');
        div_scoreTeam.classList.add('div_scoreTeam');

        const div_panelTeamName = document.createElement('div');
        div_panelTeamName.classList.add('div_panelTeamName');
        div_panelTeamName.innerHTML = team.name;

        const div_panelTeamVictory = document.createElement('div');
        div_panelTeamVictory.classList.add('div_panelTeamStat');
        div_panelTeamVictory.innerHTML = team.nbVictory;
        div_panelTeamVictory.id = `${team.name}NbVictory`;

        const div_panelTeamSetWon = document.createElement('div');
        div_panelTeamSetWon.classList.add('div_panelTeamStat');
        div_panelTeamSetWon.innerHTML = team.nbSetWon;
        div_panelTeamSetWon.id = `${team.name}NbSetWon`;

        const div_panelTeamGoalAverage = document.createElement('div');
        div_panelTeamGoalAverage.classList.add('div_panelTeamStat');
        div_panelTeamGoalAverage.innerHTML = team.goalAverage;
        div_panelTeamGoalAverage.id = `${team.name}GoalAverage`;


        div_scoreTeam.appendChild(div_panelTeamName);
        div_scoreTeam.appendChild(div_panelTeamVictory);
        div_scoreTeam.appendChild(div_panelTeamSetWon);
        div_scoreTeam.appendChild(div_panelTeamGoalAverage);

        document.getElementById('div_scorePanel').appendChild(div_scoreTeam);
    });
}

function CreateRoundsPanel(){
    let roundID = 1;

    matches.forEach(round => {
        const div_round = document.createElement('div');
        div_round.classList.add('div_round');
        div_round.id = `div_round${roundID}`;

        if (roundID != 1){
            div_round.classList.add("hidden");
        }

        const h3 = document.createElement('h3');
        h3.innerHTML = `Round ${round.id}`;
        div_round.appendChild(h3);

        const div_roundMatches = document.createElement('div');
        div_roundMatches.classList.add('div_roundMatches');

        round.matches.forEach(match => {
            const btn = document.createElement('button');
            btn.classList.add('btn_roundMatche');
            btn.innerHTML = `${match.team1.name} VS ${match.team2.name}`;
            btn.addEventListener('click', () => ShowMatchOverlay(match.id))
            div_roundMatches.appendChild(btn);
        });

        div_round.appendChild(div_roundMatches);

        document.getElementById('div_rounds').appendChild(div_round);
        roundID += 1;
    });
}

function CalculMatches(){
    switch (tournamentInfos.tournamentType) {
        case "RoundRobin":
            generateRoundRobin();
            break;
    
        default:
            break;
    }
}

function generateRoundRobin() {

    if (teamsList.length % 2 !== 0) {
        teamsList.push(null);
    }

    const n = teamsList.length;
    let rotation = teamsList.slice();

    let matchID = 1;

    for (let round = 0; round < n - 1; round++) {
        let actualRound = {
            id: round + 1,
            matches: []
        };

        for (let i = 0; i < n / 2; i++) {
            const match = structuredClone(defaultMatch);
            match.id = matchID;
            const team1 = rotation[i];
            const team2 = rotation[n - 1 - i];

            if (team1 !== null && team2 !== null) {
                match.team1 = team1;
                match.team2 = team2;
                actualRound.matches.push(match);
                matchID += 1;
            }
        }

        matches.push(actualRound);

        const fixed = rotation[0];
        const rest = rotation.slice(1);

        rest.unshift(rest.pop());
        rotation = [fixed, ...rest];
    }
}

function PreviousRound(){
    if (currentRound > 1){
        document.getElementById(`div_round${currentRound}`).classList.add("hidden");
        currentRound -= 1;
        document.getElementById(`div_round${currentRound}`).classList.remove("hidden");
    }
}

function NextRound(){
    if (currentRound < matches.length){
        document.getElementById(`div_round${currentRound}`).classList.add("hidden");
        currentRound += 1;
        document.getElementById(`div_round${currentRound}`).classList.remove("hidden");
    }
}

function ShowMatchOverlay(matchID){
    currentMatch = matchID;

    const round = matches.find(r => r.id === currentRound);
    const match = round.matches.find(m => m.id === matchID);

    const overlay = document.getElementById('overlayInputResult').style.display = "flex";

    const title = document.getElementById('overlayMatchTitle').innerHTML = `${match.team1.name} VS ${match.team2.name}`;

    let score1 = 0;
    let score2 = 0;

    match.set.forEach(res => {
        if (res.score1 > res.score2){
            score1++;
        } else {
            score2++;
        }
    });

    document.getElementById('p_nbSetTeam1').innerHTML = `${score1}`;
    document.getElementById('p_nbSetTeam2').innerHTML = `${score2}`;

    const set = document.getElementById('p_inputSetResult');
    set.innerHTML = `Set ${match.set.length + 1} :`;

    displaySetResult(match.set);
}

function CloseMatchOverlay(){
    document.getElementById('overlayInputResult').style.display = "none";
    document.getElementById('div_overlayContentResult').innerHTML = "";
    document.getElementById('inputTeam1').value = 0;
    document.getElementById('inputTeam2').value = 0;
}

function CloseRankOverlay(){
    document.getElementById('overlayRank').style.display = "none";
    document.getElementById('div_rankList').innerHTML = "";
}

function ValidInputSetResult(){
    let inputTeam1 = document.getElementById('inputTeam1').valueAsNumber;
    let inputTeam2 = document.getElementById('inputTeam2').valueAsNumber;

    if (inputTeam1 < tournamentInfos.nbSetPoint && inputTeam2 < tournamentInfos.nbSetPoint){
        alert("Aucune des équipes n'a le nombre de point requis.");
        return;
    }

    const round = matches.find(r => r.id === currentRound);
    const match = round.matches.find(m => m.id === currentMatch);

    const winner = checkMacthEnded(match);
    if (winner !== ""){
        alert(`L'équipe ${winner} a déjà remporté le match. Vous ne pouvez plus ajouter de score.`);
        return;
    }

    let goalAverage = 0;

    if (inputTeam1 > inputTeam2){

        const teamScoreText = document.getElementById('p_nbSetTeam1');
        let teamScore = Number(teamScoreText.textContent);

        teamScore += 1;
        teamScoreText.innerHTML = `${teamScore}`;

        const win = teamScore === tournamentInfos.nbGameSet ? true : false;

        if (inputTeam2 >= tournamentInfos.nbSetPoint - tournamentInfos.pointSpread){
            inputTeam1 = inputTeam2 + tournamentInfos.pointSpread;
        } else {
            inputTeam1 = tournamentInfos.nbSetPoint;
        }

        goalAverage = inputTeam1 - inputTeam2;

        match.set.push({
            score1: inputTeam1,
            score2: inputTeam2
        });

        AddScoreToScorePanel(match.team1, match.team2, goalAverage, win);
        
    } else if (inputTeam1 < inputTeam2){

        const teamScoreText = document.getElementById('p_nbSetTeam2');
        let teamScore = Number(teamScoreText.textContent);

        teamScore += 1;
        teamScoreText.innerHTML = `${teamScore}`;

        const win = teamScore === tournamentInfos.nbGameSet ? true : false;

        if (inputTeam1 >= tournamentInfos.nbSetPoint - tournamentInfos.pointSpread){
            inputTeam2 = inputTeam1 + tournamentInfos.pointSpread;
        } else {
            inputTeam2 = tournamentInfos.nbSetPoint;
        }

        goalAverage = inputTeam2 - inputTeam1;

        match.set.push({
            score1: inputTeam1,
            score2: inputTeam2
        });

        AddScoreToScorePanel(match.team2, match.team1, goalAverage, win);

    }

    const set = document.getElementById('p_inputSetResult');
    set.innerHTML = `Set ${match.set.length + 1} :`;

    displaySetResult(match.set);

    document.getElementById('inputTeam1').value = 0;
    document.getElementById('inputTeam2').value = 0;
}

function checkMacthEnded(match){
    let nbSetTeam1 = 0;
    let nbSetTeam2 = 0;

    match.set.forEach(res => {
        if (res.score1 > res.score2){
            nbSetTeam1 += 1;
        } else if (res.score1 < res.score2){
            nbSetTeam2 += 1;
        }
    });

    if (nbSetTeam1 === tournamentInfos.nbGameSet){
        return match.team1.name;
    } else if (nbSetTeam2 === tournamentInfos.nbGameSet){
        return match.team2.name;
    }

    return "";
}

function AddScoreToScorePanel(team1, team2, goalAverage, win){
    const winner = teamsList.find(team => team.name === team1.name);
    const loser = teamsList.find(team => team.name === team2.name);

    winner.nbSetWon += 1;
    loser.goalAverage += goalAverage;

    document.getElementById(`${team1.name}NbSetWon`).innerHTML = winner.nbSetWon;
    document.getElementById(`${team2.name}GoalAverage`).innerHTML = loser.goalAverage;

    if (win){
        winner.nbVictory += 1;

        document.getElementById(`${team1.name}NbVictory`).innerHTML = winner.nbVictory;
    }
}

function displaySetResult(setResult){
    const divSetResult = document.getElementById('div_overlayContentResult');
    divSetResult.innerHTML = "";

    for (let i = 0; i < setResult.length; i++){
        const div = document.createElement('div');
        div.style.display = "flex";
        div.style.gap = "10px";

        const divResult = document.createElement('div');
        divResult.classList.add('div_resultText');

        const p1 = document.createElement('p');
        p1.innerHTML = `Set ${i + 1} :`;

        const p2 = document.createElement('p');
        p2.innerHTML = `${setResult[i].score1}`;

        const p3 = document.createElement('p');
        p3.innerHTML = "-";

        const p4 = document.createElement('p');
        p4.innerHTML = `${setResult[i].score2}`;
        
        div.appendChild(p1);
        divResult.appendChild(p2);
        divResult.appendChild(p3);
        divResult.appendChild(p4);
        div.appendChild(divResult);
        divSetResult.appendChild(div);
    }
}


function CalculateRanking(){
    document.getElementById('overlayRank').style.display = "flex";

    const ranking = [...teamsList].sort((a,b) => {
        console.log(a, b);
        if (!a || !b){ return; }

        if (a.nbVictory !== b.nbVictory){
            return b.nbVictory - a.nbVictory;
        }

        if (a.nbSetWon !== b.nbSetWon){
            return b.nbSetWon - a.nbSetWon;
        }

        return a.goalAverage - b.goalAverage
    });

    let i = 0;
    let prevTeam = null;
    const div = document.getElementById("div_rankList");

    ranking.forEach(team => {
        if (!team){ return; }

        const list = document.createElement("div");
        list.classList.add("overlayRankContent");
    
        if ( prevTeam &&
             team.nbVictory === prevTeam.nbVictory &&
             team.nbSetWon === prevTeam.nbSetWon &&
             team.goalAverage === prevTeam.goalAverage
        ) { i -= 1; }

        i += 1;

        const rank = document.createElement("p");
        rank.innerHTML = `${i}`;

        const teamName = document.createElement("p");
        teamName.innerHTML = `${team.name}`;

        const nbVictory = document.createElement("p");
        // nbVictory.innerHTML = `${team.nbVictory}`;
        nbVictory.innerHTML = ``;

        list.appendChild(rank);
        list.appendChild(teamName);
        list.appendChild(nbVictory);

        div.appendChild(list);

        prevTeam = team;
    });
}
