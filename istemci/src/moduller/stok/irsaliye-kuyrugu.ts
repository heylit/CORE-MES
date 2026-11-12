import { useEffect, useSyncExternalStore } from 'react';
import type { IrsaliyeBelgeleriCevabi, IrsaliyeEkleGovdesi } from '#paylasilan/sozlesme/stok-irsaliye.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { ApiHatasi, api } from '../../ortak/veri/api.ts';
import { baglantiDonusunuDinle, kuyrukKaynagi } from '../../ortak/veri/baglanti.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { dosyaYukle } from '../belge-merkezi/disari.ts';
import { irsaliyePdfi } from './irsaliye-pdf.ts';

// 3063 dilim 2 (3056 b): bağlantı yokken irsaliye bu cihazda bekler. İki tür kayıt: mal kabule bağlı olan (mal kabul kaydedildi,
// irsaliye yüklenemedi) bağlantı gelince kendiliğinden gönderilir; bağsız olan (kapıda çekildi) kişi forma ekleyene kadar bekler.
// Servis çalışanı yok (düz http'de çalışmaz): yalnız uygulama açıkken gönderilir. Kayıt çekenindir; yalnız onun oturumuyla gider.

export const BEKLEYEN_SINIRI = 20;

export interface BekleyenIrsaliye {
  id: string;
  kisiId: number;
  zaman: string;
  irsaliyeNo: string;
  sayfa: number;
  pdf: Blob;
  malKabul: { id: number; no: string } | null;
  // Aynı gönderim yeniden denenince sunucu ikinci bağ yazmasın (tekrar koruması).
  istekKimligi: string;
  // Sunucu reddettiyse nedeni; kayıt silinmez, kişi görür.
  hata: string | null;
}

export interface IrsaliyeDeposu {
  hepsi(): Promise<BekleyenIrsaliye[]>;
  yaz(k: BekleyenIrsaliye): Promise<void>;
  sil(id: string): Promise<void>;
}

const VT_ADI = 'tmi-stok-irsaliye';
const DEPO_ADI = 'bekleyen';

function istekSoz<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((coz, reddet) => { r.onsuccess = () => coz(r.result); r.onerror = () => reddet(r.error ?? new Error('Cihaz deposu okunamadı')); });
}

