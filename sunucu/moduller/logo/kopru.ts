import type { LogoAyari } from './ayar.ts';
import { agHatasiniYorumla, alisFiyatlariniAyikla, geriHareketSayfasiniAyikla, malzemeHareketleriniAyikla, cariKaydiniAyikla, cariListesiniAyikla, cevabiYorumla, faturalariAyikla, malzemeKartlariniAyikla, stokToplamlariniAyikla, kullanimlariAyikla, malzemeAramasiniAyikla, ISTEK_SURESI_MS, listeKayitlariniAyikla, malKabulSatirlariniAyikla, MALZEME_FISI_UCU, malzemeKodlariniAyikla, siparisIcerigiAyikla, varMiAdi } from './kurallar.ts';
import type { LogoAlisFiyati, LogoMalzemeHareketi, FaturaKaydi, HizmetYonu, KopruSonucu, LogoCari, LogoFisTuru, LogoMalzemeKarti, LogoStokSatiri, LogoKullanimSatiri, KopruZarfi, ListeKaydi, MalKabulSatiri, MalzemeEklemeGovdesi, LogoSiparisIcerigi, Sayfa } from './kurallar.ts';

// Logo yardımcısıyla yalnız bu dosya konuşur (kart #207, ADR 0017; yardımcı araclar/logo-yardimcisi). Adres ve anahtar ayardan gelir; hata metnine girmez.
export interface KopruIstemcisi {
  // Kart varsa başarılı sonuçta Logo'daki ad da gelir (logoAdi).
  malzemeVarMi(kod: string): Promise<KopruSonucu>;
  malzemeEkle(govde: MalzemeEklemeGovdesi): Promise<KopruSonucu>;
  // Logo'daki bütün malzeme kartı kodları (2089-2 a); yalnız okunur.
  malzemeKodlari(): Promise<{ tur: 'basarili'; kodlar: string[] } | Exclude<KopruSonucu, { tur: 'basarili' }>>;
  birimSetleri(): Promise<{ tur: 'basarili'; setler: BirimSeti[] } | Exclude<KopruSonucu, { tur: 'basarili' }>>;
  // Yol verilmemişse istek atmaz, "reddedildi" döner.
  hizmetVarMi(yon: HizmetYonu, kod: string): Promise<KopruSonucu>;
  hizmetEkle(yon: HizmetYonu, govde: Record<string, string | number>): Promise<KopruSonucu>;
  // Satın alma siparişi (kullanıcının köprü notu 2.3, 3b). Numarayla bulma çift gönderim kalkanıdır; 404 "yok" sayılır.
  siparisBul(no: string): Promise<KopruSonucu>;
  siparisSatirlari(no: string): Promise<SatirliSonuc>;
  siparisEkle(govde: Record<string, unknown>): Promise<SatirliSonuc>;
  siparisIptal(no: string): Promise<KopruSonucu>;
  // Cari kodu Logo'da var mı (not 1: "API göndermeden önce /api/Arp/find/{kod} ile doğrular"); 404 "yok".
  cariVarMi(kod: string): Promise<KopruSonucu>;
  // Düzenleme Read+Modify+Post ucuyla (not 2.3); XML UPD hiç kullanılmaz ("duplicate key").
  siparisGuncelle(govde: Record<string, unknown>): Promise<KopruSonucu>;
  siparisKapat(no: string, govde: { lineRefs: number[] }): Promise<KopruSonucu>;
  // Talep fişi ve karşılama (not 2.4, 3b). Karşılama listesi sipariş başlık kaydıyla okunur; kaldırma köprünün byOrder ucuyla (önce miktar 0, sonra silme).
  talepEkle(govde: Record<string, unknown>): Promise<SatirliSonuc>;
  karsilamaOku(siparisRef: number): Promise<{ tur: 'basarili'; govde: unknown } | Exclude<KopruSonucu, { tur: 'basarili' }>>;
  karsilamaEkle(govde: Record<string, unknown>): Promise<KopruSonucu>;
  karsilamaKaldir(siparisRef: number): Promise<KopruSonucu>;
  // Kart güncelleme (not 2.1, 2.2: UpdateRich, koddan kayıt bulunur).
  malzemeGuncelle(govde: { code: string; name: string }): Promise<KopruSonucu>;
  hizmetGuncelle(yon: HizmetYonu, govde: Record<string, string | number>): Promise<KopruSonucu>;
  // 2114b (ADR 0017 eki 8, 2114-7): kartı Logo kayıt numarasıyla kullanım dışı bırakır, silmez; yardımcı kayıttaki kartın kodunu `kod`la
  // karşılaştırır. Zaten kullanım dışı kart başarıdır. 404 (kart yok, eski yardımcı ya da bilinmeyen yol) reddir.
  malzemePasifeAl(logoKayitNo: string, kod: string): Promise<KopruSonucu>;
  hizmetPasifeAl(yon: HizmetYonu, logoKayitNo: string, kod: string): Promise<KopruSonucu>;
  // Satış teklifi ve tekliften sipariş (not 2.6, 2.7). Müşterinin Logo'da CRM satış müşterisi kaydı olmalı (yoksa validate 4208); 404 "yok".
  satisMusterisiVarMi(cariKodu: string): Promise<KopruSonucu>;
  satisTeklifiEkle(govde: Record<string, unknown>): Promise<SatirliSonuc>;
  satisTeklifiOku(ref: number): Promise<SatirliSonuc>;
  satisSiparisiAc(teklifRef: number, govde: Record<string, unknown>): Promise<SatirliSonuc>;
  // Okuma uçları (logo -> TMI): yalnız GET. Cevabın biçimi doğrulanmadı (VARSAYIM); okunamayan cevap "belirsiz" döner, kayıt yazılmaz.
  malKabulOku(since: number): Promise<OkumaSonucu<{ satirlar: MalKabulSatiri[]; atlanan: number }>>;
  cariListesiOku(): Promise<OkumaSonucu<ListeKaydi[]>>;
  ambarListesiOku(): Promise<OkumaSonucu<ListeKaydi[]>>;
  // Siparişin faturaları; 404 "fatura yok" sayılır (VARSAYIM).
  faturaOku(siparisNo: string): Promise<OkumaSonucu<FaturaKaydi[]>>;
  // 2116: malzeme kartları ve ambar başına stok toplamı, kart kaydı sırasıyla sayfa sayfa (since = önceki sayfanın imleci).
  malzemeKartlariOku(since: number): Promise<OkumaSonucu<Sayfa<LogoMalzemeKarti>>>;
  stokToplamlariOku(since: number): Promise<OkumaSonucu<Sayfa<LogoStokSatiri>>>;
  // 3079 a: kart başına son hareket ve açık sipariş, malzeme listesiyle aynı sayfalama.
  kullanimlariOku(since: number): Promise<OkumaSonucu<Sayfa<LogoKullanimSatiri>>>;
  // 2961-D4: malzemenin hareketleri (kayıt sırasıyla sayfa) ve en yeni alış faturası satırları (en çok 10). Logo'da kart yoksa veri null.
  malzemeHareketleriOku(kod: string, since: number): Promise<OkumaSonucu<Sayfa<LogoMalzemeHareketi> | null>>;
  sonAlisFiyatlariOku(kod: string): Promise<OkumaSonucu<LogoAlisFiyati[] | null>>;
  // 3204: en yeniden geriye; once verilirse ondan eskiler. Kart yoksa null.
  malzemeHareketleriGeriyeOku(kod: string, once: number | null): Promise<OkumaSonucu<{ sayfa: Sayfa<LogoMalzemeHareketi>; geriye: boolean } | null>>;
  // 2118: kullanımdaki carilerde arama (en çok 20) ve tek cari; olmayan cari null.
  cariAra(metin: string): Promise<OkumaSonucu<LogoCari[]>>;
  // 3080 a: kullanımdaki malzeme kartlarında kod ya da adla arama (en çok 20).
  malzemeAra(metin: string): Promise<OkumaSonucu<LogoMalzemeKarti[]>>;
  cariOku(kod: string): Promise<OkumaSonucu<LogoCari | null>>;
  // D7 (2987 a): Logo'daki satın alma siparişinin başlığı ve satırları; sipariş yoksa null. Fiyat taşır: yalnız düzeltme yetkisiyle çağrılır.
  siparisIcerigiOku(no: string): Promise<OkumaSonucu<LogoSiparisIcerigi | null>>;
  // Malzeme fişi (türler ve uçlar kurallar.ts MALZEME_FISI_TURU, MALZEME_FISI_UCU). Açmada kalkan yalnız niyettir (yardımcının numarayla
  // bulma ucu TMI'de kullanılmıyor).
  malzemeFisiEkle(tur: LogoFisTuru, govde: Record<string, unknown>): Promise<KopruSonucu>;
  // 233: fişi numarasıyla siler (değişen fiş silinip aynı numarayla yeniden açılır); 404 "fiş yok" başarı sayılır (logicalRef null).
  malzemeFisiSil(tur: LogoFisTuru, no: string): Promise<KopruSonucu>;
  // Hizmet "var mı" yolu verildi mi; verilmediyse hizmet açma çift gönderim kalkanının yalnız niyet kısmıyla yapılır.
  readonly hizmetVarMiYoluVar: boolean;
  // Bağlantı kontrolü: yalnız GET, ham durum ve gövde; ağ hatası yorumlanmış döner.
  kontrolOku(yol: string): Promise<{ durum: number; govde: unknown } | Exclude<KopruSonucu, { tur: 'basarili' }>>;
}

