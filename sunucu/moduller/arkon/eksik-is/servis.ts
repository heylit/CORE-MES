import type { Db } from '#cekirdek/db.ts';
import { yetkiYok } from '#cekirdek/hata.ts';
import { kapsamdaMi, kisininKapsami } from '#cekirdek/kapsam.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { EKSIK_IS_TURLERI } from '#paylasilan/sozlesme/arkon.ts';
import type { EksikIsKonusu, EksikIslerCevabi, EksikIslerimCevabi, EksikIsSatiri, EksikIsTuru, OlcumNedeni } from '#paylasilan/sozlesme/arkon.ts';
import type { BildirimTuru } from '#paylasilan/sozlesme/bildirim.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { sistemAyariOku } from '../../ayarlar/disari.ts';
import { bildirimGonder, bildirimKapat } from '../../bildirim/disari.ts';
import { istasyonlar, kisininIzinliIsMerkezleri, makineKisiAtamalari, makineler } from '../../istasyonlar/disari.ts';
import { kisiAdlari } from '../../kisiler/disari.ts';
import { canliSira, planBayatligi } from '../../plan/disari.ts';
import { olcumAtlamalari } from '../../rota/disari.ts';
import type { Kaynak } from '../../plan/disari.ts';
import { aralikAdetleri, bitenEmirler, bitenIsEmirleri, geridekiOnculler, gunlukAralikAdetleri, istasyonDurusSureleri, planlanacakIsEmirleri, sonGirisler } from '../../uretim-emirleri/disari.ts';
import { basladigiGunTakvimleri } from '../../vardiya/disari.ts';
import { araliklariBirlestir, gunEkle, kalanAdet, kesisimDakika } from '../kurallar.ts';
import type { NetAralik } from '../kurallar.ts';
import { bayatPlan, eksikEylemi, gecikenEmir, gerideOnceki, kayitsizGun, olcumsuzIs, planGerisi, plansizIs, yarimIs } from './kurallar.ts';
import type { EksikHukum, IstasyonGunu } from './kurallar.ts';
import * as s from './sorgular.ts';

// Kart 2421 c: eksik iş olayları. Hesap Arkon'dadır; plan, uretim-emirleri, istasyonlar ve vardiya `disari.ts` ile okunur (ADR 0006). Olaylar
// 15 dakikalık işte yenilenir, sayfa ve terminal kayıtlı olayları okur.

// Vardiya süreleri ve kayıtsız gün için takvim bu kadar gün geriye okunur; daha eski bekleyiş en çok bu kadar günün vardiyasıyla ölçülür.
const GERI_GUN = 14;
const OLAY_SINIRI = 500;
const KISI_KIRILIMI = 'arkon.anomali-kisi' as const;

export interface EksikEsikleri {
  planGerisiDk: number | null;
  kayitsizGun: number | null;
  yarimIsSaat: number | null;
  plansizIsSaat: number | null;
  gecikenEmirGun: number | null;
  bayatPlanSaat: number | null;
  gerideOnceki: boolean;
  olcumsuzIsGun: number | null;
}

export const eksikEsikleri = async (db: Db): Promise<EksikEsikleri> => ({
  planGerisiDk: await sistemAyariOku(db, 'arkon.eksik-plan-gerisi-dk'),
  kayitsizGun: await sistemAyariOku(db, 'arkon.eksik-kayitsiz-gun'),
  yarimIsSaat: await sistemAyariOku(db, 'arkon.eksik-yarim-is-saat'),
  plansizIsSaat: await sistemAyariOku(db, 'arkon.eksik-plansiz-is-saat'),
  gecikenEmirGun: await sistemAyariOku(db, 'arkon.eksik-geciken-emir-gun'),
  bayatPlanSaat: await sistemAyariOku(db, 'arkon.eksik-bayat-plan-saat'),
  gerideOnceki: await sistemAyariOku(db, 'arkon.eksik-geride-onceki'),
  olcumsuzIsGun: await sistemAyariOku(db, 'arkon.eksik-olcumsuz-is-gun'),
});

