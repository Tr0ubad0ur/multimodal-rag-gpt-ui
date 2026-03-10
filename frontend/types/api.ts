export interface QueryRequest {
  query: string
  top_k?: number
  model?: string
  image?: string | null
  attachment_id?: string | null
  attachment?: File | null
  folder_ids?: string[]
  file_ids?: string[]
}

export interface TextEmbeddingRequest {
  text: string
  provider?: string
}

export interface ImageEmbeddingRequest {
  image_path: string
  provider?: string
}

export interface VideoEmbeddingRequest {
  video_path: string
  sample_fps?: number
  provider?: string
}

export interface EmbeddingResponse {
  provider: string
  modality: 'text' | 'image' | 'video'
  dimension: number
  embedding: number[]
  sample_fps?: number
}

export interface RetrievedDoc {
  id?: string | number
  score?: number
  text?: string
  content?: string
  payload?: Record<string, unknown>
  [key: string]: unknown
}

export type SourceModality = 'text' | 'image' | 'video'

export interface UsedSource {
  file_id?: string | null
  modality?: SourceModality | null
  score?: number | null
  preview_ref?: string | null
  source?: string | null
  [key: string]: unknown
}

export interface QueryResponse {
  answer: string
  used_sources?: UsedSource[] | null
  retrieved_docs?: RetrievedDoc[] | null
  [key: string]: unknown
}

export interface AuthSession {
  access_token: string
  refresh_token: string
  token_type?: string
  expires_in?: number
  expires_at?: number
  [key: string]: unknown
}

export interface AuthUser {
  id: string
  email?: string
  [key: string]: unknown
}

export interface AuthResponse {
  user: AuthUser | null
  session: AuthSession | null
}

export interface HistoryItem {
  id: number
  user_id: string
  query: string
  answer: string
  used_sources?: UsedSource[] | null
  retrieved_docs: RetrievedDoc[] | null
  created_at: string
  [key: string]: unknown
}

export interface HistoryResponse {
  data: HistoryItem[]
}

export interface FileUploadResponse {
  file_id: string
  filename: string
  mime: string
  size: number
  storage_path: string
  ingest_job_id?: string | null
  deduplicated?: boolean
}

export type IngestJobStatus = 'queued' | 'processing' | 'completed' | 'failed'
export type FileProcessingStatus = IngestJobStatus | 'not_indexed'

export interface IngestJob {
  id: string
  user_id?: string | null
  file_id: string
  status: IngestJobStatus
  attempt?: number
  error?: string | null
  created_at?: string
  started_at?: string | null
  finished_at?: string | null
  dead_lettered_at?: string | null
  [key: string]: unknown
}

export interface FileProcessingResponse {
  file_id: string
  status: FileProcessingStatus
  jobs: IngestJob[]
}

export interface IngestDlqItem {
  id: number
  job_id: string
  user_id?: string | null
  reason?: string
  created_at?: string
  payload?: Record<string, unknown>
  [key: string]: unknown
}

export interface FolderUploadItem {
  file_id: string
  filename: string
  mime: string
  size: number
  relative_path: string
  folder_id?: string | null
  ingest_job_id?: string | null
  deduplicated?: boolean
}

export interface FolderUploadResponse {
  uploaded: FolderUploadItem[]
}

export interface KbFolder {
  id: string
  name: string
  parent_id: string | null
  created_at?: string
}

export interface KbFile {
  file_id: string
  folder_id: string | null
  filename: string
  mime?: string
  size?: number
  created_at?: string
}