// Başarıda Logo satır kayıt numaraları satır sırasıyla (lineNo); okunamadıysa null.
export type SatirliSonuc = { tur: 'basarili'; logicalRef: number | null; satirRefleri: number[] | null } | Exclude<KopruSonucu, { tur: 'basarili' }>;

// Alınan hizmet: kılavuz (2.2). Verilen hizmet: kılavuz yalnız "/api/SalesService/..." diyor; AddRich VARSAYIM.
const HIZMET_KOKU: Readonly<Record<HizmetYonu, string>> = { alinan: '/api/PurchaseService', verilen: '/api/SalesService' };

export type OkumaSonucu<T> = { tur: 'basarili'; veri: T } | Exclude<KopruSonucu, { tur: 'basarili' }>;

export interface BirimSeti {
  kod: string;
  ad: string | null;
}

export interface KopruSecenegi {
  // Testte değişir; sunucuda Node'un kendi fetch'i (yeni paket yok).
  fetch?: typeof fetch;
  sureMs?: number;
  // Hizmet "var mı" ucunun yolu; verilmezse istek atılmaz. Sunucuda HIZMET_VAR_MI_YOLU, testte sahte köprünün test yolu verilir.
  hizmetVarMiYolu?: (yon: HizmetYonu, kod: string) => string;
}