const BILDIRIM_TURU = {
  'plan-gerisi': 'arkon.plan-gerisi', 'kayitsiz-gun': 'arkon.kayitsiz-gun', 'yarim-is': 'arkon.yarim-is', 'plansiz-is': 'arkon.plansiz-is',
  'geciken-emir': 'arkon.geciken-emir', 'bayat-plan': 'arkon.bayat-plan', 'olcumsuz-is': 'arkon.olcumsuz-is', 'geride-onceki': 'arkon.geride-onceki',
} as const satisfies Record<EksikIsTuru, BildirimTuru>;
const OLAY_ADI: Record<EksikIsTuru, string> = {
  'plan-gerisi': 'Plan gerisi', 'kayitsiz-gun': 'Kayıtsız gün', 'yarim-is': 'Yarım iş', 'plansiz-is': 'Plansız iş', 'geciken-emir': 'Geciken emir', 'bayat-plan': 'Bayat plan', 'olcumsuz-is': 'Süre ölçülmedi',
  'geride-onceki': 'Sayımı geride kalan önceki adım',
};
const BIRIM: Record<EksikIsTuru, string> = {
  'plan-gerisi': 'dk', 'kayitsiz-gun': 'iş günü', 'yarim-is': 'vardiya saati', 'plansiz-is': 'vardiya saati', 'geciken-emir': 'gün', 'bayat-plan': 'vardiya saati', 'olcumsuz-is': 'gün', 'geride-onceki': 'adet',
};

// Terminaldeki "Girilmemiş işlerim" sırası; saha görünümüne yalnız bu üç tür girer.
const SAHA_SIRASI: Record<EksikIsTuru, number> = {
  'kayitsiz-gun': 0, 'yarim-is': 1, 'plan-gerisi': 2, 'olcumsuz-is': 3, 'plansiz-is': 4, 'geciken-emir': 5, 'bayat-plan': 6, 'geride-onceki': 7,
};

const NEDEN_ADI: Record<OlcumNedeni, string> = {
  'ayar-yok': 'ayar basılmadı: hazırlık ölçülmedi', 'sayim-yok': 'sayım yok: işlem süresi ölçülmedi',
  'saglam-yok': 'sağlam sayım yok (sayımlar karar bekliyor ya da reddedildi): işlem süresi ölçülmedi',
  'is-emirsiz': 'iş emirsiz emir: adım süresi ölçülmedi', 'rotada-yok': 'adım rotada yok: süre rotaya yazılmadı',
};
const iso = (t: number): string => new Date(t).toISOString();
const kaynakAnahtari = (k: Kaynak): string => `${k.tur}:${k.id}`;
const olayAnahtari = (tur: EksikIsTuru, konuTur: EksikIsKonusu, konuId: number | null): string => `${tur}:${konuTur}:${konuId ?? ''}`;
const bildirimKimligi = (id: number): string => `eksik:${id}`;

interface Bulgu {
  tur: EksikIsTuru;
  konuTur: EksikIsKonusu;
  konuId: number | null;
  isEmriId: number | null;
  uretimEmriId: number | null;
  emirNo: string | null;
  opNo: number | null;
  istasyonId: number | null;
  kaynak: Kaynak | null;
  hukum: EksikHukum | null;
}

// Kaynakların [bas, bit] günlerinin net aralıkları; takvimi bilinmeyen kaynakta null (gecikme uydurulmaz).
async function gunlukAraliklar(db: Db, kaynaklar: readonly Kaynak[], bas: string, bit: string): Promise<Map<string, Map<string, NetAralik[]> | null>> {
  const sonuc = new Map<string, Map<string, NetAralik[]> | null>();
  if (kaynaklar.length === 0) return sonuc;
  const toplu = await basladigiGunTakvimleri(db, kaynaklar, { baslangic: bas, bitis: bit });
  for (const k of kaynaklar) {
    const gunler = toplu.get(kaynakAnahtari(k));
    sonuc.set(kaynakAnahtari(k), gunler === null || gunler === undefined ? null
      : new Map([...gunler].map(([t, g]) => [t, g.araliklar.map((a) => ({ bas: Date.parse(a.baslangic), bit: Date.parse(a.bitis) }))])));
  }
  return sonuc;
}

