import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, gecersiz } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import { MALIYET_KALEMLERI, PROJE_MASRAF_KATEGORILERI } from '#paylasilan/sozlesme/proje-maliyet.ts';
import type {
  EksikVeri, MaliyetKalemi, MaliyetOzeti, MasrafSecenekleriCevabi, ProjeMaliyetCevabi, Taban,
} from '#paylasilan/sozlesme/proje-maliyet.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { birimMaliyetleri, faizGetir, genelGiderOrani, giderBelgeleri, giderBelgesiSecenekleri, kurGetir } from '../finans/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import type { BirimMaliyeti } from '../finans/disari.ts';
import { canliSira, karRiskiOraniGun } from '../plan/disari.ts';
import { projeGetir, projeSecenekleri } from '../projeler/disari.ts';
import { malzemeMaliyetBilgileri } from '../malzemeler/disari.ts';
import { isEmriFasonTutarlari, malzemeKgFiyatlari } from '../satin-alma/disari.ts';
import { emirlerinNetSarfi } from '../stok/disari.ts';
import { siparisAyrintisi, siparisSatiriOzetleri } from '../siparisler/disari.ts';
import { emirlerinMalzemeIhtiyaci, isEmriPlanBilgileri, isEmriSureleri, projeninIsEmirleri, uretimEmriOzeti } from '../uretim-emirleri/disari.ts';
import type { ProjeIsEmri } from '../uretim-emirleri/disari.ts';
import { defterdekiIsEmirleri, defterOku, defterYaz } from './sorgular.ts';
import * as sorgular from './sorgular.ts';
import {
  beklemeFinansmani, defteriUygula, genelGiderEksikleri, projeGeliri, dondurulacaklar, gercekTalasAdedi, gunlukFaizOrani, eksikKalemler, isEmriKaydi, malzemePlani, tahminiIsEmriMaliyeti, gecikmeCezasi, gecikmeGunu, gostergeler, haftalikBirikim, kalemKirilimi, karRiski, sapanIsEmirleri, tahminiBitis,
} from './kurallar.ts';
import { MASRAF_YOK, aramaKalibi, maliyetFarki, masrafReddi, tabanKarari } from './kurallar.ts';
import type { GelirPayi, MalzemeBileseni, MaliyetKaydi, TalasAdedi } from './kurallar.ts';

// Sipariş tutarı ve kâr için ayrıca bu işlem gerekir (180 cevabı: yalnız yönetici ve müdür). İşlem Çekirdek'in göçüyle gelir;
// listede yokken kimse fiyatı görmez.
export const FIYAT_ISLEMI = 'siparisler.fiyat-oku';

