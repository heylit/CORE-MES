import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, eskiSurum } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { GecmisGirisGirdisi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { hurdaNedeniGetir } from '../durus-nedenleri/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { isEmirleriDegistiBildir } from './emir-olaylari.ts';
import {
  gecmisAdetIhlali, gecmisEmirIhlali, gecmisGeriAlIhlali, gecmisSiraIhlali, gecmisTarihIhlali, gecmisZamanlari, type GecmisAdimDurumu, type GecmisEmir,
} from './gecmis-giris-kurallar.ts';
import { siradakiIstasyonuYaz } from './is-emri-servis.ts';
import { EMIR_YOK, fasonMu, hurdaNedeniIhlali } from './kurallar.ts';
import { hurdaSayimiBildir, saglamSayimiBildir } from './sayim-olayi.ts';
import * as s from './sorgular.ts';
import type { IsEmriSatiri, UstEmirSatiri } from './sorgular.ts';
import * as g from './sorgular/gecmis-giris/sorgular.ts';

// 3455-1: geçmişte yapılmış adım, tarih ve adetle. Terminal çalışması yazılmaz (kullanım, katılım, başlatma kaydı yok): süre ve OEE
// görmez. Sayım 'gecmis' kaynağıyla yazılır, adet akışı (sonraki adıma giren) olağan sürer. Stok hareketi yalnız kişi seçerse (3455-S1 c).
// Adım bitti olayı verilmez (rota gerçekleşen süreyi ölçerdi); plan "iş emirleri değişti" ile haber alır.

async function kilitliEmir(db: Db, id: number): Promise<UstEmirSatiri> {
  const e = await s.ustEmirBul(db, id, true);
  if (e === null || e.malzemeNo === null) throw bulunamadi(EMIR_YOK);
  return e;
}

async function emirDurumu(db: Db, e: UstEmirSatiri): Promise<{ emir: GecmisEmir; adimlar: IsEmriSatiri[]; durumlar: GecmisAdimDurumu[] }> {
  const adimlar = (await s.isEmirleriGetir(db, [e.id])).sort((a, b) => a.sira - b.sira);
  const acikKolVar = (await s.altPartilerGetir(db, [e.id])).some((k) => k.ustEmirId === e.id && k.durum !== 'iptal');
  return {
    emir: { durum: e.durum, arsiv: e.arsiv, ustEmirId: e.ustEmirId, acikKolVar },
    adimlar,
    durumlar: adimlar.map((a) => ({
      opNo: a.opNo, sira: a.sira, durum: a.durum, fason: fasonMu(a), istasyonId: a.istasyonId, dalli: a.onculler !== null,
    })),
  };
}

export async function gecmisGir(db: Db, kullanici: Kullanici, id: number, girdi: GecmisGirisGirdisi): Promise<{ uyari: string | null }> {
  const e = await kilitliEmir(db, id);
  if (e.surum !== girdi.surum) throw eskiSurum();
  const { emir, adimlar, durumlar } = await emirDurumu(db, e);
  const ihlal = gecmisEmirIhlali(emir, durumlar) ?? gecmisSiraIhlali(durumlar, girdi.adimlar.map((a) => a.opNo));
  if (ihlal !== null) throw cakisma(ihlal);
  const simdi = Date.parse(await s.anAl(db));
  const bugun = tesisGunu(simdi);
  const genelIhlal = gecmisTarihIhlali(bugun, girdi.baslama, girdi.bitis);
  if (genelIhlal !== null) throw dogrulama(genelIhlal, 'baslama');
  const opSirasi = new Map(adimlar.map((a) => [a.opNo, a]));
  // Gövde adımın sırasına dizilir: kural ardışıklığı zaten denetledi.
  const girilen = [...girdi.adimlar].sort((a, b) => (opSirasi.get(a.opNo)?.sira ?? 0) - (opSirasi.get(b.opNo)?.sira ?? 0));
  for (const [i, a] of girilen.entries()) {
    const t = gecmisTarihIhlali(bugun, a.baslama, a.bitis);
    if (t !== null) throw dogrulama(t, `adimlar.${String(i)}.baslama`);
  }
  const ilk = opSirasi.get(girilen[0]?.opNo ?? -1);
  const oncekiTamam = ilk === undefined ? undefined : adimlar.filter((a) => a.sira < ilk.sira).at(-1);
  const adet = gecmisAdetIhlali(oncekiTamam?.saglamAdet ?? null, girilen);
  if (adet !== null) throw dogrulama(adet.ileti, `adimlar.${String(adet.sira)}.saglam`);
  for (const [i, a] of girilen.entries()) {
    if (a.hurdaNedeniId === null) continue;
    const n = hurdaNedeniIhlali(await hurdaNedeniGetir(db, a.hurdaNedeniId));
    if (n !== null) throw dogrulama(n, `adimlar.${String(i)}.hurdaNedeniId`);
  }
  const operatorler = [...new Set(girilen.flatMap((a) => (a.operatorId === null ? [] : [a.operatorId])))];
  const bilinen = await kisiAdlari(db, operatorler);
  const yok = girilen.findIndex((a) => a.operatorId !== null && !bilinen.has(a.operatorId));
  if (yok >= 0) throw dogrulama('Operatör bulunamadı.', `adimlar.${String(yok)}.operatorId`);

  const uyarilar: string[] = [];
  for (const a of girilen) {
    const adim = opSirasi.get(a.opNo);
    if (adim === undefined || adim.istasyonId === null) throw cakisma('Adım bulunamadı.');
    const z = gecmisZamanlari({ baslama: girdi.baslama, bitis: girdi.bitis }, a, simdi);
    if ((await g.adimiGecmisleBitir(db, adim.id, a.saglam, z.baslama, z.bitis)) === 0) throw eskiSurum();
    await g.girisEkle(db, {
      uretimEmriId: id, isEmriId: adim.id, baslama: a.baslama, bitis: a.bitis, saglamAdet: a.saglam, hurdaAdet: a.hurda,
      hurdaNedeniId: a.hurdaNedeniId, operatorId: a.operatorId, girenId: kullanici.id, stokYazildi: girdi.stokaYaz, geriAlinanId: null,
    });
    const kisiId = a.operatorId ?? kullanici.id;
    const ortak = { emirId: id, isEmriId: adim.id, kisiId, istasyonId: adim.istasyonId };
    if (a.saglam > 0) await g.gecmisSayimEkle(db, { ...ortak, tur: 'saglam', adet: a.saglam, hurdaNedeniId: null });
    if (a.hurda > 0) await g.gecmisSayimEkle(db, { ...ortak, tur: 'hurda', adet: a.hurda, hurdaNedeniId: a.hurdaNedeniId });
    if (!girdi.stokaYaz) continue;
    const olay = { uretimEmriId: id, isEmriId: adim.id, istasyonId: adim.istasyonId, kisiId, refakatPartisiId: null };
    const u1 = await saglamSayimiBildir(db, { ...olay, fark: a.saglam });
    const u2 = a.hurdaNedeniId === null ? null : await hurdaSayimiBildir(db, { ...olay, hurdaNedeniId: a.hurdaNedeniId, fark: a.hurda });
    for (const u of [u1, u2]) if (u !== null) uyarilar.push(u);
  }
  await bitir(db, id, kullanici.id);
  return { uyari: uyarilar.length === 0 ? null : uyarilar.join(' ') };
}

// Son girilen adımın girişi tersine yazılır: eksi sayım, stok yazılmışsa ters hareket, adım yeniden bekler. Defter silinmez.
export async function gecmisGeriAl(db: Db, kullanici: Kullanici, id: number, surum: number): Promise<{ uyari: string | null }> {
  const e = await kilitliEmir(db, id);
  if (e.surum !== surum) throw eskiSurum();
  const { emir, adimlar } = await emirDurumu(db, e);
  const girisler = await g.etkinGirisler(db, [id]);
  const son = girisler.at(-1);
  const adim = son === undefined ? undefined : adimlar.find((a) => a.id === son.isEmriId);
  const sonrakiler = adim === undefined ? [] : adimlar.filter((a) => a.sira > adim.sira);
  const sayimli = await g.sayimliAdimlar(db, sonrakiler.map((a) => a.id));
  const ihlal = gecmisGeriAlIhlali(emir, son !== undefined && adim !== undefined, sonrakiler.map((a) => ({ durum: a.durum, sayimVar: sayimli.has(a.id) })));
  if (ihlal !== null) throw cakisma(ihlal);
  if (son === undefined || adim === undefined || adim.istasyonId === null) throw cakisma('Adım bulunamadı.');
  await g.girisEkle(db, {
    uretimEmriId: id, isEmriId: adim.id, baslama: son.baslama, bitis: son.bitis, saglamAdet: son.saglamAdet, hurdaAdet: son.hurdaAdet,
    hurdaNedeniId: son.hurdaNedeniId, operatorId: son.operatorId, girenId: kullanici.id, stokYazildi: son.stokYazildi, geriAlinanId: son.id,
  });
  const kisiId = son.operatorId ?? son.girenId;
  const ortak = { emirId: id, isEmriId: adim.id, kisiId, istasyonId: adim.istasyonId };
  if (son.saglamAdet > 0) await g.gecmisSayimEkle(db, { ...ortak, tur: 'saglam', adet: -son.saglamAdet, hurdaNedeniId: null });
  if (son.hurdaAdet > 0) await g.gecmisSayimEkle(db, { ...ortak, tur: 'hurda', adet: -son.hurdaAdet, hurdaNedeniId: son.hurdaNedeniId });
  const uyarilar: string[] = [];
  if (son.stokYazildi) {
    const olay = { uretimEmriId: id, isEmriId: adim.id, istasyonId: adim.istasyonId, kisiId, refakatPartisiId: null };
    const u1 = await saglamSayimiBildir(db, { ...olay, fark: -son.saglamAdet });
    const u2 = son.hurdaNedeniId === null ? null : await hurdaSayimiBildir(db, { ...olay, hurdaNedeniId: son.hurdaNedeniId, fark: -son.hurdaAdet });
    for (const u of [u1, u2]) if (u !== null) uyarilar.push(u);
  }
  if ((await g.adimiBekleyeneDondur(db, adim.id)) === 0) throw eskiSurum();
  await bitir(db, id, kullanici.id);
  return { uyari: uyarilar.length === 0 ? null : uyarilar.join(' ') };
}

async function bitir(db: Db, id: number, kisiId: number): Promise<void> {
  await siradakiIstasyonuYaz(db, id);
  await g.emirSurumunuArtir(db, id);
  await isEmirleriDegistiBildir(db, { uretimEmriId: id, kisiId });
}
