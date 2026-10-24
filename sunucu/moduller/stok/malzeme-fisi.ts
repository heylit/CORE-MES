// Malzeme fişi (293 a, 294 c, 295 a, 298 a; kart #492): stok hareketinden doğan, elle düzenlenmeyen belge. Logo'ya gidişi Logo modülündedir;
// stok Logo durumunu çözücüyle okur ve elle gönderim isteğini yazar.
import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma } from '#cekirdek/hata.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import type {
  LogoFisBilgisi, MalzemeFisiAyrintiCevabi, MalzemeFisiGonderGovdesi, MalzemeFisiOzeti, MalzemeFisiSatiri, MalzemeFisiTuru, MalzemeFisleriListesi,
} from '#paylasilan/sozlesme/stok.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { malzemeOzetleri } from '../malzemeler/disari.ts';
import { emirHurdalari, emirNolari } from '../uretim-emirleri/disari.ts';
import { binde, bindenMetin, fisNoKimligi, malzemeFisiGonderilebilir, malzemeFisiNo } from './kurallar.ts';
import * as sorgular from './sorgular.ts';
import type { MalzemeFisiHam } from './sorgular.ts';

// Mamul hurdası üretimden giriş fişinde ayrı satırdır (233'teki gibi; 294 c V2).
export const HURDA_SATIRI = 'Hurda';
// Logo durumuyla süzmede bakılan en yeni fiş sayısı: durum Logo modülündedir, sayfalama bu adaylar içinde yapılır.
const LOGO_SUZGEC_ADAYI = 2000;

// Logo modülü verir (bağ `sunucu/kablolama.ts`). Kayıt yokken her fişin Logo durumu "bilinmiyor"dur ve fiş gönderilemez.
export interface LogoDurumuSorusu {
  id: number; tur: MalzemeFisiTuru; uretimEmriId: number | null; degisiklik: number; gonderimIstegi: string | null; satirVar: boolean;
}
export type MalzemeFisiLogoCozucusu = (db: Db, fisler: readonly LogoDurumuSorusu[]) => Promise<Map<number, LogoFisBilgisi>>;
let logoDurumu: MalzemeFisiLogoCozucusu | null = null;
export function malzemeFisiLogoCozucusuKaydet(cozucu: MalzemeFisiLogoCozucusu): void { logoDurumu = cozucu; }

const BILINMIYOR: LogoFisBilgisi = {
  durum: 'bilinmiyor', gonderimSekli: null, neden: 'Logo bağlantısı bu sunucuda kurulu değil.', kayitNo: null, sonDeneme: null, sonrakiDeneme: null,
  denemeSayisi: 0, ardisikHata: 0,
};

export interface FisSatiri { malzemeId: number; stokKodu: string | null; malzemeAd: string | null; birim: string | null; miktar: string; aciklama: string | null; kaynakAmbarNo: number | null; hedefAmbarNo: number | null }

// Fişlerin net satırları; üretimden girişe emrin mamul hurdası eklenir. Kartı bulunamayan satır kodsuz kalır (Logo onu reddeder, düşmez).
export async function fisSatirlariOku(db: Db, fisler: readonly MalzemeFisiHam[]): Promise<Map<number, FisSatiri[]>> {
  const sonuc = new Map(fisler.map((f) => [f.id, [] as FisSatiri[]]));
  if (fisler.length === 0) return sonuc;
  const ham = await sorgular.malzemeFisiSatirlari(db, fisler.map((f) => f.id));
  const girisler = fisler.filter((f) => f.tur === 'uretim_girisi' && f.uretimEmriId !== null);
  const hurdalar = (await emirHurdalari(db, girisler.map((f) => f.uretimEmriId!))).filter((h) => h.hurdaAdet !== 0);
  const kartlar = await malzemeOzetleri(db, [...ham.map((x) => x.malzemeId), ...hurdalar.map((h) => h.malzemeId)]);
  for (const x of ham) {
    const k = kartlar.get(x.malzemeId);
    sonuc.get(x.fisId)?.push({
      malzemeId: x.malzemeId, stokKodu: k?.kod ?? null, malzemeAd: k?.ad ?? null, birim: k?.birim ?? null, miktar: bindenMetin(binde(x.miktar)), aciklama: null,
      kaynakAmbarNo: x.kaynakAmbarNo, hedefAmbarNo: x.hedefAmbarNo,
    });
  }
  for (const f of girisler) {
    for (const h of hurdalar.filter((x) => x.uretimEmriId === f.uretimEmriId)) {
      sonuc.get(f.id)?.push({
        malzemeId: h.malzemeId, stokKodu: h.stokKodu, malzemeAd: kartlar.get(h.malzemeId)?.ad ?? null, birim: h.birim, miktar: String(h.hurdaAdet), aciklama: HURDA_SATIRI,
        kaynakAmbarNo: null, hedefAmbarNo: null,
      });
    }
  }
  return sonuc;
}

