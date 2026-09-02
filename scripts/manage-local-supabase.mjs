import { pathToFileURL } from 'node:url'
import {
  LOCAL_NETWORK_NAME,
  assertLocalConfirmation,
  localSupabaseArgs,
  parseLocalStatus,
  runCommand,
  runSupabase,
} from './local-supabase-safety.mjs'

function ensureLoopbackNetwork() {
  try {
    const inspected = JSON.parse(runCommand('docker', ['network', 'inspect', LOCAL_NETWORK_NAME]))
    const binding = inspected[0]?.Options?.['com.docker.network.bridge.host_binding_ipv4']
    if (binding !== '127.0.0.1') {
      throw new Error(`Docker network ${LOCAL_NETWORK_NAME} exists without the required loopback binding.`)
    }
  } catch (error) {
    if (error instanceof SyntaxError || /without the required loopback/.test(String(error))) throw error
    runCommand('docker', [
      'network', 'create', '--opt',
      'com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
      LOCAL_NETWORK_NAME,
    ], { stdio: 'inherit' })
  }
}

function printValidatedStatus() {
  const status = parseLocalStatus(runSupabase(['status', '--output', 'json']))
  const localServiceUrls = Object.fromEntries(Object.entries(status.raw)
    .filter(([key, value]) => key.endsWith('_URL') && key !== 'DB_URL'
      && typeof value === 'string' && /localhost|127\.0\.0\.1|\[::1\]/.test(value)))
  console.log(JSON.stringify({
    apiUrl: status.apiUrl,
    databaseUrl: status.databaseUrl.replace(/:\/\/[^@]+@/, '://***@'),
    localServiceUrls,
  }, null, 2))
}

export function manageLocalSupabase(action, environment = process.env) {
  if (!['start', 'status', 'reset', 'stop'].includes(action)) {
    throw new Error('Usage: node scripts/manage-local-supabase.mjs <start|status|reset|stop>')
  }
  assertLocalConfirmation(environment)
  if (action === 'start') {
    runCommand('docker', ['version'], { stdio: 'inherit' })
    runCommand('docker', ['compose', 'version'], { stdio: 'inherit' })
    ensureLoopbackNetwork()
  }
  runSupabase(localSupabaseArgs(action), { stdio: 'inherit', env: environment })
  if (action === 'start' || action === 'status' || action === 'reset') printValidatedStatus()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    manageLocalSupabase(process.argv[2])
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
