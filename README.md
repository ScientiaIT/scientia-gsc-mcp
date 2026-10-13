# scientia-gsc-mcp

Servidor [MCP](https://modelcontextprotocol.io) para consultar **Google Search Console** desde Claude
(u otro cliente MCP) con **tus propias credenciales OAuth**.

Desarrollado por [Scientia &reg; Soluciones Informáticas](https://scientia.dev).

## ¿Por qué otro servidor de Search Console?

Google no publica un MCP oficial para Search Console, y darle acceso a tu cuenta a un servicio de terceros no siempre es aceptable. Este proyecto está pensado para que lo puedas auditar:

- **Chico**: cuatro archivos en `src/` que se leen en pocos minutos.
- **Sin intermediarios**: habla directo con la API oficial a través de las librerías de Google
  (`@googleapis/searchconsole` y `google-auth-library`). No hay servidores propios ni telemetría.
- **Tus credenciales**: el cliente OAuth sale de tu proyecto de Google Cloud y el token se guarda sólo en tu máquina.
- **Sólo lectura por defecto**: pide el scope `webmasters.readonly`. Las herramientas que modifican algo aparecen únicamente si autorizás el scope completo de forma explícita.

## Herramientas

| Herramienta        | Qué hace                                                            | Requiere escritura |
| ------------------ | ------------------------------------------------------------------- | :----------------: |
| `list_sites`       | Lista las propiedades a las que tiene acceso la cuenta.             |                    |
| `search_analytics` | Clics, impresiones, CTR y posición por consulta, página, país, etc. |                    |
| `inspect_url`      | Estado de indexación de una URL: cobertura, rastreo, canónica, etc. |                    |
| `list_sitemaps`    | Sitemaps enviados, con errores, advertencias y cantidad de URLs.    |                    |
| `get_sitemap`      | Detalle de un sitemap.                                              |                    |
| `submit_sitemap`   | Envía o reenvía un sitemap.                                         |         ✔          |
| `delete_sitemap`   | Quita un sitemap de Search Console (no borra el archivo del sitio). |         ✔          |

> La API pública de Search Console no permite solicitar indexación ni cambiar la configuración de la propiedad, así que ningún MCP puede hacerlo: la escritura se limita a los sitemaps.

## Requisitos

- Node.js 22 o superior.
- Una cuenta de Google con acceso a al menos una propiedad de Search Console.

## 1. Crear las credenciales en Google Cloud

Se hace una sola vez.

1. Entrá a [Google Cloud Console](https://console.cloud.google.com/) y creá un proyecto (o usá uno existente).
2. Habilitá la **Google Search Console API** desde [APIs y servicios → Biblioteca](https://console.cloud.google.com/apis/library/searchconsole.googleapis.com).
3. Configurá la pantalla de consentimiento en
   [Google Auth Platform](https://console.cloud.google.com/auth/overview):
   - Tipo de usuario: **Externo** (o **Interno** si tu cuenta es de Google Workspace y sólo la vas a usar dentro de tu organización).
   - En **Público**, agregá tu cuenta como usuario de prueba.
4. En [Clientes](https://console.cloud.google.com/auth/clients), creá un cliente OAuth de tipo
   **App de escritorio** y descargá el JSON.
5. Guardalo como `client_secret.json` en la carpeta de configuración:
   - Windows: `%USERPROFILE%\.scientia\gsc-mcp\client_secret.json`
   - macOS / Linux: `~/.scientia/gsc-mcp/client_secret.json`

> **Importante:** mientras la app está en modo **Prueba**, Google invalida el token a los 7 días y hay que volver a autorizar. Para evitarlo, en **Público** pasá la app a **En producción**. Como la app no está verificada, Google te va a mostrar una advertencia al autorizar; es esperable, porque la app es tuya.

## 2. Instalar

```bash
git clone https://github.com/ScientiaIT/scientia-gsc-mcp.git
cd scientia-gsc-mcp
npm ci
```

## 3. Autorizar

```bash
npm run auth
```

Se abre el navegador para que elijas la cuenta y aceptes el acceso de sólo lectura. El token queda en `~/.scientia/gsc-mcp/token.json`.

Si además querés poder enviar y borrar sitemaps:

```bash
npm run auth -- --write
```

Para volver a sólo lectura, ejecutá `npm run auth` de nuevo.

## 4. Configurar el cliente MCP

### Claude Code

```bash
claude mcp add --scope user gsc -- node /ruta/a/scientia-gsc-mcp/src/index.js
```

### Claude Desktop

En `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gsc": {
      "command": "node",
      "args": ["/ruta/a/scientia-gsc-mcp/src/index.js"]
    }
  }
}
```

### OpenAI Codex CLI

```bash
codex mcp add gsc -- node /ruta/a/scientia-gsc-mcp/src/index.js
```

O a mano, en `~/.codex/config.toml`:

```toml
[mcp_servers.gsc]
command = "node"
args = ["/ruta/a/scientia-gsc-mcp/src/index.js"]
```

### Gemini CLI

```bash
gemini mcp add -s user gsc node /ruta/a/scientia-gsc-mcp/src/index.js
```

O a mano, en `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "gsc": {
      "command": "node",
      "args": ["/ruta/a/scientia-gsc-mcp/src/index.js"]
    }
  }
}
```

> Las apps web y de escritorio de ChatGPT y Gemini sólo se conectan a servidores MCP remotos (HTTP), así que
> no pueden usar este servidor local: hace falta uno de los clientes de línea de comandos de arriba.

En Windows, usá barras normales en la ruta (`D:/Git/scientia-gsc-mcp/src/index.js`) o escapá las invertidas.

Después probá con algo como _«¿Cuáles fueron las 20 consultas con más impresiones del último mes en mi sitio?»_.

## Variables de entorno

Todas son opcionales.

| Variable                 | Valor por defecto                    | Uso                      |
| ------------------------ | ------------------------------------ | ------------------------ |
| `GSC_CONFIG_DIR`         | `~/.scientia/gsc-mcp`                | Carpeta de credenciales. |
| `GSC_CLIENT_SECRET_FILE` | `$GSC_CONFIG_DIR/client_secret.json` | Ruta del cliente OAuth.  |
| `GSC_TOKEN_FILE`         | `$GSC_CONFIG_DIR/token.json`         | Ruta del token.          |

## Seguridad

- `token.json` da acceso a tus datos de Search Console: no lo compartas ni lo subas a un repositorio. El `.gitignore` ya excluye `client_secret*.json` y `token.json`.
- El flujo de autorización usa PKCE y un servidor temporal que escucha sólo en `127.0.0.1`.
- Podés revocar el acceso cuando quieras desde [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

## Licencia

[MIT](LICENSE) © [Scientia](https://scientia.dev)