async function logoDurumlari(db: Db, fisler: readonly MalzemeFisiHam[], satirlar: Map<number, FisSatiri[]>): Promise<Map<number, LogoFisBilgisi>> {
  if (logoDurumu === null || fisler.length === 0) return new Map();
  return logoDurumu(db, fisler.map((f) => ({
    id: f.id, tur: f.tur, uretimEmriId: f.uretimEmriId, degisiklik: f.degisiklik, gonderimIstegi: f.gonderimIstegi, satirVar: (satirlar.get(f.id)?.length ?? 0) > 0,
  })));
}

async function ozetler(db: Db, fisler: readonly MalzemeFisiHam[]): Promise<{ ozet: MalzemeFisiOzeti[]; satirlar: Map<number, FisSatiri[]> }> {
  const satirlar = await fisSatirlariOku(db, fisler);
  const nolar = await emirNolari(db, fisler.flatMap((f) => (f.uretimEmriId === null ? [] : [f.uretimEmriId])));
  const logo = await logoDurumlari(db, fisler, satirlar);
  const ozet = fisler.map((f): MalzemeFisiOzeti => {
    const emirNo = f.uretimEmriId === null ? null : (nolar.get(f.uretimEmriId) ?? null);
    const l = logo.get(f.id) ?? BILINMIYOR;
    const satirSayisi = satirlar.get(f.id)?.length ?? 0;
    return {
      id: f.id, no: malzemeFisiNo(f, emirNo), tur: f.tur, acilis: f.acilis, uretimEmriId: f.uretimEmriId, emirNo, satirSayisi, gonderimIstegi: f.gonderimIstegi,
      logo: l, gonderilebilir: malzemeFisiGonderilebilir(l, satirSayisi > 0), surum: f.surum,
    };
  });
  return { ozet, satirlar };
}

export async function malzemeFisiListesi(db: Db, s: MalzemeFisleriListesi): Promise<SayfaliListe<MalzemeFisiOzeti>> {
  const no = s.metin ? fisNoKimligi(s.metin) : null;
  // Arama yalnız sayım ve ambar fiş numarasını çözer; emir fişi emirden (uretimEmriId) süzülür. Çözülemeyen metin boş liste verir, uydurulmaz.
  if (s.metin && no === null) return { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: s.sayfaBoyu ?? 50 };
  if (no !== null && s.tur !== undefined && s.tur !== no.tur) return { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: s.sayfaBoyu ?? 50 };
  const suzgec: sorgular.MalzemeFisiSuzgeci = { tur: no?.tur ?? s.tur, uretimEmriId: s.uretimEmriId, ...(no ? { idler: [no.id] } : {}) };
  if (s.logoDurumu === undefined) {
    const l = await sayfaliListe(s, { say: () => sorgular.malzemeFisiSay(db, suzgec), satirlar: (d) => sorgular.malzemeFisleri(db, suzgec, s, d) });
    return { ...l, satirlar: (await ozetler(db, l.satirlar)).ozet };
  }
  const durum = s.logoDurumu;
  const adaylar = (await ozetler(db, await sorgular.malzemeFisiKimlikleri(db, suzgec, LOGO_SUZGEC_ADAYI))).ozet.filter((f) => f.logo.durum === durum);
  return sayfaliListe(s, { say: async () => adaylar.length, satirlar: async (d) => adaylar.slice(d.atla, d.atla + d.sinir) });
}

export async function malzemeFisiAyrintisi(db: Db, id: number, hareketleriCevir: (h: Awaited<ReturnType<typeof sorgular.malzemeFisininHareketleri>>) => Promise<MalzemeFisiAyrintiCevabi['hareketler']>): Promise<MalzemeFisiAyrintiCevabi> {
  const [f] = await sorgular.malzemeFisleriBul(db, [id]);
  if (!f) throw bulunamadi('Malzeme fişi bulunamadı.');
  const { ozet, satirlar } = await ozetler(db, [f]);
  return { fis: ozet[0]!, satirlar: (satirlar.get(id) ?? []).map((x): MalzemeFisiSatiri => x), hareketler: await hareketleriCevir(await sorgular.malzemeFisininHareketleri(db, id)) };
}