// Logo yardımcısının hizmet kartı "var mı" ucu (araclar/logo-yardimcisi Islemler.cs).
export const HIZMET_VAR_MI_YOLU = (yon: HizmetYonu, kod: string): string => `${HIZMET_KOKU[yon]}/exists/${encodeURIComponent(kod)}`;

function agHatasi(hata: unknown): { zamanAsimi: boolean; kod: string | null } {
  const ad = hata instanceof Error ? hata.name : '';
  if (ad === 'TimeoutError' || ad === 'AbortError') return { zamanAsimi: true, kod: null };
  const neden = hata instanceof Error ? (hata as Error & { cause?: { code?: unknown } }).cause : undefined;
  const kod = neden && typeof neden.code === 'string' ? neden.code : null;
  return { zamanAsimi: false, kod };
}

async function govdeOku(cevap: Response): Promise<unknown> {
  const metin = await cevap.text();
  if (metin.trim() === '') return null;
  try {
    return JSON.parse(metin) as unknown;
  } catch {
    return null;
  }
}

const zarfMi = (d: unknown): d is KopruZarfi => d !== null && typeof d === 'object' && !Array.isArray(d);

// VARSAYIM (LB8): birim seti listesi dizi (ya da zarfın data alanında dizi); öğede kod code/unitSetCode/CODE, ad name/NAME.
function birimSetleriniAyikla(govde: unknown): BirimSeti[] | null {
  const dizi = Array.isArray(govde) ? govde : zarfMi(govde) && Array.isArray((govde as { data?: unknown }).data) ? (govde as { data: unknown[] }).data : null;
  if (dizi === null) return null;
  const setler: BirimSeti[] = [];
  for (const o of dizi) {
    if (!zarfMi(o)) continue;
    const kayit = o as Record<string, unknown>;
    const kod = [kayit['code'], kayit['unitSetCode'], kayit['CODE']].find((d): d is string => typeof d === 'string' && d.trim() !== '');
    if (!kod) continue;
    const ad = [kayit['name'], kayit['NAME']].find((d): d is string => typeof d === 'string' && d.trim() !== '');
    setler.push({ kod: kod.trim(), ad: ad?.trim() ?? null });
  }
  return setler;
}

