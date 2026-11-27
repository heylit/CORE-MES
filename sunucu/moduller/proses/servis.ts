import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama, eskiSurum } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { NcProgramYazmaCevabi, ProsesNcProgrami, ProsesParcaCevabi, ProsesRevizyonu } from '#paylasilan/sozlesme/proses.ts';
import type { ncProgramEkleGovdesi, ncProgramKaydetGovdesi } from '#paylasilan/sozlesme/proses.ts';
import { malzemelerinParcaCizimleri } from '../belge-merkezi/disari.ts';
import { yururluktekiParcaRevizyonlari } from '../degisiklik-yonetimi/disari.ts';
import { ilkParcaKararlari, studyoParcasi } from '../kalite-merkezi/disari.ts';
import { istasyonAdlari, makineGetir } from '../istasyonlar/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { malzemeOzetleri } from '../malzemeler/disari.ts';
import { durumRevizyonlari, gecerliTalimatlarToplu, revizyonOperasyonKimlikleri, sureler, yururluktekiRevizyon } from '../rota/disari.ts';
import { malzemelerinAcikEmirleri } from '../uretim-emirleri/disari.ts';
import {
  ayniRevizyon, cizimHalkasi, gecerliProgramlar, ilkParcaHalkasi, kontrolHalkasi, ncHalkalari, operasyonlar, planKarakteristigi, plansizOperasyonlar, revizyonKoduGecerliMi,
  revizyonListesi, revizyonSec, rotaHalkasi, zincir,
} from './kurallar.ts';
import * as sorgular from './sorgular.ts';
import type { OperasyonGirdisi } from './kurallar.ts';

const ACIK_TASLAK = new Set(['taslak', 'onay_bekliyor', 'onayli']);

// Adım kaynağının görünen adı: makine kodu, istasyon ve kişi adı; sahiplerinin disari okumasından.
async function tezgahAdlari(db: Db, kaynaklar: readonly { tur: 'makine' | 'kisi' | 'istasyon'; id: number }[]): Promise<Map<string, string>> {
  const idler = (tur: string) => [...new Set(kaynaklar.filter((k) => k.tur === tur).map((k) => k.id))];
  const sonuc = new Map<string, string>();
  for (const id of idler('makine')) {
    const m = await makineGetir(db, id);
    if (m) sonuc.set(`makine:${String(id)}`, m.kod);
  }
  for (const [id, ad] of await istasyonAdlari(db, idler('istasyon'))) sonuc.set(`istasyon:${String(id)}`, ad);
  for (const [id, ad] of await kisiAdlari(db, idler('kisi'))) sonuc.set(`kisi:${String(id)}`, ad);
  return sonuc;
}

// Parçanın teknik resim revizyonları: Belge Merkezi'nin parça çizimi (3755 emir revizyonuyla aynı kaynak) ve yürürlükteki parça revizyonu.
async function parcaRevizyonlari(db: Db, malzemeNo: number): Promise<{ liste: ProsesRevizyonu[]; yururlukte: string | null }> {
  const cizim = (await malzemelerinParcaCizimleri(db, [malzemeNo])).get(malzemeNo);
  const yururlukte = (await yururluktekiParcaRevizyonlari(db, [malzemeNo])).get(malzemeNo) ?? null;
  const liste = revizyonListesi((cizim?.revizyonlar ?? []).map((r) => ({ kod: r.revKodu, durum: r.durum, sira: r.sira })), yururlukte);
  return { liste, yururlukte };
}

// Seçili revizyonun NC programları; kart ve makine adları sahiplerinin okumasından.
async function ncProgramlari(db: Db, malzemeNo: number, secili: string | null): Promise<ProsesNcProgrami[]> {
  const programlar = gecerliProgramlar(await sorgular.parcaninProgramlari(db, malzemeNo), secili);
  const idler = programlar.map((p) => p.id);
  const [takimlar, aparatlar] = [await sorgular.takimlar(db, idler), await sorgular.aparatlar(db, idler)];
  const kartlar = await malzemeOzetleri(db, [...takimlar.map((t) => t.malzemeId), ...aparatlar.map((a) => a.malzemeId)]);
  const kart = (id: number) => {
    const k = kartlar.get(id);
    return { id, kod: k?.kod ?? `#${String(id)}`, ad: k?.ad ?? null };
  };
  const makineler = new Map<number, string>();
  for (const id of new Set(programlar.flatMap((p) => (p.makineId === null ? [] : [p.makineId])))) {
    const m = await makineGetir(db, id);
    if (m) makineler.set(id, m.kod);
  }
  return programlar.map((p) => ({
    id: p.id, opNo: p.opNo, revizyonKodu: p.revizyonKodu, ad: p.ad, kontrol: p.kontrol,
    makine: p.makineId === null ? null : { id: p.makineId, kod: makineler.get(p.makineId) ?? `#${String(p.makineId)}` },
    camYazilimi: p.camYazilimi, camDosyasi: p.camDosyasi, sifirNoktasi: p.sifirNoktasi, cevrimSuresiDk: p.cevrimSuresiDk, durum: p.durum,
    aciklama: p.aciklama, surum: p.surum, guncelleme: p.guncelleme, genelYerine: p.genelYerine,
    takimlar: takimlar.filter((t) => t.programId === p.id).map((t) => ({ tNo: t.tNo, kart: kart(t.malzemeId), tutucu: t.tutucu, cikintiMm: t.cikintiMm, islem: t.islem })),
    aparatlar: aparatlar.filter((a) => a.programId === p.id).map((a) => ({ kart: kart(a.malzemeId), aciklama: a.aciklama })),
  }));
}

