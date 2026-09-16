import { useEffect, useMemo, useState } from 'react'
import { NavLink, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowUpRight, BarChart3, BriefcaseBusiness, Building2, CalendarDays,
  CheckCircle2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Clock3, ExternalLink, FileText, LayoutDashboard,
  MapPin, Search, Sparkles, TrendingUp, UsersRound, Newspaper, AlertCircle,
} from 'lucide-react'
import { loadAll } from './data'
import { pageWindow } from './pagination'
import type { CategoryHistory, History, Job, Report, Snapshot, Status } from './types'

type Data = { snapshot: Snapshot; history: History; categoryHistory: CategoryHistory; report: Report; status: Status }
const nav = [
  ['/', '대시보드', LayoutDashboard], ['/jobs', '채용공고', BriefcaseBusiness],
  ['/categories', '직무별', BarChart3], ['/companies', '회사별', Building2],
  ['/reports', '월간 리포트', FileText],
] as const

export default function App() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { loadAll().then(setData).catch((e: Error) => setError(e.message)) }, [])
  if (error) return <Empty title="데이터를 불러오지 못했어요" text={error} />
  if (!data) return <div className="loader"><span /><b>채용 데이터를 불러오는 중이에요</b></div>
  return <div className="app">
    <Header data={data} />
    <main>
      <Routes>
        <Route path="/" element={<Dashboard data={data} />} />
        <Route path="/jobs" element={<Jobs data={data} />} />
        <Route path="/categories" element={<Categories data={data} />} />
        <Route path="/companies" element={<Companies data={data} />} />
        <Route path="/reports" element={<Reports data={data} />} />
      </Routes>
    </main>
    <footer className="site-footer">© KONGSTUDIOS. All rights reserved.</footer>
    <MobileNav />
  </div>
}

function Header({ data }: { data: Data }) {
  return <header className="topbar"><div className="topbar-inner">
    <NavLink className="brand" to="/">게임잡 채용 데이터</NavLink>
    <nav className="desktop-nav">{nav.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}</nav>
    <GlobalSearch />
    <div className="freshness"><i className={data.status.success ? 'ok' : ''} /><span>{formatDate(data.snapshot.collected_at)} 기준</span>{data.snapshot.is_sample && <b>예시</b>}</div>
  </div></header>
}

function GlobalSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  return <form className="global-search" onSubmit={event => { event.preventDefault(); if (query.trim()) navigate(`/jobs?q=${encodeURIComponent(query.trim())}`) }}>
    <Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="회사·공고·직무 검색" aria-label="전체 채용공고 검색" />
  </form>
}

function MobileNav() {
  return <nav className="mobile-nav">{nav.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === '/'}><Icon size={20} /><span>{label}</span></NavLink>)}</nav>
}

