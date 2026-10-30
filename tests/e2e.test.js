// Tests de bout en bout : un vrai navigateur (Chromium via Playwright) pilote index.html + script.js
// contre un vrai serveur. Si Playwright ou Chromium n'est pas installé, ces tests sont ignorés :
//     npm install -D playwright && npx playwright install chromium

import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { Tournament } from "../back/tournament.js";
import { defaultConfig, sampleTeams, startServer } from "./helpers/fixture.js";

let browser = null;
let skipReason = false;
try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch();
} catch (e) {
    skipReason = `Playwright/Chromium indisponible (${String(e.message).split("\n")[0]})`;
}
after(async () => { await browser?.close(); });

let server, context, page, dialogs, pageErrors;

beforeEach(async () => {
    if (!browser) return;
    server = await startServer();
    context = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: "fr-FR" });
    page = await context.newPage();
    dialogs = [];
    pageErrors = [];
    page.on("dialog", d => { dialogs.push(d.message()); d.dismiss(); });
    page.on("pageerror", e => pageErrors.push(e.message));
    await page.goto(server.baseUrl);
});

afterEach(async () => {
    if (!browser) return;
    await context.close();
    await server.stop();
});

const opts = { skip: skipReason };

async function poll(fn, message = "condition non atteinte", timeout = 5000) {
    const start = Date.now();
    let last;
    while (Date.now() - start < timeout) {
        try { last = await fn(); if (last) return last; } catch { /* réessaye */ }
        await new Promise(r => setTimeout(r, 25));
    }
    assert.fail(message);
}

const text = sel => page.locator(sel).textContent();
const visible = sel => page.locator(sel).isVisible();
const waitText = (sel, expected) =>
    poll(async () => (await text(sel)).trim() === String(expected), `${sel} devrait valoir "${expected}"`);
const waitDialog = () => poll(() => dialogs.length > 0, "aucune alerte affichée");

async function startNew(save = false) {
    await page.click("#new_tournament");
    await page.click(`#div_overlayAskingSave .btn:has-text("${save ? "Oui" : "Non"}")`);
}

async function addTeams(names) {
    for (const name of names) {
        await page.fill("#input_teamName", name);
        await page.click("#btn_addTeam");
    }
}

async function configure({ type = "RoundRobin", nbGameSet = 2, nbSetPoint = 5, pointSpread = 2 } = {}) {
    await page.click("#btn_teamsValidation");
    await page.selectOption("#select_tournamentType", type);
    await page.fill("#input_nbGameSet", String(nbGameSet));
    await page.fill("#input_nbSetPoint", String(nbSetPoint));
    await page.fill("#input_pointSpread", String(pointSpread));
    await page.click("#btn_TournamentTypeValidation");
}

async function playScreen(names = ["A", "B", "C", "D"], config = {}, save = false) {
    await startNew(save);
    await addTeams(names);
    await configure(config);
    await page.locator("#div_PLAY").waitFor({ state: "visible" });
}

async function openMatch(index = 0) {
    const btn = page.locator(".div_round:not(.hidden) .btn_roundMatche").nth(index);
    const label = await btn.textContent();
    await btn.click();
    await page.locator("#overlayInputResult").waitFor({ state: "visible" });
    return label;
}

async function enterSet(s1, s2) {
    await page.fill("#inputTeam1", String(s1));
    await page.fill("#inputTeam2", String(s2));
    await page.click("#btn_validSetResult");
}

const stat = (team, kind) => text(`[id="${team}${kind}"]`);

/* ================================================================================================ */