// Parça proses dosyası (3290): halkalar sahiplerin disari.ts okumasıdır; NC, takım ve bağlama Proses'in kendi kaydıdır (3800).
export async function parcaDosyasi(db: Db, malzemeNo: number, istenenRev: string | null = null): Promise<ProsesParcaCevabi> {
  const kart = (await malzemeOzetleri(db, [malzemeNo])).get(malzemeNo);
  if (!kart) throw bulunamadi('Malzeme kartı bulunamadı.');

  const rota = await yururluktekiRevizyon(db, malzemeNo);
  const acikTaslak = (await durumRevizyonlari(db, malzemeNo)).some((r) => ACIK_TASLAK.has(r.durum));
  const olculen = new Map(rota === null ? [] : (await sureler(db, rota.id, null)).adimlar.map((a) => [a.opNo, a.ozet.islem]));
  const tezgahlar = await tezgahAdlari(db, (rota?.adimlar ?? []).flatMap((a) => (a.fason === null && a.kaynak !== null ? [a.kaynak] : [])));
  const adimlar: OperasyonGirdisi[] = (rota?.adimlar ?? []).map((a) => {
    const k = a.kaynak;
    const o = olculen.get(a.opNo) ?? null;
    return {
      opNo: a.opNo, ad: a.ad, fason: a.fason !== null,
      tezgah: a.fason !== null || k === null ? null : (tezgahlar.get(`${k.tur}:${String(k.id)}`) ?? null),
      ayarSuresiDk: a.ayarSuresiDk, birimSureDk: a.birimSureDk,
      gercek: o === null ? null : { ortancaDk: o.ortancaDk, n: o.n },
    };
  });
  // Talimat adımın operasyon kimliğiyle okunur; OP numarası rotada yeniden dizilse de doğru adımın talimatı (3250-2).
  const kimlikler = rota === null ? new Map<number, number>() : await revizyonOperasyonKimlikleri(db, rota.id);
  const talimatlar = await gecerliTalimatlarToplu(db, adimlar.map((a) => ({ malzemeId: malzemeNo, opNo: a.opNo, operasyonId: kimlikler.get(a.opNo) ?? null })));
  const talimatli = new Set(adimlar.filter((a) => talimatlar.has(`${String(malzemeNo)}:${String(a.opNo)}`)).map((a) => a.opNo));

  const studyo = await studyoParcasi(db, malzemeNo);
  const resimler = studyo.resimler.filter((r) => r.aktif && r.tur === 'resim' && r.eski !== true);
  const balonlar = studyo.resimler.filter((r) => r.aktif && r.eski !== true).flatMap((r) => r.balonlar);
  const planli = new Set(studyo.numunePlanlari.filter((p) => p.kurallar.length > 0).map((p) => p.opNo));
  const opKarakteristigi = new Map(studyo.numunePlanlari.filter((p) => planli.has(p.opNo))
    .map((p) => [p.opNo, planKarakteristigi(p.kurallar, balonlar)]));
  const karakteristik = balonlar.length;

  const revizyonlar = await parcaRevizyonlari(db, malzemeNo);
  const seciliRevizyon = revizyonSec(revizyonlar.liste, istenenRev);
  const nc = await ncProgramlari(db, malzemeNo, seciliRevizyon);
  const ncHalka = ncHalkalari(nc.map((p) => ({ ad: p.ad, durum: p.durum, takimSayisi: p.takimlar.length, aparatSayisi: p.aparatlar.length })));

  const emirler = await malzemelerinAcikEmirleri(db, [malzemeNo]);
  const kararlar = await ilkParcaKararlari(db, emirler.map((e) => e.id));
  const kararListesi = [...kararlar.values()];

  return {
    malzeme: { no: kart.id, kod: kart.kod, ad: kart.ad },
    parcaRevizyonu: revizyonlar.yururlukte,
    rota: rota === null ? null : { revizyon: rota.harf, acikTaslak },
    halkalar: zincir({
      cizim: cizimHalkasi({ revizyonlar: resimler.map((r) => r.revizyon), alinmamis: studyo.alinmamis }),
      rota: rotaHalkasi({ yururlukte: rota === null ? null : { harf: rota.harf, adimSayisi: rota.adimlar.length }, acikTaslak }),
      ...ncHalka,
      kontrol: kontrolHalkasi({ karakteristik, plansizOplar: plansizOperasyonlar(adimlar, planli) }),
      ilkParca: ilkParcaHalkasi({
        acikEmir: emirler.length, onay: kararListesi.filter((k) => k.karar === 'onay').length, ret: kararListesi.filter((k) => k.karar === 'ret').length,
      }),
    }),
    operasyonlar: operasyonlar(adimlar, talimatli, opKarakteristigi),
    revizyonlar: revizyonlar.liste,
    seciliRevizyon,
    ncProgramlari: nc,
  };
}