// Eksik iş bulguları: açık her işin, istasyonun, emrin ve planın hükmü. Hükmü null olan bulgu açık olayını kapatır.
async function bulgular(db: Db, e: EksikEsikleri, simdi: number): Promise<Bulgu[]> {
  const bugun = tesisGunu(simdi);
  const isler = await planlanacakIsEmirleri(db);
  const idler = isler.map((i) => i.id);
  const { yerlesimler } = await canliSira(db, idler);
  const canli = new Map(yerlesimler.map((y) => [y.isEmriId, y]));
  const makineById = new Map((await makineler(db, { pasiflerDahil: true })).map((m) => [m.id, m]));
  const istasyonOf = (i: (typeof isler)[number]): number | null =>
    i.istasyonId ?? (i.kaynak?.tur === 'makine' ? makineById.get(i.kaynak.id)?.istasyonId ?? null : null);
  const saglam = await aralikAdetleri(db, 'is_emri', idler, '-infinity', iso(simdi));
  const kalan = (i: (typeof isler)[number]): number => kalanAdet(i.adimAdedi ?? i.adet, saglam.get(i.id)?.saglam ?? 0);

  // Takvim bir kez okunur: canlı yerleşimlerin, adımların ve etkin makinelerin kaynakları. Süreler vardiya saatidir (AR-EK-1, 3, 4, 6).
  const gecmis = gunEkle(bugun, -GERI_GUN);
  const adimKaynagi = (i: (typeof isler)[number]): Kaynak | null =>
    i.kaynak?.tur === 'makine' || i.kaynak?.tur === 'kisi' ? { tur: i.kaynak.tur, id: i.kaynak.id } : null;
  const etkinMakineler = [...makineById.values()].filter((m) => m.aktif);
  const kaynaklar = [...new Map([
    ...yerlesimler.map((y) => y.kaynak), ...isler.flatMap((i) => { const k = adimKaynagi(i); return k === null ? [] : [k]; }),
    ...etkinMakineler.map((m): Kaynak => ({ tur: 'makine', id: m.id })),
  ].map((k) => [kaynakAnahtari(k), k])).values()];
  const takvim = await gunlukAraliklar(db, kaynaklar, gecmis, bugun);
  const netAraliklar = (k: Kaynak): NetAralik[] | null => {
    const g = takvim.get(kaynakAnahtari(k));
    return g === null || g === undefined ? null : araliklariBirlestir([...g.values()].flat());
  };
  // Birleşik takvim: makinelerden bilineni; hiçbiri bilinmiyorsa null.
  const birlesik = (mk: readonly Kaynak[]): NetAralik[] | null => {
    const bilinen = mk.map(netAraliklar).filter((a): a is NetAralik[] => a !== null);
    return bilinen.length === 0 ? null : araliklariBirlestir(bilinen.flat());
  };
  const tesisTakvimi = birlesik(etkinMakineler.map((m): Kaynak => ({ tur: 'makine', id: m.id })));
  const istasyonTakvimi = new Map<number, NetAralik[] | null>();
  const istasyonAraliklari = (istasyonId: number): NetAralik[] | null => {
    if (!istasyonTakvimi.has(istasyonId)) {
      istasyonTakvimi.set(istasyonId, birlesik(etkinMakineler.filter((m) => m.istasyonId === istasyonId).map((m): Kaynak => ({ tur: 'makine', id: m.id }))));
    }
    return istasyonTakvimi.get(istasyonId) ?? null;
  };
  // Adımın takvimi: kaynağı varsa onunki (bilinmiyorsa hüküm yok), yoksa istasyonun makineleri, o da yoksa tesis.
  const adimAraliklari = (kaynak: Kaynak | null, istasyonId: number | null): NetAralik[] | null => {
    if (kaynak !== null) return netAraliklar(kaynak);
    const ist = istasyonId === null ? null : istasyonAraliklari(istasyonId);
    return ist ?? tesisTakvimi;
  };

  const sonuc: Bulgu[] = [];
  const isBulgusu = (tur: EksikIsTuru, i: (typeof isler)[number], kaynak: Kaynak | null, hukum: EksikHukum | null): Bulgu => ({
    tur, konuTur: 'is_emri', konuId: i.id, isEmriId: i.id, uretimEmriId: i.uretimEmriId, emirNo: i.emirNo, opNo: i.opNo, istasyonId: istasyonOf(i), kaynak, hukum,
  });
  let planGerisiSayisi = 0;
  for (const i of isler) {
    const y = canli.get(i.id);
    const pg = y === undefined ? null
      : planGerisi({ planBitis: y.bitis.getTime(), simdi, araliklar: netAraliklar(y.kaynak), kalanAdet: kalan(i), esikDk: e.planGerisiDk });
    if (pg !== null) planGerisiSayisi += 1;
    sonuc.push(isBulgusu('plan-gerisi', i, y?.kaynak ?? null, pg));
    const sonHareket = [i.sonSayimAni, i.adimBaslama].flatMap((t) => (t ? [Date.parse(t)] : [])).reduce<number | null>((a, b) => (a === null || b > a ? b : a), null);
    const yarimKaynak = y?.kaynak ?? adimKaynagi(i);
    sonuc.push(isBulgusu('yarim-is', i, yarimKaynak, yarimIs({
      calisiyor: i.adimDurumu === 'calisiyor', tezgahtaAcik: i.fiiliMakineId !== undefined, sonHareket, simdi,
      araliklar: adimAraliklari(yarimKaynak, istasyonOf(i)), kalanAdet: kalan(i), esikSaat: e.yarimIsSaat,
    })));
    sonuc.push(isBulgusu('plansiz-is', i, null, plansizIs({
      yerlesimVar: y !== undefined && i.kaynak !== null, acilma: Date.parse(i.acilma), simdi, araliklar: adimAraliklari(adimKaynagi(i), istasyonOf(i)),
      esikSaat: e.plansizIsSaat,
    })));
  }

  // AR-EK-8: sıra dışı başlamış açık adım; öncül başına tek hüküm olmasın diye en büyük değerli öncül alınır. Kapalı ayar ya da kapanmış adım olayı kapatır.
  const geride = e.gerideOnceki ? await geridekiOnculler(db, idler) : [];
  const adimById = new Map(isler.map((i) => [i.id, i]));
  const gerideHukmu = new Map<number, EksikHukum>();
  const agirlik = (h: EksikHukum): number => Math.max(h.deger, h.kalanAdet ?? 0);
  for (const g of geride) {
    const h = gerideOnceki({ acik: adimById.has(g.isEmriId), oncul: { tur: g.tur, bitti: g.onculBitti, devirAdedi: g.devirAdedi, gelen: g.gelen }, girdi: g.girdi, kayit: Date.parse(g.kayit) });
    const onceki = gerideHukmu.get(g.isEmriId);
    if (h !== null && (onceki === undefined || agirlik(h) > agirlik(onceki))) gerideHukmu.set(g.isEmriId, h);
  }
  for (const i of isler) sonuc.push(isBulgusu('geride-onceki', i, adimKaynagi(i), gerideHukmu.get(i.id) ?? null));

  // Geciken emir: emrin açık adımları birlikte okunur; plana göre bitiş canlı plandaki en geç bitiştir.
  const emirler = new Map<number, (typeof isler)[number][]>();
  for (const i of isler) emirler.set(i.uretimEmriId, [...(emirler.get(i.uretimEmriId) ?? []), i]);
  for (const [emirId, adimlar] of emirler) {
    const ilk = adimlar[0]!;
    const bitisler = adimlar.flatMap((a) => { const y = canli.get(a.id); return y === undefined ? [] : [y.bitis.getTime()]; });
    const istasyonlari = [...new Set(adimlar.map(istasyonOf).filter((x): x is number => x !== null))];
    sonuc.push({
      tur: 'geciken-emir', konuTur: 'uretim_emri', konuId: emirId, isEmriId: null, uretimEmriId: emirId, emirNo: ilk.emirNo, opNo: null,
      istasyonId: istasyonlari.length === 1 ? istasyonlari[0]! : null, kaynak: null,
      hukum: gecikenEmir({
        teslim: ilk.teslim, bugun, teslimSonu: ilk.teslim === null ? null : tesisGunBasi(gunEkle(ilk.teslim.slice(0, 10), 1)),
        planBitisGunu: bitisler.length === 0 ? null : tesisGunu(Math.max(...bitisler)), esikGun: e.gecikenEmirGun,
      }),
    });
  }

  // Kayıtsız gün: makineli istasyonlarda son kapanmış günden geriye. Gün sınırı tesis günüdür. Planlı duruş ve bakım vardiyadan düşülmüş
  // gelir (tam gün duruşta aktif dakika 0); kayıtlı duruşu (durdurma) olan gün de sayılmaz.
  const aktifIstasyonlar = await istasyonlar(db, { pasiflerDahil: false });
  const istasyonMakineleri = new Map<number, Kaynak[]>();
  for (const m of makineById.values()) {
    if (m.istasyonId === null || !m.aktif) continue;
    istasyonMakineleri.set(m.istasyonId, [...(istasyonMakineleri.get(m.istasyonId) ?? []), { tur: 'makine', id: m.id }]);
  }
  const gunler: string[] = [];
  for (let t = gecmis; t < bugun; t = gunEkle(t, 1)) gunler.push(t);
  const istasyonIdleri = aktifIstasyonlar.map((x) => x.id).filter((id) => istasyonMakineleri.has(id));
  const girisler = e.kayitsizGun === null ? [] : await gunlukAralikAdetleri(db, 'istasyon', istasyonIdleri, [...gunler, bugun].map((t) => iso(tesisGunBasi(t))));
  const sonGirisi = e.kayitsizGun === null ? new Map<number, string>() : await sonGirisler(db, 'istasyon', istasyonIdleri);
  const duruslar: Map<number, number>[] = [];
  if (e.kayitsizGun !== null) for (const t of gunler) duruslar.push(await istasyonDurusSureleri(db, istasyonIdleri, iso(tesisGunBasi(t)), iso(tesisGunBasi(gunEkle(t, 1)))));
  for (const istasyonId of istasyonIdleri) {
    const mk = istasyonMakineleri.get(istasyonId)!;
    const acilislar = isler.filter((i) => istasyonOf(i) === istasyonId).map((i) => Date.parse(i.acilma));
    const gunListesi: IstasyonGunu[] = gunler.map((t, n) => {
      const bas = tesisGunBasi(t);
      const bit = tesisGunBasi(gunEkle(t, 1));
      const parcalar = mk.map((k) => { const g = takvim.get(kaynakAnahtari(k)); return g === null || g === undefined ? null : g.get(t) ?? []; });
      const bilinen = parcalar.filter((p): p is NetAralik[] => p !== null);
      return {
        aktifDk: bilinen.length === 0 ? null : kesisimDakika(araliklariBirlestir(bilinen.flat()), bas, bit),
        acikIs: acilislar.some((a) => a < bit),
        girisVar: girisler[n]?.has(istasyonId) ?? false,
        durusVar: (duruslar[n]?.get(istasyonId) ?? 0) > 0,
      };
    });
    const son = sonGirisi.get(istasyonId);
    sonuc.push({
      tur: 'kayitsiz-gun', konuTur: 'istasyon', konuId: istasyonId, isEmriId: null, uretimEmriId: null, emirNo: null, opNo: null, istasyonId, kaynak: null,
      hukum: kayitsizGun({ gunler: gunListesi, sonGiris: son === undefined ? null : Date.parse(son), esikGun: e.kayitsizGun }),
    });
  }

  if (e.olcumsuzIsGun !== null) sonuc.push(...await olcumsuzBulgular(db, e.olcumsuzIsGun, simdi, aktifIstasyonlar.map((x) => x.id)));

  const bayat = e.bayatPlanSaat === null ? null : await planBayatligi(db, simdi);
  sonuc.push({
    tur: 'bayat-plan', konuTur: 'plan', konuId: null, isEmriId: null, uretimEmriId: null, emirNo: null, opNo: null, istasyonId: null, kaynak: null,
    hukum: bayatPlan({
      sonCanliyaAlma: bayat?.sonCanliyaAlma ? Date.parse(bayat.sonCanliyaAlma) : null, simdi, araliklar: tesisTakvimi, planGerisi: planGerisiSayisi, acikIs: isler.length, esikSaat: e.bayatPlanSaat,
    }),
  });
  return sonuc;
}

