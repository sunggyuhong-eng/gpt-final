import { useEffect, useMemo, useState } from 'react'
import { NavLink, Route, Routes, useSearchParams } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3, BriefcaseBusiness, Building2, FileText, LayoutDashboard, Newspaper, Search, ExternalLink } from 'lucide-react'
import { loadAll } from './data'
import type { History, Job, News, Report, Snapshot, Status } from './types'

type Data = {snapshot:Snapshot;history:History;report:Report;status:Status}
const nav = [
  ['/', '대시보드', LayoutDashboard], ['/jobs', '채용공고', BriefcaseBusiness],
  ['/categories', '직무별', BarChart3], ['/companies', '회사별', Building2],
  ['/news', '업계 뉴스', Newspaper], ['/reports', '월간 리포트', FileText],
] as const

export default function App() {
  const [data,setData] = useState<Data|null>(null), [error,setError] = useState('')
  useEffect(()=>{ loadAll().then(setData).catch(e=>setError(e.message)) },[])
  if(error) return <Empty title="데이터를 불러오지 못했습니다" text={error}/>
  if(!data) return <div className="loader">데이터를 불러오는 중…</div>
  return <div className="app"><Header data={data}/><main><Routes><Route path="/" element={<Dashboard data={data}/>}/><Route path="/jobs" element={<Jobs jobs={data.snapshot.jobs}/>}/><Route path="/categories" element={<Categories data={data}/>}/><Route path="/companies" element={<Companies data={data}/>}/><Route path="/news" element={<NewsPage news={data.snapshot.news}/>}/><Route path="/reports" element={<Reports report={data.report}/>}/></Routes></main><nav className="mobile-nav">{nav.map(([to,label,Icon])=><NavLink key={to} to={to} end={to==='/'}><Icon size={19}/>{label}</NavLink>)}</nav></div>
}

function Header({data}:{data:Data}) { return <header className="topbar"><div className="topbar-inner"><NavLink className="brand" to="/"><span>G</span><div>Game Hiring<small>RADAR</small></div></NavLink><nav className="desktop-nav">{nav.map(([to,label,Icon])=><NavLink key={to} to={to} end={to==='/'}><Icon size={17}/>{label}</NavLink>)}</nav><div className="freshness"><i className={data.status.success?'ok':''}/><span>{new Date(data.snapshot.collected_at).toLocaleDateString('ko-KR')} 기준</span>{data.snapshot.is_sample&&<b>예시</b>}</div></div></header> }

function Dashboard({data}:{data:Data}) {
  const jobs=data.snapshot.jobs, companies=new Set(jobs.map(j=>j.company)).size
  const cats=countCategories(jobs), top=cats[0]?.name??'없음', s=data.report.statistics
  const companyRanks=Object.entries(groupBy(jobs,j=>j.company)).map(([name,list])=>({name,count:list.length,game:list[0].representative_game})).sort((a,b)=>b.count-a.count)
  return <section className="dashboard"><div className="hero"><div><span className="eyebrow">GAME INDUSTRY TALENT SIGNAL</span><h1>게임업계 채용 흐름을<br/>한눈에 확인하세요</h1><p>회사와 직무를 비교하고 공고 변화를 매일 추적합니다.</p></div><NavLink className="hero-search" to="/jobs"><Search size={21}/><span>회사명, 직무, 공고를 검색하세요</span><kbd>검색</kbd></NavLink></div><div className="notice">{data.status.message || '정상 수집된 최신 데이터를 표시합니다.'}</div><div className="kpis"><Kpi label="현재 오픈 공고" value={`${jobs.length.toLocaleString()}건`} sub={`전월 대비 ${fmtChange(s.change)}`}/><Kpi label="신규 공고" value={`${s.new_count ?? '-'}건`} sub="이번 공식 스냅샷"/><Kpi label="종료 공고" value={`${s.closed_count ?? '-'}건`} sub="전월 공고 기준"/><Kpi label="채용 중인 회사" value={`${companies}개`} sub="중복 회사 제거"/><Kpi label="최다 채용 직무" value={top} sub={`${cats[0]?.count??0}건`}/></div><div className="grid insight-grid"><Panel title="월별 오픈 공고 추이"><Trend history={data.history}/></Panel><Panel title="채용 회사 TOP 10"><RankList rows={companyRanks.slice(0,10)} to="/companies"/></Panel><Panel title="직무 TOP 10"><RankList rows={cats.slice(0,10)} to="/categories"/></Panel></div><Panel title="최근 등록된 공고"><JobTable jobs={[...jobs].sort((a,b)=>(b.posted_at||'').localeCompare(a.posted_at||'')).slice(0,8)}/></Panel></section>
}

