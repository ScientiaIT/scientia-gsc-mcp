import { homedir } from "node:os";
import { join } from "node:path";

/** Scope de sólo lectura: alcanza para todas las consultas. */
export const READONLY_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

/** Scope completo: necesario sólo para enviar o borrar sitemaps. */
export const WRITE_SCOPE = "https://www.googleapis.com/auth/webmasters";

/**
 * Carpeta donde viven las credenciales; se puede cambiar con GSC_CONFIG_DIR.
 * Cuelga de ~/.scientia, que es compartida por las herramientas de Scientia, cada una en su subcarpeta.
 */
export const configDir = process.env.GSC_CONFIG_DIR ?? join(homedir(), ".scientia", "gsc-mcp");

/** Archivo JSON del cliente OAuth (tipo "App de escritorio") descargado de Google Cloud. */
export const clientSecretFile = process.env.GSC_CLIENT_SECRET_FILE ?? join(configDir, "client_secret.json");

/** Archivo donde se guarda el token obtenido al autorizar. */
export const tokenFile = process.env.GSC_TOKEN_FILE ?? join(configDir, "token.json");
