import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma } from '#cekirdek/hata.ts';
import { kapsamDisiysaReddet, kapsamdaMi, kisininKapsami } from '#cekirdek/kapsam.ts';
import type { IkiliCevap } from '#cekirdek/uc.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type {
  SaatDurusNedenleriCevabi, SaatEmriCevabi, SaatIstasyonlariCevabi, SaatOnizlemesiCevabi, SaatSiradakiCevabi, SaatUyarilariCevabi, SaatVardiyaCevabi,
} from '#paylasilan/sozlesme/saat.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { yayindakiOnizleme, yayindakiOnizlemeKaresi } from '../belge-merkezi/disari.ts';
import { aletlerVeKayitlari } from '../kalibrasyon/disari.ts';
import { aktifIstasyonlar, aktifMakineler, istasyonGetir, kisininIzinliIsMerkezleri, makineDurumlari } from '../istasyonlar/disari.ts';
import { stokMiktarlari, emirlerinNetSarfi } from '../stok/disari.ts';
import { durusNedenleriniListele } from '../durus-nedenleri/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { istasyonHazirlikSirasi } from '../arkon/disari.ts';
import { canliSira } from '../plan/disari.ts';
import { basladigiGunTakvimleri, kisiVardiyalari, vardiyaTanimlari } from '../vardiya/disari.ts';
import {
  acikEmir, acikEmirler, adimliEmirAyrintisi, bitenEmirler, calismayaGecisAnlari, emirDurdur, emirlerinMalzemeIhtiyaci, aralikAdetleri, gunlukAralikAdetleri, isEmriPlanBilgileri, istasyonDurusSureleri, kararSayaclari, planlanacakIsEmirleri,
  sonGirisler,
} from '../uretim-emirleri/disari.ts';
import type { Emir } from '../uretim-emirleri/disari.ts';
import {
  birimSaniye, durumBaslangici, emirTezgahi, gecerliVardiya, istasyonDurumu, istasyonlariKur, kalanSaniye, kalibrasyonuGorebilirMi, malzemeHazirMi, pencereBaslangici,
  saatlikSinirlar, siradakiIs, USTLENME_GECERLILIK_SAAT, ustlenebilirMi, uyariKimligi, uyarilariKur,
} from './kurallar.ts';
import type { HamUyari, KaynakEmir, KaynakMakine, KaynakMakineDurumu } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

const kaynakEmir = (e: Emir, calismaBaslangic: string | null = null): KaynakEmir => ({
  id: e.id, emirNo: e.emirNo, istasyonId: e.istasyon.id, durum: e.durum, baslama: e.baslama, adet: e.adet,
  saglam: e.canli?.saglam ?? null, calisma: e.canli?.calisma ?? null,
  durusNedeni: e.canli?.durusNedeni?.ad ?? null, durusBaslangic: e.canli?.durusBaslangic ?? null,
  calismaBaslangic: e.canli?.calisma === 'calisiyor' ? calismaBaslangic : null,
});

// Durum satırı olmayan makine çalışır sayılır (istasyonlar modülünün kuralı); listede yalnız durum yazılmış makineler vardır.
async function makineKaynaklari(db: Db): Promise<{ tezgahlar: KaynakMakine[]; durumlar: KaynakMakineDurumu[] }> {
  const tezgahlar = (await aktifMakineler(db)).map((m) => ({ id: m.id, istasyonId: m.istasyonId, ad: m.ad, tur: m.tur }));
  const istasyonu = new Map(tezgahlar.map((m) => [m.id, m.istasyonId]));
  const durumlar: KaynakMakineDurumu[] = [];
  for (const d of await makineDurumlari(db)) {
    const istasyonId = istasyonu.get(d.makineId);
    if (istasyonId === undefined || istasyonId === null) continue;
    durumlar.push({ istasyonId, durum: d.durum, aciklama: d.aciklama, degisme: d.degisme });
  }
  return { tezgahlar, durumlar };
}

