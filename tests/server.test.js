// Tests d'intégration de back/server.js : un vrai serveur est lancé (port libre, dossier maison
// temporaire) et interrogé en HTTP. Les tests `todo` décrivent un comportement attendu que le
// code actuel ne respecte pas encore (voir tests/Tournament.test.js pour la convention).

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { defaultConfig, sampleTeams, startServer } from "./helpers/fixture.js";

let s, state;
beforeEach(async () => { s = await startServer(); state = null; });
afterEach(async () => { await s.stop(); });

async function setup(nbTeams = 4, config = {}) {
    const r = await s.post("/api/tournament", { teams: sampleTeams(nbTeams), ...defaultConfig, ...config });
    if (r.json?.success) state = r.json.state;
    return r;
}

// Se comporte comme le navigateur : envoie l'état courant, et ne le remplace que si le serveur accepte.
async function score(round, matchId, score1, score2) {
    const r = await s.post(`/api/matches/${round}/${matchId}/score`, { state, score1, score2 });
    if (r.json?.success) state = r.json.state;
    return r;
}

describe("fichiers statiques", () => {
    it("GET / sert index.html", async () => {
        const r = await s.get("/");
        assert.equal(r.status, 200);
        assert.match(r.headers.get("content-type"), /^text\/html; charset=utf-8/);
        assert.match(r.text, /Mon gestionnaire de tournois/);
    });

    it("GET /index.html donne le même contenu que /", async () => {
        assert.equal((await s.get("/index.html")).text, (await s.get("/")).text);
    });

    it("sert le CSS et le JS avec le bon Content-Type", async () => {
        const css = await s.get("/style.css");
        const js = await s.get("/script.js");
        assert.equal(css.status, 200);
        assert.match(css.headers.get("content-type"), /^text\/css/);
        assert.equal(js.status, 200);
        assert.match(js.headers.get("content-type"), /^text\/javascript/);
    });

    it("ignore la query string", async () => {
        assert.equal((await s.get("/style.css?v=123")).status, 200);
    });

    it("404 pour un fichier inexistant", async () => {
        const r = await s.get("/nope.html");
        assert.equal(r.status, 404);
    });

    it("n'expose pas le code serveur (/back, /Tournament.js)", async () => {
        assert.equal((await s.get("/Tournament.js")).status, 404);
        assert.equal((await s.get("/server.js")).status, 404);
    });

    it("403 sur une tentative de remontée de dossier (/../back/server.js)", async () => {
        const r = await s.raw("/../back/server.js");
        assert.equal(r.status, 403);
        assert.doesNotMatch(r.text, /createServer/);
    });

    it("403 sur une remontée encodée (%2e%2e)", async () => {
        const r = await s.raw("/%2e%2e/back/server.js");
        assert.equal(r.status, 403);
        assert.doesNotMatch(r.text, /createServer/);
    });

    it("403 sur un dossier frère dont le nom commence par 'public' (3 écritures du chemin)", async () => {
        for (const url of [
            "/../public-evil/secret.txt",
            "/%2e%2e/public-evil/secret.txt",
            "/..%2fpublic-evil/secret.txt"
        ]) {
            const r = await s.raw(url);
            assert.equal(r.status, 403, url);
            assert.notEqual(r.text, "SECRET", url);
        }
    });

    it("les fichiers légitimes de public/ restent servis après le durcissement", async () => {
        for (const url of ["/", "/index.html", "/style.css", "/script.js"]) {
            assert.equal((await s.raw(url)).status, 200, url);
        }
    });

    it("400 (et pas de crash) pour une URL mal encodée", async () => {
        for (const url of ["/%E0%A4%A", "/%", "/%zz", "/%c0%af", "/style.css%E0%A4%A"]) {
            const r = await s.raw(url);
            assert.equal(r.status, 400, url);
            assert.ok(s.alive(), `le serveur est mort après ${url} : ${s.stderr().split("\n")[0]}`);
        }
        assert.equal((await s.get("/")).status, 200);
    });

    it("une URL mal encodée dans la query string ne gêne pas (elle est ignorée)", async () => {
        assert.equal((await s.raw("/style.css?x=%E0%A4%A")).status, 200);
        assert.ok(s.alive());
    });

    it("la page d'accueil reste servie avec une query string (/?v=1)", async () => {
        const r = await s.raw("/?v=1");
        assert.equal(r.status, 200);
        assert.match(r.text, /Mon gestionnaire de tournois/);
    });
});

