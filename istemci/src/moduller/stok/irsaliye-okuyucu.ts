import { vendorAdresi } from '../../ortak/cizim/kitaplik.ts';
import { okunanBilgiler, sayfalariBirlestir, type OkunanBilgiler } from './irsaliye-okuma.ts';

// 3063 dilim 3: irsaliye fotoğrafı cihazda okunur (bağlantı yokken de; 3056). Her sayfa bir kez okunur: formda eklenince başlar,
// PDF yapılırken aynı sonuç kullanılır. Okuma olmazsa (motor yüklenemedi, çalışan yok, süre doldu) sonuç null: sayfa bugünkü görüntülü
// sayfa olur, öneri çıkmaz. Okuma kaydı ya da gönderimi hiçbir zaman durdurmaz.

export interface OkumaIstegi { id: number; jpeg: Uint8Array; en: number; boy: number; adresler: { motor: string; wasm: string; veri: string } }
export type OkumaCevabi = { id: number; pdf: Uint8Array; metin: string } | { id: number; hata: string };
export interface SayfaOkumasi { pdf: Uint8Array; bilgiler: OkunanBilgiler }
export interface SayfaGoruntusu { veri: Uint8Array; en: number; boy: number }

// Telefonda ilk açılış motor indirmesini de kapsar.
export const OKUMA_SURESI_MS = 90_000;

type Okuyucu = (g: SayfaGoruntusu) => Promise<{ pdf: Uint8Array; metin: string } | null>;

let calisan: Worker | null = null;
let siradaki = 0;
const bekleyenler = new Map<number, (c: OkumaCevabi | null) => void>();

function calisaniAc(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (calisan) return calisan;
  try {
    calisan = new Worker(new URL('./irsaliye-okuma.calisan.ts', import.meta.url));
  } catch {
    return null;
  }
  calisan.onmessage = (e: MessageEvent<OkumaCevabi>) => { bekleyenler.get(e.data.id)?.(e.data); bekleyenler.delete(e.data.id); };
  calisan.onerror = () => calisaniKapat();
  return calisan;
}

// Asılı kalan tanıma çalışanı meşgul tutar: süre dolunca ya da hata olunca çalışan kapanır, bekleyen her okuma boş döner, sonraki sayfa yeni çalışanla başlar.
function calisaniKapat(): void {
  const eski = [...bekleyenler.values()];
  bekleyenler.clear();
  calisan?.terminate();
  calisan = null;
  for (const c of eski) c(null);
}

const calisanOkuyucu: Okuyucu = (g) => {
  const c = calisaniAc();
  if (!c) return Promise.resolve(null);
  const id = ++siradaki;
  return new Promise((coz) => {
    const sayac = setTimeout(calisaniKapat, OKUMA_SURESI_MS);
    bekleyenler.set(id, (cevap) => { clearTimeout(sayac); coz(cevap === null || 'hata' in cevap ? null : cevap); });
    const istek: OkumaIstegi = {
      id, jpeg: g.veri, en: g.en, boy: g.boy,
      adresler: { motor: vendorAdresi('tesscore'), wasm: vendorAdresi('tesswasm'), veri: vendorAdresi('tesstur') },
    };
    c.postMessage(istek);
  });
};

let okuyucu: Okuyucu = calisanOkuyucu;
const okumalar = new WeakMap<File, Promise<SayfaOkumasi | null>>();

// Yalnız testler içindir.
export function okuyucuAyarla(o: Okuyucu | null): void { okuyucu = o ?? calisanOkuyucu; }

export function resimMi(f: Pick<File, 'type'>): boolean {
  return f.type.startsWith('image/');
}

export function pdfMi(f: Pick<File, 'type' | 'name'>): boolean {
  return f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
}

// Seçilen PDF yalnız öneri için okunur; PDF'in kendisi irsaliyeye olduğu gibi girer. İrsaliye bilgileri ilk sayfalardadır.
export const PDF_OKUNAN_SAYFA = 3;
export type PdfSayfasi = { metin: string } | { goruntu: SayfaGoruntusu };
const pdfOkumalari = new WeakMap<File, Promise<OkunanBilgiler | null>>();

// Metinli sayfa doğrudan, taranmış sayfa resim olarak okunur. Hiçbir sayfa okunamazsa null.
export function pdfOkumasi(dosya: File, sayfalar: () => Promise<readonly PdfSayfasi[]>): Promise<OkunanBilgiler | null> {
  let p = pdfOkumalari.get(dosya);
  if (!p) {
    p = sayfalar()
      .then(async (liste) => {
        const okunan: OkunanBilgiler[] = [];
        for (const s of liste) {
          if ('metin' in s) { okunan.push(okunanBilgiler(s.metin)); continue; }
          const o = await okuyucu(s.goruntu);
          if (o) okunan.push(okunanBilgiler(o.metin));
        }
        return okunan.length ? sayfalariBirlestir(okunan) : null;
      })
      .catch(() => null);
    pdfOkumalari.set(dosya, p);
  }
  return p;
}

// PDF yapılırken okuma en çok bu kadar beklenir (bütün sayfalar için tek süre); bitmeyen sayfa görüntü olarak girer. Mal kabul kaydı
// alındıktan sonra irsaliye uzun beklemesin: sayfa kapanırsa ne yüklenir ne cihazda bekler.
export const PDF_OKUMA_BEKLEMESI_MS = 8_000;

export function enCok<T>(soz: Promise<T | null>, ms: number): Promise<T | null> {
  if (ms <= 0) return Promise.race([soz, Promise.resolve(null)]);
  return new Promise((coz) => {
    const sayac = setTimeout(() => coz(null), ms);
    void soz.then((d) => { clearTimeout(sayac); coz(d); });
  });
}

// Aynı dosya için tek okuma; bitmiş sonuç da bekleyen de aynı sözdür. PDF dosyası okunmaz.
export function sayfaOkumasi(dosya: File, goruntu: () => Promise<SayfaGoruntusu>): Promise<SayfaOkumasi | null> {
  if (!resimMi(dosya)) return Promise.resolve(null);
  let p = okumalar.get(dosya);
  if (!p) {
    p = goruntu()
      .then((g) => okuyucu(g))
      .then((s) => (s === null ? null : { pdf: s.pdf, bilgiler: okunanBilgiler(s.metin) }))
      .catch(() => null);
    okumalar.set(dosya, p);
  }
  return p;
}
