import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, yetkiYok } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { BildirimTuru } from '#paylasilan/sozlesme/bildirim.ts';
import type { TakvimKaydi } from '#paylasilan/sozlesme/takvim.ts';
import { TOPLANTI_DURUM_ADLARI } from '#paylasilan/sozlesme/toplantilar.ts';
import type {
  AksiyonDurumu, KonuTuru, Toplanti, ToplantiAcVerisi, ToplantiDegistirVerisi, ToplantiKapsami, ToplantiKonusu, ToplantiListesiCevabi,
} from '#paylasilan/sozlesme/toplantilar.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { bildirimGonder, epostaGiderMi } from '../bildirim/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { firmaAra, firmaOzeti } from '../musteri-tedarikci/disari.ts';
import { projeGetir, projeSecenekleri, toplantiAksiyonGorevleri, toplantiAksiyonundanGorevAc } from '../projeler/disari.ts';
import { acikEmirler, uretimEmriOzeti } from '../uretim-emirleri/disari.ts';
import {
  BASLAMADI, IPTAL_EDILDI, PLANLANMADI, PROJESIZ, TEK_GUN, baslamisMi, degisiklikOzeti, goreveCevirmeReddi, goruntulerMi, gorevTarihleri,
  katilimciFarki, konuSutunlari, konuTuru, planlandiMi, tekGunMu, zamanAraligi,
} from './kurallar.ts';
import * as s from './sorgular.ts';
import type { ToplantiSatiri } from './sorgular.ts';

const TOPLANTI_YOK = 'Toplantı bulunamadı.';
const AKSIYON_YOK = 'Aksiyon bulunamadı.';
const KISITLAR = {
  toplantilar_toplanti_proje: { ileti: 'Proje bulunamadı.', alan: 'konu' },
  toplantilar_toplanti_uretim_emri: { ileti: 'Üretim emri bulunamadı.', alan: 'konu' },
  toplantilar_toplanti_firma: { ileti: 'Firma bulunamadı.', alan: 'konu' },
  toplantilar_toplanti_sure: { ileti: 'Toplantı en çok 24 saat sürer.', alan: 'bitis' },
  toplantilar_katilimci_kisi: { ileti: 'Katılımcı bulunamadı.', alan: 'katilimcilar' },
  toplantilar_aksiyon_sorumlu: { ileti: 'Sorumlu kişi bulunamadı.', alan: 'sorumluKisiId' },
};

const butunuGorurMu = (k: Kullanici): boolean => k.islemler.includes('toplantilar.oku');
const yazarMi = (k: Kullanici): boolean => k.islemler.includes('toplantilar.yaz');

// TOP-6: düzenleyen, katılımcı ya da `toplantilar.oku` görür; başkası 403 alır (uç 'oturum', sahiplik 'kendi').
async function gorunurToplanti(db: Db, k: Kullanici, id: number): Promise<ToplantiSatiri> {
  const t = await s.toplantiGetir(db, id);
  if (t === null) throw bulunamadi(TOPLANTI_YOK);
  if (!goruntulerMi(k, t.duzenleyenKisiId, await s.katiliyorMu(db, id, k.id))) throw yetkiYok();
  return t;
}

// Yazmadan sonra son hali: yetki yazmadan önce denetlendi (kendini katılımcılıktan çıkaran düzenleyici geri alınmaz).
async function yeniden(db: Db, id: number): Promise<ToplantiSatiri> {
  const t = await s.toplantiKilitle(db, id);
  if (t === null) throw bulunamadi(TOPLANTI_YOK);
  return t;
}

// TOP-6 yazmada da geçer: `toplantilar.yaz` görmediği toplantıya yazamaz (yoksa cevaptaki ayrıntı okumayı deler).
async function kilitli(db: Db, k: Kullanici, id: number): Promise<ToplantiSatiri> {
  const t = await s.toplantiKilitle(db, id);
  if (t === null) throw bulunamadi(TOPLANTI_YOK);
  if (!goruntulerMi(k, t.duzenleyenKisiId, await s.katiliyorMu(db, id, k.id))) throw yetkiYok();
  return t;
}

