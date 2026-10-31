// Tests d'intégration de back/server.js : un vrai serveur est lancé (port libre, dossier maison
// temporaire) et interrogé en HTTP. Les tests `todo` décrivent un comportement attendu que le
// code actuel ne respecte pas encore (voir tests/Tournament.test.js pour la convention).

import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { defaultConfig, sampleTeams, startServer } from "./helpers/fixture.js";

let s;
beforeEach(async () => { s = await startServer(); });
afterEach(async () => { await s.stop(); });

const exists = p => access(p).then(() => true, () => false);

async function setup(nbTeams = 4, config = {}) {
    await s.post("/api/teams", { teams: sampleTeams(nbTeams) });
    return s.post("/api/tournament", { ...defaultConfig, ...config });
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
});

describe("GET /api/state et /api/ranking", () => {
    it("/api/state renvoie l'état courant", async () => {
        await setup(3);
        const r = await s.get("/api/state");
        assert.equal(r.status, 200);
        assert.equal(r.json.state.teamsList.length, 3);
        assert.equal(r.json.state.matches.length, 3);
    });

    it("/api/state sur un serveur vierge renvoie un état vide", async () => {
        const r = await s.get("/api/state");
        assert.equal(r.status, 200);
        assert.deepEqual(r.json.state.teamsList, []);
    });

    it("/api/ranking renvoie le classement trié", async () => {
        await setup(3);
        const r = await s.get("/api/ranking");
        assert.equal(r.status, 200);
        assert.equal(r.json.ranking.length, 3);
    });

    it("/api/ranking reflète les victoires", async () => {
        await setup(3);
        const { state } = (await s.get("/api/state")).json;
        const m = state.matches[0].matches[0];
        await s.post(`/api/matches/1/${m.id}/score`, { score1: 5, score2: 0 });
        const ranking = (await s.get("/api/ranking")).json.ranking;
        assert.equal(ranking[0].name, m.team1.name);
        assert.equal(ranking[0].nbVictory, 1);
    });
});

describe("POST /api/matches/:round/:match/score", () => {
    it("enregistre un set et met à jour les stats", async () => {
        const { json } = await setup(4);
        const m = json.state.matches[0].matches[0];
        const r = await s.post(`/api/matches/1/${m.id}/score`, { score1: 5, score2: 2 });
        assert.equal(r.status, 200);
        const updated = r.json.state.matches[0].matches[0];
        assert.deepEqual(updated.set, [{ score1: 5, score2: 2 }]);
        assert.equal(r.json.state.teamsList.find(t => t.teamNumber === m.team1.teamNumber).nbVictory, 1);
    });

    it("400 + message pour un score invalide, sans modifier l'état", async () => {
        const { json } = await setup(4);
        const m = json.state.matches[0].matches[0];
        const r = await s.post(`/api/matches/1/${m.id}/score`, { score1: 5, score2: 5 });
        assert.equal(r.status, 400);
        assert.match(r.json.error, /ne peut pas être nul/);
        assert.deepEqual((await s.get("/api/state")).json.state.matches[0].matches[0].set, []);
    });

    it("400 pour un round ou un match inexistant", async () => {
        await setup(4);
        assert.match((await s.post("/api/matches/99/1/score", { score1: 5, score2: 0 })).json.error, /Round introuvable/);
        assert.match((await s.post("/api/matches/1/99/score", { score1: 5, score2: 0 })).json.error, /Match introuvable/);
    });

    it("400 quand le match est déjà gagné", async () => {
        const { json } = await setup(4);
        const m = json.state.matches[0].matches[0];
        await s.post(`/api/matches/1/${m.id}/score`, { score1: 5, score2: 0 });
        const r = await s.post(`/api/matches/1/${m.id}/score`, { score1: 5, score2: 0 });
        assert.equal(r.status, 400);
        assert.match(r.json.error, /a déjà remporté le match/);
    });

    it("400 si score1/score2 sont absents", async () => {
        const { json } = await setup(4);
        const m = json.state.matches[0].matches[0];
        const r = await s.post(`/api/matches/1/${m.id}/score`, {});
        assert.equal(r.status, 400);
    });

    it("renvoie currentRound = round du set enregistré, et le conserve", async () => {
        const { json } = await setup(4);
        const m = json.state.matches[1].matches[0];
        const r = await s.post(`/api/matches/2/${m.id}/score`, { score1: 5, score2: 0 });
        assert.equal(r.json.state.currentRound, 2);
        assert.equal((await s.get("/api/state")).json.state.currentRound, 2);
    });

    it("le round sauvegardé est celui du dernier set (fichier de sauvegarde)", async () => {
        await s.post("/api/save", { save: true });
        const { json } = await setup(4, { nbGameSet: 2 });
        const m = json.state.matches[2].matches[0];
        await s.post(`/api/matches/3/${m.id}/score`, { score1: 5, score2: 0 });
        const file = path.join(s.downloads, (await readdir(s.downloads))[0]);
        assert.equal(JSON.parse(await readFile(file, "utf8")).currentRound, 3);
    });

    it("une requête sur un round inexistant (400) ne doit pas changer le round courant", async () => {
        await setup(4);
        const r = await s.post("/api/matches/99/1/score", { score1: 5, score2: 0 });
        assert.equal(r.status, 400);
        assert.equal((await s.get("/api/state")).json.state.currentRound, 1);
    });

    it("404 si les identifiants ne sont pas numériques", async () => {
        await setup(4);
        const r = await s.post("/api/matches/a/b/score", { score1: 5, score2: 0 });
        assert.equal(r.status, 404);
    });

    it("GET sur cette route n'est pas un enregistrement de score (404 statique)", async () => {
        await setup(4);
        const r = await s.get("/api/matches/1/1/score");
        assert.equal(r.status, 404);
    });
});