function Dashboard({ data }: { data: Data }) {
  const jobs = data.snapshot.jobs
  const companies = new Set(jobs.map(j => j.company)).size
  const categories = countCategories(jobs)
  const topCategory = categories[0]
  const stats = data.report.statistics
  const companyRanks = Object.entries(groupBy(jobs, j => j.company))
    .map(([name, list]) => ({ name, count: list.length, description: list[0].representative_game }))
    .sort((a, b) => b.count - a.count)
  const recentJobs = [...jobs].sort((a, b) => (b.posted_at || '').localeCompare(a.posted_at || '')).slice(0, 6)
  const categoryMoves = movementRows(stats.by_category || [])
  const companyMoves = movementRows(stats.by_company || [])
  const upJobs = categoryMoves.filter(row => (row.change || 0) > 0).length
  const downJobs = categoryMoves.filter(row => (row.change || 0) < 0).length

  return <section className="dashboard">
    <div className="hero">
      <div className="hero-copy"><span className="eyebrow"><Sparkles size={14} /> GAME INDUSTRY TALENT SIGNAL</span><h1>게임업계 채용 흐름,<br /><em>쉽고 빠르게</em> 확인하세요</h1><p>게임잡의 공개 채용공고를 매일 모아 회사와 직무의 변화를 한눈에 보여드려요.</p><div className="hero-actions"><NavLink className="primary-button" to="/jobs">채용공고 살펴보기 <ArrowUpRight size={18} /></NavLink><span><CheckCircle2 size={16} /> {data.report.is_sample ? '예시 비교 데이터' : '실제 수집 데이터'}</span></div></div>
      <div className="hero-visual"><div className="pulse-card"><span>현재 채용 중</span><strong>{jobs.length.toLocaleString()}</strong><small>개의 게임업계 공고</small><div className="pulse-line"><i /><i /><i /><i /><i /><i /><i /></div><p><span /> 매일 오전 9시 업데이트</p></div><div className="floating-stat"><TrendingUp size={19} /><div><b>{topCategory?.name || '분류 없음'}</b><span>가장 많이 찾는 직무</span></div></div></div>
    </div>

    <div className={`status-strip${data.report.is_sample ? ' warning' : ''}`}><div><CheckCircle2 size={18} /><b>{data.report.is_sample ? '예시 데이터 비교 화면이에요' : data.status.success ? '데이터가 최신 상태예요' : '수집 상태를 확인해 주세요'}</b></div><span>{data.status.message || `마지막 정상 수집 ${formatDate(data.snapshot.collected_at)}`}</span></div>

    <section className="market-brief"><div><span>MONTHLY MARKET BRIEF</span><h2>{stats.change >= 0 ? '전월 대비 채용 공고가 확대됐어요' : '전월 대비 채용 공고가 감소했어요'}</h2><p>{data.report.comparison_label || '최근 비교 기간'} 기준 전체 공고는 <b>{fmtChange(stats.change)}</b> 변했습니다. 강세 직무 {upJobs}개, 약세 직무 {downJobs}개로 확인되며 회사·직무별 편차가 큽니다.</p></div><NavLink to="/reports">월간 분석 보기 <ChevronRight size={17} /></NavLink></section>

    <div className="section-heading"><div><span>MARKET SNAPSHOT</span><h2>지금 채용시장을 숫자로 볼까요?</h2></div><p>동일 공고는 고유번호를 기준으로 한 번만 집계해요.</p></div>
    <div className="kpis">
      <Kpi icon={BriefcaseBusiness} label="현재 오픈 공고" value={`${jobs.length.toLocaleString()}건`} sub={`전월 대비 ${fmtChange(stats.change)}`} primary />
      <Kpi icon={Sparkles} label="신규 공고" value={`${stats.new_count ?? '-'}건`} sub={data.report.comparison_label || '이번 공식 스냅샷'} />
      <Kpi icon={Clock3} label="종료 공고" value={`${stats.closed_count ?? '-'}건`} sub={data.report.baseline_period ? `${data.report.baseline_period} 기준` : '이전 공고 기준'} />
      <Kpi icon={UsersRound} label="채용 중인 회사" value={`${companies.toLocaleString()}개`} sub="회사명 중복 제거" />
      <Kpi icon={BarChart3} label="최다 채용 직무" value={topCategory?.name || '-'} sub={`${topCategory?.count.toLocaleString() || 0}건`} />
    </div>

    <div className="dashboard-grid market-grid">
      <Panel className="trend-panel" eyebrow="HIRING TREND" title="오픈 공고 추이"><Trend history={data.history} /></Panel>
      <Panel eyebrow="JOB MOMENTUM" title="직무 강세·약세"><DeltaBars rows={categoryMoves.slice(0, 8)} /></Panel>
      <Panel eyebrow="COMPANY MOVERS" title="회사별 변동"><DeltaBars rows={companyMoves.slice(0, 8)} /></Panel>
    </div>

    <div className="section-heading compact"><div><span>NEW OPENINGS</span><h2>최근 등록된 공고</h2></div><NavLink to="/jobs">전체 공고 보기 <ChevronRight size={17} /></NavLink></div>
    <JobCards jobs={recentJobs} />
  </section>
}

function Jobs({ data }: { data: Data }) {
  const jobs = data.snapshot.jobs
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') || ''), [company, setCompany] = useState('')
  const [major, setMajor] = useState(params.get('major') || ''), [sub, setSub] = useState(params.get('sub') || '')
  const [career, setCareer] = useState(''), [location, setLocation] = useState(''), [employment, setEmployment] = useState('')
  const [sort, setSort] = useState('latest'), [page, setPage] = useState(1)
  const list = useMemo(() => jobs.filter(j =>
    (!q || `${j.title} ${j.company} ${majorCategories(j).join(' ')} ${subCategories(j).join(' ')}`.toLowerCase().includes(q.toLowerCase())) &&
    (!company || j.company === company) && (!major || majorCategories(j).includes(major)) && (!sub || subCategories(j).includes(sub)) &&
    (!career || j.career === career) && (!location || j.location === location) &&
    (!employment || splitValues(j.employment_type).includes(employment))
  ).sort((a, b) => sort === 'deadline'
    ? (a.deadline || '9999').localeCompare(b.deadline || '9999')
    : (b.posted_at || '').localeCompare(a.posted_at || '')), [jobs, q, company, major, sub, career, location, employment, sort])

  useEffect(() => setPage(1), [q, company, major, sub, career, location, employment, sort])
  useEffect(() => { if (sub && !jobs.some(j => (!major || majorCategories(j).includes(major)) && subCategories(j).includes(sub))) setSub('') }, [jobs, major, sub])
  const clear = () => { setQ(''); setCompany(''); setMajor(''); setSub(''); setCareer(''); setLocation(''); setEmployment('') }
  const hasFilter = Boolean(q || company || major || sub || career || location || employment)
  const pageSize = 40, pageCount = Math.max(1, Math.ceil(list.length / pageSize))
  const pagedJobs = list.slice((page - 1) * pageSize, page * pageSize)
  const availableSubs = jobs.filter(j => !major || majorCategories(j).includes(major)).flatMap(subCategories)
  return <section>
    <PageTitle eyebrow="OPEN POSITIONS" title="채용공고" description="원하는 회사와 직무를 빠르게 찾아보세요." count={list.length} />
    <div className="filter-card"><label className="search-box"><Search size={20} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="회사명, 공고명 또는 직무 검색" /></label><div className="filter-row"><Select value={company} set={setCompany} label="전체 회사" values={jobs.map(j => j.company)} /><Select value={major} set={setMajor} label="전체 대분류" values={jobs.flatMap(majorCategories)} /><Select value={sub} set={setSub} label="전체 소분류" values={availableSubs} /><Select value={career} set={setCareer} label="전체 경력" values={jobs.map(j => j.career)} /><Select value={location} set={setLocation} label="전체 지역" values={jobs.map(j => j.location)} /><Select value={employment} set={setEmployment} label="전체 고용형태" values={jobs.flatMap(j => splitValues(j.employment_type))} /><select value={sort} onChange={e => setSort(e.target.value)}><option value="latest">최신 등록순</option><option value="deadline">마감 임박순</option></select>{hasFilter && <button className="text-button" onClick={clear}>필터 초기화</button>}</div></div>
    <div className="result-head"><b>{list.length.toLocaleString()}개의 공고</b><span>공고 제목을 누르면 게임잡 원문으로 이동해요.</span></div>
    {list.length ? <><JobCards jobs={pagedJobs} detailed signals={jobSignals(data.report)} /><Pagination page={page} total={pageCount} setPage={setPage} /></> : <Empty title="조건에 맞는 공고가 없어요" text="검색어나 필터를 변경해 보세요." />}
  </section>
}