// Kişinin iş merkezi kapsamındaki istasyonlar ve onlardaki açık emirler; kapsam dışı hiçbir şey sonraki adımlara girmez.
async function kaynaklar(db: Db, kullanici: Kullanici, geciseBak = false) {
  const kapsam = await kisininKapsami(db, kullanici.id, kisininIzinliIsMerkezleri);
  const istasyonlar = (await aktifIstasyonlar(db)).filter((i) => kapsamdaMi(kapsam, i.isMerkeziId)).map((i) => ({ id: i.id, kod: i.kod, ad: i.ad }));
  const kapsamda = new Set(istasyonlar.map((i) => i.id));
  const acik = (await acikEmirler(db)).filter((e) => kapsamda.has(e.istasyon.id));
  const makineler = await makineKaynaklari(db);
  const calisanlar = geciseBak ? acik.filter((e) => e.canli?.calisma === 'calisiyor').map((e) => e.id) : [];
  const gecisler = await calismayaGecisAnlari(db, calisanlar);
  return { istasyonlar, acik, emirler: acik.map((e) => kaynakEmir(e, gecisler.get(e.id) ?? null)), makineler };
}

export async function istasyonlar(db: Db, kullanici: Kullanici): Promise<SaatIstasyonlariCevabi> {
  const k = await kaynaklar(db, kullanici, true);
  const zaman = await sorgular.simdi(db);
  const baslangic = pencereBaslangici(zaman);
  const idler = k.istasyonlar.map((i) => i.id);
  const durus = await istasyonDurusSureleri(db, idler, baslangic, zaman);
  const bugun = await aralikAdetleri(db, 'istasyon', idler, baslangic, zaman);
  return { zaman, pencere: { baslangic }, istasyonlar: istasyonlariKur(k.istasyonlar, k.emirler, k.makineler.durumlar, k.makineler.tezgahlar, durus, bugun) };
}

// Başlamamış açık emirlerin malzeme durumu: ihtiyaç, emre verilmiş net sarf ve kullanılabilir stok toplu okunur.
async function malzemeDurumlari(db: Db, emirIdleri: readonly number[]): Promise<Map<number, boolean | null>> {
  const sonuc = new Map<number, boolean | null>();
  if (emirIdleri.length === 0) return sonuc;
  const ihtiyaclar = await emirlerinMalzemeIhtiyaci(db, emirIdleri);
  const malzemeler = [...new Set([...ihtiyaclar.values()].flatMap((l) => (l ?? []).map((m) => m.malzemeNo)))];
  const stok = await stokMiktarlari(db, malzemeler);
  const kullanilabilir = new Map([...stok].map(([id, m]) => [id, m.kullanilabilir]));
  const sarflar = await emirlerinNetSarfi(db, emirIdleri);
  for (const id of emirIdleri) {
    const verilen = new Map(sarflar.filter((v) => v.emirId === id).map((v) => [v.malzemeId, v.miktar]));
    sonuc.set(id, malzemeHazirMi(ihtiyaclar.get(id) ?? null, verilen, kullanilabilir));
  }
  return sonuc;
}

export async function uyarilar(db: Db, kullanici: Kullanici): Promise<SaatUyarilariCevabi> {
  const k = await kaynaklar(db, kullanici);
  const kararBekleyen = new Map([...await kararSayaclari(db, k.acik.map((e) => e.id))].map(([id, s]) => [id, s.kararBekliyor]));
  const malzemeHazir = await malzemeDurumlari(db, k.acik.filter((e) => e.baslama === null).map((e) => e.id));
  const aletler = kalibrasyonuGorebilirMi(kullanici.islemler)
    ? (await aletlerVeKayitlari(db, 0)).map((a) => ({ id: a.id, no: a.no, ad: a.ad, tur: a.tur, vade: a.vade, durum: a.durum }))
    : [];
  const zaman = await sorgular.simdi(db);
  const biten = await bitenEmirler(db, k.istasyonlar.map((i) => i.id), pencereBaslangici(zaman), zaman);
  return {
    zaman,
    ustlenebilir: ustlenebilirMi(kullanici.islemler),
    uyarilar: await ustlenmeEkle(db, uyarilariKur(k.istasyonlar, k.emirler, k.makineler.durumlar, { kararBekleyen, malzemeHazir, aletler, biten })),
  };
}

async function ustlenmeEkle(db: Db, ham: readonly HamUyari[]): Promise<SaatUyarilariCevabi['uyarilar']> {
  const kimlikler = ham.map(uyariKimligi);
  const ustlenmeler = new Map((await sorgular.ustlenmeler(db, kimlikler, USTLENME_GECERLILIK_SAAT)).map((u) => [u.kimlik, u]));
  const adlar = await kisiAdlari(db, [...new Set([...ustlenmeler.values()].map((u) => u.kisiId))]);
  return ham.map((u, i) => {
    const ustlenme = ustlenmeler.get(kimlikler[i]!);
    const ad = ustlenme === undefined ? undefined : adlar.get(ustlenme.kisiId);
    return { ...u, kimlik: kimlikler[i]!, ustlenen: ustlenme === undefined || ad === undefined ? null : { ad, an: ustlenme.an } };
  });
}