function Jobs({jobs}:{jobs:Job[]}) {
  const [q,setQ]=useState(''), [company,setCompany]=useState(''), [category,setCategory]=useState(''), [career,setCareer]=useState(''), [location,setLocation]=useState(''), [employment,setEmployment]=useState('')
  const list=useMemo(()=>jobs.filter(j=>(!q||`${j.title} ${j.company}`.toLowerCase().includes(q.toLowerCase()))&&(!company||j.company===company)&&(!category||j.categories.includes(category))&&(!career||j.career===career)&&(!location||j.location===location)&&(!employment||j.employment_type===employment)).sort((a,b)=>(b.posted_at||'').localeCompare(a.posted_at||'')),[jobs,q,company,category,career,location,employment])
  return <section><div className="page-title"><div><h2>채용공고</h2><p>{list.length}개의 공고를 찾았습니다.</p></div></div><div className="filters"><label className="search"><Search size={17}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="회사명 또는 공고 검색"/></label><Select value={company} set={setCompany} label="전체 회사" values={jobs.map(j=>j.company)}/><Select value={category} set={setCategory} label="전체 직무" values={jobs.flatMap(j=>j.categories)}/><Select value={career} set={setCareer} label="전체 경력" values={jobs.map(j=>j.career)}/><Select value={location} set={setLocation} label="전체 지역" values={jobs.map(j=>j.location)}/><Select value={employment} set={setEmployment} label="전체 고용형태" values={jobs.map(j=>j.employment_type)}/></div>{list.length?<Panel><JobTable jobs={list}/></Panel>:<Empty title="조건에 맞는 공고가 없습니다" text="필터를 변경해 주세요."/>}</section>
}

function Categories({data}:{data:Data}) {
  const [params,setParams]=useSearchParams(), selected=params.get('category')||''; const counts=countCategories(data.snapshot.jobs)
  const jobs=selected?data.snapshot.jobs.filter(j=>j.categories.includes(selected)):[]
  return <section><div className="page-title"><div><h2>직무별 분석</h2><p>직무를 선택하면 관련 공고를 확인할 수 있습니다.</p></div></div><div className="category-grid">{counts.map(x=><button className={selected===x.name?'active':''} onClick={()=>setParams({category:x.name})} key={x.name}><span>{x.name}</span><b>{x.count}</b><small>공고</small></button>)}</div><div className="grid two"><Panel title="월별 전체 채용 추이"><Trend history={data.history}/></Panel><Panel title="직무별 현재 비중"><div className="bars">{counts.map(x=><div key={x.name}><span>{x.name}</span><i style={{width:`${x.count/(counts[0]?.count||1)*100}%`}}/><b>{x.count}</b></div>)}</div></Panel></div>{selected&&<Panel title={`${selected} 공고`}><JobTable jobs={jobs}/></Panel>}</section>
}

