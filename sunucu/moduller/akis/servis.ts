import type { Db } from '#cekirdek/db.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import type { EmirAkisiCevabi, EmirListesiCevabi } from '#paylasilan/sozlesme/akis.ts';
import { istasyonAdlari } from '../istasyonlar/disari.ts';
import { receteRotaStatuleri } from '../recete-rota/disari.ts';
import { emirlerinSevkDurumu } from '../sevkiyat/disari.ts';
import { emrinAkisHareketleri, partiGirisZamanlari } from '../stok/disari.ts';
import { adimliEmirListesi, emirAkisKaydi } from '../uretim-emirleri/disari.ts';
import { emirAkisi, sevkAni } from './kurallar.ts';
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

export async function emirAkisiOku(db: Db, id: number): Promise<EmirAkisiCevabi> {
  const kayit = await emirAkisKaydi(db, id);
  if (kayit === null) throw bulunamadi('Üretim emri bulunamadı.');
  const hareketler = await emrinAkisHareketleri(db, id);
  const partiler = await partiGirisZamanlari(db, tekil(hareketler.map((h) => h.partiId)));
  const sevkler = await emirlerinSevkDurumu(db, [id]);
  const statuler = await receteRotaStatuleri(db);
  const istasyonlar = await istasyonAdlari(db, tekil(kayit.isEmirleri.map((i) => i.istasyonId)));
  const simdi = await sorgular.simdi(db);
  const { emir } = kayit;
  const sonuc = emirAkisi({
    simdi,
    emir: { id: emir.id, emirNo: emir.emirNo, malzemeNo: emir.malzemeNo, adet: emir.adet, durum: emir.durum, baslama: emir.baslama, teslim: emir.teslim },
    adimlar: kayit.isEmirleri.map((i) => ({
      id: i.id, opNo: i.opNo, sira: i.sira, istasyon: i.istasyonId === null ? null : istasyonlar.get(i.istasyonId) ?? null,
      fason: i.fasonFirmaId !== null, terminGun: i.terminGun, baslama: i.baslama, bitis: i.bitis, birimSureDk: sayi(i.birimSureDk), ayarSuresiDk: sayi(i.ayarSuresiDk),
      bagimlilik: i.bagimlilik, devirAdedi: i.devirAdedi,
    })),
    olaylar: kayit.olaylar,
    sayimlar: kayit.sayimlar,
    fason: kayit.fason,
    hareketler,
    statuler: new Map(statuler.map((s) => [s.id, { ad: s.ad, tur: s.tur }])),
    partiGirisleri: new Map([...partiler].map(([k, p]) => [k, { lotNo: p.lotNo, malKabul: p.malKabulZamani }])),
    sevk: sevkAni(sevkler.get(id) ?? null),
  });
  return { emir: { id: emir.id, emirNo: emir.emirNo, adet: emir.adet, durum: emir.durum, teslim: emir.teslim }, ...sonuc };
}
