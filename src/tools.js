import { z } from "zod";

const siteUrl = z
  .string()
  .describe('Search Console property, e.g. "https://example.com/" (URL-prefix) or "sc-domain:example.com" (domain property).');

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/**
 * Convierte la respuesta de la API en el formato de contenido MCP.
 * @param {unknown} data Datos devueltos por Google.
 * @returns {{ content: { type: "text", text: string }[] }} Resultado de la herramienta.
 */
function ok(data) {
  return { content: [{ type: "text", text: JSON.stringify(data ?? {}, null, 2) }] };
}

/**
 * Envuelve un handler para devolver los errores de Google como resultado de error legible.
 * @param {(args: any) => Promise<unknown>} handler Función que llama a la API.
 * @returns {(args: any) => Promise<object>} Handler compatible con MCP.
 */
function safe(handler) {
  return async (args) => {
    try {
      return ok(await handler(args));
    } catch (err) {
      const message = err?.response?.data?.error?.message ?? err?.message ?? String(err);
      return { isError: true, content: [{ type: "text", text: `Search Console API error: ${message}` }] };
    }
  };
}

/**
 * Registra las herramientas de Search Console en el servidor MCP.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server Servidor MCP.
 * @param {import("@googleapis/searchconsole").searchconsole_v1.Searchconsole} gsc Cliente de la API.
 * @param {boolean} canWrite Si el token autorizado permite modificar sitemaps.
 */
export function registerTools(server, gsc, canWrite) {
  const readOnly = { readOnlyHint: true, openWorldHint: true };

  server.registerTool(
    "list_sites",
    {
      title: "List sites",
      description: "Lists the Search Console properties the authorized account can access, with its permission level.",
      annotations: readOnly,
    },
    safe(async () => (await gsc.sites.list()).data),
  );

  server.registerTool(
    "search_analytics",
    {
      title: "Search analytics",
      description:
        "Queries search performance (clicks, impressions, CTR, average position) grouped by the given dimensions. " +
        "Data usually lags 2-3 days; use dataState \"all\" to include fresh, not yet final data.",
      inputSchema: {
        siteUrl,
        startDate: date.describe("Start date (YYYY-MM-DD), inclusive."),
        endDate: date.describe("End date (YYYY-MM-DD), inclusive."),
        dimensions: z
          .array(z.enum(["date", "hour", "query", "page", "country", "device", "searchAppearance"]))
          .optional()
          .describe("Dimensions to group by. Without dimensions you get the totals."),
        type: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).optional().describe("Search type. Default: web."),
        filters: z
          .array(
            z.object({
              dimension: z.enum(["query", "page", "country", "device", "searchAppearance"]),
              operator: z.enum(["equals", "notEquals", "contains", "notContains", "includingRegex", "excludingRegex"]),
              expression: z.string().describe("Value to compare. Countries use ISO 3166-1 alpha-3 (e.g. ARG); devices: DESKTOP, MOBILE, TABLET."),
            }),
          )
          .optional()
          .describe("Filters combined with AND."),
        aggregationType: z.enum(["auto", "byPage", "byProperty"]).optional(),
        dataState: z.enum(["final", "all", "hourly_all"]).optional(),
        rowLimit: z.number().int().min(1).max(25000).optional().describe("Max rows. Default: 1000."),
        startRow: z.number().int().min(0).optional().describe("Offset for pagination."),
      },
      annotations: readOnly,
    },
    safe(async ({ siteUrl, filters, rowLimit, ...body }) =>
      (
        await gsc.searchanalytics.query({
          siteUrl,
          requestBody: {
            ...body,
            rowLimit: rowLimit ?? 1000,
            dimensionFilterGroups: filters?.length ? [{ groupType: "and", filters }] : undefined,
          },
        })
      ).data,
    ),
  );

  server.registerTool(
    "inspect_url",
    {
      title: "Inspect URL",
      description:
        "Returns Google's index status for a URL of the property: coverage, last crawl, canonical chosen by Google, " +
        "mobile usability and rich results. It reflects the indexed version, not a live test.",
      inputSchema: {
        siteUrl,
        inspectionUrl: z.string().url().describe("Full URL to inspect; it must belong to siteUrl."),
        languageCode: z.string().optional().describe('Language for translated messages, e.g. "es" or "en-US".'),
      },
      annotations: readOnly,
    },
    safe(async (requestBody) => (await gsc.urlInspection.index.inspect({ requestBody })).data),
  );

  server.registerTool(
    "list_sitemaps",
    {
      title: "List sitemaps",
      description: "Lists the sitemaps submitted for the property, with their last download, errors, warnings and URL counts.",
      inputSchema: {
        siteUrl,
        sitemapIndex: z.string().url().optional().describe("If set, lists the sitemaps contained in that sitemap index."),
      },
      annotations: readOnly,
    },
    safe(async (params) => (await gsc.sitemaps.list(params)).data),
  );

  server.registerTool(
    "get_sitemap",
    {
      title: "Get sitemap",
      description: "Returns the details of a submitted sitemap.",
      inputSchema: { siteUrl, feedpath: z.string().url().describe("Full sitemap URL.") },
      annotations: readOnly,
    },
    safe(async (params) => (await gsc.sitemaps.get(params)).data),
  );

  // Las herramientas de escritura sólo existen si el usuario autorizó el scope completo.
  if (!canWrite)
    return;

  server.registerTool(
    "submit_sitemap",
    {
      title: "Submit sitemap",
      description: "Submits (or resubmits) a sitemap to Google for the property.",
      inputSchema: { siteUrl, feedpath: z.string().url().describe("Full sitemap URL.") },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    safe(async (params) => {
      await gsc.sitemaps.submit(params);
      return { submitted: params.feedpath };
    }),
  );

  server.registerTool(
    "delete_sitemap",
    {
      title: "Delete sitemap",
      description: "Removes a sitemap from the property in Search Console. It does not delete the file from the site.",
      inputSchema: { siteUrl, feedpath: z.string().url().describe("Full sitemap URL.") },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    safe(async (params) => {
      await gsc.sitemaps.delete(params);
      return { deleted: params.feedpath };
    }),
  );
}
