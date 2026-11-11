import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, eskiSurum, gecersiz, yetkiYok } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { DenetimSecimi, IkiliCevap } from '#cekirdek/uc.ts';
import type { KmTedarikciDurumu } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import type {
  AcilisCevabi, Ayarlar, ButceKullanimiCevabi, DegerlendirmeCevabi, DisOperasyonAyrintisiCevabi, KartAyrintilariCevabi, KartAyrintisi, DisOperasyonlarCevabi, FasonSureleriCevabi, SiparisBelgeleriCevabi, SiparisBelgesi, SiparisBelgesiYazimi, AyarlarKaydetYazimi, HizliAcYazimi, TalebimiDuzenleYazimi, TalebimGuncellemeYazimi, KatalogKaydetYazimi, KatalogKaydi, MalzemeSecenekleriCevabi, SatinAlmaOzetiCevabi, SiparisCikisi, SiparisFaturalariCevabi, SiparisFaturasiYazimi, SiparisKalemiDegistirYazimi, SiparisKapatYazimi, TeslimYontemiYazimi, OdemePlaniYazimi, SiparisTakibiCevabi, Talep, TalepDurumu, TalepKaydetYazimi, TalepTuru,
  IptaliGeriAlCevabi, IptaliGeriAlYazimi, ProjeSecenekleriCevabi, TalepAyirYazimi, TalepBirlestirYazimi, AcikEmirlerCevabi, Onay, OnTalepleriCevabi, OnTalepYoksayYazimi, TedarikTermini, TedarikTerminiKaydetYazimi, TedarikTerminleriCevabi, TerminTakipSatiri, GuncelKgFiyatiSatiri, KgFiyatiGecmisiCevabi, KgFiyatiIptalYazimi, KgFiyatiSatiri, KgFiyatlariCevabi, KgStokDegeri, StokAyriGrubu, StokYokIstekleriCevabi, TaleplerimCevabi, Talebim, TalepYazimi, Tedarikci, TedarikciKaydetYazimi,
} from '#paylasilan/sozlesme/satin-alma.ts';
import { STOK_AYRI_GRUPLARI } from '#paylasilan/sozlesme/satin-alma.ts';
import { randomUUID } from 'node:crypto';
import type { TakvimKaydi } from '#paylasilan/sozlesme/takvim.ts';
import { firmaAdlari, karneOlayiKaldir, karneOlayiYaz } from '../musteri-tedarikci/disari.ts';
import type { KalemBagiCikisi, TeslimDurumu } from '#paylasilan/sozlesme/satin-alma.ts';
import { numaraAl, sistemAyariOku } from '../ayarlar/disari.ts';
import { kisiAdlari, kisiVarMi, kisininRolleri, rolSecenekleri } from '../kisiler/disari.ts';
import { alacakliSiparisler, alisBelgeleri, belgelerinSiparisleri, alisBelgesiEslesmeTutari, belgeSiparisBagla, siparisAvansAlacagiYaz, kdvSecenekleri, kurCiftiGetir, kurCiftleri, oranlar, siparisOdemePlaniKaldir, siparisOdemePlaniYaz, siparisOtomatikPlaniVarMi, siparisPlanlari } from '../finans/disari.ts';
import type { AvansAlacagiSonucu, FaizTuru } from '../finans/disari.ts';
import { ORAN_KULLANIMLARI, yillikFaizdenAylik } from '#paylasilan/sozlesme/finans.ts';
import { firmaAra, firmaOzeti, firmaOzetleri, tedarikciOlabilirMi, tumFirmalar, type FirmaOzeti } from '../musteri-tedarikci/disari.ts';
import { kullanilanKaliteler, malzemeAra, malzemeMaliyetBilgileri, malzemeOzetleri, malzemeSatinAlmaAyrintilari } from '../malzemeler/disari.ts';
import { belgeAcVeBagla, kaydaBagliBelgeler, kayitlaraBagliBelgeler, kayittakiBelgeDosyasi, kayittanKaldir, type BagliBelge } from '../belge-merkezi/disari.ts';
import {
  acikEmirler, dieAc, dieListesi, dieOku, emirDurumlari, emirlerinProjeleri, emirNolari, fasonFirmasiniSiparistenYaz, fasonGecmisi, fasonGonderimleri, fasonIsEmirleri, isEmriOzetleri,
} from '../uretim-emirleri/disari.ts';
import { operasyonTipleri } from '../istasyonlar/disari.ts';
import { bildirimGonder, bildirimKapat } from '../bildirim/disari.ts';
import { resmiTatilGunleri } from '../ik/disari.ts';
import { projeGetir, projeSecenekleri } from '../projeler/disari.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import {
  ILETILER, ISLEM, type KurKilidiIsi, emirAcikMi, kilitliDurum, basamakEsigiReddi, basamakKilidiReddi, tedarikciyeGidenAyrinti, kalemAyrintisiniKoru, kilittenSonraOnayliMi, kurKilidiIsi, kurKilidiReddi, degisiklikReddi, gecikmeGunu, fasonKalani, sonDonusGecikmesi, agirlikliGecikme, degisiklikTuru, dortGozSonucu, onayKademesiReddi, onayLimitRolleri, onayLimitleriDegistiMi, onayLimitiReddi, terminsizSiparisReddi, terminTakibi, fazlaTeslim, finanstanEklenenKurlar, aylikFaiz, fiyatIzleri, kullanilanParaBirimleri, gecisVarMi, gorunenDurum, kararDegistiMi, kararOnayliMi, talepFisiGiderMi,
  KARTSIZ_KATEGORI, TALEP_TURU_KARTLARI, satinAlinabilirKartReddi, kartBirimiReddi, hizliBaslik, hizliKalemReddi, kartKopyasi, kartsizSiparisReddi, katalogKartiReddi, logoGuncellenecekSiparisler, logoIptalGeriAlmaReddi, logoSiparisDegisikligiReddi, siparisliKalemReddi, siparisDegisikligiMetni, siparisFaturaFirmasi, faturaEslesmeUyarilari, siparisKalemiDegisikligiReddi, siparisKapatmaReddi, talebinAlimlari, ondalikKiyas, siparisReddi, talebim, birimKarsiligi, talebimDuzenlenirMi, talebimKalemReddi, guncellemeReddi, guncellemeIptalleri, ikinciAlimRiski,
  fasonKalemReddi, fasonOnTalepAdaylari, hizliBagReddi, planOnTalepAdaylari, uygulananKartReddi, type KalemBagi,
  fasonKirilimlari, fasonSureOrnekleri, fasonSuresiTahmini, fasonTerminUyumu, talepEdenDurumu, talepEdenGovdeDurumu, talepEdenGorunumu, avansAsimi, gerceklesenKosul, planGerceklesenFarki, talepKartiReddi, tamGorurMu, teklifKuru, teslimDurumu, odemePlaniHedefi, varsayilanOdemePlani,
  askidakiTedarikciReddi, birimFiyati, kaliteSiparisReddi, karneTeslimOlayi, stokTutari, uygulananKgFiyati, yeniSiparisFirmalari,
  iptalOncesiTuret, iptalGeriAlmaHareketi, bilinmeyenKgSatirlari, kgEskimeHatirlatmalari, kgFiyatiEskiMi, kgFiyatiKartta, kgFiyatiYasi, kgSapanMi, kgSapmasi, kgSonAlislari, ondalikCarp, birlestirmeReddi, birlesmeProjesiReddi, birlesikTalep, emirHareketi, projeHareketi, projeReddi, siparisDagilimi, type SiparisDagilimi, type DagilimSatiri, genelGiderOrani, satirYolu, type SatirYolu, belgeGenelGiderOrani, eslemeListesiHatasi, eslemeSurumu, type EslemeDurumu, ayirmaReddi, kaynakKalemiReddi, BIRLESIK_KALEM_SINIRI, KUR_KILIDI, HATIRLATMA_ADLARI, type HatirlatmaAyarlari, type HatirlatmaTalebi, haftaIciGunleri, hatirlatmaAnahtari, hatirlatmaFarki, hatirlatmalar,
} from './kurallar.ts';
import type { BirimKarsiligi, FiyatIzi } from './kurallar.ts';
import { butceKullanimi, butceSatirlari, degerlendir, esitVadeOrtami, gerekenBasamak, kalemHarcamalari, kararTutari, tedarikciBasarimi, teklifHesabi, type ButceSatiri } from './hesap-kurallar.ts';
import * as s from './sorgular.ts';
import { alimBildir } from './alim-olayi.ts';
import { ondalikMetinSemasi } from '#paylasilan/ondalik.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';

const ad = (harita: Map<number, string>, id: number | null) => (id === null ? null : harita.get(id) ?? null);

// Ondalık metin sade biçimde gider (sondaki sıfırlar ve nokta atılır): ekran sayıyla çalışıp geri yazdığında aynı metin döner,
// kayıt karşılaştırması biçim farkını değişiklik sanmaz. Sayıya çevrilmez.
export function sade(d: string): string;
export function sade(d: string | null): string | null;
export function sade(d: string | null): string | null {
  if (d === null || !d.includes('.')) return d;
  return d.replace(/0+$/, '').replace(/\.$/, '');
}

// 2876: talep başına güncelleme grubu (kök önce); grubu olmayan talep haritada yoktur. Durum görünen durumdur: "teslim alındı" yazılmaz,
// siparişlerden türetilir (SAT-38); bilinmeyen siparişteki üyenin durumu yalın kurulumla türetilir (grup okumadan, döngü yok).
async function guncellemeGruplari(db: Db, idler: readonly string[], bilinen: ReadonlyMap<string, TalepDurumu> = new Map()): Promise<Map<string, NonNullable<Talep['guncellemeGrubu']>>> {
  const uyeler = idler.length === 0 ? [] : await s.guncellemeGruplariOku(db, idler);
  const eksik = uyeler.filter((u) => u.durum === 'siparis_verildi' && !bilinen.has(u.id)).map((u) => u.id);
  const gorunen = new Map(bilinen);
  if (eksik.length > 0) for (const t of await talepleriYalinKur(db, await s.talepSatirlariIdlerle(db, eksik))) gorunen.set(t.id, t.durum);
  const kokune = new Map<string, NonNullable<Talep['guncellemeGrubu']>>();
  for (const u of uyeler) {
    const l = kokune.get(u.kokId) ?? [];
    const durum = u.durum === 'siparis_verildi' ? gorunen.get(u.id) ?? 'siparis_verildi' : (u.durum as TalepDurumu);
    l.push({ id: u.id, no: u.no, durum, kok: u.id === u.kokId });
    kokune.set(u.kokId, l);
  }
  return new Map([...kokune.values()].flatMap((l) => l.map((u) => [u.id, l] as const)));
}

// Veritabanı satırlarından istemcinin bütününü kurar.
async function talepleriKur(db: Db, satirlar: s.TalepSatiri[]): Promise<Talep[]> {
  return (await birlesmeyleKur(db, satirlar)).talepler;
}
// 2414 a: kaynak talep birleşik talebi (birlesme), birleşik talep kaynaklarını taşır. Birleşik talepler de kurulur: talep edenin kaynak
// görünümü kalemlerini oradan alır.
async function birlesmeyleKur(db: Db, satirlar: s.TalepSatiri[]): Promise<{ talepler: Talep[]; birlesenler: Map<string, Talep> }> {
  const talepler = await talepleriYalinKur(db, satirlar);
  const birlesenIdler = [...new Set(satirlar.flatMap((t) => (t.birlesenTalepId === null ? [] : [t.birlesenTalepId])))];
  const birlesenSatirlari = await s.talepSatirlariIdlerle(db, birlesenIdler);
  const birlesenYalin = await talepleriYalinKur(db, birlesenSatirlari);
  const tumu = [...talepler, ...birlesenYalin];
  const kaynakKalemleri = await s.kalemKaynaklariOku(db, tumu.map((t) => t.id));
  const kaynakSatirlari = await s.talepSatirlariIdlerle(db, [...new Set(kaynakKalemleri.map((x) => x.kaynakTalepId))]);
  const adlar = await kisiAdlari(db, kaynakSatirlari.map((r) => r.talepEdenKisiId).filter((x): x is number => x !== null));
  const kaynakEmirleri = await emirNolari(db, kaynakSatirlari.flatMap((r) => (r.uretimEmriId === null ? [] : [r.uretimEmriId])));
  const kaynaklariKur = (t: Talep): Talep['kaynaklar'] => {
    const kendi = kaynakKalemleri.filter((x) => x.talepId === t.id);
    return [...new Set(kendi.map((x) => x.kaynakTalepId))].map((kid) => {
      const r = kaynakSatirlari.find((x) => x.id === kid);
      const ilk = kendi.find((x) => x.kaynakTalepId === kid)!;
      return {
        talepId: kid, no: r?.no ?? '', talepEdenAdi: r === undefined ? null : ad(adlar, r.talepEdenKisiId),
        kalemIdleri: kendi.filter((x) => x.kaynakTalepId === kid).map((x) => x.kalemId), ihtiyacTarihi: ilk.kaynakIhtiyacTarihi, birim: ilk.kaynakBirim,
        uretimEmriNo: r?.uretimEmriId == null ? null : kaynakEmirleri.get(r.uretimEmriId) ?? null,
      };
    });
  };
  const birlesenler = new Map(birlesenYalin.map((t) => [t.id, { ...t, birlesme: null, kaynaklar: kaynaklariKur(t) }]));
  const gruplar = await guncellemeGruplari(db, talepler.map((t) => t.id), new Map(talepler.map((t) => [t.id, t.durum])));
  return {
    talepler: talepler.map((t, i) => {
      const b = satirlar[i]!.birlesenTalepId;
      const bt = b === null ? undefined : birlesenler.get(b);
      const grup = gruplar.get(t.id);
      return { ...t, birlesme: bt === undefined ? null : { talepId: bt.id, no: bt.no, durum: bt.durum }, kaynaklar: kaynaklariKur(t),
        ...(grup === undefined ? {} : { guncellemeGrubu: grup }) };
    }),
    birlesenler,
  };
}

async function talepleriYalinKur(db: Db, satirlar: s.TalepSatiri[]): Promise<Talep[]> {
  if (satirlar.length === 0) return [];
  const a = await s.altKayitlariOku(db, satirlar.map((t) => t.id));
  const kisiler = await kisiAdlari(db, [
    ...satirlar.map((t) => t.talepEdenKisiId), ...a.onaylar.map((o) => o.kisiId), ...a.hareketler.map((h) => h.kisiId),
    ...a.senaryolar.map((x) => x.kisiId), ...a.kararlar.map((k) => k.kararVerenKisiId),
  ].filter((x): x is number => x !== null));
  // SAT-37, SAT-38: teslim satın almanın kendi tablosundadır, stok mal kabulde yazar (SH1 a). GKK sonucu kalite modülü gelene
  // kadar yoktur (SH2 b); kalite boş döner.
  const emirNolariHaritasi = await emirNolari(db, satirlar.flatMap((t) => (t.uretimEmriId === null ? [] : [t.uretimEmriId])));
  const projeler = await projeOzetleri(db, satirlar.flatMap((t) => (t.projeId === null ? [] : [t.projeId])));
  const toplamlar = new Map((await s.teslimToplamlari(db, a.siparisSatirlari.map((x) => x.id))).map((x) => [x.siparisSatiriId, x]));
  const grup = <T extends { talepId: string }>(l: T[], id: string) => l.filter((x) => x.talepId === id);
  const siparisKur = (x: (typeof a.siparisler)[number]): SiparisCikisi => {
    const satirlar = a.siparisSatirlari.filter((r) => r.talepId === x.talepId && r.teklifId === x.teklifId).map((r) => {
      const t = toplamlar.get(r.id);
      const teslimAlinan = t === undefined ? null : sade(t.toplam);
      const miktar = sade(r.miktar);
      return {
        id: r.id, kalemId: r.kalemId, miktar, birim: r.birim, teslimAlinan,
        sonTeslimTarihi: t?.sonTarih ?? null, fazlaTeslim: fazlaTeslim(miktar, teslimAlinan), parcaRevizyonu: r.parcaRevizyonu,
      };
    });
    return {
      teklifId: x.teklifId, no: x.no, siparisNo: x.siparisNo, siparisTarihi: x.siparisTarihi, beklenenTeslim: x.beklenenTeslim, vadeBaslangici: x.vadeBaslangici,
      // Kalanı kapatılmış sipariş tamamlanmış sayılır: talep, kalan beklenmeden teslim alındıya geçer.
      satirlar, teslimDurumu: x.logoKapatmaDurumu === null ? teslimDurumu(satirlar) : 'tamam', kalite: null,
      logo: x.logoDurumu === null ? null
        : { durum: x.logoDurumu, kayitNo: x.logoKayitNo, hata: x.logoHata, iptalDurumu: x.logoIptalDurumu, iptalHata: x.logoIptalHata,
          guncellemeDurumu: x.logoGuncellemeDurumu, guncellemeHata: x.logoGuncellemeHata, kapatmaDurumu: x.logoKapatmaDurumu, kapatmaHata: x.logoKapatmaHata },
    };
  };
  const at = <T extends { talepId: string }>({ talepId: _t, ...r }: T) => r;
  const baglar = await kalemBaglariKur(db, satirlar.map((t) => t.id));
  return satirlar.map((t) => {
    const k = a.kararlar.find((x) => x.talepId === t.id) ?? null;
    return {
      id: t.id, no: t.no, baslik: t.baslik, birim: t.birim, talepEdenKisiId: t.talepEdenKisiId, talepEdenAdi: ad(kisiler, t.talepEdenKisiId),
      acanKisiId: t.acanKisiId, oncelik: t.oncelik as Talep['oncelik'], ihtiyacTarihi: t.ihtiyacTarihi, notlar: t.notlar,
      teslimYontemi: t.teslimYontemi, uretimEmriId: t.uretimEmriId,
      uretimEmriNo: t.uretimEmriId === null ? null : emirNolariHaritasi.get(t.uretimEmriId) ?? null,
      projeId: t.projeId, proje: t.projeId === null ? null : projeler.get(t.projeId) ?? null,
      // "Teslim alındı" yazılmaz; bütün siparişler stokta tam kabul edilince görünür (SAT-38).
      durum: gorunenDurum(t.durum as TalepDurumu, k === null ? [] : grup(a.siparisler, t.id).map((x) => siparisKur(x).teslimDurumu)),
      iptalNedeni: t.iptalNedeni,
      agirliklar: t.agirlikMaliyet === null ? null
        : { maliyet: t.agirlikMaliyet, termin: t.agirlikTermin ?? 0, tedarikci: t.agirlikTedarikci ?? 0, garanti: t.agirlikGaranti ?? 0 },
      kalemler: grup(a.kalemler, t.id).map((k) => ({ ...at(k), miktar: sade(k.miktar) })),
      kalemBaglari: baglar.get(t.id) ?? [],
      teklifIstekleri: grup(a.istekler, t.id).map(at),
      teklifler: grup(a.teklifler, t.id).map((q) => ({
        ...at(q), kur: sade(q.kur), iskontoYuzdesi: sade(q.iskontoYuzdesi), nakliye: sade(q.nakliye), digerMasraf: sade(q.digerMasraf),
        avansYuzdesi: sade(q.avansYuzdesi), ilkToplam: sade(q.ilkToplam),
        fiyatlar: a.fiyatlar.filter((f) => f.talepId === t.id && f.teklifId === q.id).map((f) => ({
          kalemId: f.kalemId, birimFiyat: sade(f.birimFiyat), iskontoYuzdesi: sade(f.iskontoYuzdesi), terminGun: f.terminGun, enAzMiktar: sade(f.enAzMiktar),
          basamaklar: a.basamaklar.filter((b) => b.talepId === t.id && b.teklifId === q.id && b.kalemId === f.kalemId)
            .map((b) => ({ esik: sade(b.esik), birimFiyat: sade(b.birimFiyat) })),
        })),
      })),
      karar: k === null ? null : {
        mod: k.mod, teklifId: k.teklifId, gerekce: k.gerekce, kararVerenKisiId: k.kararVerenKisiId, kararVerenAdi: ad(kisiler, k.kararVerenKisiId), kararTarihi: k.kararTarihi, ogrenilenler: k.ogrenilenler,
        bolunme: grup(a.bolunmeler, t.id).map(at),
        sabitKurlar: grup(a.sabitKurlar, t.id).map(({ paraBirimi, kur, aylikFaizYuzdesi }) => ({ paraBirimi: paraBirimi as 'TRY', kur: sade(kur), aylikFaizYuzdesi: sade(aylikFaizYuzdesi) })),
        siparisler: grup(a.siparisler, t.id).map(siparisKur),
        kurKilidi: k.kurKilidi,
      },
      onaylar: grup(a.onaylar, t.id).map((o) => ({ ...at(o), kisiAdi: ad(kisiler, o.kisiId) })),
      hareketler: grup(a.hareketler, t.id).map((h) => ({ ...at(h), kisiAdi: ad(kisiler, h.kisiId) })),
      senaryolar: grup(a.senaryolar, t.id).map((x) => ({
        id: x.id, ad: x.ad, kisiId: x.kisiId, kisiAdi: ad(kisiler, x.kisiId), olusturma: x.olusturma,
        paylar: a.paylar.filter((p) => p.talepId === t.id && p.senaryoId === x.id).map(({ kalemId, teklifId, miktar }) => ({ kalemId, teklifId, miktar: sade(miktar) })),
        dengeler: a.dengeler.filter((d) => d.talepId === t.id && d.senaryoId === x.id).map(({ kalemId, denge }) => ({ kalemId, denge: sade(denge) })),
      })),
      surum: t.surum, olusturma: t.olusturma, guncelleme: t.guncelleme,
    };
  });
}

// 2611 a: talepteki projelerin kodu ve adı (projeler modülünden); bulunamayan proje haritada yoktur, çıktıda null olur (kod uydurulmaz). Proje sayısı küçüktür; bütün liste tek sorguyla okunur.
async function projeOzetleri(db: Db, idler: readonly number[]): Promise<Map<number, { id: number; kod: string; ad: string }>> {
  if (idler.length === 0) return new Map();
  const istenen = new Set(idler);
  return new Map((await projeSecenekleri(db, { yalnizAktif: false })).filter((p) => istenen.has(p.id)).map((p) => [p.id, { id: p.id, kod: p.kod, ad: p.ad }]));
}

// 2611 a: proje yalnız emirsiz talepte; yeni seçilen proje aktif olmalı.
async function projeyiDenetle(db: Db, t: TalepYazimi, eskiProjeId: number | null): Promise<void> {
  if (t.projeId == null) return;
  const p = t.projeId === eskiProjeId || t.uretimEmriId !== null ? null : await projeGetir(db, t.projeId);
  const red = projeReddi(t, eskiProjeId, p?.durum === 'aktif');
  if (red !== null) throw dogrulama(red, 'projeId');
}

export async function talepProjeSecenekleri(db: Db): Promise<ProjeSecenekleriCevabi> {
  return { projeler: (await projeSecenekleri(db, { yalnizAktif: true })).map((p) => ({ id: p.id, kod: p.kod, ad: p.ad })) };
}

async function talepOku(db: Db, id: string): Promise<Talep | null> {
  return (await talepleriKur(db, await s.talepSatirlariOku(db, null, id)))[0] ?? null;
}

// SAT-41: tedarikçi, aktif ve türü musteri-tedarikci kuralına göre tedarikçi olabilen firmadır.
const tedarikciOlabilir = (f: FirmaOzeti | null): boolean => f !== null && f.aktif && tedarikciOlabilirMi(f.tur);

// Firma kartı finanstadır (SA1); finansta yetkili alanı yok, boş döner (sıfır uydurulmaz).
async function tedarikcileriKur(db: Db, firmaId: number | null = null): Promise<Tedarikci[]> {
  const satirlar = await s.tedarikcileriOku(db, firmaId);
  const firmalar = await firmaOzetleri(db, satirlar.map((t) => t.firmaId));
  const kategoriler = await s.tedarikciKategorileriOku(db, firmaId);
  const degerlendirmeler = await s.degerlendirmeleriOku(db, firmaId);
  const kisiler = await kisiAdlari(db, degerlendirmeler.map((d) => d.kisiId).filter((x): x is number => x !== null));
  const kalite = await kaliteDurumlari(db, satirlar.map((t) => t.firmaId));
  return satirlar.map((t) => {
    const f = firmalar.get(t.firmaId);
    return {
      firmaId: t.firmaId, ad: f?.ad ?? '', vergiNo: f?.vergiNo ?? null, yetkili: null, telefon: f?.telefon ?? null,
      eposta: f?.ePosta ?? null, sehir: f?.il ?? null, firmaAktif: f?.aktif ?? false, firmaSurum: f?.surum ?? null, durum: t.durum, kaliteDurumu: kalite.get(t.firmaId) ?? null, puan: t.puan, notlar: t.notlar,
      kategoriler: kategoriler.filter((k) => k.firmaId === t.firmaId).map((k) => k.kategori),
      degerlendirmeler: degerlendirmeler.filter((d) => d.firmaId === t.firmaId).map(({ firmaId: _f, ...d }) => ({ ...d, kisiAdi: ad(kisiler, d.kisiId) })),
      surum: t.surum, olusturma: t.olusturma,
    };
  });
}

// SA2 b, 249 a: kod, ad ve birim yalnız malzeme kartındadır (adsız kartta ad stok kodudur). Kategori kartta yalnız sarf, demirbaş ve
// hizmette vardır; olmayanda kalemde saklanan değer gösterilir. Kart bağı yabancı anahtarla zorunludur.
async function katalogKur(db: Db, id: string | null = null): Promise<KatalogKaydi[]> {
  const adlar = await s.takmaAdlariOku(db);
  const satirlar = await s.katalogOku(db, id);
  const kartlar = await malzemeOzetleri(db, satirlar.map((k) => k.malzemeNo));
  return satirlar.map((k) => {
    const kart = kartlar.get(k.malzemeNo);
    const kod = kart?.kod ?? `#${k.malzemeNo}`;
    return {
      ...k, kod, ad: kart?.ad ?? kod, kategori: kart?.kategoriAdi ?? k.kategori, birim: kart?.birim ?? '',
      takmaAdlari: adlar.filter((a) => a.katalogId === k.id).map((a) => a.takmaAd),
    };
  }).sort((a, b) => a.kod.localeCompare(b.kod, 'tr-TR'));
}

// SAT-53, SAT-65, #375: açılış satın almanın ekranıdır; yalnız talep açabilen 403 alır (uç yetkisi), kendi taleplerini
// ana sayfadaki uçtan görür. Tam gören (oku, yaz, onayla) her şeyi; yalnız ayar yetkisi olan kendi taleplerini talep eden gibi görür.
export async function acilis(db: Db, k: Kullanici): Promise<AcilisCevabi> {
  const tam = tamGorurMu(k.islemler);
  const { talepler, birlesenler } = await birlesmeyleKur(db, await s.talepSatirlariOku(db, tam ? null : k.id));
  const tedarikciler = tam ? await tedarikcileriKur(db) : [];
  return {
    kullanici: { id: k.id, ad: k.ad },
    talepler: tam ? talepler : talepler.map((t) => kaynakGorunumu(t, k.id, birlesenler)),
    tedarikciler,
    firmaKartlari: tam ? await firmaKartlari(db, new Set(tedarikciler.map((x) => x.firmaId))) : [],
    katalog: await katalogKur(db),
    ayarlar: await ayarlariKur(db),
  };
}