describe("POST /api/teams", () => {
    it("enregistre les équipes et retourne l'état", async () => {
        const r = await s.post("/api/teams", { teams: sampleTeams(4) });
        assert.equal(r.status, 200);
        assert.equal(r.json.success, true);
        assert.deepEqual(r.json.state.teamsList.map(t => t.name), ["A", "B", "C", "D"]);
    });

    it("400 si moins de 3 équipes", async () => {
        const r = await s.post("/api/teams", { teams: sampleTeams(2) });
        assert.equal(r.status, 400);
        assert.equal(r.json.success, false);
        assert.match(r.json.error, /au moins 3 équipes/);
    });

    it("400 si noms en double", async () => {
        const teams = sampleTeams(3);
        teams[1].name = "A";
        const r = await s.post("/api/teams", { teams });
        assert.equal(r.status, 400);
        assert.match(r.json.error, /uniques/);
    });

    it("400 si le corps est absent", async () => {
        const r = await s.post("/api/teams");
        assert.equal(r.status, 400);
    });

    it("400 (et pas de crash) si le JSON est invalide", async () => {
        const r = await s.request("POST", "/api/teams", "{pas du json");
        assert.equal(r.status, 400);
        assert.equal(r.json.success, false);
        assert.ok(s.alive());
    });
});