export function tarayiciDeposu(idb: IDBFactory): IrsaliyeDeposu {
  let acik: Promise<IDBDatabase> | null = null;
  const vt = (): Promise<IDBDatabase> => {
    acik ??= new Promise((coz, reddet) => {
      const r = idb.open(VT_ADI, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore(DEPO_ADI, { keyPath: 'id' }); };
      r.onsuccess = () => coz(r.result);
      r.onerror = () => { acik = null; reddet(r.error ?? new Error('Cihaz deposu açılamadı')); };
    });
    return acik;
  };
  const islem = async <T>(kip: IDBTransactionMode, is: (d: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
    istekSoz(is((await vt()).transaction(DEPO_ADI, kip).objectStore(DEPO_ADI)));
  return {
    hepsi: () => islem('readonly', (d) => d.getAll() as IDBRequest<BekleyenIrsaliye[]>),
    yaz: async (k) => { await islem('readwrite', (d) => d.put(k)); },
    sil: async (id) => { await islem('readwrite', (d) => d.delete(id)); },
  };
}

function bellekDeposu(): IrsaliyeDeposu {
  const m = new Map<string, BekleyenIrsaliye>();
  return { hepsi: async () => [...m.values()], yaz: async (k) => { m.set(k.id, k); }, sil: async (id) => { m.delete(id); } };
}

let depo: IrsaliyeDeposu = typeof indexedDB === 'undefined' ? bellekDeposu() : tarayiciDeposu(indexedDB);
let liste: readonly BekleyenIrsaliye[] = [];
let sonKisi: number | null = null;
const dinleyiciler = new Set<() => void>();
const kaynak = kuyrukKaynagi('stok-irsaliye');

function yay(yeni: readonly BekleyenIrsaliye[]): void {
  liste = [...yeni].sort((a, b) => a.zaman.localeCompare(b.zaman));
  // Şerit yalnız kendiliğinden gidecek olanları sayar; bağsız kayıt kişinin eklemesini bekler.
  kaynak.bildir(sonKisi === null ? 0 : liste.filter((k) => k.kisiId === sonKisi && k.malKabul !== null && k.hata === null).length);
  for (const d of dinleyiciler) d();
}

async function tazele(): Promise<void> {
  try { yay(await depo.hepsi()); } catch { yay([]); }
}

// Yalnız testler içindir.
export function depoAyarla(d: IrsaliyeDeposu): void {
  depo = d;
  liste = [];
  sonKisi = null;
  gonderiliyor = null;
}

export function useBekleyenIrsaliyeler(kisiId: number | null): readonly BekleyenIrsaliye[] {
  const tum = useSyncExternalStore((d) => { dinleyiciler.add(d); return () => { dinleyiciler.delete(d); }; }, () => liste, () => liste);
  // Her açılışta cihazdan okunur: başka sekmede saklanan ya da gönderilen kayıt da görünsün.
  useEffect(() => {
    if (kisiId !== null && sonKisi !== kisiId) sonKisi = kisiId;
    void tazele();
  }, [kisiId]);
  return kisiId === null ? [] : tum.filter((k) => k.kisiId === kisiId);
}

async function pdfSayfaSayisi(pdf: Uint8Array): Promise<number> {
  const { PDFDocument } = await import('pdf-lib');
  return (await PDFDocument.load(pdf, { updateMetadata: false })).getPageCount();
}

export class SinirHatasi extends Error {}

// Sayfalar burada PDF olur (bağlantısız da çalışır, pdf-lib uygulamanın içindedir).
export async function irsaliyeyiSakla(
  kisiId: number, girdi: { pdf: Uint8Array; irsaliyeNo: string; malKabul: BekleyenIrsaliye['malKabul'] },
): Promise<BekleyenIrsaliye> {
  await tazele();
  if (girdi.malKabul === null && liste.filter((k) => k.kisiId === kisiId).length >= BEKLEYEN_SINIRI) {
    throw new SinirHatasi(`Bu cihazda en çok ${BEKLEYEN_SINIRI} irsaliye bekleyebilir; önce bekleyenleri mal kabule ekleyin ya da silin.`);
  }
  const k: BekleyenIrsaliye = {
    id: yeniIstekKimligi(), kisiId, zaman: new Date().toISOString(), irsaliyeNo: girdi.irsaliyeNo.trim(), sayfa: await pdfSayfaSayisi(girdi.pdf),
    pdf: new Blob([girdi.pdf as BlobPart], { type: 'application/pdf' }), malKabul: girdi.malKabul, istekKimligi: yeniIstekKimligi(), hata: null,
  };
  await depo.yaz(k);
  await tazele();
  return k;
}

export async function sayfalardanSakla(kisiId: number, dosyalar: readonly File[], irsaliyeNo: string): Promise<BekleyenIrsaliye> {
  return irsaliyeyiSakla(kisiId, { pdf: await irsaliyePdfi(dosyalar), irsaliyeNo, malKabul: null });
}

export async function bekleyeniSil(id: string): Promise<void> {
  await depo.sil(id);
  await tazele();
}

export function bekleyenDosyasi(k: BekleyenIrsaliye): File {
  return new File([k.pdf], k.irsaliyeNo ? `irsaliye-${k.irsaliyeNo}.pdf` : 'irsaliye.pdf', { type: 'application/pdf' });
}

// Sunucunun bilerek reddettiği gönderim yeniden denenmez; bağlantı, süre aşımı, oturum ve sunucu hatası denenir.
export function kaliciRedMi(e: unknown): e is ApiHatasi {
  return e instanceof ApiHatasi && e.durum >= 400 && e.durum < 500 && ![401, 408, 429].includes(e.durum);
}

async function birini(k: BekleyenIrsaliye): Promise<IrsaliyeBelgeleriCevabi | null> {
  if (k.malKabul === null) return null;
  try {
    const ozet = await dosyaYukle(new Uint8Array(await k.pdf.arrayBuffer()), () => undefined);
    const govde: IrsaliyeEkleGovdesi = { ozet, dosyaAdi: 'irsaliye.pdf' };
    const yol = `/stok/mal-kabuller/${k.malKabul.id}/irsaliye-ekle`;
    const c = await tekrarKorumaliGonder((d) => api.post<IrsaliyeBelgeleriCevabi>(yol, govde, d), { istekKimligi: k.istekKimligi });
    await depo.sil(k.id);
    return c;
  } catch (e) {
    if (kaliciRedMi(e)) await depo.yaz({ ...k, hata: e.message });
    return null;
  }
}

let gonderiliyor: Promise<number> | null = null;

// Bu kişinin mal kabule bağlı bekleyenlerini sırayla gönderir; gidenlerin sayısını döner. Aynı anda tek gönderim.
export function kuyruguGonder(kisiId?: number): Promise<number> {
  gonderiliyor ??= (async () => {
    try {
      const kisi = kisiId ?? (await api.get<OturumCevabi>('/oturum')).kullanici?.id ?? null;
      if (kisi === null) return 0;
      if (sonKisi !== kisi) sonKisi = kisi;
      await tazele();
      let giden = 0;
      for (const k of liste.filter((x) => x.kisiId === kisi && x.malKabul !== null && x.hata === null)) if (await birini(k)) giden += 1;
      return giden;
    } catch {
      return 0;
    } finally {
      await tazele();
      gonderiliyor = null;
    }
  })();
  return gonderiliyor;
}

// Reddedilmiş kaydı kişi elle yeniden dener (yetkisi geri geldiyse).
export async function yenidenDene(k: BekleyenIrsaliye): Promise<boolean> {
  const sifir = { ...k, hata: null };
  await depo.yaz(sifir);
  const c = await birini(sifir);
  await tazele();
  return c !== null;
}

// Uygulama açılınca ve bağlantı dönünce bekleyenler gider. Modül rotaları açılışta yüklenir; dinleyici bir kez kurulur.
let kuruldu = false;
export function kuyrukDinleyicisiKur(): void {
  if (kuruldu || typeof window === 'undefined') return;
  kuruldu = true;
  // Gidecek kayıt yokken sunucuya (oturum okuması) istek atılmaz: her bağlantı dönüşünde boş yere istek olmasın.
  const varsaGonder = (): void => { void tazele().then(() => { if (liste.some((k) => k.malKabul !== null && k.hata === null)) void kuyruguGonder(); }); };
  baglantiDonusunuDinle(varsaGonder);
  varsaGonder();
}
