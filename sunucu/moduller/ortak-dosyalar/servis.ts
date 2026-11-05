import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, yetkiYok } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { DenetimSecimi } from '#cekirdek/uc.ts';
import type { IkiliCevap } from '#cekirdek/uc.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { SON_EKLENEN_SINIRI } from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import type {
  DosyaListesiCevabi, DosyalarCevabi, GecmisCevabi, Klasor, KlasorDuzeyi, KlasorlerCevabi, OrtakDosya, SurumlerCevabi, VerilenDuzey, YetkiCevabi,
} from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import { DOSYA_SINIRI, denetimSatiri, dosyaTutamagi } from '../dosya/disari.ts';
import { kisiAdlari, kisininRolleri, rollerVeBayraklari } from '../kisiler/disari.ts';
import { ILETILER, ORTAK_DOSYA_TURLERI, adAnahtari, duzeyCoz, enAzMi, gorunurMu, yetkiKaynagi } from './kurallar.ts';
import type { KlasorDugumu } from './kurallar.ts';
import * as s from './sorgular.ts';

export const MODUL = 'ortak-dosyalar';
const tutamak = dosyaTutamagi(MODUL);
const BAG_SINIRI = { turler: ORTAK_DOSYA_TURLERI, azamiBayt: DOSYA_SINIRI.dosyaBayt };
const GECMIS_SINIRI = 200;

// Bir isteğin yetki resmi: ağaç, satırlar ve kişinin rolleri her istekte veritabanından okunur (ekranda gizlemek yetki değildir).
interface Gorunum {
  klasorler: Map<number, s.KlasorSatiri>;
  yonetici: boolean;
  duzey: (id: number) => KlasorDuzeyi;
  gorunur: (id: number) => boolean;
}

async function gorunumKur(db: Db, kullanici: Kullanici): Promise<Gorunum> {
  const satirlar = await s.klasorleriOku(db);
  const yetkiSatirlari = await s.yetkileriOku(db);
  const roller = await kisininRolleri(db, kullanici.id);
  const klasorler = new Map(satirlar.map((k) => [k.id, k]));
  const yetkiler = new Map<number, Map<number, VerilenDuzey>>();
  for (const y of yetkiSatirlari) {
    const m = yetkiler.get(y.klasorId) ?? new Map<number, VerilenDuzey>();
    m.set(y.rolId, y.duzey);
    yetkiler.set(y.klasorId, m);
  }
  const onbellek = new Map<number, KlasorDuzeyi>();
  const duzey = (id: number): KlasorDuzeyi => {
    const var_ = onbellek.get(id);
    if (var_ !== undefined) return var_;
    const d = duzeyCoz(id, klasorler, yetkiler, roller);
    onbellek.set(id, d);
    return d;
  };
  return { klasorler, yonetici: roller.some((r) => r.yonetici), duzey, gorunur: (id) => gorunurMu(id, klasorler, duzey) };
}

// Görünmeyen klasör yok sayılır (404): varlığı sızdırılmaz. Görünür ama düzeyi yetmeyen klasörde 403.
function klasorIste(g: Gorunum, id: number, gereken: KlasorDuzeyi): s.KlasorSatiri {
  const k = g.klasorler.get(id);
  if (k === undefined || !g.gorunur(id)) throw bulunamadi(ILETILER.klasorYok);
  if (!enAzMi(g.duzey(id), gereken)) throw yetkiYok(ILETILER.yetkiYok);
  return k;
}

const klasorCevabi = (g: Gorunum, k: s.KlasorSatiri): Klasor => ({
  id: k.id, ustId: k.ustId, ad: k.ad, ozelYetki: k.ozelYetki, duzey: g.duzey(k.id), dosyaSayisi: k.dosyaSayisi, surum: k.surum,
});

function klasorYolu(g: Gorunum, id: number): string[] {
  const yol: string[] = [];
  const gorulen = new Set<number>();
  let k = g.klasorler.get(id);
  while (k !== undefined && !gorulen.has(k.id)) {
    yol.unshift(k.ad);
    gorulen.add(k.id);
    k = k.ustId === null ? undefined : g.klasorler.get(k.ustId);
  }
  return yol;
}