async function konuOku(db: Db, t: Pick<ToplantiSatiri, 'projeId' | 'uretimEmriId' | 'firmaId'>): Promise<ToplantiKonusu | null> {
  if (t.projeId !== null) {
    const p = await projeGetir(db, t.projeId);
    return p === null ? null : { tur: 'proje', id: p.id, no: p.kod, ad: p.ad, durum: p.durum, tarih: null };
  }
  if (t.uretimEmriId !== null) {
    const e = await uretimEmriOzeti(db, t.uretimEmriId);
    return e === null ? null : { tur: 'uretim-emri', id: e.id, no: e.emirNo, ad: null, durum: e.durum, tarih: e.teslim };
  }
  if (t.firmaId !== null) {
    const f = await firmaOzeti(db, t.firmaId);
    return f === null ? null : { tur: 'firma', id: f.id, no: f.kod, ad: f.ad, durum: f.aktif ? 'aktif' : 'pasif', tarih: null };
  }
  return null;
}

export async function toplantiListesi(db: Db, k: Kullanici, kapsam: ToplantiKapsami): Promise<ToplantiListesiCevabi> {
  const satirlar = await s.toplantiListesi(db, { kisiId: butunuGorurMu(k) ? null : k.id, gecmis: kapsam === 'gecmis' });
  const adlar = await kisiAdlari(db, satirlar.map((r) => r.duzenleyenKisiId));
  return {
    toplantilar: satirlar.map((r) => ({
      id: r.id, baslik: r.baslik, tur: r.tur, baslangic: r.baslangic, bitis: r.bitis, yer: r.yer, durum: r.durum,
      duzenleyen: { id: r.duzenleyenKisiId, ad: adlar.get(r.duzenleyenKisiId) ?? '' },
      konuTuru: konuTuru(r), katilimciSayisi: r.katilimciSayisi, acikAksiyon: r.acikAksiyon,
    })),
    izinler: { yaz: yazarMi(k), eposta: yazarMi(k) && await epostaGiderMi(db, 'toplantilar.davet') },
  };
}

async function ayrintiKur(db: Db, k: Kullanici, t: ToplantiSatiri): Promise<Toplanti> {
  const [katilanlar, maddeler, kararlar, aksiyonlar, konu] = [
    await s.katilimcilar(db, t.id), await s.gundem(db, t.id), await s.kararlar(db, t.id), await s.aksiyonlar(db, t.id), await konuOku(db, t),
  ];
  const adlar = await kisiAdlari(db, [
    t.duzenleyenKisiId, ...katilanlar.map((x) => x.kisiId), ...kararlar.map((x) => x.yazanKisiId), ...aksiyonlar.map((x) => x.sorumluKisiId),
  ]);
  const ad = (id: number): string => adlar.get(id) ?? '';
  const gorevler = t.projeId === null ? new Map<number, { id: number; durum: string }>() : await toplantiAksiyonGorevleri(db, aksiyonlar.map((a) => a.id));
  return {
    id: t.id, baslik: t.baslik, tur: t.tur, baslangic: t.baslangic, bitis: t.bitis, yer: t.yer, durum: t.durum, iptalNedeni: t.iptalNedeni,
    duzenleyen: { id: t.duzenleyenKisiId, ad: ad(t.duzenleyenKisiId) }, konuTuru: konuTuru(t), konu,
    katilimcilar: katilanlar.map((x) => ({ kisiId: x.kisiId, ad: ad(x.kisiId), zorunlu: x.zorunlu })),
    gundem: maddeler,
    kararlar: kararlar.map((x) => ({ id: x.id, metin: x.metin, yazan: { id: x.yazanKisiId, ad: ad(x.yazanKisiId) }, yazildi: x.yazildi })),
    aksiyonlar: aksiyonlar.map((x) => ({
      id: x.id, metin: x.metin, sorumlu: { id: x.sorumluKisiId, ad: ad(x.sorumluKisiId) }, sonTarih: x.sonTarih, durum: x.durum,
      gorev: gorevler.get(x.id) ?? null, surum: x.surum,
    })),
    izinler: { yaz: yazarMi(k) },
    surum: t.surum,
  };
}