// AR-EK-9 (2567): son GERI_GUN günde biten ölçülmeyen iş emirleri (emir açık olsa da) ve iş emirsiz biten emirler. Nedenleri ölçümün
// sahibi rota verir (iş emri bitince yazdığı ölçümle aynı ölçüt, 2578 a). Pencereden çıkan iş hesaptan düşer, olayı kapanır. Kural kapalıyken hiç okunmaz; o
// zaman olaylar konusu düşmüş gibi kapanır.
async function olcumsuzBulgular(db: Db, esikGun: number, simdi: number, istasyonIdleri: readonly number[]): Promise<Bulgu[]> {
  const bugun = tesisGunu(simdi);
  const bas = iso(tesisGunBasi(gunEkle(bugun, -GERI_GUN)));
  const isEmirleri = await bitenIsEmirleri(db, bas, iso(simdi));
  const emirler = await bitenEmirler(db, istasyonIdleri, bas, iso(simdi));
  const isEmriIstasyonu = new Map(isEmirleri.map((i) => [i.isEmriId, i.istasyonId]));
  const emirBitisi = new Map(emirler.map((x) => [x.id, x]));
  const durumlar = await olcumAtlamalari(db, [...isEmirleri.map((i) => i.uretimEmriId), ...emirler.map((x) => x.id)]);
  const sonuc: Bulgu[] = [];
  for (const [emirId, d] of durumlar) {
    if (d.isEmirsiz) {
      const biten = emirBitisi.get(emirId);
      const bitis = biten === undefined ? null : Date.parse(biten.bitis);
      sonuc.push({
        tur: 'olcumsuz-is', konuTur: 'uretim_emri', konuId: emirId, isEmriId: null, uretimEmriId: emirId, emirNo: d.emirNo, opNo: null,
        istasyonId: biten?.istasyonId ?? null, kaynak: null,
        hukum: olcumsuzIs({ nedenler: ['is-emirsiz'], bitis, bitisGunu: bitis === null ? null : tesisGunu(bitis), bugun, esikGun }),
      });
      continue;
    }
    // Pencere iş emrinin bitişidir: emir açıkken bitmiş iş emri de görünür, pencereden önce biten görünmez.
    for (const a of d.atlananlar.filter((x) => isEmriIstasyonu.has(x.isEmriId))) {
      const bitis = a.bitis === null ? null : Date.parse(a.bitis);
      const kaynak: Kaynak | null = a.kaynak.tur === 'makine' || a.kaynak.tur === 'kisi' ? { tur: a.kaynak.tur, id: a.kaynak.id } : null;
      sonuc.push({
        tur: 'olcumsuz-is', konuTur: 'is_emri', konuId: a.isEmriId, isEmriId: a.isEmriId, uretimEmriId: emirId, emirNo: d.emirNo, opNo: a.opNo,
        istasyonId: isEmriIstasyonu.get(a.isEmriId) ?? null, kaynak,
        hukum: olcumsuzIs({ nedenler: a.nedenler, bitis, bitisGunu: bitis === null ? null : tesisGunu(bitis), bugun, esikGun }),
      });
    }
  }
  return sonuc;
}

