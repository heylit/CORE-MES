import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOSYA, adimSatiriOku } from './sozlesme.ts';
import type { KosuKaydi } from './kayit.ts';
import type { RolIstemcisi } from './senaryo.ts';
import type { AdimSatiri, Sonuc } from './sozlesme.ts';
import type { Hesap } from '../hesaplar.ts';

// Gün sonu değişmezleri: yalnız uçlardan okunur (SQL ve sunucu ithali yok). Cevap biçimi paylasilan/sozlesme'deki şemadır;
// burada ithal edilmez, yalnız kullanılan alanlar okunur: sözleşme değişirse alan eksik diye düşer, sessizce geçmez.
export const OKUYUCU: Hesap = 'ornek.yonetici';
export const SENARYO_ADI = 'degismez';
// Bir günde okunan kayıt üst sınırı: 22 günlük koşuda denetim koşudan uzun sürmesin. Aşılırsa iletide "kesildi" yazar.
export const AZAMI_KAYIT = 400;
const SAYFA_BOYU = 200;
// Bakiye toplamı malzeme başına ayrı okuma ister; günde bu kadar malzeme.
const AZAMI_AYRINTI = 100;
// Yavaş uç eşiği (p95). Ölçüm her gün yazılır; eşiği aşan uç adımı düşürür.
export const YAVAS_ESIK_MS = 2000;
const ILETI_SINIRI = 10;

export interface Ihlal {
  yer: string;
  neden: string;
}

export interface DenetimSonucu {
  ad: string;
  sonuc: Exclude<Sonuc, 'ara-sira'>;
  beklenen: string;
  gelen: string;
  ileti: string | null;
}

type Kayit = Record<string, unknown>;

// Miktar ondalık metindir ("12.500"); binde birlik tam sayıya çevrilir, toplamada kayan nokta hatası birikmez.
export function binde(m: unknown): number | null {
  if (typeof m !== 'string' || !/^-?\d+(\.\d{1,3})?$/.test(m.trim())) return null;
  return Math.round(Number(m) * 1000);
}

const sayi = (d: unknown): number | null => (typeof d === 'number' && Number.isFinite(d) ? d : null);
const nesne = (d: unknown): Kayit | null => (typeof d === 'object' && d !== null && !Array.isArray(d) ? d as Kayit : null);
const dizi = (d: unknown, alan: string): Kayit[] => {
  const n = nesne(d);
  const l = n?.[alan];
  if (!Array.isArray(l)) throw new Error(`cevapta '${alan}' listesi yok`);
  return l.map((x) => nesne(x) ?? {});
};

// Notta denetlenen kayıt sayısı durur: boş veride "0 ihlal" geçti sayılsa da okuyan neyin denetlendiğini görür.
export function sonucYaz(ad: string, ihlaller: readonly Ihlal[], notlar: readonly (string | null)[] = []): DenetimSonucu {
  const liste = ihlaller.slice(0, ILETI_SINIRI).map((i) => `${i.yer}: ${i.neden}`);
  if (ihlaller.length > ILETI_SINIRI) liste.push(`... ${String(ihlaller.length - ILETI_SINIRI)} ihlal daha`);
  const not = notlar.filter((n) => n !== null).join('; ');
  const ileti = [...liste, ...(not === '' ? [] : [not])].join('\n');
  return {
    ad,
    sonuc: ihlaller.length === 0 ? 'gecti' : 'dustu',
    beklenen: '0 ihlal',
    gelen: `${String(ihlaller.length)} ihlal`,
    ileti: ileti === '' ? null : ileti,
  };
}

// --- Saf denetimler: girdi uç cevabının satırlarıdır --------------------------------------------------------------

// Stok eksiye inmez; inerse onaylı eksi hareketi (istisna) bulunmalı. `onayliEksi` eksi malzemenin hareketlerinden gelir.
export function eksiMalzemeler(malzemeler: readonly Kayit[]): Kayit[] {
  return malzemeler.filter((m) => {
    const toplam = binde(m['toplam']);
    const serbest = binde(m['serbest']);
    return m['durum'] === 'eksi' || (toplam !== null && toplam < 0) || (serbest !== null && serbest < 0);
  });
}

