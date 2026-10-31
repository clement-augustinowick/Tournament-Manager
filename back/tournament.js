//
// Clément Augustinowick
//

import fs from "fs/promises";
import path from "path";
import os from "os";

const defaultTeam = {
    name: "",
    teamNumber: 0,
    nbVictory: 0,
    nbSetWon: 0,
    goalAverage: 0
};

const defaultMatch = {
    id: 0,
    team1: null,
    team2: null,
    set: []
};

export class Tournament {
    constructor() {
        this.tournamentGenerators = {
            RoundRobin: () => this.generateRoundRobin()
        };

        this.reset();
    }

    reset() {
        this.saving = false;
        this.teamsList = [];
        this.tournamentInfos = {
            tournamentType: "",
            nbGame: 0,
            nbGameSet: 0,
            nbSetPoint: 0,
            currentRound: 1,
            pointSpread: 0
        };
        this.matches = [];
        this.currentRound = 1;
    }

    setTeams(teams) {
        if (!Array.isArray(teams) || teams.length < 3) {
            throw new Error("Il faut au moins 3 équipes.");
        }

        const names = teams.map(t => String(t.name ?? "").trim());
        if (names.some(name => !name)) {
            throw new Error("Toutes les équipes doivent avoir un nom.");
        }

        if (new Set(names).size !== names.length) {
            throw new Error("Les noms d'équipes doivent être uniques.");
        }

        const teamsList = teams.map((team, index) => ({
            ...defaultTeam,
            name: names[index],
            teamNumber: Number(team.teamNumber) || index + 1
        }));

        const numbers = teamsList.map(team => team.teamNumber);
        if (new Set(numbers).size !== numbers.length) {
            throw new Error("Les numéros d'équipes doivent être uniques.");
        }

        this.teamsList = teamsList;

        return this.getState();
    }