export async function toplantiAyrintisi(db: Db, k: Kullanici, id: number): Promise<Toplanti> {
  return ayrintiKur(db, k, await gorunurToplanti(db, k, id));
}

// --- Bildirim (TOP-10): yapan kendisi almaz; e-posta isteğe bağlıdır ve bildirim modülünün ayarına uyar.

async function bildir(
  db: Db, k: Kullanici, tur: BildirimTuru, t: ToplantiSatiri, kisiler: readonly number[], eposta: boolean, zaman = zamanAraligi(t.baslangic, t.bitis),
): Promise<void> {
  const alicilar = kisiler.filter((x) => x !== k.id);
  if (alicilar.length === 0) return;
  const konu = await konuOku(db, t);
  const duzenleyen = (await kisiAdlari(db, [t.duzenleyenKisiId])).get(t.duzenleyenKisiId) ?? '';
  await bildirimGonder(db, {
    tur, baslik: `${t.baslik} (${zaman})`, yol: `/profil/toplantilarim/${String(t.id)}`, kaynakKimlik: String(t.id), kisiler: alicilar, haric: k.id,
    epostaYok: !eposta,
    eposta: { ...(konu?.no ? { kayitNo: konu.no } : {}), toplanti: { baslik: t.baslik, zamanAraligi: zaman, yer: t.yer, duzenleyen } },
  });
}

function yaziya(g: ToplantiAcVerisi): s.ToplantiYazisi {
  return { baslik: g.baslik, tur: g.tur, baslangic: g.baslangic, bitis: g.bitis, yer: g.yer, ...konuSutunlari(g.konu) };
}

export async function toplantiAc(db: Db, k: Kullanici, g: ToplantiAcVerisi): Promise<Toplanti> {
  if (!tekGunMu(g.baslangic, g.bitis)) throw dogrulama(TEK_GUN, 'bitis');
  const id = await kisitKorumali(KISITLAR, async () => {
    const yeni = await s.toplantiEkle(db, yaziya(g), k.id);
    await s.katilimcilariYaz(db, yeni, g.katilimcilar);
    await s.gundemiYaz(db, yeni, g.gundem);
    return yeni;
  });
  const t = await yeniden(db, id);
  await bildir(db, k, 'toplantilar.davet', t, g.katilimcilar.map((x) => x.kisiId), g.epostaGonder);
  return ayrintiKur(db, k, t);
}

export async function toplantiDegistir(db: Db, k: Kullanici, id: number, g: ToplantiDegistirVerisi): Promise<Toplanti> {
  const eski = await kilitli(db, k, id);
  if (!planlandiMi(eski.durum)) throw cakisma(PLANLANMADI);
  if (!tekGunMu(g.baslangic, g.bitis)) throw dogrulama(TEK_GUN, 'bitis');
  const eskiKatilanlar = (await s.katilimcilar(db, id)).map((x) => x.kisiId);
  await kisitKorumali(KISITLAR, async () => {
    await surumluGuncelle({ guncelle: () => s.toplantiGuncelle(db, id, yaziya(g), g.surum, k.id), varMi: () => s.toplantiVarMi(db, id), bulunamadiIletisi: TOPLANTI_YOK });
    await s.katilimcilariYaz(db, id, g.katilimcilar);
    await s.gundemiYaz(db, id, g.gundem);
  });
  const t = await yeniden(db, id);
  const fark = katilimciFarki(eskiKatilanlar, g.katilimcilar.map((x) => x.kisiId));
  const ozet = degisiklikOzeti(eski, t);
  await bildir(db, k, 'toplantilar.davet', t, fark.eklenen, g.epostaGonder);
  if (ozet.degisenler.length > 0) await bildir(db, k, 'toplantilar.degisti', t, fark.kalan, g.epostaGonder, ozet.zaman);
  await bildir(db, k, 'toplantilar.iptal', t, fark.cikan, g.epostaGonder);
  return ayrintiKur(db, k, t);
}