function Categories({ data }: { data: Data }) {
  const [params, setParams] = useSearchParams()
  const counts = countCategories(data.snapshot.jobs)
  const selected = params.get('major') || counts[0]?.name || ''
  const selectedSub = params.get('sub') || ''
  const [subQuery, setSubQuery] = useState('')
  const [page, setPage] = useState(1)
  const majorJobs = selected ? data.snapshot.jobs.filter(j => majorCategories(j).includes(selected)) : []
  const taxonomy = data.categoryHistory.taxonomy || {}
  const subCounts = countSubCategoriesForMajor(majorJobs, selected, taxonomy)
  const visibleSubs = subCounts.filter(item => item.name.toLowerCase().includes(subQuery.trim().toLowerCase()))
  const jobs = selectedSub ? majorJobs.filter(j => subCategoriesForMajor(j, selected, taxonomy).includes(selectedSub)) : majorJobs
  const pageSize = 40, pageCount = Math.max(1, Math.ceil(jobs.length / pageSize))
  const trend = data.categoryHistory.periods.map(item => ({ month: item.period, total_open: (selectedSub ? (item.sub_by_major?.[selected]?.[selectedSub] ?? item.sub[selectedSub]) : item.major[selected]) || 0, new_count: null, closed_count: null }))
  const currentCount = trend.at(-1)?.total_open || jobs.length
  const previousCount = trend.length > 1 ? trend.at(-2)?.total_open ?? null : null
  const change = previousCount == null ? null : currentCount - previousCount
  const categoryChange = (kind: 'major' | 'sub', name: string, major = selected) => {
    const periods = data.categoryHistory.periods
    if (periods.length < 2) return null
    if (kind === 'sub') return (periods.at(-1)?.sub_by_major?.[major]?.[name] ?? periods.at(-1)?.sub[name] ?? 0) - (periods.at(-2)?.sub_by_major?.[major]?.[name] ?? periods.at(-2)?.sub[name] ?? 0)
    return (periods.at(-1)?.major[name] || 0) - (periods.at(-2)?.major[name] || 0)
  }
  useEffect(() => { setPage(1); setSubQuery('') }, [selected, selectedSub])
  return <section className="category-page"><PageTitle eyebrow="JOB CATEGORY" title="직무별 채용" description="대분류에서 소분류를 선택하고 해당 직무의 변화와 공고를 확인하세요." />
    <div className="taxonomy-note"><b>집계 기준</b><span>대분류는 중복을 제거한 공고 수입니다. 한 공고에 여러 소분류가 지정될 수 있어 소분류 합계는 대분류 공고 수와 다를 수 있으며, 선택한 대분류에 속한 소분류만 표시합니다.</span></div>
    <div className="category-browser">
      <aside className="major-rail"><div className="category-browser-title"><span>대분류</span><b>직무 선택</b></div><div className="major-list">{counts.map(x => <button className={selected === x.name ? 'active' : ''} onClick={() => setParams({ major: x.name })} key={x.name}><span>{x.name}</span><span className="category-metric"><b>{x.count.toLocaleString()}</b><ChangeBadge value={categoryChange('major', x.name)} /></span></button>)}</div></aside>
      <div className="category-browser-content">
        <section className="subcategory-panel"><div className="category-browser-title"><span>소분류</span><b>{selected} 세부 직무</b></div><label className="mini-search category-search"><Search size={17} /><input value={subQuery} onChange={event => setSubQuery(event.target.value)} placeholder="소분류 직무 검색" />{subQuery && <button onClick={() => setSubQuery('')} aria-label="검색어 지우기">×</button>}</label><div className="subcategory-list">{visibleSubs.map(x => <button className={selectedSub === x.name ? 'active' : ''} onClick={() => setParams({ major: selected, sub: x.name })} key={x.name}><span>{x.name}</span><span className="category-metric"><b>{x.count.toLocaleString()}건</b><ChangeBadge value={categoryChange('sub', x.name)} /></span><ChevronRight size={16} /></button>)}{!visibleSubs.length && <p>검색 결과가 없습니다.</p>}</div><p className="category-overlap-note">소분류 태그 {subCounts.reduce((sum, item) => sum + item.count, 0).toLocaleString()}개 · 고유 공고 {majorJobs.length.toLocaleString()}건</p></section>
        <section className="category-trend-card"><div className="category-trend-head"><div><span>선택 직무 추이</span><h2>{selectedSub || selected}</h2></div><div><strong>{currentCount.toLocaleString()}건</strong><small className={change != null && change < 0 ? 'down' : ''}>{change == null ? '비교 기준 없음' : `직전 기준일 대비 ${change > 0 ? '+' : ''}${change}건`}</small></div></div><Trend history={{ months: trend }} /></section>
      </div>
    </div>
    {selected && <><div className="section-heading compact"><div><span>SELECTED JOB</span><h2>{selectedSub || selected} 채용공고</h2></div><b>{jobs.length.toLocaleString()}건</b></div><JobCards jobs={jobs.slice((page - 1) * pageSize, page * pageSize)} detailed /><Pagination page={page} total={pageCount} setPage={setPage} /></>}
  </section>
}