describe("POST /api/load", () => {
    it("recharge un état exporté et le rend disponible", async () => {
        const { json } = await setup(4, { nbGameSet: 2 });
        const m = json.state.matches[0].matches[0];
        await s.post(`/api/matches/1/${m.id}/score`, { score1: 5, score2: 0 });
        const saved = (await s.get("/api/state")).json.state;

        await s.stop();
        s = await startServer(); // serveur vierge = on « revient sur le site »
        assert.deepEqual((await s.get("/api/state")).json.state.teamsList, []);

        const r = await s.post("/api/load", { state: saved });
        assert.equal(r.status, 200);
        assert.deepEqual(r.json.state, saved);
        assert.deepEqual((await s.get("/api/state")).json.state, saved);
    });

    it("400 pour un fichier invalide", async () => {
        for (const state of [undefined, null, {}, { teamsList: [] }, "x"]) {
            const r = await s.post("/api/load", { state });
            assert.equal(r.status, 400, JSON.stringify(state));
            assert.equal(r.json.success, false);
        }
    });

    it("après un chargement, la sauvegarde automatique est active", async () => {
        const { json } = await setup(4, { nbGameSet: 2 });
        const m = json.state.matches[0].matches[0];
        const saved = (await s.get("/api/state")).json.state;

        await s.stop();
        s = await startServer();
        await s.post("/api/load", { state: saved });
        await s.post(`/api/matches/1/${m.id}/score`, { score1: 5, score2: 0 }, { "Accept-Language": "fr" });
        assert.equal((await readdir(s.downloads)).length, 1);
    });
});

