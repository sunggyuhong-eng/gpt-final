export type Job = {
  id: string; company: string; title: string; url: string; categories: string[];
  original_categories: string[]; career: string | null; employment_type: string | null;
  location: string | null; posted_at: string | null; deadline: string | null;
  always_open: boolean; logo_url: string | null; representative_game: string | null; collected_at: string;
  company_url?: string | null; company_type?: string | null; main_business?: string | null;
  established_year?: string | null; employee_count?: string | null;
}

export type News = {
  id: string; source: string; title: string; url: string; published_at: string | null;
  summary: string | null; related_companies: string[]; related_games: string[];
  keywords: string[]; issue_type: string; related_sources: {source:string;url:string}[];
}

export type Snapshot = { schema_version:number; period:string; collected_at:string; is_sample:boolean; jobs:Job[]; news:News[] }
export type History = { is_sample?:boolean; months:{month:string;total_open:number;new_count:number|null;closed_count:number|null}[] }
export type Report = { period:string; is_sample:boolean; status:string; statistics:any; markdown:string|null; error?:string }
export type Status = { is_sample:boolean; success:boolean; finished_at:string; message?:string; sources:{name:string;status:string;count:number;error?:string}[] }