// Teklif seçicisi kayıtlı tedarikçilerin yanında firma kartlarını da sunar; sunucu da kayıtsız aktif tedarikçi firmayı kabul eder.
// Sınır, açılış cevabını tüm firma listesi kadar şişirmemek içindir; ada göre ilk 200 gelir.
const FIRMA_KARTI_SINIRI = 200;
async function firmaKartlari(db: Db, kayitli: ReadonlySet<number>): Promise<AcilisCevabi['firmaKartlari']> {
  return (await tumFirmalar(db))
    .filter((f) => f.aktif && tedarikciOlabilirMi(f.tur) && !kayitli.has(f.id))
    .map((f) => ({ id: f.id, ad: f.ad }))
    .sort((a, b) => a.ad.localeCompare(b.ad, 'tr') || a.id - b.id)
    .slice(0, FIRMA_KARTI_SINIRI);
}

// SA3 a, 937 b: güncel kur ve faiz finanstan, bugünün ya da öncesinin son kaydı; finansta yoksa boş (sıfır uydurulmaz).
// 2238-1 c, 2238-3 c (ORAN_KULLANIMLARI): satın alma maliyeti finansın satış kuruyla; vade kredi faiziyle puanlanır, mevduat
// faizi yanında verilir. Oran yıllıktır; satın almanın hesabı aylık yüzdeyle sürer (yıllık / 12, sabit kur sütunu 3 basamak).
// Eski tek kur ve faiz tablolarına düşülmez: yeni tabloda yoksa boş (sıfır uydurulmaz).
const kurlar = (db: Db, gun: string) => kurCiftleri(db, gun, ORAN_KULLANIMLARI.satinAlmaMaliyeti.kur);
const kurGetir = (db: Db, pb: string, gun: string) => kurCiftiGetir(db, pb, gun, ORAN_KULLANIMLARI.satinAlmaMaliyeti.kur);
async function faizler(db: Db, gun: string, tur: FaizTuru = ORAN_KULLANIMLARI.satinAlmaVadesi.faizler[0]): Promise<Map<string, { aylikYuzde: string }>> {
  return new Map([...(await oranlar(db, tur, gun))].map(([pb, o]) => [pb, { aylikYuzde: yillikFaizdenAylik(Number(o.yillikYuzde)).toFixed(3) }]));
}

async function ayarlariKur(db: Db): Promise<Ayarlar> {
  const a = await s.ayarlariOku(db);
  const bugun = await s.bugun(db);
  const finans = await kurlar(db, bugun);
  const finansFaizi = await faizler(db, bugun);
  const mevduat = await faizler(db, bugun, ORAN_KULLANIMLARI.satinAlmaVadesi.faizler[1]);
  // Finansın para birimleri yalnız hiç kaydedilmemiş ayarlara önerilir; kaydedilmiş listeden kaldırılan para birimi geri gelmez (borç 38).
  const oneri = a.surum === 1 ? finanstanEklenenKurlar(a.kurlar.map((k) => k.paraBirimi), new Set(finans.keys())) : [];
  const listeler = [...a.kurlar, ...oneri];
  const satirlar = listeler.map((k) => ({ ...k, aylikFaizYuzdesi: aylikFaiz(finansFaizi.get(k.paraBirimi)?.aylikYuzde), mevduatAylikFaizYuzdesi: aylikFaiz(mevduat.get(k.paraBirimi)?.aylikYuzde), kur: sade(finans.get(k.paraBirimi)?.kur ?? null) }));
  const tarihler = listeler.filter((k) => k.paraBirimi !== 'TRY').flatMap((k) => finans.get(k.paraBirimi)?.tarih ?? []).sort();
  // Şirket adı satın almanın değildir (1942 a): Sistem Ayarları > Firma adı'ndan okunur, burada değiştirilmez.
  const sirket = await sistemAyariOku(db, 'kabuk.kurum-adi');
  // 2397-6: rol adı sahibinden (kisiler); rolleri göremeyen satın almacı basamağın rolünü adıyla görür.
  const rolAdlari = a.onayLimitleri.some((l) => l.rolId != null) ? new Map((await rolSecenekleri(db)).map((r) => [r.id, r.ad])) : new Map<number, string>();
  const onayLimitleri = a.onayLimitleri.map((l) => ({ ...l, rolAdi: l.rolId == null ? null : (rolAdlari.get(l.rolId) ?? null) }));
  return { ...a, onayLimitleri, sirket, kurlar: satirlar, kurTarihi: tarihler[0] ?? null, dortGoz: await sistemAyariOku(db, 'satin-alma.dort-goz'),
    onayKademesi: await sistemAyariOku(db, 'satin-alma.onay-kademesi') };
}

// Birim boş olabilir (departmansız talep); doluysa ayarlardaki listede olmalı.
async function birimiDenetle(db: Db, birim: string | null): Promise<void> {
  if (birim !== null && !(await s.birimVarMi(db, birim))) throw gecersiz(ILETILER.birimYok(birim));
}

// Üretim emri boş bırakılabilir; yeni bağlanan emir açık olmalı. Bağı değişmeyen talep, emri sonradan kapansa da düzenlenir.
async function emriDenetle(db: Db, emirId: number | null, eskiEmirId: number | null): Promise<void> {
  if (emirId === null || emirId === eskiEmirId) return;
  if (!emirAcikMi((await emirDurumlari(db, [emirId])).get(emirId))) throw dogrulama(ILETILER.emirKapali, 'uretimEmriId');
}

export async function acikEmirSecenekleri(db: Db): Promise<AcikEmirlerCevabi> {
  return { emirler: (await acikEmirler(db)).map((e) => ({ id: e.id, emirNo: e.emirNo, parcaNo: e.parcaNo, parcaAd: e.parcaAd })) };
}

async function talepEdeniDenetle(db: Db, k: Kullanici, id: number | null): Promise<number> {
  const talepEden = id ?? k.id;
  if (talepEden !== k.id && !(await kisiVarMi(db, talepEden))) throw dogrulama(ILETILER.kisiYok, 'talepEdenKisiId');
  return talepEden;
}

// SAT-01, SAT-06: numara sunucuda verilir; talep başkası adına açılabilir. Talep eden (yaz yok) yalnız taslak ya da teklif istenen
// hâlde, teklifsiz ve kararsız açar.
// Fiyat izi (S2) yazmadan sonra veritabanından okunan hâlle kurulur: kayda istemcinin değil saklananın değeri girer.
// İz yazıcısı zorunludur; fiyatı değişen kayıt izsiz geçemez.
type FiyatIziYazici = (satirlar: readonly FiyatIzi[]) => void;

function fiyatIziniYaz(izYaz: FiyatIziYazici, eski: Talep | null, sonra: Talep): Talep {
  const satirlar = fiyatIzleri(eski, sonra);
  if (satirlar.length > 0) izYaz(satirlar);
  return sonra;
}

// SAT-41: yeni teklif ya da firması değişen teklif aktif bir tedarikçi firmayla kurulur. Eski teklifin sonradan pasifleşen firması korunur:
// aynı talep yeniden kaydedilince geçmiş teklif reddedilmez. Firma kimliği satın alma tedarikçisiyle finans firmasında aynıdır (SA1).
async function teklifFirmalariniDenetle(db: Db, gelen: TalepYazimi['teklifler'], eskiler: ReadonlyMap<string, { firmaId: number | null }>): Promise<void> {
  const yeniler = gelen.flatMap((q) => (q.firmaId !== null && eskiler.get(q.id)?.firmaId !== q.firmaId ? [q.firmaId] : []));
  if (yeniler.length === 0) return;
  const firmalar = await firmaOzetleri(db, yeniler);
  if (yeniler.some((id) => !tedarikciOlabilir(firmalar.get(id) ?? null))) throw gecersiz(ILETILER.firmaPasif);
  // Kayıtsız firma teklif alınca Tedarikçiler'e puansız eklenir (2157-1 a: orta puan uydurulmaz); var olan kayıt değişmez.
  for (const firmaId of new Set(yeniler)) await s.tedarikciEkle(db, { firmaId, puan: null, notlar: '', kategoriler: [], degerlendirmeler: [], surum: null });
}

// B-001, B-010: kararı veren ve karar tarihi, senaryonun kişisi ve zamanı sunucunundur. Karar özü değişmediyse önceki kişi ve tarih
// korunur; yeni senaryo oturumdaki kişiyi ve sunucunun saatini alır, var olan senaryonun kişisi ve zamanı değişmez.
// SA3 a: döviz teklifinin kuru da burada yerleşir (kurallar `teklifKuru`); finansta o günün kuru yoksa kullanıcıdan istenir.
async function sunucuAlanlari(db: Db, k: Kullanici, t: TalepYazimi, eski: Talep | null): Promise<TalepYazimi> {
  const eskiKarar = eski?.karar ?? null;
  const karar = t.karar === null ? null : eskiKarar !== null && !kararDegistiMi(eskiKarar, t.karar)
    ? { ...t.karar, kararVerenKisiId: eskiKarar.kararVerenKisiId, kararTarihi: eskiKarar.kararTarihi }
    : { ...t.karar, kararVerenKisiId: k.id, kararTarihi: await s.bugun(db) };
  const eskiSenaryolar = new Map((eski?.senaryolar ?? []).map((x) => [x.id, x]));
  const senaryolar = t.senaryolar.map((x) => {
    const e = eskiSenaryolar.get(x.id);
    return e ? { ...x, kisiId: e.kisiId, olusturma: e.olusturma } : { ...x, kisiId: k.id, olusturma: '' };
  });
  const eskiTeklifler = new Map((eski?.teklifler ?? []).map((q) => [q.id, q]));
  await teklifFirmalariniDenetle(db, t.teklifler, eskiTeklifler);
  const teklifler: TalepYazimi['teklifler'] = [];
  for (const q of t.teklifler) {
    const kaynak = teklifKuru(q, eskiTeklifler.get(q.id));
    if (kaynak.tur === 'hazir') { teklifler.push({ ...q, kur: kaynak.kur }); continue; }
    const kur = await kurGetir(db, kaynak.paraBirimi, kaynak.tarih);
    if (kur === null) throw dogrulama(ILETILER.kurYok(kaynak.paraBirimi, kaynak.tarih), 'teklifler');
    teklifler.push({ ...q, kur: kur.kur });
  }
  const kilitli = karar === null ? null : { ...karar, ...(await kurKilidiniKur(db, kurKilidiIsi(eski?.durum ?? null, t.durum, eskiKarar?.kurKilidi ?? null), teklifler, eskiKarar)) };
  // Ayarlar hiç kaydedilmemişse teklifin para birimi satırı yoktur; yazmadan önce eklenir (finansın kuruna dokunulmaz).
  await s.paraBirimleriniEkle(db, kullanilanParaBirimleri({ teklifler, karar: kilitli }));
  return { ...t, karar: kilitli, senaryolar, teklifler };
}

// 1096 a: sabit kur ve faiz sunucuda kurulur. Döviz teklifinin kuru finansın bugünkü kurudur, finansta yoksa o para birimindeki
// ilk teklifin kendi günündeki kuru; TRY 1. Faiz finansın bugünkü oranıdır, yoksa boş (vade hesaba katılmaz, söylenir).
type KurKilidi = Pick<NonNullable<TalepYazimi['karar']>, 'sabitKurlar' | 'kurKilidi'>;
async function kurKilidiniKur(db: Db, is: KurKilidiIsi, teklifler: TalepYazimi['teklifler'], eski: Talep['karar'] | null): Promise<KurKilidi> {
  if (is === 'kaldir') return { sabitKurlar: [], kurKilidi: null };
  if (is === 'koru') return { sabitKurlar: eski?.sabitKurlar ?? [], kurKilidi: eski?.kurKilidi ?? null };
  const bugun = await s.bugun(db);
  const finans = await kurlar(db, bugun);
  const faiz = await faizler(db, bugun);
  const sabitKurlar: KurKilidi['sabitKurlar'] = [];
  for (const q of teklifler) {
    if (sabitKurlar.some((x) => x.paraBirimi === q.paraBirimi)) continue;
    const kur = q.paraBirimi === 'TRY' ? '1' : sade(finans.get(q.paraBirimi)?.kur ?? null) ?? q.kur;
    if (kur !== null) sabitKurlar.push({ paraBirimi: q.paraBirimi, kur, aylikFaizYuzdesi: aylikFaiz(faiz.get(q.paraBirimi)?.aylikYuzde) });
  }
  return { sabitKurlar, kurKilidi: is === 'kilitle' ? new Date().toISOString() : null };
}

// 1096 a: onaydan siparişe geçerken kilit 7 günü ya da kur %3 sapmayı aşmamış ve onay kilitten sonra verilmiş olmalı.
async function kurKilidiniDenetle(db: Db, eski: Talep, yeni: TalepDurumu, yeniOnaylar: readonly Pick<Onay, 'sonuc'>[]): Promise<void> {
  const kilit = eski.karar?.kurKilidi ?? null;
  if (kilit === null || eski.durum !== 'onayda' || (yeni !== 'siparis_verildi' && yeni !== 'teslim_alindi')) return;
  if (!kilittenSonraOnayliMi(kilit, eski.onaylar, yeniOnaylar)) throw gecersiz(ILETILER.kilittenOnceOnay);
  const finans = await kurlar(db, await s.bugun(db));
  const guncel = new Map([...finans.entries()].map(([p, k]) => [p, k.kur] as const));
  const red = kurKilidiReddi(kilit, eski.karar?.sabitKurlar ?? [], guncel, Date.now());
  if (red !== null) throw gecersiz(red);
}

// SAT-75: kaleme yeni bağlanan katalog kaleminin kartı satın alınabilir türde olmalı. Bağı değişmeyen kalem denetlenmez
// (kart sonradan değişse de eski talep düzenlenir); katalog kalemi bulunamazsa ya da kartsızsa karar burada verilmez.
// 257 a: kartı ya da birimi değişen kalem kartın birimiyle girilir; yeni bağlanan kart satın alınabilir olmalıdır.
type KalemOzu = { id: string; katalogId: string | null; ad: string; birim: string };
async function kalemKartlariniDenetle(db: Db, kalemler: readonly KalemOzu[], eskiler: readonly KalemOzu[]): Promise<void> {
  const eski = new Map(eskiler.map((x) => [x.id, x]));
  const yeniBaglar = new Set(kalemler.flatMap((x) => (x.katalogId !== null && eski.get(x.id)?.katalogId !== x.katalogId ? [x.katalogId] : [])));
  const idler = [...new Set(kalemler.flatMap((x) => (x.katalogId !== null && (yeniBaglar.has(x.katalogId) || eski.get(x.id)?.birim !== x.birim) ? [x.katalogId] : [])))];
  if (idler.length === 0) return;
  const baglar = await s.katalogMalzemeNolari(db, idler);
  const kartlar = await malzemeOzetleri(db, baglar.flatMap((x) => (x.no === null ? [] : [x.no])));
  const kartBirimi = new Map<string, string>();
  for (const b of baglar) {
    const kart = b.no === null ? undefined : kartlar.get(b.no);
    const red = kart === undefined || !yeniBaglar.has(b.id) ? null : satinAlinabilirKartReddi(kart);
    if (red !== null) throw dogrulama(red, 'kalemler');
    kartBirimi.set(b.id, kart?.birim ?? '');
  }
  const red = kartBirimiReddi(kalemler, eskiler, kartBirimi);
  if (red !== null) throw gecersiz(red);
}

export async function talepAc(db: Db, k: Kullanici, gelen: TalepYazimi, izYaz: FiyatIziYazici): Promise<Talep> {
  if (!k.islemler.includes(ISLEM.yaz) && (!talepEdenDurumu(gelen.durum) || gelen.teklifler.length > 0 || gelen.karar !== null)) {
    throw yetkiYok(ILETILER.yalnizTaslak);
  }
  // B-002: açılış taslaktan geçiştir; onaya ve siparişe açılışta geçilmez.
  if (!gecisVarMi('taslak', gelen.durum)) throw gecersiz(ILETILER.acilisDurumu);
  const esikRed = basamakEsigiReddi(gelen);
  if (esikRed !== null) throw gecersiz(esikRed);
  const t = await sunucuAlanlari(db, k, gelen, null);
  await kalemKartlariniDenetle(db, t.kalemler, []);
  const talepEden = await talepEdeniDenetle(db, k, t.talepEdenKisiId);
  await birimiDenetle(db, t.birim);
  await emriDenetle(db, t.uretimEmriId, null);
  await projeyiDenetle(db, t, null);
  const no = await belgeNo(db, 'satin-alma.talep-no', (x) => s.talepNoVarMi(db, x));
  await kisitKorumali({}, () => s.talepEkle(db, t, no, talepEden, k.id), { CAKISMA: ILETILER.talepVar });
  await s.altKayitlariYaz(db, t, siparisNoVerici(db));
  await siparisRevizyonlariniYaz(db, t.id);
  for (const h of t.hareketler) await s.hareketEkle(db, t.id, h.id, h.metin, k.id);
  return gorunen(k, fiyatIziniYaz(izYaz, null, (await talepOku(db, t.id))!));
}

// #375: talep edenin eline geçen her talep onun görünümüyle döner (teklif, fiyat, tedarikçi, karar yok).
const gorunen = (k: Kullanici, t: Talep): Talep => (tamGorurMu(k.islemler) ? t : talepEdenGorunumu(t, k.id));
// 2414 a madde 6: birleştirilmiş kaynak talep, talep edene kendi kalemleriyle (birleşik talepten süzülmüş) görünür.
const kaynakGorunumu = (t: Talep, kisiId: number, birlesenler: ReadonlyMap<string, Talep>): Talep =>
  talepEdenGorunumu(t, kisiId, t.birlesme == null ? undefined : birlesenler.get(t.birlesme.talepId));

// #375: ana sayfadaki "Taleplerim": yalnız kişinin açtığı ya da adına açılan talepler, yeniden eskiye.
export async function taleplerim(db: Db, k: Kullanici, sinir: number): Promise<TaleplerimCevabi> {
  const satirlar = await s.talepSatirlariOku(db, k.id);
  const { talepler, birlesenler } = await birlesmeyleKur(db, satirlar.slice(0, sinir));
  const baglar = await kalemBagGorunumu(db, [...talepler.map((t) => t.id), ...birlesenler.keys()]);
  const gorunenler = talepler.map((t) => kaynakGorunumu(t, k.id, birlesenler));
  const karsiliklar = await kalemKarsiliklari(db, gorunenler);
  return { talepler: gorunenler.map((t) => talebim(t, baglar, karsiliklar)), toplam: satirlar.length };
}

// SAT-79 (2871-1 a): talep eden kendi taslağını Taleplerim'den düzenler. Yalnız sahibi (açan ya da adına açılan) ve yalnız teklif istenmeden önce;
// var olan kalemin kartı, adı ve birimi değişmez (miktar ve açıklama değişir), yeni kalem hızlı açmadaki gibi karttan ya da adıyla gelir.
// Kayıt talepKaydet'ten geçer: değişiklik sınıfı, sürüm, kart ve geçiş denetimleri aynıdır; cevap talep edenin görünümüdür (#375).
export async function talebimiDuzenle(db: Db, k: Kullanici, id: string, g: TalebimiDuzenleYazimi, izYaz: FiyatIziYazici): Promise<Talebim> {
  const eski = await talepOku(db, id);
  if (eski === null) throw bulunamadi(ILETILER.talepYok);
  if (eski.acanKisiId !== k.id && eski.talepEdenKisiId !== k.id) throw yetkiYok(ILETILER.talebimSahibiDegil);
  if (!talebimDuzenlenirMi(eski)) throw gecersiz(ILETILER.talebimDuzenlenmez);
  const bagli = new Set((await s.kalemBaglariOku(db, [id])).map((b) => b.kalemId));
  const kalemRed = talebimKalemReddi(eski.kalemler.map((x) => ({ id: x.id, miktar: x.miktar, bagli: bagli.has(x.id) })), g.kalemler);
  if (kalemRed !== null) throw gecersiz(kalemRed);
  const kalemler = await talebimKalemleri(db, k, eski, g.kalemler, false);
  const baslik = talebimBasligi(eski, kalemler);
  const taban = tamGorurMu(k.islemler) ? eski : talepEdenGorunumu(eski, k.id);
  await talepKaydet(db, k, id, { ...taban, baslik, ihtiyacTarihi: g.ihtiyacTarihi, notlar: g.aciklama, kalemler, surum: g.surum }, izYaz);
  const son = (await talepOku(db, id))!;
  return talebim(gorunen(k, son), await kalemBagGorunumu(db, [id]), await kalemKarsiliklari(db, [son]));
}

// SAT-79, SAT-80: talep edenin gönderdiği kalemler. Kimlikli kalem eski talebin kalemidir: kartı, adı ve birimi eskiden alınır, miktar ve açıklama
// yenidir (güncelleme talebinde yeni kimlikle kopyalanır). Kimliksiz kalem hızlı açmadaki gibi karttan (satın alınabilir kart) ya da adıyla gelir.
async function talebimKalemleri(
  db: Db, k: Kullanici, eski: Talep, gelen: TalebimiDuzenleYazimi['kalemler'], kopya: boolean,
): Promise<TalepYazimi['kalemler']> {
  gelen.forEach((x, i) => {
    const red = x.id === null ? hizliKalemReddi(x) : null;
    if (red !== null) throw dogrulama(red, `kalemler.${i}`);
  });
  const nolar = [...new Set(gelen.flatMap((x) => (x.id !== null || x.malzemeNo === null ? [] : [x.malzemeNo])))];
  const kartlar = await malzemeOzetleri(db, nolar);
  for (const no of nolar) {
    const red = satinAlinabilirKartReddi(kartlar.get(no));
    if (red !== null) throw dogrulama(red, 'kalemler');
  }
  if (nolar.length > 0) await s.katalogEklemeKilidi(db);
  const katalog = new Map((await s.katalogBaglari(db, nolar)).map((b) => [b.no, b.id]));
  for (const no of nolar.filter((n) => !katalog.has(n))) {
    katalog.set(no, (await katalogKaydet(db, k, { id: randomUUID(), malzemeNo: no, ozellik: '', notlar: '', takmaAdlari: [], surum: null })).id);
  }
  const kartsizKategori = eski.kalemler.find((x) => x.katalogId === null)?.kategori ?? KARTSIZ_KATEGORI.malzeme;
  return gelen.map((x) => {
    const var_ = x.id === null ? undefined : eski.kalemler.find((e) => e.id === x.id)!;
    if (var_ !== undefined) {
      const { id, katalogId, ad, birim, kategori } = var_;
      return { id: kopya ? randomUUID() : id, katalogId, ad, birim, kategori, miktar: sade(x.miktar), ozellik: x.aciklama };
    }
    const kk = x.malzemeNo === null ? null : kartKopyasi(kartlar.get(x.malzemeNo)!);
    return {
      id: randomUUID(), katalogId: x.malzemeNo === null ? null : katalog.get(x.malzemeNo)!, ad: kk?.ad ?? x.ad, ozellik: x.aciklama,
      miktar: sade(x.miktar), birim: kk?.birim ?? x.birim, kategori: kk?.kategori ?? kartsizKategori,
    };
  });
}
// Başlık hızlı açmanın ürettiği başlıksa kalemlerle yenilenir; elle yazılmış başlık korunur.
const talebimBasligi = (eski: Talep, kalemler: TalepYazimi['kalemler']): string =>
  (eski.baslik === hizliBaslik(eski.kalemler.map((x) => x.ad)) ? hizliBaslik(kalemler.map((x) => x.ad)) : eski.baslik);

// SAT-80 (2876, 2871-1 b): teklif toplanırken sahibi güncelleme talebi açar. Eski talep, teklifleri ve tedarikçiye giden istekler değişmez;
// yeni talep taslak açılır, eski talebin birim, emir, proje, öncelik ve talep edenini alır ve kök talebe bağlanır (zincir yok). İki talebin
// geçmişine birbirinin numarası yazılır. Eski talebin sürümü, sahibin gördüğü hâlin güncel olduğunu denetler (409).
export async function guncellemeAc(db: Db, k: Kullanici, id: string, g: TalebimGuncellemeYazimi, izYaz: FiyatIziYazici): Promise<Talebim> {
  const eski = await talepOku(db, id);
  if (eski === null) throw bulunamadi(ILETILER.talepYok);
  if (eski.acanKisiId !== k.id && eski.talepEdenKisiId !== k.id) throw yetkiYok(ILETILER.talebimSahibiDegil);
  const red = guncellemeReddi(eski, (await s.kalemBaglariOku(db, [id])).length > 0);
  if (red !== null) throw gecersiz(red);
  if (g.surum !== eski.surum) throw eskiSurum();
  const kalemRed = talebimKalemReddi(eski.kalemler.map((x) => ({ id: x.id, miktar: x.miktar, bagli: false })), g.kalemler);
  if (kalemRed !== null) throw gecersiz(kalemRed);
  const kalemler = await talebimKalemleri(db, k, eski, g.kalemler, true);
  const t: TalepYazimi = {
    id: g.id, baslik: talebimBasligi(eski, kalemler), birim: eski.birim, talepEdenKisiId: eski.talepEdenKisiId, oncelik: eski.oncelik,
    ihtiyacTarihi: g.ihtiyacTarihi, notlar: g.aciklama, durum: 'taslak', iptalNedeni: '', agirliklar: null, kalemler, teklifIstekleri: [],
    teklifler: [], karar: null, onaylar: [], hareketler: [], senaryolar: [], uretimEmriId: eski.uretimEmriId, projeId: eski.projeId ?? null,
  };
  const acilan = await talepAc(db, k, t, izYaz);
  const kok = (await s.talepSatirlariIdlerle(db, [id]))[0]!.guncellenenTalepId ?? id;
  await s.guncellenenTalepYaz(db, g.id, kok);
  await s.hareketEkle(db, id, randomUUID(), `Güncelleme talebi açıldı: ${acilan.no}`, k.id);
  await s.hareketEkle(db, g.id, randomUUID(), `${eski.no} talebinin güncellemesi olarak açıldı.`, k.id);
  const son = (await talepOku(db, g.id))!;
  return talebim(gorunen(k, son), await kalemBagGorunumu(db, [g.id]), await kalemKarsiliklari(db, [son]));
}

// SAT-81 (2871-2 a): gruptaki talep siparişe geçince öteki açık talepler aynı işlemde iptal olur; gerekçe iptal nedenine ve geçmişe yazılır.
// İptal genel kayıttan geçer (onay bildirimi kapanır, Logo iptali işaretlenir) ve "İptali geri al" ile geri alınır.
async function guncellemeGrubunuKapat(db: Db, k: Kullanici, siparisteki: Talep, izYaz: FiyatIziYazici): Promise<void> {
  const grup = (await s.guncellemeGruplariOku(db, [siparisteki.id]));
  for (const u of guncellemeIptalleri(grup, siparisteki.id)) {
    const o = (await talepOku(db, u.id))!;
    const neden = ILETILER.guncellemeIptali(siparisteki.no);
    const hareket = { id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, metin: `${neden} Talep kendiliğinden iptal edildi; iptal geri alınabilir.` };
    await talepKaydet(db, k, o.id, { ...o, durum: 'iptal', iptalNedeni: neden, hareketler: [...o.hareketler, hareket], surum: o.surum }, izYaz);
  }
}