export function stokEksiDenetimi(malzemeler: readonly Kayit[], onayliEksi: ReadonlySet<number>): { ihlaller: Ihlal[]; izinli: number } {
  const ihlaller: Ihlal[] = [];
  let izinli = 0;
  for (const m of eksiMalzemeler(malzemeler)) {
    const id = sayi(m['malzemeId']);
    if (id !== null && onayliEksi.has(id)) { izinli += 1; continue; }
    ihlaller.push({ yer: `malzeme ${String(id)}`, neden: `toplam ${String(m['toplam'])}, serbest ${String(m['serbest'])}; onaylı eksi hareketi yok` });
  }
  return { ihlaller, izinli };
}

// Denetim #31 (uretim-emirleri/kurallar.ts adimGirdiAsimiIhlali): adımın sağlamı ona girenden fazla olamaz. Giren önceki adımın
// sağlamıdır; bağımsız adım, ilk adım ve bölünmüş ya da birleşmiş emir (kol hesabı uçtan okunamaz) denetlenmez.
export function adimSaglamDenetimi(emir: Kayit): { ihlaller: Ihlal[]; atlandi: boolean } {
  const parti = nesne(emir['parti']);
  const bolunmus = parti !== null && (parti['ustEmirId'] != null || parti['birlestigiEmirId'] != null
    || (Array.isArray(parti['altEmirIdleri']) && parti['altEmirIdleri'].length > 0));
  if (bolunmus) return { ihlaller: [], atlandi: true };
  const no = typeof emir['emirNo'] === 'string' ? emir['emirNo'] : `emir ${String(emir['id'])}`;
  const isler = dizi(emir, 'isEmirleri').slice().sort((a, b) => (sayi(a['sira']) ?? 0) - (sayi(b['sira']) ?? 0));
  const ihlaller: Ihlal[] = [];
  for (const [i, is] of isler.entries()) {
    const saglam = sayi(is['saglamAdet']);
    const fason = nesne(is['fason']);
    if (fason !== null) {
      const gonderilen = sayi(fason['gonderilen']) ?? 0;
      const donen = (sayi(fason['donenSaglam']) ?? 0) + (sayi(fason['donenHurda']) ?? 0);
      if (donen > gonderilen) ihlaller.push({ yer: `${no} OP${String(is['opNo'])}`, neden: `fasondan dönen ${String(donen)} > gönderilen ${String(gonderilen)}` });
    }
    const onceki = isler[i - 1];
    if (onceki === undefined || saglam === null || is['bagimlilik'] === 'bagimsiz') continue;
    const giren = sayi(onceki['saglamAdet']);
    if (giren !== null && saglam > giren) {
      ihlaller.push({ yer: `${no} OP${String(is['opNo'])}`, neden: `sağlam ${String(saglam)} > giren ${String(giren)} (OP${String(onceki['opNo'])})` });
    }
  }
  return { ihlaller, atlandi: false };
}

// Her sağlam sayımı bir iş emrine, o iş emri sayımın emrine bağlı. İş emirleri bilinmeyen (iş emirsiz ya da okunmamış) emir atlanır.
export function sayimIzDenetimi(olaylar: readonly Kayit[], isEmirleri: ReadonlyMap<number, ReadonlySet<number>>): Ihlal[] {
  const ihlaller: Ihlal[] = [];
  for (const o of olaylar) {
    if (o['olay'] !== 'saglam') continue;
    const emir = nesne(o['emir']);
    const emirId = sayi(emir?.['id']);
    const isler = emirId === null ? undefined : isEmirleri.get(emirId);
    if (isler === undefined || isler.size === 0) continue;
    const isEmriId = sayi(nesne(o['isEmri'])?.['id']);
    const yer = `sayım ${String(o['id'])} (${String(emir?.['emirNo'])})`;
    if (isEmriId === null) ihlaller.push({ yer, neden: 'iş emirli emirde iş emrisiz sayım' });
    else if (!isler.has(isEmriId)) ihlaller.push({ yer, neden: `iş emri ${String(isEmriId)} bu emrin değil` });
  }
  return ihlaller;
}

