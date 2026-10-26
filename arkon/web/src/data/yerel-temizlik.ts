// Çıkışta Arkon'un cihazdaki verisi silinir (karar 102 a): paylaşılan tablette sonraki kişi öncekinin verisini görmesin.
// Gönderilmemiş kayıt kuyruğu (IndexedDB 'outbox') ve kuyruğun işaret ettiği belgeler kalır; yoksa bekleyen kayıt kaybolur
// (flush belgeyi gönderim anında yerel depodan okur).

/** Arkon'un localStorage anahtar öneki (store.ts LS). */
const ONEK = 'arkon:';
const KUYRUK = 'outbox';
const VT_ADI = 'arkon-mes';

/* Silinmeyen anahtarlar. Cihaz ayarı: sunucu adresi, tema, istasyon seçimi, performans ve görünüm ayarları.
   Aşağıdaki "emin olunmayan" gruplar kişiye ait olmayan ekran tercihi sayıldı; silinmesi kararı ayrıca istenir. */
const KALAN_ANAHTARLAR: ReadonlySet<string> = new Set([
  'server', 'theme', 'station', 'lite', 'feat', 'scale', 'cihazKipi',
  'readCfg', 'pvStation', 'labOpen', 'setTab', 'planTab', 'maintTab', 'repRange', 'prepGrup', 'prepSuzAcik', 'planWc', 'boardWc',
]);
const KALAN_ONEKLER: readonly string[] = ['bal:', 'lastState:'];

/** `arkon:` önekli anahtardan (öneksiz ad) silinmesi gerekip gerekmediği; bilinmeyen yeni anahtar silinir. */
export const anahtarSilinir = (ad: string): boolean => !KALAN_ANAHTARLAR.has(ad) && !KALAN_ONEKLER.some((o) => ad.startsWith(o));

export interface KuyrukOgesi { op?: string; store?: string; id?: string }

/* Kuyrukta bekleyen yazmanın belgesi (aynı depo + anahtar) ve ona bağlı sürüm/taban kaydı (herhangi bir depoda `depo\0anahtar`)
   kalır. Depo adı tek tek sayılmaz: yeni eklenen bir depo da kapsanır. */
export function anahtarKalir(depo: string, anahtar: IDBValidKey, kuyruk: readonly KuyrukOgesi[]): boolean {
  if (depo === KUYRUK) return true;
  const k = String(anahtar);
  return kuyruk.some((o) => typeof o?.store === 'string' && typeof o.id === 'string' && (o.store === depo && o.id === k || o.store + '\u0000' + o.id === k));
}

/* Ortak cihazda (karar 738 a, kart #739) çizim dosyaları ve onlardan üretilen ekran önbelleği çıkışta kalır: kişiye ait değildir,
   sonraki kişi aynı işin çizimini yeniden indirmez. Kişisel cihaz bunları da siler. */
export const ORTAK_CIHAZDA_KALAN_DEPOLAR: ReadonlySet<string> = new Set(['blobs', 'blobzaman', 'cache']);

function localStorageTemizle(ls: Storage): void {
  try {
    const silinecek: string[] = [];
    for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k !== null && k.startsWith(ONEK) && anahtarSilinir(k.slice(ONEK.length))) silinecek.push(k); }
    silinecek.forEach((k) => ls.removeItem(k));
  } catch { /* depolama kapalıysa silinecek bir şey de yoktur */ }
}

// Veritabanı yoksa açmak boş bir veritabanı yaratırdı: yükseltme başlayınca iptal edilir.
function ac(idb: IDBFactory): Promise<IDBDatabase | null> {
  return new Promise((coz) => {
    try {
      const r = idb.open(VT_ADI);
      r.onupgradeneeded = () => { try { r.transaction?.abort(); } catch { /* iptal edilemese de veri yok */ } };
      r.onsuccess = () => coz(r.result);
      r.onerror = () => coz(null);
    } catch { coz(null); }
  });
}

function istek<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((coz, red) => { r.onsuccess = () => coz(r.result); r.onerror = () => red(r.error); });
}

// Tek işlemde okunur ve silinir: kuyruğa o sırada eklenen öğe, belgesi silinmeden önce görülür.
async function indexedDbTemizle(idb: IDBFactory, kalan: ReadonlySet<string>): Promise<void> {
  const d = await ac(idb);
  if (d === null) return;
  try {
    const adlar = Array.from(d.objectStoreNames);
    if (!adlar.includes(KUYRUK)) return;
    const t = d.transaction(adlar, 'readwrite');
    const bitti = new Promise<void>((coz, red) => { t.oncomplete = () => coz(); t.onerror = () => red(t.error); });
    const kuyruk = (await istek(t.objectStore(KUYRUK).getAll())) as KuyrukOgesi[];
    for (const ad of adlar) {
      if (ad === KUYRUK || kalan.has(ad)) continue;
      const depo = t.objectStore(ad);
      for (const k of await istek(depo.getAllKeys())) if (!anahtarKalir(ad, k, kuyruk)) depo.delete(k);
    }
    await bitti;
  } finally { d.close(); }
}

/** Yerel mod (sunucusuz) çağırmaz: orada kaydın tek kopyası cihazdadır. */
export async function yerelVeriyiTemizle(ls: Storage, idb: IDBFactory | undefined, kalan: ReadonlySet<string> = new Set()): Promise<void> {
  localStorageTemizle(ls);
  if (idb) await indexedDbTemizle(idb, kalan);
}

/** Cihazda gönderilmemiş kayıt var mı; veritabanı yoksa yaratmadan hayır der. */
export async function bekleyenKuyrukVar(idb: IDBFactory): Promise<boolean> {
  const d = await ac(idb);
  if (d === null) return false;
  try {
    if (!Array.from(d.objectStoreNames).includes(KUYRUK)) return false;
    return (await istek(d.transaction(KUYRUK, 'readonly').objectStore(KUYRUK).count())) > 0;
  } finally { d.close(); }
}
