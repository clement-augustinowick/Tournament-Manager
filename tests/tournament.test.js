// Tests unitaires de la classe Tournament (aucune dépendance : node:test intégré).
//
// Convention : un test marqué `todo` décrit le comportement ATTENDU alors que le code actuel
// a un défaut. Il est exécuté mais ne fait pas échouer la suite ; il apparaît comme "# TODO".
// Quand vous corrigez le code, supprimez simplement l'option `todo` du test.

import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, mock } from "node:test";
import { Tournament } from "../back/tournament.js";
import { defaultConfig, sampleTeams } from "./helpers/fixture.js";

function makeTournament(nbTeams = 4, config = {}) {
    const t = new Tournament();
    t.setTeams(sampleTeams(nbTeams));
    t.configure({ ...defaultConfig, ...config });
    return t;
}

const allMatches = t => t.matches.flatMap(r => r.matches);
const pairKey = m => [m.team1.teamNumber, m.team2.teamNumber].sort((a, b) => a - b).join("-");

describe("Tournament - état initial et reset()", () => {
    it("démarre vide", () => {
        const t = new Tournament();
        assert.deepEqual(t.teamsList, []);
        assert.deepEqual(t.matches, []);
        assert.equal(t.currentRound, 1);
        assert.equal(t.saving, false);
        assert.equal(t.tournamentInfos.tournamentType, "");
    });

    it("reset() efface équipes, matchs et option de sauvegarde", () => {
        const t = makeTournament(4);
        t.saving = true;
        t.reset();
        assert.deepEqual(t.teamsList, []);
        assert.deepEqual(t.matches, []);
        assert.equal(t.saving, false);
        assert.equal(t.tournamentInfos.tournamentType, "");
    });
});

describe("Tournament.setTeams()", () => {
    it("accepte 3 équipes valides et initialise les stats à 0", () => {
        const t = new Tournament();
        t.setTeams(sampleTeams(3));
        assert.equal(t.teamsList.length, 3);
        for (const team of t.teamsList) {
            assert.equal(team.nbVictory, 0);
            assert.equal(team.nbSetWon, 0);
            assert.equal(team.goalAverage, 0);
        }
    });

    it("retourne l'état courant", () => {
        const t = new Tournament();
        const state = t.setTeams(sampleTeams(3));
        assert.equal(state.teamsList.length, 3);
    });

    for (const [label, input] of [
        ["undefined", undefined],
        ["null", null],
        ["une chaîne", "A,B,C"],
        ["un objet", { length: 3 }],
        ["une liste vide", []],
        ["2 équipes seulement", sampleTeams(2)]
    ]) {
        it(`refuse ${label}`, () => {
            const t = new Tournament();
            assert.throws(() => t.setTeams(input), /au moins 3 équipes/);
        });
    }

    it("refuse un nom vide, blanc ou manquant", () => {
        for (const bad of ["", "   ", undefined, null]) {
            const t = new Tournament();
            const teams = sampleTeams(3);
            teams[1].name = bad;
            assert.throws(() => t.setTeams(teams), /doivent avoir un nom/);
        }
    });

    it("refuse les noms en double (même après trim)", () => {
        const t = new Tournament();
        const teams = sampleTeams(3);
        teams[2].name = " A ";
        assert.throws(() => t.setTeams(teams), /uniques/);
    });

    it("supprime les espaces autour des noms", () => {
        const t = new Tournament();
        const teams = sampleTeams(3);
        teams[0].name = "  Les Lions  ";
        t.setTeams(teams);
        assert.equal(t.teamsList[0].name, "Les Lions");
    });

    it("convertit un nom numérique en chaîne", () => {
        const t = new Tournament();
        const teams = sampleTeams(3);
        teams[0].name = 42;
        t.setTeams(teams);
        assert.equal(t.teamsList[0].name, "42");
    });

    it("garde le teamNumber fourni, sinon utilise index + 1", () => {
        const t = new Tournament();
        t.setTeams([
            { name: "A", teamNumber: 10 },
            { name: "B" },
            { name: "C", teamNumber: "abc" }
        ]);
        assert.deepEqual(t.teamsList.map(x => x.teamNumber), [10, 2, 3]);
    });

    it("ignore les stats envoyées par le client (pas de triche)", () => {
        const t = new Tournament();
        const teams = sampleTeams(3).map(x => ({ ...x, nbVictory: 99, nbSetWon: 99, goalAverage: 99 }));
        t.setTeams(teams);
        assert.equal(t.teamsList[0].nbVictory, 0);
        assert.equal(t.teamsList[0].nbSetWon, 0);
        assert.equal(t.teamsList[0].goalAverage, 0);
    });

    it("ne partage pas d'objet entre les équipes", () => {
        const t = new Tournament();
        t.setTeams(sampleTeams(3));
        t.teamsList[0].nbVictory = 5;
        assert.equal(t.teamsList[1].nbVictory, 0);
    });

    it("n'écrase pas les équipes existantes si la validation échoue", () => {
        const t = new Tournament();
        t.setTeams(sampleTeams(4));
        assert.throws(() => t.setTeams(sampleTeams(2)));
        assert.equal(t.teamsList.length, 4);
    });

    it("deux équipes avec le même teamNumber devraient être refusées", () => {
        const t = new Tournament();
        assert.throws(() => t.setTeams([
            { name: "A", teamNumber: 1 },
            { name: "B", teamNumber: 1 },
            { name: "C", teamNumber: 3 }
        ]));
    });
});