// Projenin iş emri kayıtları (PM-B1, PM-B2 kapandı) ve emir başına malzeme kaydı. Ücretler ve fason tutarı bugünün kuruyla TRY'ye çevrilir;
// kuru olmayan tutar bilinmez sayılır.
async function maliyetKayitlari(
  db: Db, projeId: number, bugun: string,
): Promise<{ kayitlar: MaliyetKaydi[]; eksikler: EksikVeri[]; isler: ProjeIsEmri[] }> {
  const eksikler = new Set<EksikVeri>();
  const isler = await projeninIsEmirleri(db, projeId);
  if (isler.length === 0) return { kayitlar: [], eksikler: [...eksikler], isler };
  const idler = isler.map((i) => i.isEmriId);
  const sureler = await isEmriSureleri(db, idler);
  const fasonlar = await isEmriFasonTutarlari(db, idler);
  const istasyonUcret = await birimMaliyetleri(db, 'istasyon');
  const kisiUcret = await birimMaliyetleri(db, 'kisi');
  const sira = await canliSira(db, idler);
  // Açık işte bugünün oranı; bitmiş işin oranı defterde dondurulur (199 a).
  const genelGider = await genelGiderOrani(db, bugun);
  for (const e of genelGiderEksikleri(isler.map((i) => i.kaynakTur), genelGider)) eksikler.add(e);
  const kurlar = new Map<string, number | null>();
  const tlye = async (tutar: string, paraBirimi: string): Promise<number | null> => {
    if (!kurlar.has(paraBirimi)) kurlar.set(paraBirimi, await kurGetir(db, paraBirimi, bugun).then((k) => (k === null ? null : Number(k.kur))));
    const kur = kurlar.get(paraBirimi) ?? null;
    if (kur === null) eksikler.add('kur_yok');
    return kur === null ? null : Number(tutar) * kur;
  };
  const ucret = async (u: BirimMaliyeti | undefined): Promise<number | null> => {
    if (u === undefined) { eksikler.add('birim_maliyet_eksik'); return null; }
    return tlye(u.birimMaliyet, u.paraBirimi);
  };
  const planBitis = new Map(sira.yerlesimler.map((y) => [y.isEmriId, tesisGunu(y.bitis)]));

  const kayitlar: MaliyetKaydi[] = [];
  for (const i of isler) {
    const sure = sureler.get(i.isEmriId) ?? null;
    const kisiSaat = new Map<number, number | null>();
    for (const k of sure?.katilim ?? []) kisiSaat.set(k.kisiId, await ucret(kisiUcret.get(k.kisiId)));
    const satirlar = fasonlar.get(i.isEmriId) ?? [];
    let toplam: number | null = 0;
    for (const f of satirlar) {
      const t = await tlye(f.tutar, f.paraBirimi);
      toplam = toplam === null || t === null ? null : toplam + t;
    }
    const istasyonSaat = i.kaynakTur === 'fason' ? null : await ucret(i.istasyonId === null ? undefined : istasyonUcret.get(i.istasyonId));
    kayitlar.push(isEmriKaydi({
      isEmri: { isEmriId: i.isEmriId, emirNo: i.emirNo, opNo: i.opNo, istasyonAd: i.istasyonAd, bitisZamani: i.bitis },
      kaynakTur: i.kaynakTur, durum: i.durum, adet: i.adet, saglam: i.saglam,
      birimSureDk: i.birimSureDk === null ? null : Number(i.birimSureDk), ayarSureDk: i.ayarSureDk === null ? null : Number(i.ayarSureDk),
      sure, istasyonSaat, genelGider, kisiSaat, fason: { satirlar, toplam },
      planBitisGunu: planBitis.get(i.isEmriId) ?? null, bitisGunu: i.bitis === null ? null : tesisGunu(new Date(i.bitis)),
    }, bugun));
  }
  for (const k of await malzemeKayitlari(db, isler, kayitlar, eksikler)) kayitlar.push(k);
  return { kayitlar, eksikler: [...eksikler], isler };
}

type ProjeIsi = Awaited<ReturnType<typeof projeninIsEmirleri>>[number];

// PM-25, PM-27: üretim emri başına malzeme kaydı (iş emrine bağlı değil, dondurulmaz). Plan reçeteden (emrin brüt ihtiyacı), gerçek stoktan
// emre verilen net sarftan; ikisi de kg fiyatından birim fiyat x miktar eksi talaş. Bileşen projedeki başka emrin ürünüyse iç yarımamuldür;
// maliyeti kendi emrinde olduğu için burada sayılmaz. Gerçek talaşın parça adedi PM-31.
async function malzemeKayitlari(db: Db, isler: readonly ProjeIsi[], isKayitlari: readonly MaliyetKaydi[], eksikler: Set<EksikVeri>): Promise<MaliyetKaydi[]> {
  const emirIdleri = [...new Set(isler.map((i) => i.uretimEmriId))];
  const sarflar = new Map<number, { malzemeNo: number; miktar: number }[]>();
  for (const r of await emirlerinNetSarfi(db, emirIdleri)) {
    const liste = sarflar.get(r.emirId) ?? [];
    liste.push({ malzemeNo: r.malzemeId, miktar: Number(r.miktar) });
    sarflar.set(r.emirId, liste);
  }
  const { bilesenler, netKg: urunNetKg, planBilesenleri } = await malzemeHazirla(db, emirIdleri, [...sarflar.values()].flat().map((b) => b.malzemeNo));
  const tutar = (b: readonly MalzemeBileseni[], adet: number, netKg: number | null, kullanim?: TalasAdedi): number | null => {
    if (b.some((x) => x.tryBirimFiyati === null)) eksikler.add('birim_maliyet_eksik');
    const p = malzemePlani(b, adet, netKg, kullanim);
    if (p.talas === null && p.tutar !== null) eksikler.add('talas_dusulmedi');
    return p.tutar;
  };
  const kayitBul = new Map(isKayitlari.flatMap((k) => (k.isEmri === null ? [] : [[k.isEmri.isEmriId, k] as const])));

  const sonuc: MaliyetKaydi[] = [];
  for (const emirId of emirIdleri) {
    const isleri = isler.filter((i) => i.uretimEmriId === emirId).sort((a, b) => a.opNo - b.opNo);
    const ilk = isleri[0];
    const son = isleri.at(-1);
    if (ilk === undefined || son === undefined) continue;
    const netKg = urunNetKg(emirId);
    const bitti = isleri.every((i) => i.durum === 'tamam');
    const planB = planBilesenleri(emirId);
    const plan = planB === null ? null : tutar(planB, ilk.adet, netKg);
    const gercek = tutar(bilesenler(sarflar.get(emirId) ?? []), ilk.adet, netKg, gercekTalasAdedi(bitti, ilk.adet, ilk.saglam, son.saglam));
    const kayitlari = isleri.flatMap((i) => kayitBul.get(i.isEmriId) ?? []);
    const planlar = kayitlari.flatMap((k) => (k.planTarihi === null ? [] : [k.planTarihi])).sort();
    const gercekler = kayitlari.flatMap((k) => (k.gercekTarihi === null ? [] : [k.gercekTarihi])).sort();
    sonuc.push({
      isEmri: null, ucretler: {}, bitti, adet: ilk.adet, saglam: son.saglam,
      planTarihi: planlar.at(-1) ?? null, gercekTarihi: gercekler.at(-1) ?? null,
      plan: { malzeme: plan }, gercek: { malzeme: gercek },
    });
  }
  return sonuc;
}