describe("POST /api/tournament", () => {
    it("400 si aucune équipe n'a été enregistrée", async () => {
        const r = await s.post("/api/tournament", defaultConfig);
        assert.equal(r.status, 400);
        assert.match(r.json.error, /au moins 3 équipes/);
    });

    it("génère les rounds Round Robin", async () => {
        const r = await setup(4);
        assert.equal(r.status, 200);
        assert.equal(r.json.state.matches.length, 3);
        assert.equal(r.json.state.tournamentInfos.tournamentType, "RoundRobin");
    });

    it("400 pour un type non implémenté", async () => {
        const r = await setup(4, { tournamentType: "SimpleKO" });
        assert.equal(r.status, 400);
        assert.match(r.json.error, /n'a pas été implémenté/);
    });

    it("400 pour des paramètres invalides", async () => {
        const r = await setup(4, { nbSetPoint: 0 });
        assert.equal(r.status, 400);
        assert.match(r.json.error, /supérieurs à 0/);
    });

    it("null (champ vide du formulaire) est refusé comme un 0", async () => {
        const r = await setup(4, { nbSetPoint: null });
        assert.equal(r.status, 400);
    });

    it("un paramètre texte non numérique devrait être refusé", async () => {
        const r = await setup(4, { nbSetPoint: "abc" });
        assert.equal(r.status, 400);
    });

    it("400 si l'écart dépasse le nombre de points d'un set (même sans passer par le navigateur)", async () => {
        const r = await setup(4, { nbSetPoint: 3, pointSpread: 5 });
        assert.equal(r.status, 400);
        assert.match(r.json.error, /écart ne peut pas dépasser/);
    });
});

describe("POST /api/ranking", () => {
    it("renvoie le classement trié", async () => {
        await setup(3);
        const r = await s.post("/api/ranking", { state });
        assert.equal(r.status, 200);
        assert.equal(r.json.ranking.length, 3);
    });

    it("reflète les victoires", async () => {
        const { json } = await setup(3);
        const m = json.state.matches[0].matches[0];
        await score(1, m.id, 5, 0);
        const ranking = (await s.post("/api/ranking", { state })).json.ranking;
        assert.equal(ranking[0].name, m.team1.name);
        assert.equal(ranking[0].nbVictory, 1);
    });

    it("400 si l'état est absent", async () => {
        const r = await s.post("/api/ranking", {});
        assert.equal(r.status, 400);
    });

    it("GET /api/state et GET /api/ranking n'existent plus", async () => {
        assert.equal((await s.get("/api/state")).status, 404);
        assert.equal((await s.get("/api/ranking")).status, 404);
    });
});

describe("POST /api/matches/:round/:match/score", () => {
    it("enregistre un set et met à jour les stats", async () => {
        const { json } = await setup(4);
        const m = json.state.matches[0].matches[0];
        const r = await score(1, m.id, 5, 2);
        assert.equal(r.status, 200);
        assert.deepEqual(r.json.state.matches[0].matches[0].set, [{ score1: 5, score2: 2 }]);
        assert.equal(r.json.state.teamsList.find(t => t.teamNumber === m.team1.teamNumber).nbVictory, 1);
    });

    it("400 + message pour un score invalide ; le même état reste utilisable ensuite", async () => {
        const { json } = await setup(4);
        const m = json.state.matches[0].matches[0];
        const r = await score(1, m.id, 5, 5);
        assert.equal(r.status, 400);
        assert.match(r.json.error, /ne peut pas être nul/);
        assert.equal((await score(1, m.id, 5, 0)).status, 200);
    });

    it("400 pour un round ou un match inexistant", async () => {
        await setup(4);
        assert.match((await score(99, 1, 5, 0)).json.error, /Round introuvable/);
        assert.match((await score(1, 99, 5, 0)).json.error, /Match introuvable/);
    });

    it("400 quand le match est déjà gagné", async () => {
        const { json } = await setup(4);
        const m = json.state.matches[0].matches[0];
        await score(1, m.id, 5, 0);
        const r = await score(1, m.id, 5, 0);
        assert.equal(r.status, 400);
        assert.match(r.json.error, /a déjà remporté le match/);
    });

    it("400 si score1/score2 sont absents", async () => {
        const { json } = await setup(4);
        const m = json.state.matches[0].matches[0];
        const r = await score(1, m.id, undefined, undefined);
        assert.equal(r.status, 400);
    });

    it("400 si l'état est absent ou invalide", async () => {
        for (const body of [{ score1: 5, score2: 0 }, { state: {}, score1: 5, score2: 0 }]) {
            const r = await s.post("/api/matches/1/1/score", body);
            assert.equal(r.status, 400);
        }
    });

    it("renvoie currentRound = round du set enregistré, et il survit à un rechargement", async () => {
        const { json } = await setup(4);
        const m = json.state.matches[1].matches[0];
        const r = await score(2, m.id, 5, 0);
        assert.equal(r.json.state.currentRound, 2);
        assert.equal((await s.post("/api/load", { state })).json.state.currentRound, 2);
    });

    it("404 si les identifiants ne sont pas numériques", async () => {
        await setup(4);
        const r = await s.post("/api/matches/a/b/score", { state, score1: 5, score2: 0 });
        assert.equal(r.status, 404);
    });

    it("GET sur cette route n'est pas un enregistrement de score (404 statique)", async () => {
        const r = await s.get("/api/matches/1/1/score");
        assert.equal(r.status, 404);
    });
});

describe("POST /api/load", () => {
    it("un serveur vierge peut reprendre un état exporté et continuer", async () => {
        const { json } = await setup(4, { nbGameSet: 2 });
        const m = json.state.matches[0].matches[0];
        await score(1, m.id, 5, 0);
        const saved = state;

        await s.stop();
        s = await startServer(); // serveur vierge = on « revient sur le site »

        const r = await s.post("/api/load", { state: saved });
        assert.equal(r.status, 200);
        assert.deepEqual(r.json.state, saved);

        state = r.json.state;
        assert.equal((await score(1, m.id, 5, 0)).status, 200);
    });

    it("400 pour un fichier invalide", async () => {
        for (const bad of [undefined, null, {}, { teamsList: [] }, "x"]) {
            const r = await s.post("/api/load", { state: bad });
            assert.equal(r.status, 400, JSON.stringify(bad));
            assert.equal(r.json.success, false);
        }
    });
});

describe("routage général", () => {
    it("POST sur une route inconnue → 404 JSON", async () => {
        const r = await s.post("/api/inconnue", {});
        assert.equal(r.status, 404);
        assert.deepEqual(r.json, { success: false, error: "Route inconnue." });
    });

    it("PUT / DELETE → 404 JSON", async () => {
        for (const method of ["PUT", "DELETE", "PATCH"]) {
            const r = await s.request(method, "/api/state", {});
            assert.equal(r.status, 404, method);
        }
    });

    it("GET /api/inconnue → 404", async () => {
        assert.equal((await s.get("/api/inconnue")).status, 404);
    });

    it("les réponses JSON sont en application/json; charset=utf-8", async () => {
        const r = await s.post("/api/teams", { teams: sampleTeams(3) });
        assert.match(r.headers.get("content-type"), /^application\/json; charset=utf-8/);
    });

    it("un tournoi complet de bout en bout via l'API", async () => {
        const { json } = await setup(4, { nbGameSet: 2 });
        for (const round of json.state.matches) {
            for (const m of round.matches) {
                const t1Wins = m.team1.teamNumber < m.team2.teamNumber;
                for (let i = 0; i < 2; i++) {
                    const r = await score(round.id, m.id, t1Wins ? 5 : 0, t1Wins ? 0 : 5);
                    assert.equal(r.status, 200);
                }
            }
        }
        const ranking = (await s.post("/api/ranking", { state })).json.ranking;
        assert.deepEqual(ranking.map(t => t.name), ["A", "B", "C", "D"]);
        assert.deepEqual(ranking.map(t => t.nbVictory), [3, 2, 1, 0]);
        assert.deepEqual(ranking.map(t => t.nbSetWon), [6, 4, 2, 0]);
    });

    it("le serveur ne garde aucun état : il n'y a plus de tournoi partagé entre clients", async () => {
        await setup(3);
        const r = await s.post("/api/ranking", {}); // un autre client, sans état
        assert.equal(r.status, 400);
    });

    it("le serveur ne garde aucun état : il n'y a plus de tournoi partagé entre clients", async () => {
        await setup(3);
        const r = await s.post("/api/ranking", {}); // un autre client, sans état
        assert.equal(r.status, 400);
    });
});