export async function toplantiIptalEt(db: Db, k: Kullanici, id: number, g: { neden: string; surum: number }): Promise<Toplanti> {
  const eski = await kilitli(db, k, id);
  if (!planlandiMi(eski.durum)) throw cakisma(PLANLANMADI);
  await surumluGuncelle({ guncelle: () => s.toplantiIptal(db, id, g.neden, g.surum, k.id), varMi: () => s.toplantiVarMi(db, id), bulunamadiIletisi: TOPLANTI_YOK });
  const t = await yeniden(db, id);
  await bildir(db, k, 'toplantilar.iptal', t, (await s.katilimcilar(db, id)).map((x) => x.kisiId), true);
  return ayrintiKur(db, k, t);
}

export async function toplantiYapildiIsaretle(db: Db, k: Kullanici, id: number, g: { surum: number }): Promise<Toplanti> {
  const eski = await kilitli(db, k, id);
  if (!planlandiMi(eski.durum)) throw cakisma(PLANLANMADI);
  if (!baslamisMi(eski.baslangic, await s.simdi(db))) throw dogrulama(BASLAMADI);
  await surumluGuncelle({ guncelle: () => s.toplantiYapildi(db, id, g.surum, k.id), varMi: () => s.toplantiVarMi(db, id), bulunamadiIletisi: TOPLANTI_YOK });
  return ayrintiKur(db, k, await yeniden(db, id));
}

async function yazilabilir(db: Db, k: Kullanici, id: number): Promise<ToplantiSatiri> {
  const t = await kilitli(db, k, id);
  if (t.durum === 'iptal') throw cakisma(IPTAL_EDILDI);
  return t;
}

export async function kararYaz(db: Db, k: Kullanici, id: number, metin: string): Promise<Toplanti> {
  const t = await yazilabilir(db, k, id);
  await s.kararEkle(db, id, metin, k.id);
  return ayrintiKur(db, k, t);
}

export async function aksiyonYaz(db: Db, k: Kullanici, id: number, g: { metin: string; sorumluKisiId: number; sonTarih: string }): Promise<Toplanti> {
  const t = await yazilabilir(db, k, id);
  await kisitKorumali(KISITLAR, () => s.aksiyonEkle(db, id, g, k.id));
  return ayrintiKur(db, k, t);
}

async function aksiyonKilitli(db: Db, toplantiId: number, aksiyonId: number): Promise<s.AksiyonSatiri> {
  const a = await s.aksiyonKilitle(db, toplantiId, aksiyonId);
  if (a === null) throw bulunamadi(AKSIYON_YOK);
  return a;
}

export async function aksiyonDurumuYaz(db: Db, k: Kullanici, id: number, aksiyonId: number, g: { durum: AksiyonDurumu; surum: number }): Promise<Toplanti> {
  const t = await kilitli(db, k, id);
  await aksiyonKilitli(db, id, aksiyonId);
  await surumluGuncelle({
    guncelle: () => s.aksiyonDurumYaz(db, aksiyonId, g.durum, g.surum),
    varMi: async () => (await s.aksiyonKilitle(db, id, aksiyonId)) !== null, bulunamadiIletisi: AKSIYON_YOK,
  });
  return ayrintiKur(db, k, t);
}

