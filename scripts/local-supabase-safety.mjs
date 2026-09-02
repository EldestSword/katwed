import { execFileSync } from 'node:child_process'

export const LOCAL_CONFIRMATION = 'YES'
export const LOCAL_NETWORK_NAME = 'katwed-local-loopback'
export const LOCAL_PROJECT_ID = 'katwed'
export const LOCAL_DB_CONTAINER = `supabase_db_${LOCAL_PROJECT_ID}`

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

function normaliseHostname(hostname) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '')
}

export function isLoopbackHostname(hostname) {
  return LOOPBACK_HOSTS.has(normaliseHostname(hostname))
}

export function assertLocalUrl(rawUrl, allowedPorts, label = 'URL') {
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error(`${label} must be a valid URL.`)
  }
  if (!isLoopbackHostname(url.hostname)) {
    throw new Error(`${label} must target localhost/loopback; refusing every hosted target.`)
  }
  if (!allowedPorts.includes(Number(url.port))) {
    throw new Error(`${label} must use local port ${allowedPorts.join(' or ')}.`)
  }
  return url
}

export function assertLocalDatabaseUrl(rawUrl) {
  const url = assertLocalUrl(rawUrl, [54322], 'Local database URL')
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Local database URL must use postgres:// or postgresql://.')
  }
  return url
}

export function assertLocalConfirmation(environment = process.env) {
  if (environment.KATWED_LOCAL_SUPABASE !== LOCAL_CONFIRMATION) {
    throw new Error('Set KATWED_LOCAL_SUPABASE=YES to confirm this is the disposable local stack.')
  }
}

export function parseLocalStatus(rawStatus) {
  let status
  try {
    status = JSON.parse(rawStatus)
  } catch {
    throw new Error('Supabase local status did not return valid JSON.')
  }
  const apiUrl = status.API_URL ?? status.api_url
  const databaseUrl = status.DB_URL ?? status.db_url
  const anonKey = status.ANON_KEY ?? status.anon_key
  const serviceRoleKey = status.SERVICE_ROLE_KEY ?? status.service_role_key
  if (!apiUrl || !databaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error('Supabase local status is missing API_URL, DB_URL, ANON_KEY or SERVICE_ROLE_KEY.')
  }
  const parsedApiUrl = assertLocalUrl(apiUrl, [54321], 'Local Supabase API URL')
  if (!['http:', 'https:'].includes(parsedApiUrl.protocol)) {
    throw new Error('Local Supabase API URL must use http:// or https://.')
  }
  assertLocalDatabaseUrl(databaseUrl)
  return { apiUrl, databaseUrl, anonKey, serviceRoleKey, raw: status }
}

function executable(name) {
  return process.platform === 'win32' && ['npm', 'npx'].includes(name) ? `${name}.cmd` : name
}

export function runCommand(command, args, options = {}) {
  return execFileSync(executable(command), args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
    env: options.env ?? process.env,
  })
}

export function runSupabase(args, options = {}) {
  return runCommand('npx', ['--no-install', 'supabase', ...args], options)
}

export function readLocalStatus(options = {}) {
  assertLocalConfirmation(options.env ?? process.env)
  return parseLocalStatus(runSupabase(['status', '--output', 'json'], options))
}

export function runLocalSql(sql, options = {}) {
  assertLocalConfirmation(options.env ?? process.env)
  return runCommand('docker', [
    'exec', LOCAL_DB_CONTAINER, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'postgres', '-A', '-t', '-c', sql,
  ], options).trim()
}

export function localSupabaseArgs(action) {
  switch (action) {
    case 'start': return ['start', '--network-id', LOCAL_NETWORK_NAME]
    case 'status': return ['status']
    case 'reset': return ['db', 'reset', '--local', '--no-seed']
    case 'stop': return ['stop', '--project-id', LOCAL_PROJECT_ID]
    default: throw new Error(`Unknown local Supabase action: ${action}`)
  }
}
