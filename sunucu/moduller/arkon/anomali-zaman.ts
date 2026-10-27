import type { Db } from '#cekirdek/db.ts';
import { kapsamdaMi, kisininKapsami } from '#cekirdek/kapsam.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { AnomaliOlaylariCevabi, AnomaliOlayTuru } from '#paylasilan/sozlesme/arkon.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { istasyonlar, kisininIzinliIsMerkezleri, makineler } from '../istasyonlar/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { canliSira, tabanPlani } from '../plan/disari.ts';
import type { Kaynak } from '../plan/disari.ts';
import { isEmriTeslimleri } from '../stok/disari.ts';
import { isEmriZamanlari, planlanacakIsEmirleri } from '../uretim-emirleri/disari.ts';
import { basladigiGunTakvimleri } from '../vardiya/disari.ts';
import { araliklariBirlestir, ardilEtkisiDk, gecikmeHukmu, girdiAni, girisAni, gunEkle, netFarkDk, netIleri, olayEylemi, tahminiBitis, teslimRiskiDk } from './kurallar.ts';
import type { ArdilGirdisi, GecikmeHukmu, NetAralik } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

// Kart 764: üretim anomalisinin zaman olayları. Hesap Arkon'dadır (764 a); plan, uretim-emirleri, stok ve vardiya `disari.ts` ile okunur
// (ADR 0006). Olay tespit anındaki plan anını dondurur (canlı plan yeniden yayınlanınca gecikme kaybolmasın), sürerken dakikası güncellenir,
// gerçekleşince kapanır. Bildirim ayrı yamayla gelir (bildirim türleri sözleşmesi); `bildirim` sütunu o zamana kadar boştur.

// Net dakika için kaynak takvimi bu kadar gün geriye ve ileriye okunur; plan anı daha eskiyse yeni olay açılmaz.
const GERI_GUN = 14;
const ILERI_GUN = 21;
// Sayfaya gelen olay sınırı.
const OLAY_SINIRI = 500;
const KISI_KIRILIMI = 'arkon.anomali-kisi' as const;

export interface ZamanEsikleri {
  gecGirisDk: number | null;
  gecTeslimDk: number | null;
  bitisKaymaDk: number | null;
  sureAsimYuzde: number | null;
}

export const zamanEsikleri = async (db: Db): Promise<ZamanEsikleri> => ({
  gecGirisDk: await sistemAyariOku(db, 'arkon.anomali-gec-giris-dk'),
  gecTeslimDk: await sistemAyariOku(db, 'arkon.anomali-gec-teslim-dk'),
  bitisKaymaDk: await sistemAyariOku(db, 'arkon.anomali-bitis-kayma-dk'),
  sureAsimYuzde: await sistemAyariOku(db, 'arkon.anomali-sure-asim-yuzde'),
});

const kaynakAnahtari = (k: Kaynak): string => `${k.tur}:${k.id}`;
const iso = (t: number): string => new Date(t).toISOString();
const anOku = (t: string | null | undefined): number | null => (t === null || t === undefined ? null : Date.parse(t));

// Kaynakların günlerinin net aralıkları tek listede; takvimi bilinmeyen kaynakta null (gecikme uydurulmaz).
async function netAraliklar(db: Db, kaynaklar: readonly Kaynak[], simdi: number): Promise<Map<string, NetAralik[] | null>> {
  const sonuc = new Map<string, NetAralik[] | null>();
  if (kaynaklar.length === 0) return sonuc;
  const bugun = tesisGunu(simdi);
  const toplu = await basladigiGunTakvimleri(db, kaynaklar, { baslangic: gunEkle(bugun, -GERI_GUN), bitis: gunEkle(bugun, ILERI_GUN) });
  for (const k of kaynaklar) {
    const gunler = toplu.get(kaynakAnahtari(k));
    sonuc.set(kaynakAnahtari(k), gunler === null || gunler === undefined ? null
      : araliklariBirlestir([...gunler.values()].flatMap((g) => g.araliklar.map((a) => ({ bas: Date.parse(a.baslangic), bit: Date.parse(a.bitis) })))));
  }
  return sonuc;
}

type PlanIsi = Awaited<ReturnType<typeof planlanacakIsEmirleri>>[number];
interface IsDurumu {
  is: PlanIsi;
  kaynak: Kaynak;
  planBas: number;
  planBit: number;
  araliklar: NetAralik[];
  giris: number | null;
  tabanBas: number | null;
  // Kök olarak: başlangıç kayması (geç giriş ya da geç teslim olayının dakikası) ve onu doğuran olayın anahtarı.
  kayma: number;
  kok: string | null;
  tahmini: number | null;
}
interface Hukum {
  tur: AnomaliOlayTuru;
  d: IsDurumu;
  hukum: GecikmeHukmu | null;
  planAni: number;
  gercek: number | null;
  tabanDakika: number | null;
  kok: string | null;
}

