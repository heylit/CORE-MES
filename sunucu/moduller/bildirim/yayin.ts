import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, yetkiYok } from '#cekirdek/hata.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import type { DenetimSecimi, IkiliCevap } from '#cekirdek/uc.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import {
  YAYIN_GORSEL_EN_COK_BAYT, YAYIN_GORSEL_TURLERI, type BildirimOnayCevabi, type BildirimYayinAlicilariCevabi, type BildirimYayinHedefleriCevabi,
  type BildirimYayini, type BildirimYayinlaGirdisi, type OrtadakiBildirimlerCevabi, type YayinHedefTuru, type YayinSimgesi, type YayinTuru,
} from '#paylasilan/sozlesme/bildirim.ts';
import { denetimSatiri, medyaTutamagi } from '../dosya/disari.ts';
import { kisiAdlari, kisilerinIslemleri, kisiSecenekleri, rollerdekiKisiler, rolSecenekleri } from '../kisiler/disari.ts';
import {
  ONAY_ILETILERI, YAYIN_ONEMI, YAYIN_SATIR_TURU, hemenMi, olmayanKimlikler, yayinAlicilari, yayinKaydi, yayiniGorurMu, yayinZamaniHatasi,
} from './kurallar.ts';
import * as s from './sorgular.ts';

type DenetimEki = (satirlar: readonly DenetimSecimi[]) => void;

// Elle bildirim (2147). Görsel dosya modülünün yerel deposundadır (bağ kaydı `yayin:<id>`); dış servis yoktur.
const gorselDeposu = medyaTutamagi('bildirim');

// İstasyon hedefi (ters bağ, ADR 0006): istasyonlar modülü bu modülü ithal ettiği için tersi döngü olurdu; etkin istasyonları ve o
// günkü atamalarını kablolama verir. Bağ kurulmamışsa istasyon hedefi açık hatayla reddedilir, sessizce boş gitmez.
export interface YayinIstasyonu { id: number; ad: string; kisiIdleri: number[] }
export type IstasyonCozucusu = (db: Db) => Promise<YayinIstasyonu[]>;
let istasyonCozucusu: IstasyonCozucusu | null = null;
export const istasyonCozucusuKaydet = (c: IstasyonCozucusu | null): void => { istasyonCozucusu = c; };
function istasyonlar(db: Db): Promise<YayinIstasyonu[]> {
  if (istasyonCozucusu === null) throw new Error('Bildirim istasyon çözücüsü bağlanmamış (kablolama).');
  return istasyonCozucusu(db);
}

async function girisliKisiler(db: Db): Promise<Set<number>> {
  return new Set((await kisilerinIslemleri(db)).keys());
}

async function hedefAdaylari(db: Db, tur: YayinHedefTuru, idler: readonly number[]): Promise<number[]> {
  switch (tur) {
    case 'herkes': return [...await girisliKisiler(db)];
    case 'rol': return rollerdekiKisiler(db, idler);
    case 'kisi': return [...idler];
    case 'istasyon': {
      const secili = new Set(idler);
      return (await istasyonlar(db)).filter((i) => secili.has(i.id)).flatMap((i) => i.kisiIdleri);
    }
  }
}

// Seçilen hedef var olmalı: olmayan rol, istasyon ya da kişi sessizce düşürülmez (BIL-8 gibi).
async function hedefleriSina(db: Db, tur: YayinHedefTuru, idler: readonly number[]): Promise<void> {
  if (tur === 'herkes') return;
  const varOlan = tur === 'rol' ? (await rolSecenekleri(db)).map((r) => r.id)
    : tur === 'istasyon' ? (await istasyonlar(db)).map((i) => i.id)
    : (await secilebilirKisiler(db)).map((k) => k.id);
  const olmayan = olmayanKimlikler(idler, varOlan);
  const ad = { rol: 'Rol', istasyon: 'İstasyon', kisi: 'Kişi bulunamadı ya da girişi yok' }[tur];
  if (olmayan.length > 0) throw dogrulama(tur === 'kisi' ? `${ad}: ${olmayan.join(', ')}` : `${ad} bulunamadı: ${olmayan.join(', ')}`, 'hedef');
}

async function secilebilirKisiler(db: Db): Promise<{ id: number; ad: string }[]> {
  const girisli = await girisliKisiler(db);
  return (await kisiSecenekleri(db)).filter((k) => girisli.has(k.id)).map(({ id, ad }) => ({ id, ad }));
}

