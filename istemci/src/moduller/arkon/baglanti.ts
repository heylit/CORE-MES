// Arkon MES değiştirilmeden TMI içinde çalışır. Arkon kendi sunucusuyla konuştuğunu sanır: istekleri sanal bir sunucu
// adresine gider, bu katman onları TMI'nin /api/arkon uçlarına çevirir. Oturum TMI'nindir (çerez); Arkon'a ayrı giriş yoktur.
import type {
  AnomaliCevabi, AnomaliIstatistikCevabi, AnomaliOlaylariCevabi, OperatorOzetiCevabi, ArkonBenCevabi, ArkonKisi, ArkonKisilerCevabi, ArkonMalzemelerCevabi, BelgeCevabi, BelgeYazCevabi, BelgelerCevabi,
  EksikDosyaCevabi, IletilerCevabi, KayitEkleCevabi, KayitlarCevabi, MakineAyrimlariCevabi, MakineDoluRedAyrintisi, MerkezBelgelerCevabi, MerkezEkleCevabi, MerkezKontrolCevabi,
  RefakatKartlariCevabi,
} from '#paylasilan/sozlesme/arkon.ts';
import type { CagriEkiplerimCevabi } from '#paylasilan/sozlesme/bildirim.ts';
import type { IstasyonSecimiCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import type { UretimHazirligiCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { AdimCevabi, EmirAyrintiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import { AgHatasi, ApiHatasi, OTURUM_BITTI, api, istekKimligiMi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { MALZEME_TESLIM_AC, type MalzemeTeslimOdagi } from '../stok/disari.ts';
import { hazirlikMetni } from './kurallar.ts';

// Malzeme · Teslim panelini o malzemeyle açtıran olay; panel stok modülündedir (stok/ust-eylem.tsx dinler).
export { MALZEME_TESLIM_AC } from '../stok/disari.ts';
// Terminalin malzeme çipi (618): işin malzeme durumu ve paneli işle açma stok modülündedir.
export { durumMetni, isMalzemesiniAc, useIsMalzemeDurumu } from '../stok/disari.ts';

// Arkon'un "sunucu adresi"; gerçek bir yol değildir, yalnız bu katman tanır.
export const SANAL_SUNUCU = '/arkon-tmi';
// Sunucunun parça sınırının altında kalır (paylasilan/sozlesme/arkon.ts DOSYA_PARCASI).
export const PARCA = 512 * 1024;
const AZAMI_SATIR = 500;
export const ILETI_ARALIGI_MS = 2000;

// `ikili` verilmezse dosya `ikiliOku` ile okunur (testte sahte istemci verir).
export type Istemci = Pick<typeof api, 'get' | 'post'> & { ikili?: (yol: string) => Promise<Uint8Array<ArrayBuffer>> };

// Dosya JSON'a sarılmadan, sunucunun ikili cevabı olarak okunur: 200 MB'lık dosya base64 metne çevrilmez.
export async function ikiliOku(yol: string): Promise<Uint8Array<ArrayBuffer>> {
  let cevap: Response;
  try {
    cevap = await fetch(`/api${yol}`, { credentials: 'include' });
  } catch (hata) {
    throw new AgHatasi(hata);
  }
  if (!cevap.ok) {
    let govde: unknown = null;
    try { govde = await cevap.json(); } catch { govde = null; }
    if (cevap.status === 401) window.dispatchEvent(new CustomEvent(OTURUM_BITTI));
    const hata = govde as { kod?: unknown; mesaj?: unknown } | null;
    throw new ApiHatasi(cevap.status, hata !== null && typeof hata.kod === 'string' && typeof hata.mesaj === 'string' ? (hata as HataGovdesi) : null);
  }
  return new Uint8Array(await cevap.arrayBuffer());
}

export interface Cevap {
  durum: number;
  govde?: unknown;
  ham?: Uint8Array<ArrayBuffer>;
  // Kabuğun kullanıcıya söyleyeceği bilgi (ret değil).
  uyari?: string;
}

const tamam = (govde: unknown): Cevap => ({ durum: 200, govde });
const ret = (durum: number, mesaj: string): Cevap => ({ durum, govde: { error: mesaj } });
const yolParcasi = (p: string): string => encodeURIComponent(p);
export const listeKesildi = (n: number): string => `Liste en yeni ${n} kayıtla sınırlandı; daha eskisi için tarih aralığını daraltın.`;

export const arkonKisisi = (k: ArkonKisi) => ({ id: k.kimlik, name: k.ad, role: k.rol, wcs: k.isMerkezleri, st: k.istasyon, sts: k.istasyonlar ?? [], active: k.aktif });

export function base64Yaz(veri: Uint8Array): string {
  let ikili = '';
  for (let i = 0; i < veri.length; i += 0x8000) ikili += String.fromCharCode(...veri.subarray(i, i + 0x8000));
  return btoa(ikili);
}

export function base64Oku(metin: string): Uint8Array<ArrayBuffer> {
  const ikili = atob(metin);
  const veri = new Uint8Array(ikili.length);
  for (let i = 0; i < ikili.length; i++) veri[i] = ikili.charCodeAt(i);
  return veri;
}

function govdeyiOku(govde: unknown): unknown {
  if (typeof govde !== 'string') return govde;
  try { return JSON.parse(govde) as unknown; } catch { return undefined; }
}

const KAYIT_SORGUSU: Record<string, string> = {
  machine: 'makine', wc: 'isMerkezi', from: 'baslangic', to: 'bitis', order: 'emirNo', pkg: 'paketId', item: 'madde', limit: 'sinir',
};

function kayitSorgusu(sorgu: URLSearchParams): string {
  const cikti = new URLSearchParams();
  for (const [arkon, tmi] of Object.entries(KAYIT_SORGUSU)) {
    const deger = sorgu.get(arkon);
    if (deger !== null && deger !== '') cikti.set(tmi, deger);
  }
  const metin = cikti.toString();
  return metin === '' ? '' : `?${metin}`;
}

async function dosyaYukle(istemci: Istemci, ozet: string, veri: Uint8Array): Promise<void> {
  const toplam = Math.max(1, Math.ceil(veri.length / PARCA));
  for (let sira = 0; sira < toplam; sira++) {
    const parca = veri.subarray(sira * PARCA, (sira + 1) * PARCA);
    await istemci.post(`/arkon/dosyalar/${ozet}/parca`, { sira, toplam, veri: base64Yaz(parca) });
  }
}

// Belge ve kayıt yazımı Arkon'un gönderim kuyruğundan gider: ulaşılamazsa kayıt cihazda kalır, aynı kimlikle (belge sürümü, kayıt
// cid'i) yeniden gönderilir, sunucu tekrarı tek yazar. Bu yazma "sonucu bilinmeyen" sayılmaz; kuyruk her yeniden denemede yeni
// bir belirsiz kayıt sayılırdı. Bekleyen sayıyı kabuk şeridine Arkon'un bağlantı rozeti bildirir (yeni/ortak/BaglantiDurumu.tsx).
// İleti (bus) de sayılmaz: kuyruğa girmez, kayıt değildir, kalıcı karşılığı (çağrı, sonuç) kayıt ya da belge olarak ayrıca gider.
const BELIRSIZ_SAYILMAZ = { arkaPlan: true } as const;

export interface IstekGirdisi {
  yontem: string;
  // '/api' sonrası yol: '/doc/pkgs/x'
  yol: string;
  sorgu: URLSearchParams;
  govde: unknown;
}

// Arkon sunucu sözleşmesi (Arkon web/src/data/store.ts) -> TMI /api/arkon uçları.
export async function cevir(istemci: Istemci, g: IstekGirdisi, cikis?: () => void): Promise<Cevap> {
  const p = g.yol.split('/').filter(Boolean).map(decodeURIComponent);
  const kaynak = g.sorgu.get('c') ?? 'tmi';
  const [ilk, ikinci, ucuncu] = p;

  if (ilk === 'health') {
    await istemci.get<ArkonBenCevabi>('/arkon/ben');
    return tamam({ ok: true, app: 'arkon-mes', version: '26', db: true, time: Date.now() });
  }
  if (ilk === 'me') return tamam(arkonKisisi((await istemci.get<ArkonBenCevabi>('/arkon/ben')).kisi));
  if (ilk === 'users' && g.yontem === 'GET') {
    return tamam((await istemci.get<ArkonKisilerCevabi>('/arkon/kisiler')).kisiler.map(arkonKisisi));
  }
  if (ilk === 'users') return ret(403, 'Kişiler ve roller TMI\'de yönetilir (Personel).');
  if (ilk === 'login') return ret(403, 'Giriş TMI\'den yapılır.');
  // Arkon'dan çıkış TMI oturumunu kapatır: Arkon'un ayrı girişi yoktur.
  if (ilk === 'logout') {
    cikis?.();
    return tamam({ ok: true });
  }

  if (ilk === 'materials' && g.yontem === 'GET') {
    const ara = g.sorgu.get('q')?.trim() ?? '';
    return tamam((await istemci.get<ArkonMalzemelerCevabi>(`/arkon/malzemeler${ara === '' ? '' : `?ara=${encodeURIComponent(ara)}`}`)).malzemeler);
  }
  if (ilk === 'doc' && ikinci !== undefined) {
    const depo = yolParcasi(ikinci);
    if (ucuncu === undefined && g.yontem === 'GET') {
      const { belgeler } = await istemci.get<BelgelerCevabi>(`/arkon/belgeler/${depo}`);
      return tamam(belgeler.map((b) => ({ id: b.kimlik, u: b.surum, d: b.govde })));
    }
    if (ucuncu === undefined) return ret(404, 'Bilinmeyen istek');
    const yol = `/arkon/belgeler/${depo}/${yolParcasi(ucuncu)}`;
    if (g.yontem === 'GET') {
      const { belge } = await istemci.get<BelgeCevabi>(yol);
      return belge === null ? ret(404, 'yok') : tamam({ u: belge.surum, d: belge.govde });
    }
    if (g.yontem === 'PUT') {
      const taban = g.sorgu.get('base');
      const sonuc = await istemci.post<BelgeYazCevabi>(`${yol}/yaz`, {
        taban: taban === null ? null : Number(taban), govde: govdeyiOku(g.govde), kaynak,
      }, BELIRSIZ_SAYILMAZ);
      if (sonuc.sonuc === 'yazildi') return tamam({ ok: true, u: sonuc.surum });
      return { durum: 409, govde: { error: 'Kayıt başka bir cihazda değişti', cur: { u: sonuc.guncel.surum, d: sonuc.guncel.govde } } };
    }
    // Silme de son bilinen sürümle gider; sürümü bilinmeyen silme sunucuda reddedilir (taban yok).
    if (g.yontem === 'DELETE') {
      const taban = g.sorgu.get('base');
      await istemci.post(`${yol}/sil`, { kaynak, ...(taban === null ? {} : { taban: Number(taban) }) }, BELIRSIZ_SAYILMAZ);
      return tamam({ ok: true });
    }
  }

  if (ilk === 'blob' && ikinci === 'missing') {
    const ozetler = govdeyiOku(g.govde);
    return tamam((await istemci.post<EksikDosyaCevabi>('/arkon/dosyalar/eksikler', { ozetler })).eksikler);
  }
  if (ilk === 'blob' && ikinci !== undefined && g.yontem === 'PUT') {
    // Gövde Arkon çerçevesinin Uint8Array'idir (başka pencere): instanceof değil isView sınanır.
    if (!ArrayBuffer.isView(g.govde)) return ret(400, 'Dosya içeriği yok');
    const v = g.govde;
    await dosyaYukle(istemci, ikinci, new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
    return tamam({ ok: true });
  }
  // Arka plan indirmesi ayrı uçtan gider: kişi açmadığı için indirme günlüğüne yazılmaz (kart #731, karar 730 a).
  if (ilk === 'blob' && ikinci !== undefined && ucuncu === 'arka') {
    return { durum: 200, ham: await (istemci.ikili ?? ikiliOku)(`/arkon/dosyalar/${yolParcasi(ikinci)}/arka-plan`) };
  }
  if (ilk === 'blob' && ikinci !== undefined) {
    return { durum: 200, ham: await (istemci.ikili ?? ikiliOku)(`/arkon/dosyalar/${yolParcasi(ikinci)}`) };
  }

  // Çizim Merkezi (kart #800): yalnız merkezden ALMA vardır; Arkon'da yüklenen dosya merkeze gitmez.
  if (ilk === 'merkez' && ikinci === 'belgeler' && g.yontem === 'GET' && p[2] === undefined) {
    const ara = g.sorgu.get('q')?.trim() ?? '';
    return tamam((await istemci.get<MerkezBelgelerCevabi>(`/arkon/cizim-merkezi/belgeler${ara === '' ? '' : `?ara=${encodeURIComponent(ara)}`}`)).belgeler);
  }
  if (ilk === 'merkez' && ikinci === 'belgeler' && g.yontem === 'POST' && p[3] === 'al') {
    return tamam(await istemci.post<MerkezEkleCevabi>(`/arkon/cizim-merkezi/belgeler/${yolParcasi(p[2] ?? '')}/ekle`, {}));
  }
  if (ilk === 'merkez' && ikinci === 'kontrol' && g.yontem === 'GET') {
    return tamam((await istemci.get<MerkezKontrolCevabi>(`/arkon/cizim-merkezi/kontrol?dosyalar=${encodeURIComponent(g.sorgu.get('d') ?? '')}`)).durumlar);
  }

  if (ilk === 'log' && ikinci !== undefined && g.yontem === 'POST') {
    const govde = govdeyiOku(g.govde);
    const satirlar = (Array.isArray(govde) ? govde : [govde]).filter((s): s is Record<string, unknown> => !!s && typeof s === 'object');
    let n = 0;
    const reddedilen: KayitEkleCevabi['reddedilen'] = [];
    const uyarilar: KayitEkleCevabi['uyarilar'] = [];
    for (let i = 0; i < satirlar.length; i += AZAMI_SATIR) {
      const dilim = satirlar.slice(i, i + AZAMI_SATIR);
      const cevap = await istemci.post<Pick<KayitEkleCevabi, 'eklenen'> & Partial<KayitEkleCevabi>>(`/arkon/kayitlar/${yolParcasi(ikinci)}/ekle`, { satirlar: dilim, kaynak }, BELIRSIZ_SAYILMAZ);
      n += cevap.eklenen;
      reddedilen.push(...(cevap.reddedilen ?? []));
      uyarilar.push(...(cevap.uyarilar ?? []));
    }
    return tamam({ ok: true, n, ...(reddedilen.length === 0 ? {} : { reddedilen }), ...(uyarilar.length === 0 ? {} : { uyarilar }) });
  }
  if (ilk === 'log' && ikinci !== undefined) {
    const liste = await istemci.get<KayitlarCevabi>(`/arkon/kayitlar/${yolParcasi(ikinci)}${kayitSorgusu(g.sorgu)}`);
    return liste.kesildi === true ? { ...tamam(liste.satirlar), uyari: listeKesildi(liste.satirlar.length) } : tamam(liste.satirlar);
  }

  if (ilk === 'bus' && g.yontem === 'POST') {
    const govde = govdeyiOku(g.govde) as { msg?: { mid?: unknown } | null; c?: unknown } | undefined;
    // İleti ucu tekrar korumalıdır. Uygulama iletiye kimlik (`mid`) verir; UUID ise istek kimliği odur ve uygulamanın aynı iletiyi
    // yeniden göndermesi ikinci satır açmaz. Düz http'deki tablette `mid` UUID değildir; o zaman kimlik bu gönderim için üretilir.
    const mid = govde?.msg?.mid;
    const istekKimligi = istekKimligiMi(mid) ? mid : yeniIstekKimligi();
    const yuk = { ileti: govde?.msg, kaynak: typeof govde?.c === 'string' ? govde.c : kaynak };
    await tekrarKorumaliGonder(
      (d) => istemci.post('/arkon/iletiler', yuk, { ...BELIRSIZ_SAYILMAZ, istekKimligi: d.istekKimligi, zamanAsimiMs: d.zamanAsimiMs, ...(d.sinyal ? { sinyal: d.sinyal } : {}) }),
      { istekKimligi },
    );
    return tamam({ ok: true });
  }
  // 298: çağrı bandının alıcısı TMI bildirim yönlendirmesindedir; yalnız oturumdaki kişinin ekipleri döner.
  if (ilk === 'cagri-ekiplerim' && g.yontem === 'GET') return tamam(await istemci.get<CagriEkiplerimCevabi>('/bildirimler/cagri-yonlendirme/benim'));
  if (ilk === 'anomaliler' && g.yontem === 'GET') return tamam(await istemci.get<AnomaliCevabi>('/arkon/anomaliler'));
  if (ilk === 'anomali-olaylari' && g.yontem === 'GET') return tamam(await istemci.get<AnomaliOlaylariCevabi>('/arkon/anomali-olaylari'));
  if (ilk === 'anomali-istatistik' && g.yontem === 'GET') {
    // Yalnız dönem ve tarih geçer; doğrulamayı TMI ucu yapar.
    const q = new URLSearchParams({ donem: g.sorgu.get('donem') ?? '', tarih: g.sorgu.get('tarih') ?? '' });
    return tamam(await istemci.get<AnomaliIstatistikCevabi>(`/arkon/anomali-istatistik?${q.toString()}`));
  }
  if (ilk === 'operator-ozeti' && g.yontem === 'GET') {
    const sorgu = new URLSearchParams();
    for (const ad of ['donem', 'kisiId']) { const deger = g.sorgu.get(ad); if (deger) sorgu.set(ad, deger); }
    const metin = sorgu.toString();
    return tamam(await istemci.get<OperatorOzetiCevabi>(`/arkon/operator-ozeti${metin ? `?${metin}` : ''}`));
  }
  // Emrin talimat adımları (Üretim Terminali ile aynı uçlar): işaret sunucuya yazılır, cevaptaki liste doğruluk kaynağıdır.
  if (ilk === 'tmi-adimlar' && ikinci !== undefined) {
    const emirId = Number(ikinci);
    if (!Number.isSafeInteger(emirId) || emirId <= 0) return ret(400, 'Geçersiz emir');
    if (g.yontem === 'GET' && ucuncu === undefined) return tamam((await istemci.get<EmirAyrintiCevabi>(`/uretim-emirleri/${emirId}`)).adimlar ?? []);
    if (g.yontem === 'POST' && ucuncu !== undefined) {
      const isaret = (govdeyiOku(g.govde) as { tamam?: unknown } | undefined)?.tamam;
      if (typeof isaret !== 'boolean') return ret(400, 'İşaret yok');
      return tamam((await istemci.post<AdimCevabi>(`/uretim-emirleri/${emirId}/adimlar/${yolParcasi(ucuncu)}/tamamla`, { tamam: isaret })).adimlar);
    }
  }
  // Başlatmadan önce girdiler istasyonda mı (kart #1289): eksikse istek açılır, Malzeme · Teslim paneli o malzemeyle açılır, iş uyarıyla başlar (110 b).
  // İstasyon kişinin seçebildikleri arasında yoksa denetlenmez; son sözü sunucunun başlat denetimi söyler.
  if (ilk === 'uretim-hazirligi' && g.yontem === 'POST') {
    const govde = govdeyiOku(g.govde) as { emirId?: unknown; istasyon?: unknown } | undefined;
    const emirId = govde?.emirId;
    if (typeof emirId !== 'number' || !Number.isSafeInteger(emirId) || emirId <= 0 || typeof govde?.istasyon !== 'string') return ret(400, 'Emir ya da istasyon yok');
    const { gruplar } = await istemci.get<IstasyonSecimiCevabi>('/istasyonlar/secim');
    const istasyon = gruplar.flatMap((x) => x.istasyonlar).find((x) => x.kod === govde.istasyon);
    if (istasyon === undefined) return tamam({ hazir: true, denetlenmedi: true });
    const c = await istemci.post<UretimHazirligiCevabi>('/stok/uretim-hazirligi', { uretimEmriId: emirId, istasyonId: istasyon.id });
    const metin = hazirlikMetni(c);
    if (metin === null) return tamam({ hazir: true });
    const eksik = c.eksikler[0];
    if (eksik !== undefined && typeof window !== 'undefined') {
      const odak: MalzemeTeslimOdagi = { istasyonId: istasyon.id, uretimEmriId: emirId, malzemeId: eksik.malzemeId };
      window.dispatchEvent(new CustomEvent(MALZEME_TESLIM_AC, { detail: odak }));
    }
    return tamam({ hazir: false, metin });
  }
  // 393 d: makine seçicisinin ayrımları; yalnız emir kimliği geçer, doğrulamayı TMI ucu yapar.
  if (ilk === 'makine-ayrimlari' && g.yontem === 'GET') {
    const q = new URLSearchParams({ emirId: g.sorgu.get('emirId') ?? '' });
    return tamam(await istemci.get<MakineAyrimlariCevabi>(`/arkon/makine-ayrimlari?${q.toString()}`));
  }
  // Kart #156: işin altındaki refakat kartları; istasyon ve emirler olduğu gibi geçer, doğrulamayı TMI ucu yapar.
  if (ilk === 'refakat-kartlari' && g.yontem === 'GET') {
    const q = new URLSearchParams({ istasyon: g.sorgu.get('istasyon') ?? '', emirler: g.sorgu.get('emirler') ?? '' });
    return tamam(await istemci.get<RefakatKartlariCevabi>(`/arkon/refakat-kartlari?${q.toString()}`));
  }
  if (ilk === 'plan-sira' && g.yontem === 'POST') return tamam(await istemci.post('/arkon/plan-sira/sirala', govdeyiOku(g.govde)));
  if (ilk === 'plan-sira' && g.yontem === 'GET') return tamam(await istemci.get('/arkon/plan-sira/surum'));
  // Kart 527: Üretim Hazırlık kuyruk sırası; istasyon ve paket kimlikleri olduğu gibi geçer, doğrulamayı TMI ucu yapar.
  if (ilk === 'kuyruk-sira' && g.yontem === 'POST' && ikinci === undefined) {
    return tamam(await istemci.post('/arkon/kuyruk-sira/sirala', { ...(govdeyiOku(g.govde) as object), kaynak }));
  }
  if (ilk === 'kuyruk-sira' && g.yontem === 'POST' && ikinci === 'plana-don') {
    return tamam(await istemci.post('/arkon/kuyruk-sira/plana-don', { ...(govdeyiOku(g.govde) as object), kaynak }));
  }
  if (ilk === 'collector') return tamam({ machines: {}, note: 'Makine verisi TMI\'de toplanır.' });
  if (ilk === 'backups' && g.yontem === 'GET' && ikinci === undefined) return tamam([]);
  if (ilk === 'backups' || ilk === 'restore') return ret(403, 'Yedekleme TMI sunucusunda yapılır.');
  if (ilk === 'schema') return tamam([]);
  return ret(404, 'Bilinmeyen istek');
}

// TMI hatası Arkon'un hata biçimine çevrilir; sunucuya ulaşılamadıysa hata olduğu gibi kalır (Arkon kuyruğa alır).
export async function cevapla(istemci: Istemci, g: IstekGirdisi, cikis?: () => void): Promise<Cevap> {
  try {
    return await cevir(istemci, g, cikis);
  } catch (hata) {
    if (hata instanceof ApiHatasi) return ret(hata.durum, hata.govde.mesaj);
    throw hata;
  }
}

// Arkon ekranı sunucunun yazma reddini çoğu yerde göstermez, çevrimdışı kuyruk da reddedilen öğeyi sessizce düşürür (UYUM-BORCU "Sessiz kayıp").
// Köprü her reddedilen yazmayı TMI bildirimiyle söyler. Söylenmeyenler: okuma; belge çakışması (409, Arkon güncel belgeyle yeniden dener;
// kaydın 409'u ise TMI kuralı reddidir ve söylenir: Arkon'un kendi iletisi kendiliğinden açılan TMI penceresinin arkasında kalır, 12.9);
// oturum düşmesi (401, giriş ekranı açılır); bulunamadı (404, Arkon "yok" sayar); günlük kaydı (audit: günlüğü sunucu yazar, ekranın
// her değişiklikte gönderdiği satır her zaman reddedilir); giriş ve çıkış.
const SESSIZ_DURUMLAR: ReadonlySet<number> = new Set([401, 404, 409]);
const NE_YAZILDI: Record<string, string> = { doc: 'Belge', log: 'Kayıt', bus: 'İleti', blob: 'Dosya' };

export function reddiBildirimi(yontem: string, yol: string, cevap: Cevap): string | null {
  if (yontem === 'GET' || cevap.durum < 400) return null;
  const [ilk, ikinci] = yol.split('/').filter(Boolean).map(decodeURIComponent);
  if (SESSIZ_DURUMLAR.has(cevap.durum) && !(cevap.durum === 409 && ilk === 'log')) return null;
  if (ilk === undefined || NE_YAZILDI[ilk] === undefined) return null;
  if (ilk === 'log' && ikinci === 'audit') return null;
  if (ilk === 'blob' && ikinci === 'missing') return null;
  const hata = (cevap.govde as { error?: unknown } | undefined)?.error;
  const neden = typeof hata === 'string' && hata !== '' ? hata : `HTTP ${cevap.durum}`;
  return `${NE_YAZILDI[ilk]} kaydedilmedi${ikinci === undefined ? '' : ` (${ikinci})`}: ${neden}`;
}

// Kayıt sunucuda yazılır ama TMI üretim kuralı yansımasını reddedebilir (ör. kol önceki adım bitmeden, birleşme adımı parti gelmeden): ekran bunu
// görmez, kaydı tamam sanır. Sunucunun TMI kuralı metni operatöre olduğu gibi söylenir.
// devralinabilir: makine dolu retleri ayrıca sorulur (`makineDoluRetleri`), burada bildirim olmaz.
export function tmiReddiBildirimleri(cevap: Cevap, devralinabilir = false): string[] {
  const liste = (cevap.govde as { reddedilen?: unknown } | undefined)?.reddedilen;
  if (cevap.durum >= 400 || !Array.isArray(liste)) return [];
  return liste.flatMap((r: { ileti?: unknown; makineDolu?: unknown } | null) => (
    typeof r?.ileti === 'string' && !(devralinabilir && r.makineDolu !== undefined) ? [`İşlem reddedildi: ${r.ileti}`] : []));
}

export interface MakineDoluRedi extends MakineDoluRedAyrintisi { cid: string; ileti: string }

// Makine başka işte doluyken reddedilen başlatmalar: kullanıcıya "önce durdurulmalı, devralınsın mı" diye sorulur.
export function makineDoluRetleri(cevap: Cevap): MakineDoluRedi[] {
  const liste = (cevap.govde as { reddedilen?: unknown } | undefined)?.reddedilen;
  if (cevap.durum >= 400 || !Array.isArray(liste)) return [];
  return liste.flatMap((r: { cid?: unknown; ileti?: unknown; makineDolu?: MakineDoluRedAyrintisi } | null) => (
    typeof r?.cid === 'string' && typeof r.ileti === 'string' && r.makineDolu !== undefined ? [{ cid: r.cid, ileti: r.ileti, ...r.makineDolu }] : []));
}

// TMI'nin yazdığı ama söylenmesi gereken kayıtlar (insanlı istasyonda başkası da çalışıyor): ret değil uyarıdır.
export function tmiUyarilari(cevap: Cevap): string[] {
  const liste = (cevap.govde as { uyarilar?: unknown } | undefined)?.uyarilar;
  if (cevap.durum >= 400 || !Array.isArray(liste)) return [];
  return liste.flatMap((u: { ileti?: unknown } | null) => (typeof u?.ileti === 'string' ? [u.ileti] : []));
}

export interface AnlikIletim {
  onopen: ((olay: Event) => void) | null;
  onmessage: ((olay: MessageEvent) => void) | null;
  onerror: ((olay: Event) => void) | null;
  readyState: number;
  close(): void;
}

// Arkon'un EventSource beklentisi kısa aralıklı okumayla karşılanır: TMI uçları JSON'dur, akış tutmaz.
export function anlikIletimKur(istemci: Istemci, kaynak: string, bekle = (ms: number) => new Promise((t) => setTimeout(t, ms))): AnlikIletim {
  let son: number | undefined;
  let acik = true;
  let bagli = false;
  const iletim: AnlikIletim = {
    onopen: null, onmessage: null, onerror: null, readyState: 0,
    close() { acik = false; iletim.readyState = 2; },
  };
  void (async () => {
    while (acik) {
      try {
        const sorgu = new URLSearchParams({ kaynak, ...(son === undefined ? {} : { son: String(son) }) });
        const cevap = await istemci.get<IletilerCevabi>(`/arkon/iletiler?${sorgu.toString()}`);
        if (!acik) break;
        son = cevap.son;
        if (!bagli) { bagli = true; iletim.readyState = 1; iletim.onopen?.(new Event('open')); }
        for (const ileti of cevap.iletiler) iletim.onmessage?.(new MessageEvent('message', { data: JSON.stringify(ileti) }));
      } catch {
        if (!acik) break;
        bagli = false;
        iletim.readyState = 0;
        iletim.onerror?.(new Event('error'));
      }
      await bekle(ILETI_ARALIGI_MS);
    }
  })();
  return iletim;
}

export interface Tohum {
  kokAdres: string;
  kisi: ArkonKisi;
  tema: 'dark' | 'light';
}

// Arkon açılırken okuduğu ayarlar (localStorage, 'arkon:' önekli JSON). Aynı köken: TMI ile aynı depo.
export function tohumla(depo: Pick<Storage, 'setItem' | 'getItem'>, t: Tohum): void {
  const sunucu = `${t.kokAdres}${SANAL_SUNUCU}`;
  const yaz = (anahtar: string, deger: unknown) => depo.setItem(`arkon:${anahtar}`, JSON.stringify(deger));
  yaz('server', sunucu);
  yaz('session', { token: 'tmi', user: arkonKisisi(t.kisi), srv: sunucu });
  yaz('theme', t.tema);
}

type Pencere = Window & typeof globalThis;

// Kabukta tema değişince çerçevedeki Arkon da değişir: Arkon temayı 'arkon:theme'den okur ve sayfanın kökünde tutar;
// 'arkon-tema' olayı Arkon'un tema düğmesini de yeni değere çeker (arkon/web baslat.ts useTheme).
export function temayiUygula(pencere: Pick<Window, 'localStorage' | 'document' | 'dispatchEvent'>, tema: 'dark' | 'light'): void {
  try { pencere.localStorage.setItem('arkon:theme', JSON.stringify(tema)); } catch { /* depolama kapalıysa yalnız kök değişir */ }
  // Çerçeve yüklenirken belge bir an köksüz olabilir; yüklenince (onLoad) tema yeniden uygulanır.
  const kok = pencere.document.documentElement as HTMLElement | null;
  if (kok) kok.setAttribute('data-theme', tema);
  pencere.dispatchEvent(new Event('arkon-tema'));
}

// Ctrl K'den Üretim Terminali'ne emir seçimi (kullanıcı kararı 16.10): adresteki `?emir=<üretim emri id>` çerçeveye bırakılır, Arkon'un
// operatör ekranı okur (arkon/web/src/data/emir-secimi.ts). Görme yetkisi Arkon'da süzülür: operatörün listesinde olmayan emir yok sayılır.
export const EMIR_PARAMETRESI = 'emir';
export const emirParametresiOku = (deger: string | null): number | null => {
  const id = deger === null || !/^[1-9]\d{0,9}$/.test(deger) ? NaN : Number(deger);
  return Number.isSafeInteger(id) ? id : null;
};
// Malzeme Teslim'in "İş emrini aç"ı (kart #156) okutulan refakat kartını da verir: `&kart=<refakat partisi id>`; iş o kartla açılır.
export const KART_PARAMETRESI = 'kart';
export function emirSeciminiGonder(pencere: Pick<Window, 'dispatchEvent'> & { __tmiEmirSec?: number; __tmiKartSec?: number }, emirId: number, kartId: number | null = null): void {
  pencere.__tmiEmirSec = emirId;
  if (kartId === null) delete pencere.__tmiKartSec;
  else pencere.__tmiKartSec = kartId;
  pencere.dispatchEvent(new Event('tmi-emir-sec'));
}

export const ONIZLEME_SALT_OKUR = 'Önizlemede kayıt yapılmaz; istek TMI\'ye gönderilmedi.';
// 4a (kart 723): taşınan ekranların eski görünümü yönetici için bir süre yalnız bakmak içindir; kayıt yeni ekranda yapılır.
export const ESKI_GORUNUM_SALT_OKUR = 'Eski görünüm yalnız okunur; kayıt yeni ekranda yapılır. İstek TMI\'ye gönderilmedi.';
// Arkon'un TMI'de açtırabileceği sayfalar (A5, kart #541): yalnız bu listedeki hedef açılır, çerçeve TMI'de yol seçemez.
export const TMI_HEDEFLERI: Readonly<Record<string, string>> = { 'emir-ac': '/recete-rota', plan: '/recete-rota/plan', istasyonlar: '/istasyonlar' };

export const BASKA_SUNUCU = "TMI CORE yalnız kendi sunucusuna bağlanır; başka sunucuya istek gönderilmedi.";

// Başka sunucuya açılmak istenen olay akışı: bağlantı kurulmaz, Arkon kopmuş akış gibi görür.
export function kapaliIletim(): AnlikIletim {
  const iletim: AnlikIletim = { onopen: null, onmessage: null, onerror: null, readyState: 2, close: () => {} };
  setTimeout(() => iletim.onerror?.(new Event('error')), 0);
  return iletim;
}

// Arkon çerçevesinin penceresinde fetch ve EventSource sanal sunucu adresi için bu katmana yönlenir; öteki istekler dokunulmaz.
// Arkon'un kendi sayfa şeridi gizlenir: sayfaları TMI'nin ikinci menüsü açar. Kural Arkon'un TV kipindekinin aynısıdır.
// Dönen işlev açılan olay akışlarını kapatır: okuma döngüsü TMI penceresinde döner, çerçeve kapanınca kendiliğinden durmaz.
export const SERIT_GIZLE = '.rail{display:none!important}:root{--rail:0px!important}';

// Arkon açılışta oturumu sırayla iki kez sorar (health, me) ve çerçeve onu zaten sormuştur: her biri bir gidiş-dönüş bekletir.
// Kısa süre içinde aynı cevap kullanılır; süre dolunca (ya da hata olunca) yeniden sorulur, oturum düşmesi yine görülür.
export const BEN_TAZE_MS = 5000;
const BEN_YOLU = '/arkon/ben';

export function benOnbellekli(istemci: Istemci, ilk?: { cevap: ArkonBenCevabi; zaman: number }, simdi: () => number = Date.now): Istemci {
  let son: { soz: Promise<ArkonBenCevabi>; zaman: number } | null = ilk === undefined ? null : { soz: Promise.resolve(ilk.cevap), zaman: ilk.zaman };
  const get = (<T>(yol: string, ...geri: unknown[]): Promise<T> => {
    if (yol !== BEN_YOLU) return (istemci.get as (y: string, ...g: unknown[]) => Promise<T>)(yol, ...geri);
    if (son === null || simdi() - son.zaman > BEN_TAZE_MS) {
      const kayit = { soz: istemci.get<ArkonBenCevabi>(BEN_YOLU), zaman: simdi() };
      son = kayit;
      kayit.soz.catch(() => { if (son === kayit) son = null; });
    }
    return son.soz as Promise<T>;
  }) as Istemci['get'];
  return { get, post: istemci.post, ...(istemci.ikili === undefined ? {} : { ikili: istemci.ikili }) };
}

// Aynı ret iletisi kısa aralıkta bir kez gösterilir: ekran reddedilen kaydı yeniden gönderince ya da kullanıcı düğmeye üst üste basınca
// bildirimler üst üste binmesin. Farklı ileti ya da süre geçince yeniden gösterilir.
export const TEKRAR_SUSTURMA_MS = 10_000;
export function tekrarSuzgeci(sure = TEKRAR_SUSTURMA_MS, simdi: () => number = Date.now): (ileti: string) => boolean {
  const son = new Map<string, number>();
  return (ileti) => {
    const an = simdi();
    for (const [i, t] of son) if (an - t >= sure) son.delete(i);
    if (son.has(ileti)) return false;
    son.set(ileti, an);
    return true;
  };
}

export function bagla(
  pencere: Pencere, secenek: {
    istemci?: Istemci; cikis?: () => void; reddedildi?: (ileti: string) => void; git?: (yol: string) => void;
    makineDolu?: (red: MakineDoluRedi) => void; uyari?: (ileti: string) => void;
    // Eski görünüm (723): okuma TMI'ye gider, hiçbir yazma gönderilmez; ilk ret kullanıcıya söylenir (Arkon 403'ü kuyruğa almaz, düşürür).
    saltOkunur?: boolean;
    // Çerçevenin az önce aldığı /arkon/ben cevabı ve alındığı an (ms): Arkon açılışta sırayla iki kez daha sorar (health, me).
    ben?: { cevap: ArkonBenCevabi; zaman: number };
  } = {},
): () => void {
  const istemci = benOnbellekli(secenek.istemci ?? api, secenek.ben);
  const yeniRet = tekrarSuzgeci();
  const reddet = (ileti: string): void => { if (yeniRet(ileti)) secenek.reddedildi?.(ileti); };
  // "Yeni paket" TMI'de emir açma sayfasına götürür (arkon/web/src/data/yeni-paket.ts `tmiyeGit`).
  (pencere as Pencere & { __tmiGit?: (hedef: string) => boolean }).__tmiGit = (hedef) => {
    const yol = Object.hasOwn(TMI_HEDEFLERI, hedef) ? TMI_HEDEFLERI[hedef] : undefined;
    if (yol === undefined || secenek.git === undefined) return false;
    secenek.git(yol);
    return true;
  };
  const stil = pencere.document.createElement('style');
  stil.textContent = SERIT_GIZLE;
  (pencere.document.head ?? pencere.document.documentElement).appendChild(stil);
  const sunucu = `${pencere.location.origin}${SANAL_SUNUCU}`;
  const asilFetch = pencere.fetch.bind(pencere);
  const AsilEventSource = pencere.EventSource;
  const acikIletimler = new Set<AnlikIletim>();
  // Arkon adres ayarını çerçeve her açıldığında TMI'nin sanal adresine çevirir: elle yazılan başka adres kalıcı olmaz.
  pencere.localStorage.setItem('arkon:server', JSON.stringify(sunucu));
  const baskaKoken = (adres: string): boolean => {
    try {
      return new URL(adres, pencere.location.href).origin !== pencere.location.origin;
    } catch {
      return true;
    }
  };

  pencere.fetch = async (girdi: RequestInfo | URL, ayar?: RequestInit): Promise<Response> => {
    const adres = typeof girdi === 'string' ? girdi : girdi instanceof URL ? girdi.href : girdi.url;
    // TMI içinde Arkon yalnız TMI'ye bağlanır: başka sunucuya giden istek gönderilmez (adres ayarıyla yönlendirme açığı).
    if (baskaKoken(adres)) {
      secenek.reddedildi?.(BASKA_SUNUCU);
      return new pencere.Response(JSON.stringify({ error: BASKA_SUNUCU }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
    if (!adres.startsWith(`${sunucu}/api/`)) return asilFetch(girdi, ayar);
    const url = new URL(adres);
    const yontem = (ayar?.method ?? 'GET').toUpperCase();
    const yol = url.pathname.slice(`${SANAL_SUNUCU}/api`.length);
    // Önizleme ("Operatör gözüyle") TMI'yi yalnız okur: ekranın kendi kayıtları önizlemede kapalı, köprü de yazmayı TMI'ye hiç iletmez.
    if (yontem !== 'GET' && pencere.location.hash.startsWith('#onizle:')) {
      return new pencere.Response(JSON.stringify({ error: ONIZLEME_SALT_OKUR }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
    if (yontem !== 'GET' && secenek.saltOkunur === true) {
      reddet(ESKI_GORUNUM_SALT_OKUR);
      return new pencere.Response(JSON.stringify({ error: ESKI_GORUNUM_SALT_OKUR }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
    const cevap = await cevapla(istemci, { yontem, yol, sorgu: url.searchParams, govde: ayar?.body ?? undefined }, secenek.cikis);
    const ret = reddiBildirimi(yontem, yol, cevap);
    if (ret !== null) reddet(ret);
    for (const ileti of tmiReddiBildirimleri(cevap, secenek.makineDolu !== undefined)) reddet(ileti);
    if (secenek.makineDolu !== undefined) for (const red of makineDoluRetleri(cevap)) secenek.makineDolu(red);
    for (const ileti of tmiUyarilari(cevap)) secenek.uyari?.(ileti);
    if (cevap.uyari !== undefined) secenek.uyari?.(cevap.uyari);
    if (cevap.ham) return new pencere.Response(cevap.ham, { status: cevap.durum, headers: { 'Content-Type': 'application/octet-stream' } });
    return new pencere.Response(JSON.stringify(cevap.govde ?? null), { status: cevap.durum, headers: { 'Content-Type': 'application/json' } });
  };

  function SanalEventSource(adres: string | URL, ayar?: EventSourceInit): AnlikIletim | EventSource {
    const metin = String(adres);
    if (baskaKoken(metin)) {
      secenek.reddedildi?.(BASKA_SUNUCU);
      return kapaliIletim();
    }
    if (!metin.startsWith(`${sunucu}/api/bus`)) return new AsilEventSource(adres, ayar);
    const iletim = anlikIletimKur(istemci, new URL(metin).searchParams.get('c') ?? 'tmi');
    const kapat = iletim.close.bind(iletim);
    iletim.close = () => { acikIletimler.delete(iletim); kapat(); };
    acikIletimler.add(iletim);
    return iletim;
  }
  pencere.EventSource = SanalEventSource as unknown as typeof EventSource;
  return () => { for (const iletim of [...acikIletimler]) iletim.close(); };
}
