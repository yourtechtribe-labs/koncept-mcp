import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  indexConcepts,
  loadConcepts,
} from '@yourtechtribe-labs/koncept-core'
import { KEBAB_ID_REGEX } from '../tools/_shared.js'
import type { ToolContext } from '../tools/index.js'

export interface ResourceContext extends ToolContext {}

const LIST_URI = 'koncept://concepts'
const TEMPLATE_URI = 'koncept://concept/{id}'

export function registerAllResources(mcp: McpServer, ctx: ResourceContext): void {
  registerConceptsList(mcp, ctx)
  registerConceptTemplate(mcp, ctx)
}

function registerConceptsList(mcp: McpServer, ctx: ResourceContext): void {
  mcp.registerResource(
    'concepts-index',
    LIST_URI,
    {
      title: 'Concepts index',
      description:
        'JSON array of every concept in the registry: {id, name, type, status, uri, source_file}.',
      mimeType: 'application/json',
    },
    async () => {
      const result = await indexConcepts(ctx.rootDir)
      const payload = result.entries.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        status: e.status,
        uri: `koncept://concept/${e.id}`,
        source_file: e.file,
      }))
      return {
        contents: [
          {
            uri: LIST_URI,
            mimeType: 'application/json',
            text: JSON.stringify(payload, null, 2),
          },
        ],
      }
    },
  )
}

function registerConceptTemplate(mcp: McpServer, ctx: ResourceContext): void {
  const template = new ResourceTemplate(TEMPLATE_URI, {
    list: async () => {
      const result = await indexConcepts(ctx.rootDir)
      return {
        resources: result.entries.map((e) => ({
          uri: `koncept://concept/${e.id}`,
          name: e.id,
          title: e.name,
          mimeType: 'application/json',
          description: `${e.type} — status: ${e.status}`,
        })),
      }
    },
  })

  mcp.registerResource(
    'concept',
    template,
    {
      title: 'Concept',
      description:
        'A single concept document by id. URI: koncept://concept/<id>. Returns the full Concept (participants, invariants with check payload, related_concepts, tags, references) as JSON.',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const id = String(variables.id ?? '')
      if (!KEBAB_ID_REGEX.test(id)) {
        return errorResult(uri.href, 'invalid_id', `id "${id}" is not kebab-case`)
      }
      const loaded = await loadConcepts(ctx.rootDir)
      const concept = loaded.concepts.find((c) => c.id === id)
      if (!concept) {
        return errorResult(uri.href, 'not_found', `concept "${id}" not found`)
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(concept, null, 2),
          },
        ],
      }
    },
  )
}

function errorResult(uri: string, code: string, message: string) {
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({ error: code, message }, null, 2),
      },
    ],
  }
}
