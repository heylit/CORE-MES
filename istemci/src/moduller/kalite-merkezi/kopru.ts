import { ESKI_SURUM_ILETISI } from '#paylasilan/hata.ts';
import type {
  KmDegisiklikCevabi, KmOlcuAletleriCevabi, KmGecmisCevabi, KmGeriYukleCevabi, KmIlkParcaBekleyenCevabi, KmIlkParcaCevabi, KmIlkParcaGovdesi, KmGeriYukleGovdesi, KmKarantinaKonumlariCevabi, KmKarantinaPartileriCevabi, KmOnayGeriAlGovdesi, KmOnaylaGovdesi, KmOnayReddiAlani, KmSilGovdesi,
  KmOnaylaCevabi, KmSurumCevabi, KmTedarikciFirmalariCevabi, KmYazGovdesi,
} from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { ApiHatasi } from '../../ortak/veri/api.ts';
import type { api } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../ortak/veri/istek-kimligi.ts';

// Uygulamanın yerel sunucu sözleşmesi (sunucu.py: ping, sync, doc, files, restore) TMI uçlarına çevrilir. Kural sunucudadır;
// köprü yalnız taşır. Cevap uygulamanın beklediği biçimdedir: { version, changes } ve { col, id, data }.
export type Istemci = Pick<typeof api, 'get' | 'post'>;
// Dosya ikili döner (api.get JSON okur): aynı kökene oturum çereziyle düz istek.
export type DosyaOkuyucu = (yol: string) => Promise<Blob | null>;

export interface ApiIstegi { adres: string; yontem: string; govde: unknown }
export interface ApiCevabi { durum: number; json?: unknown; blob?: Blob }

const tamam = (json: unknown): ApiCevabi => ({ durum: 200, json });
const ret = (durum: number, hata: string): ApiCevabi => ({ durum, json: { hata } });
const parca = (p: string): string => encodeURIComponent(p);

// Ortak dosya deposunun parça boyu (paylasilan/sozlesme/dosya.ts DOSYA_PARCASI; sözleşme zod taşıdığı için değer ithal edilmez).
export const DOSYA_PARCASI = 512 * 1024;

// Yedek gövde sınırının (1 MB) altında parça parça gider.
export const GERI_YUKLEME_PARCASI = 700 * 1024;

type Belge = KmGeriYukleGovdesi['belgeler'][number];

// Uygulama onayı da (form onayı, kapanış) kayıt yazmasıyla gönderir; sunucu onu bu alanla reddeder, köprü aynı kaydı onay
// ucuna gönderir. Onay işlemi olmayan kişi oradan da reddedilir; köprü kural koymaz.
const ONAY_REDDI: KmOnayReddiAlani = 'onay';
// Pencerenin seçtiği miktarlar adres sorgusunda JSON gelir; biçimi sunucu denetler, burada yalnız dizi olması aranır.
function serbestMiktarlari(metin: string | null): NonNullable<KmOnaylaGovdesi['serbestMiktarlar']> | null {
  if (metin === null) return null;
  try {
    const d: unknown = JSON.parse(metin);
    return Array.isArray(d) ? (d as NonNullable<KmOnaylaGovdesi['serbestMiktarlar']>) : null;
  } catch {
    return null;
  }
}
const onayReddiMi = (e: unknown): boolean => e instanceof ApiHatasi && e.durum === 403 && e.govde.alan === ONAY_REDDI;

export function belgeParcalari(belgeler: readonly Belge[], sinir = GERI_YUKLEME_PARCASI): Belge[][] {
  const parcalar: Belge[][] = [[]];
  let boyut = 0;
  for (const b of belgeler) {
    const n = JSON.stringify(b).length;
    if (boyut + n > sinir && parcalar[parcalar.length - 1]!.length > 0) { parcalar.push([]); boyut = 0; }
    parcalar[parcalar.length - 1]!.push(b);
    boyut += n;
  }
  return parcalar;
}

async function ozetHesapla(veri: Uint8Array<ArrayBuffer>): Promise<string> {
  const ozet = new Uint8Array(await crypto.subtle.digest('SHA-256', veri));
  return Array.from(ozet, (b) => b.toString(16).padStart(2, '0')).join('');
}