// SAT-78 (2871): kalemlerin kg ile stok birimi karşılığı; kart bilgisi malzemelerden toplu okunur (talep sayısından bağımsız iki sorgu).
async function kalemKarsiliklari(db: Db, talepler: readonly Talep[]): Promise<Map<string, BirimKarsiligi>> {
  const kalemler = talepler.flatMap((t) => t.kalemler).filter((x) => x.katalogId !== null && x.miktar !== null);
  if (kalemler.length === 0) return new Map();
  const nolar = new Map((await s.katalogMalzemeNolari(db, [...new Set(kalemler.map((x) => x.katalogId!))])).map((r) => [r.id, r.no]));
  const bilgiler = await malzemeMaliyetBilgileri(db, [...nolar.values()].flatMap((n) => (n === null ? [] : [n])));
  return new Map(kalemler.flatMap((x) => {
    const no = nolar.get(x.katalogId!);
    const c = birimKarsiligi(x.miktar, x.birim, no == null ? undefined : bilgiler.get(no));
    return c === null ? [] : [[x.id, c] as const];
  }));
}

// 2881: revizyonu olmayan parçada alan hiç gelmez (eski bağ biçimi değişmez).
const revizyonAlani = (r: string | undefined): { revizyon?: string } => (r === undefined ? {} : { revizyon: r });
// 2429: talep ve açılış verisi kalem bağlarını taşır; adlar sahiplerinden (malzeme kartı, iş emri, firma). Okunamayan numarayla gelir.
async function kalemBaglariKur(db: Db, talepIdleri: readonly string[]): Promise<Map<string, KalemBagiCikisi[]>> {
  const satirlar = talepIdleri.length === 0 ? [] : await s.kalemBaglariOku(db, talepIdleri);
  if (satirlar.length === 0) return new Map();
  const uygulananlar = [...new Set(satirlar.flatMap((r) => (r.uygulananMalzemeNo === null ? [] : [r.uygulananMalzemeNo])))];
  const kartlar = await malzemeOzetleri(db, uygulananlar);
  // 2881: teklif isteme metni parçanın o anki yürürlükteki revizyonunu yazar (değişiklik yönetimi).
  const revizyonlar = uygulananlar.length === 0 ? new Map<number, string>() : await parcaRevizyonuCozucu(db, uygulananlar);
  const isler = await isEmriOzetleri(db, satirlar.flatMap((r) => (r.isEmriId === null ? [] : [r.isEmriId])));
  const firmaId = (id: number) => { const k = isler.get(id)?.kaynak; return k?.tur === 'fason' ? k.id : null; };
  const firmalar = await firmaOzetleri(db, [...new Set([...isler.keys()].flatMap((id) => { const f = firmaId(id); return f === null ? [] : [f]; }))]);
  const m = new Map<string, KalemBagiCikisi[]>();
  for (const r of satirlar) {
    const kart = r.uygulananMalzemeNo === null ? undefined : kartlar.get(r.uygulananMalzemeNo);
    const ie = r.isEmriId === null ? null : (isler.get(r.isEmriId) ?? null);
    const f = r.isEmriId === null ? null : firmaId(r.isEmriId);
    const bag: KalemBagiCikisi = {
      kalemId: r.kalemId,
      uygulanan: r.uygulananMalzemeNo === null ? null
        : { no: r.uygulananMalzemeNo, kod: kart?.kod ?? null, ad: kart?.ad ?? null, ...revizyonAlani(revizyonlar.get(r.uygulananMalzemeNo)) },
      fason: r.isEmriId === null ? null : {
        isEmriId: r.isEmriId, uretimEmriId: ie?.uretimEmriId ?? null, emirNo: ie?.emirNo || null, opNo: ie?.opNo ?? null, adim: ie?.ad ?? null,
        firmaId: f, firmaAdi: f === null ? null : (firmalar.get(f)?.ad ?? null),
      },
    };
    m.set(r.talepId, [...(m.get(r.talepId) ?? []), bag]);
  }
  return m;
}

// 898 a: kalem bağlarının görünen hâli; adlar sahiplerinden (malzeme kartı, iş emri). Silinmiş kart ya da iş emri numarayla yazılır.
async function kalemBagGorunumu(db: Db, talepIdleri: readonly string[]): Promise<Map<string, KalemBagi>> {
  const satirlar = talepIdleri.length === 0 ? [] : await s.kalemBaglariOku(db, talepIdleri);
  const kartlar = await malzemeOzetleri(db, satirlar.flatMap((r) => (r.uygulananMalzemeNo === null ? [] : [r.uygulananMalzemeNo])));
  const ozetler = await isEmriOzetleri(db, satirlar.flatMap((r) => (r.isEmriId === null ? [] : [r.isEmriId])));
  const isler = new Map(satirlar.flatMap((r) => (r.isEmriId === null ? [] : [r.isEmriId])).map((id) => {
    const o = ozetler.get(id);
    return [id, o === undefined ? `#${id}` : `${o.emirNo} · Op ${o.opNo}`] as const;
  }));
  return new Map(satirlar.map((r) => {
    const kart = r.uygulananMalzemeNo === null ? undefined : kartlar.get(r.uygulananMalzemeNo);
    return [r.kalemId, {
      uygulanan: r.uygulananMalzemeNo === null ? null : kart ? `${kart.kod} · ${kart.ad ?? ''}`.trim() : `#${r.uygulananMalzemeNo}`,
      fasonAdim: r.isEmriId === null ? null : isler.get(r.isEmriId)!,
    }];
  }));
}

// 898 a: ön talep yalnız planlı ya da başlamış emrin fason adımıdır; taslak emir henüz yayımlanmamıştır.
async function acikFasonlar(db: Db) {
  const l = await fasonIsEmirleri(db);
  const durumlar = await emirDurumlari(db, l.map((x) => x.uretimEmriId));
  return l.filter((x) => emirAcikMi(durumlar.get(x.uretimEmriId)));
}

// 898 a: fason ön talepler (açık, bağsız, yoksayılmamış, gönderilmemiş) ve hâlâ açık adımların yoksayma kararları. Talep açabilen herkes
// görür (903 a: yeni işlem yok); fiyat ve tedarikçi seçimi yoktur, firma rotadakidir; firmasız adım (2874) firma bekler. Dal 2: plan ihtiyacı fason adımların ardından gelir.
export async function onTalepleri(db: Db): Promise<OnTalepleriCevabi> {
  const adaylar = await acikFasonlar(db);
  const acik = new Map(adaylar.map((x) => [x.isEmriId, x]));
  const bagli = await s.fasonBagliIsEmirleri(db, [...acik.keys()]);
  const yoksaylar = (await s.fasonYoksaylari(db)).filter((y) => acik.has(y.isEmriId));
  const liste = fasonOnTalepAdaylari(adaylar, bagli, new Set(yoksaylar.map((y) => y.isEmriId)));
  const plan = await planOnTalepleri(db);
  const kartlar = await malzemeOzetleri(db, [...liste.flatMap((x) => (x.malzemeNo === null ? [] : [x.malzemeNo])), ...plan.yoksaylar.map((y) => y.malzemeNo)]);
  const firmalar = await firmaOzetleri(db, [...new Set(liste.flatMap((x) => (x.firmaId === null ? [] : [x.firmaId])))]);
  const kisiler = await kisiAdlari(db, [...yoksaylar, ...plan.yoksaylar].map((y) => y.kisiId));
  const ad = (x: { emirNo: string; opNo: number; adim: string | null }) => `${x.emirNo} · Op ${x.opNo}${x.adim ? ` ${x.adim}` : ''}`;
  const kartAdi = (no: number) => { const k = kartlar.get(no); return k ? `${k.kod}${k.ad ? ` ${k.ad}` : ''}` : String(no); };
  return {
    onTalepler: [
      ...liste.map((x) => {
        const kart = x.malzemeNo === null ? undefined : kartlar.get(x.malzemeNo);
        return {
          kaynak: 'fason' as const, isEmriId: x.isEmriId, uretimEmriId: x.uretimEmriId, emirNo: x.emirNo, opNo: x.opNo, adim: x.adim,
          parca: kart && x.malzemeNo !== null ? { no: x.malzemeNo, kod: kart.kod, ad: kart.ad ?? '' } : null, urun: x.urun,
          miktar: x.adet, birim: 'adet', gerekenTarih: x.teslim, terminGun: x.terminGun,
          firmaAdi: x.firmaId === null ? null : (firmalar.get(x.firmaId)?.ad ?? null), ...(x.firmaId === null ? { firmaBekleniyor: true } : {}),
        };
      }),
      ...plan.onTalepler,
    ],
    yoksayilanlar: [
      ...yoksaylar.map((y) => ({
        id: y.id, kaynak: 'fason' as const, baslik: ad(acik.get(y.isEmriId)!), neden: y.neden, kisiAdi: kisiler.get(y.kisiId) ?? null, zaman: y.zaman,
      })),
      ...plan.yoksaylar.map((y) => ({
        id: y.id, kaynak: 'plan' as const, baslik: kartAdi(y.malzemeNo), neden: y.neden, kisiAdi: kisiler.get(y.kisiId) ?? null, zaman: y.zaman,
      })),
    ],
  };
}
// Plan ihtiyacının ön talepleri ve hâlâ ihtiyaçta olan malzemelerin yoksayma kararları.
async function planOnTalepleri(db: Db) {
  const ihtiyaclar = await s.planIhtiyaclariOku(db);
  const nolar = ihtiyaclar.map((i) => i.malzemeNo);
  const kartlar = await malzemeOzetleri(db, nolar);
  const yoksaylar = (await s.planYoksaylari(db)).filter((y) => nolar.includes(y.malzemeNo));
  const adaylar = planOnTalepAdaylari({
    ihtiyaclar,
    birimler: new Map(nolar.map((n) => [n, kartlar.get(n)?.birim ?? null])),
    siparisler: await s.malzemeGelisleriOku(db, nolar),
    talepler: await s.acikTalepMiktarlari(db, nolar),
    yoksaylar: new Map(yoksaylar.map((y) => [y.malzemeNo, y.miktar])),
  });
  return {
    adaylar,
    yoksaylar,
    onTalepler: adaylar.flatMap((a) => {
      const k = kartlar.get(a.malzemeNo);
      if (!k) return [];
      return [{
        kaynak: 'plan' as const, malzeme: { no: a.malzemeNo, kod: k.kod, ad: k.ad ?? '' }, miktar: a.miktar, birim: k.birim ?? '',
        gerekenTarih: a.gerekenTarih, emirler: a.emirler, stokBilinmiyor: a.stokBilinmiyor, hesap: a.hesap,
      }];
    }),
  };
}
// Yalnız açık fason adım ya da gösterilen plan ihtiyacı yoksayılır. Fasonda ikinci kez yoksaymak ilk kararı bozmaz; planda karar o anki
// kalanla yenilenir.
export async function onTalepYoksay(db: Db, k: Kullanici, g: OnTalepYoksayYazimi): Promise<{ tamam: true }> {
  if (g.kaynak === 'plan') {
    const a = (await planOnTalepleri(db)).adaylar.find((x) => x.malzemeNo === g.malzemeNo);
    if (!a) throw dogrulama(ILETILER.planOnTalepYok, 'malzemeNo');
    await s.planYoksayYaz(db, { malzemeNo: g.malzemeNo, miktar: a.kalan, neden: g.neden, kisiId: k.id });
    return { tamam: true };
  }
  if (!(await acikFasonlar(db)).some((x) => x.isEmriId === g.isEmriId)) throw dogrulama(ILETILER.fasonOnTalepYok, 'isEmriId');
  await s.fasonYoksayEkle(db, { isEmriId: g.isEmriId, neden: g.neden, kisiId: k.id });
  return { tamam: true };
}
export async function onTalepGeriAl(db: Db, id: number): Promise<{ tamam: true }> {
  if (!(await s.onTalepYoksaySil(db, id))) throw bulunamadi(ILETILER.onTalepYoksayYok);
  return { tamam: true };
}

// 2874-1 a: sipariş verilince firması seçilmemiş fason adımın firması siparişin tedarikçisidir. Bir adıma iki tedarikçiden sipariş
// verildiyse firma seçilmez (hangisi olduğu uydurulmaz); adım "firma bekleniyor" kalır, emir ekranından seçilir.
async function fasonFirmalariniYaz(db: Db, k: Kullanici, talepId: string): Promise<void> {
  const satirlar = await s.siparisFasonFirmalari(db, talepId);
  for (const x of satirlar) {
    if (satirlar.filter((y) => y.isEmriId === x.isEmriId).length !== 1) continue;
    await fasonFirmasiniSiparistenYaz(db, k.id, x.isEmriId, x.firmaId);
  }
}

// 898 a: talebe çevrilen fason adım açık, bağsız olmalı; denetim ile yazma arası iş emri başına kilitlidir. Uygulanan kart fiziksel karttır.
async function hizliBaglariDenetle(db: Db, g: HizliAcYazimi): Promise<void> {
  const isler = g.kalemler.flatMap((x) => (x.isEmriId === null ? [] : [x.isEmriId]));
  await s.fasonBagKilidi(db, isler);
  const acik = isler.length === 0 ? new Map<number, number>()
    : new Map((await acikFasonlar(db)).map((x) => [x.isEmriId, x.uretimEmriId]));
  const bagli = await s.fasonBagliIsEmirleri(db, isler);
  const red = hizliBagReddi(g.tur, g.kalemler, g.uretimEmriId, (i) => (bagli.has(i) ? undefined : acik.get(i)));
  if (red !== null) throw dogrulama(red, 'kalemler');
  const uygulananlar = [...new Set(g.kalemler.flatMap((x) => (x.uygulananMalzemeNo === null ? [] : [x.uygulananMalzemeNo])))];
  const kartlar = await malzemeOzetleri(db, uygulananlar);
  for (const no of uygulananlar) {
    const kartRed = uygulananKartReddi(kartlar.get(no));
    if (kartRed !== null) throw dogrulama(kartRed, 'kalemler');
  }
}

// #375: ana sayfadan talep. Kişi her zaman oturumdaki kişidir; kart seçilen kalem kataloğa bağlanır (katalogda yoksa karttan açılır),
// kartsız kalem "kart bekliyor" kalır. Talep taslak açılır: satın almanın iş kutusundadır, talep eden düzeltip silebilir.
// Numara ayardaki kalıptan gelir. Talep ve sipariş numarası Logo fiş numarası olur; sığmayan kalıp kayıt açtırmaz.
const LOGO_FIS_NO_EN_COK = 16;
async function belgeNo(db: Db, anahtar: 'satin-alma.talep-no' | 'satin-alma.siparis-no',
  varMi: (no: string) => Promise<boolean>): Promise<string> {
  const no = await numaraAl(db, anahtar, { varMi });
  if (no.length > LOGO_FIS_NO_EN_COK) throw gecersiz(ILETILER.numaraUzun);
  return no;
}
const siparisNoVerici = (db: Db) => () => belgeNo(db, 'satin-alma.siparis-no', (x) => s.siparisNoVarMi(db, x));

// 2428-1: fason talebi her kalem için dış işlem emri açar, taleple aynı işlemde (biri düşerse talep de açılmaz). Emrin adımında var olan
// belge bağlanır, ikincisi açılmaz; partide yeni belge açılır: parça uygulanan kart, işlem kalemin hizmet kartı, termin talebin ihtiyaç tarihi.
async function fasonDieleriAc(db: Db, k: Kullanici, g: HizliAcYazimi): Promise<(number | null)[]> {
  const idler: (number | null)[] = [];
  for (const x of g.kalemler) {
    const aciklama = x.aciklama === '' ? null : x.aciklama;
    const acilan = x.isEmriId !== null
      ? await dieAc(db, k.id, { kaynak: 'emir', isEmriId: x.isEmriId, aciklama }, { acilis: 'talep', varsaVer: true })
      : await dieAc(db, k.id, {
        kaynak: 'parti', malzemeNo: x.uygulananMalzemeNo!, partiId: x.partiId!, konumId: x.konumId, operasyonTipiId: null, hizmetNo: x.malzemeNo,
        adet: Number(x.miktar), firmaId: null, planlananGidis: null, termin: g.ihtiyacTarihi, aciklama,
      }, { acilis: 'talep' });
    idler.push(acilan.id);
  }
  return idler;
}

export async function hizliAc(db: Db, k: Kullanici, g: HizliAcYazimi, izYaz: FiyatIziYazici): Promise<Talebim> {
  g.kalemler.forEach((x, i) => {
    const red = hizliKalemReddi(x);
    if (red !== null) throw dogrulama(red, `kalemler.${i}`);
  });
  const fasonRed = fasonKalemReddi(g.tur, g.kalemler);
  if (fasonRed !== null) throw dogrulama(fasonRed.ileti, `kalemler.${fasonRed.sira}`);
  await hizliBaglariDenetle(db, g);
  const nolar = [...new Set(g.kalemler.flatMap((x) => (x.malzemeNo === null ? [] : [x.malzemeNo])))];
  const kartlar = await malzemeOzetleri(db, nolar);
  for (const no of nolar) {
    const red = talepKartiReddi(kartlar.get(no), g.tur);
    if (red !== null) throw dogrulama(red, 'kalemler');
  }
  if (nolar.length > 0) await s.katalogEklemeKilidi(db);
  const baglar = new Map((await s.katalogBaglari(db, nolar)).map((b) => [b.no, b.id]));
  for (const no of nolar.filter((n) => !baglar.has(n))) {
    const yeni = await katalogKaydet(db, k, { id: randomUUID(), malzemeNo: no, ozellik: '', notlar: '', takmaAdlari: [], surum: null });
    baglar.set(no, yeni.id);
  }
  const kalemler: TalepYazimi['kalemler'] = g.kalemler.map((x) => {
    const kart = x.malzemeNo === null ? null : kartlar.get(x.malzemeNo)!;
    const kopya = kart === null ? null : kartKopyasi(kart);
    return {
      id: randomUUID(), katalogId: x.malzemeNo === null ? null : baglar.get(x.malzemeNo)!, ad: kopya?.ad ?? x.ad, ozellik: x.aciklama,
      miktar: sade(x.miktar), birim: kopya?.birim ?? x.birim, kategori: kopya?.kategori ?? KARTSIZ_KATEGORI[g.tur],
    };
  });
  const t: TalepYazimi = {
    id: g.id, baslik: hizliBaslik(kalemler.map((x) => x.ad)), birim: null, talepEdenKisiId: k.id, oncelik: 'normal', ihtiyacTarihi: g.ihtiyacTarihi,
    notlar: g.aciklama, durum: 'taslak', iptalNedeni: '', agirliklar: null, kalemler, teklifIstekleri: [], teklifler: [], karar: null,
    onaylar: [], hareketler: [], senaryolar: [], uretimEmriId: g.uretimEmriId, projeId: null,
  };
  const acilan = await talepAc(db, k, t, izYaz);
  const dieler = g.tur === 'fason' ? await fasonDieleriAc(db, k, g) : g.kalemler.map(() => null);
  await s.kalemBaglariYaz(db, t.id, g.kalemler.flatMap((x, i) => (x.uygulananMalzemeNo === null && x.isEmriId === null && dieler[i] === null ? []
    : [{ kalemId: kalemler[i]!.id, uygulananMalzemeNo: x.uygulananMalzemeNo, isEmriId: x.isEmriId, dieId: dieler[i] ?? null }])));
  return talebim(acilan, await kalemBagGorunumu(db, [t.id]), await kalemKarsiliklari(db, [acilan]));
}

// E-13: Kalite Merkezi stok üzerinden satın almayı ithal eder; tedarikçi onay durumunu sunucu açılışında kablolama kaydeder (ADR 0006).
// Kayıtsız süreçte (çözücüyü kurmayan araç ya da test) kalite durumu bilinmez: denetlenmez ve gösterimde null'dır.
// 2424: fason adımın planlanan gidişi canlı plandaki başlangıcıdır (tesis günü). Plan satın almayı okuduğu için bağı kablolama kurar;
// bağ yoksa ya da adım canlıda değilse boş.
export type PlanlananGidisCozucusu = (db: Db, isEmriIdleri: readonly number[]) => Promise<readonly { isEmriId: number; baslangic: string }[]>;
let planlananGidisCozucu: PlanlananGidisCozucusu | null = null;
export function planlananGidisCozucusuKaydet(cozucu: PlanlananGidisCozucusu | null): void { planlananGidisCozucu = cozucu; }
async function planlananGidisler(db: Db, isEmriIdleri: readonly number[]): Promise<Map<number, string>> {
  if (planlananGidisCozucu === null || isEmriIdleri.length === 0) return new Map();
  const gunu = (z: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(z));
  const m = new Map<number, string>();
  for (const y of await planlananGidisCozucu(db, isEmriIdleri)) {
    const g = gunu(y.baslangic);
    if (!m.has(y.isEmriId) || g < m.get(y.isEmriId)!) m.set(y.isEmriId, g);
  }
  return m;
}
// 2426: stok satın almayı ithal eder; firmanın fason kutusu çözücüyle gelir (sunucu/kablolama.ts).
export type FasonKonumuCozucusu = (db: Db, firmaIdler: readonly number[]) => Promise<ReadonlyMap<number, number>>;
let fasonKonumuCozucu: FasonKonumuCozucusu | null = null;
export function fasonKonumuCozucusuKaydet(cozucu: FasonKonumuCozucusu | null): void { fasonKonumuCozucu = cozucu; }
export type KaliteDurumuCozucusu = (db: Db, firmaIdler: readonly number[]) => Promise<ReadonlyMap<number, KmTedarikciDurumu>>;
let kaliteDurumuCozucu: KaliteDurumuCozucusu | null = null;
export function kaliteDurumuCozucusuKaydet(cozucu: KaliteDurumuCozucusu | null): void { kaliteDurumuCozucu = cozucu; }
const kaliteDurumlari = async (db: Db, firmaIdler: readonly number[]): Promise<ReadonlyMap<number, KmTedarikciDurumu>> =>
  kaliteDurumuCozucu === null || firmaIdler.length === 0 ? new Map() : kaliteDurumuCozucu(db, firmaIdler);