function Companies({ data }: { data: Data }) {
  const companies = Object.entries(groupBy(data.snapshot.jobs, j => j.company)).sort((a, b) => b[1].length - a[1].length)
  const [selected, setSelected] = useState(companies[0]?.[0] || '')
  const [query, setQuery] = useState('')
  const filtered = companies.filter(([name]) => name.toLowerCase().includes(query.toLowerCase()))
  const jobs = companies.find(x => x[0] === selected)?.[1] || []
  const profile = jobs[0]
  const companyChanges = new Map<string, number | null>((data.report.statistics?.by_company || []).map((row: {name:string;change:number|null}) => [row.name, row.change]))
  const selectedChange = companyChanges.get(selected) ?? null
  const companyRow = (data.report.statistics?.by_company || []).find((row: {name:string}) => row.name === selected)
  const jobMix = countCategories(jobs).slice(0, 8)
  const relatedNews = matchCompanyNews(selected, data.report.news || []).slice(0, 5)
  return <section><PageTitle eyebrow="COMPANY DIRECTORY" title="회사별 채용" description="기업정보와 진행 중인 공고를 함께 확인하세요." count={companies.length} countLabel="개 회사" />
    <div className="company-layout"><aside className="company-list"><label className="mini-search"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="회사 검색" /></label><div>{filtered.map(([name, items]) => <button onClick={() => setSelected(name)} className={name === selected ? 'active' : ''} key={name}><Logo name={name} url={items[0].logo_url} /><span><b>{name}</b><small>{items[0].representative_game || '대표게임 정보 없음'}</small></span><span className="company-list-metric"><strong>{items.length}</strong><ChangeBadge value={companyChanges.get(name) ?? null} /></span></button>)}</div></aside>
      {selected && <article className="company-detail"><div className="company-hero"><Logo name={selected} url={profile?.logo_url || null} /><div><span>COMPANY PROFILE</span><h2>{selected}</h2><p>{profile?.representative_game || '대표게임 정보 없음'}</p></div><div className="company-change"><small>{data.report.comparison_label || '이전 공식 스냅샷 기준'}</small><ChangeBadge value={selectedChange} large /></div>{profile?.company_url && <a className="outline-button" href={profile.company_url} target="_blank" rel="noreferrer">게임잡 기업정보 <ExternalLink size={15} /></a>}</div><div className="profile-grid"><Profile label="기업형태" value={profile?.company_type} /><Profile label="설립연도" value={profile?.established_year} /><Profile label="사원수" value={profile?.employee_count} /><Profile label="진행 중인 공고" value={`${jobs.length}건`} highlight /><Profile wide label="대표게임" value={profile?.representative_game} /><Profile wide label="주요사업" value={profile?.main_business} /></div>
      <div className="company-analysis-grid"><Panel eyebrow="HIRING MOMENTUM" title="채용 변화"><div className="company-kpi"><span>이전</span><b>{companyRow?.previous?.toLocaleString() ?? '-'}건</b><i /><span>현재</span><b>{companyRow?.current?.toLocaleString() ?? jobs.length.toLocaleString()}건</b></div><p>{selectedChange == null ? '비교 가능한 이전 데이터가 없습니다.' : `전월 대비 ${fmtChange(selectedChange)} 변했습니다.`}</p></Panel><Panel eyebrow="JOB MIX" title="채용 직무 구성"><Bars rows={jobMix} /></Panel></div>
      <section className="company-news"><div className="section-heading compact"><div><span>NEWS SIGNAL</span><h2>관련 뉴스와 채용 시그널</h2></div></div>{relatedNews.length ? <NewsCards news={relatedNews} company={selected} change={selectedChange} /> : <Empty icon={Newspaper} title="연결된 뉴스가 없어요" text="확인된 뉴스가 없으므로 공고 변화의 원인을 추정하지 않습니다." />}</section>
      <div className="section-heading compact"><div><span>OPEN POSITIONS</span><h2>진행 중인 공고</h2></div><b>{jobs.length}건</b></div><JobCards jobs={jobs} detailed signals={jobSignals(data.report)} /></article>}
    </div>
  </section>
}

