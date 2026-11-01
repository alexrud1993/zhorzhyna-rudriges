// Компіляція JSON Schema (draft 2020-12) для пакетів data/v2.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const dir = fileURLToPath(new URL('../schemas/', import.meta.url))
const load = (name) => JSON.parse(readFileSync(dir + name, 'utf8'))

const ajv = new Ajv2020({ allErrors: true, strict: true })
addFormats(ajv)

export const validators = {
  careProfile: ajv.compile(load('care-profile.schema.json')),
  taxon: ajv.compile(load('taxon.schema.json')),
  commonName: ajv.compile(load('common-name.schema.json')),
  catalogMap: ajv.compile(load('catalog-map.schema.json')),
  place: ajv.compile(load('place.schema.json')),
}

/** Перевіряє об'єкт схемою; повертає масив зрозумілих рядків помилок. */
export function schemaErrors(kind, value) {
  const v = validators[kind]
  if (v(value)) return []
  return v.errors.map((e) => `схема ${kind}: ${e.instancePath || '/'} ${e.message}${e.params?.allowedValues ? ' ' + JSON.stringify(e.params.allowedValues) : ''}`)
}
