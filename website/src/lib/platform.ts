export type Platform = 'mac' | 'linux' | 'windows' | 'unknown'

export function detectPlatform(): Platform {
  const userAgent = navigator.userAgent.toLowerCase()
  const platform = navigator.platform.toLowerCase()

  if (platform.includes('win') || userAgent.includes('win')) {
    return 'windows'
  }
  if (platform.includes('mac') || userAgent.includes('mac')) {
    return 'mac'
  }
  if (platform.includes('linux') || userAgent.includes('linux')) {
    return 'linux'
  }

  return 'unknown'
}

export function getInstallCommand(origin: string, platform: Platform): string {
  // Strip protocol for cleaner display (curl/irm default to HTTP and follow redirects)
  const baseUrl = origin.replace(/\/$/, '').replace(/^https?:\/\//, '')

  switch (platform) {
    case 'windows':
      return `irm ${baseUrl}/install.ps1 | iex`
    case 'mac':
    case 'linux':
      return `curl -fsSL ${baseUrl}/install.sh | bash`
    default:
      return `curl -fsSL ${baseUrl}/install.sh | bash`
  }
}

export function getInstallLabel(platform: Platform): string {
  switch (platform) {
    case 'windows': return 'PowerShell'
    case 'mac': return 'macOS / Linux'
    case 'linux': return 'macOS / Linux'
    default: return 'Terminal'
  }
}
