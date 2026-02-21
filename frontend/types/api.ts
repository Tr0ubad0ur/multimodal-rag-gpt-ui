export interface QueryRequest {
  query: string
  top_k?: number
  image?: string | null
}

export interface RetrievedDoc {
  id?: string | number
  score?: number
  text?: string
  content?: string
  payload?: Record<string, unknown>
  [key: string]: unknown
}

export interface QueryResponse {
  answer: string
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
  retrieved_docs: RetrievedDoc[] | null
  created_at: string
  [key: string]: unknown
}

export interface HistoryResponse {
  data: HistoryItem[]
}