// AddRich cevabı { success, logicalRef, order: { logicalRef, number, lines: [{ logicalRef, lineNo, ... }] } } (not 3b).
// Satır listesi ucunun ({number}/lines) biçimi notta yok: dizi ya da zarfın data/lines alanında dizi VARSAYILDI; öğede logicalRef ya da LOGICALREF.
export function satirRefleriniAyikla(govde: unknown): number[] | null {
  const dizi = (d: unknown): unknown[] | null => {
    if (Array.isArray(d)) return d;
    if (!zarfMi(d)) return null;
    const k = d as Record<string, unknown>;
    for (const a of ['lines', 'data']) if (Array.isArray(k[a])) return k[a] as unknown[];
    // Talep fişi ve satış teklifi cevabının kabı notta yok: order, fiche, demand ya da offer VARSAYILDI.
    const kap = ['order', 'fiche', 'demand', 'offer'].find((a) => zarfMi(k[a]));
    return kap === undefined ? null : dizi(k[kap]);
  };
  const satirlar = dizi(govde);
  if (satirlar === null) return null;
  const okunan: { ref: number; sira: number }[] = [];
  for (const [i, o] of satirlar.entries()) {
    if (!zarfMi(o)) return null;
    const k = o as Record<string, unknown>;
    const ref = [k['logicalRef'], k['LOGICALREF']].find((d): d is number => typeof d === 'number' && Number.isSafeInteger(d) && d > 0);
    if (ref === undefined) return null;
    const sira = [k['lineNo'], k['LINENO']].find((d): d is number => typeof d === 'number' && Number.isFinite(d)) ?? i;
    okunan.push({ ref, sira });
  }
  return okunan.sort((x, y) => x.sira - y.sira).map((x) => x.ref);
}