// Kişi yalnız kendi gördüğü (kapsamındaki, o an açık) uyarıyı üstlenir: liste kişiye göre yeniden kurulur. Geçerli başka
// üstlenme varsa çakışma; kişi ve zaman sunucudan.
export async function ustlen(db: Db, kullanici: Kullanici, kimlik: string): Promise<SaatUyarilariCevabi> {
  const once = await uyarilar(db, kullanici);
  if (!once.uyarilar.some((u) => u.kimlik === kimlik)) throw bulunamadi('Uyarı artık açık değil.');
  if (!await sorgular.ustlen(db, kimlik, kullanici.id, USTLENME_GECERLILIK_SAAT)) throw cakisma('Bu uyarıyı başka biri üstlendi.');
  return uyarilar(db, kullanici);
}

export async function emir(db: Db, kullanici: Kullanici, id: number): Promise<SaatEmriCevabi> {
  const e = await acikEmir(db, id);
  if (e === null) throw bulunamadi('Açık üretim emri bulunamadı.');
  const kapsam = await kisininKapsami(db, kullanici.id, kisininIzinliIsMerkezleri);
  kapsamDisiysaReddet(kapsam, (await istasyonGetir(db, e.istasyon.id))?.isMerkeziId ?? null);
  const isEmriId = e.canli?.isEmri?.id ?? null;
  const plan = isEmriId === null ? null : (await isEmriPlanBilgileri(db, [isEmriId])).get(isEmriId) ?? null;
  const birim = birimSaniye(plan?.birimSureDk ?? null);
  const saglam = e.canli?.saglam ?? null;
  const makineler = await makineKaynaklari(db);
  const istasyonMakineleri = makineler.durumlar.filter((m) => m.istasyonId === e.istasyon.id);
  const calismaBaslangic = e.canli?.calisma === 'calisiyor' ? (await calismayaGecisAnlari(db, [e.id])).get(e.id) ?? null : null;
  const kaynak = kaynakEmir(e, calismaBaslangic);
  const durum = istasyonDurumu(kaynak, istasyonMakineleri.map((m) => m.durum));
  // Ürün kartı olmayan eski (iş emirsiz) emrin adımı yoktur; ayrıntı okuması yalnız iş emirli emirde yapılır.
  const siradaki = e.malzemeNo == null ? null : (await adimliEmirAyrintisi(db, id)).siradaki;
  const malzemeHazir = (await malzemeDurumlari(db, [id])).get(id) ?? null;
  return {
    zaman: await sorgular.simdi(db),
    id: e.id,
    emirNo: e.emirNo,
    parcaAd: e.parcaAd,
    istasyon: e.istasyon,
    calisma: e.canli?.calisma ?? null,
    saglam,
    hurda: e.canli?.hurda ?? null,
    hedef: e.adet,
    birimSaniye: birim,
    kalanSaniye: kalanSaniye(e.adet, saglam, birim),
    durusNedeni: e.canli?.durusNedeni?.ad ?? null,
    durusBaslangic: e.canli?.durusBaslangic ?? null,
    op: e.canli?.isEmri == null ? null : { opNo: e.canli.isEmri.opNo, ad: e.canli.isEmri.ad },
    tezgah: emirTezgahi(e.canli?.isEmri?.makineId ?? null, e.istasyon.id, makineler.tezgahlar),
    siradaki: siradaki == null ? null : { opNo: siradaki.opNo, ad: siradaki.ad, adet: e.adet },
    malzemeHazir,
    durumBaslangic: durumBaslangici(durum, kaynak, istasyonMakineleri),
    sonUretimAni: isEmriId === null ? null : (await sonGirisler(db, 'is_emri', [isEmriId])).get(isEmriId) ?? null,
  };
}

export async function durusNedenleri(db: Db): Promise<SaatDurusNedenleriCevabi> {
  const nedenler = await durusNedenleriniListele(db, { yalnizAktif: true });
  return { nedenler: nedenler.map((n) => ({ id: n.id, ad: n.ad, simge: n.simge, kategori: n.kategori })) };
}

