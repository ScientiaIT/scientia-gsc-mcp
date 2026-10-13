#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { searchconsole } from "@googleapis/searchconsole";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getAuthorizedClient, runAuthFlow } from "./auth.js";
import { registerTools } from "./tools.js";

const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

/** Levanta el servidor MCP por stdio. Todo lo que no es protocolo va a stderr. */
async function startServer() {
  const server = new McpServer({ name: "scientia-gsc-mcp", version });

  try {
    const { client, canWrite } = await getAuthorizedClient();
    registerTools(server, searchconsole({ version: "v1", auth: client }), canWrite);
    console.error(`scientia-gsc-mcp ${version} listo (${canWrite ? "lectura y escritura" : "sólo lectura"}).`);
  } catch (err) {
    // Si el proceso terminara acá, el cliente sólo mostraría "Connection closed"; así el motivo llega al usuario.
    registerSetupTool(server, err.message);
    console.error(err.message);
  }

  await server.connect(new StdioServerTransport());
}

/**
 * Registra una única herramienta que explica qué falta configurar.
 * @param {McpServer} server Servidor MCP.
 * @param {string} message Motivo por el que no se pudo autenticar.
 */
function registerSetupTool(server, message) {
  const text = `scientia-gsc-mcp is not configured: ${message}\nSetup guide: https://github.com/ScientiaIT/scientia-gsc-mcp#readme`;
  server.registerTool(
    "setup_status",
    { title: "Setup status", description: `Search Console is not available yet. ${text}`, annotations: { readOnlyHint: true } },
    async () => ({ isError: true, content: [{ type: "text", text }] }),
  );
}

const [command, ...flags] = process.argv.slice(2);

try {
  if (command === "auth")
    await runAuthFlow({ write: flags.includes("--write") });
  else if (command === undefined)
    await startServer();
  else {
    console.error("Uso: scientia-gsc-mcp            inicia el servidor MCP\n     scientia-gsc-mcp auth [--write]  autoriza el acceso a Search Console");
    process.exit(2);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