function Companies({data}:{data:Data}) {
  const companies=Object.entries(groupBy(data.snapshot.jobs,j=>j.company)).sort((a,b)=>b[1].length-a[1].length)
  const [selected,setSelected]=useState(companies[0]?.[0]||''); const jobs=companies.find(x=>x[0]===selected)?.[1]||[]
  const profile={...sampleProfiles[selected],...jobs[0]}
  return <section><div className="page-title"><div><h2>회사별 분석</h2><p>회사를 선택하면 기업정보와 진행 중인 공고가 함께 표시됩니다.</p></div></div><div className="company-layout"><div className="company-grid">{companies.map(([name,items])=><button onClick={()=>setSelected(name)} className={name===selected?'active':''} key={name}><Logo name={name} url={items[0].logo_url}/><div><b>{name}</b><span>{items[0].representative_game||'대표게임 미확인'}</span></div><strong>{items.length}</strong></button>)}</div>{selected&&<div className="company-detail"><div className="company-hero"><Logo name={selected} url={profile?.logo_url||null}/><div><span>기업정보</span><h2>{selected}</h2><p>{profile?.representative_game||'대표게임 정보 없음'}</p></div>{profile?.company_url&&<a href={profile.company_url} target="_blank" rel="noreferrer">게임잡 기업정보 <ExternalLink size={15}/></a>}</div><div className="profile-grid"><Profile label="기업형태" value={profile?.company_type}/><Profile label="대표게임" value={profile?.representative_game}/><Profile label="설립연도" value={profile?.established_year}/><Profile label="사원수" value={profile?.employee_count}/><Profile wide label="주요사업" value={profile?.main_business}/></div><h3>진행 중인 공고 <b>{jobs.length}</b></h3><JobTable jobs={jobs}/><h3>관련 뉴스</h3><NewsList news={data.snapshot.news.filter(n=>n.related_companies?.includes(selected))}/></div>}</div></section>
}

function NewsPage({news}:{news:News[]}) { const [source,setSource]=useState(''),[issue,setIssue]=useState(''); const list=news.filter(n=>(!source||n.source===source)&&(!issue||n.issue_type===issue)); return <section><div className="page-title"><div><h2>업계 뉴스</h2><p>기사 전문이 아닌 제목·짧은 요약·원문 링크만 제공합니다.</p></div></div><div className="filters"><Select value={source} set={setSource} label="전체 매체" values={news.map(n=>n.source)}/><Select value={issue} set={setIssue} label="전체 이슈" values={news.map(n=>n.issue_type)}/></div><Panel><NewsList news={list}/></Panel></section> }

function Reports({report}:{report:Report}) { return <section><div className="page-title"><div><h2>월간 리포트</h2><p>{report.period} · {report.status==='complete'?'생성 완료':'생성 대기'}</p></div><a className="download" href={`reports/${report.period}.md`} download>Markdown 다운로드</a></div>{report.is_sample&&<div className="notice warning">아래 내용은 화면 검증용 예시 리포트입니다.</div>}{report.markdown?<Panel><article className="report">{report.markdown.split('\n').map((line,i)=>line.startsWith('# ')?<h2 key={i}>{line.slice(2)}</h2>:line.startsWith('## ')?<h3 key={i}>{line.slice(3)}</h3>:line.startsWith('> ')?<blockquote key={i}>{line.slice(2)}</blockquote>:<p key={i}>{line}</p>)}</article></Panel>:<Empty title="AI 리포트 생성 대기" text={report.error||'분석 결과가 아직 없습니다.'}/>}</section> }

