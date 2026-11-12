// Yarım kalan başlangıç stoğu düzenlemesi (3129 v4.3, Risk K10): yalnız bu tarayıcıda, kişi + dosya özetiyle anahtarlı, 24 saat.
// IndexedDB (2000 satır localStorage sınırını aşabilir). Depo açılamazsa (gizli pencere, eski tarayıcı) sessizce yok sayılır:
// düzenleme yine çalışır, yalnız saklanmaz. Başarılı yüklemede ve süre dolunca silinir.
import type { SutunEslemesi } from '../../ortak/excel/esleme.ts';
import type { BaslangicSatiri } from './baslangic.ts';

export const TASLAK_SURESI_MS = 24 * 60 * 60 * 1000;

export interface BaslangicTaslagi {
  anahtar: string;
  kisiId: number;
  zaman: number;
  dosyaAdi: string;
  ozet: string;
  basliklar: string[];
  esleme: SutunEslemesi;
  satirlar: BaslangicSatiri[];
}

const VT_ADI = 'tmi-stok-baslangic';
const DEPO_ADI = 'taslak';
export const taslakAnahtari = (kisiId: number, ozet: string): string => `${String(kisiId)}:${ozet}`;

function istekSoz<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((coz, reddet) => { r.onsuccess = () => coz(r.result); r.onerror = () => reddet(r.error ?? new Error('Tarayıcı deposu okunamadı')); });
}

let acik: Promise<IDBDatabase> | null = null;
const vt = (): Promise<IDBDatabase> => {
  acik ??= new Promise((coz, reddet) => {
    const r = indexedDB.open(VT_ADI, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(DEPO_ADI, { keyPath: 'anahtar' }); };
    r.onsuccess = () => coz(r.result);
    r.onerror = () => { acik = null; reddet(r.error ?? new Error('Tarayıcı deposu açılamadı')); };
  });
  return acik;
};
const islem = async <T>(kip: IDBTransactionMode, is: (d: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
  istekSoz(is((await vt()).transaction(DEPO_ADI, kip).objectStore(DEPO_ADI)));
const depoVar = (): boolean => { try { return typeof indexedDB !== 'undefined'; } catch { return false; } };

export async function taslakYaz(t: Omit<BaslangicTaslagi, 'anahtar' | 'zaman'>, simdi = Date.now()): Promise<void> {
  if (!depoVar()) return;
  try { await islem('readwrite', (d) => d.put({ ...t, anahtar: taslakAnahtari(t.kisiId, t.ozet), zaman: simdi })); } catch { /* saklanamazsa düzenleme sürer */ }
}

export async function taslakSil(kisiId: number, ozet: string): Promise<void> {
  if (!depoVar()) return;
  try { await islem('readwrite', (d) => d.delete(taslakAnahtari(kisiId, ozet))); } catch { /* yok sayılır */ }
}

// Bu kişinin süresi dolmamış en yeni taslağı; süresi dolanlar (her kişinin) silinir.
export async function sonTaslak(kisiId: number, simdi = Date.now()): Promise<BaslangicTaslagi | null> {
  if (!depoVar()) return null;
  try {
    const hepsi = await islem('readonly', (d) => d.getAll() as IDBRequest<BaslangicTaslagi[]>);
    const eski = hepsi.filter((t) => simdi - t.zaman > TASLAK_SURESI_MS);
    for (const t of eski) await islem('readwrite', (d) => d.delete(t.anahtar));
    return hepsi.filter((t) => t.kisiId === kisiId && simdi - t.zaman <= TASLAK_SURESI_MS).sort((a, b) => b.zaman - a.zaman)[0] ?? null;
  } catch {
    return null;
  }
}