/* ---------------- NC/CAM program yazma (3800) ---------------- */

type ProgramGirdisi = Omit<ReturnType<typeof ncProgramKaydetGovdesi.parse>, 'surum'>;

const KISITLAR = {
  proses_nc_programi_operasyon: { ileti: 'Bu operasyon numarası parçanın rotasında hiç verilmemiş.', alan: 'opNo' },
  proses_nc_programi_ad_tekil: { ileti: 'Bu operasyonda aynı revizyon için aynı adla bir program zaten var.', alan: 'ad' },
  proses_nc_takimi_t_no_tekil: { ileti: 'Aynı takım numarası listede iki kez var.', alan: 'takimlar' },
  proses_nc_aparati_kart_tekil: { ileti: 'Aynı aparat listede iki kez var.', alan: 'aparatlar' },
} as const;

// Kartlar Malzemeler'den doğrulanır: takım sarf ya da demirbaş kartı (Takımhane kütüphanesi), aparat demirbaş kartıdır; makine İstasyonlar'dan.
// Kayıtta revizyon değişmiyorsa (korunan) güncel listede aranmaz: teknik resimden kalkmış revizyonun programı da kaydedilir, eski yapılır.
async function girdiDenetle(db: Db, malzemeNo: number, g: ProgramGirdisi, korunan: string | null = null): Promise<string | null> {
  const rev = korunan !== null && g.revizyonKodu !== null && ayniRevizyon(korunan, g.revizyonKodu)
    ? korunan
    : revizyonKoduGecerliMi((await parcaRevizyonlari(db, malzemeNo)).liste, g.revizyonKodu);
  if (rev === false) throw dogrulama('Bu revizyon parçanın teknik resim revizyonları arasında yok.', 'revizyonKodu');
  if (g.makineId !== null && (await makineGetir(db, g.makineId)) === null) throw dogrulama('Tezgâh bulunamadı.', 'makineId');
  const kartlar = await malzemeOzetleri(db, [...g.takimlar.map((t) => t.malzemeId), ...g.aparatlar.map((a) => a.malzemeId)]);
  for (const t of g.takimlar) {
    const k = kartlar.get(t.malzemeId);
    if (k === undefined || (k.tur !== 'sarf' && k.tur !== 'demirbas')) throw dogrulama(`${t.tNo}: takım kartı sarf ya da demirbaş kartı olmalı.`, 'takimlar');
  }
  for (const a of g.aparatlar) {
    const k = kartlar.get(a.malzemeId);
    if (k === undefined || k.tur !== 'demirbas') throw dogrulama('Aparat kartı demirbaş kartı olmalı.', 'aparatlar');
  }
  return rev;
}

const yazim = (g: ProgramGirdisi, rev: string | null): sorgular.ProgramYazimi => ({
  revizyonKodu: rev, ad: g.ad, kontrol: g.kontrol, makineId: g.makineId, camYazilimi: g.camYazilimi, camDosyasi: g.camDosyasi,
  sifirNoktasi: g.sifirNoktasi, cevrimSuresiDk: g.cevrimSuresiDk, durum: g.durum, aciklama: g.aciklama,
});

export async function ncProgramEkle(db: Db, kisiId: number, govde: ReturnType<typeof ncProgramEkleGovdesi.parse>): Promise<NcProgramYazmaCevabi> {
  if ((await malzemeOzetleri(db, [govde.malzemeNo])).get(govde.malzemeNo) === undefined) throw bulunamadi('Malzeme kartı bulunamadı.');
  const rev = await girdiDenetle(db, govde.malzemeNo, govde);
  return kisitKorumali(KISITLAR, async () => {
    const s = await sorgular.programEkle(db, govde.malzemeNo, govde.opNo, yazim(govde, rev), kisiId);
    await sorgular.altlariYaz(db, s.id, govde.takimlar, govde.aparatlar);
    return s;
  });
}

// Program, takım listesi ve aparatlar birlikte yazılır; arada başkası kaydettiyse 409 (sürüm). Program silinmez, "eski" yapılır.
export async function ncProgramKaydet(db: Db, kisiId: number, id: number, govde: ReturnType<typeof ncProgramKaydetGovdesi.parse>): Promise<NcProgramYazmaCevabi> {
  const mevcut = await sorgular.programKilitle(db, id);
  if (mevcut === null) throw bulunamadi('NC programı bulunamadı.');
  if (mevcut.surum !== govde.surum) throw eskiSurum();
  const rev = await girdiDenetle(db, mevcut.malzemeId, govde, mevcut.revizyonKodu);
  return kisitKorumali(KISITLAR, async () => {
    const s = await sorgular.programGuncelle(db, id, govde.surum, yazim(govde, rev), kisiId);
    if (s === null) throw eskiSurum();
    await sorgular.altlariYaz(db, id, govde.takimlar, govde.aparatlar);
    return s;
  });
}