function Reports({ data }: { data: Data }) {
  const report = data.report
  const stats = report.statistics || {}
  const jobMoves = movementRows(stats.by_category || [])
  const companyMoves = movementRows(stats.by_company || [])
  const careerMoves = movementRows(stats.by_career || [])
  const emptyText = '이번 달 해설을 준비하고 있습니다. 통계와 그래프는 정상적으로 확인할 수 있습니다.'
  return <section><PageTitle eyebrow="MONTHLY INSIGHT" title="월간 리포트" description={`${report.period} 채용시장 분석을 확인하세요.`} />
    <div className="report-hero"><div><FileText size={28} /><span>{report.status === 'complete' ? '분석 완료' : '통계 공개 · 해설 준비 중'}</span><h2>{report.period.replace('-', '년 ')}월<br />게임업계 채용 리포트</h2><p>{report.comparison_label ? `${report.comparison_label} 채용 변화와 ` : '채용 변화와 '}업계 뉴스를 함께 검토해 강세·약세와 관찰 포인트를 분석합니다.</p></div>{report.markdown && <a className="primary-button" href={`reports/${report.period}.md`} download>Markdown 다운로드 <ArrowUpRight size={18} /></a>}</div>
    {report.is_sample && <div className="status-strip warning">화면 검증용 예시 리포트입니다.</div>}
    <div className="report-kpis"><Kpi icon={BriefcaseBusiness} label="전체 공개 공고" value={`${(stats.total_open ?? 0).toLocaleString()}건`} sub={`전월 대비 ${fmtChange(stats.change)}`} primary /><Kpi icon={Sparkles} label="신규 공고" value={`${stats.new_count ?? '-'}건`} sub="이번 기간 새로 확인" /><Kpi icon={Clock3} label="종료 공고" value={`${stats.closed_count ?? '-'}건`} sub="이전 기간 대비 종료" /><Kpi icon={CheckCircle2} label="유지 공고" value={`${stats.maintained_count ?? '-'}건`} sub="두 기간 모두 확인" /></div>
    <div className="report-chart-grid"><Panel eyebrow="MARKET SIZE" title="전체 공고 비교"><ComparisonBars previous={stats.previous_total} current={stats.total_open} labels={[report.baseline_period || '이전', report.current_period || report.period]} /></Panel><Panel eyebrow="JOB MOMENTUM" title="직무 강세·약세"><DeltaBars rows={jobMoves.slice(0, 10)} /></Panel><Panel eyebrow="COMPANY MOVERS" title="회사별 주요 변동"><DeltaBars rows={companyMoves.slice(0, 10)} /></Panel><Panel eyebrow="CAREER MIX" title="경력별 변화"><DeltaBars rows={careerMoves.slice(0, 8)} /></Panel></div>
    <div className="section-heading compact"><div><span>NEWS & HIRING SIGNAL</span><h2>뉴스와 채용 변화</h2></div><b>{report.news?.length || 0}건</b></div>
    {(report.news || []).length ? <NewsCards news={(report.news || []).slice(0, 8)} /> : <div className="data-warning"><AlertCircle size={20} /><div><b>수집된 뉴스가 없습니다.</b><p>뉴스 근거가 없으므로 회사 공고 변화의 원인을 추정하지 않습니다. 다음 월간 수집에서 뉴스가 확보되면 관련 가능성을 함께 표시합니다.</p></div></div>}
    <div className="section-heading compact"><div><span>ANALYST COMMENT</span><h2>시장 해설</h2></div></div>
    {report.markdown ? <Panel className="report-panel"><article className="report"><ReportMarkdown markdown={report.markdown} /></article></Panel> : <Empty icon={Sparkles} title="시장 해설을 준비하고 있어요" text={emptyText} />}
    <ReportMethod report={report} />
  </section>
}