// Gönder ve Yeniden gönder (295 a): yalnız Logo durumu izin veriyorsa. İstek fişe yazılır; Logo işi sonraki turunda görür.
export async function malzemeFisiGonder(db: Db, kisiId: number, id: number, g: MalzemeFisiGonderGovdesi): Promise<MalzemeFisiOzeti> {
  const [f] = await sorgular.malzemeFisleriBul(db, [id]);
  if (!f) throw bulunamadi('Malzeme fişi bulunamadı.');
  const { ozet } = await ozetler(db, [f]);
  const o = ozet[0]!;
  if (o.logo.durum === 'bilinmiyor') throw cakisma('Logo bağlantısı bu sunucuda kurulu değil; fiş gönderilemez.');
  if (!o.gonderilebilir) {
    throw cakisma(o.logo.gonderimSekli === 'kapali'
      ? 'Bu fiş türünün Logo gönderimi kapalı (Sistem Ayarları).'
      : 'Fiş şu an gönderilemez: elle gönderim beklemiyor ya da hatalı değil.', { durum: o.logo.durum });
  }
  await surumluGuncelle({ guncelle: () => sorgular.gonderimIstegiYaz(db, id, g.surum, kisiId), varMi: () => sorgular.malzemeFisiVarMi(db, id), bulunamadiIletisi: 'Malzeme fişi bulunamadı.' });
  const [yeni] = await sorgular.malzemeFisleriBul(db, [id]);
  return (await ozetler(db, [yeni!])).ozet[0]!;
}

// ---- Logo modülüne (disari.ts) ------------------------------------------------------------------------------------------------------
export interface LogoIcinFis {
  id: number; tur: MalzemeFisiTuru; no: string; uretimEmriId: number | null;
  // Fişin açıldığı an, tesis saatiyle (Logo fiş tarihi ve saati).
  tarih: string; saat: string;
  degisiklik: number; gonderimIstegi: string | null;
  satirlar: { stokKodu: string | null; birim: string | null; miktar: string; aciklama: string | null; kaynakAmbarNo: number | null; hedefAmbarNo: number | null }[];
}
const saatBicimi = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' });
export async function logoIcinFisler(db: Db, idler: readonly number[]): Promise<Map<number, LogoIcinFis>> {
  const fisler = await sorgular.malzemeFisleriBul(db, idler);
  const satirlar = await fisSatirlariOku(db, fisler);
  const nolar = await emirNolari(db, fisler.flatMap((f) => (f.uretimEmriId === null ? [] : [f.uretimEmriId])));
  return new Map(fisler.map((f) => {
    const an = new Date(f.acilis);
    return [f.id, {
      id: f.id, tur: f.tur, no: malzemeFisiNo(f, f.uretimEmriId === null ? null : (nolar.get(f.uretimEmriId) ?? null)), uretimEmriId: f.uretimEmriId,
      tarih: tesisGunu(an), saat: saatBicimi.format(an), degisiklik: f.degisiklik, gonderimIstegi: f.gonderimIstegi,
      satirlar: (satirlar.get(f.id) ?? []).map(({ stokKodu, birim, miktar, aciklama, kaynakAmbarNo, hedefAmbarNo }) => ({ stokKodu, birim, miktar, aciklama, kaynakAmbarNo, hedefAmbarNo })),
    }];
  }));
}
export interface FisDegisikligi { id: number; tur: MalzemeFisiTuru; uretimEmriId: number | null; degisiklik: number; degisiklikZamani: string; gonderimIstegi: string | null }
export async function malzemeFisiDegisiklikleri(db: Db, a: { zaman: string | null; id: number; sinir: number }): Promise<FisDegisikligi[]> {
  return (await sorgular.degisenMalzemeFisleri(db, a)).map(({ id, tur, uretimEmriId, degisiklik, degisiklikZamani, gonderimIstegi }) => ({ id, tur, uretimEmriId, degisiklik, degisiklikZamani, gonderimIstegi }));
}
export async function emirlerinFisKimlikleri(db: Db, emirIdler: readonly number[]): Promise<{ id: number; tur: MalzemeFisiTuru; uretimEmriId: number }[]> {
  return (await sorgular.emirlerinMalzemeFisleri(db, emirIdler)).map((f) => ({ id: f.id, tur: f.tur, uretimEmriId: f.uretimEmriId! }));
}
