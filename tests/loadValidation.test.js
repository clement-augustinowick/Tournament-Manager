// Validation en profondeur de loadState() : un fichier de tournoi abîmé ou modifié à la main
// doit être refusé au chargement, avec un message clair, plutôt que de planter plus tard.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Tournament } from "../back/tournament.js";
import { defaultConfig, sampleTeams } from "./helpers/fixture.js";

// Un état réaliste : 4 équipes, un set déjà joué. Copie JSON = ce que produit un fichier sauvegardé.
function baseState() {
    const t = new Tournament();
    t.setTeams(sampleTeams(4));
    t.configure({ ...defaultConfig, nbGameSet: 2 });
    t.addSet(1, t.matches[0].matches[0].id, 5, 0);
    return JSON.parse(JSON.stringify(t.getState()));
}

const firstMatch = d => d.matches[0].matches[0];

describe("loadState() - fichiers valides", () => {
    it("accepte un état normal avec des sets joués", () => {
        const data = baseState();
        const t = new Tournament();
        assert.deepEqual(t.loadState(data), data);
    });

    it("accepte un goal average négatif", () => {
        const data = baseState();
        data.teamsList[0].goalAverage = -7;
        assert.doesNotThrow(() => new Tournament().loadState(data));
    });

    it("accepte des numéros d'équipes avec des trous (équipes supprimées avant validation)", () => {
        const t = new Tournament();
        t.setTeams([{ name: "A", teamNumber: 1 }, { name: "B", teamNumber: 3 }, { name: "C", teamNumber: 4 }]);
        t.configure(defaultConfig);
        assert.doesNotThrow(() => new Tournament().loadState(JSON.parse(JSON.stringify(t.getState()))));
    });

    it("ignore les champs supplémentaires inconnus", () => {
        const data = baseState();
        data.version = 2;
        data.teamsList[0].couleur = "rouge";
        assert.doesNotThrow(() => new Tournament().loadState(data));
    });

    it("accepte un tournoi sans aucun set joué", () => {
        const data = baseState();
        firstMatch(data).set = [];
        assert.doesNotThrow(() => new Tournament().loadState(data));
    });
});

describe("loadState() - fichiers corrompus refusés", () => {
    const corruptions = [
        ["équipe null", d => { d.teamsList[1] = null; }],
        ["équipe sans nom", d => { d.teamsList[1].name = ""; }],
        ["nom d'équipe qui n'est pas du texte", d => { d.teamsList[1].name = 42; }],
        ["numéro d'équipe manquant", d => { delete d.teamsList[1].teamNumber; }],
        ["numéro d'équipe en double", d => { d.teamsList[1].teamNumber = d.teamsList[0].teamNumber; }],
        ["nom d'équipe en double", d => { d.teamsList[1].name = d.teamsList[0].name; }],
        ["statistique d'équipe en texte", d => { d.teamsList[0].nbVictory = "3"; }],
        ["statistique d'équipe manquante", d => { delete d.teamsList[0].nbSetWon; }],
        ["paramètre nbSetPoint manquant", d => { delete d.tournamentInfos.nbSetPoint; }],
        ["paramètre pointSpread à 0", d => { d.tournamentInfos.pointSpread = 0; }],
        ["paramètre nbGameSet décimal", d => { d.tournamentInfos.nbGameSet = 1.5; }],
        ["round null", d => { d.matches[0] = null; }],
        ["round sans identifiant numérique", d => { d.matches[0].id = "un"; }],
        ["round dont 'matches' n'est pas une liste", d => { d.matches[0].matches = {}; }],
        ["round en double", d => { d.matches[1].id = d.matches[0].id; }],
        ["match sans team1", d => { delete firstMatch(d).team1; }],
        ["match sans team2", d => { delete firstMatch(d).team2; }],
        ["match sans set", d => { delete firstMatch(d).set; }],
        ["match dont 'set' n'est pas une liste", d => { firstMatch(d).set = "x"; }],
        ["match sans identifiant", d => { delete firstMatch(d).id; }],
        ["match en double", d => { d.matches[1].matches[0].id = firstMatch(d).id; }],
        ["équipe de match inconnue", d => { firstMatch(d).team1.teamNumber = 999; }],
        ["équipe de match sans nom", d => { delete firstMatch(d).team1.name; }],
        ["match d'une équipe contre elle-même", d => { firstMatch(d).team2 = { ...firstMatch(d).team1 }; }],
        ["set avec un score en texte", d => { firstMatch(d).set[0].score1 = "cinq"; }],
        ["set sans score2", d => { delete firstMatch(d).set[0].score2; }],
        ["set null", d => { firstMatch(d).set[0] = null; }],
        ["match minimal { id: 1 } (cas du test d'origine)", d => { d.matches = [{ id: 1, matches: [{ id: 1 }] }]; }]
    ];

    for (const [label, corrupt] of corruptions) {
        it(`refuse : ${label}`, () => {
            const data = baseState();
            corrupt(data);
            assert.throws(() => new Tournament().loadState(data), /Fichier de tournoi invalide/);
        });
    }

    it("un chargement refusé ne modifie pas le tournoi en cours", () => {
        const t = new Tournament();
        t.setTeams(sampleTeams(3));
        t.configure(defaultConfig);
        const before = JSON.stringify(t.getState());
        const savingBefore = t.saving;

        const data = baseState();
        delete firstMatch(data).team1;
        assert.throws(() => t.loadState(data));

        assert.equal(JSON.stringify(t.getState()), before);
        assert.equal(t.saving, savingBefore);
    });
});