// Zamanlayıcı işi: açık işlerin zaman olayları yenilenir. Sıra kök olaylar (geç giriş, geç teslim), sonra etkileri (ardıl, teslim riski):
// etki olayı kökünün kimliğini taşır.
export async function zamanOlaylariniYenile(db: Db, simdi: number = Date.now()): Promise<void> {
  const esik = await zamanEsikleri(db);
  const isler = await planlanacakIsEmirleri(db);
  const idler = isler.map((i) => i.id);
  const mevcut = await sorgular.anomaliOlaylariYenilenecek(db, idler);
  const olayAnahtari = (tur: AnomaliOlayTuru, isEmriId: number): string => `${tur}:${isEmriId}`;
  const olaylar = new Map(mevcut.filter((o) => o.kayitId === null).map((o) => [olayAnahtari(o.tur, o.isEmriId), o]));
  const { planSurumu, yerlesimler } = await canliSira(db, idler);
  const canli = new Map(yerlesimler.map((y) => [y.isEmriId, y]));
  const taban = new Map((await tabanPlani(db, { isEmriIdleri: idler })).map((t) => [t.isEmriId, t]));
  const idKumesi = new Set(idler);
  const zaman = await isEmriZamanlari(db, [...idler, ...mevcut.filter((o) => !idKumesi.has(o.isEmriId)).map((o) => o.isEmriId)]);
  const { teslimler, istekler } = await isEmriTeslimleri(db, { isEmriIdleri: idler, uretimEmriIdleri: [...new Set(isler.map((i) => i.uretimEmriId))] });
  const kaynaklar = [...new Map(yerlesimler.map((y) => [kaynakAnahtari(y.kaynak), y.kaynak])).values()];
  const takvim = await netAraliklar(db, kaynaklar, simdi);
  const pencere = tesisGunBasi(gunEkle(tesisGunu(simdi), -GERI_GUN));

  const durumlar = new Map<number, IsDurumu>();
  for (const i of isler) {
    const y = canli.get(i.id);
    const ar = y === undefined ? null : takvim.get(kaynakAnahtari(y.kaynak)) ?? null;
    if (y === undefined || ar === null) continue;
    const z = zaman.get(i.id);
    durumlar.set(i.id, {
      is: i, kaynak: y.kaynak, planBas: y.baslangic.getTime(), planBit: y.bitis.getTime(), araliklar: ar,
      giris: z === undefined ? null : girisAni(z), tabanBas: anOku(taban.get(i.id)?.baslangic), kayma: 0, kok: null, tahmini: null,
    });
  }
  const acikMi = (tur: AnomaliOlayTuru, id: number): boolean => { const o = olaylar.get(olayAnahtari(tur, id)); return o !== undefined && o.kapanis === null; };
  const donmusPlan = (tur: AnomaliOlayTuru, d: IsDurumu): number => anOku(olaylar.get(olayAnahtari(tur, d.is.id))?.planAni) ?? d.planBas;
  const tabanFarki = (d: IsDurumu, son: number | null): number | null => (d.tabanBas === null ? null : netFarkDk(d.araliklar, d.tabanBas, son ?? simdi));

  // Kök olaylar. Kapanmış kök olay kaymasını korur: iş geç girdiyse ardılı hâlâ etkilenir.
  const kokler: Hukum[] = [];
  for (const d of durumlar.values()) {
    const i = d.is;
    const girisPlan = donmusPlan('gec-giris', d);
    const gg = girisPlan < pencere && !olaylar.has(olayAnahtari('gec-giris', i.id)) ? null
      : gecikmeHukmu({ planAni: girisPlan, gerceklesen: d.giris, simdi, araliklar: d.araliklar, esikDk: esik.gecGirisDk, acik: acikMi('gec-giris', i.id) });
    kokler.push({ tur: 'gec-giris', d, hukum: gg, planAni: girisPlan, gercek: d.giris, tabanDakika: tabanFarki(d, d.giris), kok: null });

    // Girdi: iş emrine ya da emre bağlı, işin istasyonuna giden teslim ve istekler; bekleyen adımda önceki adımın parçası. Biten önceki adım
    // listeden düşer (geldiği an okunmaz): açık olay girdinin geldiği turda kapanır.
    const girdiler = [
      ...teslimler.filter((t) => t.durum !== 'iptal' && t.durum !== 'red'
        && (t.isEmriId === i.id || (t.isEmriId === null && t.uretimEmriId === i.uretimEmriId && t.hedefIstasyonId !== null && t.hedefIstasyonId === (i.istasyonId ?? null))))
        .map((t) => ({ geldi: t.durum === 'teslim' ? anOku(t.kapanis) : null })),
      ...istekler.filter((r) => r.durum !== 'iptal' && r.uretimEmriId === i.uretimEmriId && r.istasyonId !== null && r.istasyonId === (i.istasyonId ?? null))
        .map((r) => ({ geldi: r.durum === 'teslim' ? anOku(r.kapanis) : null })),
      ...(i.bagimlilik === 'bekleyen' && isler.some((o) => o.uretimEmriId === i.uretimEmriId && o.opNo < i.opNo) ? [{ geldi: null }] : []),
    ];
    const gelis = girdiAni(girdiler);
    const teslimPlan = donmusPlan('gec-teslim', d);
    const teslimAcik = acikMi('gec-teslim', i.id);
    const teslimGercek = gelis === undefined ? (teslimAcik ? d.giris ?? simdi : null) : gelis ?? d.giris;
    const gt = (gelis === undefined && !teslimAcik) || (teslimPlan < pencere && !olaylar.has(olayAnahtari('gec-teslim', i.id))) ? null
      : gecikmeHukmu({ planAni: teslimPlan, gerceklesen: teslimGercek, simdi, araliklar: d.araliklar, esikDk: esik.gecTeslimDk, acik: teslimAcik });
    kokler.push({ tur: 'gec-teslim', d, hukum: gt, planAni: teslimPlan, gercek: teslimGercek, tabanDakika: null, kok: null });

    const kaymaOf = (tur: AnomaliOlayTuru, h: GecikmeHukmu | null): number => {
      const o = olaylar.get(olayAnahtari(tur, i.id));
      return h !== null ? h.dakika : o !== undefined && o.kapanis !== null ? o.dakika : 0;
    };
    const kg = kaymaOf('gec-giris', gg);
    const kt = kaymaOf('gec-teslim', gt);
    d.kayma = Math.max(kg, kt);
    d.kok = d.kayma > 0 ? olayAnahtari(kg >= kt ? 'gec-giris' : 'gec-teslim', i.id) : null;
    d.tahmini = tahminiBitis({ planBas: d.planBas, planBit: d.planBit, giris: d.giris, simdi, araliklar: d.araliklar });
  }

  // AR-AN-15: tek adım ardıllar: aynı emrin sonraki açık adımı ve aynı kaynakta canlı sıradaki sonraki iş. Ardıl başına en büyük etki.
  const kaynakSirasi = new Map<string, IsDurumu[]>();
  for (const d of durumlar.values()) {
    const k = kaynakAnahtari(d.kaynak);
    kaynakSirasi.set(k, [...(kaynakSirasi.get(k) ?? []), d]);
  }
  for (const liste of kaynakSirasi.values()) liste.sort((a, b) => a.planBas - b.planBas || a.is.id - b.is.id);
  const etkiler = new Map<number, { dakika: number; kok: string }>();
  for (const d of durumlar.values()) {
    if (!(d.kayma > 0) || d.kok === null) continue;
    const sonrakiAdim = [...durumlar.values()].filter((o) => o.is.uretimEmriId === d.is.uretimEmriId && o.is.opNo > d.is.opNo).sort((a, b) => a.is.opNo - b.is.opNo)[0];
    const sira = kaynakSirasi.get(kaynakAnahtari(d.kaynak)) ?? [];
    const sonrakiIs = sira[sira.indexOf(d) + 1];
    const adaylar: [IsDurumu, ArdilGirdisi['bag']][] = [];
    if (sonrakiAdim !== undefined) adaylar.push([sonrakiAdim, sonrakiAdim.is.bagimlilik]);
    if (sonrakiIs !== undefined) adaylar.push([sonrakiIs, 'tezgah']);
    for (const [j, bag] of adaylar) {
      const etki = ardilEtkisiDk({ bag, ardilPlanAni: donmusPlan('ardil-etkisi', j), kokKaymaDk: d.kayma, kokTahminiBitis: d.tahmini, araliklar: j.araliklar });
      if (etki !== null && etki > (etkiler.get(j.is.id)?.dakika ?? 0)) etkiler.set(j.is.id, { dakika: etki, kok: d.kok });
    }
  }
  const ardillar: Hukum[] = [];
  for (const d of durumlar.values()) {
    const e = etkiler.get(d.is.id);
    const acik = acikMi('ardil-etkisi', d.is.id);
    if (e === undefined && !acik) continue;
    // Ardıl girdiyse etki gerçekleşmiştir: açık olay son dakikasıyla kapanır, yeni olay açılmaz.
    const hukum = d.giris !== null ? (acik ? { dakika: olaylar.get(olayAnahtari('ardil-etkisi', d.is.id))!.dakika, bitti: true } : null)
      : e === undefined ? null : { dakika: e.dakika, bitti: false };
    ardillar.push({ tur: 'ardil-etkisi', d, hukum, planAni: donmusPlan('ardil-etkisi', d), gercek: d.giris, tabanDakika: null, kok: e?.kok ?? null });
  }

  // AR-AN-16: emrin son açık adımının tahmini bitişi, emirdeki en büyük kayma ya da etki kadar kayar; teslim gününün sonunu geçerse risk.
  // Yalnız bir kök olay doğurduysa: planın kendisi geç olan emir planlamanın konusudur.
  const riskler: Hukum[] = [];
  const emirler = new Map<number, IsDurumu[]>();
  for (const d of durumlar.values()) emirler.set(d.is.uretimEmriId, [...(emirler.get(d.is.uretimEmriId) ?? []), d]);
  for (const adimlar of emirler.values()) {
    const son = adimlar.reduce((a, b) => (b.is.opNo > a.is.opNo ? b : a));
    let en = 0;
    let kok: string | null = null;
    for (const a of adimlar) {
      if (a.kayma > en && a.kok !== null) { en = a.kayma; kok = a.kok; }
      const e = etkiler.get(a.is.id);
      if (e !== undefined && e.dakika > en) { en = e.dakika; kok = e.kok; }
    }
    const teslim = son.is.teslim;
    const acik = acikMi('teslim-riski', son.is.id);
    if ((kok === null || teslim === null) && !acik) continue;
    const kaymis = netIleri(son.araliklar, son.planBit, en);
    const tahmini = son.kok !== null && son.tahmini !== null && kaymis !== null ? Math.max(son.tahmini, kaymis) : kaymis;
    const dk = kok === null || teslim === null ? null : teslimRiskiDk({ tahminiBitis: tahmini, teslimSonu: tesisGunBasi(gunEkle(teslim.slice(0, 10), 1)) });
    riskler.push({
      tur: 'teslim-riski', d: son, hukum: dk === null ? null : { dakika: dk, bitti: false }, planAni: son.planBit, gercek: null, tabanDakika: null,
      kok,
    });
  }

  const kimlikler = new Map<string, number>([...olaylar].map(([k, o]) => [k, o.id]));
  const islenen = new Set<string>();
  const uygula = async (h: Hukum): Promise<void> => {
    const anahtar = olayAnahtari(h.tur, h.d.is.id);
    islenen.add(anahtar);
    const o = olaylar.get(anahtar) ?? null;
    const eylem = olayEylemi(o === null ? null : { kapali: o.kapanis !== null }, h.hukum);
    const kokId = h.kok === null ? null : kimlikler.get(h.kok) ?? null;
    if (eylem.tur === 'ac') {
      const id = await sorgular.anomaliOlayiAc(db, {
        tur: h.tur, isEmriId: h.d.is.id, uretimEmriId: h.d.is.uretimEmriId, emirNo: h.d.is.emirNo, opNo: h.d.is.opNo, istasyonId: h.d.is.istasyonId ?? null,
        kaynakTur: h.d.kaynak.tur, kaynakId: h.d.kaynak.id, kayitId: null, planSurumu, planAni: iso(h.planAni), tabanAni: h.d.tabanBas === null ? null : iso(h.d.tabanBas),
        tabanDakika: h.tabanDakika, gercekAni: eylem.bitti && h.gercek !== null ? iso(h.gercek) : null, dakika: eylem.dakika, kokOlayId: kokId,
        acilis: iso(simdi), kapanis: eylem.bitti ? iso(simdi) : null,
      });
      kimlikler.set(anahtar, id);
    } else if (eylem.tur === 'guncelle') {
      await sorgular.anomaliOlayiGuncelle(db, o!.id, {
        dakika: eylem.dakika, tabanDakika: h.tabanDakika ?? o!.tabanDakika, gercekAni: eylem.bitti && h.gercek !== null ? iso(h.gercek) : null,
        kokOlayId: kokId ?? o!.kokOlayId, guncelleme: iso(simdi), kapanis: eylem.bitti ? iso(simdi) : null,
      });
    } else if (eylem.tur === 'kapat') {
      await sorgular.anomaliOlayiGuncelle(db, o!.id, {
        dakika: o!.dakika, tabanDakika: o!.tabanDakika, gercekAni: h.gercek === null ? o!.gercekAni : iso(h.gercek), kokOlayId: o!.kokOlayId,
        guncelleme: iso(simdi), kapanis: iso(simdi),
      });
    }
  };
  for (const h of [...kokler, ...ardillar, ...riskler]) await uygula(h);

  // Plandan düşen (biten, iptal edilen) ya da artık hesaba girmeyen işin açık olayı kapanır; giriş olayında gerçekleşen an giriştir.
  for (const [anahtar, o] of olaylar) {
    if (islenen.has(anahtar) || o.kapanis !== null) continue;
    const z = zaman.get(o.isEmriId);
    const giris = z === undefined ? null : girisAni(z);
    await sorgular.anomaliOlayiGuncelle(db, o.id, {
      dakika: o.dakika, tabanDakika: o.tabanDakika, kokOlayId: o.kokOlayId, guncelleme: iso(simdi), kapanis: iso(simdi),
      gercekAni: o.gercekAni ?? ((o.tur === 'gec-giris' || o.tur === 'ardil-etkisi') && giris !== null ? iso(giris) : null),
    });
  }
}

