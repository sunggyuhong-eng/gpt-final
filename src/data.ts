import type { CategoryHistory, CompanyGroups, History, Report, ReportArchive, Snapshot, Status } from './types'

const requestVersion = Date.now().toString()
const asset = (path: string) => {
  const url = new URL(path, window.location.href.split('#')[0])
  url.searchParams.set('v', requestVersion)
  return url.toString()
}

async function load<T>(path:string): Promise<T> {
  const response = await fetch(asset(path), { cache: 'no-store' })
  if (!response.ok) throw new Error(`${path} 로드 실패 (${response.status})`)
  return response.json()
}

async function loadOptional<T>(path:string, fallback:T): Promise<T> {
  try { return await load<T>(path) }
  catch { return fallback }
}

export function loadReport(path:string) { return load<Report>(path) }

export async function loadAll() {
  const [snapshot, history, categoryHistory, report, status, companyGroups, reportArchive] = await Promise.all([
    load<Snapshot>('data/latest.json'), load<History>('data/history-summary.json'),
    load<CategoryHistory>('data/category-history.json'),
    load<Report>('data/reports/latest.json'), load<Status>('data/collection-status.json'),
    load<CompanyGroups>('data/company-groups.json'),
    loadOptional<ReportArchive>('data/reports/archive.json', { reports:[] })
  ])
  const periods = [...new Set(categoryHistory.periods.map(item => item.period))]
  const loadedSnapshots = await Promise.all(periods.map(async period => [period, await load<Snapshot>(`data/snapshots/${period}.json`)] as const))
  const snapshots = Object.fromEntries(loadedSnapshots)
  return { snapshot, history, categoryHistory, report, status, companyGroups, reportArchive, snapshots }
}
