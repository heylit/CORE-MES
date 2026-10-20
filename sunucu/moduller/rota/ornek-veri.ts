import type { Db } from '#cekirdek/db.ts';
import { ornekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { AdimGirdisi } from '#paylasilan/sozlesme/rota.ts';
import { ornekFirmaNo } from '../musteri-tedarikci/disari.ts';
import { eskiKoddanKimlikCoz, operasyonTipleri } from '../istasyonlar/disari.ts';
import { kisiNoKullaniciAdindan } from '../kisiler/disari.ts';
import { ornekMalzemeNo } from '../malzemeler/disari.ts';
import type { OrnekMalzemeAnahtari } from '../malzemeler/disari.ts';
import { ONAYLA, YAZ } from './kurallar.ts';
import { kaydet, onayaGonder, onayla, taslakAc } from './servis.ts';
import { urunRevizyonlari } from './sorgular.ts';

const HAZIRLAYAN = 'ornek.planlama';
const ONAYLAYAN = 'ornek.mudur';

type Kaynak = { tur: 'makine'; kod: string } | { tur: 'fason' };
interface OrnekAdim {
  tip: string; ad: string; kaynak: Kaynak; ayarDk: number | null; birimDk: number | null; terminGun?: number; hammadde?: OrnekMalzemeAnahtari;
}
interface OrnekRota { urun: OrnekMalzemeAnahtari; adimlar: readonly OrnekAdim[] }

// Süreler uydurmadır. Fason adımda süre yoktur, termin günü vardır.
const ROTALAR: readonly OrnekRota[] = [
  {
    urun: 'mil',
    adimlar: [
      { tip: 'TRN', ad: 'Tornalama', kaynak: { tur: 'makine', kod: 'ORN-CNC-T1' }, ayarDk: 30, birimDk: 4.5, hammadde: 'cubuk' },
      { tip: 'BM', ad: 'Son kontrol', kaynak: { tur: 'makine', kod: 'ORN-CMM-1' }, ayarDk: 10, birimDk: 1.5 },
    ],
  },
  {
    urun: 'flans',
    adimlar: [
      { tip: 'TRN', ad: 'Tornalama', kaynak: { tur: 'makine', kod: 'ORN-CNC-T2' }, ayarDk: 40, birimDk: 6, hammadde: 'levha' },
      { tip: 'FRZ', ad: 'Delik frezeleme', kaynak: { tur: 'makine', kod: 'ORN-CNC-F1' }, ayarDk: 35, birimDk: 5 },
      { tip: 'FSN', ad: 'Isıl işlem (fason)', kaynak: { tur: 'fason' }, ayarDk: null, birimDk: null, terminGun: 5 },
      { tip: 'BM', ad: 'Son kontrol', kaynak: { tur: 'makine', kod: 'ORN-CMM-1' }, ayarDk: 10, birimDk: 2 },
    ],
  },
  {
    urun: 'burc',
    adimlar: [
      { tip: 'TRN', ad: 'Tornalama', kaynak: { tur: 'makine', kod: 'ORN-CNC-T1' }, ayarDk: 25, birimDk: 3, hammadde: 'cubuk' },
      { tip: 'FRZ', ad: 'Yağ kanalı frezeleme', kaynak: { tur: 'makine', kod: 'ORN-CNC-F2' }, ayarDk: 20, birimDk: 2.5 },
    ],
  },
];

// Rota işlemleri henüz hiçbir role verilmemiş (yalnız yönetici): örnek kişi yalnız bu koşuda ilgili işlemle komut verir,
// dört göz kuralı gerçek kişi kimlikleriyle işler. Hesap rolleri değişmez.
async function kullaniciAl(db: Db, kullaniciAdi: string, islemler: Kullanici['islemler']): Promise<Kullanici> {
  const id = await kisiNoKullaniciAdindan(db, kullaniciAdi);
  if (id === null) throw new Error(`Rota örnek verisi ${kullaniciAdi} hesabını bulamadı (kisiler örnek verisi önce yüklenir).`);
  return { id, ad: kullaniciAdi, islemler };
}

async function malzemeAl(db: Db, anahtar: OrnekMalzemeAnahtari): Promise<number> {
  const id = await ornekMalzemeNo(db, anahtar);
  if (id === null) throw new Error(`Rota örnek verisi örnek malzeme kartını bulamadı: ${anahtar} (malzemeler örnek verisi önce yüklenir).`);
  return id;
}

async function adimlariKur(db: Db, rota: OrnekRota): Promise<AdimGirdisi[]> {
  const tipler = new Map((await operasyonTipleri(db)).map((t) => [t.kod, t.id]));
  const kodlar = rota.adimlar.flatMap((a) => (a.kaynak.tur === 'makine' ? [a.kaynak.kod] : []));
  const makineler = await eskiKoddanKimlikCoz(db, 'makine', kodlar);
  const adimlar: AdimGirdisi[] = [];
  for (const a of rota.adimlar) {
    const tipId = tipler.get(a.tip);
    if (tipId === undefined) throw new Error(`Rota örnek verisi operasyon tipini bulamadı: ${a.tip}`);
    let kaynak: AdimGirdisi['kaynak'];
    if (a.kaynak.tur === 'fason') {
      const firma = await ornekFirmaNo(db, 'fason');
      if (firma === null) throw new Error('Rota örnek verisi örnek fason firmayı bulamadı (finans örnek verisi önce yüklenir).');
      kaynak = { tur: 'fason', id: firma };
    } else {
      const makine = makineler.get(a.kaynak.kod);
      if (makine === undefined) throw new Error(`Rota örnek verisi örnek makineyi bulamadı: ${a.kaynak.kod} (istasyonlar örnek verisi önce yüklenir).`);
      kaynak = { tur: 'makine', id: makine };
    }
    adimlar.push({
      opNo: null, operasyonTipiId: tipId, ad: a.ad, kaynak, ayarSuresiDk: a.ayarDk, birimSureDk: a.birimDk, terminGun: a.terminGun ?? null,
      bagimlilik: 'bekleyen', devirAdedi: null, firePayiYuzde: 0, makineKullanimi: 'tek', enKucukParca: null, yenidenAyar: true, adaylar: [],
      bilesenler: a.hammadde ? [{ malzemeId: await malzemeAl(db, a.hammadde), miktar: 1, fireYuzde: 2 }] : [], yanUrunler: [],
    });
  }
  return adimlar;
}

export const ornekVeri = ornekVeriTanimi({
  modul: 'rota',
  gerekir: ['malzemeler', 'istasyonlar', 'finans'],
  // Örnek mamullerden birinin yürürlükte rotası varsa yüklüdür; kartın kendiliğinden açtığı boş taslak yüklü sayılmaz.
  yukluMu: async (db) => {
    for (const r of ROTALAR) {
      const urunId = await ornekMalzemeNo(db, r.urun);
      if (urunId !== null && (await urunRevizyonlari(db, urunId)).some((v) => v.durum === 'yururlukte')) return true;
    }
    return false;
  },
  yukle: async (db) => {
    const hazirlayan = await kullaniciAl(db, HAZIRLAYAN, [YAZ]);
    const onaylayan = await kullaniciAl(db, ONAYLAYAN, [ONAYLA]);
    for (const rota of ROTALAR) {
      const urunId = await malzemeAl(db, rota.urun);
      const revizyonlar = await urunRevizyonlari(db, urunId);
      // Kartın açtığı taslak varsa o doldurulur; onaydaki ya da eski revizyona dokunulmaz.
      if (revizyonlar.some((v) => v.durum !== 'taslak')) continue;
      const mevcut = revizyonlar[0];
      const taslak: { id: number; surum: number } = mevcut ?? await taslakAc(db, hazirlayan, urunId, { tur: 'bos' });
      const adimlar = await adimlariKur(db, rota);
      const kaydedildi = await kaydet(db, hazirlayan, taslak.id, { surum: taslak.surum, aciklama: null, adimlar });
      const gonderildi = await onayaGonder(db, hazirlayan, taslak.id, kaydedildi.surum);
      await onayla(db, onaylayan, taslak.id, gonderildi.surum, true);
    }
  },
});