// stok/kurallar.ts siparisBagiEngeli: satın alma kabulünün her satırı sipariş satırına bağlı, başka türde bağ yok.
export function malKabulIzDenetimi(belge: Kayit, satirlar: readonly Kayit[]): Ihlal[] {
  const tur = belge['tur'];
  const ihlaller: Ihlal[] = [];
  for (const s of satirlar) {
    const bagli = sayi(s['siparisSatirId']) !== null;
    const yer = `mal kabul ${String(belge['no'])} satır ${String(s['sira'])}`;
    if (tur === 'satin_alma' && !bagli) ihlaller.push({ yer, neden: 'satın alma kabulü siparişe bağlı değil' });
    if (tur !== 'satin_alma' && bagli) ihlaller.push({ yer, neden: `${String(tur)} kabulü sipariş satırına bağlı` });
  }
  return ihlaller;
}

// Hareketin belgesi: geri alma geri aldığı harekete, çıkış nedenine, üretim girişi ve sarfı emre bağlı. Elle giriş denetlenmez.
export function hareketIzDenetimi(hareketler: readonly Kayit[]): Ihlal[] {
  const ihlaller: Ihlal[] = [];
  for (const h of hareketler) {
    const yer = `hareket ${String(h['id'])} (${String(h['tur'])})`;
    if (h['tur'] === 'geri_alma' && sayi(h['geriAlinanId']) === null) ihlaller.push({ yer, neden: 'geri aldığı hareket yok' });
    if (h['tur'] === 'cikis' && h['cikisNedeni'] == null) ihlaller.push({ yer, neden: 'çıkış nedeni yok' });
    const emirli = h['girisKaynagi'] === 'uretim' || h['cikisNedeni'] === 'uretime_sarf';
    if (emirli && sayi(h['uretimEmriId']) === null) ihlaller.push({ yer, neden: 'üretim hareketi emre bağlı değil' });
  }
  return ihlaller;
}

// Stok satırında serbest ve rezerve toplamı aşmaz; ayrıntıdaki bakiyelerin toplamı satırın toplamıdır.
export function stokToplamDenetimi(satir: Kayit, bakiyeler: readonly Kayit[] | null): Ihlal[] {
  const yer = `malzeme ${String(satir['malzemeId'])}`;
  const toplam = binde(satir['toplam']);
  const serbest = binde(satir['serbest']);
  const rezerve = binde(satir['rezerve']);
  if (toplam === null || serbest === null || rezerve === null) return [{ yer, neden: 'toplam, serbest ya da rezerve sayı değil' }];
  const ihlaller: Ihlal[] = [];
  if (toplam >= 0 && serbest > toplam) ihlaller.push({ yer, neden: `serbest ${String(satir['serbest'])} > toplam ${String(satir['toplam'])}` });
  if (rezerve < 0 || (toplam >= 0 && rezerve > toplam - Math.min(serbest, toplam))) {
    ihlaller.push({ yer, neden: `rezerve ${String(satir['rezerve'])} statüdeki miktarı aşıyor` });
  }
  if (bakiyeler !== null) {
    let t = 0;
    for (const b of bakiyeler) t += binde(b['miktar']) ?? 0;
    if (t !== toplam) ihlaller.push({ yer, neden: `bakiyeler ${String(t / 1000)} != toplam ${String(satir['toplam'])}` });
  }
  return ihlaller;
}

// Ana sayfa sayacı kendi içinde tutarlı: açık = taslak + planlı + başladı.
export function emirOzetiDenetimi(ozet: Kayit): Ihlal[] {
  const acik = sayi(ozet['acik']);
  const taslak = sayi(ozet['taslak']);
  const planli = sayi(ozet['planli']);
  const basladi = sayi(ozet['basladi']);
  if (acik === null || taslak === null || planli === null || basladi === null) return [{ yer: 'emir özeti', neden: 'sayaç eksik' }];
  return acik === taslak + planli + basladi ? [] : [{ yer: 'emir özeti', neden: `açık ${String(acik)} != ${String(taslak)}+${String(planli)}+${String(basladi)}` }];
}