// SAT-76, E-13 (236 a): tedarikçinin Kalite Merkezi onayı "Aday" ya da "Askıda" ise yeni sipariş verilmez. Durum firma kimliğiyle okunur;
// satın almanın eski durum sütunu bakılmaz. Ad firma kartından okunur; kartı olmayan firmanın kimliği yazılır.
async function askidakiTedarikciyiDenetle(db: Db, eski: Talep, yeni: TalepYazimi): Promise<void> {
  const yeniler = yeniSiparisFirmalari(eski, yeni);
  if (yeniler.length === 0) return;
  const durumlar = await kaliteDurumlari(db, yeniler);
  const reddedilen = yeniler.filter((id) => kaliteSiparisReddi(durumlar.get(id)));
  if (reddedilen.length === 0) return;
  const firmalar = await firmaOzetleri(db, reddedilen);
  const red = askidakiTedarikciReddi(reddedilen.map((id) => `${firmalar.get(id)?.ad ?? `#${id}`} (${durumlar.get(id)})`));
  if (red !== null) throw gecersiz(red);
}

// SAT-07, SAT-30, SAT-45, SAT-64: değişiklik sınıflanır, gereken işlem aranır, durum geçişi ve dört göz denetlenir; sonra sürümle yazılır.
export async function talepKaydet(db: Db, k: Kullanici, id: string, g: TalepKaydetYazimi, izYaz: FiyatIziYazici, iptaldenDonus?: TalepDurumu): Promise<Talep> {
  if (g.id !== id) throw dogrulama('Kimlik adresle aynı olmalı.', 'id');
  const eski = await talepOku(db, id);
  if (eski === null) throw bulunamadi(ILETILER.talepYok);
  birlesmisiReddet(eski);
  const { surum, ...gelen } = g;
  const yeni = kalemAyrintisiniKoru(eski, { ...gelen, projeId: gelen.projeId === undefined ? eski.projeId ?? null : gelen.projeId });
  const kaynakRed = kaynakKalemiReddi(eski, yeni.kalemler);
  if (kaynakRed !== null) throw gecersiz(kaynakRed);
  const kendiTaslagi = (eski.acanKisiId === k.id || eski.talepEdenKisiId === k.id) && talepEdenGovdeDurumu(eski.durum, yeni.durum);
  // Talep eden adsız teklifleri görür; değişikliği kendi gördüğü hâlle karşılaştırılır (SAT-53).
  const kiyas = tamGorurMu(k.islemler) ? eski : talepEdenGorunumu(eski, k.id);
  const red = degisiklikReddi(degisiklikTuru(kiyas, yeni), k.islemler, kendiTaslagi);
  if (red !== null) throw yetkiYok(red);
  // 2413 a: iptalden çıkış yalnız iptaliGeriAl'ın verdiği hedefe; genel kayıt iptalden çıkamaz.
  const gecer = iptaldenDonus === undefined ? gecisVarMi(eski.durum, yeni.durum) : eski.durum === 'iptal' && yeni.durum === iptaldenDonus;
  if (!gecer) throw gecersiz(ILETILER.gecisYok);
  // Boş gelen talep eden mevcut olanı korur: kaydeden kişiye sessizce dönmez.
  const talepEden = await talepEdeniDenetle(db, k, yeni.talepEdenKisiId ?? eski.talepEdenKisiId);
  await birimiDenetle(db, yeni.birim);
  await emriDenetle(db, yeni.uretimEmriId, eski.uretimEmriId);
  await projeyiDenetle(db, yeni, eski.projeId ?? null);
  // 2624 b, Veri 4: emirli kaynaktan kalemi olan birleşik talebin kalemi emirden gider; projeye de bağlanırsa iki kez sayılır.
  if (yeni.projeId != null && (eski.kaynaklar ?? []).some((x) => x.uretimEmriNo !== null)) throw dogrulama(ILETILER.projeEmirli, 'projeId');
  // Talep edenin bütününde başkalarının teklifleri yoktur: talep eden yalnız gövdeyi değiştirdiyse teklif ve karar korunur.
  // "Teslim alındı" türetilmiş durumdur: veritabanına "sipariş verildi" yazılır (SAT-38).
  const temel: TalepYazimi = k.islemler.includes(ISLEM.yaz) || tamGorurMu(k.islemler)
    ? yeni : { ...yeni, teklifler: eski.teklifler, teklifIstekleri: eski.teklifIstekleri, karar: eski.karar, senaryolar: eski.senaryolar };
  // B-002: onay yalnız onaydaki, kararı verilmiş talebe eklenir; onaylı karar ret gelmeden değişmez; sipariş onaylı karar ister.
  const yeniOnaylar = yeni.onaylar.filter((x) => !eski.onaylar.some((o) => o.id === x.id));
  if (yeniOnaylar.length > 0 && (eski.durum !== 'onayda' || temel.karar === null)) {
    throw gecersiz(ILETILER.onayDurumu);
  }
  if (kararDegistiMi(eski.karar, temel.karar) && kararOnayliMi(eski.onaylar)) throw gecersiz(ILETILER.onayliKararDegismez);
  const basamakRed = basamakKilidiReddi(eski.durum, eski, temel) ?? basamakEsigiReddi(temel);
  if (basamakRed !== null) throw gecersiz(basamakRed);
  const siparisRed = siparisReddi(eski.durum, temel.durum, temel.karar !== null, [...eski.onaylar, ...yeniOnaylar])
    ?? kartsizSiparisReddi(eski.durum, temel.durum, temel.kalemler)
    ?? terminsizSiparisReddi(eski, temel)
    ?? siparisliKalemReddi(eski, temel.kalemler)
    ?? logoSiparisDegisikligiReddi(eski, temel)
    ?? logoIptalGeriAlmaReddi(eski, temel.durum);
  if (siparisRed !== null) throw gecersiz(siparisRed);
  await kurKilidiniDenetle(db, eski, temel.durum, yeniOnaylar);
  await askidakiTedarikciyiDenetle(db, eski, temel);
  await kalemKartlariniDenetle(db, temel.kalemler, eski.kalemler);
  const sunucudan = await sunucuAlanlari(db, k, temel, eski);
  const yazilacak: TalepYazimi = sunucudan.durum === 'teslim_alindi' ? { ...sunucudan, durum: 'siparis_verildi' } : sunucudan;
  // 2540 (Veri 2, Maliyet): tedarikçi alacağı olan sipariş (düşüldü dahil) karar değişikliğiyle silinmez; para kaydı sessizce kaybolmaz.
  const kalanlar = new Set((yazilacak.karar?.siparisler ?? []).map((x) => x.teklifId));
  const silinen = (eski.karar?.siparisler ?? []).map((x) => x.teklifId).filter((x) => !kalanlar.has(x));
  if ((await alacakliSiparisler(db, id, silinen)).length > 0) throw cakisma(ALACAKLI_SIPARIS_SILINMEZ);
  await surumluGuncelle({
    guncelle: () => s.talepGuncelle(db, yazilacak, talepEden, surum),
    varMi: () => s.talepVarMi(db, id),
    bulunamadiIletisi: ILETILER.talepYok,
  });
  // 2432: onaydaki talebin kararı verilince (onay, ret) ya da talep onaydan çıkınca onaylayanlardaki görev kapanır.
  if (eski.durum === 'onayda' && (yazilacak.durum !== 'onayda' || yeniOnaylar.length > 0)) {
    await bildirimKapat(db, { tur: 'satin-alma.talep-onay-bekliyor', kaynakKimlik: id });
  }
  // 221 a: onaya yeni düşen talep onaylayanlara bildirilir; onaydayken yeniden kaydetmek yeni bildirim açmaz.
  if (yazilacak.durum === 'onayda' && eski.durum !== 'onayda') {
    await bildirimGonder(db, {
      tur: 'satin-alma.talep-onay-bekliyor', baslik: `Onay bekleyen talep: ${eski.no}`, metin: yazilacak.baslik, yol: '/satin-alma/onaylar', kaynakKimlik: id, haric: k.id,
    });
  }
  const guncellenecek = logoGuncellenecekSiparisler(eski, yazilacak);
  // 2642 b, Veri 2: faturaya eşlenmiş satır (kaldırılmış eşleme dahil) ve onun siparişi silinmez (RESTRICT).
  const oncekiSatirlar = await s.siparisSatirIdleri(db, id);
  await kisitKorumali({ satin_alma_fatura_eslemesi_satir: ILETILER.eslemeliSatir }, () => s.altKayitlariYaz(db, yazilacak, siparisNoVerici(db)));
  await siparisRevizyonlariniYaz(db, id, oncekiSatirlar);
  await s.siparisGuncellemesiniIsaretle(db, id, guncellenecek);
  const siparisteMi = (d: TalepDurumu) => d === 'siparis_verildi' || d === 'teslim_alindi';
  if (siparisteMi(yazilacak.durum) && !siparisteMi(eski.durum)) {
    await s.siparisleriLogoyaIsaretle(db, id, ILETILER.logoKayitsizTedarikci);
    await varsayilanPlanlariYaz(db, k, id);
    await fasonFirmalariniYaz(db, k, id);
    await guncellemeGrubunuKapat(db, k, eski, izYaz);
  } else if (siparisteMi(yazilacak.durum)) await otomatikPlanlariYenile(db, k, id);
  if (yazilacak.durum === 'iptal' && eski.durum !== 'iptal') {
    await s.siparisIptaliniLogoyaIsaretle(db, id);
    // Sipariş satırları iptalde kalır (geri alınabilir); finanstaki beklenen ödeme kalmamalı. Geri alınınca varsayılan plan yeniden kurulur.
    if (siparisteMi(eski.durum)) for (const x of eski.karar?.siparisler ?? []) await siparisOdemePlaniKaldir(db, { talepId: id, teklifId: x.teklifId });
  }
  // Sipariş bilgisi (beklenen teslim, tedarikçi) ya da durum değişmiş olabilir: alım satırları her kayıtta eşitlenir.
  if (siparisteMi(yazilacak.durum) || siparisteMi(eski.durum)) await alimlariBildir(db, k, id);
  if (siparisteMi(yazilacak.durum)) await kartKopyalariniAl(db, id);
  let kademeTutari: number | null | undefined;
  for (const o of yeniOnaylar) {
    // Dört göz yazılan kararın sahibine bakar (B-001): istemcinin gönderdiği ya da eski karar değil.
    // Geçmiş bu kaydın talep edenini de içerir (talep güncellemesi yazdı): kendini çıkaran da yeni atanan da onaylayamaz.
    const talepEdenler = [eski.acanKisiId, ...(eski.talepEdenKisiId === null ? [] : [eski.talepEdenKisiId]), ...(await s.talepEdenGecmisi(db, id))];
    const sonuc = dortGozSonucu(k.id, yazilacak.karar?.kararVerenKisiId ?? null, await sistemAyariOku(db, 'satin-alma.dort-goz'), talepEdenler, o.sonuc);
    if (sonuc === 'red') throw yetkiYok(ILETILER.dortGoz);
    if (sonuc === 'talepEdenRed') throw yetkiYok(ILETILER.dortGozTalepEden);
    if (await sistemAyariOku(db, 'satin-alma.onay-kademesi')) {
      const ayar = await ayarlariKur(db);
      const kademe = onayKademesiReddi(true, o.sonuc, kademeTutari ??= await kararTlToplami(db, id), ayar.onayLimitleri.map((l) => ({ ...l, rolId: l.rolId ?? null })),
        await kisininRolleri(db, k.id));
      if (kademe !== null) throw yetkiYok(kademe);
    }
    await s.onayEkle(db, id, o, k.id, sonuc === 'dortGozsuz');
  }
  // TMI A2: karar talebi açana ve talep edene haber verilir; ret gerekçesi metindedir. Karar veren kendisi almaz.
  const sonOnay = yeniOnaylar.at(-1);
  if (sonOnay !== undefined) {
    const ret = sonOnay.sonuc === 'ret';
    await bildirimGonder(db, {
      tur: ret ? 'satin-alma.talep-reddedildi' : 'satin-alma.talep-onaylandi',
      baslik: `${ret ? 'Reddedilen' : 'Onaylanan'} talep: ${eski.no}`, metin: ret && sonOnay.notlar ? `${yazilacak.baslik}. Gerekçe: ${sonOnay.notlar}` : yazilacak.baslik,
      yol: '/taleplerim', kaynakKimlik: `${id}:${eski.onaylar.length + yeniOnaylar.length}`,
      kisiler: [...new Set([eski.acanKisiId, ...(eski.talepEdenKisiId === null ? [] : [eski.talepEdenKisiId])])], haric: k.id,
    });
  }
  if (talepFisiGiderMi(eski.onaylar, yeniOnaylar, yazilacak.durum)) await s.talebiLogoyaIsaretle(db, id);
  if (yazilacak.durum === 'iptal' && eski.durum !== 'iptal') await s.talepIptaliniLogoyaIsaretle(db, id);
  const eskiHareketler = new Set(eski.hareketler.map((h) => h.id));
  for (const h of yeni.hareketler.filter((x) => !eskiHareketler.has(x.id))) await s.hareketEkle(db, id, h.id, h.metin, k.id);
  const sonra = (await talepOku(db, id))!;
  if (sonra.uretimEmriId !== eski.uretimEmriId) {
    await s.hareketEkle(db, id, randomUUID(), emirHareketi(eski.uretimEmriNo, sonra.uretimEmriNo), k.id);
  }
  if ((sonra.projeId ?? null) !== (eski.projeId ?? null)) {
    const etiket = (p: Talep['proje']) => (p == null ? null : `${p.kod} ${p.ad}`.trim());
    await s.hareketEkle(db, id, randomUUID(), projeHareketi(etiket(eski.proje), etiket(sonra.proje)), k.id);
  }
  return gorunen(k, fiyatIziniYaz(izYaz, eski, (await talepOku(db, id))!));
}

// Borç 36: talep önce kilitlenip sürümü artar, sonra okunur; aradaki teslim kaydı denetimden kaçmaz.
export async function siparisKalemiDegistir(db: Db, k: Kullanici, id: string, g: SiparisKalemiDegistirYazimi): Promise<Talep> {
  await surumluGuncelle({ guncelle: () => s.talepSurumuArttir(db, id, g.surum), varMi: () => s.talepVarMi(db, id), bulunamadiIletisi: ILETILER.talepYok });
  const eski = (await talepOku(db, id))!;
  const red = siparisKalemiDegisikligiReddi(eski, g);
  if (red !== null) throw gecersiz(red);
  const kalem = eski.kalemler.find((x) => x.id === g.kalemId)!;
  await kalemKartlariniDenetle(db, [{ ...kalem, birim: g.birim }], [kalem]);
  await s.siparisKalemiYaz(db, id, g.kalemId, g.miktar, g.birim);
  await s.siparisGuncellemesiniIsaretle(db, id, (eski.karar?.siparisler ?? []).filter((x) => x.satirlar.some((r) => r.kalemId === g.kalemId)).map((x) => x.teklifId));
  await s.hareketEkle(db, id, randomUUID(), siparisDegisikligiMetni(eski.kalemler.find((x) => x.id === g.kalemId)!, g), k.id);
  return gorunen(k, (await talepOku(db, id))!);
}

// Kart #1310, 959 b: malzemeyi tedarikçi mi getirir, biz mi alırız. Siparişten önce de sonra da değişebilir; sevkiyattaki alım kaleminin
// taşıması aynı kayıttır (son yazan kalır).
export async function teslimYontemiDegistir(db: Db, k: Kullanici, id: string, g: TeslimYontemiYazimi): Promise<Talep> {
  const once = await talepOku(db, id);
  if (once !== null) birlesmisiReddet(once);
  await surumluGuncelle({ guncelle: () => s.teslimYontemiYaz(db, id, g.teslimYontemi, g.surum), varMi: () => s.talepVarMi(db, id), bulunamadiIletisi: ILETILER.talepYok });
  await alimlariBildir(db, k, id);
  return gorunen(k, (await talepOku(db, id))!);
}
async function alimlariBildir(db: Db, k: Kullanici, id: string): Promise<void> {
  const t = (await talepOku(db, id))!;
  await alimBildir(db, { talepId: id, talepNo: t.no, alimlar: talebinAlimlari(t), kisiId: k.id });
}

// "Kalanı kapat" (#205 S2 b): talep önce kilitlenir (teslimle sıraya girer); kapatma Logo kuyruğuna girer, gerekçe harekete yazılır.
export async function siparisKapat(db: Db, k: Kullanici, id: string, g: SiparisKapatYazimi): Promise<Talep> {
  await surumluGuncelle({ guncelle: () => s.talepSurumuArttir(db, id, g.surum), varMi: () => s.talepVarMi(db, id), bulunamadiIletisi: ILETILER.talepYok });
  const eski = (await talepOku(db, id))!;
  const red = siparisKapatmaReddi(eski, g.teklifId);
  if (red !== null) throw gecersiz(red);
  if (!(await s.siparisiKapatmayaIsaretle(db, id, g.teklifId))) throw gecersiz(ILETILER.kapatmaVar);
  const sip = eski.karar!.siparisler.find((x) => x.teklifId === g.teklifId)!;
  await s.hareketEkle(db, id, randomUUID(), `Sipariş ${sip.no ?? sip.siparisNo} kalanı kapatıldı: ${g.gerekce}`, k.id);
  // 2472: plan aynı işlemde gerçekleşen teslim değerine iner; notlar tutar taşır, yazarı kapatan kişidir (talep eden görmez).
  await otomatikPlanlariYenile(db, k, id, 'gerçekleşen teslim değerine göre');
  await kapanisPlanNotlari(db, k, id, g.teklifId);
  return gorunen(k, (await talepOku(db, id))!);
}
// 2472: avans gerçekleşen değeri aşarsa (M2: KDV dahil, sipariş dövizinde) ve değişmeyen (elle ya da faturalı) plan gerçekleşen değerden
// farklıysa talebin geçmişine not düşer. Alacak kaydı finansındır; burada yazılmaz.
async function kapanisPlanNotlari(db: Db, k: Kullanici, talepId: string, teklifId: string): Promise<void> {
  const talep = (await talepOku(db, talepId))!;
  const sip = talep.karar?.siparisler.find((x) => x.teklifId === teklifId);
  const kosul = (await s.siparisOdemeKosullari(db, talepId)).find((x) => x.teklifId === teklifId);
  if (sip === undefined || kosul === undefined) return;
  const kdv = (await siparisKdvleri(db, talepId)).get(teklifId)?.oran ?? null;
  const paraBirimi = talep.teklifler.find((q) => q.id === teklifId)?.paraBirimi ?? 'TRY';
  const otomatik = await siparisOtomatikPlaniVarMi(db, { talepId, teklifId });
  const plan = (await siparisPlanlari(db, [{ talepId, teklifId }])).get(`${talepId}:${teklifId}`)?.satirlar ?? [];
  const asim = avansAlacagiTutari(kosul, kdv, otomatik, plan);
  const alacak = await avansAlacaginiYaz(db, k, talep, teklifId, asim);
  if (asim !== null) {
    const nasil = otomatik ? 'plandaki avans gerçekleşen değere indirildi, ' : '';
    const kayit = alacak === 'acildi' || alacak === 'guncellendi' ? ' (finansta teyit bekliyor)' : '';
    await s.hareketEkle(db, talepId, randomUUID(), `Sipariş ${siparisNumarasi(sip)}: avans gerçekleşen teslim değerini ${sade(asim)} ${paraBirimi} aşıyor; ${nasil}avans ödendiyse fark tedarikçiden alacaktır${kayit}.`, k.id);
  }
  if (otomatik) return;
  const fark = planGerceklesenFarki(kosul, kdv, plan.map((x) => x.tutar));
  if (fark !== null) {
    await s.hareketEkle(db, talepId, randomUUID(), `Sipariş ${siparisNumarasi(sip)}: ödeme planı gerçekleşen teslim değerinden ${sade(fark)} ${paraBirimi} farklı; planı gözden geçirin.`, k.id);
  }
}

const ALACAKLI_SIPARIS_SILINMEZ = 'Bu siparişin tedarikçi alacağı var; önce finansta alacağı kapatın ya da düşürün.';
// 2540 (Maliyet C1): aşan avans KDV dahil, sipariş dövizinde. Otomatik planda siparişin avansı, elle ya da faturalı planda planın avans
// satırları gerçekleşen değerle karşılaştırılır; aşım yoksa null.
function avansAlacagiTutari(kosul: s.SiparisOdemeKosulu, kdv: string | null, otomatik: boolean, plan: readonly { tur: string; tutar: string }[]): string | null {
  if (!kosul.kapali) return null;
  if (otomatik || plan.length === 0) return avansAsimi(kosul, kdv);
  const fark = planGerceklesenFarki(kosul, kdv, plan.filter((x) => x.tur === 'avans').map((x) => x.tutar));
  return fark !== null && ondalikKiyas(fark, '0') > 0 ? fark : null;
}
// Güvenlik K3: tedarikçi alacağını yalnız kapatma ve kapalı siparişin teslim düzeltmesi yazar; tutar burada hesaplanır.
// Açılmış (teyit edilmiş) ya da kapanmış alacak değişmez; fark geçmişe not düşer.
async function avansAlacaginiYaz(db: Db, k: Kullanici, talep: Talep, teklifId: string, tutar: string | null): Promise<AvansAlacagiSonucu> {
  const hedef = odemePlaniHedefi(talep, teklifId);
  const sip = talep.karar?.siparisler.find((x) => x.teklifId === teklifId);
  if ('red' in hedef || sip === undefined) return 'yok';
  const sonuc = await siparisAvansAlacagiYaz(db, k.id, { siparis: { talepId: talep.id, teklifId }, siparisNo: siparisNumarasi(sip), firmaId: hedef.firmaId, paraBirimi: hedef.paraBirimi, tutar });
  if (sonuc === 'korundu') {
    await s.hareketEkle(db, talep.id, randomUUID(), `Sipariş ${siparisNumarasi(sip)}: avans aşımı ${tutar === null ? 'kalmadı' : `${sade(tutar)} ${hedef.paraBirimi} oldu`}; finanstaki alacak kaydı değişmedi, gözden geçirin.`, k.id);
  }
  return sonuc;
}
// Kapalı siparişte teslim geri alınınca ya da düzeltilince alacak gerçekleşen değere göre yenilenir (kapatmadaki tanımla aynı).
async function kapaliAlacaklariYenile(db: Db, k: Kullanici, talepId: string): Promise<void> {
  const kosullar = (await s.siparisOdemeKosullari(db, talepId)).filter((x) => x.kapali);
  if (kosullar.length === 0) return;
  const talep = (await talepOku(db, talepId))!;
  const kdvler = await siparisKdvleri(db, talepId);
  for (const kosul of kosullar) {
    const otomatik = await siparisOtomatikPlaniVarMi(db, { talepId, teklifId: kosul.teklifId });
    const plan = (await siparisPlanlari(db, [{ talepId, teklifId: kosul.teklifId }])).get(`${talepId}:${kosul.teklifId}`)?.satirlar ?? [];
    await avansAlacaginiYaz(db, k, talep, kosul.teklifId, avansAlacagiTutari(kosul, kdvler.get(kosul.teklifId)?.oran ?? null, otomatik, plan));
  }
}

// D6 b: siparişin tedarikçisinin alış faturaları; bu siparişe ve başka siparişe bağlı olanlar işaretli. Tutar gelmez (FNS-48).
async function siparisFirmasi(db: Db, talepId: string, teklifId: string): Promise<{ firmaId: number; talep: Talep }> {
  const talep = await talepOku(db, talepId);
  if (talep === null) throw bulunamadi(ILETILER.talepYok);
  const f = siparisFaturaFirmasi(talep, teklifId);
  if ('red' in f) throw gecersiz(f.red);
  return { firmaId: f.firmaId, talep };
}
async function faturaListesi(db: Db, firmaId: number, talepId: string, teklifId: string): Promise<SiparisFaturalariCevabi> {
  return {
    faturalar: (await alisBelgeleri(db, firmaId)).map((b) => {
      const bagli = b.satinAlmaSiparisi?.talepId === talepId && b.satinAlmaSiparisi.teklifId === teklifId;
      return { id: b.id, belgeNo: b.belgeNo, belgeTarihi: b.belgeTarihi, aciklama: b.aciklama, bagli, baskaSipariste: b.satinAlmaSiparisi !== null && !bagli };
    }),

    uyarilar: [],
  };
}
export async function siparisFaturalari(db: Db, talepId: string, teklifId: string): Promise<SiparisFaturalariCevabi> {
  const { firmaId } = await siparisFirmasi(db, talepId, teklifId);
  return faturaListesi(db, firmaId, talepId, teklifId);
}
// Bağı finansın komutu yazar; satın alma siparişin tedarikçisini verir, başka siparişe bağlı faturayı üstüne yazdırmaz.
// Bağlama ve kaldırma talebin geçmişine yazılır.
export async function siparisFaturasiYaz(db: Db, k: Kullanici, talepId: string, g: SiparisFaturasiYazimi): Promise<SiparisFaturalariCevabi> {
  const { firmaId, talep } = await siparisFirmasi(db, talepId, g.teklifId);
  await s.faturaBagKilidi(db, g.belgeId);
  const mevcut = (await faturaListesi(db, firmaId, talepId, g.teklifId)).faturalar.find((f) => f.id === g.belgeId);
  if (g.bagla && mevcut?.baskaSipariste) throw gecersiz(ILETILER.faturaBaskaSipariste);
  if (!g.bagla && !mevcut?.bagli) throw gecersiz(ILETILER.faturaBagliDegil);
  if (g.bagla && mevcut?.bagli) return faturaListesi(db, firmaId, talepId, g.teklifId);
  await belgeSiparisBagla(db, k.id, { belgeId: g.belgeId, siparisFirmaId: firmaId, siparis: g.bagla ? { talepId, teklifId: g.teklifId } : null });
  const ad = mevcut?.belgeNo ?? `#${g.belgeId}`;
  const teklif = talep.teklifler.find((x) => x.id === g.teklifId);
  const tedarikci = teklif?.tedarikciAdi ?? '';
  const uyarilar = g.bagla ? await faturaUyarilari(db, talep, g.teklifId, g.belgeId, firmaId) : [];
  // Uyarı geçmişe de yazılır: toast kaybolur, eşleşme farkı sonradan da görülmelidir.
  await s.hareketEkle(db, talepId, randomUUID(), `${g.bagla ? 'Fatura bağlandı' : 'Fatura bağı kaldırıldı'}: ${ad}${tedarikci ? ` (${tedarikci})` : ''}${uyarilar.length > 0 ? `. ${uyarilar.join(' ')}` : ''}`, k.id);
  return { ...(await faturaListesi(db, firmaId, talepId, g.teklifId)), uyarilar };
}
async function faturaUyarilari(db: Db, talep: Talep, teklifId: string, belgeId: number, firmaId: number): Promise<string[]> {
  const sip = talep.karar?.siparisler.find((x) => x.teklifId === teklifId);
  const kosul = (await s.siparisOdemeKosullari(db, talep.id)).find((x) => x.teklifId === teklifId);
  // 2480: kalanı kapatılmış siparişin faturası gerçekleşen teslim değeriyle karşılaştırılır (KDV hariç, ödeme planıyla aynı tanım).
  const toplam = kosul === undefined ? null : gerceklesenKosul(kosul).toplam;
  const paraBirimi = talep.teklifler.find((x) => x.id === teklifId)?.paraBirimi ?? '';
  return faturaEslesmeUyarilari({ toplam, paraBirimi, satirlar: sip?.satirlar ?? [], kapali: kosul?.kapali ?? false }, await alisBelgesiEslesmeTutari(db, belgeId, firmaId));
}

// Kart #1124: siparişin ödeme planı ve takip satırları. Plan finanstadır (beklenen ödeme); fatura finansta girilir, siparişe bağlanır.
// 2132-7: siparişin KDV oranı elle seçilen, yoksa sipariş günündeki (yoksa bugünkü) genel orandır; seçenekler o günün geçerli oranlarıdır.
async function siparisKdvleri(db: Db, talepId: string): Promise<Map<string, { oran: string | null; elle: boolean; secenekler: string[] }>> {
  const bugun = tesisGunu(new Date());
  const sonuc = new Map<string, { oran: string | null; elle: boolean; secenekler: string[] }>();
  for (const k of await s.siparisOdemeKosullari(db, talepId)) {
    const g = await kdvSecenekleri(db, k.siparisTarihi ?? bugun);
    sonuc.set(k.teklifId, { oran: sade(k.kdvOrani ?? g.genel), elle: k.kdvOrani !== null, secenekler: g.oranlar.map((x) => sade(x)) });
  }
  return sonuc;
}
async function takipKur(db: Db, talep: Talep): Promise<SiparisTakibiCevabi> {
  const siparisler = talep.karar?.siparisler ?? [];
  const planlar = await siparisPlanlari(db, siparisler.map((x) => ({ talepId: talep.id, teklifId: x.teklifId })));
  const kdvler = await siparisKdvleri(db, talep.id);
  return {
    siparisler: siparisler.map((x) => {
      const p = planlar.get(`${talep.id}:${x.teklifId}`) ?? { satirlar: [], faturalar: [] };
      const kdv = kdvler.get(x.teklifId) ?? { oran: null, elle: false, secenekler: [] };
      return {
        teklifId: x.teklifId, satirIdleri: x.satirlar.map((r) => r.id), paraBirimi: talep.teklifler.find((q) => q.id === x.teklifId)?.paraBirimi ?? 'TRY',
        kdvOrani: kdv.oran, kdvElle: kdv.elle, kdvSecenekleri: kdv.secenekler,
        odemePlani: p.satirlar.map((r) => ({ ...r, tutar: sade(r.tutar) })),
        faturalar: p.faturalar.map(({ belgeNo, belgeTarihi, vade }) => ({ belgeNo, belgeTarihi, vade })),
      };
    }),
  };
}
export async function siparisTakibi(db: Db, talepId: string): Promise<SiparisTakibiCevabi> {
  const talep = await talepOku(db, talepId);
  if (talep === null) throw bulunamadi(ILETILER.talepYok);
  return takipKur(db, talep);
}
// 1094 b: teklif karşılaştırmasının sunucudaki hesabı (hesap-kurallar.ts). Onaydaki ya da siparişteki kararın sabit kuru ve faizi
// kullanılır; değilse finansın bugünkü kuru (yoksa teklifin kendi günündeki kuru) ve faizi. Tedarikçi başarımı D1'de yalnız
// satın almanın 1-5 puanıdır; zamanında teslim ve kalite oranı ayrı işte gelir.
const para = (x: number | null): string | null => (x === null || !Number.isFinite(x) ? null : x.toFixed(2));
const ondalik = (x: number): string => sade(x.toFixed(6));
// 2397 b: onay basamağı yazılmış kararın TL tutarından (değerlendirmeyle aynı hesap, kilitliyse sabit kur); kur eksikse boş.
async function kararTlToplami(db: Db, talepId: string): Promise<number | null> {
  const k = (await degerlendirme(db, talepId)).karar;
  return k === null ? null : Number(k.tlToplam);
}
// Kararın kuru: kilitli durumda (sipariş verilmiş) kararın sabit kuru (1096 a, 2454 T1), değilse finansın güncel kuru; ikisi de yoksa teklifin kuru.
function kararKurlari(t: Talep, ayar: Ayarlar): { sabit: NonNullable<Talep['karar']>['sabitKurlar'] | null;
  kur: (q: { paraBirimi: string; kur: string | null }) => number | null; aylikFaizi: (pb: string) => number | null } {
  const sabit = t.karar !== null && kilitliDurum(t.durum) && t.karar.sabitKurlar.length > 0 ? t.karar.sabitKurlar : null;
  const guncel = new Map<string, Ayarlar['kurlar'][number]>(ayar.kurlar.map((k) => [k.paraBirimi, k]));
  const kur = (q: { paraBirimi: string; kur: string | null }): number | null => {
    const d = sabit !== null ? sabit.find((x) => x.paraBirimi === q.paraBirimi)?.kur ?? null : guncel.get(q.paraBirimi)?.kur ?? null;
    const n = Number(d ?? q.kur);
    return (d ?? q.kur) !== null && n > 0 ? n : null;
  };
  const aylikFaizi = (pb: string): number | null => {
    const d = sabit !== null ? sabit.find((x) => x.paraBirimi === pb)?.aylikFaizYuzdesi ?? null : guncel.get(pb)?.aylikFaizYuzdesi ?? null;
    return d === null ? null : Number(d);
  };
  return { sabit, kur, aylikFaizi };
}

// 2454: talebin bütçe satırları (kalem başına birim, yıl, TL). Kararsız talepte boş.
function talepButceSatirlari(t: Talep, ayar: Ayarlar, bugun: string): ButceSatiri[] {
  if (t.karar === null) return [];
  // T1: sipariş verilmiş talepte kur sabittir: kararın sabit kuru, yoksa teklifin kendi gününün kuru (SA3 a); finansın bugünkü kuru
  // yalnız ikisi de yoksa. Kullanım bugünkü kurla oynamaz.
  const { sabit, kur: guncelKur, aylikFaizi } = kararKurlari(t, ayar);
  const kur = (q: { paraBirimi: string; kur: string | null }): number | null => {
    if (q.paraBirimi === 'TRY') return 1;
    const d = sabit?.find((x) => x.paraBirimi === q.paraBirimi)?.kur ?? q.kur;
    return d !== null && Number(d) > 0 ? Number(d) : guncelKur(q);
  };
  const hesaplar = t.teklifler.map((q) => teklifHesabi(q, t.kalemler, { kur, aylikFaiz: aylikFaizi }));
  const kaynakBirimi = new Map((t.kaynaklar ?? []).flatMap((k) => k.kalemIdleri.map((id) => [id, k.birim] as const)));
  return butceSatirlari({
    harcamalar: kalemHarcamalari(t.karar, t.kalemler, hesaplar),
    kalemBirimi: (id) => kaynakBirimi.get(id) ?? t.birim,
    kararTarihi: t.karar.kararTarihi,
    siparisler: t.karar.siparisler.map((p) => ({ teklifId: p.teklifId, siparisTarihi: p.siparisTarihi, kapali: p.logo?.kapatmaDurumu != null, satirlar: p.satirlar })),
    bugun,
  });
}
async function yilinButceSatirlari(db: Db, yil: number, ayar: Ayarlar, haric: string | null): Promise<ButceSatiri[]> {
  const bugun = await s.bugun(db);
  const idler = (await s.butceTalepIdleri(db, yil)).filter((id) => id !== haric);
  const talepler = await talepleriKur(db, await s.talepSatirlariIdlerle(db, idler));
  return talepler.flatMap((t) => talepButceSatirlari(t, ayar, bugun));
}
// 2454: birim başına yılın bütçe kullanımı (siparişi verilmiş talepler; tam görenler).
export async function butceKullanimiOku(db: Db, yil: number): Promise<ButceKullanimiCevabi> {
  const ayar = await ayarlariKur(db);
  return { yil, birimler: butceKullanimi(await yilinButceSatirlari(db, yil, ayar, null), yil, ayar.birimler) };
}

export async function degerlendirme(db: Db, talepId: string): Promise<DegerlendirmeCevabi> {
  const t = await talepOku(db, talepId);
  if (t === null) throw bulunamadi(ILETILER.talepYok);
  const ayar = await ayarlariKur(db);
  const { sabit, kur, aylikFaizi } = kararKurlari(t, ayar);
  const puanlar = new Map((await s.tedarikcileriOku(db, null)).map((x) => [x.firmaId, x.puan] as const));
  const siparisGunleri = (t.karar?.siparisler ?? []).flatMap((x) => (x.siparisTarihi === null ? [] : [x.siparisTarihi])).sort();
  const agirliklar = t.agirliklar ?? ayar.agirliklar;
  const ortam = {
    kur, aylikFaiz: aylikFaizi, agirliklar, ihtiyacTarihi: t.ihtiyacTarihi, bazTarih: siparisGunleri[0] ?? (await s.bugun(db)),
    tedarikciPuani: (firmaId: number | null) => tedarikciBasarimi(firmaId === null ? null : puanlar.get(firmaId) ?? null, null, null),
  };
  const esit = esitVadeOrtami(t.teklifler, ortam);
  const d = degerlendir(t.kalemler, t.teklifler, esit);
  const tutar = t.karar === null ? null : kararTutari(t.karar, t.kalemler, t.teklifler.map((q) => teklifHesabi(q, t.kalemler, esit)));
  const kilitUyarisi = sabit === null || t.durum !== 'onayda' ? null
    : kurKilidiReddi(t.karar?.kurKilidi ?? null, sabit, new Map(ayar.kurlar.map((k) => [k.paraBirimi, k.kur] as const)), Date.now());
  return {
    kurKaynagi: sabit !== null ? 'sabit' : 'guncel', kurKilidi: t.karar?.kurKilidi ?? null, kilitUyarisi, agirliklar,
    teklifler: d.satirlar.map((x) => ({
      teklifId: x.hesap.teklifId, firmaId: x.firmaId, disarida: x.disarida, kur: x.hesap.kur === null ? null : ondalik(x.hesap.kur),
      toplam: para(x.hesap.toplam)!, tlToplam: para(x.hesap.tlToplam), bugunkuDeger: para(x.hesap.bugunkuDeger), vadeKazanci: para(x.hesap.vadeKazanci),
      vadeHesabaKatilmadi: x.hesap.vadeHesabaKatilmadi, kapsanan: x.hesap.kapsanan, tumKalemler: x.tumKalemler, termin: x.hesap.termin, gecikmeGun: x.gecikme,
      puan: Math.round(x.puan * 10) / 10,
      kriterPuani: {
        maliyet: Math.round(x.kriterPuani.maliyet * 10) / 10, termin: x.kriterPuani.termin === null ? null : Math.round(x.kriterPuani.termin * 10) / 10,
        tedarikci: x.kriterPuani.tedarikci === null ? null : Math.round(x.kriterPuani.tedarikci * 10) / 10, garanti: Math.round(x.kriterPuani.garanti * 10) / 10,
      },
      satirlar: x.hesap.satirlar.map((r) => ({ kalemId: r.kalemId, alinanMiktar: ondalik(r.alinanMiktar), tutar: para(r.tutar)!, bugunkuDegerTl: para(r.bugunkuDegerTl), termin: r.termin })),
    })),
    sira: d.sira, oneri: d.oneri,
    bolme: d.bolme === null ? null : {
      atama: d.bolme.plan.atama, bugunkuDeger: para(d.bolme.plan.toplam)!, tekTedarikci: para(d.bolme.tekToplam), kazanc: para(d.bolme.kazanc), onerilir: d.bolme.onerilir,
    },
    karar: tutar === null ? null : { tlToplam: para(tutar.tlToplam)!, bugunkuDeger: para(tutar.bugunkuDeger)!, basamak: gerekenBasamak(tutar.tlToplam, ayar.onayLimitleri) },
    butce: await talepButcesi(db, t, ayar),
  };
}
// 2454 onay kırılımı: talebin kalemlerinin birimleri; kullanılan, bu talep hariç kararın yılındaki kullanım; buAlim bu talebin o birime
// düşen tutarı (hesaplanamayan kalem girmez). VARSAYIM: yıl kararın tarihinden (yoksa bugün); bölünmüş siparişler de o yıla gösterilir.
async function talepButcesi(db: Db, t: Talep, ayar: Ayarlar): Promise<DegerlendirmeCevabi['butce']> {
  const bugun = await s.bugun(db);
  const satirlar = talepButceSatirlari(t, ayar, bugun);
  if (satirlar.length === 0) return [];
  const yil = Number((t.karar?.kararTarihi ?? bugun).slice(0, 4));
  const kullanim = new Map(butceKullanimi(await yilinButceSatirlari(db, yil, ayar, t.id), yil, ayar.birimler).map((b) => [b.birim, b]));
  const birimler = [...new Set(satirlar.map((x) => x.birim))];
  return birimler.map((birim) => {
    const b = kullanim.get(birim);
    const buAlim = satirlar.filter((x) => x.birim === birim && x.tl !== null).reduce((top, x) => top + x.tl!, 0);
    return { birim, butce: b?.butce ?? (birim === null ? null : ayar.birimler.find((x) => x.ad === birim)?.yillikButce ?? null),
      kullanilan: b?.kullanilan ?? '0.00', yil, buAlim: (Math.round(buAlim * 100) / 100).toFixed(2) };
  }).sort((a, b) => (a.birim === null ? 1 : b.birim === null ? -1 : a.birim.localeCompare(b.birim, 'tr')));
}
// 1105 a: yeni sipariş satırının kalemi kartlıysa kartın o anki ayrıntısı kopyalanır; kopya bir kez alınır, değişmez.
async function kartKopyalariniAl(db: Db, talepId: string): Promise<void> {
  const satirlar = await s.kopyasizSiparisSatirlari(db, talepId);
  if (satirlar.length === 0) return;
  const kartlar = await malzemeSatinAlmaAyrintilari(db, satirlar.map((x) => x.malzemeNo));
  await s.kartKopyalariniYaz(db, satirlar.flatMap((x) => {
    const a = kartlar.get(x.malzemeNo);
    return a === undefined ? [] : [{ satirId: x.satirId, malzemeNo: x.malzemeNo, kartSurumu: a.surum, ayrinti: a }];
  }));
}

// 1104 a: kalemin kart ayrıntısı; siparişi verilmiş kalemde tedarikçiye giden alanlar siparişteki kopyadandır (1105 a).
export async function kartAyrintilari(db: Db, talepId: string): Promise<KartAyrintilariCevabi> {
  const t = await talepOku(db, talepId);
  if (t === null) throw bulunamadi(ILETILER.talepYok);
  const katalog = new Map((await katalogKur(db)).map((x) => [x.id, x.malzemeNo] as const));
  const nolar = new Map(t.kalemler.map((x) => [x.id, x.katalogId === null ? null : katalog.get(x.katalogId) ?? null] as const));
  const kartlar = await malzemeSatinAlmaAyrintilari(db, [...nolar.values()].filter((x): x is number => x !== null));
  const kopyalar = await s.kartKopyalariOku(db, talepId);
  return {
    kalemler: t.kalemler.map((x) => {
      const no = nolar.get(x.id) ?? null;
      const guncel: KartAyrintisi | null = no === null ? null : kartlar.get(no) ?? null;
      const siparisler = kopyalar.filter((c) => c.kalemId === x.id).map((c) => ({
        teklifId: c.teklifId, kopya: c.ayrinti as KartAyrintisi, zaman: c.zaman, kartDegisti: guncel === null || guncel.surum !== c.kartSurumu,
      }));
      return { kalemId: x.id, malzemeNo: no, guncel, siparisler, tedarikciye: tedarikciyeGidenAyrinti(siparisler[0]?.kopya ?? guncel) };
    }),
  };
}

const siparisNumarasi = (x: { no?: string | null; siparisNo: string }): string => x.no ?? x.siparisNo;
// SAT-73: talep önce kilitlenip sürümü artar (plan değişikliği talebin değişikliğidir), sonra plan finansa yazılır ve geçmişe girer.
export async function odemePlaniYaz(db: Db, k: Kullanici, talepId: string, g: OdemePlaniYazimi): Promise<SiparisTakibiCevabi> {
  await surumluGuncelle({ guncelle: () => s.talepSurumuArttir(db, talepId, g.surum), varMi: () => s.talepVarMi(db, talepId), bulunamadiIletisi: ILETILER.talepYok });
  const talep = (await talepOku(db, talepId))!;
  const hedef = odemePlaniHedefi(talep, g.teklifId);
  if ('red' in hedef) throw gecersiz(hedef.red);
  const sip = talep.karar!.siparisler.find((x) => x.teklifId === g.teklifId)!;
  // 2132-7: oran gelirse siparişe yazılır (o günün geçerli oranlarından biri olmalı); gelmezse siparişteki seçim değişmez.
  let kdvMetni = '';
  if (g.kdvOrani !== undefined) {
    const kdv = (await siparisKdvleri(db, talepId)).get(g.teklifId);
    if (!kdv?.secenekler.some((x) => Number(x) === Number(g.kdvOrani))) throw gecersiz(ILETILER.planKdvGecersiz);
    await s.siparisKdvOraniYaz(db, talepId, g.teklifId, g.kdvOrani);
    kdvMetni = ` (KDV %${sade(g.kdvOrani)} dahil)`;
  }
  await siparisOdemePlaniYaz(db, k.id, { siparis: { talepId, teklifId: g.teklifId }, siparisNo: siparisNumarasi(sip), firmaId: hedef.firmaId, paraBirimi: hedef.paraBirimi, satirlar: g.satirlar });
  await s.hareketEkle(db, talepId, randomUUID(), `Sipariş ${siparisNumarasi(sip)} ödeme planı güncellendi${kdvMetni}: ${g.satirlar.map((x) => `${x.vade} ${x.tutar} ${hedef.paraBirimi}`).join(', ')}`, k.id);
  return takipKur(db, (await talepOku(db, talepId))!);
}
// SAT-74: siparişe çevrilirken planı olmayan her siparişe tekliften plan kurulur; tedarikçisi finansta kayıtlı olmayan ya da toplamı
// sıfır olan sipariş plansız kalır (ödeme planı sonra elle girilir).
async function varsayilanPlanlariYaz(db: Db, k: Kullanici, talepId: string): Promise<void> {
  const talep = (await talepOku(db, talepId))!;
  const mevcut = await siparisPlanlari(db, (talep.karar?.siparisler ?? []).map((x) => ({ talepId, teklifId: x.teklifId })));
  const kdvler = await siparisKdvleri(db, talepId);
  for (const kosul of await s.siparisOdemeKosullari(db, talepId)) {
    if ((mevcut.get(`${talepId}:${kosul.teklifId}`)?.satirlar.length ?? 0) > 0) continue;
    const hedef = odemePlaniHedefi(talep, kosul.teklifId);
    const plan = varsayilanOdemePlani(kosul, tesisGunu(new Date()), kdvler.get(kosul.teklifId)?.oran ?? null);
    const sip = talep.karar?.siparisler.find((x) => x.teklifId === kosul.teklifId);
    if ('red' in hedef || plan.length === 0 || sip === undefined) continue;
    await siparisOdemePlaniYaz(db, k.id, { siparis: { talepId, teklifId: kosul.teklifId }, siparisNo: siparisNumarasi(sip), firmaId: hedef.firmaId, paraBirimi: hedef.paraBirimi, satirlar: plan, kaynak: 'otomatik' });
  }
}
// 2132-6 a: tekliften kurulmuş (otomatik), faturası bağlanmamış plan; beklenen teslim, sipariş tarihi ya da mal kabul değişince
// tekliften yeniden kurulur. Elle yazılmış plan değişmez. Değişen plan talebin geçmişine yazılır.
async function otomatikPlanlariYenile(db: Db, k: Kullanici, talepId: string, neden = 'teslim tarihine göre'): Promise<void> {
  const talep = (await talepOku(db, talepId))!;
  const siparisler = talep.karar?.siparisler ?? [];
  const mevcut = await siparisPlanlari(db, siparisler.map((x) => ({ talepId, teklifId: x.teklifId })));
  const kdvler = await siparisKdvleri(db, talepId);
  for (const kosul of await s.siparisOdemeKosullari(db, talepId)) {
    const sip = siparisler.find((x) => x.teklifId === kosul.teklifId);
    const hedef = odemePlaniHedefi(talep, kosul.teklifId);
    if (sip === undefined || 'red' in hedef || !(await siparisOtomatikPlaniVarMi(db, { talepId, teklifId: kosul.teklifId }))) continue;
    const plan = varsayilanOdemePlani(kosul, tesisGunu(new Date()), kdvler.get(kosul.teklifId)?.oran ?? null);
    const eski = (mevcut.get(`${talepId}:${kosul.teklifId}`)?.satirlar ?? []).map((x) => ({ ...x, tutar: sade(x.tutar) }));
    // 2472: kapalı siparişte gerçekleşen değer sıfırsa (teslim yok, avans yok) beklenen ödeme kalmaz: plan kaldırılır.
    if (plan.length === 0 && kosul.kapali && eski.length > 0) {
      await siparisOdemePlaniKaldir(db, { talepId, teklifId: kosul.teklifId });
      await s.hareketEkle(db, talepId, randomUUID(), `Sipariş ${siparisNumarasi(sip)} ödeme planı kaldırıldı: gerçekleşen teslim değeri yok`, k.id);
      continue;
    }
    if (plan.length === 0 || JSON.stringify(eski) === JSON.stringify(plan.map((x) => ({ ...x, tutar: sade(x.tutar) })))) continue;
    await siparisOdemePlaniYaz(db, k.id, { siparis: { talepId, teklifId: kosul.teklifId }, siparisNo: siparisNumarasi(sip), firmaId: hedef.firmaId, paraBirimi: hedef.paraBirimi, satirlar: plan, kaynak: 'otomatik' });
    await s.hareketEkle(db, talepId, randomUUID(), `Sipariş ${siparisNumarasi(sip)} ödeme planı ${neden} yeniden kuruldu: ${plan.map((x) => `${x.vade} ${x.tutar} ${hedef.paraBirimi}`).join(', ')}`, k.id);
  }
}

// SAT-66: yalnız taslak silinir (tetikleyici); satın alma her taslağı, talep eden kendi taslağını siler.
export async function talepSil(db: Db, k: Kullanici, id: string, surum: number): Promise<{ tamam: true }> {
  const eski = await talepOku(db, id);
  if (eski === null) throw bulunamadi(ILETILER.talepYok);
  const kendi = eski.acanKisiId === k.id || eski.talepEdenKisiId === k.id;
  if (!k.islemler.includes(ISLEM.yaz) && !(kendi && k.islemler.includes(ISLEM.talepAc))) throw yetkiYok();
  birlesmisiReddet(eski);
  if ((eski.kaynaklar ?? []).length > 0) throw gecersiz(ILETILER.birlesikSilinmez);
  // Tetikleyici yine son sözdür; burada açık ileti verilir, tetikleyicinin genel 422 iletisi kullanıcıya yol göstermez.
  if (eski.durum !== 'taslak') throw gecersiz(ILETILER.yalnizTaslakSilinir);
  // 2876 (Veri): güncelleme talebinin kökü silinmez (RESTRICT); kök taslağa dönemez, kısıt yine de açık iletiyle karşılanır.
  await kisitKorumali({ satin_alma_talep_guncellenen: ILETILER.guncellemesiOlanSilinmez },
    () => surumluGuncelle({ guncelle: () => s.talepSil(db, id, surum), varMi: () => s.talepVarMi(db, id), bulunamadiIletisi: ILETILER.talepYok }));
  return { tamam: true };
}

// SAT-41, SAT-42: tedarikçi finansta kayıtlı aktif bir firmadır (firma finansta açılır, burada seçilir; kullanıcı kararı S1,
// 07.10.2026); firma alanları finansta yazılır, burada yalnız satın almaya özgü olanlar.
export async function tedarikciKaydet(db: Db, k: Kullanici, t: TedarikciKaydetYazimi): Promise<Tedarikci> {
  if (t.surum === null) {
    if (!tedarikciOlabilir(await firmaOzeti(db, t.firmaId))) throw gecersiz(ILETILER.firmaPasif);
    if ((await s.tedarikciEkle(db, t)) === null) throw cakisma(ILETILER.tedarikciVar);
  } else {
    const surum = t.surum;
    await surumluGuncelle({ guncelle: () => s.tedarikciGuncelle(db, t, surum), varMi: () => s.tedarikciVarMi(db, t.firmaId), bulunamadiIletisi: ILETILER.tedarikciYok });
  }
  await s.tedarikciAltlariniYaz(db, t, k.id);
  return (await tedarikcileriKur(db, t.firmaId))[0]!;
}


// Silinmek istenen kayda başka tablo bağlıysa modülün iletisi döner (bağlayan yabancı anahtar başka modülde olabilir: türe göre yedek).
const bagliyken = <T>(is: () => Promise<T>): Promise<T> => kisitKorumali({}, is, { BAGIMLI_KAYIT: ILETILER.bagliKayit });

// Tedarikçi eklerken firma seçimi: finansın aktif tedarikçi firmaları adla aranır; zaten tedarikçi olanlar işaretlenir.
export async function firmaSecenekleri(db: Db, ara: string): Promise<{ id: number; ad: string; tedarikci: boolean }[]> {
  const bulunan = await firmaAra(db, { metin: ara, sinir: FIRMA_SECENEK_SINIRI, yalnizAktif: true, tur: 'tedarikci' });
  const tedarikciler = new Set((await s.tedarikcileriOku(db)).map((t) => t.firmaId));
  return bulunan.map((f) => ({ id: f.id, ad: f.ad, tedarikci: tedarikciler.has(f.id) }));
}
const FIRMA_SECENEK_SINIRI = 50;

// SA2 b: kataloğa bağlanacak kart malzemelerin aktif kartlarından aranır; kataloğa bağlı olan kalem kimliğiyle döner.
// #1192: talep türüne göre (malzeme: fiziksel kartlar, hizmet: alınan hizmet); boş arama ilk sayfayı verir.
export async function malzemeSecenekleri(db: Db, ara: string, tur: TalepTuru = 'malzeme'): Promise<MalzemeSecenekleriCevabi['malzemeler']> {
  const izin = TALEP_TURU_KARTLARI[tur];
  const bulunan = (await malzemeAra(db, {
    metin: ara === '' ? null : ara, turler: izin.turler, ...(izin.hizmetYonu ? { hizmetYonu: izin.hizmetYonu } : {}), sayfa: 1, sayfaBoyu: FIRMA_SECENEK_SINIRI, yalnizAktif: true,
  })).satirlar;
  const baglar = new Map((await s.katalogBaglari(db, bulunan.map((m) => m.id))).map((b) => [b.no, b.id]));
  const agirliklar = await malzemeMaliyetBilgileri(db, bulunan.map((m) => m.id));
  return bulunan.map((m) => ({
    no: m.id, kod: m.kod, ad: m.ad ?? m.kod, birim: m.birim, kategori: m.kategoriAdi, katalogId: baglar.get(m.id) ?? null,
    stokBirimi: agirliklar.get(m.id)?.stokBirimi ?? null, birimKg: agirliklar.get(m.id)?.birimKg ?? null,
  }));
}

export async function tedarikciSil(db: Db, firmaId: number): Promise<{ tamam: true }> {
  const r = await bagliyken(() => s.tedarikciSil(db, firmaId));
  if (r === null) throw bulunamadi(ILETILER.tedarikciYok);
  return { tamam: true };
}

// SAT-58 (SA2 b), SAT-59: yeni kart malzemelerin sayfasında açılır; burada var olan aktif malzeme kartı kataloğa bağlanır
// (talep eden de bağlar). Düzenleme satın almanın. Kartı değişmeyen kalem, kart sonradan pasifleşse de düzenlenir.
export async function katalogKaydet(db: Db, k: Kullanici, g: KatalogKaydetYazimi): Promise<KatalogKaydi> {
  const yetkili = k.islemler.includes(ISLEM.yaz) || (g.surum === null && k.islemler.includes(ISLEM.talepAc));
  if (!yetkili) throw yetkiYok();
  const kart = (await malzemeOzetleri(db, [g.malzemeNo])).get(g.malzemeNo);
  const ayniKart = g.surum !== null && (await s.katalogMalzemeNosu(db, g.id)) === g.malzemeNo;
  const red = ayniKart && kart !== undefined ? null : katalogKartiReddi(kart) ?? satinAlinabilirKartReddi(kart);
  if (red !== null) throw dogrulama(red, 'malzemeNo');
  const yazim = { ...g, kategori: kartKopyasi(kart!).kategori };
  if (g.surum === null) {
    await s.katalogEklemeKilidi(db);
    if ((await s.katalogEkle(db, yazim)) === null) throw cakisma('Bu kimlikle bir katalog kalemi zaten var.');
  } else {
    const surum = g.surum;
    await surumluGuncelle({ guncelle: () => s.katalogGuncelle(db, yazim, surum), varMi: () => s.katalogVarMi(db, g.id), bulunamadiIletisi: ILETILER.katalogYok });
  }
  await s.takmaAdlariYaz(db, g.id, g.takmaAdlari);
  return (await katalogKur(db, g.id))[0]!;
}

export async function katalogSil(db: Db, id: string, surum: number): Promise<{ tamam: true }> {
  await bagliyken(() => surumluGuncelle({ guncelle: () => s.katalogSil(db, id, surum), varMi: () => s.katalogVarMi(db, id), bulunamadiIletisi: ILETILER.katalogYok }));
  return { tamam: true };
}

// 2397-5 a: onay basamağı harcama denetimidir; basamağı, eşiği ve rolü yalnız yönetici (ayarlar.yaz) değiştirir, öteki ayarlar satın almada.
const YONETICI_AYARI = 'ayarlar.yaz' satisfies Islem;
export async function ayarlarKaydet(db: Db, k: Kullanici, g: AyarlarKaydetYazimi): Promise<Ayarlar> {
  const eski = await s.onayLimitleri(db);
  const onayLimitleri = onayLimitRolleri(eski, g.onayLimitleri);
  if (onayLimitleriDegistiMi(eski, onayLimitleri) && !k.islemler.includes(YONETICI_AYARI)) throw yetkiYok(ILETILER.onayLimitiYonetici);
  const red = onayLimitiReddi(onayLimitleri);
  if (red !== null) throw dogrulama(red, 'onayLimitleri');
  const a = { ...g, onayLimitleri };
  await surumluGuncelle({ guncelle: () => s.ayarGuncelle(db, a), varMi: async () => true });
  await bagliyken(() => s.ayarListeleriniYaz(db, a));
  return ayarlariKur(db);
}

// SAT-37: stokun mal kabul belgesi için teslim bekleyen sipariş satırları (fiyatsız). Kimlik verilirse yalnız o satırlar.
// Kalıp `kisiAdlari` ile aynı: boş dizide sorgu yok, olmayan kimlik sonuçta yok.
// SH1 a: stok mal kabul işleminin içinde çağırır (çağıranın işlemi; yetki stok ucundadır). Kişi oturumdan, zaman sunucudan.
// Kalanı aşan miktar reddedilmez, sipariş satırında fazla teslim görünür. Aynı mal kabul satırı ikinci kez yazılmaz.
// Kalanı kapatılmış siparişe yalnız aynı işlemde geri alınmış teslimin düzeltmesi yazılır.
export async function teslimIsle(db: Db, k: Kullanici, g: { siparisSatirId: number; miktar: string; malKabulSatirId: number }): Promise<void> {
  if (!ondalikMetinSemasi.safeParse(g.miktar).success || ondalikKiyas(g.miktar, '0') <= 0) throw gecersiz(ILETILER.teslimMiktari);
  const hedef = await s.teslimHedefiKilitle(db, g.siparisSatirId);
  if (hedef === null) throw gecersiz(ILETILER.teslimSiparisYok);
  if (hedef.talepDurumu !== 'siparis_verildi') throw gecersiz(ILETILER.teslimDurumu);
  // Kapalı siparişte yalnız mal kabul düzeltmesi yazar: stok aynı işlemde önce eski teslimi geri alır (B-5).
  if (hedef.kapali && !(await s.buIslemdeGeriAlindiMi(db, g.siparisSatirId))) throw gecersiz(ILETILER.kapaliSipariseTeslim);
  if ((await s.malKabulNetleri(db, g.malKabulSatirId)).length > 0) throw cakisma(ILETILER.teslimTekrar);
  await s.teslimEkle(db, g.siparisSatirId, g.malKabulSatirId, g.miktar, k.id);
  await karneTesliminiYenile(db, g.siparisSatirId);
  await otomatikPlanlariYenile(db, k, hedef.talepId);
  await kapaliAlacaklariYenile(db, k, hedef.talepId);
}

// Mal kabul düzeltilince (stok DEP-53) eski satırın teslimi ters kayıtla geri alınır; kayıt silinmez.
export async function teslimGeriAl(db: Db, k: Kullanici, g: { malKabulSatirId: number }): Promise<void> {
  const netler = await s.malKabulNetleri(db, g.malKabulSatirId);
  if (netler.length === 0) throw gecersiz(ILETILER.teslimGeriAlinacakYok);
  const talepler = new Set<string>();
  for (const n of netler) {
    const hedef = await s.teslimHedefiKilitle(db, n.siparisSatiriId);
    await s.teslimEkle(db, n.siparisSatiriId, g.malKabulSatirId, n.net.startsWith('-') ? n.net.slice(1) : `-${n.net}`, k.id);
    await karneTesliminiYenile(db, n.siparisSatiriId);
    if (hedef !== null) talepler.add(hedef.talepId);
  }
  for (const t of talepler) { await otomatikPlanlariYenile(db, k, t); await kapaliAlacaklariYenile(db, k, t); }
}

// Kart 1474 (1259 c): sipariş satırının teslimi tedarikçi karnesine olay olarak, aynı işlemde gider; olay satır başına tektir ve
// her teslimde yeniden yazılır. Termin teslim anındaki beklenen teslimdir. Termini olmayan, kayıtsız tedarikçili ya da net teslimi
// kalmamış satırın olayı yoktur (varsa kalkar). Teslim günü son artı teslimin tesis günüdür; net miktar sipariş miktarına ulaştıysa tamdır.
async function karneTesliminiYenile(db: Db, siparisSatirId: number): Promise<void> {
  const anahtar = `siparis-satiri:${siparisSatirId}`;
  const b = await s.karneTeslimBilgisi(db, siparisSatirId);
  const olay = b === null ? null : karneTeslimOlayi(b);
  if (b === null || olay === null) { await karneOlayiKaldir(db, { kaynak: 'satin-alma', anahtar }); return; }
  await karneOlayiYaz(db, { kaynak: 'satin-alma', anahtar, firmaId: olay.firmaId, zaman: olay.zaman, tur: 'teslim', termin: olay.termin, teslimGunu: tesisGunu(Date.parse(olay.zaman)), tam: olay.tam });
}

// Stok değeri için (stok isteği): malzeme no -> son alış fiyatı; teslimi olmayan malzeme haritada yoktur.
export interface SonAlisFiyati { birimFiyat: string; paraBirimi: string; tryBirimFiyat: string | null; zaman: string }
export async function sonAlisFiyatlari(db: Db, malzemeNolar: readonly number[]): Promise<Map<number, SonAlisFiyati>> {
  if (malzemeNolar.length === 0) return new Map();
  const l = await s.sonAlisFiyatlariOku(db, [...new Set(malzemeNolar)]);
  return new Map(l.map(({ malzemeNo, ...x }) => [malzemeNo, { ...x, birimFiyat: sade(x.birimFiyat), tryBirimFiyat: x.tryBirimFiyat === null ? null : sade(x.tryBirimFiyat) }]));
}
// Plan motoru: açık siparişte gelecek malzeme, termin sırasıyla (tarihsiz en sonda). Miktar kalemin birimiyle; fiyat yok.
export interface MalzemeGelisi { tarih: string | null; miktar: string; birim: string; siparisNo: string }
export async function malzemeGelisTarihleri(db: Db, malzemeNolar: readonly number[]): Promise<Map<number, MalzemeGelisi[]>> {
  const tekil = [...new Set(malzemeNolar)];
  const m = new Map<number, MalzemeGelisi[]>();
  if (tekil.length === 0) return m;
  for (const { malzemeNo, ...x } of await s.malzemeGelisleriOku(db, tekil)) m.set(malzemeNo, [...(m.get(malzemeNo) ?? []), { ...x, miktar: sade(x.miktar) }]);
  return m;
}
// Ağırlıklı ortalama net alış fiyatı (plan, malzeme izi, kg fiyatları ekranı); istenen her malzeme haritadadır, teslimi olmayanın fiyatı boş.
export interface OrtalamaAlisFiyati { tryBirimFiyat: string | null; teslimSayisi: number }
export async function ortalamaAlisFiyatlari(db: Db, malzemeNolar: readonly number[]): Promise<Map<number, OrtalamaAlisFiyati>> {
  if (malzemeNolar.length === 0) return new Map();
  const l = await s.ortalamaAlisFiyatlariOku(db, [...new Set(malzemeNolar)]);
  return new Map(l.map(({ malzemeNo, tryBirimFiyat, teslimSayisi }) => [malzemeNo, { tryBirimFiyat: sade(tryBirimFiyat), teslimSayisi }]));
}
// 2613 2/2, 2720-1, 2733 a: proje maliyetinin gerçekleşen malzemesi için emre ya da projeye bağlı siparişin birim fiyatı (stok biriminde, TRY,
// iskontolu, KDV hariç, masrafsız) ve net teslim miktarı (stok biriminde; siparişe kadar sipariş fiyatı). Bağlı teslimli sipariş yoksa çift listede yoktur; öncelik tüketen taraftadır.
export type SiparisBirimFiyati = s.SiparisBirimFiyatiSatiri;
export async function siparisBirimFiyatlari(db: Db, istek: { emirIdleri: readonly number[]; projeIdleri: readonly number[]; malzemeNolar: readonly number[] }): Promise<SiparisBirimFiyati[]> {
  const tekil = (l: readonly number[]) => [...new Set(l)];
  if (istek.malzemeNolar.length === 0 || (istek.emirIdleri.length === 0 && istek.projeIdleri.length === 0)) return [];
  const l = await s.siparisBirimFiyatlariOku(db, tekil(istek.emirIdleri), tekil(istek.projeIdleri), tekil(istek.malzemeNolar));
  return l.map((x) => ({ ...x, tryBirimFiyati: sade(x.tryBirimFiyati), teslimMiktari: sade(x.teslimMiktari) }));
}
// Stok değerlemesi (1382 d): mal kabul satırı -> net TRY birim fiyatı; teslimi olmayan satır haritada yoktur, karşılığı olmayanın fiyatı boş.
export async function malKabulFiyatlari(db: Db, malKabulSatirIdler: readonly number[]): Promise<Map<number, string | null>> {
  if (malKabulSatirIdler.length === 0) return new Map();
  const l = await s.malKabulFiyatlariOku(db, [...new Set(malKabulSatirIdler)]);
  return new Map(l.map((x) => [x.malKabulSatirId, x.tryBirimFiyat === null ? null : sade(x.tryBirimFiyat)]));
}
export function siparisSatirlari(db: Db, idler?: readonly number[]): Promise<s.SiparisSatiriOkuma[]> {
  if (idler !== undefined && idler.length === 0) return Promise.resolve([]);
  return s.siparisSatirlariOku(db, idler === undefined ? null : [...new Set(idler)]).then((l) => l.map((x) => ({ ...x, miktar: sade(x.miktar), kalanMiktar: sade(x.kalanMiktar) })));
}

// İkinci menü sayıları (şartname): yetkisi olmayan maddenin sayısı boş; hesaplanmayan (iş kutusu, raporlar, ayarlar) boş, sıfır uydurulmaz.
// Ana sayfa pano kartları: onay bekleyen onaylayana, iş sayıları satın almayı yazana, açık sipariş satın almayı okuyana.
export async function panoOzeti(db: Db, k: Kullanici): Promise<SatinAlmaOzetiCevabi> {
  const var_ = (i: (typeof k.islemler)[number]) => k.islemler.includes(i);
  const okur = var_(ISLEM.oku) || var_(ISLEM.yaz);
  // Depo mal kabulü stokta yapar (`stok.giris`); teslim bekleyen satır sayısını satın almayı okumadan görür.
  const kabulEder = var_('stok.giris');
  const bos = {
    onayBekleyen: null, acikTalep: null, teslimBekleyenSatir: null, acikSiparis: null, acikSiparisTutari: null, gecikenTeslim: null, buHaftaGelecekTeslim: null,
    siparisVerilecek: null, kararVerilecek: null, ihtiyaciGecen: null, gecikenEnEskiGun: null, ihtiyaciGecenEnEskiGun: null,
  };
  if (!var_(ISLEM.onayla) && !var_(ISLEM.yaz) && !okur && !kabulEder) return bos;
  const n = await s.panoSayilari(db);
  // 2425: iş kutusunun sayımları talebin tamamını görene (tamGorurMu) verilir; talep eden ve depo görmez.
  const tam = tamGorurMu(k.islemler);
  return {
    ...bos,
    ...(tam ? {
      gecikenTeslim: n.gecikenTeslim, buHaftaGelecekTeslim: n.buHaftaGelecekTeslim, siparisVerilecek: n.siparisVerilecek, kararVerilecek: n.kararVerilecek,
      ihtiyaciGecen: n.ihtiyaciGecen, gecikenEnEskiGun: n.gecikenEnEskiGun, ihtiyaciGecenEnEskiGun: n.ihtiyaciGecenEnEskiGun,
    } : {}),
    onayBekleyen: var_(ISLEM.onayla) ? n.onayBekleyen : null,
    acikTalep: var_(ISLEM.yaz) ? n.acikTalep : null,
    teslimBekleyenSatir: var_(ISLEM.yaz) || kabulEder ? n.teslimBekleyenSatir : null,
    acikSiparis: okur ? n.acikSiparis : null,
    acikSiparisTutari: okur && n.acikSiparisTutari !== null ? sade(n.acikSiparisTutari) : null,
  };
}
// Sertifika ve rapor sipariş satırına bağlanır: belge Çizimler'de açılır, yayınlanır ve satıra bağlanır; dosya satırın ucundan
// verilir (okuma yetkisi satın almanındır). Stok mal kabulde satırın belgelerini disari.ts ile okur.
const BELGE_HEDEFI = 'satin-alma';
const SATIR_YOK = 'Sipariş satırı bulunamadı.';
const BELGE_YOK = 'Belge bu sipariş satırına bağlı değil.';
const belgeOzeti = ({ id, ad, tur, harf, revKodu }: BagliBelge): SiparisBelgesi => ({ id, ad, tur, harf, revKodu });
async function satirOlmali(db: Db, satirId: number): Promise<void> {
  if (!(await s.siparisSatiriVarMi(db, satirId))) throw bulunamadi(SATIR_YOK);
}
export async function siparisBelgeleri(db: Db, satirId: number): Promise<SiparisBelgeleriCevabi> {
  await satirOlmali(db, satirId);
  return { belgeler: (await kaydaBagliBelgeler(db, BELGE_HEDEFI, satirId)).map(belgeOzeti) };
}
export async function siparisBelgesiEkle(
  db: Db, k: Kullanici, satirId: number, g: SiparisBelgesiYazimi, denetimEki: (satirlar: readonly DenetimSecimi[]) => void,
): Promise<SiparisBelgeleriCevabi> {
  await satirOlmali(db, satirId);
  await belgeAcVeBagla(db, k, { ad: g.ad, tur: g.tur, ozet: g.ozet, dosyaAdi: g.dosyaAdi }, BELGE_HEDEFI, satirId, denetimEki);
  return siparisBelgeleri(db, satirId);
}
export async function siparisBelgesiKaldir(db: Db, satirId: number, belgeId: number): Promise<SiparisBelgeleriCevabi> {
  await satirOlmali(db, satirId);
  if (!(await kayittanKaldir(db, belgeId, BELGE_HEDEFI, satirId))) throw bulunamadi(BELGE_YOK);
  return siparisBelgeleri(db, satirId);
}
export async function siparisBelgesiDosyasi(db: Db, satirId: number, belgeId: number): Promise<IkiliCevap> {
  const dosya = await kayittakiBelgeDosyasi(db, BELGE_HEDEFI, satirId, belgeId);
  if (dosya === null) throw bulunamadi(BELGE_YOK);
  return dosya;
}
// Stok mal kabulü için: satır başına bağlı belgeler; belgesi olmayan satır haritada yoktur.
export async function siparisSatiriBelgeleri(db: Db, satirIdler: readonly number[]): Promise<Map<number, SiparisBelgesi[]>> {
  const m = await kayitlaraBagliBelgeler(db, BELGE_HEDEFI, satirIdler);
  return new Map([...m].map(([id, l]) => [id, l.map(belgeOzeti)]));
}
// Dış operasyonlar (kart #542): fason iş emirleri üretim emirlerinden; firma adı finanstan, gecikme kuraldan.
// 2428: her satır dış işlem emrini (no, durum) taşır; stoktaki partinin belgeleri ayrı listededir (emir satırlarının hesabı aynen kalır).
export async function disOperasyonlar(db: Db): Promise<DisOperasyonlarCevabi> {
  const liste = await fasonIsEmirleri(db);
  const dieler = await dieListesi(db);
  const emirBelgesi = new Map(dieler.flatMap((d) => (d.kaynak.tur === 'emir' ? [[d.kaynak.isEmriId, d] as const] : [])));
  const partiler = dieler.filter((d) => d.kaynak.tur === 'parti');
  const firmalar = await firmaOzetleri(db, [...new Set([...liste, ...partiler].flatMap((x) => (x.firmaId === null ? [] : [x.firmaId])))]);
  const gun = await s.bugun(db);
  // 1849 (C17): gidiş kaydıyla aynı sıra kuralı; ekran sırası gelmemiş adımda "Gönder"i kapatır, sunucu yine reddeder.
  const gonderim = await fasonGonderimleri(db, liste.map((x) => ({ isEmriId: x.isEmriId, uretimEmriId: x.uretimEmriId, adet: x.adet })));
  const plan = await planlananGidisler(db, liste.map((x) => x.isEmriId));
  const satirlar = new Map((await s.fasonSiparisSatirlari(db, liste.map((x) => x.isEmriId))).map((r) => [r.isEmriId, r.id]));
  const partiSatirlari = new Map((await s.dieSiparisSatirIdleri(db, partiler.map((d) => d.id))).map((r) => [r.dieId, r.id]));
  const firmaIdleri = [...new Set(liste.flatMap((x) => (x.firmaId === null ? [] : [x.firmaId])))];
  const kutular = fasonKonumuCozucu === null || firmaIdleri.length === 0 ? new Map<number, number>() : await fasonKonumuCozucu(db, firmaIdleri);
  return {
    hazir: true,
    operasyonlar: liste.map(({ ilkGidis, donusler, ...x }) => {
      const kalan = fasonKalani(x.adet, x.gonderilen, x.donen, x.hurda);
      const belge = emirBelgesi.get(x.isEmriId);
      return {
        ...x, gerceklesenGidis: ilkGidis, firmaAdi: x.firmaId === null ? null : (firmalar.get(x.firmaId)?.ad ?? null), ...(x.firmaId === null ? { firmaBekleniyor: true } : {}),
        planlananGidis: plan.get(x.isEmriId) ?? null, siparisSatirId: satirlar.get(x.isEmriId) ?? null,
        fasonKonumId: x.firmaId === null ? null : (kutular.get(x.firmaId) ?? null),
        gecikmeGun: gecikmeGunu(x.termin, x.ilkDonus, gun), gecikmeSonDonus: sonDonusGecikmesi(x.termin, x.sonDonus, kalan, gun),
        gecikmeAgirlikli: agirlikliGecikme(x.termin, donusler, kalan, gun), sirada: gonderim.get(x.isEmriId)?.siradaki ?? false,
        dieId: belge?.id ?? null, dieNo: belge?.no ?? null, durum: belge?.durum ?? null,
      };
    }),
    partiOperasyonlari: partiler.map((d) => {
      const donusler = d.hareketler.filter((h) => h.yon === 'donus');
      const kalan = fasonKalani(d.adet ?? 0, d.gonderilen, d.donen, d.hurda);
      return {
        ...d, firmaAdi: d.firmaId === null ? null : (firmalar.get(d.firmaId)?.ad ?? null), siparisSatirId: partiSatirlari.get(d.id) ?? null,
        gecikmeGun: sonDonusGecikmesi(d.termin, donusler.at(-1)?.zaman ?? null, kalan, gun),
      };
    }),
  };
}
// 2428: dış işlem emri ayrıntısı ve satın alma bağı. Belge üretimden okunur (yoksa 404); bağlı kalemler ve sipariş satırları satın almanındır.
export async function disOperasyonAyrintisi(db: Db, dieId: number): Promise<DisOperasyonAyrintisiCevabi> {
  const d = await dieOku(db, dieId);
  const isEmriId = d.kaynak.tur === 'emir' ? d.kaynak.isEmriId : null;
  const firma = d.firmaId === null ? null : (await firmaOzetleri(db, [d.firmaId])).get(d.firmaId);
  const talepKalemleri = (await s.dieTalepKalemleri(db, d.id, isEmriId)).map((x) => ({ ...x, miktar: x.miktar === null ? null : sade(x.miktar) }));
  const siparisSatirlari = (await s.dieSiparisSatirlari(db, d.id, isEmriId)).map((x) => ({ ...x, miktar: sade(x.miktar) }));
  return { disIslemEmri: d, firmaAdi: firma?.ad ?? null, talepKalemleri, siparisSatirlari };
}
// Fason grafikleri: gerçekleşen geçmiş (son `sonGun` günde başlayan) kırılımda ve firma bazında termin uyumu; adlar kendi sahibinden.
export async function fasonSureleri(db: Db, sonGun: number): Promise<FasonSureleriCevabi> {
  const gecmis = await fasonGecmisi(db, { sonGun });
  const kirilimlar = fasonKirilimlari(fasonSureOrnekleri(gecmis));
  const uyum = fasonTerminUyumu(gecmis);
  const firmalar = await firmaOzetleri(db, [...new Set([...kirilimlar.map((k) => k.firmaId), ...uyum.map((u) => u.firmaId)])]);
  const malzemeler = await malzemeOzetleri(db, kirilimlar.flatMap((k) => (k.malzemeNo === null ? [] : [k.malzemeNo])));
  const tipler = await operasyonTipleri(db, { pasiflerDahil: true });
  const tipAdi = new Map(tipler.map((t) => [t.id, t.ad]));
  return {
    sureler: kirilimlar.map((k) => ({
      ...k, malzemeAdi: k.malzemeNo === null ? null : (malzemeler.get(k.malzemeNo)?.ad ?? malzemeler.get(k.malzemeNo)?.kod ?? null),
      operasyonAdi: tipAdi.get(k.operasyonTipiId) ?? null, firmaAdi: firmalar.get(k.firmaId)?.ad ?? null,
    })),
    terminUyumu: uyum.map((u) => ({ ...u, firmaAdi: firmalar.get(u.firmaId)?.ad ?? null })),
  };
}

// Plan için fason süresi tahmini (sorgularla aynı sırada, takvim günü); veri yoksa null. Yetki denetlemez, yalnız okur; geçmişi tek okumada alır.
export async function fasonSuresiTahminleri(
  db: Db, sorgular: readonly { malzemeNo: number; operasyonTipiId: number | null; firmaId: number; adet: number }[],
): Promise<(number | null)[]> {
  if (!sorgular.some((q) => q.operasyonTipiId !== null)) return sorgular.map(() => null);
  const tek = (l: Set<number>): number | undefined => (l.size === 1 ? [...l][0] : undefined);
  const gecmis = await fasonGecmisi(db, { firmaId: tek(new Set(sorgular.map((q) => q.firmaId))), malzemeNo: tek(new Set(sorgular.map((q) => q.malzemeNo))) });
  const ornekler = fasonSureOrnekleri(gecmis);
  return sorgular.map((q) => (q.operasyonTipiId === null ? null : fasonSuresiTahmini(ornekler, { ...q, operasyonTipiId: q.operasyonTipiId })));
}
export async function menuSayaclari(db: Db, k: Kullanici): Promise<Record<string, number | null>> {
  const var_ = (i: (typeof k.islemler)[number]) => k.islemler.includes(i);
  const n = await s.menuSayilari(db);
  return {
    'is-kutusu': null,
    'dis-operasyonlar': null,
    talepler: var_(ISLEM.oku) ? n.acik : null,
    onaylar: var_(ISLEM.onayla) ? n.onayda : null,
    malzemeler: var_(ISLEM.oku) ? n.katalog : null,
    tedarikciler: var_(ISLEM.oku) ? n.tedarikci : null,
    raporlar: null,
    ayarlar: null,
  };
}


// ---- Logo bağlantısı (#205 karar 1): yalnız logo modülü çağırır; yetki denetlemez, çağıranın işlemini kullanır.
export interface LogoyaGidecekSiparis {
  id: number; no: string; tarih: string; firmaId: number; paraBirimi: string; kur: string | null; iskontoYuzdesi: string; termin: string | null;
  durum: 'bekliyor' | 'hata';
  satirlar: { satirId: number; stokKodu: string | null; hizmet: boolean; miktar: string; birim: string; birimFiyat: string }[];
}
// Düzenlemede Logo'daki kayıt ve satır numaraları da gelir; numarası boş satır Logo'ya yeni eklenir. Kaldırılan satırlar açık listededir.
export interface LogoyaGuncellemeGidecekSiparis extends Omit<LogoyaGidecekSiparis, 'satirlar'> {
  logoKayitNo: string; kaldirilanSatirRefleri: string[];
  satirlar: (LogoyaGidecekSiparis['satirlar'][number] & { logoSatirRef: string | null })[];
}
// Kuyruktaki (bekliyor ve hata) siparişler en eskiden; kayıtsız tedarikçinin siparişi gelmez. Stok kodu malzeme kartındandır.
export async function logoyaGidecekSiparisler(db: Db, sinir: number): Promise<LogoyaGidecekSiparis[]> {
  return (await logoKuyrugu(db, sinir, 'gonderim')).map(({ logoKayitNo: _k, kaldirilanSatirRefleri: _s, ...x }) => ({ ...x, satirlar: x.satirlar.map(({ logoSatirRef: _r, ...r }) => r) }));
}
export async function logoyaGuncellemeGidecekSiparisler(db: Db, sinir: number): Promise<LogoyaGuncellemeGidecekSiparis[]> {
  return (await logoKuyrugu(db, sinir, 'guncelleme')).map((x) => ({ ...x, logoKayitNo: x.logoKayitNo! }));
}
async function logoKuyrugu(db: Db, sinir: number, kuyruk: 'gonderim' | 'guncelleme') {
  const siparisler = await s.logoyaGidecekSiparislerOku(db, sinir, kuyruk);
  const kalemler = await s.logoSiparisKalemleriOku(db, siparisler.map((x) => x.id));
  const kartlar = await malzemeOzetleri(db, kalemler.flatMap((k) => (k.malzemeNo === null ? [] : [k.malzemeNo])));
  return siparisler.map((x) => ({
    ...x, kur: sade(x.kur), iskontoYuzdesi: sade(x.iskontoYuzdesi),
    satirlar: kalemler.filter((k) => k.siparisId === x.id).map((k) => {
      const kart = k.malzemeNo === null ? undefined : kartlar.get(k.malzemeNo);
      return {
        satirId: k.satirId, stokKodu: kart?.kod ?? null, hizmet: kart?.tur === 'hizmet', miktar: sade(k.miktar), birim: k.birim, birimFiyat: sade(k.birimFiyat),
        logoSatirRef: k.logoSatirRef,
      };
    }),
  }));
}
const logoHatasi = (h: string): string => (h.trim() === '' ? 'Logo hata metni vermedi.' : h.trim().slice(0, 2000));
// Başarıda kayıt ve satır numaraları yazılır; aynı sonuç ikinci kez gelirse değişmez. Sipariş yoksa ya da başka kayıt numarasıyla
// gönderilmişse ya da satır siparişte yoksa hata atılır (çağıranın işlemi geri sarar).
export async function siparisLogoSonucu(db: Db, id: number, sonuc: { kayitNo: string; satirlar: { satirId: number; logoSatirRef: string }[] } | { hata: string }): Promise<void> {
  if ('hata' in sonuc) { await s.siparisLogoHatasiYaz(db, id, logoHatasi(sonuc.hata)); return; }
  const sip = await s.siparisLogoBasarisiYaz(db, id, sonuc.kayitNo);
  if (sip === null) throw gecersiz(`Sipariş ${id} bulunamadı ya da başka bir Logo kaydıyla gönderilmiş.`);
  for (const r of sonuc.satirlar) {
    if (!(await s.siparisSatiriLogoRefYaz(db, sip, r.satirId, r.logoSatirRef))) throw gecersiz(`Sipariş satırı ${r.satirId} bu siparişte yok.`);
  }
}
// Düzenleme başarısında yeni satırların Logo numaraları yazılır. Sipariş bu arada iptal kuyruğuna girdiyse sonuç yok sayılır (iptal gider).
export async function siparisLogoGuncellemeSonucu(db: Db, id: number, sonuc: { satirlar: { satirId: number; logoSatirRef: string }[] } | { hata: string }): Promise<void> {
  const sip = await s.siparisLogoGuncellemeSonucuYaz(db, id, 'hata' in sonuc ? logoHatasi(sonuc.hata) : null);
  if (sip === null || 'hata' in sonuc) return;
  for (const r of sonuc.satirlar) {
    if (!(await s.siparisSatiriLogoRefYaz(db, sip, r.satirId, r.logoSatirRef))) throw gecersiz(`Sipariş satırı ${r.satirId} bu siparişte yok.`);
  }
}
// ---- Logo talep fişi ve karşılama (#205 S3 b, kart #790): yalnız logo modülü çağırır; yetki denetlemez, çağıranın işlemini kullanır.
export interface LogoyaGidecekTalep {
  id: number; no: string; tarih: string; ihtiyacTarihi: string | null; durum: 'bekliyor' | 'hata';
  satirlar: { satirId: number; stokKodu: string | null; miktar: string; birim: string }[];
}
export async function logoyaGidecekTalepler(db: Db, sinir: number): Promise<LogoyaGidecekTalep[]> {
  const talepler = await s.logoyaGidecekTaleplerOku(db, sinir);
  const kalemler = await s.logoTalepKalemleriOku(db, talepler.map((x) => x.id));
  const kartlar = await malzemeOzetleri(db, kalemler.flatMap((k) => (k.malzemeNo === null ? [] : [k.malzemeNo])));
  return talepler.map((x) => ({
    ...x,
    satirlar: kalemler.filter((k) => k.talepId === x.id).map((k) => ({
      satirId: k.satirId, stokKodu: (k.malzemeNo === null ? undefined : kartlar.get(k.malzemeNo))?.kod ?? null, miktar: sade(k.miktar), birim: k.birim,
    })),
  }));
}
export async function talepLogoSonucu(db: Db, id: number, sonuc: { kayitNo: string; satirlar: { satirId: number; logoSatirRef: string }[] } | { hata: string }): Promise<void> {
  if ('hata' in sonuc) { await s.talepLogoHatasiYaz(db, id, logoHatasi(sonuc.hata)); return; }
  const t = await s.talepLogoBasarisiYaz(db, id, sonuc.kayitNo);
  if (t === null) throw gecersiz(`Talep ${id} bulunamadı ya da başka bir Logo kaydıyla gönderilmiş.`);
  for (const r of sonuc.satirlar) {
    if (!(await s.talepKalemiLogoRefYaz(db, t.talepId, r.satirId, r.logoSatirRef))) throw gecersiz(`Talep satırı ${r.satirId} bu talepte yok.`);
  }
}
export interface LogoyaGidecekKarsilama {
  siparisSatirId: number; siparisKayitNo: string; talepSatirRef: string; siparisSatirRef: string; miktar: string; stokKodu: string; birim: string; firmaId: number;
}
// Stok kodu olmayan kartın satırı gelmez (Logo malzemesiz karşılama yapmaz).
export async function logoyaGidecekKarsilamalar(db: Db, sinir: number): Promise<LogoyaGidecekKarsilama[]> {
  const satirlar = await s.logoyaGidecekKarsilamalarOku(db, sinir);
  const kartlar = await malzemeOzetleri(db, satirlar.map((x) => x.malzemeNo));
  return satirlar.flatMap(({ malzemeNo, ...x }) => {
    const kod = kartlar.get(malzemeNo)?.kod ?? null;
    return kod === null ? [] : [{ ...x, miktar: sade(x.miktar), stokKodu: kod }];
  });
}
export async function karsilamaLogoSonucu(db: Db, siparisSatirId: number, sonuc: { karsilamaRef: string } | { hata: string }): Promise<void> {
  if ('hata' in sonuc) { await s.karsilamaLogoHatasiYaz(db, siparisSatirId, logoHatasi(sonuc.hata)); return; }
  if (!(await s.karsilamaLogoBasarisiYaz(db, siparisSatirId, sonuc.karsilamaRef))) {
    throw gecersiz(`Sipariş satırı ${siparisSatirId} bulunamadı ya da başka bir Logo karşılamasıyla gönderilmiş.`);
  }
}
export interface LogoyaKapatmaGidecekSiparis { id: number; no: string; logoKayitNo: string; satirRefleri: string[] }
export function logoyaKapatmaGidecekSiparisler(db: Db, sinir: number): Promise<LogoyaKapatmaGidecekSiparis[]> {
  return s.logoyaKapatmaGidecekSiparislerOku(db, sinir);
}
export async function siparisLogoKapatmaSonucu(db: Db, id: number, sonuc: { tamam: true } | { hata: string }): Promise<void> {
  await s.siparisLogoKapatmaSonucuYaz(db, id, 'hata' in sonuc ? logoHatasi(sonuc.hata) : null);
}
export function logoyaIptalGidecekSiparisler(db: Db, sinir: number): Promise<{ id: number; no: string; logoKayitNo: string }[]> {
  return s.logoyaIptalGidecekSiparislerOku(db, sinir);
}
export async function siparisLogoIptalSonucu(db: Db, id: number, sonuc: { tamam: true } | { hata: string }): Promise<void> {
  await s.siparisLogoIptalSonucuYaz(db, id, 'hata' in sonuc ? logoHatasi(sonuc.hata) : null);
}

// Kart #435: stoğun karşılayamadığı istekler iş kutusunda salt okunur görünür. Stok satın almayı ithal ettiği için satın alma stoğu
// ithal edemez (ADR 0006): kaynak stoktan gelir, sunucu açılışında kablolama kaydeder. Kayıtsız süreç sessizce boş dönmez, açık hata atar.
const STOK_YOK_SINIRI = 100;
export interface StokYokKaynagi {
  id: number; no: string; malzemeId: number; miktar: string; birim: string | null; uretimEmriId: number | null; acilma: string;
}
// 1647: sipariş satırı ilk yazıldığında kalemin malzemesinin yürürlükteki parça revizyonunu taşır. Revizyonun sahibi değişiklik
// yönetimidir ve bu modülü okur; bağı kablolama.ts kurar. Bağ yoksa ya da parçanın revizyonu yoksa boş kalır; sonra yazılmaz:
// yalnız bu kayıtta açılan satır (oncekiler dışı) yazılır (2881 Test B1).
export type ParcaRevizyonuCozucusu = (db: Db, malzemeNolari: readonly number[]) => Promise<Map<number, string>>;
let parcaRevizyonuCozucu: ParcaRevizyonuCozucusu = async () => new Map();
export function parcaRevizyonuCozucusuKaydet(cozucu: ParcaRevizyonuCozucusu): void { parcaRevizyonuCozucu = cozucu; }
async function siparisRevizyonlariniYaz(db: Db, talepId: string, oncekiler: readonly number[] = []): Promise<void> {
  const satirlar = await s.revizyonsuzSiparisSatirlari(db, talepId, oncekiler);
  if (satirlar.length === 0) return;
  const revizyonlar = await parcaRevizyonuCozucu(db, satirlar.map((x) => x.malzemeNo));
  await s.siparisSatiriRevizyonlariYaz(db, satirlar.flatMap((x) => {
    const r = revizyonlar.get(x.malzemeNo);
    return r === undefined ? [] : [{ id: x.id, parcaRevizyonu: r }];
  }));
}

export type StokYokCozucusu = (db: Db, sinir: number) => Promise<StokYokKaynagi[]>;
let stokYokCozucu: StokYokCozucusu | null = null;
export function stokYokCozucusuKaydet(cozucu: StokYokCozucusu): void { stokYokCozucu = cozucu; }

export async function stokYokIstekleri(db: Db): Promise<StokYokIstekleriCevabi> {
  if (stokYokCozucu === null) throw new Error('Stok yok isteği çözücüsü kayıtlı değil (sunucu/kablolama.ts).');
  const ham = await stokYokCozucu(db, STOK_YOK_SINIRI);
  const kartlar = await malzemeOzetleri(db, ham.map((i) => i.malzemeId));
  const emirler = await emirNolari(db, ham.flatMap((i) => (i.uretimEmriId === null ? [] : [i.uretimEmriId])));
  return {
    istekler: ham.map((i) => {
      const kart = kartlar.get(i.malzemeId);
      return {
        id: i.id, no: i.no, malzemeKodu: kart?.kod ?? null, malzemeAdi: kart?.ad ?? null, miktar: i.miktar, birim: i.birim,
        emirNo: i.uretimEmriId === null ? null : emirler.get(i.uretimEmriId) ?? null, acilma: i.acilma,
      };
    }),
  };
}

// ---- Kg fiyatı (SAT-77). TL karşılığı finansın bugünkü ya da önceki son kuruyla; kuru olmayan para biriminde boş.
async function kgKuru(db: Db, gun: string | null = null): Promise<s.KurDizisi> {
  const k = [...(await kurlar(db, gun ?? await s.bugun(db))).entries()];
  return { paraBirimleri: k.map(([p]) => p), kurlar: k.map(([, v]) => v.kur) };
}
async function kgFiyatiAdlari(db: Db, satirlar: s.KgFiyatiOkuma[]): Promise<KgFiyatiSatiri[]> {
  const kisiler = await kisiAdlari(db, satirlar.flatMap((x) => (x.iptal === null ? [x.kisiId] : [x.kisiId, x.iptal.kisiId])));
  return satirlar.map(({ kisiId, iptal, ...x }) => ({
    ...x, paraBirimi: x.paraBirimi as KgFiyatiSatiri['paraBirimi'], kisiAdi: ad(kisiler, kisiId),
    iptal: iptal === null ? null : { gerekce: iptal.gerekce, kisiAdi: ad(kisiler, iptal.kisiId), zaman: iptal.zaman },
  }));
}
// 2455-A: güncel satırın izleme alanları (kartta, yaş, eskime, son alış, sapma). Son alış teslimi olan kartlardan okunur; TL karşılığı ve
// farklı para birimli sapma bugünkü kurla (G1).
async function kgIzleme(db: Db, fiyatlar: s.KgFiyatiOkuma[], kur: s.KurDizisi, kullanilan: readonly { kaliteKodu: string; form: string | null }[]): Promise<GuncelKgFiyatiSatiri[]> {
  const bugun = tesisGunu(new Date());
  const eskime = await sistemAyariOku(db, 'satin-alma.kg-fiyati-eskime-gun');
  const esik = await sistemAyariOku(db, 'satin-alma.kg-fiyati-sapma-esigi');
  const nolar = await s.teslimliMalzemeNolari(db);
  const bilgiler = await malzemeMaliyetBilgileri(db, nolar);
  const alislar = await sonAlisFiyatlari(db, nolar);
  const kartlar = [...bilgiler].flatMap(([no, b]) => (b.kaliteKodu === null ? [] : [{
    kaliteKodu: b.kaliteKodu, form: b.form, stokBirimi: b.stokBirimi, birimKg: b.birimKg, sonAlis: alislar.get(no) ?? null,
  }]));
  const son = kgSonAlislari(fiyatlar, kartlar);
  const kurOf = new Map(kur.paraBirimleri.map((p, i) => [p, kur.kurlar[i]!]));
  const adli = await kgFiyatiAdlari(db, fiyatlar);
  return adli.map((f, i) => {
    const a = son.get(fiyatlar[i]!);
    const doviz = a?.kgFiyati ?? null;
    const sonAlisParaBirimi = a === undefined || doviz === null ? null : a.paraBirimi as KgFiyatiSatiri['paraBirimi'];
    const k = sonAlisParaBirimi === null ? undefined : kurOf.get(sonAlisParaBirimi);
    const sonAlisKgFiyati = doviz === null || k === undefined ? null : ondalikCarp(doviz, k);
    const yasGun = kgFiyatiYasi(f.gecerlilik, bugun);
    const sapmaYuzde = kgSapmasi({ kgFiyati: f.kgFiyati, paraBirimi: f.paraBirimi, tryKgFiyati: f.tryKgFiyati, sonAlisKgFiyatiDoviz: doviz, sonAlisParaBirimi, sonAlisKgFiyati });
    return {
      ...f, kartta: kgFiyatiKartta(f.kaliteKodu, f.form, kullanilan), yasGun, eskiMi: kgFiyatiEskiMi(yasGun, eskime),
      sonAlisKgFiyatiDoviz: doviz, sonAlisParaBirimi, sonAlisKgFiyati, sapmaYuzde, sapanMi: kgSapanMi(sapmaYuzde, esik),
    };
  });
}
export async function kgFiyatlari(db: Db, islemler: readonly string[]): Promise<KgFiyatlariCevabi> {
  const kur = await kgKuru(db);
  const fiyatlar = await s.guncelKgFiyatlari(db, kur);
  const kullanilan = await kullanilanKaliteler(db);
  const fiyatsizKaliteler = kullanilan.filter((k) => uygulananKgFiyati(fiyatlar, k.kaliteKodu, k.form) === null);
  const stokDegeri = islemler.includes('finans.oku') ? await kgStokDegeri(db) : null;
  return { fiyatlar: await kgIzleme(db, fiyatlar, kur, kullanilan), fiyatsizKaliteler, stokDegeri };
}

// Stok satın almayı ithal ettiği için satın alma stoğu ithal edemez: miktarı sunucu açılışında kablolama kaydeder (stokYokCozucusu gibi).
// Stok bütün kartların bakiyesini değer grubuyla verir (228 a, stok/disari degerGrubuToplamlari); satın alma hammaddeyi süzer.
export type StokMiktariCozucusu = (db: Db) => Promise<readonly { malzemeId: number; grup: 'kullanilabilir' | StokAyriGrubu; toplam: string }[]>;
let stokMiktariCozucu: StokMiktariCozucusu | null = null;
export function stokMiktariCozucusuKaydet(cozucu: StokMiktariCozucusu | null): void { stokMiktariCozucu = cozucu; }

const HAMMADDE_SAYFASI = 200;
async function hammaddeNolari(db: Db): Promise<number[]> {
  const nolar: number[] = [];
  for (let sayfa = 1; ; sayfa += 1) {
    const l = (await malzemeAra(db, { metin: null, turler: ['hammadde'], sayfa, sayfaBoyu: HAMMADDE_SAYFASI })).satirlar;
    nolar.push(...l.map((m) => m.id));
    if (l.length < HAMMADDE_SAYFASI) return nolar;
  }
}
// SAT-77: hammadde stok değeri iki fiyatla: güncel kg fiyatı (birim fiyatı bilinmeyen kalem dışarıda kalır) ve ortalama alış fiyatı.
async function kgStokDegeri(db: Db): Promise<KgStokDegeri> {
  const ayriBos = { kgFiyatiyla: null, alisFiyatiyla: null };
  const bos: KgStokDegeri = {
    kgFiyatiyla: null, alisFiyatiyla: null, kgFiyatsizKalem: 0, alisFiyatsizKalem: 0, ayriToplam: ayriBos,
    ayriGruplar: STOK_AYRI_GRUPLARI.map((grup) => ({ grup, ...ayriBos })), satirlar: [],
  };
  if (stokMiktariCozucu === null) return bos;
  const hammadde = new Set(await hammaddeNolari(db));
  const bakiyeler = (await stokMiktariCozucu(db)).filter((b) => hammadde.has(b.malzemeId));
  const nolar = [...new Set(bakiyeler.map((b) => b.malzemeId))];
  if (nolar.length === 0) return bos;
  const kg = await malzemeKgFiyatlari(db, nolar);
  const alis = await ortalamaAlisFiyatlari(db, nolar);
  const kgTutari = (l: readonly { malzemeId: number; toplam: string }[]) => stokTutari(l.map((b) => ({ miktar: b.toplam, tryBirimFiyati: kg.get(b.malzemeId)?.tryBirimFiyati ?? null })));
  const alisTutari = (l: readonly { malzemeId: number; toplam: string }[]) => stokTutari(l.map((b) => ({ miktar: b.toplam, tryBirimFiyati: alis.get(b.malzemeId)?.tryBirimFiyat ?? null })));
  const kullanilabilir = bakiyeler.filter((b) => b.grup === 'kullanilabilir');
  const ayri = bakiyeler.filter((b) => b.grup !== 'kullanilabilir');
  const kgToplam = kgTutari(kullanilabilir);
  const alisToplam = alisTutari(kullanilabilir);
  const gruplar = new Map<string, { kaliteKodu: string; form: string | null; nolar: Set<number> }>();
  for (const [no, f] of kg) {
    const anahtar = `${f.kaliteKodu}|${f.form ?? ''}`;
    const g = gruplar.get(anahtar) ?? { kaliteKodu: f.kaliteKodu, form: f.form, nolar: new Set<number>() };
    g.nolar.add(no);
    gruplar.set(anahtar, g);
  }
  return {
    kgFiyatiyla: kgToplam.tutar, alisFiyatiyla: alisToplam.tutar, kgFiyatsizKalem: kgToplam.fiyatsizKalem, alisFiyatsizKalem: alisToplam.fiyatsizKalem,
    ayriToplam: { kgFiyatiyla: kgTutari(ayri).tutar, alisFiyatiyla: alisTutari(ayri).tutar },
    ayriGruplar: STOK_AYRI_GRUPLARI.map((grup) => {
      const l = ayri.filter((b) => b.grup === grup);
      return { grup, kgFiyatiyla: kgTutari(l).tutar, alisFiyatiyla: alisTutari(l).tutar };
    }),
    satirlar: [...gruplar.values()].map((g) => ({ kaliteKodu: g.kaliteKodu, form: g.form, tutar: kgTutari(kullanilabilir.filter((b) => g.nolar.has(b.malzemeId))).tutar })),
  };
}
// Malzemenin birim fiyatı ve stokun güncel değeri (SAT-77): kartın kalite + formuna uygulanan güncel kg fiyatı ve stok birimi başına
// karşılığı. Kalitesi ya da fiyatı olmayan kart haritada yoktur; birim ağırlığı bilinmeyen kartta birim fiyat boştur.
export interface MalzemeKgFiyati {
  kaliteKodu: string; form: string | null; kgFiyati: string; paraBirimi: KgFiyatiSatiri['paraBirimi']; tryKgFiyati: string | null; gecerlilik: string;
  birimFiyati: string | null; tryBirimFiyati: string | null; talasKgFiyati: string | null; tryTalasKgFiyati: string | null;
}
export async function malzemeKgFiyatlari(db: Db, malzemeNolar: readonly number[]): Promise<Map<number, MalzemeKgFiyati>> {
  return new Map([...(await kgFiyatlariHesapla(db, malzemeNolar, null))].map(([no, { tryTalasBirimFiyati: _, ...f }]) => [no, f]));
}
// Stok değerlemesi (1382 d): verilen gün (boşsa bugün) geçerli kg fiyatı ve o günün kuruyla stok birimi başına TRY fiyatı; hurda
// talaş kg fiyatıyla değerlenir. Fiyatı olmayan kart haritada yoktur; birim ağırlığı bilinmeyen kartta fiyatlar boştur.
export interface DegerlemeKgFiyati { tryBirimFiyati: string | null; tryTalasBirimFiyati: string | null }
export async function degerlemeKgFiyatlari(db: Db, malzemeNolar: readonly number[], gun: string | null): Promise<Map<number, DegerlemeKgFiyati>> {
  return new Map([...(await kgFiyatlariHesapla(db, malzemeNolar, gun))].map(([no, f]) => [no, { tryBirimFiyati: f.tryBirimFiyati === null ? null : sade(f.tryBirimFiyati), tryTalasBirimFiyati: f.tryTalasBirimFiyati === null ? null : sade(f.tryTalasBirimFiyati) }]));
}
async function kgFiyatlariHesapla(db: Db, malzemeNolar: readonly number[], gun: string | null): Promise<Map<number, MalzemeKgFiyati & { tryTalasBirimFiyati: string | null }>> {
  const sonuc = new Map<number, MalzemeKgFiyati & { tryTalasBirimFiyati: string | null }>();
  if (malzemeNolar.length === 0) return sonuc;
  const bilgiler = await malzemeMaliyetBilgileri(db, [...malzemeNolar]);
  if (bilgiler.size === 0) return sonuc;
  const fiyatlar = await s.guncelKgFiyatlari(db, await kgKuru(db, gun), gun);
  for (const [no, b] of bilgiler) {
    if (b.kaliteKodu === null) continue;
    const f = uygulananKgFiyati(fiyatlar, b.kaliteKodu, b.form);
    if (f === null) continue;
    sonuc.set(no, {
      kaliteKodu: f.kaliteKodu, form: f.form, kgFiyati: f.kgFiyati, paraBirimi: f.paraBirimi as KgFiyatiSatiri['paraBirimi'], tryKgFiyati: f.tryKgFiyati, gecerlilik: f.gecerlilik,
      talasKgFiyati: f.talasKgFiyati, tryTalasKgFiyati: f.tryTalasKgFiyati,
      birimFiyati: birimFiyati(f.kgFiyati, b.stokBirimi, b.birimKg), tryBirimFiyati: birimFiyati(f.tryKgFiyati, b.stokBirimi, b.birimKg),
      tryTalasBirimFiyati: birimFiyati(f.tryTalasKgFiyati, b.stokBirimi, b.birimKg),
    });
  }
  return sonuc;
}
export async function kgFiyatiGecmisi(db: Db, kaliteKodu: string, form: string | null): Promise<KgFiyatiGecmisiCevabi> {
  return { girisler: await kgFiyatiAdlari(db, await s.kgFiyatiGecmisi(db, await kgKuru(db), kaliteKodu, form)) };
}
// 2455-2 a, V3: toplu yüklemede hepsi ya da hiçbiri; kartlarda olmayan kalite + form satır numarasıyla reddedilir.
export async function kgFiyatlariEkle(db: Db, k: Kullanici, satirlar: readonly s.KgFiyatiYazimi[]): Promise<KgFiyatlariCevabi> {
  const bilinmeyen = bilinmeyenKgSatirlari(satirlar, await kullanilanKaliteler(db));
  if (bilinmeyen.length > 0) throw gecersiz(ILETILER.kgBilinmeyen(bilinmeyen));
  await s.kgFiyatlariEkle(db, k.id, satirlar);
  return kgFiyatlari(db, k.islemler);
}
// 2455-A: iptal yeni satır yazar; iptal edilen giriş güncelden düşer (bir önceki giriş geçerli olur), geçmişte işaretli kalır.
export async function kgFiyatiIptalEt(db: Db, k: Kullanici, id: number, g: KgFiyatiIptalYazimi): Promise<KgFiyatlariCevabi> {
  const r = await kisitKorumali({}, () => s.kgFiyatiIptalEt(db, id, k.id, g.gerekce), { CAKISMA: ILETILER.kgZatenIptal });
  if (r === 'yok') throw bulunamadi(ILETILER.kgFiyatiYok);
  if (r === 'iptal-satiri') throw gecersiz(ILETILER.kgIptalSatiri);
  if (r === 'zaten-iptal') throw gecersiz(ILETILER.kgZatenIptal);
  return kgFiyatlari(db, k.islemler);
}

// 533 a: tedarik termini satın almanındır; satın alma ekranı ve planlama ekranı aynı komutla yazar (yetki uçta). Kişi ve zaman
// sunucudan. Geçmiş tarih kabul edilir: geç kalan termin planda işi bekletir, girişi reddetmek gecikmeyi saklardı.
const terminCikisi = ({ kisiId: _, ...t }: s.TedarikTerminiOkuma): TedarikTermini => t;
export async function tedarikTerminiKaydet(db: Db, k: Kullanici, g: TedarikTerminiKaydetYazimi): Promise<{ termin: TedarikTermini }> {
  const yazim = { malzemeNo: g.malzemeNo, termin: g.termin, aciklama: g.aciklama };
  if (g.surum === null) {
    if (!(await malzemeOzetleri(db, [g.malzemeNo])).has(g.malzemeNo)) throw dogrulama(ILETILER.terminMalzemesiYok, 'malzemeNo');
    const yeni = await s.tedarikTerminiEkle(db, yazim, k.id);
    if (yeni === null) throw cakisma(ILETILER.terminVar);
    return { termin: terminCikisi(yeni) };
  }
  const surum = g.surum;
  const satir = await surumluGuncelle({
    guncelle: () => s.tedarikTerminiGuncelle(db, yazim, surum, k.id), varMi: () => s.tedarikTerminiVarMi(db, g.malzemeNo), bulunamadiIletisi: ILETILER.terminMalzemesiYok,
  });
  return { termin: terminCikisi(satir) };
}
export async function tedarikTerminleriListesi(db: Db): Promise<TedarikTerminleriCevabi> {
  const satirlar = await s.tedarikTerminleriOku(db, null);
  const malzemeler = await malzemeOzetleri(db, satirlar.map((t) => t.malzemeNo));
  const adlar = await kisiAdlari(db, satirlar.flatMap((t) => (t.kisiId === null ? [] : [t.kisiId])));
  // Sipariş verilmiş malzeme "termin bekleniyor" görünmesin: açık siparişin beklenen teslimi satırda gösterilir (TMI A3).
  const gelisler = await malzemeGelisTarihleri(db, satirlar.map((t) => t.malzemeNo));
  const bugun = await s.bugun(db);
  return {
    takip: await terminTakibiKur(db, satirlar.map(terminCikisi), bugun),
    terminler: satirlar.map((t) => {
      const m = malzemeler.get(t.malzemeNo);
      return {
        ...terminCikisi(t), malzemeKodu: m?.kod ?? '', malzemeAdi: m?.ad ?? '', kisiAdi: t.kisiId === null ? null : adlar.get(t.kisiId) ?? null,
        siparisler: gelisler.get(t.malzemeNo) ?? [],
      };
    }),
    bugun,
  };
}
// 2433: ihtiyaç canlı plandan (2433-2 a), karşılayan açık talep ve sipariş, elle termin yalnız siparişsiz malzemede (2433-3 a).
async function terminTakibiKur(db: Db, elleTerminler: readonly TedarikTermini[], bugun: string): Promise<TerminTakipSatiri[]> {
  const planlar = await s.planIhtiyaclariOku(db);
  const kalemler = await s.terminKalemleriOku(db);
  const kartlar = await malzemeOzetleri(db, [...planlar.map((p) => p.malzemeNo), ...elleTerminler.map((t) => t.malzemeNo),
    ...kalemler.flatMap((k) => (k.malzemeNo === null ? [] : [k.malzemeNo]))]);
  const ozetler = await isEmriOzetleri(db, kalemler.flatMap((k) => (k.isEmriId === null ? [] : [k.isEmriId])));
  return terminTakibi({
    bugun, planlar, elleTerminler,
    kalemler: kalemler.map((k) => ({ ...k, talepDurumu: k.talepDurumu as TalepDurumu, miktar: sade(k.miktar) })),
    kartlar: new Map([...kartlar].map(([no, k]) => [no, { kod: k.kod, ad: k.ad, birim: k.birim, tur: k.tur }])),
    isEmirleri: new Map([...ozetler].map(([id, o]) => [id, `${o.emirNo} · Op ${o.opNo}`])),
  }).map((t) => ({ ...t, ihtiyacMiktari: sade(t.ihtiyacMiktari) }));
}
// Plan okuması: satırı olmayan malzeme haritada yoktur (termin bekliyor, ilk giriş sürümsüz yazılır).
export async function tedarikTerminleri(db: Db, malzemeNolar: readonly number[]): Promise<Map<number, TedarikTermini>> {
  const tekil = [...new Set(malzemeNolar)];
  if (tekil.length === 0) return new Map();
  return new Map((await s.tedarikTerminleriOku(db, tekil)).map((t) => [t.malzemeNo, terminCikisi(t)]));
}
// Plan "olması gereken" tarihi tam liste olarak bildirir; listede olmayanın gereken tarihi boşalır, termin kalır. Bilinmeyen
// malzeme ya da aynı malzemenin iki kez gelmesi çağıranın hatasıdır, yazılmaz.
// 898 a, 902 a: plan canlıya alınınca malzeme eksiği tam liste olarak yazılır. Bilinmeyen malzeme reddedilir (plan katalogda olanı yollar).
export async function planIhtiyaclariniYaz(
  db: Db, l: readonly { malzemeNo: number; miktar: number; gerekenTarih: string; emirler: readonly string[]; stokBilinmiyor: boolean }[],
): Promise<void> {
  const nolar = l.map((i) => i.malzemeNo);
  if (new Set(nolar).size !== nolar.length) throw gecersiz(ILETILER.planIhtiyaciTekrar);
  const kartlar = await malzemeOzetleri(db, nolar);
  const yok = nolar.filter((n) => !kartlar.has(n));
  if (yok.length > 0) throw gecersiz(`${ILETILER.terminMalzemesiYok} (${yok.join(', ')})`);
  await s.planIhtiyaclariYaz(db, l);
}
export async function tedarikIhtiyaclariniYaz(db: Db, ihtiyaclar: readonly { malzemeNo: number; gerekenTarih: string }[]): Promise<void> {
  const nolar = ihtiyaclar.map((i) => i.malzemeNo);
  if (new Set(nolar).size !== nolar.length) throw gecersiz('Aynı malzeme ihtiyaç listesinde iki kez var.');
  const kartlar = await malzemeOzetleri(db, nolar);
  const yok = nolar.filter((n) => !kartlar.has(n));
  if (yok.length > 0) throw gecersiz(`${ILETILER.terminMalzemesiYok} (${yok.join(', ')})`);
  await s.gerekenTarihleriYaz(db, ihtiyaclar);
}

// Takvim (891): siparişin beklenen teslim günü; tedarikçi firma adıdır, firmasız teklifte yazılan ad. Teslim durumu satırlardan
// (kapatılmış sipariş tamam) türer; tamamı teslim alınan biter. Yetki denetlemez; çağıran satin-alma.oku'yu denetler.
const TAKVIM_TESLIM_DURUMU: Readonly<Record<TeslimDurumu, string>> = { bekleniyor: 'Bekleniyor', kismi: 'Kısmi teslim', tamam: 'Teslim alındı' };
export async function takvimKayitlari(db: Db, baslangic: string, bitis: string): Promise<TakvimKaydi[]> {
  const satirlar = await s.takvimSiparisleri(db, baslangic, bitis);
  const adlar = await firmaAdlari(db, [...new Set(satirlar.flatMap((x) => (x.firmaId === null ? [] : [x.firmaId])))]);
  return satirlar.map((x): TakvimKaydi => {
    const durum = x.kapali ? 'tamam' : teslimDurumu(x.satirlar);
    return {
      kaynak: 'satin-alma', kimlik: String(x.id), tarih: x.beklenenTeslim, no: x.no,
      baslik: x.no ? `Sipariş ${x.no}` : x.talepBasligi,
      ilgili: x.firmaId === null ? x.tedarikciAdi || null : (adlar.get(x.firmaId) ?? (x.tedarikciAdi || null)), durum: TAKVIM_TESLIM_DURUMU[durum], bitti: durum === 'tamam',
    };
  });
}

// 2432: hatırlatma turu. Adaylar okunur, kural istenenleri verir; yeni olan açılır ve gönderilir, koşulu kalkan kapanır.
// 2452 (vardiya takvimi) ve 2453 (yalnız seçilen kişiler) gelene kadar iş günü tesisin hafta içi günleridir (UYUM-BORCU).
const ISGUNU_GERI_EN_COK = 400;
export async function hatirlatmalariYenile(db: Db, simdi: Date = new Date()): Promise<{ acilan: number; kapanan: number }> {
  const bugun = tesisGunu(simdi);
  const ayar: Partial<Record<(typeof HATIRLATMA_ADLARI)[number], number | null>> = {};
  for (const a of HATIRLATMA_ADLARI) ayar[a] = await sistemAyariOku(db, `satin-alma.hatirlatma-${a}`);
  const okunan = await s.hatirlatmaTalepleriOku(db);
  const talepler: HatirlatmaTalebi[] = okunan.map((r) => ({
    talepId: r.talepId, no: r.no, durum: r.durum, ihtiyacTarihi: r.ihtiyacTarihi, durumAni: r.durumZamani.toISOString(), durumGunu: tesisGunu(r.durumZamani),
    teklifIstegiVar: r.teklifIstegiVar, kararVar: r.kararVar, kararOnayli: r.kararVar && r.sonOnay?.sonuc === 'onay',
    sonOnay: r.sonOnay === null ? null : { id: r.sonOnay.id, gun: tesisGunu(new Date(r.sonOnay.zaman)) },
    kurKilidiBitisi: r.kurKilidi === null ? null : tesisGunu(new Date(r.kurKilidi.getTime() + KUR_KILIDI.gun * 86_400_000)),
    istekler: r.istekler, teklifler: r.teklifler, siparisler: r.siparisler,
  }));
  const enGeri = tesisGunu(new Date(simdi.getTime() - ISGUNU_GERI_EN_COK * 86_400_000));
  const baslangic = [...talepler.map((t) => t.durumGunu), ...talepler.flatMap((t) => t.istekler.map((r) => r.gonderim))]
    .reduce((a, b) => (b < a ? b : a), bugun);
  const ilk = baslangic < enGeri ? enGeri : baslangic;
  const tatiller = new Set((await resmiTatilGunleri(db, ilk, bugun)).map((t) => t.tarih));
  const kullanilan = await kullanilanKaliteler(db);
  const kgGuncel = (await s.guncelKgFiyatlari(db, { paraBirimleri: [], kurlar: [] })).map((f) => ({ ...f, kartta: kgFiyatiKartta(f.kaliteKodu, f.form, kullanilan) }));
  const istenen = [
    ...hatirlatmalar(talepler, ayar as HatirlatmaAyarlari, bugun, haftaIciGunleri(ilk, bugun, tatiller)),
    ...kgEskimeHatirlatmalari(kgGuncel, await sistemAyariOku(db, 'satin-alma.kg-fiyati-eskime-gun'), bugun),
  ];
  const kayitlar = await s.hatirlatmaKayitlari(db);
  const { acilacak, kapanacak } = hatirlatmaFarki(istenen, new Set(kayitlar.map((k) => k.anahtar)), kayitlar.filter((k) => k.acik));
  for (const k of kapanacak) await bildirimKapat(db, { tur: k.tur as Parameters<typeof bildirimKapat>[1]['tur'], kaynakKimlik: k.kaynakKimlik });
  await s.hatirlatmaKapat(db, kapanacak.map((k) => k.anahtar));
  let acilan = 0;
  for (const o of acilacak) {
    if (!await s.hatirlatmaEkle(db, hatirlatmaAnahtari(o), o.tur, o.talepId)) continue;
    await bildirimGonder(db, { tur: o.tur, baslik: o.baslik, yol: o.yol, kaynakKimlik: o.kaynakKimlik });
    acilan += 1;
  }
  return { acilan, kapanan: kapanacak.length };
}

// 2413 a: iptal edilmiş talep gerekçeyle iptalden önceki durumuna döner; dönüş genel kaydın bütün kurallarından geçer (sipariş onaylı
// karar ister, Logo iptali gitmişse geri alınmaz, siparişe dönüşte ödeme planı yeniden kurulur). Sürüm tutmazsa 409.
export async function iptaliGeriAl(db: Db, k: Kullanici, id: string, g: IptaliGeriAlYazimi, izYaz: FiyatIziYazici): Promise<IptaliGeriAlCevabi> {
  const eski = await talepOku(db, id);
  if (eski === null) throw bulunamadi(ILETILER.talepYok);
  if (eski.durum !== 'iptal') throw gecersiz(ILETILER.iptalDegil);
  // K8: ayırmayla boşalıp iptal edilen birleşik talep canlanmaz.
  if (eski.kalemler.length === 0) throw gecersiz(ILETILER.kalemsizGeriAlinmaz);
  const kayitli = await s.iptalOncesiDurum(db, id);
  const durum = kayitli ?? iptalOncesiTuret(eski);
  const hareket = { id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, metin: iptalGeriAlmaHareketi(eski.iptalNedeni, g.gerekce, kayitli === null) };
  // 2876 (Maliyet N1): grubun başka talebi siparişte ya da teslim alınmışsa geri alma serbesttir (2871-2 a) ama ikinci alım olabilir; geçmişe uyarı yazılır.
  const siparisteki = ikinciAlimRiski((await guncellemeGruplari(db, [id])).get(id) ?? [], id);
  const uyari = siparisteki.length === 0 ? [] : [{ id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, metin: ILETILER.grupSipariste(siparisteki) }];
  const talep = await talepKaydet(db, k, id, { ...eski, durum, iptalNedeni: '', hareketler: [...eski.hareketler, hareket, ...uyari], surum: g.surum }, izYaz, durum);
  return { talep, durum, turetildi: kayitli === null };
}

// K5: birleştirilmiş kaynak talep yerinde durur ama değişmez; değişiklik birleşik talepte yapılır.
function birlesmisiReddet(t: Talep): void {
  if (t.birlesme != null) throw gecersiz(ILETILER.birlesmis(t.birlesme.no));
}

// 2414 a: kaynaklar tek işlemde kilitlenir (K7), koşullar denetlenir, birleşik talep açılır ve kalemler ona taşınır. Kaynakların açanları
// ve talep edenleri birleşik talebin talep eden geçmişine girer (dört göz); okuma erişimine girmez (K3).
export async function talepleriBirlestir(db: Db, k: Kullanici, g: TalepBirlestirYazimi): Promise<Talep> {
  const bulunan = await s.talepleriKilitle(db, g.talepIdleri);
  if (bulunan.length !== g.talepIdleri.length) throw bulunamadi(ILETILER.talepYok);
  const kaynaklar = await talepleriKur(db, await s.talepSatirlariIdlerle(db, g.talepIdleri));
  for (const t of kaynaklar) {
    const red = birlestirmeReddi(t);
    if (red !== null) throw gecersiz(red);
  }
  if (kaynaklar.reduce((n, t) => n + t.kalemler.length, 0) > BIRLESIK_KALEM_SINIRI) throw gecersiz(ILETILER.birlesmeKalemSiniri);
  const projeRed = birlesmeProjesiReddi(kaynaklar);
  if (projeRed !== null) throw gecersiz(projeRed);
  const yeni = birlesikTalep(g.id, kaynaklar);
  const no = await belgeNo(db, 'satin-alma.talep-no', (x) => s.talepNoVarMi(db, x));
  await kisitKorumali({}, () => s.talepEkle(db, yeni, no, k.id, k.id), { CAKISMA: ILETILER.talepVar });
  await s.kalemleriBirlesenTalebeTasi(db, g.id, g.talepIdleri);
  await s.talepEdenGecmisiniKopyala(db, g.id, g.talepIdleri);
  await s.hareketEkle(db, g.id, randomUUID(), `Talepler birleştirildi: ${kaynaklar.map((t) => t.no).join(', ')}`, k.id);
  for (const t of kaynaklar) await s.hareketEkle(db, t.id, randomUUID(), `${no} talebinde birleştirildi.`, k.id);
  return (await talepOku(db, g.id))!;
}

// 2414 a: verilen kaynaklar (boşsa hepsi) kalemleriyle geri döner. Son kaynak da çıkınca birleşik talep silinmez, iptal edilir.
export async function talepAyir(db: Db, k: Kullanici, id: string, g: TalepAyirYazimi): Promise<Talep> {
  await surumluGuncelle({ guncelle: () => s.talepSurumuArttir(db, id, g.surum), varMi: () => s.talepVarMi(db, id), bulunamadiIletisi: ILETILER.talepYok });
  const t = (await talepOku(db, id))!;
  const red = ayirmaReddi(t, g.talepIdleri);
  if (red !== null) throw gecersiz(red);
  const kaynaklar = t.kaynaklar ?? [];
  const ayrilan = g.talepIdleri ?? kaynaklar.map((x) => x.talepId);
  await s.talepleriKilitle(db, ayrilan);
  await s.kalemleriKaynagaDondur(db, id, ayrilan);
  const nolar = kaynaklar.filter((x) => ayrilan.includes(x.talepId)).map((x) => x.no);
  await s.hareketEkle(db, id, randomUUID(), `Talepler ayrıldı: ${nolar.join(', ')}`, k.id);
  for (const kid of ayrilan) await s.hareketEkle(db, kid, randomUUID(), `${t.no} talebinden ayrıldı.`, k.id);
  if (ayrilan.length === kaynaklar.length) await s.kalemsizTalebiIptalEt(db, id, 'Bütün kaynak talepler ayrıldı.');
  return (await talepOku(db, id))!;
}

// 2611 a, 2637 a, 2638 (Veri 2): emir ve proje tutarı ile genel gider oranı aynı dağılımdan (satirYolu) okunur. Kart türü malzeme
// kartından (malzemeOzetleri pasif ve iptal kartı da döner; bulunamayan kartın yolu bilinmiyor), emrin projesi üretim emrinden gelir.
interface DagitilmisSiparis { talepId: string; teklifId: string; paraBirimi: string; dagilim: SiparisDagilimi; satirlar: (s.YolSatiri & { yol: SatirYolu })[]; girdiler: DagilimSatiri[]; masraf: number }
async function dagitilmisSiparisler(db: Db, f: s.YolFiltresi): Promise<DagitilmisSiparis[]> {
  const satirlar = await s.siparisYolSatirlari(db, f);
  if (satirlar.length === 0) return [];
  const kartlar = await malzemeOzetleri(db, [...new Set(satirlar.flatMap((r) => (r.malzemeNo === null ? [] : [r.malzemeNo])))]);
  const projeliEmirler = await emirlerinProjeleri(db, [...new Set(satirlar.flatMap((r) => (r.emirId === null ? [] : [r.emirId])))]);
  const siparisler = new Map<string, s.YolSatiri[]>();
  for (const r of satirlar) {
    const a = `${r.talepId}/${r.teklifId}`;
    siparisler.set(a, [...(siparisler.get(a) ?? []), r]);
  }
  return [...siparisler.values()].map((l) => {
    const ilk = l[0]!;
    const girdiler = l.map((r) => ({
      fason: r.fason, kartTuru: r.malzemeNo === null ? null : (kartlar.get(r.malzemeNo)?.tur ?? null),
      kartBulunamadi: r.malzemeNo !== null && !kartlar.has(r.malzemeNo),
      emirId: r.emirId, emirProjeli: r.emirId !== null && projeliEmirler.has(r.emirId), projeId: r.projeId,
      mal: Number(r.mal), miktar: Number(r.miktar), teslim: Number(r.teslim),
    }));
    const dagilim = siparisDagilimi(girdiler, Number(ilk.masraf));
    return { talepId: ilk.talepId, teklifId: ilk.teklifId, paraBirimi: ilk.paraBirimi, dagilim, satirlar: l.map((r, i) => ({ ...r, yol: satirYolu(girdiler[i]!) })), girdiler, masraf: Number(ilk.masraf) };
  });
}
function hedefTutarlari(siparisler: readonly DagitilmisSiparis[], yol: 'emir' | 'proje', istenen: ReadonlySet<number>): Map<number, { tutar: string; paraBirimi: string }[]> {
  const toplam = new Map<number, Map<string, number>>();
  for (const p of siparisler) {
    for (const h of p.dagilim.hedefler.filter((x) => x.yol === yol && istenen.has(x.hedefId))) {
      const m = toplam.get(h.hedefId) ?? new Map<string, number>();
      m.set(p.paraBirimi, (m.get(p.paraBirimi) ?? 0) + h.deger);
      toplam.set(h.hedefId, m);
    }
  }
  return new Map([...toplam].map(([id, m]) => [id, [...m].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([paraBirimi, t]) => ({ tutar: (Math.round(t * 100) / 100).toFixed(2), paraBirimi }))]));
}

// 2611 a, Maliyet C1: proje başına, para birimi başına projeye giden alım değeri (KDV hariç, sipariş para biriminde; N1: proje maliyeti
// bugünün kuruyla çevirir). Yalnız proje yolundaki satırlar ve masraf payları. Değeri olmayan proje haritada yoktur.
export async function projeSatinAlmaTutarlari(db: Db, projeIdler: readonly number[]): Promise<Map<number, { tutar: string; paraBirimi: string }[]>> {
  const tekil = [...new Set(projeIdler)];
  if (tekil.length === 0) return new Map();
  return hedefTutarlari(await dagitilmisSiparisler(db, { projeIdler: tekil }), 'proje', new Set(tekil));
}

// 2638 (Maliyet K1): üretim emri başına, para birimi başına emre yazılan hizmet alımı (emir yolu: emirli talepte fason olmayan hizmet ya da
// kartsız satır, emrin projesi varsa). KDV hariç, sipariş para biriminde. Değeri olmayan emir haritada yoktur.
export async function emirHizmetTutarlari(db: Db, emirIdler: readonly number[]): Promise<Map<number, { tutar: string; paraBirimi: string }[]>> {
  const tekil = [...new Set(emirIdler)];
  if (tekil.length === 0) return new Map();
  return hedefTutarlari(await dagitilmisSiparisler(db, { emirIdler: tekil }), 'emir', new Set(tekil));
}

// 2637 a, Mimar K1: Finans genel gider önerisinde siparişli belgenin oranını buradan çeker (kablolama, genelGiderOraniCozucusu). Anahtar
// 'talepId:teklifId'; değer 0-1 (altı ondalık), malı olmayan siparişte null; satırı olmayan sipariş haritada yoktur (bilinmiyor).
export async function siparisGenelGiderOranlari(db: Db, siparisler: readonly { talepId: string; teklifId: string }[]): Promise<Map<string, number | null>> {
  const tekil = [...new Map(siparisler.map((x) => [`${x.talepId}:${x.teklifId}`, x])).values()];
  if (tekil.length === 0) return new Map();
  return new Map((await dagitilmisSiparisler(db, { siparisler: tekil })).map((p) => [`${p.talepId}:${p.teklifId}`, p.dagilim.genelGiderOrani]));
}

// 2642 b: Finans'ın verdiği belge bilgisi (belgelerinSiparisleri); satın alma finans_belge'yi okumaz.
export interface EslemeBelgesi { belgeId: number; belgeNo?: string | null; firmaId?: number | null; talepId: string; teklifId: string; kdvHaricTutar: string; paraBirimi: string; iptal: boolean }
const siparisAnahtari = (x: { talepId: string; teklifId: string }): string => `${x.talepId}:${x.teklifId}`;

// 2642 b, 2646 a: belge başına genel gider oranı ve eşleme durumu; iptal belge haritada yok (Finans da sormaz). Eşleme belgenin güncel
// siparişinde değilse sayılmaz (Veri 1).
export async function belgeOranlariHesapla(db: Db, belgeler: readonly EslemeBelgesi[]): Promise<Map<number, { oran: number | null; esleme: EslemeDurumu }>> {
  const gecerli = belgeler.filter((b) => !b.iptal);
  if (gecerli.length === 0) return new Map();
  const siparisler = new Map((await dagitilmisSiparisler(db, { siparisler: gecerli })).map((p) => [siparisAnahtari(p), p]));
  const eslemeler = await s.faturaEslemeleri(db, gecerli.map((b) => b.belgeId));
  return new Map(gecerli.map((b) => {
    const p = siparisler.get(siparisAnahtari(b));
    const yollar = new Map((p?.satirlar ?? []).map((r) => [r.satirId, r.yol]));
    const kendi = eslemeler.filter((e) => e.belgeId === b.belgeId && e.kaldirilma === null);
    const sayilanSatirlar = new Set(kendi.filter((e) => siparisAnahtari(e) === siparisAnahtari(b)).map((e) => e.siparisSatiriId));
    const eslenen = new Set((p?.satirlar ?? []).flatMap((r, i) => (sayilanSatirlar.has(r.satirId) ? [i] : [])));
    return [b.belgeId, belgeGenelGiderOrani({
      belgeTutari: b.kdvHaricTutar, kalanOrani: p === undefined ? null : genelGiderOrani(p.girdiler, p.masraf, eslenen),
      eslemeler: kendi.map((e) => ({ tutar: e.tutar, yol: siparisAnahtari(e) === siparisAnahtari(b) ? (yollar.get(e.siparisSatiriId) ?? null) : null })),
    })];
  }));
}

export interface FaturaEslemesiOkuma {
  belgeId: number; belgeNo: string | null; firmaAdi: string | null; belgeTutari: string; paraBirimi: string; siparisParaBirimi: string | null; surum: number;
  satirlar: { siparisSatiriId: number; kalemAdi: string; miktar: string; birim: string; siparisTutari: string; yol: SatirYolu; tutar: string | null; baskaBelgelerden: string | null }[];
  bayat: { siparisSatiriId: number; tutar: string }[];
  eslenmemisKalan: string; oran: number | null; esleme: EslemeDurumu;
}
// 2642 b: eşleme ekranının verisi. Yetki ucundadır (Güvenlik K2: fiyat var).
export async function faturaEslemesiOku(db: Db, b: EslemeBelgesi): Promise<FaturaEslemesiOkuma> {
  const p = (await dagitilmisSiparisler(db, { siparisler: [b] }))[0];
  const tum = await s.faturaEslemeleri(db, [b.belgeId]);
  const etkin = tum.filter((e) => e.kaldirilma === null);
  const satirlar = p?.satirlar ?? [];
  // Maliyet (21:15Z): yalnız bu belgeyle aynı para birimindeki belgeler toplanır; başka para birimi katılmaz.
  const baskaSatirlar = await s.satirlarinBaskaEslemeleri(db, b.belgeId, satirlar.map((r) => r.satirId));
  const baskaBelgeler = await belgelerinSiparisleri(db, [...new Set(baskaSatirlar.map((x) => x.belgeId))]);
  const baskaKurus = new Map<number, number>();
  for (const x of baskaSatirlar) {
    const o = baskaBelgeler.get(x.belgeId);
    if (o === undefined || o.iptal || o.paraBirimi !== b.paraBirimi) continue;
    baskaKurus.set(x.siparisSatiriId, (baskaKurus.get(x.siparisSatiriId) ?? 0) + Math.round(Number(x.tutar) * 100));
  }
  const baska = new Map([...baskaKurus].map(([k, v]) => [k, (v / 100).toFixed(2)]));
  const sayilan = etkin.filter((e) => siparisAnahtari(e) === siparisAnahtari(b) && satirlar.some((r) => r.satirId === e.siparisSatiriId));
  const kurus = (x: string): number => Math.round(Number(x) * 100);
  const oran = (await belgeOranlariHesapla(db, [b])).get(b.belgeId) ?? { oran: null, esleme: 'yok' as const };
  // Arayüz K9: başlıkta belge no ve tedarikçi (firma adı sahibinden).
  const firmaAdi = b.firmaId === null || b.firmaId === undefined ? null : ((await firmaAdlari(db, [b.firmaId])).get(b.firmaId) ?? null);
  return {
    belgeId: b.belgeId, belgeNo: b.belgeNo ?? null, firmaAdi, belgeTutari: b.kdvHaricTutar, paraBirimi: b.paraBirimi, siparisParaBirimi: p?.paraBirimi ?? null, surum: eslemeSurumu(tum),
    satirlar: satirlar.map((r) => ({
      siparisSatiriId: r.satirId, kalemAdi: r.kalemAdi, miktar: r.miktar, birim: r.birim, siparisTutari: (Math.round(Number(r.mal) * 100) / 100).toFixed(2), yol: r.yol,
      tutar: sayilan.find((e) => e.siparisSatiriId === r.satirId)?.tutar ?? null, baskaBelgelerden: baska.get(r.satirId) ?? null,
    })),
    bayat: etkin.filter((e) => !sayilan.includes(e)).map((e) => ({ siparisSatiriId: e.siparisSatiriId, tutar: e.tutar })),
    eslenmemisKalan: ((kurus(b.kdvHaricTutar) - sayilan.reduce((t, e) => t + kurus(e.tutar), 0)) / 100).toFixed(2),
    ...oran,
  };
}

// 2642 b: tam liste kaydı; çağıran belgeyi Finans'ın kilidiyle aynı işlemde vermiştir (Mimar K1). Bayat eşlemeler de kaldırılır: liste
// belgenin bütün etkin eşlemesidir. Sürüm eskiyse 409.
export async function faturaEslemesiKaydet(db: Db, kisiId: number, b: EslemeBelgesi, g: { satirlar: readonly { siparisSatiriId: number; tutar: string }[]; surum: number }): Promise<void> {
  if (b.iptal) throw gecersiz(ILETILER.eslemeIptal);
  const tum = await s.faturaEslemeleri(db, [b.belgeId]);
  if (eslemeSurumu(tum) !== g.surum) throw cakisma(ILETILER.eslemeSurum);
  const siparisSatirlari = new Set((await s.siparisYolSatirlari(db, { siparisler: [b] })).filter((r) => siparisAnahtari(r) === siparisAnahtari(b)).map((r) => r.satirId));
  const hata = eslemeListesiHatasi(g.satirlar, siparisSatirlari, b.kdvHaricTutar);
  if (hata) throw gecersiz(hata);
  const etkin = tum.filter((e) => e.kaldirilma === null);
  const yeni = new Map(g.satirlar.map((x) => [x.siparisSatiriId, x.tutar]));
  const kalan = etkin.filter((e) => yeni.get(e.siparisSatiriId) !== undefined && Number(yeni.get(e.siparisSatiriId)) === Number(e.tutar) && siparisAnahtari(e) === siparisAnahtari(b));
  await s.faturaEslemesiKaldir(db, etkin.filter((e) => !kalan.includes(e)).map((e) => e.id), kisiId);
  for (const x of g.satirlar) {
    if (!kalan.some((e) => e.siparisSatiriId === x.siparisSatiriId)) await s.faturaEslemesiEkle(db, { belgeId: b.belgeId, siparisSatiriId: x.siparisSatiriId, tutar: x.tutar, kisiId });
  }
}

// 2642 b: belge Finans'tan okunur; kaydetmede Finans aynı işlemde kilitler (Mimar K1). Finans yalnız siparişli belgeyi döner: siparişsiz
// ve bulunmayan belge aynı 422'dir (belgenin varlığı fiyat değildir ama ayrı uç gerekmez).
async function eslemeBelgesi(db: Db, belgeId: number, kilitle: boolean): Promise<EslemeBelgesi> {
  const b = (await belgelerinSiparisleri(db, [belgeId], { kilitle })).get(belgeId);
  if (b === undefined) throw gecersiz(ILETILER.eslemeSiparissiz);
  return { belgeId, ...b };
}
export async function faturaEslemesiGetir(db: Db, belgeId: number): Promise<FaturaEslemesiOkuma> {
  const b = await eslemeBelgesi(db, belgeId, false);
  if (b.iptal) throw gecersiz(ILETILER.eslemeIptal);
  return faturaEslemesiOku(db, b);
}
export async function faturaEslemesiYaz(db: Db, kisiId: number, belgeId: number, g: { satirlar: readonly { siparisSatiriId: number; tutar: string }[]; surum: number }): Promise<FaturaEslemesiOkuma> {
  const b = await eslemeBelgesi(db, belgeId, true);
  await faturaEslemesiKaydet(db, kisiId, b, g);
  return faturaEslemesiOku(db, b);
}
// 2642 b, 2646 a: Finans genel gider önerisi bunu çözücüyle çeker (kablolama). Bulunmayan, siparişsiz ve iptal belge haritada yoktur.
export async function belgeGenelGiderOranlari(db: Db, belgeIdler: readonly number[]): Promise<Map<number, { oran: number | null; esleme: EslemeDurumu }>> {
  const tekil = [...new Set(belgeIdler)];
  if (tekil.length === 0) return new Map();
  const bilgi = await belgelerinSiparisleri(db, tekil, { kilitle: false });
  return belgeOranlariHesapla(db, [...bilgi].map(([belgeId, b]) => ({ belgeId, ...b })));
}

// 2614 1/2 a: idari talepten kalemsiz taslak satın alma talebi. Açan çevirendir (K3); talep eden idari talebi açandır ve harekete yazılır.
// Yetki burada da denetlenir (K2): çevirmek satın alma talebi açmaktır. Bir idari talep bir kez çevrilir (409, mevcut talep no).
export interface IdaridenTalep { idariTalepId: number; idariTalepNo: string; baslik: string; notlar: string; talepEdenKisiId: number }
export async function idariTaleptenTalepAc(db: Db, k: Kullanici, g: IdaridenTalep): Promise<{ id: string; no: string }> {
  if (!islemVarMi(k, ISLEM.talepAc) && !islemVarMi(k, ISLEM.yaz)) throw yetkiYok(ILETILER.yetkiYok);
  const onceki = (await s.idariTalepSatinAlmalari(db, [g.idariTalepId]))[0];
  if (onceki !== undefined) throw cakisma(ILETILER.idariCevrildi(onceki.no));
  const talepEden = await talepEdeniDenetle(db, k, g.talepEdenKisiId);
  const t: TalepYazimi = {
    id: randomUUID(), baslik: g.baslik.trim().slice(0, 160) || g.idariTalepNo, birim: null, talepEdenKisiId: talepEden, oncelik: 'normal',
    ihtiyacTarihi: null, notlar: g.notlar.slice(0, 4000), durum: 'taslak', iptalNedeni: '', agirliklar: null, kalemler: [], teklifIstekleri: [],
    teklifler: [], karar: null, onaylar: [], hareketler: [], senaryolar: [], uretimEmriId: null, projeId: null,
  };
  const no = await belgeNo(db, 'satin-alma.talep-no', (x) => s.talepNoVarMi(db, x));
  await kisitKorumali({}, () => s.talepEkle(db, t, no, talepEden, k.id, g.idariTalepId), { CAKISMA: ILETILER.idariCevrildi('başka bir') });
  const ad = (await kisiAdlari(db, [talepEden])).get(talepEden) ?? `#${talepEden}`;
  await s.hareketEkle(db, t.id, randomUUID(), `İdari talep ${g.idariTalepNo} çevrildi; talep eden: ${ad}`, k.id);
  return { id: t.id, no };
}

// 2614 1/2 a: idari talep başına çevrildiği satın alma talebi; çevrilmemiş idari talep haritada yok.
export async function idariTalepSatinAlmalari(db: Db, idariIdler: readonly number[]): Promise<Map<number, { talepId: string; no: string; durum: string }>> {
  const tekil = [...new Set(idariIdler)];
  if (tekil.length === 0) return new Map();
  return new Map((await s.idariTalepSatinAlmalari(db, tekil)).map((r) => [r.idariTalepId, { talepId: r.talepId, no: r.no, durum: r.durum }]));
}