// Kapsam denetimi okumayla aynı yoldan geçer (emir()); durdurma emir durumu kuralını uretim-emirleri'ne bırakır.
export async function durdur(db: Db, kullanici: Kullanici, id: number, durusNedeniId: number): Promise<SaatEmriCevabi> {
  const e = await acikEmir(db, id);
  if (e === null) throw bulunamadi('Açık üretim emri bulunamadı.');
  const kapsam = await kisininKapsami(db, kullanici.id, kisininIzinliIsMerkezleri);
  kapsamDisiysaReddet(kapsam, (await istasyonGetir(db, e.istasyon.id))?.isMerkeziId ?? null);
  await emirDurdur(db, kullanici, id, durusNedeniId);
  return emir(db, kullanici, id);
}

async function kapsamdakiAcikEmir(db: Db, kullanici: Kullanici, id: number): Promise<Emir> {
  const e = await acikEmir(db, id);
  if (e === null) throw bulunamadi('Açık üretim emri bulunamadı.');
  const kapsam = await kisininKapsami(db, kullanici.id, kisininIzinliIsMerkezleri);
  kapsamDisiysaReddet(kapsam, (await istasyonGetir(db, e.istasyon.id))?.isMerkeziId ?? null);
  return e;
}

// Emre bağlı model önce (o emre özel çizim), yoksa ürünün malzeme kartına bağlı model. Kayıt sunucuda bulunur: kare ucu
// istemcinin verdiği revizyonla başka kaydın karesini okuyamaz.
async function emirOnizlemesi(db: Db, e: Emir) {
  const kayitlar = [
    { hedefModul: 'uretim-emirleri', hedefId: e.id },
    ...(e.malzemeNo == null ? [] : [{ hedefModul: 'malzemeler' as const, hedefId: e.malzemeNo }]),
  ] as const;
  for (const hedef of kayitlar) {
    const o = await yayindakiOnizleme(db, hedef);
    if (o !== null) return { hedef, onizleme: o };
  }
  return null;
}

export async function onizleme(db: Db, kullanici: Kullanici, id: number): Promise<SaatOnizlemesiCevabi> {
  const b = await emirOnizlemesi(db, await kapsamdakiAcikEmir(db, kullanici, id));
  return { onizleme: b === null ? null : { revizyonId: b.onizleme.revizyonId, kareler: b.onizleme.kareler } };
}

export async function onizlemeKaresi(db: Db, kullanici: Kullanici, id: number, kare: number): Promise<IkiliCevap> {
  const b = await emirOnizlemesi(db, await kapsamdakiAcikEmir(db, kullanici, id));
  const dosya = b === null ? null : await yayindakiOnizlemeKaresi(db, b.hedef, b.onizleme.revizyonId, kare);
  if (dosya === null) throw bulunamadi('Önizleme karesi bulunamadı.');
  return dosya;
}

// Tezgahin kendi modeli Cizim Merkezi'nde istasyona baglanir (istasyona yalniz 3B model baglanabilir); parca modelinden ayri tutulur.
async function kapsamdakiIstasyon(db: Db, kullanici: Kullanici, id: number): Promise<{ hedefModul: 'istasyonlar'; hedefId: number }> {
  const i = await istasyonGetir(db, id);
  if (i === null) throw bulunamadi('İstasyon bulunamadı.');
  const kapsam = await kisininKapsami(db, kullanici.id, kisininIzinliIsMerkezleri);
  kapsamDisiysaReddet(kapsam, i.isMerkeziId ?? null);
  return { hedefModul: 'istasyonlar', hedefId: i.id };
}

export async function tezgahOnizlemesi(db: Db, kullanici: Kullanici, id: number): Promise<SaatOnizlemesiCevabi> {
  const o = await yayindakiOnizleme(db, await kapsamdakiIstasyon(db, kullanici, id));
  return { onizleme: o === null ? null : { revizyonId: o.revizyonId, kareler: o.kareler } };
}

export async function tezgahOnizlemeKaresi(db: Db, kullanici: Kullanici, id: number, kare: number): Promise<IkiliCevap> {
  const hedef = await kapsamdakiIstasyon(db, kullanici, id);
  const o = await yayindakiOnizleme(db, hedef);
  const dosya = o === null ? null : await yayindakiOnizlemeKaresi(db, hedef, o.revizyonId, kare);
  if (dosya === null) throw bulunamadi('Önizleme karesi bulunamadı.');
  return dosya;
}