describe("Tournament.configure()", () => {
    it("exige au moins 3 équipes", () => {
        const t = new Tournament();
        assert.throws(() => t.configure(defaultConfig), /au moins 3 équipes/);
    });

    it("refuse un type vide ou absent", () => {
        const t = new Tournament();
        t.setTeams(sampleTeams(3));
        assert.throws(() => t.configure({ ...defaultConfig, tournamentType: "" }), /Type de tournoi invalide/);
        assert.throws(() => t.configure({ ...defaultConfig, tournamentType: undefined }), /Type de tournoi invalide/);
    });

    for (const field of ["nbGameSet", "nbSetPoint", "pointSpread"]) {
        for (const bad of [0, -1]) {
            it(`refuse ${field} = ${bad}`, () => {
                const t = new Tournament();
                t.setTeams(sampleTeams(3));
                assert.throws(
                    () => t.configure({ ...defaultConfig, [field]: bad }),
                    /supérieurs à 0/
                );
            });
        }

        it(`refuse ${field} = NaN / texte non numérique`, () => {
            const t = new Tournament();
            t.setTeams(sampleTeams(3));
            assert.throws(() => t.configure({ ...defaultConfig, [field]: NaN }));
        });
    }

    for (const type of ["NombreDeParties", "SimpleKO", "DoubleKO", "TournoisSuisse", "TournoisPoule", "TournoisPouleTableau"]) {
        it(`refuse proprement le type pas encore implémenté "${type}"`, () => {
            const t = new Tournament();
            t.setTeams(sampleTeams(3));
            assert.throws(
                () => t.configure({ ...defaultConfig, tournamentType: type }),
                /n'a pas été implémenté/
            );
        });
    }

    it("refuse un type inconnu", () => {
        const t = new Tournament();
        t.setTeams(sampleTeams(3));
        assert.throws(() => t.configure({ ...defaultConfig, tournamentType: "Nimporte" }), /n'a pas été implémenté/);
    });

    it("mémorise la configuration et génère les matchs", () => {
        const t = makeTournament(4, { nbGameSet: 2, nbSetPoint: 21, pointSpread: 2 });
        assert.equal(t.tournamentInfos.tournamentType, "RoundRobin");
        assert.equal(t.tournamentInfos.nbGameSet, 2);
        assert.equal(t.tournamentInfos.nbSetPoint, 21);
        assert.equal(t.tournamentInfos.pointSpread, 2);
        assert.equal(t.tournamentInfos.currentRound, 1);
        assert.ok(t.matches.length > 0);
    });

    it("convertit les nombres reçus en texte", () => {
        const t = makeTournament(3, { nbGameSet: "2", nbSetPoint: "11", pointSpread: "1" });
        assert.strictEqual(t.tournamentInfos.nbGameSet, 2);
        assert.strictEqual(t.tournamentInfos.nbSetPoint, 11);
    });

    it("nbGame absent ou 0 devient 1", () => {
        const t = makeTournament(3, { nbGame: undefined });
        assert.equal(t.tournamentInfos.nbGame, 1);
        const t2 = makeTournament(3, { nbGame: 0 });
        assert.equal(t2.tournamentInfos.nbGame, 1);
    });

    it("reconfigurer régénère les matchs sans doublons", () => {
        const t = makeTournament(4);
        const first = allMatches(t).length;
        t.configure(defaultConfig);
        assert.equal(allMatches(t).length, first);
        assert.equal(t.currentRound, 1);
    });

    it("reconfigurer devrait remettre les stats des équipes à zéro", () => {
        const t = makeTournament(3);
        const m = allMatches(t)[0];
        t.addSet(1, m.id, 5, 0);
        t.configure(defaultConfig);
        assert.ok(t.teamsList.every(x => x.nbVictory === 0 && x.nbSetWon === 0 && x.goalAverage === 0));
    });

    it("un type inconnu est refusé SANS rien modifier (configuration atomique)", () => {
        const t = makeTournament(4, { nbGameSet: 2, nbSetPoint: 21 });
        t.addSet(1, allMatches(t)[0].id, 21, 0);
        const before = JSON.stringify(t.getState());

        assert.throws(() => t.configure({ ...defaultConfig, tournamentType: "SimpleKO" }), /n'a pas été implémenté/);
        assert.equal(JSON.stringify(t.getState()), before);
    });

    it("des paramètres invalides sont refusés SANS rien modifier", () => {
        const t = makeTournament(4, { nbGameSet: 2 });
        t.addSet(1, allMatches(t)[0].id, 5, 0);
        const before = JSON.stringify(t.getState());

        assert.throws(() => t.configure({ ...defaultConfig, nbSetPoint: 0 }));
        assert.equal(JSON.stringify(t.getState()), before);
    });

    it("reconfigurer efface aussi les sets joués et ne garde que les nouveaux matchs", () => {
        const t = makeTournament(4, { nbGameSet: 2 });
        t.addSet(1, allMatches(t)[0].id, 5, 0);
        t.configure({ ...defaultConfig, nbGameSet: 3 });
        assert.ok(allMatches(t).every(m => m.set.length === 0));
        assert.ok(allMatches(t).every(m => m.team1.nbSetWon === 0 && m.team2.nbSetWon === 0));
        assert.equal(t.tournamentInfos.nbGameSet, 3);
    });

    it("reconfigurer permet de rejouer : les victoires repartent de 0", () => {
        const t = makeTournament(3, { nbGameSet: 1 });
        const m = allMatches(t)[0];
        t.addSet(1, m.id, 5, 0);
        t.configure({ ...defaultConfig, nbGameSet: 1 });
        t.addSet(1, allMatches(t)[0].id, 5, 0);
        assert.equal(t.teamsList.reduce((sum, x) => sum + x.nbVictory, 0), 1);
    });
});

describe("Tournament.generateRoundRobin()", () => {
    for (let n = 3; n <= 10; n++) {
        describe(`${n} équipes`, () => {
            const t = makeTournament(n);
            const matches = allMatches(t);

            it(`génère exactement n(n-1)/2 = ${(n * (n - 1)) / 2} matchs`, () => {
                assert.equal(matches.length, (n * (n - 1)) / 2);
            });

            it(`génère ${n % 2 === 0 ? n - 1 : n} rounds`, () => {
                assert.equal(t.matches.length, n % 2 === 0 ? n - 1 : n);
            });

            it("chaque paire d'équipes se rencontre exactement une fois", () => {
                const keys = matches.map(pairKey);
                assert.equal(new Set(keys).size, keys.length, "doublon de rencontre");
                for (let a = 1; a <= n; a++) {
                    for (let b = a + 1; b <= n; b++) {
                        assert.ok(keys.includes(`${a}-${b}`), `manque ${a}-${b}`);
                    }
                }
            });

            it("aucune équipe ne joue contre elle-même", () => {
                assert.ok(matches.every(m => m.team1.teamNumber !== m.team2.teamNumber));
            });

            it("aucune équipe ne joue deux fois dans le même round", () => {
                for (const round of t.matches) {
                    const nums = round.matches.flatMap(m => [m.team1.teamNumber, m.team2.teamNumber]);
                    assert.equal(new Set(nums).size, nums.length, `round ${round.id}`);
                }
            });

            it("ids de rounds 1..k et ids de matchs uniques et consécutifs à partir de 1", () => {
                assert.deepEqual(t.matches.map(r => r.id), t.matches.map((_, i) => i + 1));
                assert.deepEqual(matches.map(m => m.id), matches.map((_, i) => i + 1));
            });

            if (n % 2 === 1) {
                it("chaque équipe est exempte exactement une fois (nombre impair)", () => {
                    for (let team = 1; team <= n; team++) {
                        const played = t.matches.filter(r =>
                            r.matches.some(m => m.team1.teamNumber === team || m.team2.teamNumber === team)
                        ).length;
                        assert.equal(played, n - 1, `équipe ${team}`);
                    }
                });
            } else {
                it("chaque round contient n/2 matchs (nombre pair)", () => {
                    assert.ok(t.matches.every(r => r.matches.length === n / 2));
                });
            }
        });
    }

    it("les matchs démarrent sans set et ne partagent pas leur tableau de sets", () => {
        const t = makeTournament(4);
        const [m1, m2] = allMatches(t);
        assert.deepEqual(m1.set, []);
        m1.set.push({ score1: 1, score2: 0 });
        assert.deepEqual(m2.set, []);
    });

    it("les équipes dans les matchs sont des copies (modifier un match ne touche pas teamsList)", () => {
        const t = makeTournament(4);
        allMatches(t)[0].team1.name = "HACK";
        assert.ok(t.teamsList.every(x => x.name !== "HACK"));
    });

    it("ne modifie pas l'objet defaultMatch partagé entre générations", () => {
        const a = makeTournament(3);
        const b = makeTournament(3);
        allMatches(a)[0].set.push({ score1: 5, score2: 0 });
        assert.deepEqual(allMatches(b)[0].set, []);
    });
});

describe("Tournament.addSet()", () => {
    const firstMatch = t => allMatches(t)[0];

    it("round introuvable", () => {
        const t = makeTournament(4);
        assert.throws(() => t.addSet(99, 1, 5, 0), /Round introuvable/);
    });

    it("match introuvable (id inexistant ou d'un autre round)", () => {
        const t = makeTournament(4);
        assert.throws(() => t.addSet(1, 999, 5, 0), /Match introuvable/);
        const matchOfRound2 = t.matches[1].matches[0];
        assert.throws(() => t.addSet(1, matchOfRound2.id, 5, 0), /Match introuvable/);
    });

    it("accepte des identifiants sous forme de texte (venant de l'URL)", () => {
        const t = makeTournament(4);
        t.addSet("1", String(firstMatch(t).id), "5", "0");
        assert.equal(firstMatch(t).set.length, 1);
    });

    for (const [label, s1, s2] of [
        ["score négatif", -1, 5],
        ["score négatif (équipe 2)", 5, -1],
        ["texte non numérique", "abc", 5],
        ["NaN", NaN, 5],
        ["Infinity", Infinity, 0],
        ["undefined", undefined, 5]
    ]) {
        it(`refuse : ${label}`, () => {
            const t = makeTournament(4);
            assert.throws(() => t.addSet(1, firstMatch(t).id, s1, s2), /Score invalide/);
            assert.equal(firstMatch(t).set.length, 0);
        });
    }

    it("refuse un set nul", () => {
        const t = makeTournament(4);
        assert.throws(() => t.addSet(1, firstMatch(t).id, 5, 5), /ne peut pas être nul/);
    });

    it("refuse si personne n'a atteint le nombre de points requis", () => {
        const t = makeTournament(4, { nbSetPoint: 5 });
        assert.throws(() => t.addSet(1, firstMatch(t).id, 4, 2), /nombre de points requis/);
    });

    it("refuse si l'écart est insuffisant", () => {
        const t = makeTournament(4, { nbSetPoint: 5, pointSpread: 2 });
        assert.throws(() => t.addSet(1, firstMatch(t).id, 5, 4), /au moins 2 point\(s\) d'écart/);
    });

    it("accepte l'écart minimum et les prolongations", () => {
        const t = makeTournament(4, { nbGameSet: 5, nbSetPoint: 5, pointSpread: 2 });
        const id = firstMatch(t).id;
        t.addSet(1, id, 5, 3);
        t.addSet(1, id, 3, 5);
        t.addSet(1, id, 7, 5); // prolongation
        assert.equal(firstMatch(t).set.length, 3);
    });

    it("un échec de validation ne modifie aucune statistique", () => {
        const t = makeTournament(4);
        const before = JSON.stringify(t.getState());
        assert.throws(() => t.addSet(1, firstMatch(t).id, 5, 5));
        assert.throws(() => t.addSet(1, firstMatch(t).id, 2, 1));
        assert.equal(JSON.stringify(t.getState()), before);
    });

    it("enregistre le set et crédite nbSetWon au gagnant du set", () => {
        const t = makeTournament(4, { nbGameSet: 2 });
        const m = firstMatch(t);
        t.addSet(1, m.id, 5, 1);
        assert.deepEqual(m.set, [{ score1: 5, score2: 1 }]);
        assert.equal(t.teamsList.find(x => x.teamNumber === m.team1.teamNumber).nbSetWon, 1);
        assert.equal(t.teamsList.find(x => x.teamNumber === m.team2.teamNumber).nbSetWon, 0);
    });

    it("crédite l'équipe 2 quand elle gagne le set", () => {
        const t = makeTournament(4, { nbGameSet: 2 });
        const m = firstMatch(t);
        t.addSet(1, m.id, 1, 5);
        assert.equal(t.teamsList.find(x => x.teamNumber === m.team2.teamNumber).nbSetWon, 1);
    });

    it("pas de victoire tant que le nombre de sets gagnants n'est pas atteint", () => {
        const t = makeTournament(4, { nbGameSet: 2 });
        const m = firstMatch(t);
        t.addSet(1, m.id, 5, 0);
        assert.ok(t.teamsList.every(x => x.nbVictory === 0));
        assert.equal(t.checkMatchEnded(m), "");
    });

    it("1 set gagnant : le match est terminé dès le premier set", () => {
        const t = makeTournament(4, { nbGameSet: 1 });
        const m = firstMatch(t);
        t.addSet(1, m.id, 5, 0);
        assert.equal(t.teamsList.find(x => x.teamNumber === m.team1.teamNumber).nbVictory, 1);
        assert.equal(t.checkMatchEnded(m), m.team1.name);
    });

    it("2 sets gagnants : une victoire est comptée une seule fois", () => {
        const t = makeTournament(4, { nbGameSet: 2 });
        const m = firstMatch(t);
        t.addSet(1, m.id, 5, 0);
        t.addSet(1, m.id, 5, 1);
        const winner = t.teamsList.find(x => x.teamNumber === m.team1.teamNumber);
        assert.equal(winner.nbVictory, 1);
        assert.equal(winner.nbSetWon, 2);
        assert.equal(t.checkMatchEnded(m), m.team1.name);
    });

    it("remontada 0-1 puis 2-1 : la victoire va à l'équipe qui a fini devant", () => {
        const t = makeTournament(4, { nbGameSet: 2 });
        const m = firstMatch(t);
        t.addSet(1, m.id, 0 + 5, 0); // team1 gagne le set 1
        t.addSet(1, m.id, 1, 5);     // team2 égalise
        t.addSet(1, m.id, 1, 5);     // team2 prend le match
        const t1 = t.teamsList.find(x => x.teamNumber === m.team1.teamNumber);
        const t2 = t.teamsList.find(x => x.teamNumber === m.team2.teamNumber);
        assert.equal(t1.nbVictory, 0);
        assert.equal(t2.nbVictory, 1);
        assert.equal(t1.nbSetWon, 1);
        assert.equal(t2.nbSetWon, 2);
    });

    it("refuse un set supplémentaire une fois le match gagné", () => {
        const t = makeTournament(4, { nbGameSet: 1 });
        const m = firstMatch(t);
        t.addSet(1, m.id, 5, 0);
        assert.throws(
            () => t.addSet(1, m.id, 5, 0),
            new RegExp(`L'équipe ${m.team1.name} a déjà remporté le match`)
        );
        assert.equal(m.set.length, 1);
    });

    it("les statistiques des autres matchs ne sont pas affectées", () => {
        const t = makeTournament(4, { nbGameSet: 1 });
        const m = firstMatch(t);
        t.addSet(1, m.id, 5, 0);
        const others = t.teamsList.filter(x => x.teamNumber !== m.team1.teamNumber && x.teamNumber !== m.team2.teamNumber);
        assert.ok(others.every(x => x.nbSetWon === 0 && x.nbVictory === 0 && x.goalAverage === 0));
    });

    it("un tournoi complet : le total des victoires = nombre de matchs", () => {
        const t = makeTournament(5, { nbGameSet: 1 });
        for (const round of t.matches) {
            for (const m of round.matches) {
                t.addSet(round.id, m.id, m.team1.teamNumber > m.team2.teamNumber ? 0 + 0 : 5, m.team1.teamNumber > m.team2.teamNumber ? 5 : 0);
            }
        }
        const total = t.teamsList.reduce((s, x) => s + x.nbVictory, 0);
        assert.equal(total, 10);
    });

    it("goalAverage : le gagnant du set devrait avoir un meilleur goal average que le perdant", () => {
        const t = makeTournament(4, { nbGameSet: 2 });
        const m = firstMatch(t);
        t.addSet(1, m.id, 5, 0);
        const w = t.teamsList.find(x => x.teamNumber === m.team1.teamNumber);
        const l = t.teamsList.find(x => x.teamNumber === m.team2.teamNumber);
        assert.ok(w.goalAverage > l.goalAverage);
    });
});

describe("Tournament.addSet() - fin de set (points requis + écart)", () => {
    // Règle : un set s'arrête dès qu'une équipe a atteint les points requis ET mène d'au moins
    // l'écart demandé. Le score du gagnant est donc exactement max(points requis, perdant + écart).
    const winnerScore = (target, spread, loser) => Math.max(target, loser + spread);

    const configs = [
        { nbSetPoint: 5, pointSpread: 2 },   // ex. 5-3, 6-4, 7-5...
        { nbSetPoint: 5, pointSpread: 1 },   // pas de prolongation sauf 5-5 => 6-5
        { nbSetPoint: 10, pointSpread: 3 },
        { nbSetPoint: 25, pointSpread: 2 }   // volley
    ];

    // Joue un seul set sur un match neuf ; `swap` met le gagnant en équipe 2.
    function playSet(config, winner, loser, swap = false) {
        const t = makeTournament(4, { ...config, nbGameSet: 5 });
        const id = allMatches(t)[0].id;
        return t.addSet(1, id, swap ? loser : winner, swap ? winner : loser);
    }

    for (const config of configs) {
        const { nbSetPoint: target, pointSpread: spread } = config;
        const label = `${target} points, ${spread} d'écart`;
        const losers = Array.from({ length: target + 4 }, (_, i) => i); // 0 .. target+3

        it(`${label} : accepte tous les scores finaux valides (dans les deux sens)`, () => {
            for (const loser of losers) {
                const winner = winnerScore(target, spread, loser);
                for (const swap of [false, true]) {
                    assert.doesNotThrow(
                        () => playSet(config, winner, loser, swap),
                        `${winner}-${loser}${swap ? " (équipe 2 gagnante)" : ""} devrait être accepté`
                    );
                }
            }
        });

        it(`${label} : refuse un score trop faible (points ou écart manquants)`, () => {
            for (const loser of losers) {
                const tooLow = winnerScore(target, spread, loser) - 1;
                for (const swap of [false, true]) {
                    assert.throws(
                        () => playSet(config, tooLow, loser, swap),
                        `${tooLow}-${loser} devrait être refusé`
                    );
                }
            }
        });

        it(`${label} : refuse un score qui dépasse le nécessaire`, () => {
            for (const loser of losers) {
                const tooHigh = winnerScore(target, spread, loser) + 1;
                for (const swap of [false, true]) {
                    assert.throws(
                        () => playSet(config, tooHigh, loser, swap),
                        `${tooHigh}-${loser} devrait être refusé (le set était fini à ${winnerScore(target, spread, loser)}-${loser})`
                    );
                }
            }
        });
    }

    it("exemples concrets (5 points, 2 d'écart)", () => {
        const cfg = { nbSetPoint: 5, pointSpread: 2 };
        // valides
        for (const [w, l] of [[5, 0], [5, 3], [6, 4], [7, 5], [12, 10]]) {
            assert.doesNotThrow(() => playSet(cfg, w, l), `${w}-${l}`);
        }
        // refusés : trop faibles
        for (const [w, l] of [[4, 2], [5, 4], [6, 5], [11, 10]]) {
            assert.throws(() => playSet(cfg, w, l), `${w}-${l}`);
        }
    });

    it("exemples concrets de scores trop élevés (5 points, 2 d'écart)", () => {
        const cfg = { nbSetPoint: 5, pointSpread: 2 };
        for (const [w, l] of [[6, 0], [6, 3], [7, 4], [8, 5], [30, 5]]) {
            assert.throws(() => playSet(cfg, w, l), `${w}-${l}`);
        }
    });
});

describe("Tournament.addSet() - round courant", () => {
    const matchOfRound = (t, round) => t.matches[round - 1].matches[0];

    it("démarre au round 1", () => {
        assert.equal(makeTournament(4).currentRound, 1);
        assert.equal(makeTournament(4).getState().currentRound, 1);
    });

    it("mémorise le round du set enregistré (visible dans getState)", () => {
        const t = makeTournament(4, { nbGameSet: 2 });
        t.addSet(2, matchOfRound(t, 2).id, 5, 0);
        assert.equal(t.currentRound, 2);
        assert.equal(t.getState().currentRound, 2);
    });

    it("suit le dernier round joué, dans les deux sens", () => {
        const t = makeTournament(4, { nbGameSet: 2 });
        t.addSet(3, matchOfRound(t, 3).id, 5, 0);
        assert.equal(t.currentRound, 3);
        t.addSet(1, matchOfRound(t, 1).id, 5, 0);
        assert.equal(t.currentRound, 1);
    });

    it("le round mémorisé survit à un aller-retour save/load", () => {
        const a = makeTournament(4, { nbGameSet: 2 });
        a.addSet(2, matchOfRound(a, 2).id, 5, 0);
        const b = new Tournament();
        b.loadState(JSON.parse(JSON.stringify(a.getState())));
        assert.equal(b.currentRound, 2);
    });

    it("configure() remet le round courant à 1", () => {
        const t = makeTournament(4, { nbGameSet: 2 });
        t.addSet(3, matchOfRound(t, 3).id, 5, 0);
        t.configure(defaultConfig);
        assert.equal(t.currentRound, 1);
    });

    it("BUG: un round inexistant ne doit pas modifier le round courant", () => {
        const t = makeTournament(4);
        assert.throws(() => t.addSet(99, 1, 5, 0), /Round introuvable/);
        assert.equal(t.currentRound, 1);
        assert.throws(() => t.addSet("abc", 1, 5, 0), /Round introuvable/);
        assert.equal(t.currentRound, 1);
    });

    it("BUG: un fichier chargé avec un round hors limites devrait revenir à un round existant", () => {
        const data = makeTournament(4).getState();
        data.currentRound = 99;
        const t = new Tournament();
        t.loadState(data);
        assert.ok(t.matches.some(r => r.id === t.currentRound));
    });
});

describe("Tournament.checkMatchEnded()", () => {
    it("retourne '' si aucun set", () => {
        const t = makeTournament(3);
        assert.equal(t.checkMatchEnded(allMatches(t)[0]), "");
    });

    it("retourne le nom du vainqueur selon nbGameSet", () => {
        const t = makeTournament(3, { nbGameSet: 2 });
        const match = {
            team1: { name: "X" }, team2: { name: "Y" },
            set: [{ score1: 5, score2: 0 }, { score1: 0, score2: 5 }, { score1: 0, score2: 5 }]
        };
        assert.equal(t.checkMatchEnded(match), "Y");
    });

    it("ignore les sets nuls éventuels", () => {
        const t = makeTournament(3, { nbGameSet: 1 });
        const match = { team1: { name: "X" }, team2: { name: "Y" }, set: [{ score1: 2, score2: 2 }] };
        assert.equal(t.checkMatchEnded(match), "");
    });
});

describe("Tournament.getRanking()", () => {
    it("trie par victoires puis sets gagnés puis goal average", () => {
        const t = makeTournament(4);
        const set = (name, nbVictory, nbSetWon, goalAverage) =>
            Object.assign(t.teamsList.find(x => x.name === name), { nbVictory, nbSetWon, goalAverage });
        set("A", 1, 3, 5);
        set("B", 2, 0, 0);
        set("C", 1, 4, 0);
        set("D", 1, 4, 9);
        assert.deepEqual(t.getRanking().map(x => x.name), ["B", "D", "C", "A"]);
    });

    it("ne modifie pas l'ordre de teamsList", () => {
        const t = makeTournament(4);
        t.teamsList[3].nbVictory = 10;
        const before = t.teamsList.map(x => x.name);
        t.getRanking();
        assert.deepEqual(t.teamsList.map(x => x.name), before);
    });

    it("conserve toutes les équipes, même ex æquo", () => {
        const t = makeTournament(5);
        assert.equal(t.getRanking().length, 5);
    });

    it("classement cohérent après un tournoi joué", () => {
        const t = makeTournament(3, { nbGameSet: 1 });
        // l'équipe au plus petit numéro gagne toujours
        for (const round of t.matches) {
            for (const m of round.matches) {
                const t1Wins = m.team1.teamNumber < m.team2.teamNumber;
                t.addSet(round.id, m.id, t1Wins ? 5 : 0, t1Wins ? 0 : 5);
            }
        }
        assert.deepEqual(t.getRanking().map(x => x.name), ["A", "B", "C"]);
        assert.deepEqual(t.getRanking().map(x => x.nbVictory), [2, 1, 0]);
    });
});

describe("Tournament.getState()", () => {
    it("retourne une copie profonde", () => {
        const t = makeTournament(4);
        const state = t.getState();
        state.teamsList[0].name = "HACK";
        state.matches[0].matches[0].set.push({ score1: 1, score2: 0 });
        state.tournamentInfos.nbSetPoint = 999;
        assert.notEqual(t.teamsList[0].name, "HACK");
        assert.equal(t.matches[0].matches[0].set.length, 0);
        assert.notEqual(t.tournamentInfos.nbSetPoint, 999);
    });

    it("contient les 4 clés attendues", () => {
        const state = makeTournament(4).getState();
        assert.deepEqual(Object.keys(state).sort(), ["currentRound", "matches", "teamsList", "tournamentInfos"]);
    });

    it("est sérialisable en JSON sans perte", () => {
        const state = makeTournament(4).getState();
        assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
    });
});

describe("Tournament.loadState()", () => {
    it("recharge un état exporté (aller-retour complet)", () => {
        const a = makeTournament(4, { nbGameSet: 2 });
        const m = allMatches(a)[0];
        a.addSet(1, m.id, 5, 0);

        const b = new Tournament();
        const state = b.loadState(JSON.parse(JSON.stringify(a.getState())));

        assert.deepEqual(state, a.getState());
        assert.deepEqual(b.getRanking(), a.getRanking());
    });

    it("active la sauvegarde automatique", () => {
        const a = makeTournament(4);
        const b = new Tournament();
        b.loadState(a.getState());
        assert.equal(b.saving, true);
    });

    it("permet de continuer à jouer après le chargement", () => {
        const a = makeTournament(4, { nbGameSet: 2 });
        const m = allMatches(a)[0];
        a.addSet(1, m.id, 5, 0);

        const b = new Tournament();
        b.loadState(a.getState());
        b.addSet(1, m.id, 5, 0);
        assert.equal(b.teamsList.find(x => x.teamNumber === m.team1.teamNumber).nbVictory, 1);
    });

    it("copie les données (modifier l'entrée après coup n'affecte pas le tournoi)", () => {
        const a = makeTournament(4);
        const data = a.getState();
        const b = new Tournament();
        b.loadState(data);
        data.teamsList[0].name = "HACK";
        assert.notEqual(b.teamsList[0].name, "HACK");
    });

    it("currentRound absent ou invalide devient 1", () => {
        const a = makeTournament(4);
        const data = a.getState();
        delete data.currentRound;
        const b = new Tournament();
        b.loadState(data);
        assert.equal(b.currentRound, 1);
    });

    for (const [label, mutate, expected] of [
        ["null", () => null, /invalide/],
        ["une chaîne", () => "texte", /invalide/],
        ["sans équipes", d => ({ ...d, teamsList: undefined }), /liste d'équipes/],
        ["moins de 3 équipes", d => ({ ...d, teamsList: d.teamsList.slice(0, 2) }), /liste d'équipes/],
        ["sans infos de tournoi", d => ({ ...d, tournamentInfos: undefined }), /type de tournoi inconnu/],
        ["type de tournoi inconnu", d => ({ ...d, tournamentInfos: { ...d.tournamentInfos, tournamentType: "Zzz" } }), /type de tournoi inconnu/],
        ["matchs qui ne sont pas une liste", d => ({ ...d, matches: {} }), /liste de matchs/]
    ]) {
        it(`refuse un fichier : ${label}`, () => {
            const data = makeTournament(4).getState();
            const t = new Tournament();
            assert.throws(() => t.loadState(mutate(data)), expected);
        });
    }

    it("un chargement refusé ne modifie pas le tournoi en cours", () => {
        const t = makeTournament(4);
        const before = JSON.stringify(t.getState());
        assert.throws(() => t.loadState({ teamsList: [] }));
        assert.equal(JSON.stringify(t.getState()), before);
    });

    it("un fichier dont les matchs sont corrompus devrait être refusé", () => {
        const data = makeTournament(4).getState();
        data.matches = [{ id: 1, matches: [{ id: 1 }] }];
        const t = new Tournament();
        assert.throws(() => t.loadState(data));
    });
});

describe("Tournament.save()", () => {
    async function withTempDir(fn) {
        const dir = await mkdtemp(path.join(os.tmpdir(), "tournoi-save-"));
        try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
    }

    it("écrit un JSON égal à getState() dans le dossier demandé", async () => {
        await withTempDir(async dir => {
            const t = makeTournament(4);
            const file = await t.save("fr", dir);
            assert.equal(path.dirname(file), dir);
            assert.deepEqual(JSON.parse(await readFile(file, "utf8")), t.getState());
        });
    });

    it("crée le dossier s'il n'existe pas (y compris imbriqué)", async () => {
        await withTempDir(async dir => {
            const nested = path.join(dir, "a", "b", "Downloads");
            const file = await makeTournament(3).save("fr", nested);
            assert.deepEqual(await readdir(nested), [path.basename(file)]);
        });
    });

    it("nom de fichier : préfixe selon la langue et date JJ-MM-AAAA", async () => {
        await withTempDir(async dir => {
            mock.timers.enable({ apis: ["Date"], now: new Date(2026, 2, 5, 12, 0, 0) }); // 5 mars 2026 (heure locale)
            try {
                const t = makeTournament(3);
                assert.equal(path.basename(await t.save("fr", dir)), "tournois-05-03-2026.json");
                assert.equal(path.basename(await t.save("en", dir)), "tournament-05-03-2026.json");
                assert.equal(path.basename(await t.save(undefined, dir)), "tournament-05-03-2026.json");
                assert.equal(path.basename(await t.save("de", dir)), "tournament-05-03-2026.json");
            } finally {
                mock.timers.reset();
            }
        });
    });

    it("écrase le fichier du même jour avec la dernière version", async () => {
        await withTempDir(async dir => {
            const t = makeTournament(4, { nbGameSet: 2 });
            await t.save("fr", dir);
            t.addSet(1, allMatches(t)[0].id, 5, 0);
            const file = await t.save("fr", dir);
            const files = await readdir(dir);
            assert.equal(files.length, 1);
            assert.equal(JSON.parse(await readFile(file, "utf8")).matches[0].matches[0].set.length, 1);
        });
    });

    // A corriger quand je demanderai le nom du tournois
    // it("BUG: deux tournois différents le même jour s'écrasent mutuellement", {
    //     todo: "Le nom ne contient que la date : un 2e tournoi du jour remplace le fichier du 1er"
    // }, async () => {
    //     await withTempDir(async dir => {
    //         const a = makeTournament(3);
    //         const b = makeTournament(5);
    //         const fa = await a.save("fr", dir);
    //         const fb = await b.save("fr", dir);
    //         assert.notEqual(fa, fb);
    //     });
    // });
});
