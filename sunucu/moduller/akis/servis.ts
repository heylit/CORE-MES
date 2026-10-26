import type { Db } from '#cekirdek/db.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import type { EmirAkisiCevabi, EmirListesiCevabi, KartAkisiCevabi } from '#paylasilan/sozlesme/akis.ts';
import { istasyonAdlari } from '../istasyonlar/disari.ts';
import { receteRotaStatuleri } from '../recete-rota/disari.ts';
import { emirlerinSevkDurumu } from '../sevkiyat/disari.ts';
import { emrinAkisHareketleri, partiGirisZamanlari, refakatKartiKapsami } from '../stok/disari.ts';
import { adimliEmirListesi, emirAkisKaydi } from '../uretim-emirleri/disari.ts';
import { emirAkisi, kartAnlari, sevkAni, type AkisGirdisi } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

// Standart süreler numeric metin gelir; ekranda dakika sayısıdır.
const sayi = (m: string | null): number | null => (m === null ? null : Number(m));
const tekil = (d: readonly (number | null)[]): number[] => [...new Set(d.filter((x): x is number => x !== null))];

export async function emirListesi(db: Db): Promise<EmirListesiCevabi> {
  const { emirler } = await adimliEmirListesi(db, false);
  return {
    emirler: emirler.map((e) => ({ id: e.id, emirNo: e.emirNo, urun: `${e.urun.kod} ${e.urun.ad}`.trim(), adet: e.adet, durum: e.durum, teslim: e.teslim })),
  };
}

// Emir yolculuğu ve kartın akışı aynı girdiyle hesaplanır; kart kapsamı hareketleri kartın partilerine, sayımları kartla
// sayılanlara daraltır (kart #708).
async function akisGirdisi(db: Db, id: number, kart: { id: number; partiIdler: readonly number[] } | null) {
  const kayit = await emirAkisKaydi(db, id);
  if (kayit === null) throw bulunamadi('Üretim emri bulunamadı.');
  const tumHareketler = await emrinAkisHareketleri(db, id);
  const hareketler = kart === null ? tumHareketler : tumHareketler.filter((h) => h.partiId !== null && kart.partiIdler.includes(h.partiId));
  const sayimlar = kart === null ? kayit.sayimlar : kayit.sayimlar.filter((s) => s.refakatPartisiId === kart.id);
  const partiler = await partiGirisZamanlari(db, tekil(hareketler.map((h) => h.partiId)));
  const sevkler = await emirlerinSevkDurumu(db, [id]);
  const statuler = await receteRotaStatuleri(db);
  const istasyonlar = await istasyonAdlari(db, tekil(kayit.isEmirleri.map((i) => i.istasyonId)));
  const simdi = await sorgular.simdi(db);
  const { emir } = kayit;
  const adimlar = kayit.isEmirleri.map((i) => ({
    id: i.id, opNo: i.opNo, sira: i.sira, istasyon: i.istasyonId === null ? null : istasyonlar.get(i.istasyonId) ?? null,
    fason: i.fasonFirmaId !== null, terminGun: i.terminGun, baslama: i.baslama, bitis: i.bitis, birimSureDk: sayi(i.birimSureDk), ayarSuresiDk: sayi(i.ayarSuresiDk),
    bagimlilik: i.bagimlilik, devirAdedi: i.devirAdedi,
  }));
  const girdi: AkisGirdisi = {
    simdi,
    emir: { id: emir.id, emirNo: emir.emirNo, malzemeNo: emir.malzemeNo, adet: emir.adet, durum: emir.durum, baslama: emir.baslama, teslim: emir.teslim },
    adimlar,
    olaylar: kayit.olaylar,
    sayimlar,
    fason: kayit.fason,
    hareketler,
    statuler: new Map(statuler.map((s) => [s.id, { ad: s.ad, tur: s.tur }])),
    partiGirisleri: new Map([...partiler].map(([k, p]) => [k, { lotNo: p.lotNo, malKabul: p.malKabulZamani }])),
    sevk: sevkAni(sevkler.get(id) ?? null),
  };
  return { girdi, emir: { id: emir.id, emirNo: emir.emirNo, adet: emir.adet, durum: emir.durum, teslim: emir.teslim } };
}

export async function emirAkisiOku(db: Db, id: number): Promise<EmirAkisiCevabi> {
  const { girdi, emir } = await akisGirdisi(db, id, null);
  return { emir, ...emirAkisi(girdi) };
}

export async function kartAkisiOku(db: Db, id: number): Promise<KartAkisiCevabi> {
  const k = await refakatKartiKapsami(db, id);
  if (k === null) throw bulunamadi('Refakat kartı bulunamadı.');
  const { girdi, emir } = await akisGirdisi(db, k.refakat.uretimEmriId, { id, partiIdler: k.partiIdler });
  const sonuc = emirAkisi(girdi);
  return {
    emir, ...sonuc,
    kart: { id, etiket: k.refakat.etiket, durum: k.refakat.durum, lotNo: k.refakat.lotNo, acilis: k.refakat.kayitZamani },
    olaylarEmrin: true,
    anlar: kartAnlari({
      acilis: k.refakat.kayitZamani, hammadde: sonuc.hammadde, teslimler: k.teslimler, adimlar: girdi.adimlar,
      olaylar: girdi.olaylar, sayimlar: girdi.sayimlar, fason: girdi.fason, sevk: girdi.sevk,
    }),
  };
}