// Sayfanın Zaman bölümü (768 a): açık olaylar ve bugün açılan ya da kapananlar, kişinin veri kapsamıyla süzülür. Kişi kaynağının adı yalnız
// kişi kırılımını görene gelir (kart #1306).
export async function anomaliOlaylari(db: Db, kullanici: Kullanici, simdi: number = Date.now()): Promise<AnomaliOlaylariCevabi> {
  const esikler = await zamanEsikleri(db);
  const kapsam = await kisininKapsami(db, kullanici.id, kisininIzinliIsMerkezleri);
  const istasyonById = new Map((await istasyonlar(db, { pasiflerDahil: true })).map((i) => [i.id, i]));
  const satirlar = (await sorgular.anomaliOlaylariGoster(db, iso(tesisGunBasi(tesisGunu(simdi))), OLAY_SINIRI))
    .filter((o) => kapsamdaMi(kapsam, o.istasyonId === null ? null : istasyonById.get(o.istasyonId)?.isMerkeziId ?? null));
  const makineById = new Map((await makineler(db, { pasiflerDahil: true })).map((m) => [m.id, m]));
  const kisiGorur = islemVarMi(kullanici, KISI_KIRILIMI);
  const kisiAdi = kisiGorur ? await kisiAdlari(db, satirlar.filter((o) => o.kaynakTur === 'kisi').map((o) => o.kaynakId as number)) : new Map<number, string>();
  const acik = satirlar.filter((o) => o.kapanis === null);
  const ardil = acik.filter((o) => o.tur === 'ardil-etkisi');
  return {
    hesaplama: iso(simdi),
    esikler,
    ozet: {
      acik: acik.length,
      aksatilanIs: ardil.length,
      toplamEtkiDk: Math.round(ardil.reduce((t, o) => t + o.dakika, 0)),
      riskliEmir: new Set(acik.filter((o) => o.tur === 'teslim-riski').map((o) => o.uretimEmriId ?? -o.isEmriId)).size,
    },
    olaylar: satirlar.map((o) => {
      const ist = o.istasyonId === null ? undefined : istasyonById.get(o.istasyonId);
      const kaynakAdi = o.kaynakTur === 'makine' ? (makineById.get(o.kaynakId as number)?.ad ?? null) : o.kaynakTur === 'kisi' ? (kisiAdi.get(o.kaynakId as number) ?? null) : null;
      return {
        id: o.id, tur: o.tur, isEmriId: o.isEmriId, uretimEmriId: o.uretimEmriId, emirNo: o.emirNo, opNo: o.opNo,
        istasyon: ist === undefined ? null : { id: ist.id, ad: ist.ad },
        kaynak: o.kaynakTur === null || o.kaynakId === null ? null : { tur: o.kaynakTur, id: o.kaynakId, ad: kaynakAdi },
        planAni: o.planAni, tabanAni: o.tabanAni, tabanDakika: o.tabanDakika === null ? null : Math.round(o.tabanDakika), gercekAni: o.gercekAni,
        dakika: Math.round(o.dakika), kokOlayId: o.kokOlayId, acilis: o.acilis, kapanis: o.kapanis,
      };
    }),
  };
}