async function olayAc(db: Db, simdi: number, b: Bulgu, h: EksikHukum): Promise<void> {
  const id = await s.eksikIsAc(db, {
    tur: b.tur, konuTur: b.konuTur, konuId: b.konuId, isEmriId: b.isEmriId, uretimEmriId: b.uretimEmriId, emirNo: b.emirNo, opNo: b.opNo, istasyonId: b.istasyonId,
    kaynakTur: b.kaynak?.tur ?? null, kaynakId: b.kaynak?.id ?? null, deger: h.deger, kalanAdet: h.kalanAdet, planaGore: h.planaGore,
    dayanakAni: h.dayanak === null ? null : iso(h.dayanak), nedenler: [...h.nedenler], acilis: iso(simdi),
  });
  const konu = b.emirNo === null ? '' : `: ${b.emirNo}${b.opNo === null ? '' : ` · OP ${b.opNo}`}`;
  const ek = h.nedenler.length > 0 ? ` · ${h.nedenler.map((n) => NEDEN_ADI[n]).join(', ')}`
    : h.planaGore ? ' (plana göre)' : h.kalanAdet === null ? '' : ` · ${h.kalanAdet} adet kaldı`;
  await bildirimGonder(db, {
    tur: BILDIRIM_TURU[b.tur], baslik: `${OLAY_ADI[b.tur]}${konu}`, metin: `${h.deger} ${BIRIM[b.tur]}${ek}`, yol: '/arkon/anomali', kaynakKimlik: bildirimKimligi(id),
  });
  await s.eksikIsBildirildi(db, id, iso(simdi));
}

