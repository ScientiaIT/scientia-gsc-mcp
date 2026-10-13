import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname } from "node:path";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { READONLY_SCOPE, WRITE_SCOPE, clientSecretFile, tokenFile } from "./config.js";

/**
 * Lee el client_secret.json descargado de Google Cloud.
 * @returns {Promise<{ clientId: string, clientSecret: string }>} Credenciales del cliente OAuth.
 */
async function readClientSecret() {
  let raw;
  try {
    raw = await readFile(clientSecretFile, "utf8");
  } catch {
    throw new Error(`No se encontró el cliente OAuth en ${clientSecretFile}. Revisá el README para crearlo.`);
  }

  // Google lo entrega bajo "installed" para apps de escritorio; "web" se acepta por si acaso.
  const json = JSON.parse(raw);
  const data = json.installed ?? json.web;
  if (!data?.client_id || !data?.client_secret)
    throw new Error(`${clientSecretFile} no tiene client_id/client_secret. ¿Es el JSON de una "App de escritorio"?`);

  return { clientId: data.client_id, clientSecret: data.client_secret };
}

/**
 * Guarda el token en disco, legible sólo por el usuario actual (en sistemas POSIX).
 * @param {object} tokens Token a persistir.
 */
async function saveTokens(tokens) {
  await mkdir(dirname(tokenFile), { recursive: true });
  await writeFile(tokenFile, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

/**
 * Abre la URL en el navegador por defecto. Si falla, el usuario la tiene impresa en consola.
 * @param {string} url Dirección a abrir.
 */
function openBrowser(url) {
  // explorer.exe recibe la URL como argumento sin pasar por cmd, así los "&" no se rompen.
  const command = process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(command, [url], { stdio: "ignore", detached: true });
  child.on("error", () => {});
  child.unref();
}

/**
 * Ejecuta el flujo OAuth de escritorio (loopback + PKCE) y guarda el token.
 * @param {{ write: boolean }} options Si write es true, pide el scope que permite modificar sitemaps.
 */
export async function runAuthFlow({ write }) {
  const { clientId, clientSecret } = await readClientSecret();
  const scopes = write ? [WRITE_SCOPE] : [READONLY_SCOPE];
  const state = randomBytes(16).toString("hex");

  // El servidor escucha sólo en 127.0.0.1 y en un puerto libre; Google acepta cualquier puerto loopback.
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const redirectUri = `http://127.0.0.1:${server.address().port}`;

  const client = new OAuth2Client({ clientId, clientSecret, redirectUri });
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // fuerza a Google a devolver refresh_token aunque ya se haya autorizado antes
    scope: scopes,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
  });

  console.log(`Abrí esta URL para autorizar el acceso (${write ? "lectura y escritura" : "sólo lectura"}):\n\n${authUrl}\n`);
  openBrowser(authUrl);

  try {
    const code = await new Promise((resolve, reject) => {
      server.on("request", (req, res) => {
        const url = new URL(req.url, redirectUri);
        if (url.pathname !== "/") {
          res.writeHead(404).end();
          return;
        }

        const error = url.searchParams.get("error");
        const receivedCode = url.searchParams.get("code");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        if (error || url.searchParams.get("state") !== state || !receivedCode) {
          res.end("<p>No se pudo completar la autorización. Volvé a la terminal.</p>");
          reject(new Error(error ? `Google rechazó la autorización: ${error}` : "Respuesta inválida (state o code faltante)."));
          return;
        }

        res.end("<p>Listo. Ya podés cerrar esta pestaña.</p>");
        resolve(receivedCode);
      });
    });

    const { tokens } = await client.getToken({ code, codeVerifier });
    if (!tokens.refresh_token)
      throw new Error("Google no devolvió refresh_token. Revocá el acceso en https://myaccount.google.com/permissions y reintentá.");

    await saveTokens(tokens);
    console.log(`Token guardado en ${tokenFile}`);
  } finally {
    server.close();
  }
}

/**
 * Crea un cliente OAuth autenticado a partir del token guardado. Persiste los tokens renovados.
 * @returns {Promise<{ client: OAuth2Client, canWrite: boolean }>} Cliente listo y si el token permite escribir.
 */
export async function getAuthorizedClient() {
  const { clientId, clientSecret } = await readClientSecret();

  let tokens;
  try {
    tokens = JSON.parse(await readFile(tokenFile, "utf8"));
  } catch {
    throw new Error(`No hay token en ${tokenFile}. Ejecutá primero "npm run auth" en la carpeta del proyecto.`);
  }

  const client = new OAuth2Client({ clientId, clientSecret });
  client.setCredentials(tokens);

  // Google no siempre reenvía el refresh_token al renovar; se conserva el anterior.
  client.on("tokens", (renewed) => {
    tokens = { ...tokens, ...renewed };
    saveTokens(tokens).catch((err) => console.error(`No se pudo guardar el token renovado: ${err.message}`));
  });

  // Los permisos efectivos los define lo que el usuario autorizó, no una variable de entorno.
  const canWrite = (tokens.scope ?? "").split(" ").includes(WRITE_SCOPE);
  return { client, canWrite };
}