export function kopruIstemcisiKur(ayar: LogoAyari, secenek: KopruSecenegi = {}): KopruIstemcisi {
  const cagir = secenek.fetch ?? fetch;
  const sureMs = secenek.sureMs ?? ISTEK_SURESI_MS;

  const istek = async (yontem: 'GET' | 'POST' | 'DELETE', yol: string, govde?: unknown): Promise<{ durum: number; govde: unknown } | KopruSonucu> => {
    try {
      const cevap = await cagir(`${ayar.adres}${yol}`, {
        method: yontem,
        headers: { 'X-Api-Key': ayar.anahtar, Accept: 'application/json', ...(govde === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(govde === undefined ? {} : { body: JSON.stringify(govde) }),
        signal: AbortSignal.timeout(sureMs),
        redirect: 'error',
      });
      return { durum: cevap.status, govde: await govdeOku(cevap) };
    } catch (hata) {
      return agHatasiniYorumla(agHatasi(hata));
    }
  };
  const yorumla = (c: { durum: number; govde: unknown } | KopruSonucu): KopruSonucu =>
    'tur' in c ? c : cevabiYorumla(c.durum, zarfMi(c.govde) ? c.govde : null);
  // Bulma uçlarında 404 "kayıt yok"tur (VARSAYIM: köprü bulamayınca 404 ya da logicalRef 0 döner).
  const bul = async (yol: string): Promise<KopruSonucu> => {
    const c = await istek('GET', yol);
    if (!('tur' in c) && c.durum === 404) return { tur: 'basarili', logicalRef: null };
    return yorumla(c);
  };
  const satirli = (c: { durum: number; govde: unknown } | KopruSonucu): SatirliSonuc => {
    const r = yorumla(c);
    if (r.tur !== 'basarili') return r;
    return { ...r, satirRefleri: 'tur' in c ? null : satirRefleriniAyikla(c.govde) };
  };

  // Okuma: 2xx ve ayıklanabilir cevap başarıdır; 2xx ama ayıklanamayan cevap belirsizdir (imleç ilerlemez); 404 `bos` verilmişse boş veridir.
  const oku = async <T>(yol: string, ayikla: (govde: unknown) => T | null, bos?: T): Promise<OkumaSonucu<T>> => {
    const c = await istek('GET', yol);
    if ('tur' in c) return c.tur === 'basarili' ? { tur: 'belirsiz', ileti: 'Beklenmeyen cevap.' } : c;
    if (c.durum === 404 && bos !== undefined) return { tur: 'basarili', veri: bos };
    if (c.durum >= 200 && c.durum < 300) {
      const veri = ayikla(c.govde);
      if (veri !== null) return { tur: 'basarili', veri };
      return { tur: 'belirsiz', ileti: 'Köprü cevabı beklenen biçimde değil; okunan kayıt yazılmadı.' };
    }
    const r = cevabiYorumla(c.durum, zarfMi(c.govde) ? c.govde : null);
    return r.tur === 'basarili' ? { tur: 'belirsiz', ileti: `Köprü ${c.durum} döndü.` } : r;
  };

  return {
    malKabulOku: (since) => oku(`/api/PurchaseOrder/receipts?since=${since}`, malKabulSatirlariniAyikla),
    cariListesiOku: () => oku('/api/Arp/list', (g) => listeKayitlariniAyikla(g, 'cari')),
    ambarListesiOku: () => oku('/api/Lookup/warehouses', (g) => listeKayitlariniAyikla(g, 'ambar')),
    faturaOku: (no) => oku(`/api/PurchaseOrder/${encodeURIComponent(no)}/invoices`, faturalariAyikla, []),
    malzemeKartlariOku: (since) => oku(`/api/Material/list?since=${since}`, malzemeKartlariniAyikla),
    stokToplamlariOku: (since) => oku(`/api/Stock/totals?since=${since}`, stokToplamlariniAyikla),
    kullanimlariOku: (since) => oku(`/api/Material/usage?since=${since}`, kullanimlariAyikla),
    malzemeHareketleriOku: (kod, since) =>
      oku<Sayfa<LogoMalzemeHareketi> | null>(`/api/Material/${encodeURIComponent(kod)}/movements?since=${since}`, malzemeHareketleriniAyikla, null),
    sonAlisFiyatlariOku: (kod) => oku<LogoAlisFiyati[] | null>(`/api/Material/${encodeURIComponent(kod)}/lastPurchases`, alisFiyatlariniAyikla, null),
    malzemeHareketleriGeriyeOku: (kod, once) =>
      oku(`/api/Material/${encodeURIComponent(kod)}/movements?order=desc${once === null ? '' : `&before=${once}`}`, geriHareketSayfasiniAyikla, null),
    cariAra: (metin) => oku(`/api/Arp/search?q=${encodeURIComponent(metin)}`, cariListesiniAyikla),
    malzemeAra: (metin) => oku(`/api/Material/search?q=${encodeURIComponent(metin)}`, malzemeAramasiniAyikla),
    cariOku: (kod) => oku<LogoCari | null>(`/api/Arp/card/${encodeURIComponent(kod)}`, (g) => cariKaydiniAyikla(g), null),
    siparisIcerigiOku: (no) => oku<LogoSiparisIcerigi | null>(`/api/PurchaseOrder/${encodeURIComponent(no)}/content`, siparisIcerigiAyikla, null),
    async malzemeFisiEkle(tur, govde) {
      return yorumla(await istek('POST', `/api/MaterialSlip/Add${MALZEME_FISI_UCU[tur]}`, govde));
    },
    async malzemeFisiSil(tur, no) {
      const c = await istek('DELETE', `/api/MaterialSlip/${MALZEME_FISI_UCU[tur]}/${encodeURIComponent(no)}`);
      if (!('tur' in c) && c.durum === 404) return { tur: 'basarili', logicalRef: null };
      return yorumla(c);
    },
    async malzemeVarMi(kod) {
      const c = await istek('GET', `/api/Material/exists/${encodeURIComponent(kod)}`);
      const r = yorumla(c);
      return r.tur === 'basarili' && !('tur' in c) ? { ...r, logoAdi: varMiAdi(c.govde) } : r;
    },
    async malzemeKodlari() {
      const c = await istek('GET', '/api/Material/codes');
      if ('tur' in c) return c.tur === 'basarili' ? { tur: 'belirsiz', ileti: 'Beklenmeyen cevap.' } : c;
      if (c.durum >= 200 && c.durum < 300) {
        const kodlar = malzemeKodlariniAyikla(c.govde);
        if (kodlar !== null) return { tur: 'basarili', kodlar };
      }
      const sonuc = cevabiYorumla(c.durum, zarfMi(c.govde) ? c.govde : null);
      return sonuc.tur === 'basarili' ? { tur: 'belirsiz', ileti: 'Malzeme kodu listesi okunamadı.' } : sonuc;
    },
    async malzemeEkle(govde) {
      return yorumla(await istek('POST', '/api/Material/AddRich', govde));
    },
    async birimSetleri() {
      const c = await istek('GET', '/api/Lookup/unitsets');
      if ('tur' in c) return c.tur === 'basarili' ? { tur: 'belirsiz', ileti: 'Beklenmeyen cevap.' } : c;
      if (c.durum >= 200 && c.durum < 300) {
        const setler = birimSetleriniAyikla(c.govde);
        if (setler !== null) return { tur: 'basarili', setler };
      }
      const sonuc = cevabiYorumla(c.durum, zarfMi(c.govde) ? c.govde : null);
      return sonuc.tur === 'basarili' ? { tur: 'belirsiz', ileti: 'Birim seti listesi okunamadı.' } : sonuc;
    },
    async hizmetVarMi(yon, kod) {
      if (!secenek.hizmetVarMiYolu) return { tur: 'reddedildi', ileti: 'Hizmet kartı "var mı" yolu verilmedi; istek atılmadı.' };
      return yorumla(await istek('GET', secenek.hizmetVarMiYolu(yon, kod)));
    },
    async hizmetEkle(yon, govde) {
      return yorumla(await istek('POST', `${HIZMET_KOKU[yon]}/AddRich`, govde));
    },
    siparisBul: (no) => bul(`/api/PurchaseOrder/find/${encodeURIComponent(no)}`),
    async siparisSatirlari(no) {
      const c = await istek('GET', `/api/PurchaseOrder/${encodeURIComponent(no)}/lines`);
      // Satır listesi zarfsız dizi olabilir: 2xx ve okunabilen dizi başarıdır.
      if (!('tur' in c) && c.durum >= 200 && c.durum < 300) {
        const refler = satirRefleriniAyikla(c.govde);
        if (refler !== null) return { tur: 'basarili', logicalRef: null, satirRefleri: refler };
      }
      return satirli(c);
    },
    async siparisEkle(govde) {
      return satirli(await istek('POST', '/api/PurchaseOrder/AddRich', govde));
    },
    async siparisIptal(no) {
      return yorumla(await istek('POST', `/api/PurchaseOrder/${encodeURIComponent(no)}/cancel`, {}));
    },
    cariVarMi: (kod) => bul(`/api/Arp/find/${encodeURIComponent(kod)}`),
    async siparisGuncelle(govde) {
      return yorumla(await istek('POST', '/api/PurchaseOrder/UpdateRich', govde));
    },
    async siparisKapat(no, govde) {
      return yorumla(await istek('POST', `/api/PurchaseOrder/${encodeURIComponent(no)}/close`, govde));
    },
    async talepEkle(govde) {
      return satirli(await istek('POST', '/api/DemandFiche/AddRich', govde));
    },
    async karsilamaOku(siparisRef) {
      const c = await istek('GET', `/api/DemandFiche/peg/byOrder/${siparisRef}`);
      if ('tur' in c) return c.tur === 'basarili' ? { tur: 'belirsiz', ileti: 'Beklenmeyen cevap.' } : c;
      if (c.durum === 404) return { tur: 'basarili', govde: [] };
      if (c.durum >= 200 && c.durum < 300) return { tur: 'basarili', govde: c.govde };
      const r = cevabiYorumla(c.durum, zarfMi(c.govde) ? c.govde : null);
      return r.tur === 'basarili' ? { tur: 'belirsiz', ileti: 'Karşılama listesi okunamadı.' } : r;
    },
    async karsilamaEkle(govde) {
      return yorumla(await istek('POST', '/api/DemandFiche/peg', govde));
    },
    async karsilamaKaldir(siparisRef) {
      // Karşılaması olmayan siparişte 404 "kaldırılacak yok" sayılır (VARSAYIM).
      const c = await istek('DELETE', `/api/DemandFiche/peg/byOrder/${siparisRef}`);
      if (!('tur' in c) && c.durum === 404) return { tur: 'basarili', logicalRef: null };
      return yorumla(c);
    },
    satisMusterisiVarMi: (kod) => bul(`/api/SalesOffer/customer/${encodeURIComponent(kod)}`),
    async satisTeklifiEkle(govde) {
      return satirli(await istek('POST', '/api/SalesOffer/AddRich', govde));
    },
    async satisTeklifiOku(ref) {
      const c = await istek('GET', `/api/SalesOffer/${ref}`);
      if (!('tur' in c) && c.durum >= 200 && c.durum < 300) {
        const refler = satirRefleriniAyikla(c.govde);
        if (refler !== null) return { tur: 'basarili', logicalRef: ref, satirRefleri: refler };
      }
      return satirli(c);
    },
    async satisSiparisiAc(teklifRef, govde) {
      return satirli(await istek('POST', `/api/SalesOffer/${teklifRef}/toOrder`, govde));
    },
    async malzemeGuncelle(govde) {
      return yorumla(await istek('POST', '/api/Material/UpdateRich', govde));
    },
    async hizmetGuncelle(yon, govde) {
      return yorumla(await istek('POST', `${HIZMET_KOKU[yon]}/UpdateRich`, govde));
    },
    async malzemePasifeAl(no, kod) {
      return yorumla(await istek('POST', `/api/Material/${encodeURIComponent(no)}/deactivate`, { code: kod }));
    },
    async hizmetPasifeAl(yon, no, kod) {
      return yorumla(await istek('POST', `${HIZMET_KOKU[yon]}/${encodeURIComponent(no)}/deactivate`, { code: kod }));
    },
    hizmetVarMiYoluVar: secenek.hizmetVarMiYolu !== undefined,
    async kontrolOku(yol) {
      const c = await istek('GET', yol);
      return 'tur' in c ? (c.tur === 'basarili' ? { tur: 'belirsiz', ileti: 'Beklenmeyen cevap.' } : c) : c;
    },
  };
}