function Kpi({label,value,sub}:{label:string;value:string;sub:string}){return <div className="kpi"><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>}
function RankList({rows,to}:{rows:{name:string;count:number}[];to:string}){return <div className="rank-list">{rows.map((row,i)=><NavLink to={to} key={row.name}><em>{i+1}</em><span>{row.name}</span><b>{row.count.toLocaleString()}건</b></NavLink>)}</div>}
function Profile({label,value,wide=false}:{label:string;value?:string|null;wide?:boolean}){return <div className={wide?'wide':''}><span>{label}</span><b>{value||'정보 없음'}</b></div>}
function Panel({title,children}:{title?:string;children:React.ReactNode}){return <div className="panel">{title&&<h3>{title}</h3>}{children}</div>}
function Trend({history}:{history:History}){return <div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={history.months}><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3182f6" stopOpacity={.25}/><stop offset="1" stopColor="#3182f6" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#eef1f4" vertical={false}/><XAxis dataKey="month" tickLine={false} axisLine={false}/><YAxis tickLine={false} axisLine={false}/><Tooltip/><Area type="monotone" dataKey="total_open" stroke="#3182f6" strokeWidth={3} fill="url(#fill)"/></AreaChart></ResponsiveContainer></div>}
function JobTable({jobs}:{jobs:Job[]}){return <div className="table-wrap"><table><thead><tr><th>회사</th><th>공고</th><th>직무</th><th>경력</th><th>지역</th><th>마감</th><th/></tr></thead><tbody>{jobs.map(j=><tr key={j.id}><td><b>{j.company}</b><small>{j.representative_game}</small></td><td>{j.title}</td><td><div className="tags">{j.categories.map(c=><span key={c}>{c}</span>)}</div></td><td>{j.career||'미확인'}</td><td>{j.location||'미확인'}</td><td>{j.always_open?'상시채용':j.deadline||'미확인'}</td><td><a href={j.url} target="_blank" rel="noreferrer" aria-label="원문 열기"><ExternalLink size={16}/></a></td></tr>)}</tbody></table></div>}
function NewsList({news}:{news:News[]}){if(!news.length)return <Empty title="관련 뉴스가 없습니다" text="수집된 공개 뉴스가 없습니다."/>;return <div className="news-list">{news.map(n=><a href={n.url} target="_blank" rel="noreferrer" key={n.id}><span>{n.source} · {n.published_at||'날짜 미확인'}</span><b>{n.title}</b><p>{n.summary||'요약 없음'}</p><em>{n.issue_type}</em></a>)}</div>}
function Select({value,set,label,values}:{value:string;set:(v:string)=>void;label:string;values:(string|null)[]}){return <select value={value} onChange={e=>set(e.target.value)}><option value="">{label}</option>{[...new Set(values.filter(Boolean) as string[])].sort().map(v=><option key={v}>{v}</option>)}</select>}
function Empty({title,text}:{title:string;text:string}){return <div className="empty"><b>{title}</b><p>{text}</p></div>}
function Logo({name,url}:{name:string;url:string|null}){return url?<img className="logo" src={url} alt=""/>:<span className="logo fallback">{name.slice(0,1)}</span>}
function countCategories(jobs:Job[]){const m:Record<string,number>={};jobs.forEach(j=>j.categories.forEach(c=>m[c]=(m[c]||0)+1));return Object.entries(m).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count)}
function groupBy<T>(list:T[],fn:(x:T)=>string){return list.reduce<Record<string,T[]>>((a,x)=>{(a[fn(x)]??=[]).push(x);return a},{})}
function fmtChange(value:number|null){return value==null?'기준 없음':`${value>0?'+':''}${value}건`}

const sampleProfiles:Record<string,Partial<Job>>={
  '네오아크':{company_type:'중소기업',main_business:'PC·콘솔 RPG 개발',established_year:'2018년',employee_count:'120명'},
  '블루포지':{company_type:'벤처기업',main_business:'멀티플랫폼 게임 개발',established_year:'2020년',employee_count:'85명'},
  '픽셀웨이브':{company_type:'중소기업',main_business:'모바일게임 개발 및 서비스',established_year:'2016년',employee_count:'64명'},
  '오로라랩':{company_type:'벤처기업',main_business:'게임 데이터 플랫폼',established_year:'2021년',employee_count:'42명'},
  '레드캣게임즈':{company_type:'중소기업',main_business:'모바일게임 개발',established_year:'2019년',employee_count:'58명'},
  '문라이트웍스':{company_type:'중소기업',main_business:'온라인게임 개발 및 운영',established_year:'2017년',employee_count:'96명'},
}