    configure(info) {
        if (this.teamsList.length < 3) {
            throw new Error("Ajoutez au moins 3 équipes avant de configurer le tournoi.");
        }

        const tournamentType = String(info.tournamentType || "");
        const nbGame = Number(info.nbGame);
        const nbGameSet = Number(info.nbGameSet);
        const nbSetPoint = Number(info.nbSetPoint);
        const pointSpread = Number(info.pointSpread);

        if (!tournamentType) throw new Error("Type de tournoi invalide.");
        
        const isPositiveInteger = value => Number.isInteger(value) && value >= 1;
        if (!isPositiveInteger(nbGameSet) || !isPositiveInteger(nbSetPoint) || !isPositiveInteger(pointSpread)) {
            throw new Error("Les paramètres du tournoi doivent être des nombres entiers supérieurs à 0.");
        }

        if (pointSpread > nbSetPoint) {
            throw new Error("Le nombre de points d'écart ne peut pas dépasser le nombre de points d'un set.");
        }

        const generator = this.tournamentGenerators[tournamentType];
        if (!generator) {
            throw new Error(`Le type "${tournamentType}" n'a pas été implémenté.`);
        }

        // À partir d'ici tout est valide : on peut modifier l'état.
        this.tournamentInfos = {
            tournamentType,
            nbGame: nbGame || 1,
            nbGameSet,
            nbSetPoint,
            currentRound: 1,
            pointSpread
        };

        this.teamsList = this.teamsList.map(team => ({
            ...team,
            nbVictory: 0,
            nbSetWon: 0,
            goalAverage: 0
        }));

        this.currentRound = 1;
        this.matches = [];

        generator();

        return this.getState();
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////

    loadState(data) {
        if (!data || typeof data !== "object") {
            throw new Error("Fichier de tournoi invalide.");
        }

        const { teamsList, tournamentInfos, matches, currentRound } = data;

        if (!Array.isArray(teamsList) || teamsList.length < 3) {
            throw new Error("Fichier de tournoi invalide : liste d'équipes incorrecte.");
        }

        if (!tournamentInfos || !this.tournamentGenerators[tournamentInfos.tournamentType]) {
            throw new Error("Fichier de tournoi invalide : type de tournoi inconnu.");
        }

        if (!Array.isArray(matches)) {
            throw new Error("Fichier de tournoi invalide : liste de matchs incorrecte.");
        }

        this.validateLoadedContent(teamsList, tournamentInfos, matches);

        this.teamsList = structuredClone(teamsList);
        this.tournamentInfos = structuredClone(tournamentInfos);
        this.matches = structuredClone(matches);
        
        const savedRound = Number(currentRound);
        this.currentRound = this.matches.some(round => round.id === savedRound) ? savedRound : 1;

        this.saving = true;

        return this.getState();
    }

    invalidFile(reason) {
        return new Error(`Fichier de tournoi invalide : ${reason}`);
    }

    // Vérifie en profondeur le contenu d'un fichier de tournoi AVANT de l'accepter.
    validateLoadedContent(teamsList, tournamentInfos, matches) {
        const isPositiveInteger = value => Number.isInteger(value) && value >= 1;
        const isPlainObject = value => value !== null && typeof value === "object" && !Array.isArray(value);

        const teamNumbers = new Set();
        const teamNames = new Set();

        for (const team of teamsList) {
            if (!isPlainObject(team) || typeof team.name !== "string" || !team.name.trim()) {
                throw this.invalidFile("une équipe n'a pas de nom.");
            }
            if (!Number.isInteger(team.teamNumber)) {
                throw this.invalidFile(`l'équipe "${team.name}" n'a pas de numéro valide.`);
            }
            for (const stat of ["nbVictory", "nbSetWon", "goalAverage"]) {
                if (!Number.isFinite(team[stat])) {
                    throw this.invalidFile(`statistique "${stat}" manquante ou invalide pour l'équipe "${team.name}".`);
                }
            }
            if (teamNumbers.has(team.teamNumber) || teamNames.has(team.name)) {
                throw this.invalidFile(`l'équipe "${team.name}" apparaît en double.`);
            }
            teamNumbers.add(team.teamNumber);
            teamNames.add(team.name);
        }

        for (const key of ["nbGameSet", "nbSetPoint", "pointSpread"]) {
            if (!isPositiveInteger(tournamentInfos[key])) {
                throw this.invalidFile(`le paramètre "${key}" est manquant ou invalide.`);
            }
        }

        const roundIds = new Set();
        const matchIds = new Set();

        for (const round of matches) {
            if (!isPlainObject(round) || !Number.isInteger(round.id) || !Array.isArray(round.matches)) {
                throw this.invalidFile("un round est mal formé.");
            }
            if (roundIds.has(round.id)) {
                throw this.invalidFile(`le round ${round.id} apparaît en double.`);
            }
            roundIds.add(round.id);

            for (const match of round.matches) {
                if (!isPlainObject(match) || !Number.isInteger(match.id) || !Array.isArray(match.set)) {
                    throw this.invalidFile(`un match du round ${round.id} est mal formé.`);
                }
                if (matchIds.has(match.id)) {
                    throw this.invalidFile(`le match ${match.id} apparaît en double.`);
                }
                matchIds.add(match.id);

                for (const side of ["team1", "team2"]) {
                    const team = match[side];
                    if (!isPlainObject(team) || typeof team.name !== "string" || !teamNumbers.has(team.teamNumber)) {
                        throw this.invalidFile(`le match ${match.id} a une équipe (${side}) inconnue.`);
                    }
                }
                if (match.team1.teamNumber === match.team2.teamNumber) {
                    throw this.invalidFile(`le match ${match.id} oppose une équipe à elle-même.`);
                }

                for (const result of match.set) {
                    if (!isPlainObject(result) || !Number.isFinite(result.score1) || !Number.isFinite(result.score2)) {
                        throw this.invalidFile(`un set du match ${match.id} a un score invalide.`);
                    }
                }
            }
        }
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////

    addSet(roundId, matchId, score1, score2) {
        const round = this.matches.find(r => r.id === Number(roundId));
        if (!round) throw new Error("Round introuvable.");

        const match = round.matches.find(m => m.id === Number(matchId));
        if (!match) throw new Error("Match introuvable.");

        score1 = Number(score1);
        score2 = Number(score2);

        if (!Number.isFinite(score1) || !Number.isFinite(score2) || score1 < 0 || score2 < 0) {
            throw new Error("Score invalide.");
        }

        if (score1 === score2) {
            throw new Error("Un set ne peut pas être nul.");
        }

        const alreadyEnded = this.checkMatchEnded(match);
        if (alreadyEnded) {
            throw new Error(`L'équipe ${alreadyEnded} a déjà remporté le match.`);
        }

        const target = this.tournamentInfos.nbSetPoint;
        const spread = this.tournamentInfos.pointSpread;

        if (Math.max(score1, score2) < target) {
            throw new Error("Aucune équipe n'a atteint le nombre de points requis.");
        }

        if (Math.abs(score1 - score2) < spread) {
            throw new Error(`Il faut au moins ${spread} point(s) d'écart.`);
        }

        const winnerScore = Math.max(score1, score2);
        const loserScore = Math.min(score1, score2);
        const expectedWinnerScore = Math.max(target, loserScore + spread);

        if (winnerScore !== expectedWinnerScore) {
            throw new Error(
                `Score incohérent : le set se termine dès que ${expectedWinnerScore} points sont atteints `
                + `(${expectedWinnerScore}-${loserScore}).`
            );
        }

        match.set.push({ score1, score2 });

        const winner = score1 > score2 ? match.team1 : match.team2;
        const loser = score1 > score2 ? match.team2 : match.team1;
        const goalAverage = Math.abs(score1 - score2);

        const winnerState = this.teamsList.find(t => t.teamNumber === winner.teamNumber);
        const loserState = this.teamsList.find(t => t.teamNumber === loser.teamNumber);

        winnerState.nbSetWon += 1;
        winnerState.goalAverage += goalAverage;
        loserState.goalAverage -= goalAverage;

        const matchWinner = this.checkMatchEnded(match);
        if (matchWinner) {
            winnerState.nbVictory += 1;
        }

        this.currentRound = Number(roundId);

        return this.getState();
    }

    checkMatchEnded(match) {
        let team1Sets = 0;
        let team2Sets = 0;

        for (const result of match.set) {
            if (result.score1 > result.score2) team1Sets++;
            if (result.score2 > result.score1) team2Sets++;
        }

        if (team1Sets >= this.tournamentInfos.nbGameSet) return match.team1.name;
        if (team2Sets >= this.tournamentInfos.nbGameSet) return match.team2.name;

        return "";
    }

    getRanking() {
        return [...this.teamsList].sort((a, b) => {
            if (a.nbVictory !== b.nbVictory) return b.nbVictory - a.nbVictory;
            if (a.nbSetWon !== b.nbSetWon) return b.nbSetWon - a.nbSetWon;
            return b.goalAverage - a.goalAverage;
        });
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////

    getState() {
        return {
            teamsList: structuredClone(this.teamsList),
            tournamentInfos: structuredClone(this.tournamentInfos),
            matches: structuredClone(this.matches),
            currentRound: this.currentRound
        };
    }

    async save(language, directory = path.join(os.homedir(), "Downloads")) {
        await fs.mkdir(directory, { recursive: true });

        const now = new Date();

        const day = String(now.getDate()).padStart(2, "0");
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const year = now.getFullYear();

        const prefix = language == "fr" ? "tournois" : "tournament";
        const date = `${day}-${month}-${year}`;
        const fileName = path.join(directory, `${prefix}-${date}.json`);

        await fs.writeFile(
            fileName,
            JSON.stringify(this.getState(), null, 2),
            "utf8"
        );

        return fileName;
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////

    generateRoundRobin() {
        const teams = this.teamsList.map(team => structuredClone(team));

        if (teams.length % 2 !== 0) {
            teams.push(null);
        }

        const n = teams.length;
        let rotation = teams.slice();
        let matchID = 1;

        for (let round = 0; round < n - 1; round++) {
            const actualRound = {
                id: round + 1,
                matches: []
            };

            for (let i = 0; i < n / 2; i++) {
                const team1 = rotation[i];
                const team2 = rotation[n - 1 - i];

                if (team1 !== null && team2 !== null) {
                    const match = structuredClone(defaultMatch);
                    match.id = matchID++;
                    match.team1 = team1;
                    match.team2 = team2;
                    actualRound.matches.push(match);
                }
            }

            this.matches.push(actualRound);

            const fixed = rotation[0];
            const rest = rotation.slice(1);
            rest.unshift(rest.pop());
            rotation = [fixed, ...rest];
        }
    }
}
