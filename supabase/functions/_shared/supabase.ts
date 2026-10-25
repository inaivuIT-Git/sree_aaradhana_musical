// Small Supabase REST helpers for the payment functions. Plain fetch, so the
// functions have no dependencies to download.

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

// Legacy keys are JWTs and also go in the Authorization header; the newer
// sb_secret_ / sb_publishable_ keys only go in the apikey header.
function keyHeaders(key: string): Record<string, string> {
  return key.startsWith('eyJ') ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
}

export class DatabaseError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...keyHeaders(SERVICE_KEY),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new DatabaseError(data?.message ?? `Database returned ${response.status}`, data?.code ?? '', response.status);
  }
  return data as T;
}

// Reads and writes with the service role, which is not limited by row level security.
export const db = {
  select<T>(table: string, query: string): Promise<T[]> {
    return call<T[]>(`${table}?${query}`, { method: 'GET' });
  },
  insert<T>(table: string, row: Record<string, unknown>): Promise<T[]> {
    return call<T[]>(table, { method: 'POST', body: JSON.stringify(row) });
  },
  rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    return call<T>(`rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });
  },
};

export interface SignedInUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

// Checks the caller's sign-in token with Supabase Auth.
export async function getUser(req: Request): Promise<SignedInUser | null> {
  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY || SERVICE_KEY, Authorization: authorization },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user?.id ? (user as SignedInUser) : null;
}
