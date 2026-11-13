import type { Db } from '#cekirdek/db.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { AdimKaynakOzeti, RevizyonAyrintisi, OpNumaralariCevabi, RevizyonOzetiCevabi, RotaListesiCevabi, SeceneklerCevabi, UrunRevizyonlariCevabi, HamOnerisiCevabi } from '#paylasilan/sozlesme/rota.ts';
import { HAM_ONERI_SAYISI } from '#paylasilan/sozlesme/rota.ts';
import { OPERASYON_GRUP_ADLARI } from '#paylasilan/sozlesme/istasyonlar.ts';
import { malzemeGeometrisi } from '../../geometri/disari.ts';
import { firmaAra, firmaOzetleri } from '../../musteri-tedarikci/disari.ts';
import { kisiAdlari } from '../../kisiler/disari.ts';
import { TASLAK_AC, fasonTerminToplami, yeniOpNo, izinliKomutlar, ondalikMetin, rotaOzeti, sayiyaCevir } from '../kurallar.ts';
import * as s from '../sorgular.ts';
import {
  adimlariKur, dortGozAcikMi, gorunumBaglami, kartAdimlari, kaynakBaglami, operasyonTipleri, revizyonuAl, rotaliTurMu, urunOzetiAl, urunOzetleri,
} from './ortak.ts';

// Rota yalnız kullanımdaki mamul ya da yarımamul kartına kurulur.
export const ROTALI_TURLER = ['mamul', 'yarimamul'] as const;

/* ---------------- okuma ---------------- */

// Fason süzgeci finansın aramasında uygulanır (KD-021): sonradan süzülse, arama sınırını (50) fason olmayan firmalar doldurur
// ve sonraki fason firma seçilemezdi. Sınır finansındır; 50'den çok fason firma bugün listeye girmez.
const FASON_ARAMA_SINIRI = 200;
async function fasonFirmalar(db: Db): Promise<AdimKaynakOzeti[]> {
  const bulunan = await firmaAra(db, { metin: '', sinir: FASON_ARAMA_SINIRI, fason: true });
  const ozetler = await firmaOzetleri(db, bulunan.map((f) => f.id));
  return [...ozetler.values()].filter((f) => f.aktif && f.fason)
    .map((f) => ({ tur: 'fason', id: f.id, kod: f.kod, ad: f.ad, aktif: true, istasyon: null }));
}

export async function secenekler(db: Db): Promise<SeceneklerCevabi> {
  const b = await kaynakBaglami(db);
  const kisiler = [...b.kisi.values()].filter((k) => k.aktif);
  return {
    operasyonTipleri: await (async () => {
      const kullanim = new Map((await s.tipKullanimi(db)).map((k) => [k.tipId, k.adet]));
      return (await operasyonTipleri(db)).map((t) => ({
        id: t.id, kod: t.kod, ad: t.ad, kisaltma: t.kisaltma, grup: t.grup, grupAdi: OPERASYON_GRUP_ADLARI[t.grup], aktif: t.aktif,
        varsayilanAyarDk: t.varsayilanAyarDk, varsayilanBirimDk: t.varsayilanBirimDk, kullanim: kullanim.get(t.id) ?? 0,
      }));
    })(),
    istasyonlar: b.istasyonlar.map((i) => ({
      ...i,
      makineler: [...b.makine.values()].filter((m) => m.istasyon?.id === i.id && m.aktif),
      kisiler: kisiler.filter((k) => k.istasyon?.id === i.id),
    })),
    istasyonsuzKisiler: kisiler.filter((k) => k.istasyon === null),
    fasonFirmalar: await fasonFirmalar(db),
  };
}

// İkinci menünün "Ürün ve rotalar" sayısı: açık (taslak ya da onay bekleyen) revizyonu olan ürün.
export const acikRevizyonSayisi = async (db: Db): Promise<number> => (await rotaListesi(db)).rotalar.filter((r) => r.acik !== null).length;

export async function rotaListesi(db: Db): Promise<RotaListesiCevabi> {
  const satirlar = await s.rotaOzetleri(db);
  const urunler = await urunOzetleri(db, satirlar.map((x) => x.malzemeId));
  return {
    rotalar: satirlar.flatMap((x) => {
      const urun = urunler.get(x.malzemeId);
      if (!urun) return [];
      return [{
        urun,
        yururlukte: x.yururlukteId === null || x.yururlukteHarf === null ? null : { id: x.yururlukteId, harf: x.yururlukteHarf },
        acik: x.acikId === null || x.acikHarf === null || x.acikDurum === null ? null : { id: x.acikId, harf: x.acikHarf, durum: x.acikDurum },
        revizyonSayisi: x.revizyonSayisi,
      }];
    }),
  };
}

export function revizyonOzeti(db: Db): Promise<RevizyonOzetiCevabi> {
  return s.revizyonSayilari(db);
}

