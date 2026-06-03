import snowflake from 'snowflake-sdk'

// Snowflake 드라이버 로그 레벨 설정
snowflake.configure({ logLevel: 'ERROR' })

function buildConnectionOptions(): snowflake.ConnectionOptions {
  const rawKey = process.env.SNOWFLAKE_PRIVATE_KEY
  if (!rawKey) throw new Error('환경변수 SNOWFLAKE_PRIVATE_KEY가 설정되지 않았습니다.')
  const privateKey = rawKey.replace(/\\n/g, '\n')

  // snowflake-sdk v1.15+ requires account to be a plain subdomain (no dots).
  const rawAccount = process.env.SNOWFLAKE_ACCOUNT!
  const accountParts = rawAccount.split('.')
  const account = accountParts[0]
  const host = accountParts.length > 1 ? `${rawAccount}.snowflakecomputing.com` : undefined

  const opts: snowflake.ConnectionOptions = {
    account,
    username: process.env.SNOWFLAKE_USERNAME!,
    authenticator: 'SNOWFLAKE_JWT',
    privateKey,
    database: process.env.SNOWFLAKE_DATABASE!,
    schema: process.env.SNOWFLAKE_SCHEMA!,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE!,
  }

  if (host) (opts as any).host = host

  const passphrase = process.env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE
  if (passphrase) {
    opts.privateKeyPass = passphrase
  }

  return opts
}

/**
 * 연결을 생성하고 SQL을 실행한 뒤 연결을 닫습니다.
 * Snowflake 드라이버는 컬럼명을 대문자로 반환하므로 소문자로 변환합니다.
 */
async function withConnection<T>(fn: (conn: snowflake.Connection) => Promise<T>): Promise<T> {
  const conn = snowflake.createConnection(buildConnectionOptions())

  await new Promise<void>((resolve, reject) => {
    conn.connect((err) => {
      if (err) reject(new Error(`Snowflake 연결 실패: ${err.message}`))
      else resolve()
    })
  })

  try {
    return await fn(conn)
  } finally {
    conn.destroy((err) => {
      if (err) console.error('Snowflake 연결 종료 오류:', err.message)
    })
  }
}

/** Snowflake가 반환한 행의 컬럼명을 소문자로 변환하고 ARRAY/VARIANT 타입을 파싱합니다. */
function normalizeRow(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [key, value] of Object.entries(row)) {
    const lk = key.toLowerCase()
    // ARRAY/VARIANT는 문자열로 반환되므로 파싱
    if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
      try {
        out[lk] = JSON.parse(value)
      } catch {
        out[lk] = value
      }
    } else {
      out[lk] = value
    }
  }
  return out
}

/** SQL을 실행하고 정규화된 행 배열을 반환합니다. */
export async function executeQuery<T = Record<string, any>>(
  sql: string,
  binds: any[] = []
): Promise<T[]> {
  return withConnection((conn) => {
    return new Promise<T[]>((resolve, reject) => {
      conn.execute({
        sqlText: sql,
        binds: binds as any,
        complete: (err, _stmt, rows) => {
          if (err) reject(new Error(err.message))
          else resolve(((rows || []) as Record<string, any>[]).map(normalizeRow) as T[])
        },
      })
    })
  })
}

/** SQL을 실행하고 첫 번째 행만 반환합니다 (없으면 null). */
export async function executeOne<T = Record<string, any>>(
  sql: string,
  binds: any[] = []
): Promise<T | null> {
  const rows = await executeQuery<T>(sql, binds)
  return rows[0] ?? null
}

/** INSERT/UPDATE/DELETE 전용 — 반환값 없음. */
export async function executeMutation(sql: string, binds: any[] = []): Promise<void> {
  await executeQuery(sql, binds)
}