async function dosyalariKur(db: Db, g: Gorunum, satirlar: s.DosyaSatiri[]): Promise<OrtakDosya[]> {
  const adlar = await kisiAdlari(db, satirlar.map((d) => d.yukleyenId));
  return satirlar.map((d) => ({
    id: d.id, klasorId: d.klasorId, klasorYolu: klasorYolu(g, d.klasorId), ad: d.ad, surumSirasi: d.surumSirasi, boyut: d.boyut,
    yukleyenAd: adlar.get(d.yukleyenId) ?? null, zaman: d.zaman, arsiv: d.arsiv, surum: d.surum,
  }));
}

const aramaAnahtari = (ara: string | undefined): string | null => (ara === undefined || ara.trim() === '' ? null : adAnahtari(ara));

export async function klasorler(db: Db, kullanici: Kullanici): Promise<KlasorlerCevabi> {
  const g = await gorunumKur(db, kullanici);
  const gorunen = [...g.klasorler.values()].filter((k) => g.gorunur(k.id));
  const yonetilen = gorunen.filter((k) => enAzMi(g.duzey(k.id), 'yonetir')).map((k) => k.id);
  return {
    klasorler: gorunen.map((k) => klasorCevabi(g, k)),
    yonetici: g.yonetici,
    arsivSayisi: await s.arsivSayisi(db, yonetilen),
  };
}

export async function klasorDosyalari(db: Db, kullanici: Kullanici, klasorId: number, ara: string | undefined): Promise<DosyalarCevabi> {
  const g = await gorunumKur(db, kullanici);
  const k = klasorIste(g, klasorId, 'gorur');
  const altlar = [...g.klasorler.values()].filter((a) => a.ustId === k.id && g.gorunur(a.id));
  return {
    klasor: klasorCevabi(g, k),
    altKlasorler: altlar.map((a) => klasorCevabi(g, a)),
    dosyalar: await dosyalariKur(db, g, await s.klasorDosyalari(db, k.id, aramaAnahtari(ara))),
  };
}

export async function sonEklenenler(db: Db, kullanici: Kullanici, ara: string | undefined): Promise<DosyaListesiCevabi> {
  const g = await gorunumKur(db, kullanici);
  const gorunen = [...g.klasorler.keys()].filter((id) => g.gorunur(id));
  return { dosyalar: await dosyalariKur(db, g, await s.sonDosyalar(db, gorunen, aramaAnahtari(ara), SON_EKLENEN_SINIRI)) };
}

// Arşiv yalnız yönetebildiği klasörlerin dosyalarını gösterir: geri alabileceği dosyalar.
export async function arsiv(db: Db, kullanici: Kullanici): Promise<DosyaListesiCevabi> {
  const g = await gorunumKur(db, kullanici);
  const yonetilen = [...g.klasorler.keys()].filter((id) => g.gorunur(id) && enAzMi(g.duzey(id), 'yonetir'));
  return { dosyalar: await dosyalariKur(db, g, await s.arsivDosyalari(db, yonetilen)) };
}

export async function gecmis(db: Db, kullanici: Kullanici, klasorId: number): Promise<GecmisCevabi> {
  const g = await gorunumKur(db, kullanici);
  klasorIste(g, klasorId, 'gorur');
  const satirlar = await s.gecmisOku(db, klasorId, GECMIS_SINIRI);
  const adlar = await kisiAdlari(db, satirlar.flatMap((o) => (o.kisiId === null ? [] : [o.kisiId])));
  return {
    olaylar: satirlar.map((o) => ({
      olay: o.olay, kisiAd: o.kisiId === null ? null : adlar.get(o.kisiId) ?? null, zaman: o.zaman, dosyaAdi: o.dosyaAdi, surumSirasi: o.surumSirasi,
    })),
  };
}

async function dosyaIste(db: Db, g: Gorunum, klasorId: number, dosyaId: number, gereken: KlasorDuzeyi): Promise<s.DosyaSatiri> {
  klasorIste(g, klasorId, gereken);
  const d = await s.dosyaOku(db, klasorId, dosyaId);
  if (d === null) throw bulunamadi(ILETILER.dosyaYok);
  return d;
}