// Emirlerin malzeme fiyatlaması için ortak okuma: brüt ihtiyaç, emrin ürünü, bileşenlerin kg fiyatı ve ağırlığı. Bileşen, verilen emirlerden
// birinin ürünüyse iç yarımamuldür ve sayılmaz (maliyeti kendi emrindedir).
async function malzemeHazirla(db: Db, emirIdleri: readonly number[], ekNolar: readonly number[] = []) {
  const ihtiyaclar = await emirlerinMalzemeIhtiyaci(db, [...emirIdleri]);
  const urunler = new Map<number, { malzemeNo: number | null; adet: number } | null>();
  for (const id of emirIdleri) {
    const o = await uretimEmriOzeti(db, id);
    urunler.set(id, o === null ? null : { malzemeNo: o.malzemeNo, adet: o.adet });
  }
  const icUrunler = new Set([...urunler.values()].flatMap((u) => (u?.malzemeNo == null ? [] : [u.malzemeNo])));
  const nolar = [...new Set([...icUrunler, ...[...ihtiyaclar.values()].flatMap((l) => (l ?? []).map((b) => b.malzemeNo)), ...ekNolar])];
  const bilgiler = await malzemeMaliyetBilgileri(db, nolar);
  const fiyatlar = await malzemeKgFiyatlari(db, nolar);
  const sayi = (m: string | null | undefined): number | null => (m === null || m === undefined ? null : Number(m));
  const bilesenler = (satirlar: readonly { malzemeNo: number; miktar: number }[]): MalzemeBileseni[] =>
    satirlar.filter((b) => !icUrunler.has(b.malzemeNo)).map((b) => {
      const bilgi = bilgiler.get(b.malzemeNo);
      const fiyat = fiyatlar.get(b.malzemeNo);
      const kgMi = bilgi?.stokBirimi?.trim().toLocaleLowerCase('tr-TR') === 'kg';
      return {
        malzemeNo: b.malzemeNo, brut: b.miktar, tryBirimFiyati: sayi(fiyat?.tryBirimFiyati), hammadde: (bilgi?.kaliteKodu ?? null) !== null,
        kgBasina: kgMi ? 1 : bilgi?.birimKg ?? null, tryTalasKgFiyati: sayi(fiyat?.tryTalasKgFiyati),
      };
    });
  const netKg = (emirId: number): number | null => {
    const urun = urunler.get(emirId)?.malzemeNo ?? null;
    return urun === null ? null : bilgiler.get(urun)?.netKg ?? null;
  };
  const planBilesenleri = (emirId: number): MalzemeBileseni[] | null => {
    const ihtiyac = ihtiyaclar.get(emirId) ?? null;
    return ihtiyac === null ? null : bilesenler(ihtiyac.map((b) => ({ malzemeNo: b.malzemeNo, miktar: Number(b.brut) })));
  };
  return { urunler, bilesenler, netKg, planBilesenleri };
}