// TOP-5, TOP-11: görev projenin görevidir; sorumlusu ve son tarihi aksiyondan gelir.
export async function aksiyonuGorevYap(db: Db, k: Kullanici, id: number, aksiyonId: number, g: { surum: number }): Promise<Toplanti> {
  const t = await yazilabilir(db, k, id);
  const a = await aksiyonKilitli(db, id, aksiyonId);
  const gorevVar = t.projeId !== null && (await toplantiAksiyonGorevleri(db, [aksiyonId])).has(aksiyonId);
  const ret = goreveCevirmeReddi({ projeId: t.projeId, aksiyonDurumu: a.durum, gorevVar });
  if (ret !== null || t.projeId === null) throw cakisma(ret ?? PROJESIZ);
  await surumluGuncelle({
    guncelle: () => s.aksiyonSurumArtir(db, aksiyonId, g.surum),
    varMi: async () => (await s.aksiyonKilitle(db, id, aksiyonId)) !== null, bulunamadiIletisi: AKSIYON_YOK,
  });
  const bugun = tesisGunu(Date.parse(await s.simdi(db)));
  await toplantiAksiyonundanGorevAc(db, k.id, {
    projeId: t.projeId, aksiyonId, ad: a.metin, sorumluKisiId: a.sorumluKisiId, ...gorevTarihleri(bugun, a.sonTarih),
  });
  return ayrintiKur(db, k, t);
}

// Konu seçici: yalnız açık kayıtlar (aktif proje, açık emir, aktif firma); en çok 20 sonuç.
const KONU_SINIRI = 20;
const iceriyor = (metin: string | null, q: string): boolean => q === '' || (metin ?? '').toLocaleLowerCase('tr').includes(q);
export async function konuAra(db: Db, tur: Exclude<KonuTuru, 'serbest'>, q: string): Promise<{
  sonuclar: { id: number; kod: string; ad: string; aktif: boolean; ust: null }[]; dahaVar: boolean;
}> {
  const aranan = q.toLocaleLowerCase('tr');
  let hepsi: { id: number; kod: string; ad: string; aktif: boolean; ust: null }[];
  if (tur === 'proje') {
    hepsi = (await projeSecenekleri(db)).filter((p) => iceriyor(p.kod, aranan) || iceriyor(p.ad, aranan))
      .map((p) => ({ id: p.id, kod: p.kod, ad: p.ad, aktif: true, ust: null }));
  } else if (tur === 'uretim-emri') {
    hepsi = (await acikEmirler(db)).filter((e) => iceriyor(e.emirNo, aranan))
      .map((e) => ({ id: e.id, kod: e.emirNo, ad: e.emirNo, aktif: true, ust: null }));
  } else {
    hepsi = (await firmaAra(db, { metin: q, sinir: KONU_SINIRI + 1 })).map((f) => ({ id: f.id, kod: f.kod ?? '', ad: f.ad, aktif: true, ust: null }));
  }
  return { sonuclar: hepsi.slice(0, KONU_SINIRI), dahaVar: hepsi.length > KONU_SINIRI };
}

// Takvim kaynağı: tarih toplantının günü, no saat aralığı, ilgili yer. Geçmiş günde "Yapıldı" işaretlenmemiş toplantı gecikmiş görünür.
export async function takvimKayitlari(db: Db, baslangic: string, bitis: string, k: Kullanici): Promise<TakvimKaydi[]> {
  const satirlar = await s.aralikToplantilari(db, baslangic, bitis, butunuGorurMu(k) ? null : k.id);
  return satirlar.map((t) => ({
    kaynak: 'toplanti', kimlik: String(t.id), tarih: tesisGunu(Date.parse(t.baslangic)), no: zamanAraligi(t.baslangic, t.bitis).slice(11),
    baslik: t.baslik, ilgili: t.yer, durum: TOPLANTI_DURUM_ADLARI[t.durum], bitti: t.durum !== 'planlandi',
  }));
}