// --- Yavaş uç ------------------------------------------------------------------------------------------------------

// Yolun kimlik parçaları tek uçta toplanır: `/stok/malzemeler/12?x=1` -> `/stok/malzemeler/:id`.
export const ucAdi = (yontem: string, yol: string): string =>
  `${yontem} ${yol.split('?')[0]?.replace(/\/\d+(?=\/|$)/g, '/:id') ?? yol}`;

// En yakın sıra yöntemi: ara değer uydurulmaz, ölçülmüş bir süre döner.
export function yuzdelik(sureler: readonly number[], p: number): number | null {
  if (sureler.length === 0) return null;
  const sirali = [...sureler].sort((a, b) => a - b);
  return sirali[Math.min(sirali.length - 1, Math.max(0, Math.ceil((p / 100) * sirali.length) - 1))] ?? null;
}

export interface UcSuresi { uc: string; sayi: number; p50: number; p95: number }

export function ucSureleri(adimlar: readonly AdimSatiri[], gun: number): UcSuresi[] {
  const gruplar = new Map<string, number[]>();
  for (const a of adimlar) {
    if (a.gun !== gun || a.tur !== 'api' || a.yontem === null || a.yol === null || a.sonuc === 'baglanmamis') continue;
    const uc = ucAdi(a.yontem, a.yol);
    const l = gruplar.get(uc) ?? [];
    l.push(a.sureMs);
    gruplar.set(uc, l);
  }
  return [...gruplar].map(([uc, l]) => ({ uc, sayi: l.length, p50: yuzdelik(l, 50) ?? 0, p95: yuzdelik(l, 95) ?? 0 }))
    .sort((a, b) => b.p95 - a.p95 || a.uc.localeCompare(b.uc));
}

export function yavasUcDenetimi(sureler: readonly UcSuresi[], esik = YAVAS_ESIK_MS): DenetimSonucu {
  const yavas = sureler.filter((s) => s.p95 > esik);
  const satir = (s: UcSuresi): string => `${s.uc}: p50 ${String(s.p50)} ms, p95 ${String(s.p95)} ms (${String(s.sayi)} çağrı)`;
  return {
    ad: 'yavaş uçlar p50/p95',
    sonuc: yavas.length === 0 ? 'gecti' : 'dustu',
    beklenen: `p95 <= ${String(esik)} ms`,
    gelen: sureler.length === 0 ? 'ölçülen uç yok' : `${String(yavas.length)} yavaş uç / ${String(sureler.length)}`,
    ileti: sureler.length === 0 ? null : sureler.slice(0, ILETI_SINIRI).map(satir).join('\n'),
  };
}

// --- Okuma ve gün sonu -------------------------------------------------------------------------------------------

class OkumaHatasi extends Error {}

// Harita uç yolunu öneksiz yazar; sunucu uçları /api altında açar.
export const API_ONEKI = '/api';

async function oku(r: RolIstemcisi, yol: string): Promise<unknown> {
  const c = await r.istek('GET', `${API_ONEKI}${yol}`);
  if (c.durum !== 200) throw new OkumaHatasi(`GET ${API_ONEKI}${yol} -> ${String(c.durum)}`);
  return c.govde;
}

// Sayfalı liste (`satirlar`, `sayfaBoyu`) üst sınıra kadar okunur.
async function sayfali(r: RolIstemcisi, yol: string): Promise<{ satirlar: Kayit[]; kesildi: boolean }> {
  const satirlar: Kayit[] = [];
  const ek = yol.includes('?') ? '&' : '?';
  for (let sayfa = 1; ; sayfa += 1) {
    const g = await oku(r, `${yol}${ek}sayfa=${String(sayfa)}&sayfaBoyu=${String(SAYFA_BOYU)}`);
    const parca = dizi(g, 'satirlar');
    satirlar.push(...parca);
    const boy = sayi(nesne(g)?.['sayfaBoyu']) ?? SAYFA_BOYU;
    if (parca.length < boy) return { satirlar, kesildi: false };
    if (satirlar.length >= AZAMI_KAYIT) return { satirlar: satirlar.slice(0, AZAMI_KAYIT), kesildi: true };
  }
}