// Plan motoru (227 a) emrin planlanan malzeme maliyetini kâr katkısından düşer: PM-25 kuralıyla, bugünün kg fiyatıyla, TRY. Fiyatı eksik
// bileşen ya da ihtiyacı okunamayan emir null; bulunmayan emir haritada yoktur. Verilen emirlerden birinin ürünü olan bileşen sayılmaz.
// Yetki denetlemez.
export async function uretimEmriMalzemeMaliyetleri(db: Db, uretimEmriIdleri: readonly number[]): Promise<Map<number, number | null>> {
  const sonuc = new Map<number, number | null>();
  const idler = [...new Set(uretimEmriIdleri)];
  if (idler.length === 0) return sonuc;
  const { urunler, netKg, planBilesenleri } = await malzemeHazirla(db, idler);
  for (const id of idler) {
    const urun = urunler.get(id);
    if (urun === null || urun === undefined) continue;
    const b = planBilesenleri(id);
    sonuc.set(id, b === null ? null : malzemePlani(b, urun.adet, netKg(id)).tutar);
  }
  return sonuc;
}

// PM-36: emirlerin sipariş satırı payları; para birimi başına bugünün kuru. Satırsız emir gelire girmez ve bildirilir.
async function gelirHesapla(db: Db, isler: readonly ProjeIsEmri[], bugun: string, eksikler: EksikVeri[]): Promise<number | null> {
  const emirler = new Map(isler.map((i) => [i.uretimEmriId, i]));
  if ([...emirler.values()].some((e) => e.siparisSatiriId === null)) eksikler.push('satirsiz_emir');
  const bagli = [...emirler.values()].filter((e) => e.siparisSatiriId !== null);
  const satirlar = await siparisSatiriOzetleri(db, bagli.map((e) => e.siparisSatiriId!));
  const kurlar = new Map<string, number | null>();
  const paylar: GelirPayi[] = [];
  for (const e of bagli) {
    const satir = satirlar.get(e.siparisSatiriId!);
    if (satir === undefined) { paylar.push({ adet: e.adet, birimFiyat: null, kur: null, iptal: false }); continue; }
    if (!kurlar.has(satir.paraBirimi)) kurlar.set(satir.paraBirimi, await kurGetir(db, satir.paraBirimi, bugun).then((k) => (k === null ? null : Number(k.kur))));
    const kur = kurlar.get(satir.paraBirimi) ?? null;
    const iptal = satir.siparisDurumu === 'iptal';
    if (!iptal && kur === null && !eksikler.includes('kur_yok')) eksikler.push('kur_yok');
    paylar.push({ adet: e.adet, birimFiyat: satir.birimFiyat === null ? null : Number(satir.birimFiyat), kur, iptal });
  }
  return projeGeliri(paylar);
}

type Hesap = Omit<ProjeMaliyetCevabi, 'ozet'> & { isEmriSayisi: number };

// Projenin maliyet özeti (197 a): salt okuma; hesap kurallar.ts'tedir. Gelir sipariş para biriminden bugünün kuruyla TRY'ye çevrilir.
export async function projeMaliyeti(db: Db, kullanici: Kullanici, projeId: number, simdi = Date.now()): Promise<ProjeMaliyetCevabi> {
  const { isEmriSayisi: _sayi, ...h } = await hesapla(db, kullanici, projeId, simdi);
  return { ...h, ozet: await maliyetOzeti(db, projeId, h) };
}

