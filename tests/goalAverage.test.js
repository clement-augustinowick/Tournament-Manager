import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Tournament } from "../back/tournament.js";
import { defaultConfig, sampleTeams } from "./helpers/fixture.js";

function makeTournament(n = 4, cfg = {}) {
    const t = new Tournament();
    t.setTeams(sampleTeams(n));
    t.configure({ ...defaultConfig, ...cfg });
    return t;
}
const allMatches = t => t.matches.flatMap(r => r.matches);
const team = (t, name) => t.teamsList.find(x => x.name === name);

// Joue un set entre deux équipes nommées, quel que soit l'ordre team1/team2 du match.
function play(t, winner, loser, wScore, lScore) {
    const round = t.matches.find(r => r.matches.some(m =>
        [m.team1.name, m.team2.name].sort().join() === [winner, loser].sort().join()));
    const m = round.matches.find(m => [m.team1.name, m.team2.name].sort().join() === [winner, loser].sort().join());
    const w1 = m.team1.name === winner;
    t.addSet(round.id, m.id, w1 ? wScore : lScore, w1 ? lScore : wScore);
}

describe("goal average", () => {
    it("le gagnant du set gagne l'écart, le perdant le perd", () => {
        const t = makeTournament(4, { nbGameSet: 2 });
        const m = allMatches(t)[0];
        t.addSet(1, m.id, 5, 1);
        assert.equal(team(t, m.team1.name).goalAverage, 4);
        assert.equal(team(t, m.team2.name).goalAverage, -4);
    });

    it("le gagnant a un meilleur goal average que le perdant (équipe 2 gagnante aussi)", () => {
        const t = makeTournament(4, { nbGameSet: 2 });
        const m = allMatches(t)[0];
        t.addSet(1, m.id, 0, 5);
        assert.ok(team(t, m.team2.name).goalAverage > team(t, m.team1.name).goalAverage);
    });

    it("s'accumule sur plusieurs sets, y compris les sets perdus dans un match gagné", () => {
        const t = makeTournament(4, { nbGameSet: 2 });
        const m = allMatches(t)[0];
        t.addSet(1, m.id, 5, 0);   // team1 gagne 5-0 : +5
        t.addSet(1, m.id, 6, 4);   // team1 gagne 6-4 : +2 (victoire du match en 2 sets)
        assert.equal(team(t, m.team1.name).goalAverage, 7);
        assert.equal(team(t, m.team2.name).goalAverage, -7);
    });

    it("somme nulle : ce que l'un gagne, l'autre le perd", () => {
        const t = makeTournament(4, { nbGameSet: 1 });
        for (const round of t.matches) for (const m of round.matches) t.addSet(round.id, m.id, 7, 5);
        assert.equal(t.teamsList.reduce((s, x) => s + x.goalAverage, 0), 0);
    });

    it("départage deux équipes à égalité de victoires et de sets", () => {
        const t = makeTournament(3, { nbGameSet: 1 });
        play(t, "A", "B", 5, 0);   // A +5, B -5
        play(t, "B", "C", 7, 5);   // B +2, C -2
        play(t, "C", "A", 6, 4);   // C +2, A -2
        // 1 victoire et 1 set chacune ; goal average : A +3, C 0, B -3
        assert.deepEqual(t.getRanking().map(x => x.name), ["A", "C", "B"]);
        assert.deepEqual(t.getRanking().map(x => x.goalAverage), [3, 0, -3]);
    });
});