function base64Yaz(veri: Uint8Array): string {
  let ikili = '';
  for (let i = 0; i < veri.length; i += 0x8000) ikili += String.fromCharCode(...veri.subarray(i, i + 0x8000));
  return btoa(ikili);
}

function base64Oku(metin: string): Uint8Array<ArrayBuffer> {
  const ikili = atob(metin);
  const veri = new Uint8Array(ikili.length);
  for (let i = 0; i < ikili.length; i++) veri[i] = ikili.charCodeAt(i);
  return veri;
}

// FileReader: çerçeveden gelen Blob başka pencerenindir; her ortamda okunur.
function blobBaytlari(b: Blob): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((ok, red) => {
    const okuyucu = new FileReader();
    okuyucu.onload = () => { ok(new Uint8Array(okuyucu.result as ArrayBuffer)); };
    okuyucu.onerror = () => { red(okuyucu.error ?? new Error('Dosya okunamadı.')); };
    okuyucu.readAsArrayBuffer(b);
  });
}

// Köprünün gördüğü son kayıt hâli: yazmada beklenen sürüm olarak gider. Uygulama sürüm tutmaz; köprü tutar.
// kendiTabanlari: bu köprünün kendi yazmalarıyla geride kalan "guncelleme" değerleri. Uygulama aynı açık kaydı yeniden kaydederken
// (ölçüm oturumu, resim düzenleyicinin otomatik kaydı) nesnedeki eski değeri taban gönderir; bu değerler başka sürüm gelene kadar
// güncel sayılır. Akıştan daha yeni sürüm gelince hâl değişir ve liste düşer.
interface KayitHali { surum: number; dolu: boolean; guncelleme: unknown; kendiTabanlari?: readonly string[] }
const KENDI_TABAN_SINIRI = 50;

export interface Kopru {
  isle: (istek: ApiIstegi) => Promise<ApiCevabi>;
}

// 329 a: ölçü aletlerinin tek kaynağı Kalibrasyon modülüdür. Uygulamanın cihaz listesi (`dev`) akıştan değil oradan gelir ve
// salt okunurdur; liste en çok bu aralıkta bir istenir, aradaki eşitlemeler yalnız değişeni gönderir.
export const OLCU_ALETI_ARALIGI_MS = 15_000;
export const OLCU_ALETI_YAZMA_RED = 'Ölçü aletleri Kalibrasyon sayfasından yönetilir.';
const CIHAZ_KOLEKSIYONU = 'dev';