async function hesapla(db: Db, kullanici: Kullanici, projeId: number, simdi: number): Promise<Hesap> {
  const proje = await projeGetir(db, projeId);
  if (proje === null) throw bulunamadi('Proje bulunamadı.');
  const fiyatGorunur = (kullanici.islemler as readonly string[]).includes(FIYAT_ISLEMI);
  const bugun = tesisGunu(simdi);
  const eksikler: EksikVeri[] = [];

  const siparis = proje.siparisId === null ? null : await siparisAyrintisi(db, proje.siparisId);
  if (siparis === null) eksikler.push('siparis_yok');
  // 198 a: bütçe alanı projeler'e eklenince projeGetir'den okunur (UYUM-BORCU PM-B4).
  const butce: number | null = null;

  const { kayitlar: guncel, eksikler: kayitEksikleri, isler } = await maliyetKayitlari(db, projeId, bugun);
  const gelir = await gelirHesapla(db, isler, bugun, eksikler);
  // 199 a: bitmiş iş emri defterden, açık iş emri güncel fiyatla.
  const isKayitlari = defteriUygula(guncel, await defterOku(db, projeId));
  eksikler.push(...kayitEksikleri);
  // 212 a, 213 a: bekleme finansmanı TL faiziyle, tahsilata (bitiş + sipariş vadesi) kadar; vade girilmemişse bitişe kadar.
  const faiz = isKayitlari.length === 0 ? null : await faizGetir(db, 'TRY', bugun);
  if (isKayitlari.length > 0 && faiz === null) eksikler.push('faiz_yok');
  if (siparis !== null && siparis.odemeVadesiGun === null) eksikler.push('vade_yok');
  const tabanEksik = eksikKalemler(isKayitlari);
  const finansman = beklemeFinansmani(
    isKayitlari, MALIYET_KALEMLERI.filter((k) => !tabanEksik.includes(k)), gunlukFaizOrani(faiz === null ? null : Number(faiz.aylikYuzde)),
    siparis?.odemeVadesiGun ?? 0, bugun,
  );
  const kayitlar = finansman === null ? isKayitlari : [...isKayitlari, finansman];
  const eksik = eksikKalemler(kayitlar);
  const dahil = MALIYET_KALEMLERI.filter((k) => !eksik.includes(k));
  // #10: bir kalem bilinmiyorsa ya da bekleme finansmanı hesaplanamıyorsa maliyet tam değildir.
  const tam = eksik.length === 0 && (finansman !== null || isKayitlari.length === 0);
  const g = gostergeler(kayitlar, dahil, gelir, butce, tam);
  const gecikme = gecikmeGunu(tahminiBitis(isKayitlari, bugun), siparis?.termin ?? null);
  // 227 a: kâr riski oranının tek kaynağı plan bedel ayarı (müdür değiştirir, 210 a).
  const karRiskiOrani = await karRiskiOraniGun(db);
  const fiyat = <T>(deger: T): T | null => (fiyatGorunur ? deger : null);
  const sayi = (metin: string | null | undefined): number | null => (metin === null || metin === undefined ? null : Number(metin));

  return {
    proje: { id: proje.id, kod: proje.kod, ad: proje.ad },
    siparis: siparis === null ? null : {
      id: siparis.id, no: siparis.no, termin: siparis.termin, paraBirimi: siparis.paraBirimi, tutar: fiyat(Number(siparis.araToplam)),
    },
    fiyatGorunur,
    bugun,
    gelir: fiyat(gelir),
    butce,
    hedef: g.hedef,
    plan: g.plan,
    gerceklesen: g.gerceklesen,
    bugunePlan: g.bugunePlan,
    kalanPlan: g.kalanPlan,
    sapma: fiyat(g.sapma),
    katkiPayi: fiyat(g.katkiPayi),
    katkiOrani: fiyat(g.katkiOrani),
    planlananKatkiOrani: fiyat(g.planlananKatkiOrani),
    karRiski: {
      gecikmeGunu: gecikme,
      gunlukOran: karRiskiOrani,
      tutar: fiyat(karRiski(g.katkiPayi, karRiskiOrani, gecikme)),
      ceza: fiyat(gecikmeCezasi(gelir, sayi(siparis?.cezaOraniGun), sayi(siparis?.cezaTavaniOrani), gecikme)),
    },
    kalemler: kalemKirilimi(kayitlar),
    haftalar: haftalikBirikim(kayitlar, dahil),
    sapanIsEmirleri: fiyatGorunur ? sapanIsEmirleri(kayitlar, dahil) : [],
    eksikKalemler: eksik,
    eksikler,
    isEmriSayisi: isler.length,
  };
}

// 199 a, 236 a: bitmiş iş emirlerinin o anki maliyetini deftere sunucu işi yazar; ekran yalnız okur. Defterde olmayan bitmiş iş emri
// bulunmayan proje hesaplanmaz. Dönen sayı yazılan satırdır.
export async function bitenleriDondur(db: Db, simdi = Date.now()): Promise<number> {
  const defterde = await defterdekiIsEmirleri(db);
  const bugun = tesisGunu(simdi);
  let yazilan = 0;
  for (const p of await projeSecenekleri(db, { yalnizAktif: false })) {
    const isler = await projeninIsEmirleri(db, p.id);
    if (!isler.some((i) => i.durum === 'tamam' && i.bitis !== null && !defterde.has(i.isEmriId))) continue;
    const { kayitlar } = await maliyetKayitlari(db, p.id, bugun);
    yazilan += await defterYaz(db, p.id, null, dondurulacaklar(kayitlar, defterde));
  }
  return yazilan;
}