export async function surumler(db: Db, kullanici: Kullanici, klasorId: number, dosyaId: number): Promise<SurumlerCevabi> {
  const g = await gorunumKur(db, kullanici);
  const d = await dosyaIste(db, g, klasorId, dosyaId, 'gorur');
  if (d.arsiv) throw bulunamadi(ILETILER.dosyaYok);
  const satirlar = await s.surumleriOku(db, d.id);
  const adlar = await kisiAdlari(db, satirlar.map((x) => x.yukleyenId));
  const [dosya] = await dosyalariKur(db, g, [d]);
  if (dosya === undefined) throw new Error(`Dosya kurulamadı: ${d.id}`);
  return {
    dosya,
    surumler: satirlar.map((x) => ({ sira: x.sira, boyut: x.boyut, yukleyenAd: adlar.get(x.yukleyenId) ?? null, zaman: x.zaman })),
  };
}

// İndirme: arşivdeki dosya indirilmez (ADR 0030, 6). Ad kayıttaki addır; indirme denetim kaydına çekirdekte yazılır.
export async function indir(db: Db, kullanici: Kullanici, klasorId: number, dosyaId: number, sira: number): Promise<IkiliCevap> {
  const g = await gorunumKur(db, kullanici);
  const d = await dosyaIste(db, g, klasorId, dosyaId, 'gorur');
  if (d.arsiv) throw bulunamadi(ILETILER.dosyaYok);
  const v = await s.surumOku(db, d.id, sira);
  if (v === null) throw bulunamadi(ILETILER.surumYok);
  const akis = await tutamak.dosyaAkisi(db, String(v.id), v.ozet);
  if (akis === null) throw new Error(`Sürümün dosya bağı yok: ${v.id}`);
  return akis;
}

const KLASOR_KISITLARI = { ortak_dosyalar_klasor_ad_tekil: { ileti: ILETILER.klasorAdiVar, alan: 'ad' } };
const DOSYA_KISITLARI = { ortak_dosyalar_dosya_ad_tekil: { ileti: ILETILER.dosyaAdiVar, alan: 'ad' } };

// Üst düzey klasörü yalnız yönetici açar ve klasör özel yetkiyle, satırsız açılır (yalnız yönetici görür). Alt klasör için üstte
// `yonetir` gerekir; alt klasör üstün yetkisini alır.
export async function klasorAc(db: Db, kullanici: Kullanici, ustId: number | null, ad: string): Promise<Klasor> {
  const g = await gorunumKur(db, kullanici);
  if (ustId === null) {
    if (!g.yonetici) throw yetkiYok(ILETILER.kokYalnizYonetici);
  } else {
    klasorIste(g, ustId, 'yonetir');
    await s.klasorKilitle(db, ustId);
  }
  const temiz = ad.trim();
  const id = await kisitKorumali(KLASOR_KISITLARI, () => s.klasorEkle(db, {
    ustId, ad: temiz, adAnahtari: adAnahtari(temiz), ozelYetki: ustId === null, kisiId: kullanici.id,
  }));
  const yeni = await gorunumKur(db, kullanici);
  const k = yeni.klasorler.get(id);
  if (k === undefined) throw new Error(`Açılan klasör okunamadı: ${id}`);
  return klasorCevabi(yeni, k);
}

// Aynı adlı etkin dosya varsa yeni sürüm eklenir, yoksa dosya açılır (ADR 0030, 7). Yükleyen içeriği kendisi göndermiş olmalıdır
// (dosya modülü denetler); tür ve boyut modülün bağ sınırıyla denetlenir.
export async function yukle(
  db: Db, kullanici: Kullanici, klasorId: number, girdi: { ad: string; ozet: string }, denetimEki: (satirlar: readonly DenetimSecimi[]) => void,
): Promise<OrtakDosya> {
  const g = await gorunumKur(db, kullanici);
  klasorIste(g, klasorId, 'ekler');
  await s.klasorKilitle(db, klasorId);
  const ad = girdi.ad.trim();
  const anahtar = adAnahtari(ad);
  const var_ = await s.etkinDosyaKilitle(db, klasorId, anahtar);
  const dosyaId = var_?.id ?? await kisitKorumali(DOSYA_KISITLARI, () => s.dosyaEkle(db, { klasorId, ad, adAnahtari: anahtar }));
  const sira = await s.surumEkle(db, { dosyaId, ozet: girdi.ozet, boyut: 0, kisiId: kullanici.id });
  const bag = await tutamak.dosyaBagla(db, kullanici, { ozet: girdi.ozet, kayit: String(sira.id), ad, belgeTuru: null }, BAG_SINIRI);
  await s.surumBoyutuYaz(db, sira.id, bag.boyut);
  if (var_ !== null) await s.dosyaSurumunuArtir(db, dosyaId);
  denetimEki([{ ...denetimSatiri('bagla', { ...bag }), dosyaId, surumSirasi: sira.sira }]);
  const d = await s.dosyaOku(db, klasorId, dosyaId);
  if (d === null) throw new Error(`Yüklenen dosya okunamadı: ${dosyaId}`);
  const [cevap] = await dosyalariKur(db, g, [d]);
  if (cevap === undefined) throw new Error(`Dosya kurulamadı: ${dosyaId}`);
  return cevap;
}

