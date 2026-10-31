// Utilitaires partagés : lance une vraie instance de back/server.js dans un dossier
// temporaire, sur un port libre, avec un dossier "maison" factice pour que les
// sauvegardes (~/Downloads) n'écrivent jamais dans votre vrai dossier Téléchargements.

import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function sampleTeams(n = 4) {
    return Array.from({ length: n }, (_, i) => ({
        name: String.fromCharCode(65 + i), // A, B, C...
        teamNumber: i + 1
    }));
}

export const defaultConfig = {
    tournamentType: "RoundRobin",
    nbGame: 1,
    nbGameSet: 1,
    nbSetPoint: 5,
    pointSpread: 2
};

function freePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.listen(0, () => {
            const { port } = srv.address();
            srv.close(() => resolve(port));
        });
        srv.on("error", reject);
    });
}

export async function startServer() {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "tournoi-test-"));
    const home = path.join(tmp, "home");
    await mkdir(home, { recursive: true });

    // Même arborescence que le vrai projet (server.js lit ../public).
    await cp(path.join(projectRoot, "back"), path.join(tmp, "back"), { recursive: true });
    await cp(path.join(projectRoot, "public"), path.join(tmp, "public"), { recursive: true });
    await writeFile(path.join(tmp, "package.json"), '{"type":"module"}');

    // Dossier "frère" de public, pour tester l'échappement de répertoire.
    await mkdir(path.join(tmp, "public-evil"));
    await writeFile(path.join(tmp, "public-evil", "secret.txt"), "SECRET");

    // Le port 3000 est codé en dur dans server.js : on le rend configurable
    // dans la COPIE de test uniquement (votre fichier n'est pas modifié).
    const serverPath = path.join(tmp, "back", "server.js");
    let code = await readFile(serverPath, "utf8");
    code = code.replace(
        /server\.listen\(\s*(?:process\.env\.PORT\s*\|\|\s*)?3000/,
        "server.listen(Number(process.env.PORT) || 3000"
    );
    await writeFile(serverPath, code);

    const port = await freePort();
    const child = spawn(process.execPath, [serverPath], {
        env: { ...process.env, PORT: String(port), HOME: home, USERPROFILE: home },
        stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";
    let exited = false;
    child.stderr.on("data", d => (stderr += d));
    child.on("exit", () => (exited = true));

    await new Promise((resolve, reject) => {
        child.stdout.on("data", d => {
            if (String(d).includes("localhost")) resolve();
        });
        child.on("exit", c => reject(new Error(`Serveur arrêté (code ${c}) : ${stderr}`)));
        setTimeout(() => reject(new Error("Le serveur n'a pas démarré à temps")), 8000);
    });

    const baseUrl = `http://127.0.0.1:${port}`;

    async function request(method, url, body, headers = {}) {
        const res = await fetch(baseUrl + url, {
            method,
            headers: { "Content-Type": "application/json", ...headers },
            body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body)
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch { /* pas du JSON */ }
        return { status: res.status, headers: res.headers, text, json };
    }

    // Requête HTTP brute : le chemin n'est PAS normalisé (fetch réécrit "/../").
    function raw(rawPath) {
        return new Promise(resolve => {
            const req = http.request({ host: "127.0.0.1", port, path: rawPath, method: "GET" }, res => {
                let text = "";
                res.on("data", c => (text += c));
                res.on("end", () => resolve({ status: res.statusCode, text }));
            });
            req.on("error", err => resolve({ status: 0, text: "", error: err.message }));
            req.end();
        });
    }

    return {
        baseUrl,
        home,
        downloads: path.join(home, "Downloads"),
        request,
        raw,
        get: (u, h) => request("GET", u, undefined, h),
        post: (u, b, h) => request("POST", u, b ?? {}, h),
        alive: () => !exited,
        stderr: () => stderr,
        async stop() {
            if (!exited) {
                child.kill();
                await new Promise(r => child.on("exit", r));
            }
            await rm(tmp, { recursive: true, force: true });
        }
    };
}