describe("E2E - écran d'accueil", opts, () => {
    it("affiche uniquement l'écran de création", async () => {
        assert.equal(await visible("#creation"), true);
        assert.equal(await visible("#form_addTeams"), false);
        assert.equal(await visible("#form_selectTournamentSpec"), false);
        assert.equal(await visible("#div_PLAY"), false);
        assert.equal(await visible("#overlayAskingSave"), false);
    });

    it("« Nouveau tournois » ouvre la fenêtre de sauvegarde, ✖ la ferme", async () => {
        await page.click("#new_tournament");
        assert.equal(await visible("#overlayAskingSave"), true);
        await page.click("#overlayAskingSave .btn_closeOverlay");
        assert.equal(await visible("#overlayAskingSave"), false);
        assert.equal(await visible("#creation"), true);
    });

    it("« Non » : passe à l'ajout d'équipes et envoie save=false", async () => {
        await page.click("#new_tournament");
        const req = page.waitForRequest("**/api/save");
        await page.click('#div_overlayAskingSave .btn:has-text("Non")');
        assert.deepEqual((await req).postDataJSON(), { save: false });
        await page.locator("#form_addTeams").waitFor({ state: "visible" });
        assert.equal(await visible("#creation"), false);
        assert.equal(await visible("#overlayAskingSave"), false);
    });

    it("« Oui » : envoie save=true", async () => {
        await page.click("#new_tournament");
        const req = page.waitForRequest("**/api/save");
        await page.click('#div_overlayAskingSave .btn:has-text("Oui")');
        assert.deepEqual((await req).postDataJSON(), { save: true });
    });
});

describe("E2E - ajout des équipes", opts, () => {
    beforeEach(async () => { await startNew(); });

    it("propose « équipe1 » par défaut puis incrémente", async () => {
        assert.equal(await page.inputValue("#input_teamName"), "équipe1");
        await page.click("#btn_addTeam");
        assert.equal(await page.inputValue("#input_teamName"), "équipe2");
        await page.click("#btn_addTeam");
        assert.equal(await page.inputValue("#input_teamName"), "équipe3");
    });

    it("affiche les équipes dans l'ordre d'ajout", async () => {
        await addTeams(["Lions", "Tigres"]);
        assert.deepEqual(await page.locator("#list_teamValidation li span").allTextContents(), ["Lions", "Tigres"]);
    });

    it("le bouton de validation n'est actif qu'à partir de 3 équipes", async () => {
        assert.equal(await page.isDisabled("#btn_teamsValidation"), true);
        await addTeams(["A", "B"]);
        assert.equal(await page.isDisabled("#btn_teamsValidation"), true);
        await addTeams(["C"]);
        assert.equal(await page.isDisabled("#btn_teamsValidation"), false);
    });

    it("supprimer une équipe la retire et réévalue le bouton", async () => {
        await addTeams(["A", "B", "C"]);
        await page.locator("#list_teamValidation li").nth(1).locator(".btn_deleteTeam").click();
        assert.deepEqual(await page.locator("#list_teamValidation li span").allTextContents(), ["A", "C"]);
        assert.equal(await page.isDisabled("#btn_teamsValidation"), true);
    });

    it("ignore un nom vide ou composé d'espaces", async () => {
        await addTeams(["", "    "]);
        assert.equal(await page.locator("#list_teamValidation li").count(), 0);
    });

    it("supprime les espaces autour du nom", async () => {
        await addTeams(["  Lions  "]);
        assert.deepEqual(await page.locator("#list_teamValidation li span").allTextContents(), ["Lions"]);
    });

    it("refuse un nom déjà pris avec une alerte, sans l'ajouter", async () => {
        await addTeams(["Lions"]);
        await addTeams(["Lions"]);
        await waitDialog();
        assert.equal(dialogs[0], "Le nom d'équipe 'Lions' a déjà été choisi !");
        assert.equal(await page.locator("#list_teamValidation li").count(), 1);
        assert.equal(await page.inputValue("#input_teamName"), "équipe2");
    });

    it("affiche les noms comme du texte (pas d'injection HTML)", async () => {
        const evil = '<img src=x onerror="window.__xss=1">';
        await addTeams([evil]);
        assert.deepEqual(await page.locator("#list_teamValidation li span").allTextContents(), [evil]);
        assert.equal(await page.evaluate(() => window.__xss), undefined);
        assert.equal(await page.locator("#list_teamValidation img").count(), 0);
    });

    it("« Valider les équipes » envoie les équipes et affiche le formulaire de spécificités", async () => {
        await addTeams(["A", "B", "C"]);
        const req = page.waitForRequest("**/api/teams");
        await page.click("#btn_teamsValidation");
        assert.deepEqual((await req).postDataJSON().teams.map(t => t.name), ["A", "B", "C"]);
        await page.locator("#form_selectTournamentSpec").waitFor({ state: "visible" });
        assert.equal(await visible("#form_addTeams"), false);
    });
});