export async function arsivDegistir(
  db: Db, kullanici: Kullanici, klasorId: number, dosyaId: number, surum: number, arsive: boolean,
): Promise<OrtakDosya> {
  const g = await gorunumKur(db, kullanici);
  const d = await dosyaIste(db, g, klasorId, dosyaId, 'yonetir');
  if (d.arsiv === arsive) throw cakisma(arsive ? ILETILER.zatenArsivde : ILETILER.arsivdeDegil);
  await kisitKorumali(DOSYA_KISITLARI, () => surumluGuncelle({
    guncelle: () => s.arsivYaz(db, d.id, surum, arsive, kullanici.id),
    varMi: async () => (await s.dosyaOku(db, klasorId, dosyaId)) !== null,
    bulunamadiIletisi: ILETILER.dosyaYok,
  }));
  const yeni = await s.dosyaOku(db, klasorId, dosyaId);
  if (yeni === null) throw new Error(`Dosya okunamadı: ${dosyaId}`);
  const [cevap] = await dosyalariKur(db, g, [yeni]);
  if (cevap === undefined) throw new Error(`Dosya kurulamadı: ${dosyaId}`);
  return cevap;
}

// Yetki sekmesi (yalnız `ortak-dosyalar.yetki-ver`, yalnız yönetici rolünde). Yönetici her klasörü görür; görünürlük yine çözülür.
export async function yetkiOku(db: Db, kullanici: Kullanici, klasorId: number): Promise<YetkiCevabi> {
  const g = await gorunumKur(db, kullanici);
  const k = klasorIste(g, klasorId, 'yonetir');
  const kaynakId = yetkiKaynagi(k.id, g.klasorler as ReadonlyMap<number, KlasorDugumu>);
  const kaynak = kaynakId === null ? undefined : g.klasorler.get(kaynakId);
  if (kaynak === undefined) throw new Error(`Klasörün yetki kaynağı yok: ${k.id}`);
  const satirlar = (await s.yetkileriOku(db)).filter((y) => y.klasorId === kaynak.id).map((y) => ({ rolId: y.rolId, duzey: y.duzey }));
  const roller = await rollerVeBayraklari(db);
  return {
    klasorId: k.id, ozelYetki: k.ozelYetki, kaynakId: kaynak.id, kaynakAd: kaynak.ad,
    roller: roller.map((r) => ({ id: r.id, ad: r.ad, yonetici: r.yonetici })), satirlar, surum: k.surum,
  };
}

export async function yetkiYazKomutu(
  db: Db, kullanici: Kullanici, klasorId: number, g: { surum: number; ozelYetki: boolean; satirlar: readonly { rolId: number; duzey: VerilenDuzey }[] },
): Promise<YetkiCevabi> {
  const gr = await gorunumKur(db, kullanici);
  const k = klasorIste(gr, klasorId, 'yonetir');
  if (k.ustId === null && !g.ozelYetki) throw dogrulama(ILETILER.kokOzelOlmali, 'ozelYetki');
  const satirlar = g.ozelYetki ? g.satirlar : [];
  if (satirlar.length > 0) {
    const roller = new Map((await rollerVeBayraklari(db)).map((r) => [r.id, r]));
    for (const satir of satirlar) {
      const r = roller.get(satir.rolId);
      if (r === undefined) throw dogrulama(ILETILER.rolYok, 'satirlar');
      if (r.yonetici) throw dogrulama(ILETILER.yoneticiSatiri, 'satirlar');
    }
  }
  await surumluGuncelle({
    guncelle: () => s.yetkiYaz(db, k.id, g.surum, g.ozelYetki, kullanici.id),
    varMi: () => s.klasorVarMi(db, k.id),
    bulunamadiIletisi: ILETILER.klasorYok,
  });
  await s.yetkiSatirlariniYaz(db, k.id, satirlar);
  return yetkiOku(db, kullanici, k.id);
}