function ReportMethod({ report }: { report: Report }) {
  const method = report.methodology
  if (!method) return null
  const e = method.evidence
  return <section className="method-card"><div className="method-heading"><div><span>ANALYSIS TRANSPARENCY</span><h2>분석 근거와 작성 기준</h2></div><b>프롬프트 {method.prompt_version}</b></div>
    <div className="evidence-grid"><div><span>비교 기간</span><b>{e.baseline_period || '기준 없음'} → {e.current_period || report.period}</b></div><div><span>오픈 공고</span><b>{e.previous_open_jobs?.toLocaleString() || '-'}건 → {e.current_open_jobs?.toLocaleString() || '-'}건</b></div><div><span>AI에 전달한 근거</span><b>공고 {e.job_examples_sent} · 뉴스 {e.news_sent_to_model}</b></div><div><span>뉴스 검토 범위</span><b>{e.news_date_from || '-'} ~ {e.news_date_to || '-'}</b></div></div>
    <p className="input-description">{method.input_description}</p><ul>{method.rules.map(rule => <li key={rule}>{rule}</li>)}</ul>
    <details><summary>GPT에 전달하는 전체 프롬프트 보기</summary><pre>{method.system_prompt}</pre></details>
  </section>
}

function ReportMarkdown({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/\\([*|`#])/g, '$1').split('\n')
  const blocks: React.ReactNode[] = []
  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim()
    if (line.startsWith('|') && lines[index + 1]?.trim().match(/^\|?[\s:|-]+\|?$/)) {
      const rows:string[][] = []
      const headers = splitTableRow(line)
      index += 2
      while (index < lines.length && lines[index].trim().startsWith('|')) rows.push(splitTableRow(lines[index++]))
      blocks.push(<div className="report-table-wrap" key={`table-${index}`}><table><thead><tr>{headers.map((cell, i) => <th key={i}>{renderInline(cell)}</th>)}</tr></thead><tbody>{rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{renderInline(cell)}</td>)}</tr>)}</tbody></table></div>)
      continue
    }
    index += 1
    if (!line) continue
    const content = line.startsWith('### ') ? line.slice(4) : line.startsWith('## ') ? line.slice(3) : line.startsWith('# ') ? line.slice(2) : line.startsWith('> ') ? line.slice(2) : line.replace(/^[-*•]\s+/, '')
    const rendered = renderInline(content)
    if (line.startsWith('### ')) blocks.push(<h4 key={index}>{rendered}</h4>)
    else if (line.startsWith('## ')) blocks.push(<h3 key={index}>{rendered}</h3>)
    else if (line.startsWith('# ')) blocks.push(<h2 key={index}>{rendered}</h2>)
    else if (line.startsWith('> ')) blocks.push(<blockquote key={index}>{rendered}</blockquote>)
    else if (/^[-*•]\s+/.test(line)) blocks.push(<p className="report-bullet" key={index}>• {rendered}</p>)
    else blocks.push(<p key={index}>{rendered}</p>)
  }
  return <>{blocks}</>
}

function renderInline(text: string) {
  const pattern = /\[([^\]]+)]\((https?:\/\/[^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g
  const nodes: React.ReactNode[] = []
  let cursor = 0, match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index))
    if (match[1]) nodes.push(<a href={match[2]} target="_blank" rel="noreferrer" key={`${match.index}-${match[2]}`}>{match[1]}</a>)
    else if (match[3]) nodes.push(<strong key={`strong-${match.index}`}>{match[3]}</strong>)
    else nodes.push(<code key={`code-${match.index}`}>{match[4]}</code>)
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

function splitTableRow(line:string) { return line.replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()) }

function PageTitle({ eyebrow, title, description, count, countLabel = '개 공고' }: { eyebrow: string; title: string; description: string; count?: number; countLabel?: string }) {
  return <div className="page-title"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{count !== undefined && <div className="page-count"><strong>{count.toLocaleString()}</strong><span>{countLabel}</span></div>}</div>
}

function Kpi({ icon: Icon, label, value, sub, primary = false }: { icon: typeof BriefcaseBusiness; label: string; value: string; sub: string; primary?: boolean }) {
  return <div className={`kpi${primary ? ' primary' : ''}`}><div><span>{label}</span><Icon size={19} /></div><strong>{value}</strong><small>{sub}</small></div>
}

function Panel({ eyebrow, title, children, className = '' }: { eyebrow?: string; title?: string; children: React.ReactNode; className?: string }) {
  return <div className={`panel ${className}`}>{title && <div className="panel-title">{eyebrow && <span>{eyebrow}</span>}<h3>{title}</h3></div>}{children}</div>
}

function Trend({ history }: { history: History }) {
  if (!history.months.length) return <Empty title="아직 추이 데이터가 없어요" text="다음 월간 스냅샷부터 변화가 표시돼요." />
  const values = history.months.map(row => row.total_open)
  const min = Math.min(...values), max = Math.max(...values), spread = Math.max(1, max - min)
  const floor = Math.max(0, min - spread * .35), ceiling = max + spread * .25
  const x = (index:number) => 58 + index * (900 / Math.max(1, values.length - 1))
  const y = (value:number) => 22 + (ceiling - value) / Math.max(1, ceiling - floor) * 200
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(' ')
  const area = `58,222 ${points} ${x(values.length - 1)},222`
  const gridValues = [0, 1, 2, 3].map(index => Math.round(floor + (ceiling - floor) * index / 3)).reverse()
  return <div className="chart"><svg className="trend-svg" viewBox="0 0 1000 270" preserveAspectRatio="none" role="img" aria-label="월별 채용공고 추이"><defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3182f6" stopOpacity=".3" /><stop offset="1" stopColor="#3182f6" stopOpacity="0" /></linearGradient></defs>{gridValues.map(value => <g key={value}><line x1="58" x2="958" y1={y(value)} y2={y(value)} /><text x="0" y={y(value) + 4}>{value.toLocaleString()}</text></g>)}<polygon points={area} fill="url(#trendFill)" /><polyline points={points} /><g>{history.months.map((row, index) => <g key={row.month}><circle cx={x(index)} cy={y(row.total_open)} r="5"><title>{row.month}: {row.total_open.toLocaleString()}건</title></circle><text className="x-label" x={x(index)} y="252" textAnchor={index === 0 ? 'start' : index === history.months.length - 1 ? 'end' : 'middle'}>{row.month}</text></g>)}</g></svg></div>
}

function RankList({ rows, to }: { rows: { name: string; count: number; description?: string | null }[]; to: string }) {
  return <div className="rank-list">{rows.map((row, i) => <NavLink to={to} key={row.name}><em>{i + 1}</em><span><b>{row.name}</b>{row.description && <small>{row.description}</small>}</span><strong>{row.count.toLocaleString()}</strong><ChevronRight size={16} /></NavLink>)}</div>
}

function Bars({ rows }: { rows: { name: string; count: number }[] }) {
  const max = rows[0]?.count || 1
  return <div className="bars">{rows.map(row => <div key={row.name}><span>{row.name}</span><div><i style={{ width: `${row.count / max * 100}%` }} /></div><b>{row.count.toLocaleString()}</b></div>)}</div>
}

function DeltaBars({ rows }: { rows: { name:string;change:number|null;current:number;previous:number|null }[] }) {
  const max = Math.max(1, ...rows.map(row => Math.abs(row.change || 0)))
  return <div className="delta-bars">{rows.map(row => <div key={row.name}><span title={row.name}>{row.name}</span><div className="delta-track"><i className={(row.change || 0) >= 0 ? 'up' : 'down'} style={{ width: `${Math.max(3, Math.abs(row.change || 0) / max * 100)}%` }} /></div><ChangeBadge value={row.change} /></div>)}</div>
}

function ComparisonBars({ previous, current, labels }: { previous:number|null;current:number;labels:[string,string] }) {
  const max = Math.max(previous || 0, current || 0, 1)
  return <div className="comparison-bars">{[[labels[0], previous], [labels[1], current]].map(([label, value], index) => <div key={String(label)}><span>{label}</span><div><i className={index ? 'current' : ''} style={{ width: `${Number(value || 0) / max * 100}%` }} /></div><b>{value == null ? '-' : Number(value).toLocaleString()}건</b></div>)}</div>
}

function NewsCards({ news, company, change }: { news:NonNullable<Report['news']>;company?:string;change?:number|null }) {
  return <div className="news-grid">{news.map(item => <a className="news-card" href={item.url} target="_blank" rel="noreferrer" key={item.url}><div><span>{item.issue_type || '업계뉴스'}</span><time>{item.published_at || '날짜 미확인'}</time></div><h3>{item.title}</h3><p>{item.summary || '원문에서 자세한 내용을 확인하세요.'}</p>{company && <small>{company} 공고 {fmtChange(change ?? null)} · 뉴스와의 인과는 원문 확인 필요</small>}<b>{item.source} <ArrowUpRight size={14} /></b></a>)}</div>
}

function JobCards({ jobs, detailed = false, signals = {} }: { jobs: Job[]; detailed?: boolean; signals?:Record<string,string[]> }) {
  return <div className={`job-list${detailed ? ' detailed' : ''}`}>{jobs.map(job => <a className="job-card" href={job.url} target="_blank" rel="noreferrer" key={job.id}><div className="job-company"><Logo name={job.company} url={job.logo_url} /><span><b>{job.company}</b><small>{job.representative_game || '대표게임 정보 없음'}</small></span>{signals[job.id]?.length ? <div className="job-signals">{signals[job.id].map(signal => <em className={signal === '재게시' ? 'repost' : ''} key={signal}>{signal}</em>)}</div> : null}</div><div className="job-content"><h3>{job.title}</h3><div className="tags">{majorCategories(job).map(category => <span key={category}>{category}</span>)}{subCategories(job).slice(0, 3).map(category => <span className="subtag" key={category}>{category}</span>)}</div><div className="job-meta"><span><BriefcaseBusiness size={14} />{job.career || '경력 미확인'}</span><span><MapPin size={14} />{job.location || '지역 미확인'}</span><span><CalendarDays size={14} />{job.always_open ? '상시채용' : job.deadline || '마감일 미확인'}</span></div></div><span className="open-icon"><ArrowUpRight size={18} /></span></a>)}</div>
}

function Pagination({ page, total, setPage }: { page:number; total:number; setPage:(page:number)=>void }) {
  if (total <= 1) return null
  const pages = pageWindow(page, total)
  const move = (next:number) => { setPage(Math.max(1, Math.min(total, next))); window.scrollTo({ top: 180, behavior: 'smooth' }) }
  return <nav className="pagination" aria-label="공고 페이지 이동"><button onClick={() => move(1)} disabled={page === 1} aria-label="첫 페이지"><ChevronsLeft size={18} /></button><button onClick={() => move(page - 1)} disabled={page === 1} aria-label="이전 페이지"><ChevronLeft size={18} /></button>{pages.map(number => <button className={number === page ? 'active' : ''} onClick={() => move(number)} aria-current={number === page ? 'page' : undefined} key={number}>{number}</button>)}<button onClick={() => move(page + 1)} disabled={page === total} aria-label="다음 페이지"><ChevronRight size={18} /></button><button onClick={() => move(total)} disabled={page === total} aria-label="마지막 페이지"><ChevronsRight size={18} /></button><span>{page} / {total}</span></nav>
}

function Profile({ label, value, wide = false, highlight = false }: { label: string; value?: string | null; wide?: boolean; highlight?: boolean }) {
  return <div className={`${wide ? 'wide ' : ''}${highlight ? 'highlight' : ''}`}><span>{label}</span><b>{value || '정보 없음'}</b></div>
}

function ChangeBadge({ value, large = false }: { value:number|null; large?:boolean }) {
  if (value == null) return <span className={`change-badge neutral${large ? ' large' : ''}`}>기준 없음</span>
  if (value === 0) return <span className={`change-badge neutral${large ? ' large' : ''}`}>— 0</span>
  return <span className={`change-badge ${value > 0 ? 'up' : 'down'}${large ? ' large' : ''}`}>{value > 0 ? '▲' : '▼'} {Math.abs(value).toLocaleString()}</span>
}

function Select({ value, set, label, values }: { value: string; set: (value: string) => void; label: string; values: (string | null)[] }) {
  return <select value={value} onChange={e => set(e.target.value)}><option value="">{label}</option>{[...new Set(values.filter(Boolean) as string[])].sort().map(v => <option key={v}>{v}</option>)}</select>
}

function Logo({ name, url }: { name: string; url: string | null }) {
  const [failed, setFailed] = useState(false)
  return url && !failed ? <img className="logo" src={url.replaceAll('\\', '/')} alt={`${name} 로고`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span className="logo fallback">{name.slice(0, 1)}</span>
}

function Empty({ title, text, icon: Icon }: { title: string; text: string; icon?: typeof FileText }) {
  return <div className="empty">{Icon && <span><Icon size={26} /></span>}<b>{title}</b><p>{text}</p></div>
}

function countCategories(jobs: Job[]) {
  const counts: Record<string, number> = {}
  jobs.forEach(job => majorCategories(job).forEach(category => { counts[category] = (counts[category] || 0) + 1 }))
  return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
}

function countSubCategories(jobs: Job[]) {
  const counts: Record<string, number> = {}
  jobs.forEach(job => subCategories(job).forEach(category => { counts[category] = (counts[category] || 0) + 1 }))
  return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
}

function countSubCategoriesForMajor(jobs:Job[], major:string, taxonomy:Record<string,string[]>) {
  const counts:Record<string,number> = {}
  jobs.forEach(job => subCategoriesForMajor(job, major, taxonomy).forEach(category => { counts[category] = (counts[category] || 0) + 1 }))
  return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
}

function majorCategories(job: Job) { return job.job_major_categories?.length ? job.job_major_categories : job.categories }
function subCategories(job: Job) { return job.job_subcategories?.length ? job.job_subcategories : job.original_categories }
function subCategoriesForMajor(job:Job, major:string, taxonomy:Record<string,string[]>) {
  const allowed = new Set(taxonomy[major] || [])
  return subCategories(job).filter(value => allowed.has(value))
}

function movementRows(rows:{name:string;current:number;previous:number|null;change:number|null}[]) {
  return [...rows].filter(row => row.change != null).sort((a, b) => Math.abs(b.change || 0) - Math.abs(a.change || 0))
}

function matchCompanyNews(company:string, news:NonNullable<Report['news']>) {
  const needle = company.replace(/\(주\)|㈜|주식회사|\s/g, '').toLowerCase()
  return news.filter(item => `${item.title} ${item.summary || ''} ${(item.companies || []).join(' ')}`.replace(/\s/g, '').toLowerCase().includes(needle))
}

function jobSignals(report:Report) {
  const result:Record<string,string[]> = {}
  for (const id of report.statistics?.new_ids || []) (result[id] ||= []).push('신규')
  for (const row of report.statistics?.reposted || []) (result[row.current_id] ||= []).push('재게시')
  return result
}

function splitValues(value:string|null) { return (value || '').split(',').map(item => item.trim()).filter(Boolean) }

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((result, item) => { (result[getKey(item)] ??= []).push(item); return result }, {})
}

function fmtChange(value: number | null) { return value == null ? '기준 없음' : `${value > 0 ? '+' : ''}${value.toLocaleString()}건` }
function formatDate(value: string) { return new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) }
