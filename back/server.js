//
// Clément Augustinowick
//

import http from "http";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Tournament } from "./tournament.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");

const tournament = new Tournament();

const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml"
};

async function readBody(req) {
    // Vercel
    if (req.body !== undefined) {
        if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
        return req.body ?? {};
    }

    // local
    let body = "";
    for await (const chunk of req) body += chunk;
    return body ? JSON.parse(body) : {};
}

function sendJson(res, status, data) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data));
}

async function serveStatic(req, res) {
    let requested;
    try {
        requested = decodeURIComponent(req.url.split("?")[0]);
    } catch {
        res.writeHead(400);
        return res.end("Bad request");
    }

    if (requested === "/") requested = "/index.html";

    const filePath = path.normalize(path.join(publicDir, requested));

    if (!filePath.startsWith(publicDir + path.sep)) {
        res.writeHead(403);
        return res.end("Forbidden");
    }

    try {
        const data = await fs.readFile(filePath);
        const ext = path.extname(filePath);
        
        res.writeHead(200, {
            "Content-Type": mimeTypes[ext] || "application/octet-stream"
        });
        
        res.end(data);
    } catch {
        res.writeHead(404);
        res.end("Not found");
    }
}

function buildTournament(state) {
    const tournament = new Tournament();
    tournament.loadState(state);
    return tournament;
}

async function handler(req, res) {
    try {
        const url = req.url.split("?")[0];

        // if (req.url === "/api/save" && req.method === "POST") {
        //     const body = await readBody(req);

        //     const tournament = buildTournament(body.state);
        //     tournament.saving = !!body.save;

        //     return sendJson(res, 200, { success: true });
        // }

        if (url === "/api/teams" && req.method === "POST") {
            const body = await readBody(req);
            const tournament = new Tournament();
            tournament.setTeams(body.teams);
            return sendJson(res, 200, { success: true, state: tournament.getState() });
        }

        if (url === "/api/load" && req.method === "POST") {
            const body = await readBody(req);
            const tournament = buildTournament(body.state);
            return sendJson(res, 200, { success: true, state: tournament.getState() });
        }

        if (url === "/api/tournament" && req.method === "POST") {
            const body = await readBody(req);
            const tournament = new Tournament();
            tournament.setTeams(body.teams);
            tournament.configure(body);
            return sendJson(res, 200, { success: true, state: tournament.getState() });
        }

        const scoreMatch = url.match(/^\/api\/matches\/(\d+)\/(\d+)\/score$/);
        if (scoreMatch && req.method === "POST") {
            const [, roundId, matchId] = scoreMatch;
            const body = await readBody(req);
            const tournament = buildTournament(body.state);
            tournament.addSet(roundId, matchId, body.score1, body.score2);
            return sendJson(res, 200, { success: true, state: tournament.getState() });
        }

        if (url === "/api/ranking" && req.method === "POST") {
            const body = await readBody(req);
            const tournament = buildTournament(body.state);
            return sendJson(res, 200, { success: true, ranking: tournament.getRanking() });
        }

        // local
        if (req.method === "GET") {
            return await serveStatic(req, res);
        }

        return sendJson(res, 404, { success: false, error: "Route inconnue." });

    } catch (error) {
        console.error(error);
        return sendJson(res, 400, { success: false, error: error.message });
    }
}

export default handler;

// local
if (!process.env.VERCEL) {
    const port = Number(process.env.PORT) || 3000;

    http.createServer(handler).listen(port, () => {
        console.log(`Gestionnaire de tournois : http://localhost:${port}`);
    });
}