const gunOncesi = (an: string): string => tesisGunu(Date.parse(an) - 86_400_000);

// Kişinin o an içinde olduğu çalışma günü: dün başlayıp gece yarısını geçen vardiya da sayılır. Kişinin takvimi yoksa (istasyona
// atanmamış kişi) Vardiya null verir; saat de vardiyayı null gösterir, genel vardiya tanımından uydurmaz.
async function kisininVardiyasi(db: Db, kisiId: number, zaman: string): Promise<SaatVardiyaCevabi['vardiya']> {
  const kaynak = { tur: 'kisi' as const, id: kisiId };
  const gunler = (await basladigiGunTakvimleri(db, [kaynak], { baslangic: gunOncesi(zaman), bitis: tesisGunu(Date.parse(zaman)) })).get(`kisi:${String(kisiId)}`);
  if (gunler == null) return null;
  const v = gecerliVardiya([...gunler.values()], zaman);
  if (v === null) return null;
  const vardiyaId = (await kisiVardiyalari(db)).find((k) => k.kisiId === kisiId)?.vardiyaId ?? null;
  const ad = vardiyaId === null ? null : (await vardiyaTanimlari(db)).find((t) => t.id === vardiyaId)?.ad ?? null;
  return { ad, ...v };
}

export async function vardiya(db: Db, kullanici: Kullanici): Promise<SaatVardiyaCevabi> {
  const kapsam = await kisininKapsami(db, kullanici.id, kisininIzinliIsMerkezleri);
  const idler = (await aktifIstasyonlar(db)).filter((i) => kapsamdaMi(kapsam, i.isMerkeziId)).map((i) => i.id);
  const zaman = await sorgular.simdi(db);
  const baslangic = pencereBaslangici(zaman);
  const adetler = [...(await aralikAdetleri(db, 'istasyon', idler, baslangic, zaman)).values()];
  const sinirlar = saatlikSinirlar(zaman);
  const saatler = await gunlukAralikAdetleri(db, 'istasyon', idler, sinirlar);
  return {
    zaman,
    vardiya: await kisininVardiyasi(db, kullanici.id, zaman),
    pencere: { baslangic },
    bugun: adetler.length === 0 ? null : adetler.reduce((t, a) => ({ saglam: t.saglam + a.saglam, hurda: t.hurda + a.hurda }), { saglam: 0, hurda: 0 }),
    saatlik: saatler.map((h, i) => ({
      baslangic: sinirlar[i]!,
      saglam: h.size === 0 ? null : [...h.values()].reduce((t, a) => t + a.saglam, 0),
    })),
  };
}

export async function siradaki(db: Db, kullanici: Kullanici, istasyonId: number): Promise<SaatSiradakiCevabi> {
  await kapsamdakiIstasyon(db, kullanici, istasyonId);
  const makineler = (await aktifMakineler(db)).filter((m) => m.istasyonId === istasyonId);
  const zaman = await sorgular.simdi(db);
  if (makineler.length === 0) return { zaman, siradaki: null };
  const isler = (await planlanacakIsEmirleri(db)).map((i) => ({
    id: i.id, emirNo: i.emirNo, opNo: i.opNo, ad: i.ad, adet: i.adimAdedi ?? i.adet, adimDurumu: i.adimDurumu ?? null,
  }));
  const { yerlesimler } = await canliSira(db, isler.map((i) => i.id));
  // Terminalin sırası (3a): Hazırlık sırası önce; parçalı işte parçaların en küçüğü işin sırasıdır.
  const hazirlik = new Map<number, number>();
  for (const h of await istasyonHazirlikSirasi(db, istasyonId)) if (!hazirlik.has(h.isEmriId)) hazirlik.set(h.isEmriId, h.sira);
  const s = siradakiIs(
    isler,
    yerlesimler.map((y) => ({ isEmriId: y.isEmriId, makineId: y.kaynak.tur === 'makine' ? y.kaynak.id : null, baslangic: y.baslangic })),
    new Set(makineler.map((m) => m.id)),
    hazirlik,
  );
  if (s === null) return { zaman, siradaki: null };
  return {
    zaman,
    siradaki: {
      emirNo: s.is.emirNo, opNo: s.is.opNo, ad: s.is.ad, adet: s.is.adet, baslangic: s.yerlesim.baslangic.toISOString(),
      tezgah: makineler.find((m) => m.id === s.yerlesim.makineId)?.ad ?? null,
    },
  };
}