// Plan motoru (Üretim emirleri 6c) iş emrinin tahmini maliyetini buradan alır: işleme + ayar + fason planı, TRY, KDV hariç, bugünün kuru
// ve ücretiyle. Biri bilinmiyorsa null; bulunmayan iş emri haritada yoktur. Yetki denetlemez.
export async function isEmriTahminiMaliyetleri(db: Db, isEmriIdleri: readonly number[], simdi = Date.now()): Promise<Map<number, number | null>> {
  const sonuc = new Map<number, number | null>();
  const idler = [...new Set(isEmriIdleri)];
  if (idler.length === 0) return sonuc;
  const bugun = tesisGunu(simdi);
  const bilgiler = await isEmriPlanBilgileri(db, idler);
  if (bilgiler.size === 0) return sonuc;
  const fasonlar = await isEmriFasonTutarlari(db, idler);
  const istasyonUcret = await birimMaliyetleri(db, 'istasyon');
  const kurlar = new Map<string, number | null>();
  const tlye = async (tutar: string, paraBirimi: string): Promise<number | null> => {
    if (!kurlar.has(paraBirimi)) kurlar.set(paraBirimi, await kurGetir(db, paraBirimi, bugun).then((k) => (k === null ? null : Number(k.kur))));
    const kur = kurlar.get(paraBirimi) ?? null;
    return kur === null ? null : Number(tutar) * kur;
  };
  for (const [id, b] of bilgiler) {
    const kaynakTur = b.kaynak?.tur ?? null;
    const satirlar = fasonlar.get(id) ?? [];
    let toplam: number | null = 0;
    for (const f of satirlar) {
      const t = await tlye(f.tutar, f.paraBirimi);
      toplam = toplam === null || t === null ? null : toplam + t;
    }
    const u = kaynakTur === 'fason' || b.istasyonId === null ? undefined : istasyonUcret.get(b.istasyonId);
    const istasyonSaat = u === undefined ? null : await tlye(u.birimMaliyet, u.paraBirimi);
    const kayit = isEmriKaydi({
      isEmri: { isEmriId: id, emirNo: '', opNo: b.opNo, istasyonAd: null, bitisZamani: null },
      kaynakTur, durum: 'bekliyor', adet: b.adet, saglam: null,
      birimSureDk: b.birimSureDk === null ? null : Number(b.birimSureDk), ayarSureDk: b.ayarSureDk === null ? null : Number(b.ayarSureDk),
      sure: null, istasyonSaat, genelGider: null, kisiSaat: new Map(), fason: { satirlar, toplam },
      planBitisGunu: null, bitisGunu: null,
    }, bugun);
    sonuc.set(id, tahminiIsEmriMaliyeti(kayit.plan));
  }
  return sonuc;
}

// --- Taban fotoğrafı (934, 936 a) ve üretim dışı masraf (911 b, 940 c) ---

async function maliyetOzeti(db: Db, projeId: number, h: Pick<Hesap, 'gerceklesen' | 'kalanPlan'>): Promise<MaliyetOzeti> {
  const tabanSatirlari = await sorgular.tabanlar(db, projeId);
  const baglar = await sorgular.masrafBaglari(db, projeId);
  const belgeler = await giderBelgeleri(db, baglar.map((b) => b.belgeId));
  const adlar = await kisiAdlari(db, [...tabanSatirlari.map((t) => t.kisiId), ...baglar.map((b) => b.kisiId)]);
  const tabanlar: Taban[] = tabanSatirlari.map((t) => ({
    sira: t.sira,
    plan: t.plan === null ? null : Number(t.plan),
    kalemler: MALIYET_KALEMLERI.map((kalem) => ({ kalem, plan: t.kalemler[kalem] ?? null })),
    eksikKalemler: t.eksikKalemler as MaliyetKalemi[],
    isEmriSayisi: t.isEmriSayisi,
    gerekce: t.gerekce,
    kisiAd: adlar.get(t.kisiId) ?? null,
    an: t.an,
  }));
  // Bağ belgeye yabancı anahtarla durur; belge silinmez, iptal edilir ve iptal satırı toplama girmez (PM-42).
  const masraflar = baglar.flatMap((b) => {
    const d = belgeler.get(b.belgeId);
    if (d === undefined) return [];
    return [{
      id: b.id, belgeId: b.belgeId, belgeNo: d.belgeNo, belgeTarihi: d.belgeTarihi, kategori: d.kategori, aciklama: d.aciklama,
      tutarTl: Number(d.tutarTl), iptal: d.durum === 'iptal', gorevId: b.gorevId, kisiAd: adlar.get(b.kisiId) ?? null, an: b.an,
    }];
  });
  const [taban = null, ...tabanGecmisi] = tabanlar;
  return { taban, tabanGecmisi, masraflar, ...maliyetFarki(taban?.plan ?? null, h.gerceklesen, h.kalanPlan, masraflar) };
}

