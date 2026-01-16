type StoreName = 'kv'

const DB_NAME = 'gongzhuang-mis'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction('kv', mode)
    const store = tx.objectStore('kv' as StoreName)
    fn(store).then(resolve).catch(reject)
    tx.oncomplete = () => db.close()
    tx.onerror = () => {
      const err = tx.error
      db.close()
      reject(err)
    }
    tx.onabort = () => {
      const err = tx.error
      db.close()
      reject(err)
    }
  })
}

export async function idbGet<T = any>(key: string): Promise<T | undefined> {
  try {
    return await withStore('readonly', (store) => {
      return new Promise<T | undefined>((resolve, reject) => {
        const req = store.get(key)
        req.onsuccess = () => resolve(req.result as any)
        req.onerror = () => reject(req.error)
      })
    })
  } catch {
    return undefined
  }
}

export async function idbSet<T = any>(key: string, value: T): Promise<boolean> {
  try {
    await withStore('readwrite', (store) => {
      return new Promise<void>((resolve, reject) => {
        const req = store.put(value as any, key)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    })
    return true
  } catch {
    return false
  }
}

export async function idbDel(key: string): Promise<void> {
  try {
    await withStore('readwrite', (store) => {
      return new Promise<void>((resolve, reject) => {
        const req = store.delete(key)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    })
  } catch {}
}