export async function urunRevizyonlari(db: Db, kullanici: Kullanici, urunId: number): Promise<UrunRevizyonlariCevabi> {
  const urun = await urunOzetiAl(db, urunId);
  const revizyonlar = await s.urunRevizyonlari(db, urunId);
  const acik = revizyonlar.some((r) => r.durum === 'taslak' || r.durum === 'onay_bekliyor');
  const kart = revizyonlar.length === 0 && rotaliTurMu(urun.tur) ? await kartAdimlari(db, urunId) : null;
  return {
    urun,
    revizyonlar,
    taslakAcilabilir: !acik && rotaliTurMu(urun.tur) && urun.onayDurumu === 'aktif' && kullanici.islemler.includes(TASLAK_AC),
    kartOperasyonlari: kart && { sayi: kart.length, eslesmeyen: kart.filter((a) => !a.eslesti).map((a) => a.ad) },
  };
}

export async function revizyonAyrintisi(db: Db, kullanici: Kullanici, id: number, miktar = 1): Promise<RevizyonAyrintisi> {
  const r = revizyonuAl(await s.revizyonOku(db, id));
  const urun = await urunOzetiAl(db, r.malzemeId);
  const icerik = await s.icerikOku(db, id);
  const adimlar = adimlariKur(await gorunumBaglami(db, r.malzemeId, icerik), miktar);
  // Fason adım dakika toplamına girmez (F6); termini ayrı toplanır.
  const fasonlar = adimlar.filter((a) => a.kaynak?.tur === 'fason');
  const ozet = rotaOzeti(adimlar.filter((a) => a.kaynak?.tur !== 'fason').map((a) => ({ opNo: a.opNo, sure: sayiyaCevir(a.teorikSureDk) })));
  const kisiler = [r.acanKisiId, r.gonderenKisiId, r.onaylayanKisiId, r.yururlugeAlanKisiId, r.iptalEdenKisiId, ...r.duzenleyenKisiIdleri]
    .filter((k): k is number => k !== null);
  const adlar = await kisiAdlari(db, kisiler);
  const kisi = (k: number) => ({ id: k, ad: adlar.get(k) ?? null });
  const varsa = (k: number | null) => (k === null ? null : kisi(k));
  const komutlar = izinliKomutlar({
    durum: r.durum, islemler: kullanici.islemler, kisiId: kullanici.id, gonderenKisiId: r.gonderenKisiId,
    duzenleyenKisiIdleri: r.duzenleyenKisiIdleri, dortGozAcik: await dortGozAcikMi(db),
  });
  return {
    urun,
    revizyon: {
      id: r.id, harf: r.harf, durum: r.durum, surum: r.surum, aciklama: r.aciklama, acilma: r.acilma, onaylama: r.onaylama,
      yururlugeAlma: r.yururlugeAlma,
      kaynak: r.kaynakRevizyonId === null || r.kaynakHarf === null ? null : { id: r.kaynakRevizyonId, harf: r.kaynakHarf },
      acan: kisi(r.acanKisiId), gonderen: varsa(r.gonderenKisiId), gonderme: r.gonderme, onaylayan: varsa(r.onaylayanKisiId),
      dortGozsuzOnay: r.dortGozsuzOnay, yururlugeAlan: varsa(r.yururlugeAlanKisiId), iptalEden: varsa(r.iptalEdenKisiId),
      iptalEtme: r.iptalEtme, duzenleyenler: r.duzenleyenKisiIdleri.map(kisi), geriGondermeNedeni: r.geriGondermeNedeni,
    },
    adimlar,
    miktar: ondalikMetin(miktar),
    ozet: {
      toplamTeorikSureDk: ozet.toplam === null ? null : ondalikMetin(ozet.toplam),
      enUzunAdimOpNo: ozet.enUzunOpNo,
      adimSayisi: adimlar.length,
      fasonTerminGunu: fasonTerminToplami(fasonlar.map((a) => a.terminGun)),
    },
    komutlar,
  };
}

// Rota bileşeninde hammadde önerisi (1709): ölçü ve stok eşleşmesi geometri modülünündür; burada yalnız ilk öneriler seçilir.
// Pay sistem ayarından (geometri.ham-payi-mm) gelir. Kaydetmez: girdiyi kullanıcı ekler.
export async function hamOnerisi(db: Db, urunId: number): Promise<HamOnerisiCevabi> {
  const g = await malzemeGeometrisi(db, urunId);
  if (g === null) return { model: null, payMm: null, oneriler: [], neden: 'model-yok' };
  return {
    model: { belgeAdi: g.belgeAdi, harf: g.harf, revKodu: g.revKodu },
    payMm: g.ham.payMm,
    oneriler: g.ham.oneriler.slice(0, HAM_ONERI_SAYISI),
    neden: g.ham.neden,
  };
}

// B-2482-R4: ürün yoksa 404; sıradaki numara kaydetmenin vereceğiyle aynı kuraldır (RT-31, yeniOpNo).
export async function opNumaralari(db: Db, urunId: number): Promise<OpNumaralariCevabi> {
  await urunOzetiAl(db, urunId);
  const kullanilmis = await s.opNumaralari(db, urunId);
  return { kullanilmis, siradaki: yeniOpNo(kullanilmis.map((k) => k.opNo)) };
}
