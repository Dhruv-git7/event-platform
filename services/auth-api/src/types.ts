export interface User {
  id: string
  tenant_id: string
  email: string
  role: string
  is_active: boolean
}

export interface JwtPayload {
  userId: string
  tenantId: string
  email: string
  role: string
}

export interface LoginBody {
  email: string
  password: string
}

export interface ApiKeyPayload {
  id: string
  tenant_id: string
  scopes: string[]
}