// Zamanlayıcı işi (AR-EK-7): olaylar açılır, sürerken güncellenir, giderilince ya da konusu hesaptan düşünce (iş bitti, emir kapandı,
// istasyon pasif) kapanır; kapanan olayın hatırlatması da kapanır.
export async function eksikIsleriYenile(db: Db, simdi: number = Date.now()): Promise<void> {
  const esik = await eksikEsikleri(db);
  const acik = new Map((await s.acikEksikIsler(db)).map((o) => [olayAnahtari(o.tur, o.konuTur, o.konuId), o]));
  const islenen = new Set<string>();
  const kapat = async (o: s.EksikIsOlayiSatiri): Promise<void> => {
    await s.eksikIsKapat(db, o.id, iso(simdi));
    await bildirimKapat(db, { tur: BILDIRIM_TURU[o.tur], kaynakKimlik: bildirimKimligi(o.id) });
  };
  for (const b of await bulgular(db, esik, simdi)) {
    const anahtar = olayAnahtari(b.tur, b.konuTur, b.konuId);
    islenen.add(anahtar);
    const o = acik.get(anahtar);
    const eylem = eksikEylemi(o !== undefined, b.hukum);
    if (eylem.tur === 'ac') await olayAc(db, simdi, b, eylem.h);
    else if (eylem.tur === 'guncelle') {
      await s.eksikIsGuncelle(db, o!.id, {
        deger: eylem.h.deger, kalanAdet: eylem.h.kalanAdet, planaGore: eylem.h.planaGore, dayanakAni: eylem.h.dayanak === null ? null : iso(eylem.h.dayanak),
        nedenler: [...eylem.h.nedenler],
        istasyonId: b.istasyonId, guncelleme: iso(simdi),
      });
    } else if (eylem.tur === 'kapat') await kapat(o!);
  }
  for (const [anahtar, o] of acik) if (!islenen.has(anahtar)) await kapat(o);
}