// Alıcılar o anda çözülür ve her birine satır yazılır; sonradan role ya da istasyona giren görmez. Bir kez dağıtılır.
export async function yayiniDagit(db: Db, yayinId: number): Promise<number> {
  if (!(await s.dagitimaKilitle(db, yayinId))) return 0;
  const y = await s.yayinBul(db, yayinId);
  if (y === null) return 0;
  const alicilar = (y.bitis !== null && Date.parse(y.bitis) <= Date.parse(await s.simdi(db))) ? []
    : yayinAlicilari(await hedefAdaylari(db, y.hedefTuru as YayinHedefTuru, y.hedefIdleri), await girisliKisiler(db), y.yazanKisiId);
  await s.yayinAlicilariYaz(db, {
    id: y.id, onem: YAYIN_ONEMI[y.tur as YayinTuru], baslik: y.baslik, metin: y.metin, ortada: y.ortada, onayIstenir: y.onayIstenir,
  }, YAYIN_SATIR_TURU, alicilar);
  return alicilar.length;
}

export async function zamaniGelenleriDagit(db: Db, sinir = 50): Promise<number> {
  let toplam = 0;
  for (const id of await s.zamaniGelenYayinlar(db, sinir)) toplam += await yayiniDagit(db, id);
  return toplam;
}

async function yayinCevabi(db: Db, y: s.YayinSatiri): Promise<BildirimYayini> {
  const kisiler = [y.yazanKisiId, ...(y.geriCekenKisiId === null ? [] : [y.geriCekenKisiId])];
  const adlar = await kisiAdlari(db, y.hedefTuru === 'kisi' ? [...kisiler, ...y.hedefIdleri] : kisiler);
  const hedefAdlari = y.hedefTuru === 'rol'
    ? new Map((await rolSecenekleri(db)).map((r) => [r.id, r.ad]))
    : y.hedefTuru === 'istasyon' ? new Map((istasyonCozucusu === null ? [] : await istasyonlar(db)).map((i) => [i.id, i.ad])) : adlar;
  return {
    id: y.id, tur: y.tur as YayinTuru, simge: y.simge as YayinSimgesi, baslik: y.baslik, metin: y.metin, gorselVar: y.gorselOzet !== null,
    yazan: { id: y.yazanKisiId, ad: adlar.get(y.yazanKisiId) ?? null },
    hedef: { tur: y.hedefTuru as YayinHedefTuru, idler: y.hedefIdleri, adlar: y.hedefIdleri.map((i) => hedefAdlari.get(i) ?? `#${i}`) },
    ortada: y.ortada, onayIstenir: y.onayIstenir, yayinZamani: y.yayinZamani, bitis: y.bitis, dagitildi: y.dagitildi,
    aliciSayisi: y.aliciSayisi, okuyanSayisi: y.okuyanSayisi, onaylayanSayisi: y.onaylayanSayisi, olusturuldu: y.olusturuldu,
    geriCekildi: y.geriCekildi, geriCeken: y.geriCekenKisiId === null ? null : { id: y.geriCekenKisiId, ad: adlar.get(y.geriCekenKisiId) ?? null },
  };
}

export async function yayinla(db: Db, kullanici: Kullanici, g: BildirimYayinlaGirdisi, denetimEki: DenetimEki): Promise<BildirimYayini> {
  const zamanHatasi = yayinZamaniHatasi(Date.parse(await s.simdi(db)), g.yayinZamani, g.bitis);
  if (zamanHatasi !== null) throw dogrulama(zamanHatasi.mesaj, zamanHatasi.alan);
  await hedefleriSina(db, g.hedef.tur, g.hedef.idler);
  const id = await s.yayinYaz(db, {
    yazanKisiId: kullanici.id, tur: g.tur, simge: g.simge, baslik: g.baslik, metin: g.metin === '' ? null : g.metin, gorsel: g.gorsel,
    hedefTuru: g.hedef.tur, hedefIdleri: g.hedef.idler, ortada: g.ortada, onayIstenir: g.onayIstenir, yayinZamani: g.yayinZamani, bitis: g.bitis,
  });
  if (g.gorsel !== null) {
    const d = await gorselDeposu.dosyaBagla(db, kullanici, { ozet: g.gorsel.ozet, kayit: yayinKaydi(id), ad: g.gorsel.ad, belgeTuru: null }, {
      turler: YAYIN_GORSEL_TURLERI, azamiBayt: YAYIN_GORSEL_EN_COK_BAYT,
    });
    denetimEki([denetimSatiri('bagla', d)]);
  }
  if (hemenMi(Date.parse(await s.simdi(db)), g.yayinZamani)) await yayiniDagit(db, id);
  const y = await s.yayinBul(db, id);
  if (y === null) throw new Error('Yayın okunamadı.');
  return yayinCevabi(db, y);
}