export function kopruKur(istemci: Istemci, dosyaOku: DosyaOkuyucu, simdi: () => number = Date.now): Kopru {
  const haller = new Map<string, KayitHali>();
  let gonderilenCihazlar = new Map<string, string>();
  let cihazAni: number | null = null;
  // İlk eşitlemede liste okunamazsa hata verir: boş liste gerçekmiş gibi görünmesin. Sonrakilerde akış yine de gelir.
  async function cihazDegisiklikleri(ilk: boolean): Promise<{ col: string; id: string; data: Record<string, unknown> | null }[]> {
    if (!ilk && cihazAni !== null && simdi() - cihazAni < OLCU_ALETI_ARALIGI_MS) return [];
    let liste: KmOlcuAletleriCevabi['cihazlar'];
    try {
      liste = (await istemci.get<KmOlcuAletleriCevabi>('/kalite-merkezi/olcu-aletleri')).cihazlar;
    } catch (e) {
      if (ilk) throw e;
      return [];
    }
    cihazAni = simdi();
    if (ilk) gonderilenCihazlar = new Map();
    const yeni = new Map(liste.map((c) => [c.kimlik, JSON.stringify(c.govde)]));
    const degisenler = liste.filter((c) => gonderilenCihazlar.get(c.kimlik) !== yeni.get(c.kimlik)).map((c) => ({ col: CIHAZ_KOLEKSIYONU, id: c.kimlik, data: c.govde }));
    const silinenler = [...gonderilenCihazlar.keys()].filter((k) => !yeni.has(k)).map((k) => ({ col: CIHAZ_KOLEKSIYONU, id: k, data: null }));
    gonderilenCihazlar = yeni;
    return [...degisenler, ...silinenler];
  }
  const anahtar = (koleksiyon: string, kimlik: string): string => `${koleksiyon}\u0000${kimlik}`;
  // Akış ve yazma cevapları sırasız gelebilir: yalnız daha yeni sürüm eskisinin yerine geçer.
  function hatirla(koleksiyon: string, kimlik: string, hal: KayitHali): void {
    const k = anahtar(koleksiyon, kimlik);
    const eski = haller.get(k);
    if (eski === undefined || eski.surum < hal.surum) haller.set(k, hal);
  }
  const guncellemesi = (govde: unknown): unknown => (govde !== null && typeof govde === 'object' ? (govde as { guncelleme?: unknown }).guncelleme : undefined);

  // İçerik ortak dosya deposuna parça parça yüklenir (yükleyen kendisi olmalı), sonra uygulamanın dosya kimliğine bağlanır.
  async function dosyaYaz(kimlik: string, veri: Uint8Array<ArrayBuffer>): Promise<void> {
    const ozet = await ozetHesapla(veri);
    const toplam = Math.max(1, Math.ceil(veri.length / DOSYA_PARCASI));
    for (let sira = 0; sira < toplam; sira++) {
      const p = veri.subarray(sira * DOSYA_PARCASI, (sira + 1) * DOSYA_PARCASI);
      const { tamam: bitti } = await istemci.post<{ tamam: boolean }>(`/dosyalar/${ozet}/parca`, { sira, toplam, veri: base64Yaz(p) });
      if (bitti) break;
    }
    await istemci.post(`/kalite-merkezi/dosyalar/${parca(kimlik)}/bagla`, { ozet, ad: kimlik });
  }

  async function geriYukle(govde: unknown): Promise<ApiCevabi> {
    const o = (typeof govde === 'string' ? JSON.parse(govde) : govde) as { docs?: Record<string, Record<string, unknown>>; files?: Record<string, { b64?: string }> };
    for (const [kimlik, f] of Object.entries(o.files ?? {})) {
      if (typeof f?.b64 === 'string' && f.b64 !== '') await dosyaYaz(kimlik, base64Oku(f.b64));
    }
    const belgeler: Belge[] = [];
    for (const [koleksiyon, kayitlar] of Object.entries(o.docs ?? {})) {
      for (const [kimlik, g] of Object.entries(kayitlar ?? {})) belgeler.push({ koleksiyon, kimlik, govde: g as Record<string, unknown> } as Belge);
    }
    let surum = 0;
    let baslangic: number | null = null;
    const parcalar = [...belgeParcalari(belgeler)];
    for (const [sira, p] of parcalar.entries()) {
      const govde: KmGeriYukleGovdesi = { baslangic, son: sira === parcalar.length - 1, belgeler: p };
      ({ surum, baslangic } = await istemci.post<KmGeriYukleCevabi>('/kalite-merkezi/geri-yukle', govde));
    }
    return tamam({ version: surum });
  }

  async function cevir(g: ApiIstegi): Promise<ApiCevabi> {
    const url = new URL(g.adres, 'http://km.invalid/');
    const p = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (p[0] !== 'api') return ret(404, 'bulunamadı');
    const [, ilk, ikinci, ucuncu] = p;
    if (ilk === 'ping' && g.yontem === 'GET') return tamam({ kaliteMerkezi: true, surum: 1 });
    if (ilk === 'sync' && g.yontem === 'GET') {
      const sonra = Number(url.searchParams.get('since') ?? '0');
      const baslangic = Number.isInteger(sonra) && sonra > 0 ? sonra : 0;
      const a = await istemci.get<KmDegisiklikCevabi>(`/kalite-merkezi/degisiklikler?sonra=${baslangic}`);
      const cihazlar = await cihazDegisiklikleri(baslangic === 0);
      for (const d of a.degisiklikler) hatirla(d.koleksiyon, d.kimlik, { surum: d.surum, dolu: d.govde !== null, guncelleme: guncellemesi(d.govde) });
      const akis = a.degisiklikler.filter((d) => d.koleksiyon !== CIHAZ_KOLEKSIYONU).map((d) => ({ col: d.koleksiyon, id: d.kimlik, data: d.govde }));
      return tamam({ version: a.surum, changes: [...akis, ...cihazlar] });
    }
    // NCR kapanışında serbest bırakılacak konum seçimi (partinin önceki konumu bilinmediğinde; KARANTINA_HEDEF_BETIGI).
    if (ilk === 'karantina-konumlari' && ikinci === undefined && g.yontem === 'GET') {
      return tamam(await istemci.get<KmKarantinaKonumlariCevabi>('/kalite-merkezi/karantina-konumlari'));
    }
    // Tedarikçi formunun firma seçicisi (236 a; FIRMA_SECICI_BETIGI).
    if (ilk === 'tedarikci-firmalari' && ikinci === undefined && g.yontem === 'GET') {
      return tamam(await istemci.get<KmTedarikciFirmalariCevabi>('/kalite-merkezi/tedarikci-firmalari'));
    }
    // NCR kapanışında parti başına serbest bırakılacak miktar (320 a; SERBEST_MIKTAR_BETIGI).
    if (ilk === 'karantina-partileri' && ikinci !== undefined && p.length === 3 && g.yontem === 'GET') {
      return tamam(await istemci.get<KmKarantinaPartileriCevabi>(`/kalite-merkezi/ncr/${parca(ikinci)}/karantina-partileri`));
    }
    // İlk parça kararı (325 a; ILK_PARCA_BETIGI): karar bekleyen emirlerin listesi ve emir başına onay ya da ret.
    if (ilk === 'ilk-parca' && ikinci === 'bekleyenler' && p.length === 3 && g.yontem === 'GET') {
      return tamam(await istemci.get<KmIlkParcaBekleyenCevabi>('/kalite-merkezi/ilk-parca/bekleyenler'));
    }
    if (ilk === 'ilk-parca' && ikinci !== undefined && ucuncu === 'karar' && p.length === 4 && g.yontem === 'POST') {
      if (!/^[1-9]\d{0,9}$/.test(ikinci)) return ret(400, 'Üretim emri kimliği geçersiz.');
      const govde = (typeof g.govde === 'string' ? JSON.parse(g.govde) : g.govde) as Partial<KmIlkParcaGovdesi> | null;
      const cevap = await tekrarKorumaliGonder((d) => istemci.post<KmIlkParcaCevabi>(`/kalite-merkezi/ilk-parca/${ikinci}/karar`, { karar: govde?.karar },
        { istekKimligi: d.istekKimligi, zamanAsimiMs: d.zamanAsimiMs, ...(d.sinyal ? { sinyal: d.sinyal } : {}) }));
      return tamam(cevap);
    }
    // Kaydın salt okunur geçmişi (326 a): değişiklik geçmişi penceresine eklenen "Önceki sürümler" bölümü.
    if (ilk === 'gecmis' && ikinci !== undefined && ucuncu !== undefined && p.length === 4 && g.yontem === 'GET') {
      return tamam(await istemci.get<KmGecmisCevabi>(`/kalite-merkezi/kayitlar/${parca(ikinci)}/${parca(ucuncu)}/gecmis`));
    }
    if (ilk === 'doc' && ikinci === CIHAZ_KOLEKSIYONU && ucuncu !== undefined && p.length === 4 && (g.yontem === 'PUT' || g.yontem === 'DELETE')) {
      return ret(403, OLCU_ALETI_YAZMA_RED);
    }
    if (ilk === 'doc' && ikinci !== undefined && ucuncu !== undefined && p.length === 4) {
      const yol = `/kalite-merkezi/kayitlar/${parca(ikinci)}/${parca(ucuncu)}`;
      const hal = haller.get(anahtar(ikinci, ucuncu));
      const beklenen = hal?.dolu === true ? hal.surum : null;
      if (g.yontem === 'PUT') {
        const govde = (typeof g.govde === 'string' ? JSON.parse(g.govde) : g.govde) as KmYazGovdesi['govde'];
        // Form açıldıktan sonra kayıt (akışla) değiştiyse formdaki hâl eskidir: köprünün son sürümüyle yazmak onu ezerdi.
        const taban = url.searchParams.get('taban');
        if (taban !== null && hal?.dolu === true && typeof hal.guncelleme === 'string' && hal.guncelleme !== taban && hal.kendiTabanlari?.includes(taban) !== true) {
          return ret(409, ESKI_SURUM_ILETISI);
        }
        const istekGovdesi: KmYazGovdesi = { govde, surum: beklenen };
        const yazVeyaOnayla = async (): Promise<KmOnaylaCevabi> => {
          try {
            return await istemci.post<KmSurumCevabi>(`${yol}/yaz`, istekGovdesi);
          } catch (e) {
            if (!onayReddiMi(e)) throw e;
            const hedef = Number(url.searchParams.get('karantinaHedef'));
            const serbest = serbestMiktarlari(url.searchParams.get('serbest'));
            const onayGovdesi: KmOnaylaGovdesi = {
              ...istekGovdesi,
              ...(Number.isInteger(hedef) && hedef > 0 ? { karantinaHedefKonumId: hedef } : {}),
              ...(serbest === null ? {} : { serbestMiktarlar: serbest }),
            };
            return istemci.post<KmOnaylaCevabi>(`${yol}/onayla`, onayGovdesi);
          }
        };
        const { surum, uyari } = await yazVeyaOnayla();
        const kendiTabanlari = [...(hal?.kendiTabanlari ?? []), ...(typeof hal?.guncelleme === 'string' ? [hal.guncelleme] : [])].slice(-KENDI_TABAN_SINIRI);
        // Akış bu yazmayı cevaptan önce aynı sürümle getirmiş olabilir: aynı sürümde de kendi tabanları yazılır.
        const simdiki = haller.get(anahtar(ikinci, ucuncu));
        if (simdiki === undefined || simdiki.surum <= surum) {
          haller.set(anahtar(ikinci, ucuncu), { surum, dolu: true, guncelleme: guncellemesi(govde), kendiTabanlari });
        }
        // Kapanışın serbest bırakamadığı partinin nedeni ekranda tek satır gösterilir (acilis.ts KARANTINA_HEDEF_BETIGI).
        return tamam(uyari === undefined ? { version: surum } : { version: surum, uyari });
      }
      if (g.yontem === 'DELETE') {
        const istekGovdesi: KmSilGovdesi = { surum: beklenen };
        const { surum } = await istemci.post<KmSurumCevabi>(`${yol}/sil`, istekGovdesi);
        if (beklenen !== null) hatirla(ikinci, ucuncu, { surum, dolu: false, guncelleme: undefined });
        return tamam({ version: surum });
      }
    }
    // Onaylı formun onayını geri alma (TMI'nin eklediği düğme): köprünün bildiği son sürümle gider; bilinmeyen kayıt 404.
    if (ilk === 'onay-geri-al' && ikinci === 'frm' && ucuncu !== undefined && p.length === 4 && g.yontem === 'POST') {
      const hal = haller.get(anahtar(ikinci, ucuncu));
      if (hal?.dolu !== true) return ret(404, 'Form bulunamadı.');
      const istekGovdesi: KmOnayGeriAlGovdesi = { surum: hal.surum };
      const { surum } = await istemci.post<KmSurumCevabi>(`/kalite-merkezi/formlar/${parca(ucuncu)}/onay-geri-al`, istekGovdesi);
      hatirla(ikinci, ucuncu, { surum, dolu: true, guncelleme: undefined });
      return tamam({ version: surum });
    }
    if (ilk === 'files' && ikinci === undefined && g.yontem === 'POST') {
      const kimlik = url.searchParams.get('id') ?? '';
      if (!(g.govde instanceof Blob)) return ret(400, 'Dosya içeriği yok');
      await dosyaYaz(kimlik, await blobBaytlari(g.govde));
      return tamam({ id: kimlik });
    }
    if (ilk === 'files' && ikinci !== undefined && p.length === 3) {
      if (g.yontem === 'GET') {
        const blob = await dosyaOku(`/kalite-merkezi/dosyalar/${parca(ikinci)}`);
        return blob === null ? ret(404, 'dosya yok') : { durum: 200, blob };
      }
      if (g.yontem === 'DELETE') {
        await istemci.post(`/kalite-merkezi/dosyalar/${parca(ikinci)}/sil`);
        return tamam({ ok: true });
      }
    }
    if (ilk === 'restore' && g.yontem === 'POST') return geriYukle(g.govde);
    return ret(404, 'bulunamadı');
  }

  return {
    isle: async (g) => {
      try {
        return await cevir(g);
      } catch (e) {
        if (e instanceof ApiHatasi) return ret(e.durum, e.govde.mesaj);
        return ret(500, e instanceof Error ? e.message : 'İşlem yapılamadı.');
      }
    },
  };
}
