import type { Db } from '#cekirdek/db.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import type { ProsesParcaCevabi } from '#paylasilan/sozlesme/proses.ts';
import { yururluktekiParcaRevizyonlari } from '../degisiklik-yonetimi/disari.ts';
import { ilkParcaKararlari, studyoParcasi } from '../kalite-merkezi/disari.ts';
import { istasyonAdlari, makineGetir } from '../istasyonlar/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { malzemeOzetleri } from '../malzemeler/disari.ts';
import { durumRevizyonlari, gecerliTalimatlarToplu, sureler, yururluktekiRevizyon } from '../rota/disari.ts';
import { malzemelerinAcikEmirleri } from '../uretim-emirleri/disari.ts';
import { cizimHalkasi, ilkParcaHalkasi, kontrolHalkasi, operasyonlar, planKarakteristigi, plansizOperasyonlar, rotaHalkasi, zincir } from './kurallar.ts';
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

// Parça proses dosyası (3290): bütün halkalar sahiplerin disari.ts okumasıdır; Proses yazmaz.
export async function parcaDosyasi(db: Db, malzemeNo: number): Promise<ProsesParcaCevabi> {
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
  const talimatlar = await gecerliTalimatlarToplu(db, adimlar.map((a) => ({ malzemeId: malzemeNo, opNo: a.opNo })));
  const talimatli = new Set(adimlar.filter((a) => talimatlar.has(`${String(malzemeNo)}:${String(a.opNo)}`)).map((a) => a.opNo));

  const studyo = await studyoParcasi(db, malzemeNo);
  const resimler = studyo.resimler.filter((r) => r.aktif && r.tur === 'resim' && r.eski !== true);
  const balonlar = studyo.resimler.filter((r) => r.aktif && r.eski !== true).flatMap((r) => r.balonlar);
  const planli = new Set(studyo.numunePlanlari.filter((p) => p.kurallar.length > 0).map((p) => p.opNo));
  const opKarakteristigi = new Map(studyo.numunePlanlari.filter((p) => planli.has(p.opNo))
    .map((p) => [p.opNo, planKarakteristigi(p.kurallar, balonlar)]));
  const karakteristik = balonlar.length;

  const emirler = await malzemelerinAcikEmirleri(db, [malzemeNo]);
  const kararlar = await ilkParcaKararlari(db, emirler.map((e) => e.id));
  const kararListesi = [...kararlar.values()];

  return {
    malzeme: { no: kart.id, kod: kart.kod, ad: kart.ad },
    parcaRevizyonu: (await yururluktekiParcaRevizyonlari(db, [malzemeNo])).get(malzemeNo) ?? null,
    rota: rota === null ? null : { revizyon: rota.harf, acikTaslak },
    halkalar: zincir({
      cizim: cizimHalkasi({ revizyonlar: resimler.map((r) => r.revizyon), alinmamis: studyo.alinmamis }),
      rota: rotaHalkasi({ yururlukte: rota === null ? null : { harf: rota.harf, adimSayisi: rota.adimlar.length }, acikTaslak }),
      kontrol: kontrolHalkasi({ karakteristik, plansizOplar: plansizOperasyonlar(adimlar, planli) }),
      ilkParca: ilkParcaHalkasi({
        acikEmir: emirler.length, onay: kararListesi.filter((k) => k.karar === 'onay').length, ret: kararListesi.filter((k) => k.karar === 'ret').length,
      }),
    }),
    operasyonlar: operasyonlar(adimlar, talimatli, opKarakteristigi),
  };
}