const kesikNotu = (kesildi: boolean): string | null => (kesildi ? `ilk ${String(AZAMI_KAYIT)} kayıt denetlendi (kesildi)` : null);

export interface GunSonuAcilisi {
  kayit: KosuKaydi;
  istemci: (hesap: Hesap) => RolIstemcisi;
  gun: number;
  saat?: () => number;
}

// Her denetim ayrı adım satırıdır; biri okunamazsa yalnız o düşer, ötekiler koşar.
export async function gunSonuDenetle(a: GunSonuAcilisi): Promise<DenetimSonucu[]> {
  const saat = a.saat ?? Date.now;
  const sonuclar: DenetimSonucu[] = [];
  const yaz = (s: DenetimSonucu, sureMs: number): void => {
    sonuclar.push(s);
    a.kayit.adim({
      gun: a.gun, rol: OKUYUCU, senaryo: SENARYO_ADI, adim: s.ad, tur: 'degismez', sonuc: s.sonuc, sureMs: Math.max(0, Math.round(sureMs)),
      yontem: null, yol: null, beklenen: s.beklenen, gelen: s.gelen, ileti: s.ileti, ek: [],
    });
  };
  const r = a.istemci(OKUYUCU);
  const kos = async (ad: string, is: () => Promise<DenetimSonucu>): Promise<void> => {
    const bas = saat();
    let s: DenetimSonucu;
    try {
      s = await is();
    } catch (hata) {
      const ileti = hata instanceof Error ? hata.message : String(hata);
      // Okuyucu hesabı senaryonun rol listesinde yoksa istemci bunu söyler: hata değil, denetim bu koşuda bağlanmamıştır.
      const bagsiz = /rol listesinde yok/.test(ileti);
      s = { ad, sonuc: bagsiz ? 'baglanmamis' : 'dustu', beklenen: '0 ihlal', gelen: bagsiz ? 'okuyucu yok' : 'okunamadı', ileti };
    }
    yaz(s, saat() - bas);
  };

  let malzemeler: { satirlar: Kayit[]; kesildi: boolean } | null = null;
  const stokListesi = async (): Promise<{ satirlar: Kayit[]; kesildi: boolean }> => (malzemeler ??= await sayfali(r, '/stok/malzemeler'));

  await kos('stok eksiye inmez', async () => {
    const l = await stokListesi();
    const onayli = new Set<number>();
    for (const m of eksiMalzemeler(l.satirlar).map((x) => sayi(x['malzemeId'])).filter((x): x is number => x !== null)) {
      const h = await sayfali(r, `/stok/hareketler?malzemeId=${String(m)}`);
      if (h.satirlar.some((x) => x['onayliEksi'] === true && x['geriAlindi'] !== true)) onayli.add(m);
    }
    const d = stokEksiDenetimi(l.satirlar, onayli);
    return sonucYaz('stok eksiye inmez', d.ihlaller,
      [`${String(l.satirlar.length)} malzeme`, kesikNotu(l.kesildi), d.izinli > 0 ? `${String(d.izinli)} malzeme onaylı eksi` : null]);
  });

  const isEmirleri = new Map<number, Set<number>>();
  await kos('adım sağlamı girenden fazla değil', async () => {
    const acik = dizi(await oku(r, '/adimli-emirler'), 'emirler');
    const biten = await sayfali(r, '/adimli-emirler/bitenler');
    const idler = [...new Set([...acik, ...biten.satirlar].map((e) => sayi(e['id'])).filter((x): x is number => x !== null))];
    const kesildi = biten.kesildi || idler.length > AZAMI_KAYIT;
    const ihlaller: Ihlal[] = [];
    let atlanan = 0;
    for (const id of idler.slice(0, AZAMI_KAYIT)) {
      const emir = nesne(nesne(await oku(r, `/adimli-emirler/${String(id)}`))?.['emir']) ?? {};
      isEmirleri.set(id, new Set(dizi(emir, 'isEmirleri').map((x) => sayi(x['id'])).filter((x): x is number => x !== null)));
      const d = adimSaglamDenetimi(emir);
      ihlaller.push(...d.ihlaller);
      if (d.atlandi) atlanan += 1;
    }
    return sonucYaz('adım sağlamı girenden fazla değil', ihlaller,
      [`${String(Math.min(idler.length, AZAMI_KAYIT))} emir`, kesikNotu(kesildi), atlanan > 0 ? `${String(atlanan)} bölünmüş emir atlandı` : null]);
  });

  await kos('iz: sayım - iş emri - emir', async () => {
    const olaylar = dizi(await oku(r, '/uretim-emirleri/son-olaylar?sayi=200'), 'olaylar');
    const sayimlar = olaylar.filter((o) => o['olay'] === 'saglam').length;
    return sonucYaz('iz: sayım - iş emri - emir', sayimIzDenetimi(olaylar, isEmirleri), [`son ${String(olaylar.length)} olayda ${String(sayimlar)} sayım`]);
  });

  await kos('iz: mal kabul - sipariş', async () => {
    const l = await sayfali(r, '/stok/mal-kabuller');
    const ihlaller: Ihlal[] = [];
    for (const b of l.satirlar) {
      // Düzeltilmiş belge yerini düzeltene bırakır; ikisi birden sayılmaz.
      if (sayi(b['duzeltenId']) !== null) continue;
      const g = await oku(r, `/stok/mal-kabuller/${String(b['id'])}`);
      ihlaller.push(...malKabulIzDenetimi(nesne(nesne(g)?.['belge']) ?? b, dizi(g, 'satirlar')));
    }
    return sonucYaz('iz: mal kabul - sipariş', ihlaller, [`${String(l.satirlar.length)} belge`, kesikNotu(l.kesildi)]);
  });

  await kos('iz: hareket - belge', async () => {
    const l = await sayfali(r, '/stok/hareketler');
    return sonucYaz('iz: hareket - belge', hareketIzDenetimi(l.satirlar), [`${String(l.satirlar.length)} hareket`, kesikNotu(l.kesildi)]);
  });

  await kos('toplamlar tutarlı', async () => {
    const l = await stokListesi();
    const ihlaller: Ihlal[] = [];
    let okunan = 0;
    for (const m of l.satirlar) {
      const id = sayi(m['malzemeId']);
      const ayrintiOkunur = id !== null && (sayi(m['konumSayisi']) ?? 0) > 0 && okunan < AZAMI_AYRINTI;
      if (ayrintiOkunur) okunan += 1;
      const ayrinti = ayrintiOkunur ? await oku(r, `/stok/malzemeler/${String(id)}`) : null;
      ihlaller.push(...stokToplamDenetimi(m, ayrinti === null ? null : dizi(ayrinti, 'bakiyeler')));
    }
    const ozet = nesne(await oku(r, '/adimli-emirler/ozet')) ?? {};
    ihlaller.push(...emirOzetiDenetimi(ozet));
    return sonucYaz('toplamlar tutarlı', ihlaller, [`${String(l.satirlar.length)} malzeme, ${String(okunan)} bakiye ayrıntısı`, kesikNotu(l.kesildi)]);
  });

  await kos('yavaş uçlar p50/p95', () => {
    const adimlar = readFileSync(join(a.kayit.klasor, DOSYA.adimlar), 'utf8').split('\n').filter((s) => s !== '')
      .map(adimSatiriOku).filter((x): x is AdimSatiri => typeof x !== 'string');
    return Promise.resolve(yavasUcDenetimi(ucSureleri(adimlar, a.gun)));
  });
  return sonuclar;
}
