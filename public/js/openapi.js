import { toLabel } from './utils.js';

function getSchemas(openApi) {
  return openApi?.components?.schemas || {};
}

function resolveRef(openApi, ref) {
  const key = String(ref || '').split('/').pop();
  return getSchemas(openApi)[key];
}

export function resolveSchema(openApi, node) {
  if (!node) return undefined;

  if (node.$ref) return resolveSchema(openApi, resolveRef(openApi, node.$ref));

  if (Array.isArray(node.allOf) && node.allOf.length > 0) {
    for (const part of node.allOf) {
      const resolved = resolveSchema(openApi, part);
      if (resolved) return resolved;
    }
  }

  return node;
}

export function getRequestBodySchema(openApi, path, method) {
  const operation = openApi?.paths?.[path]?.[method];
  const content = operation?.requestBody?.content || {};
  return content['application/json']?.schema;
}

export function schemaFieldsFromRef(openApi, ref) {
  const schema = resolveSchema(openApi, ref);
  if (!schema?.properties) return [];

  const required = new Set(schema.required || []);

  return Object.entries(schema.properties).map(([name, raw]) => {
    const resolved = resolveSchema(openApi, raw) || raw;
    const enumValues = resolved.enum || undefined;

    return {
      name,
      label: toLabel(name),
      type: enumValues ? 'enum' : resolved.type || 'string',
      enum: enumValues,
      required: required.has(name),
      minimum: resolved.minimum,
      maximum: resolved.maximum,
      minLength: resolved.minLength,
      maxLength: resolved.maxLength,
      format: resolved.format,
    };
  });
}

function extractEnumFromProperty(openApi, schemaName, propertyName) {
  const schema = getSchemas(openApi)[schemaName];
  const prop = resolveSchema(openApi, schema?.properties?.[propertyName]);
  return Array.isArray(prop?.enum) ? prop.enum : [];
}

function extractTopLevelEnum(openApi, schemaName) {
  const schema = getSchemas(openApi)[schemaName];
  return Array.isArray(schema?.enum) ? schema.enum : [];
}

export function extractOrderStatuses(openApi) {
  const sets = [
    extractTopLevelEnum(openApi, 'OrderStatus'),
    extractEnumFromProperty(openApi, 'FindOrdersQueryDTO', 'status'),
    extractEnumFromProperty(openApi, 'FindOrdersQueryDto', 'status'),
    extractEnumFromProperty(openApi, 'FindOrdersQuery', 'status'),
  ];

  const merged = Array.from(new Set(sets.flat().filter(Boolean)));
  if (merged.length > 0) return merged;

  // Safe fallback so the status filter always stays usable if schema names drift.
  return ['created', 'fulfilled', 'canceled'];
}