const TABAN_KISITLARI = { proje_maliyet_taban_sira_tekil: 'Taban aynı anda başka biri tarafından alındı; sayfayı yenileyin.' };
const MASRAF_KISITLARI = {
  proje_maliyet_masraf_belge_tekil: { ileti: 'Bu belge zaten bir projeye bağlı.', alan: 'belgeId' },
  proje_maliyet_masraf_gorev: { ileti: 'Görev bu projede yok.', alan: 'gorevId' },
};

// PM-40: taban o anki plan maliyetidir (bugünün ücret ve kuruyla, bitmiş iş emri defterden); kişi ve zaman sunucudan.
export async function tabanAl(db: Db, kullanici: Kullanici, projeId: number, gerekce: string | null, simdi = Date.now()): Promise<{ tamam: true }> {
  const h = await hesapla(db, kullanici, projeId, simdi);
  const karar = tabanKarari((await sorgular.tabanlar(db, projeId)).length, h.isEmriSayisi, gerekce);
  if ('ret' in karar) throw gecersiz(karar.ret);
  await kisitKorumali(TABAN_KISITLARI, () => sorgular.tabanEkle(db, projeId, {
    sira: karar.sira,
    plan: h.plan,
    kalemler: Object.fromEntries(h.kalemler.map((k) => [k.kalem, k.plan])),
    eksikKalemler: h.eksikKalemler,
    isEmriSayisi: h.isEmriSayisi,
    gerekce: karar.gerekce,
  }, kullanici.id));
  return { tamam: true };
}

// PM-41: bağ kişiyle ve zamanla yazılır; bir belge tek projeye bağlanır, görev aynı projeden olmalıdır.
export async function masrafBagla(db: Db, kullanici: Kullanici, projeId: number, g: { belgeId: number; gorevId: number | null }): Promise<{ tamam: true }> {
  if ((await projeGetir(db, projeId)) === null) throw bulunamadi('Proje bulunamadı.');
  const belge = (await giderBelgeleri(db, [g.belgeId])).get(g.belgeId);
  const ret = masrafReddi(belge, PROJE_MASRAF_KATEGORILERI);
  if (ret === MASRAF_YOK) throw bulunamadi(ret);
  if (ret !== null) throw gecersiz(ret);
  await kisitKorumali(MASRAF_KISITLARI, () => sorgular.masrafBagla(db, projeId, g.belgeId, g.gorevId, kullanici.id));
  return { tamam: true };
}

export async function masrafBagiKaldir(db: Db, bagId: number): Promise<{ tamam: true }> {
  if (!(await sorgular.masrafBagiKaldir(db, bagId))) throw bulunamadi('Masraf bağı bulunamadı.');
  return { tamam: true };
}

// Seçici: bağlanabilecek belgeler (bağlı ve satın almaya bağlı olanlar düşer). Tutar finans rakamıdır, yalnız maliyet okuyana gider.
export async function masrafSecenekleri(db: Db, kullanici: Kullanici, ara: string): Promise<MasrafSecenekleriCevabi> {
  const adaylar = await giderBelgesiSecenekleri(db, aramaKalibi(ara), PROJE_MASRAF_KATEGORILERI);
  const bagli = await sorgular.bagliBelgeler(db, adaylar.map((b) => b.id));
  const gorur = islemVarMi(kullanici, 'finans.maliyet-oku');
  return {
    belgeler: adaylar.filter((b) => !b.satinAlmaBagli && !bagli.has(b.id)).map((b) => ({
      id: b.id, belgeNo: b.belgeNo, belgeTarihi: b.belgeTarihi, kategori: b.kategori, aciklama: b.aciklama, tutarTl: gorur ? Number(b.tutarTl) : null,
    })),
  };
}

