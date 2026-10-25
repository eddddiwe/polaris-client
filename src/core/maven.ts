export interface MavenCoordinate {
  group: string
  artifact: string
  version: string
  classifier?: string
  extension: string
  path: string
}

export function parseMaven(name: string): MavenCoordinate {
  const [coordsPart, extPart] = name.split('@')
  const parts = coordsPart.split(':')
  if (parts.length < 3) throw new Error(`Invalid maven coordinate: ${name}`)
  const [group, artifact, version, classifier] = parts
  const extension = extPart || 'jar'
  const file = `${artifact}-${version}${classifier ? `-${classifier}` : ''}.${extension}`
  const path = [group.replace(/\./g, '/'), artifact, version, file].join('/')
  return { group, artifact, version, classifier, extension, path }
}

export function mavenKey(name: string): string {
  const parsed = parseMaven(name)
  return `${parsed.group}:${parsed.artifact}${parsed.classifier ? `:${parsed.classifier}` : ''}`
}

export function libraryPath(name: string): string {
  return parseMaven(name).path
}