async function gorulenYayin(db: Db, kullanici: Kullanici, id: number): Promise<s.YayinSatiri> {
  const y = await s.yayinBul(db, id);
  // Göremeyen için yayın yok sayılır: kimlik yoklanamaz.
  if (y === null || !yayiniGorurMu(kullanici, y.yazanKisiId)) throw bulunamadi('Yayın bulunamadı.');
  return y;
}

export async function geriCek(db: Db, kullanici: Kullanici, id: number): Promise<BildirimYayini> {
  const y = await gorulenYayin(db, kullanici, id);
  if (y.yazanKisiId !== kullanici.id) throw yetkiYok(ONAY_ILETILERI.yazanDegil);
  if (!(await s.geriCek(db, id, kullanici.id))) throw cakisma(ONAY_ILETILERI.geriCekilmis);
  const son = await s.yayinBul(db, id);
  if (son === null) throw new Error('Yayın okunamadı.');
  return yayinCevabi(db, son);
}

export function yayinListesi(db: Db, kullanici: Kullanici, sorgu: { sayfa: number; sayfaBoyu?: number | undefined }): Promise<SayfaliListe<BildirimYayini>> {
  const yazan = kullanici.islemler.includes('bildirim.yayin-oku') ? null : kullanici.id;
  return sayfaliListe(sorgu, {
    say: () => s.yayinSayisi(db, yazan),
    satirlar: async (dilim) => {
      const cevap: BildirimYayini[] = [];
      for (const y of await s.yayinlar(db, yazan, dilim)) cevap.push(await yayinCevabi(db, y));
      return cevap;
    },
  });
}

export async function yayinAyrintisi(db: Db, kullanici: Kullanici, id: number): Promise<BildirimYayinAlicilariCevabi> {
  await gorulenYayin(db, kullanici, id);
  const satirlar = await s.yayinAlicilari(db, id);
  const adlar = await kisiAdlari(db, satirlar.map((r) => r.kisiId));
  return {
    yayinId: id,
    satirlar: satirlar.map((r) => ({ kisi: { id: r.kisiId, ad: adlar.get(r.kisiId) ?? null }, okundu: r.okundu, onaylandi: r.onaylandi })),
  };
}

// Görseli alıcı, yazan ve rapor işlemi olan görür; başkası için yayın yoktur.
export async function yayinGorseli(db: Db, kullanici: Kullanici, id: number): Promise<IkiliCevap> {
  const y = await s.yayinBul(db, id);
  const gorur = y !== null && (yayiniGorurMu(kullanici, y.yazanKisiId) || await s.yayinAlicisiMi(db, id, kullanici.id));
  if (!gorur || y.gorselOzet === null) throw bulunamadi('Görsel bulunamadı.');
  const akis = await gorselDeposu.dosyaAkisi(db, yayinKaydi(id), y.gorselOzet);
  if (akis === null) throw bulunamadi('Görsel bulunamadı.');
  return akis;
}

export async function hedefSecenekleri(db: Db): Promise<BildirimYayinHedefleriCevabi> {
  const kisiler = await secilebilirKisiler(db);
  return {
    roller: await rolSecenekleri(db),
    istasyonlar: (await istasyonlar(db)).map(({ id, ad }) => ({ id, ad })),
    kisiler,
    herkesSayisi: (await girisliKisiler(db)).size,
  };
}

const ORTADA_EN_COK = 20;

export async function ortadakiBildirimler(db: Db, kullanici: Kullanici): Promise<OrtadakiBildirimlerCevabi> {
  const satirlar = await s.ortadakiler(db, kullanici.id, ORTADA_EN_COK);
  const adlar = await kisiAdlari(db, satirlar.flatMap((r) => (r.yazanKisiId === null ? [] : [r.yazanKisiId])));
  return {
    satirlar: satirlar.map(({ yazanKisiId, yayinTuru, simge, ...r }) => ({
      ...r, yayinTuru: yayinTuru as YayinTuru | null, simge: simge as YayinSimgesi | null,
      gonderen: yazanKisiId === null ? null : adlar.get(yazanKisiId) ?? null,
    })),
  };
}

export async function onayla(db: Db, kullanici: Kullanici, id: number): Promise<BildirimOnayCevabi> {
  const r = await s.onayla(db, kullanici.id, id);
  if (r !== null) return r;
  if (!(await s.kisininSatiriVarMi(db, kullanici.id, id))) throw bulunamadi('Bildirim bulunamadı.');
  throw dogrulama(ONAY_ILETILERI.onayIstemiyor);
}