describe("sauvegarde automatique (POST /api/save)", () => {
    const files = async () => ((await exists(s.downloads)) ? readdir(s.downloads) : []);

    it("save=false : aucun fichier n'est écrit", async () => {
        await s.post("/api/save", { save: false });
        const { json } = await setup(3);
        await s.post(`/api/matches/1/${json.state.matches[0].matches[0].id}/score`, { score1: 5, score2: 0 });
        assert.deepEqual(await files(), []);
    });

    it("sans appel à /api/save : aucun fichier non plus (défaut = non)", async () => {
        await setup(3);
        assert.deepEqual(await files(), []);
    });

    it("save=true : un fichier est écrit à la configuration, puis mis à jour à chaque set", async () => {
        await s.post("/api/save", { save: true });
        const { json } = await setup(4, { nbGameSet: 2 });
        const m = json.state.matches[0].matches[0];

        let list = await files();
        assert.equal(list.length, 1);
        const file = path.join(s.downloads, list[0]);
        assert.equal(JSON.parse(await readFile(file, "utf8")).matches[0].matches[0].set.length, 0);

        await s.post(`/api/matches/1/${m.id}/score`, { score1: 5, score2: 0 });
        list = await files();
        assert.equal(list.length, 1, "le même fichier doit être réécrit");
        assert.equal(JSON.parse(await readFile(file, "utf8")).matches[0].matches[0].set.length, 1);
    });

    it("le contenu sauvegardé est rechargeable via /api/load", async () => {
        await s.post("/api/save", { save: true });
        await setup(4);
        const file = path.join(s.downloads, (await files())[0]);
        const content = JSON.parse(await readFile(file, "utf8"));
        const r = await s.post("/api/load", { state: content });
        assert.equal(r.status, 200);
    });

    it("le nom du fichier suit la langue du navigateur (Accept-Language)", async () => {
        await s.post("/api/save", { save: true });
        await s.post("/api/teams", { teams: sampleTeams(3) });
        await s.post("/api/tournament", defaultConfig, { "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8" });
        assert.match((await files())[0], /^tournois-\d{2}-\d{2}-\d{4}\.json$/);
    });

    it("langue non française : préfixe 'tournament'", async () => {
        await s.post("/api/save", { save: true });
        await s.post("/api/teams", { teams: sampleTeams(3) });
        await s.post("/api/tournament", defaultConfig, { "Accept-Language": "en-US,en;q=0.9" });
        assert.match((await files())[0], /^tournament-\d{2}-\d{2}-\d{4}\.json$/);
    });

    it("sans en-tête Accept-Language : préfixe 'tournament'", async () => {
        await s.post("/api/save", { save: true });
        await s.post("/api/teams", { teams: sampleTeams(3) });
        await s.post("/api/tournament", defaultConfig, { "Accept-Language": "" });
        assert.match((await files())[0], /^tournament-/);
    });

    it("valeurs truthy/falsy sont converties (!!body.save)", async () => {
        await s.post("/api/save", { save: 1 });
        await setup(3);
        assert.equal((await files()).length, 1);
    });

    it("renvoie success: true", async () => {
        const r = await s.post("/api/save", { save: true });
        assert.equal(r.status, 200);
        assert.deepEqual(r.json, { success: true });
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
        const r = await s.get("/api/state");
        assert.match(r.headers.get("content-type"), /^application\/json; charset=utf-8/);
    });

    it("un tournoi complet de bout en bout via l'API", async () => {
        await s.post("/api/save", { save: false });
        const { json } = await setup(4, { nbGameSet: 2 });
        for (const round of json.state.matches) {
            for (const m of round.matches) {
                const t1Wins = m.team1.teamNumber < m.team2.teamNumber;
                for (let i = 0; i < 2; i++) {
                    const r = await s.post(`/api/matches/${round.id}/${m.id}/score`, {
                        score1: t1Wins ? 5 : 0,
                        score2: t1Wins ? 0 : 5
                    });
                    assert.equal(r.status, 200);
                }
            }
        }
        const ranking = (await s.get("/api/ranking")).json.ranking;
        assert.deepEqual(ranking.map(t => t.name), ["A", "B", "C", "D"]);
        assert.deepEqual(ranking.map(t => t.nbVictory), [3, 2, 1, 0]);
        assert.deepEqual(ranking.map(t => t.nbSetWon), [6, 4, 2, 0]);
    });

    it("limite connue : l'état est global au serveur (partagé entre tous les clients)", async () => {
        await setup(3);
        // un « autre client » voit immédiatement le même tournoi
        assert.equal((await s.get("/api/state")).json.state.teamsList.length, 3);
    });
});
