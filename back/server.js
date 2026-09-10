//
// Clément Augustinowick
//

import http from "http";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Tournament } from "./Tournament.js";

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
    let body = "";
    for await (const chunk of req) body += chunk;
    return body ? JSON.parse(body) : {};
}

function sendJson(res, status, data) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data));
}

async function serveStatic(req, res) {
    let requested = req.url === "/" ? "/index.html" : req.url;
    requested = decodeURIComponent(requested.split("?")[0]);

    const filePath = path.normalize(path.join(publicDir, requested));

    if (!filePath.startsWith(publicDir)) {
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

const server = http.createServer(async (req, res) => {
    try {
        if (req.url === "/api/teams" && req.method === "POST") {
            const body = await readBody(req);
            tournament.setTeams(body.teams);
            const file = await tournament.save();
            return sendJson(res, 200, {
                success: true,
                state: tournament.getState(),
                file
            });
        }

        if (req.url === "/api/tournament" && req.method === "POST") {
            const body = await readBody(req);
            tournament.configure(body);
            const file = await tournament.save();
            return sendJson(res, 200, {
                success: true,
                state: tournament.getState(),
                file
            });
        }

        const scoreMatch = req.url.match(/^\/api\/matches\/(\d+)\/(\d+)\/score$/);
        if (scoreMatch && req.method === "POST") {
            const [, roundId, matchId] = scoreMatch;
            const body = await readBody(req);

            tournament.addSet(
                roundId,
                matchId,
                body.score1,
                body.score2
            );

            const file = await tournament.save();
            return sendJson(res, 200, {
                success: true,
                state: tournament.getState(),
                file
            });
        }

        if (req.url === "/api/state" && req.method === "GET") {
            return sendJson(res, 200, {
                success: true,
                state: tournament.getState()
            });
        }

        if (req.url === "/api/ranking" && req.method === "GET") {
            return sendJson(res, 200, {
                success: true,
                ranking: tournament.getRanking()
            });
        }

        if (req.method === "GET") {
            return serveStatic(req, res);
        }

        return sendJson(res, 404, { success: false, error: "Route inconnue." });

    } catch (error) {

        console.error(error);
        return sendJson(res, 400, {
            success: false,
            error: error.message
        });
        
    }
});

server.listen(3000, () => {
    console.log("Gestionnaire de tournois : http://localhost:3000");
});