describe("E2E - choix du type de tournoi", opts, () => {
    beforeEach(async () => {
        await startNew();
        await addTeams(["A", "B", "C"]);
        await page.click("#btn_teamsValidation");
        await page.locator("#form_selectTournamentSpec").waitFor({ state: "visible" });
    });

    const descriptions = {
        RoundRobin: /rencontre toutes les autres/,
        NombreDeParties: /nombre défini de parties/,
        SimpleKO: /élimination directe/,
        DoubleKO: /second tableau/,
        TournoisSuisse: /en fonction des performances/,
        TournoisPoule: /différents groupes/,
        TournoisPouleTableau: /groupes puis placées/
    };

    it("affiche la description de chaque type de tournoi", async () => {
        for (const [type, regex] of Object.entries(descriptions)) {
            await page.selectOption("#select_tournamentType", type);
            assert.match(await text("#tournamentDescription"), regex, type);
        }
    });

    it("la description initiale correspond au Round Robin", async () => {
        assert.match(await text("#tournamentDescription"), descriptions.RoundRobin);
    });

    it("le champ « nombre de matchs » n'apparaît que pour NombreDeParties et TournoisSuisse", async () => {
        for (const type of Object.keys(descriptions)) {
            await page.selectOption("#select_tournamentType", type);
            const expected = type === "NombreDeParties" || type === "TournoisSuisse";
            assert.equal(await visible("#div_selectNbGame"), expected, type);
        }
    });

    it("un type non implémenté affiche l'erreur du serveur et reste sur le formulaire", async () => {
        await page.selectOption("#select_tournamentType", "SimpleKO");
        await page.click("#btn_TournamentTypeValidation");
        await waitDialog();
        assert.match(dialogs[0], /n'a pas été implémenté/);
        assert.equal(await visible("#form_selectTournamentSpec"), true);
        assert.equal(await visible("#div_PLAY"), false);
    });

    it("des paramètres à 0 affichent l'erreur du serveur", async () => {
        await page.fill("#input_nbSetPoint", "0");
        await page.click("#btn_TournamentTypeValidation");
        await waitDialog();
        assert.match(dialogs[0], /supérieurs à 0/);
    });

    it("envoie les valeurs saisies au serveur", async () => {
        await page.fill("#input_nbGameSet", "3");
        await page.fill("#input_nbSetPoint", "21");
        await page.fill("#input_pointSpread", "2");
        const req = page.waitForRequest("**/api/tournament");
        await page.click("#btn_TournamentTypeValidation");
        const body = (await req).postDataJSON();
        assert.equal(body.tournamentType, "RoundRobin");
        assert.equal(body.nbGameSet, 3);
        assert.equal(body.nbSetPoint, 21);
        assert.equal(body.pointSpread, 2);
    });

    it("un champ numérique vide est refusé avec un message d'erreur", async () => {
        await page.fill("#input_nbSetPoint", "");
        await page.click("#btn_TournamentTypeValidation");
        await waitDialog();
        assert.match(dialogs[0], /supérieurs à 0/);
        assert.equal(await visible("#div_PLAY"), false);
    });
});

describe("E2E - écran de jeu (Round Robin)", opts, () => {
    it("construit le panneau des scores avec une ligne par équipe", async () => {
        await playScreen(["A", "B", "C", "D"]);
        assert.deepEqual(await page.locator("#div_scorePanel .div_panelTeamName").allTextContents(), ["A", "B", "C", "D"]);
        for (const team of ["A", "B", "C", "D"]) {
            assert.equal((await stat(team, "NbVictory")).trim(), "0");
            assert.equal((await stat(team, "NbSetWon")).trim(), "0");
            assert.equal((await stat(team, "GoalAverage")).trim(), "0");
        }
        assert.equal(await visible("#form_selectTournamentSpec"), false);
    });

    it("n'affiche que le round 1 au départ, avec n/2 matchs (4 équipes)", async () => {
        await playScreen(["A", "B", "C", "D"]);
        assert.equal(await page.locator(".div_round").count(), 3);
        assert.equal(await page.locator(".div_round:not(.hidden)").count(), 1);
        assert.equal(await text(".div_round:not(.hidden) h3"), "Round 1");
        assert.equal(await page.locator(".div_round:not(.hidden) .btn_roundMatche").count(), 2);
    });

    it("tous les matchs sont proposés au format « X VS Y »", async () => {
        await playScreen(["A", "B", "C", "D"]);
        const labels = await page.locator(".btn_roundMatche").allTextContents();
        assert.equal(labels.length, 6);
        assert.ok(labels.every(l => /^[A-D] VS [A-D]$/.test(l)));
    });

    it("la navigation entre rounds avance, recule et s'arrête aux bornes", async () => {
        await playScreen(["A", "B", "C", "D"]);
        const current = () => text(".div_round:not(.hidden) h3");

        await page.click('button:has-text("<")'); // déjà au round 1
        assert.equal(await current(), "Round 1");

        await page.click('.btn_navigation:has-text(">")');
        assert.equal(await current(), "Round 2");
        await page.click('.btn_navigation:has-text(">")');
        assert.equal(await current(), "Round 3");
        await page.click('.btn_navigation:has-text(">")'); // dernier round
        assert.equal(await current(), "Round 3");
        assert.equal(await page.locator(".div_round:not(.hidden)").count(), 1);

        await page.click('.btn_navigation:has-text("<")');
        assert.equal(await current(), "Round 2");
    });

    it("3 équipes : 3 rounds d'un seul match (une équipe exempte à chaque round)", async () => {
        await playScreen(["A", "B", "C"]);
        assert.equal(await page.locator(".div_round").count(), 3);
        assert.equal(await page.locator(".btn_roundMatche").count(), 3);
    });

    it("sauvegarde : avec « Oui », un fichier apparaît dans le dossier de téléchargement", async () => {
        await playScreen(["A", "B", "C"], {}, true);
        await poll(async () => (await readdir(server.downloads).catch(() => [])).length === 1, "fichier de sauvegarde absent");
    });

    it("sauvegarde : avec « Non », rien n'est écrit", async () => {
        await playScreen(["A", "B", "C"], {}, false);
        await page.waitForTimeout(300);
        assert.deepEqual(await readdir(server.downloads).catch(() => []), []);
    });
});

describe("E2E - saisie des résultats", opts, () => {
    beforeEach(async () => { await playScreen(["A", "B", "C", "D"], { nbGameSet: 2, nbSetPoint: 5, pointSpread: 2 }); });

    it("ouvre la fenêtre du match avec le bon titre et « Set 1 : »", async () => {
        const label = await openMatch(0);
        assert.equal(await text("#overlayMatchTitle"), label);
        assert.equal((await text("#p_inputSetResult")).trim(), "Set 1 :");
        assert.equal(await text("#p_nbSetTeam1"), "0");
        assert.equal(await text("#p_nbSetTeam2"), "0");
        assert.equal(await page.locator("#div_overlayContentResult > div").count(), 0);
    });

    it("la croix ferme la fenêtre", async () => {
        await openMatch(0);
        await page.click("#overlayInputResult .btn_closeOverlay");
        assert.equal(await visible("#overlayInputResult"), false);
    });

    it("un set valide met à jour la fenêtre et le panneau des scores", async () => {
        const label = await openMatch(0);
        const [team1, team2] = label.split(" VS ");
        await enterSet(5, 2);

        await waitText("#p_nbSetTeam1", 1);
        assert.equal(await text("#p_nbSetTeam2"), "0");
        assert.equal((await text("#p_inputSetResult")).trim(), "Set 2 :");
        assert.deepEqual(await page.locator("#div_overlayContentResult .div_resultText p").allTextContents(), ["5", "-", "2"]);

        await poll(async () => (await stat(team1, "NbSetWon")).trim() === "1", "nbSetWon non mis à jour");
        assert.equal((await stat(team2, "NbSetWon")).trim(), "0");
        assert.equal((await stat(team1, "NbVictory")).trim(), "0"); // 2 sets gagnants nécessaires
    });

    it("remet les champs de saisie à 0 après un set validé", async () => {
        await openMatch(0);
        await enterSet(5, 2);
        await waitText("#p_nbSetTeam1", 1);
        assert.equal(await page.inputValue("#inputTeam1"), "0");
        assert.equal(await page.inputValue("#inputTeam2"), "0");
    });

    it("deux sets gagnés = une victoire dans le panneau", async () => {
        const [team1] = (await openMatch(0)).split(" VS ");
        await enterSet(5, 0);
        await waitText("#p_nbSetTeam1", 1);
        await enterSet(5, 1);
        await waitText("#p_nbSetTeam1", 2);
        await poll(async () => (await stat(team1, "NbVictory")).trim() === "1", "victoire non comptée");
        assert.equal((await stat(team1, "NbSetWon")).trim(), "2");
    });

    it("un set de plus après la victoire affiche l'alerte du serveur", async () => {
        const [team1] = (await openMatch(0)).split(" VS ");
        await enterSet(5, 0);
        await waitText("#p_nbSetTeam1", 1);
        await enterSet(5, 0);
        await waitText("#p_nbSetTeam1", 2);
        await enterSet(5, 0);
        await waitDialog();
        assert.equal(dialogs[0], `L'équipe ${team1} a déjà remporté le match.`);
    });

    it("égalité, score trop bas ou écart insuffisant : alerte et aucun set enregistré", async () => {
        await openMatch(0);
        const cases = [[3, 3, /ne peut pas être nul/], [2, 1, /nombre de points requis/], [5, 4, /2 point\(s\) d'écart/]];
        for (const [i, [a, b, re]] of cases.entries()) {
            await enterSet(a, b);
            await poll(() => dialogs.length === i + 1, "alerte attendue");
            assert.match(dialogs[i], re);
        }
        assert.equal(await page.locator("#div_overlayContentResult > div").count(), 0);
        assert.equal((await text("#p_inputSetResult")).trim(), "Set 1 :");
    });

    it("un champ de score vide est traité comme 0 (0-0 refusé comme set nul)", async () => {
        await openMatch(0);
        await page.fill("#inputTeam1", "");
        await page.click("#btn_validSetResult");
        await waitDialog();
        assert.match(dialogs[0], /ne peut pas être nul/);
        assert.equal(await page.locator("#div_overlayContentResult > div").count(), 0);
    });

    it("fermer puis rouvrir le match affiche les sets déjà joués", async () => {
        await openMatch(0);
        await enterSet(5, 2);
        await waitText("#p_nbSetTeam1", 1);
        await page.click("#overlayInputResult .btn_closeOverlay");
        assert.equal(await page.locator("#div_overlayContentResult > div").count(), 0);

        await openMatch(0);
        assert.equal(await text("#p_nbSetTeam1"), "1");
        assert.equal((await text("#p_inputSetResult")).trim(), "Set 2 :");
        assert.deepEqual(await page.locator("#div_overlayContentResult .div_resultText p").allTextContents(), ["5", "-", "2"]);
    });

    it("fermer la fenêtre remet les champs de saisie à 0", async () => {
        await openMatch(0);
        await page.fill("#inputTeam1", "9");
        await page.fill("#inputTeam2", "7");
        await page.click("#overlayInputResult .btn_closeOverlay");
        assert.equal(await page.inputValue("#inputTeam1"), "0");
        assert.equal(await page.inputValue("#inputTeam2"), "0");
    });
});

describe("E2E - classement", opts, () => {
    beforeEach(async () => { await playScreen(["A", "B", "C", "D"], { nbGameSet: 1, nbSetPoint: 5, pointSpread: 2 }); });

    const rows = () => page.locator("#div_rankList .overlayRankContent").evaluateAll(els =>
        els.map(e => { const p = e.querySelectorAll("p"); return [p[0].textContent, p[1].textContent]; })
    );

    it("au départ, toutes les équipes sont ex æquo et classées 1", async () => {
        await page.click("#btn_calculRank");
        await page.locator("#overlayRank").waitFor({ state: "visible" });
        const r = await rows();
        assert.equal(r.length, 4);
        assert.ok(r.every(([rank]) => rank === "1"));
    });

    it("l'équipe gagnante passe première", async () => {
        const [team1] = (await openMatch(0)).split(" VS ");
        await enterSet(5, 0);
        await waitText("#p_nbSetTeam1", 1);
        await page.click("#overlayInputResult .btn_closeOverlay");

        await page.click("#btn_calculRank");
        await page.locator("#overlayRank").waitFor({ state: "visible" });
        const r = await rows();
        assert.deepEqual(r[0], ["1", team1]);
        assert.equal(r.length, 4);
        assert.ok(r.slice(1).every(([rank]) => Number(rank) >= 2));
    });

    it("la croix ferme et vide le classement ; il peut être rouvert", async () => {
        await page.click("#btn_calculRank");
        await page.locator("#overlayRank").waitFor({ state: "visible" });
        await page.click("#overlayRank .btn_closeOverlay");
        assert.equal(await visible("#overlayRank"), false);
        assert.equal(await page.locator("#div_rankList .overlayRankContent").count(), 0);

        await page.click("#btn_calculRank");
        await page.locator("#overlayRank").waitFor({ state: "visible" });
        assert.equal(await page.locator("#div_rankList .overlayRankContent").count(), 4);
    });
});

describe("E2E - reprise d'un tournoi existant", opts, () => {
    function buildState({ played = true } = {}) {
        const t = new Tournament();
        t.setTeams(sampleTeams(4));
        t.configure({ ...defaultConfig, nbGameSet: 2 });
        const m = t.matches[0].matches[0];
        if (played) t.addSet(1, m.id, 5, 0);
        return { state: t.getState(), firstMatch: m };
    }

    const upload = (content, name = "tournois.json") =>
        page.setInputFiles("#input_loadTournament", {
            name, mimeType: "application/json", buffer: Buffer.from(typeof content === "string" ? content : JSON.stringify(content))
        });

    it("« Tournois existant » ouvre le sélecteur de fichier", async () => {
        const chooser = page.waitForEvent("filechooser");
        await page.click("#old_tournament");
        const fc = await chooser;
        assert.equal(fc.isMultiple(), false);
    });

    it("charge un fichier valide et affiche directement l'écran de jeu", async () => {
        const { state, firstMatch } = buildState();
        await upload(state);
        await page.locator("#div_PLAY").waitFor({ state: "visible" });
        assert.equal(await visible("#creation"), false);
        assert.deepEqual(await page.locator("#div_scorePanel .div_panelTeamName").allTextContents(), ["A", "B", "C", "D"]);
        assert.equal((await stat(firstMatch.team1.name, "NbSetWon")).trim(), "1");
    });

    it("les sets déjà joués sont visibles dans la fenêtre du match", async () => {
        const { state } = buildState();
        await upload(state);
        await page.locator("#div_PLAY").waitFor({ state: "visible" });
        await openMatch(0);
        assert.equal(await text("#p_nbSetTeam1"), "1");
        assert.equal((await text("#p_inputSetResult")).trim(), "Set 2 :");
    });

    it("on peut continuer à jouer après le chargement", async () => {
        const { state, firstMatch } = buildState();
        await upload(state);
        await page.locator("#div_PLAY").waitFor({ state: "visible" });
        await openMatch(0);
        await enterSet(5, 0);
        await poll(async () => (await stat(firstMatch.team1.name, "NbVictory")).trim() === "1", "victoire non comptée");
    });

    it("la sauvegarde automatique est activée après un chargement", async () => {
        const { state } = buildState();
        await upload(state);
        await page.locator("#div_PLAY").waitFor({ state: "visible" });
        await openMatch(0);
        await enterSet(5, 0);
        await poll(async () => (await readdir(server.downloads).catch(() => [])).length === 1, "pas de sauvegarde");
    });

    for (const [label, content] of [
        ["un fichier qui n'est pas du JSON", "ceci n'est pas du json"],
        ["un JSON vide", "{}"],
        ["un JSON sans équipes valides", { teamsList: [], tournamentInfos: {}, matches: [] }],
        ["un type de tournoi inconnu", (() => { const s = buildState().state; s.tournamentInfos.tournamentType = "???"; return s; })()]
    ]) {
        it(`affiche une erreur pour ${label} et reste sur l'accueil`, async () => {
            await upload(content);
            await waitDialog();
            assert.match(dialogs[0], /Impossible de charger ce fichier/);
            assert.equal(await visible("#creation"), true);
            assert.equal(await visible("#div_PLAY"), false);
        });
    }

    it("annuler la sélection (aucun fichier) ne fait rien", async () => {
        await page.setInputFiles("#input_loadTournament", []);
        await page.waitForTimeout(200);
        assert.deepEqual(dialogs, []);
        assert.equal(await visible("#creation"), true);
    });

    it("le même fichier peut être rechargé après une erreur (input réinitialisé)", async () => {
        await upload("pas du json");
        await waitDialog();
        await upload(buildState().state);
        await page.locator("#div_PLAY").waitFor({ state: "visible" });
    });
});
