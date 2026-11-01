import type { PackDef } from '../src/engine/types'

export const defaultPacksDir: string

export interface PackResult {
  file: string
  /** null when the YAML does not parse. */
  pack: PackDef | null
  errors: string[]
  shapeOk?: boolean
}

export function packFiles(dir?: string): string[]
export function loadPacks(dir?: string): PackResult[]
/** Every pack in a folder, or one Error listing every problem. */
export function collectPacks(dir?: string): PackDef[]