async function satirlar(db: Db, kullanici: Kullanici, olaylar: readonly s.EksikIsOlayiSatiri[]): Promise<EksikIsSatiri[]> {
  const istasyonById = new Map((await istasyonlar(db, { pasiflerDahil: true })).map((i) => [i.id, i]));
  const makineById = new Map((await makineler(db, { pasiflerDahil: true })).map((m) => [m.id, m]));
  const kisiGorur = islemVarMi(kullanici, KISI_KIRILIMI);
  const kisiAdi = kisiGorur ? await kisiAdlari(db, olaylar.filter((o) => o.kaynakTur === 'kisi').map((o) => o.kaynakId as number)) : new Map<number, string>();
  return olaylar.map((o) => {
    const ist = o.istasyonId === null ? undefined : istasyonById.get(o.istasyonId);
    const kaynakAdi = o.kaynakTur === 'makine' ? (makineById.get(o.kaynakId as number)?.ad ?? null) : o.kaynakTur === 'kisi' ? (kisiAdi.get(o.kaynakId as number) ?? null) : null;
    return {
      id: o.id, tur: o.tur, konu: o.konuTur, isEmriId: o.isEmriId, uretimEmriId: o.uretimEmriId, emirNo: o.emirNo, opNo: o.opNo,
      istasyon: ist === undefined ? null : { id: ist.id, ad: ist.ad },
      kaynak: o.kaynakTur === null || o.kaynakId === null ? null : { tur: o.kaynakTur, id: o.kaynakId, ad: kaynakAdi },
      deger: o.deger, kalanAdet: o.kalanAdet, planaGore: o.planaGore, dayanakAni: o.dayanakAni, nedenler: o.nedenler, acilis: o.acilis, kapanis: o.kapanis,
    };
  });
}

// Anomali sayfasının Eksik işler bölümü: açık olaylar ve bugün kapananlar, kişinin veri kapsamıyla süzülür. Kişi kaynağının adı yalnız kişi
// kırılımını görene gelir (kart #1306).
export async function eksikIsler(db: Db, kullanici: Kullanici, simdi: number = Date.now()): Promise<EksikIslerCevabi> {
  // Sözleşmedeki eşikler sayıdır; açık/kapalı kural (geride kalan önceki adım) eşik değildir, gönderilmez.
  const { gerideOnceki: _acikKapali, ...esikler } = await eksikEsikleri(db);
  const kapsam = await kisininKapsami(db, kullanici.id, kisininIzinliIsMerkezleri);
  const istasyonById = new Map((await istasyonlar(db, { pasiflerDahil: true })).map((i) => [i.id, i]));
  const olaylar = (await s.eksikIslerGoster(db, iso(tesisGunBasi(tesisGunu(simdi))), OLAY_SINIRI))
    .filter((o) => kapsamdaMi(kapsam, o.istasyonId === null ? null : istasyonById.get(o.istasyonId)?.isMerkeziId ?? null));
  const ozet = Object.fromEntries(EKSIK_IS_TURLERI.map((t) => [t, olaylar.filter((o) => o.tur === t && o.kapanis === null).length])) as EksikIslerCevabi['ozet'];
  return { hesaplama: iso(simdi), esikler, ozet, olaylar: await satirlar(db, kullanici, olaylar) };
}

// Terminal (saha görünümü): kişinin kendisine yerleşen ya da bugün atandığı tezgahlardaki işlerin açık olayları (plan gerisi, yarım iş) ve o
// tezgahların istasyonlarındaki kayıtsız gün. Kişi yalnız kendini görür.
export async function eksikIslerim(db: Db, kullanici: Kullanici, simdi: number = Date.now()): Promise<EksikIslerimCevabi> {
  if (!islemVarMi(kullanici, 'arkon.operator') && !islemVarMi(kullanici, 'arkon.amir')) throw yetkiYok('Girilmemiş işler yalnız operatör ve amir içindir.');
  const atamalar = await makineKisiAtamalari(db, { kisiId: kullanici.id, tarih: tesisGunu(simdi) });
  const makineIdleri = new Set(atamalar.map((a) => a.makineId));
  const makineById = new Map((await makineler(db, { pasiflerDahil: true })).map((m) => [m.id, m]));
  const istasyonIdleri = new Set([...makineIdleri].flatMap((m) => { const i = makineById.get(m)?.istasyonId; return i === null || i === undefined ? [] : [i]; }));
  const benim = (o: s.EksikIsOlayiSatiri): boolean => {
    if (o.tur === 'kayitsiz-gun') return o.istasyonId !== null && istasyonIdleri.has(o.istasyonId);
    if (o.tur !== 'plan-gerisi' && o.tur !== 'yarim-is' && o.tur !== 'olcumsuz-is') return false;
    return (o.kaynakTur === 'kisi' && o.kaynakId === kullanici.id) || (o.kaynakTur === 'makine' && o.kaynakId !== null && makineIdleri.has(o.kaynakId));
  };
  // Önce tür (saha önce girilmemiş günü, sonra yarım işi kapatır), tür içinde değer: birim türden türe değiştiği için değerler karşılaştırılamaz.
  const olaylar = (await s.acikEksikIsler(db)).filter(benim).sort((a, b) => SAHA_SIRASI[a.tur] - SAHA_SIRASI[b.tur] || b.deger - a.deger);
  return { hesaplama: iso(simdi), olaylar: await satirlar(db, kullanici, olaylar) };
}
