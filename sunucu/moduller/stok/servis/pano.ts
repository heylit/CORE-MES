import { type Db } from '#cekirdek/db.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import type { IkiliCevap } from '#cekirdek/uc.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import { STOK_ISLEMLERI } from '#paylasilan/islemler/stok.ts';
import type { IkinciMenuSayaclari } from '#paylasilan/sayfa-tanimi.ts';
import { ACIK_EMIR_DURUMLARI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { Hareket, HareketlerListesi, IsKutusuCevabi, AylikStokDegeriCevabi, StokDegeriCevabi, DegerlemeYontemi, AraCevabi, StokOzetiCevabi } from '#paylasilan/sozlesme/stok.ts';
import { type PartiBelgesi, type SiparisIrsaliyeleriCevabi, type SonParti } from '#paylasilan/sozlesme/stok.ts';
import { kayitlaraBagliBelgeler, kayittakiBelgeDosyasi } from '../../belge-merkezi/disari.ts';
import { malzemeAra, malzemeOzeti } from '../../malzemeler/disari.ts';
import { degerlemeKgFiyatlari, malKabulFiyatlari } from '../../satin-alma/disari.ts';
import { acikEmirler, emirDurumlari, emirlerinMalzemeIhtiyaci, fasonIsEmirleri, uretimEmriOzeti } from '../../uretim-emirleri/disari.ts';
import { binde, bindenMetin, partiEtiketi, stokDegeri, alisFiyatlari, emirsizCikisTutari as cikisTutari, DEGER_GRUPLARI, stoklanirMi, ihtiyacToplami, adetMiktari, fasonGonderimiEksikMi } from '../kurallar.ts';
import * as sorgular from '../sorgular.ts';
import { haritaOzeti, anaDepo } from './depo.ts';
import { fasonYariParcasi } from './dis-akis.ts';
import { malKabullerinIrsaliyeleri } from './irsaliye.ts';
import { emirNoDe, emirNoHaritasi, hareketleriCevir } from './ortak.ts';
import { istekIstasyonlari } from './teslim.ts';
import { type TamamlamaOnbellegi, onbellekliOzetler, kalanIhtiyacPlani, adimBilgisi } from './uretim.ts';

// ---- İş kutusu ve menü sayaçları ------------------------------------------------------------------------------------
export async function isKutusu(db: Db, islemler: readonly string[], kisiId: number): Promise<IsKutusuCevabi> {
  const s = await sorgular.isKutusuSayilari(db);
  const depo = await sorgular.depoKimligi(db, 'ANA');
  const y = depo === null ? null : await sorgular.yerlesim(db, depo);
  const sayim = y ? (await sorgular.sayimBekleyenGozler(db, y.sayim_suresi_gun)).length : null;
  return {
    kabuldeBekleyen: s?.kabuldeBekleyen ?? 0, eksiBakiye: s?.eksiBakiye ?? 0, kritik: s?.kritik ?? 0, sayimBekleyen: sayim, logoFarki: s?.logoFarki ?? 0, logoHatasi: s?.logoHatasi ?? 0,
    fasondaEksik: await fasondaEksikSayisi(db),
    fasonEksikGonderimi: await fasonEksikGonderimSayisi(db),
    // Akış A provası D1: teslimi bekleyen istek depo işidir; yolda teslimi olan istek bekleyen sayılmaz.
    teslimBekleyenIstek: islemler.includes('stok.transfer')
      ? await sorgular.teslimBekleyenIstekSayisi(db, await istekIstasyonlari(db, { id: kisiId, islemler })) : null,
    depoyaGelenTeslim: islemler.includes('stok.transfer') ? await sorgular.depoyaGelenTeslimSayisi(db) : null,
    defterFarki: islemler.includes('stok.eksi-onayla') ? (await sorgular.sonDefterKarsilastirmasi(db))?.farkSayisi ?? null : null,
  };
}
// Fason firmasında parçası kalan emirlerden kapanmış olanlar; açık emrin parçası firmada beklenen yerdedir.
async function fasondaEksikSayisi(db: Db): Promise<number> {
  const firmada = await sorgular.firmadakiEmirler(db);
  if (firmada.length === 0) return 0;
  const durumlar = await emirDurumlari(db, firmada.map((e) => e.uretimEmriId));
  return firmada.filter((e) => !(ACIK_EMIR_DURUMLARI as readonly string[]).includes(durumlar.get(e.uretimEmriId) ?? '')).length;
}
// Açık fason işlerinde istasyonda yeterli parça olmadığı için gönderimi eksik giden (emir, firma, kart) sayısı (borç #440, kullanıcı kararı 16.10):
// gönderim reddedilmez; gönderilen adet ile "Yolda" konumuna giren taşıma karşılaştırılır. İlk adımda önceki istasyon yoktur, stok taşınmaz ve sayılmaz.
export async function fasonEksikGonderimSayisi(db: Db): Promise<number> {
  const beklenen = new Map<string, { emirId: number; firmaId: number; malzemeId: number; miktar: bigint }>();
  // Bir emrin birden çok fason işi ve aynı ürün kartı olur: emir ve kart özeti bir kez okunur.
  const emirler = new Map<number, Awaited<ReturnType<typeof uretimEmriOzeti>>>();
  const kartlar = new Map<number, Awaited<ReturnType<typeof malzemeOzeti>>>();
  for (const x of await fasonIsEmirleri(db)) {
    if (x.firmaId === null || (x.gonderilen ?? 0) <= 0) continue;
    if (!emirler.has(x.uretimEmriId)) emirler.set(x.uretimEmriId, await uretimEmriOzeti(db, x.uretimEmriId));
    const emir = emirler.get(x.uretimEmriId)!;
    const bilgi = await adimBilgisi(db, x.isEmriId);
    if (!emir || emir.malzemeNo === null || !bilgi || (bilgi.onculOpNolari ?? bilgi.oncekiOpNolari).length === 0) continue;
    if (!kartlar.has(emir.malzemeNo)) kartlar.set(emir.malzemeNo, await malzemeOzeti(db, emir.malzemeNo));
    const o = kartlar.get(emir.malzemeNo)!;
    if (!o || (o.tur !== 'mamul' && o.tur !== 'yarimamul')) continue;
    const yari = await fasonYariParcasi(db, x.uretimEmriId, emir.malzemeNo, x.isEmriId);
    const malzemeId = yari?.malzemeId ?? emir.malzemeNo;
    const miktar = yari ? adetMiktari(BigInt(x.gonderilen!) * 1000n, yari.birim) : BigInt(x.gonderilen!) * 1000n;
    const anahtar = `${String(x.uretimEmriId)}:${String(x.firmaId)}:${String(malzemeId)}`;
    const onceki = beklenen.get(anahtar);
    beklenen.set(anahtar, { emirId: x.uretimEmriId, firmaId: x.firmaId, malzemeId, miktar: (onceki?.miktar ?? 0n) + miktar });
  }
  let n = 0;
  const yoldalar = new Map<number, Awaited<ReturnType<typeof sorgular.firmaKonumu>>>();
  for (const b of beklenen.values()) {
    if (!yoldalar.has(b.firmaId)) yoldalar.set(b.firmaId, await sorgular.firmaKonumu(db, b.firmaId, 'yolda'));
    const yolda = yoldalar.get(b.firmaId)!;
    const tasinan = yolda === null ? 0n : binde(await sorgular.fasonaTasinan(db, b.emirId, b.malzemeId, yolda));
    if (fasonGonderimiEksikMi(b.miktar, tasinan)) n += 1;
  }
  return n;
}
// Rol panosu: yetkisi olmayan sayı hesaplanmaz, null döner. Sayım süresi tanımsızsa (ana depo yerleşimi yok) sayım null.
export async function stokOzeti(db: Db, islemler: readonly string[]): Promise<StokOzetiCevabi> {
  const okur = islemler.includes('sayfa.stok') || STOK_ISLEMLERI.some((i) => islemler.includes(i));
  let sayimBekleyen: number | null = null;
  if (islemler.includes('stok.sayim')) {
    const depo = await sorgular.depoKimligi(db, 'ANA');
    const y = depo === null ? null : await sorgular.yerlesim(db, depo);
    sayimBekleyen = y ? (await sorgular.sayimBekleyenGozler(db, y.sayim_suresi_gun)).length : null;
  }
  return {
    acikIstek: islemler.includes('stok.transfer') ? await sorgular.acikIstekSayisi(db) : null,
    dusukStok: okur ? await sorgular.dusukStokSayisi(db) : null,
    sayimBekleyen,
    eksikEmir: okur ? await eksikEmirSayisi(db) : null,
  };
}
// Açık emirlerden plana göre kalan ihtiyacı kullanılabilir stokla karşılanamayanlar: bir öngörüdür; tamamlama eksik aramaz (K-1 a). Her emir stoğu
// tek başına görür: iki emir aynı malzemeyi bekliyorsa ikisi de yeterli sayılabilir. Ürün kartı olmayan eski emir sayılmaz.
// Emirler aynı malzemeleri paylaşır: bakiye ve kart özeti tek okuma işleminde bir kez okunur (hesap aynı, sorgu azalır).
async function eksikEmirSayisi(db: Db): Promise<number> {
  const onbellek: TamamlamaOnbellegi = { bakiye: new Map(), ozet: new Map() };
  const ids = (await acikEmirler(db)).map((e) => e.id);
  const ihtiyaclar = await emirlerinMalzemeIhtiyaci(db, ids);
  const verilenler = await sorgular.emirlerinNetSarfi(db, ids);
  let n = 0;
  for (const id of ids) {
    const satirlar = ihtiyaclar.get(id) ?? null;
    if (satirlar === null) continue;
    const ihtiyac = ihtiyacToplami(satirlar.map((m) => ({ malzemeId: m.malzemeNo, brut: m.brut })));
    const verilen = new Map(verilenler.filter((v) => v.emirId === id).map((v) => [v.malzemeId, binde(v.miktar)]));
    const ozet = await onbellekliOzetler(db, [...ihtiyac.keys()], onbellek);
    if ((await kalanIhtiyacPlani(db, ihtiyac, verilen, ozet, onbellek)).bilesenler.some((b) => binde(b.eksik) > 0n)) n += 1;
  }
  return n;
}
// Sayaç ucu: madde anahtarı -> sayı. Yetkisi olmayan maddenin sayısı null (kabuk göstermez); sayılamayan madde null.
export async function menuSayaclari(db: Db, islemler: readonly string[], kisiId: number): Promise<IkinciMenuSayaclari> {
  const k = await isKutusu(db, islemler, kisiId);
  const kapsamliIstasyonlar = await istekIstasyonlari(db, { id: kisiId, islemler });
  // İş kutusu ekranındaki satır sayısı: sıfır olmayan her iş türü bir satırdır (ekranla aynı sayı). Ekran tanım yetkilisine eşlenmemiş
  // harita yerini de iş olarak gösterir; sayaç da sayar.
  const eslenmemis = islemler.includes('stok.tanim') ? (await haritaOzeti(db)).eslenmemis : 0;
  const isler = [k.kabuldeBekleyen, k.eksiBakiye, k.kritik, k.logoFarki, k.logoHatasi, k.sayimBekleyen ?? 0, k.fasondaEksik, k.fasonEksikGonderimi, k.teslimBekleyenIstek ?? 0, k.depoyaGelenTeslim ?? 0, eslenmemis, k.defterFarki ?? 0].filter((n) => n > 0).length;
  return {
    'is-kutusu': islemler.includes('sayfa.stok') ? isler : null,
    'mal-kabul': islemler.includes('stok.giris') ? k.logoFarki : null,
    // Hazırlık: bekleyen istekler ve açık listeler birlikte.
    hazirlik: islemler.includes('stok.transfer') || islemler.includes('stok.toplama')
      ? (islemler.includes('stok.transfer') ? await sorgular.acikIstekSayisi(db, kapsamliIstasyonlar) : 0) + await sorgular.toplamaSay(db, 'topluyor', kapsamliIstasyonlar) : null,
    depo: null, 'komut-karti': null, 'seri-listeler': null,
    // Depo sevk (960): sayaç yok; liste sevkiyatın tetiklediği kalemlerdir, kabuk rozet göstermez.
    'depo-sevk': null,
    sepet: islemler.includes('stok.transfer') ? (await sorgular.sepetSatirlari(db, kisiId)).length : null,
    malzemeler: null, hareketler: null, 'refakat-kartlari': null, 'malzeme-fisleri': null, konumlar: null, ayarlar: null,
    'sayim-onaylari': islemler.includes('stok.sayim-onayla') ? await sorgular.bekleyenSayimFarkiSayisi(db) : null,
    'sahipsiz-statulu': null,
    'defter-farklari': k.defterFarki ?? null,
  };
}

// ---- Stok değeri (1382 d): üç yöntemin tek hesabı ---------------------------------------------------------------------------
// Kesim: `son` o andan önceki mal kabuller (null bütün geçmiş), `gun` kg fiyatının ve kurun günü (null bugün). Hurda her yöntemde
// talaş fiyatıyladır; fiyatı satın almadan (disari) gelir, eldeki miktar ve mal kabul sırası stoğundur.
interface Kesim { son: string | null; gun: string | null }
interface KesimFiyati { fiyat: ReadonlyMap<number, string | null>; talas: ReadonlyMap<number, string | null> }
async function degerlemeFiyatlari(db: Db, yontem: DegerlemeYontemi, malzemeIdler: readonly number[], kesimler: readonly Kesim[]): Promise<KesimFiyati[]> {
  const nolar = [...new Set(malzemeIdler)];
  let alis: Map<number, { ortalama: string | null; sonAlis: string | null }>[] = [];
  if (yontem !== 'guncel_kg' && nolar.length > 0) {
    const olaylar = await sorgular.degerlemeAlisOlaylari(db, nolar);
    const fiyat = await malKabulFiyatlari(db, olaylar.map((o) => o.malKabulSatirId));
    alis = alisFiyatlari(olaylar.map((o) => ({ ...o, fiyat: fiyat.get(o.malKabulSatirId) ?? null })), kesimler.map((k) => k.son));
  }
  const sonuc: KesimFiyati[] = [];
  for (const [i, k] of kesimler.entries()) {
    const kg = await degerlemeKgFiyatlari(db, nolar, k.gun);
    const alisFiyati = (no: number) => { const f = alis[i]?.get(no); return (yontem === 'son_alis' ? f?.sonAlis : f?.ortalama) ?? null; };
    sonuc.push({
      fiyat: new Map(nolar.map((no) => [no, yontem === 'guncel_kg' ? kg.get(no)?.tryBirimFiyati ?? null : alisFiyati(no)])),
      talas: new Map(nolar.map((no) => [no, kg.get(no)?.tryTalasBirimFiyati ?? null])),
    });
  }
  return sonuc;
}
const kurusa = (d: string): bigint => BigInt(d.replace('.', ''));
const kurustan = (k: bigint): string => `${k / 100n}.${(k % 100n).toString().padStart(2, '0')}`;
// Ayrı fiyatla değerlenen satırların (hurda ve öteki) değeri: fiyatlı kart yoksa null, fiyatsız kartlar sayılır.
function degerleriTopla(l: readonly { deger: string | null; fiyatsizKart: number }[]): { deger: string | null; fiyatsizKart: number } {
  const fiyatli = l.flatMap((x) => (x.deger === null ? [] : [kurusa(x.deger)]));
  return { deger: fiyatli.length === 0 ? null : kurustan(fiyatli.reduce((a, b) => a + b, 0n)), fiyatsizKart: l.reduce((a, x) => a + x.fiyatsizKart, 0) };
}
function hurdaAyriDeger(l: readonly { malzemeId: number; toplam: string; hurda: boolean }[], f: KesimFiyati): { deger: string | null; fiyatsizKart: number } {
  return degerleriTopla([stokDegeri(l.filter((x) => !x.hurda), f.fiyat), stokDegeri(l.filter((x) => x.hurda), f.talas)]);
}

export async function stokDegeriOku(db: Db, islemler: readonly string[], yontem: DegerlemeYontemi): Promise<StokDegeriCevabi> {
  if (!islemler.includes('finans.oku')) {
    return { degerGorunur: false, yontem, stokDegeri: null, fiyatsizKart: 0, ayri: { kalite: null, hurda: null, fason: null, yolda: null, diger: null, toplam: null } };
  }
  const gruplar = await sorgular.degerGrubuMalzemeToplamlari(db);
  const [f] = await degerlemeFiyatlari(db, yontem, gruplar.map((g) => g.malzemeId), [{ son: null, gun: null }]);
  const grup = (g: (typeof gruplar)[number]['grup']) => stokDegeri(gruplar.filter((x) => x.grup === g), g === 'hurda' ? f!.talas : f!.fiyat);
  const d = Object.fromEntries(DEGER_GRUPLARI.map((g) => [g, grup(g)])) as Record<(typeof DEGER_GRUPLARI)[number], ReturnType<typeof stokDegeri>>;
  return {
    degerGorunur: true, yontem, stokDegeri: d.kullanilabilir.deger, fiyatsizKart: d.kullanilabilir.fiyatsizKart,
    ayri: {
      kalite: d.kalite.deger, hurda: d.hurda.deger, fason: d.fason.deger, yolda: d.yolda.deger, diger: d.diger.deger,
      toplam: degerleriTopla(Object.values(d)).deger,
    },
  };
}

// Çıkışların anındaki son alış fiyatı (TRY; stok değerinin son alış yöntemiyle aynı hesap): her çıkışa fiyatı ya da null.
async function cikisSonAlislari(db: Db, cikislar: readonly { malzemeId: number; zaman: string; miktar: string }[]): Promise<{ miktar: string; fiyat: string | null }[]> {
  if (cikislar.length === 0) return [];
  const zamanlar = [...new Set(cikislar.map((c) => c.zaman))];
  const olaylar = await sorgular.degerlemeAlisOlaylari(db, [...new Set(cikislar.map((c) => c.malzemeId))]);
  const fiyat = await malKabulFiyatlari(db, olaylar.map((o) => o.malKabulSatirId));
  const kesimler = alisFiyatlari(olaylar.map((o) => ({ ...o, fiyat: fiyat.get(o.malKabulSatirId) ?? null })), zamanlar);
  return cikislar.map((c) => ({ miktar: c.miktar, fiyat: kesimler[zamanlar.indexOf(c.zaman)]?.get(c.malzemeId)?.sonAlis ?? null }));
}

// 2623 a, 2594 b: ayın ('GGGG-AA') emirsiz genel kullanım çıkışlarının tutarı (TL), finansın genel gider "diğer" bileşenine. Fiyat
// çıkış anındaki son alıştır; 2710 b: fiyatı bilinmeyen çıkış toplama girmez, `eksik` listesine yazılır (finans genel gider uyarısı).
// Yetki denetlemez.
export async function emirsizCikisTutari(db: Db, ay: string): Promise<{ tutar: number; eksik: string[] }> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ay)) throw new Error(`Ay biçimi geçersiz: ${ay}`);
  const tutar = cikisTutari(await cikisSonAlislari(db, await sorgular.emirsizCikislar(db, ay)));
  return { tutar: Number(tutar.tutar), eksik: tutar.fiyatsizCikis === 0 ? [] : [`${tutar.fiyatsizCikis} stok çıkışının son alış fiyatı yok; tutara girmedi`] };
}

// 2727-1 (2613-3 a): emir ve malzeme başına net sarf (emirlerinNetSarfi ile aynı çift ve miktar) ve tutarı: geri alınmamış her çıkışın
// miktarı x çıkış anındaki son alış (TL kuruşlu metin). Çiftte son alışı bilinmeyen çıkış varsa tutar null. 2739-2 (2733 a): ilkZaman
// çiftin geri alınmamış ilk sarf ya da fire çıkışının anı (proje siparişi emirlere bu sırayla dağılır); böyle çıkış yoksa null.
// Yetki denetlemez.
export async function emirSarfSonAlisTutarlari(db: Db, emirIdler: readonly number[]): Promise<{ emirId: number; malzemeId: number; miktar: string; tutar: string | null; ilkZaman: string | null }[]> {
  if (emirIdler.length === 0) return [];
  const idler = [...new Set(emirIdler)];
  const [netler, cikislar] = [await sorgular.emirlerinNetSarfi(db, idler), await sorgular.emirlerinSarfCikislari(db, idler)];
  const fiyatli = await cikisSonAlislari(db, cikislar);
  const anahtar = (emirId: number, malzemeId: number) => `${emirId}|${malzemeId}`;
  // Çıkışlar zaman sırasıyla gelir: çiftin ilk satırı ilk çıkışıdır.
  const ciftler = new Map<string, { ilkZaman: string; satirlar: { miktar: string; fiyat: string | null }[] }>();
  for (const [i, c] of cikislar.entries()) {
    const k = anahtar(c.emirId, c.malzemeId);
    const v = ciftler.get(k) ?? { ilkZaman: c.zaman, satirlar: [] };
    v.satirlar.push(fiyatli[i]!);
    ciftler.set(k, v);
  }
  return netler.map((n) => {
    const c = ciftler.get(anahtar(n.emirId, n.malzemeId));
    const t = cikisTutari(c?.satirlar ?? []);
    return { emirId: n.emirId, malzemeId: n.malzemeId, miktar: n.miktar, tutar: t.fiyatsizCikis > 0 ? null : t.tutar, ilkZaman: c?.ilkZaman ?? null };
  });
}

// Yönetici paneli (#1079): ay sonu stok değeri serisi. Ay listesi verisiz aylarda da tamdır; stoksuz ay null değerlidir.
export async function aylikStokDegeri(db: Db, islemler: readonly string[], ay: number, yontem: DegerlemeYontemi): Promise<AylikStokDegeriCevabi> {
  if (!islemler.includes('finans.oku')) return { degerGorunur: false, yontem, aylar: [] };
  const satirlar = await sorgular.aySonuMalzemeToplamlari(db, ay);
  const aylar = [...new Map(satirlar.map((x) => [x.ay, { ay: x.ay, son: x.son, gun: x.son === null ? null : x.gun }])).values()];
  const kartli = satirlar.flatMap((x) => (x.malzemeId === null || x.toplam === null ? [] : [{ ay: x.ay, malzemeId: x.malzemeId, toplam: x.toplam, hurda: x.hurda === true }]));
  const fiyatlar = await degerlemeFiyatlari(db, yontem, kartli.map((x) => x.malzemeId), aylar);
  return {
    degerGorunur: true, yontem,
    aylar: aylar.map((a, i) => {
      const d = hurdaAyriDeger(kartli.filter((x) => x.ay === a.ay), fiyatlar[i]!);
      return { ay: a.ay, stokDegeri: d.deger, fiyatsizKart: d.fiyatsizKart };
    }),
  };
}

// ---- Hareket listesi: süzgeçsiz istekte sayım yok (defter büyür) ----------------------------------------------------------------
export async function hareketListesi(db: Db, s: HareketlerListesi): Promise<SayfaliListe<Hareket>> {
  // Depocunun en sık sorusu "bu malzeme ne oldu": metin konum, parti, açıklama ve fiş noya ek olarak malzeme adı ve stok kodunda da aranır.
  // Kart aramanın üst sınırı kadardır (200); daha geniş metinde ilk 200 kart.
  const metinMalzemeleri = s.metin == null ? undefined
    : (await malzemeAra(db, { metin: s.metin, sayfa: 1, sayfaBoyu: 200 })).satirlar.map((m) => m.id);
  const suzgec: sorgular.HareketSuzgeci = {
    malzemeId: s.malzemeId, konumId: s.konumId, partiId: s.partiId, tur: s.tur, uretimEmriId: s.uretimEmriId, baslangic: s.baslangic, bitis: s.bitis, metin: s.metin,
    metinMalzemeleri,
  };
  const l = await sayfaliListe(s, {
    ...(sorgular.suzgecVarMi(suzgec) ? { say: () => sorgular.hareketSay(db, suzgec) } : {}),
    satirlar: (d) => sorgular.hareketler(db, suzgec, s, d),
  });
  return { ...l, satirlar: await hareketleriCevir(db, l.satirlar) };
}

// ---- Stok içi arama (önizlemedeki Ctrl K) ------------------------------------------------------------------------------------
// Malzeme kart numarasıyla (ya da MLZ:no) ve ad ya da stok koduyla (`malzemeAra`, ilk 8) bulunur. Hizmet kartı stoklanmadığı için
// önerilmez (mal kabul, fason ve toplama seçicileri bu aramayı kullanır); hizmet satırı sipariş satırıyla gelir.
export async function ara(db: Db, q: string): Promise<AraCevabi> {
  const sonuclar: AraCevabi['sonuclar'] = [];
  const no = /^(?:MLZ[:\s-]*)?(\d{1,9})$/i.exec(q)?.[1];
  const kartlar = new Map<number, { id: number; ad: string | null; kod: string; tur: string }>();
  if (no !== undefined) {
    const o = await malzemeOzeti(db, Number(no));
    if (o) kartlar.set(o.id, o);
  }
  for (const o of (await malzemeAra(db, { metin: q, sayfa: 1, sayfaBoyu: 8 })).satirlar) if (!kartlar.has(o.id)) kartlar.set(o.id, o);
  for (const o of [...kartlar.values()].filter((x) => stoklanirMi(x.tur))) {
    const b = await sorgular.malzemeBakiyeleri(db, o.id);
    sonuclar.push({ tur: 'malzeme', malzemeId: o.id, ad: o.ad, kod: o.kod, toplam: bindenMetin(b.reduce((t, x) => t + binde(x.miktar), 0n)) });
  }
  const kod = q.replace(/^LOC[:\s-]*/i, '');
  for (const k of await sorgular.konumAra(db, kod)) sonuclar.push({ tur: 'konum', ...k });
  for (const r of await sorgular.rafAra(db, q)) sonuclar.push({ tur: 'raf', ...r });
  const partiler = await sorgular.partiAra(db, q);
  const nolar = await emirNoHaritasi(db, partiler.map((p) => p.uretimEmriId));
  for (const p of partiler) sonuclar.push({ tur: 'parti', partiId: p.partiId, malzemeId: p.malzemeId, etiket: partiEtiketi({ lotNo: p.lotNo, tedarikciPartiNo: p.tedarikciPartiNo, dokumNo: p.dokumNo, uretimEmriId: p.uretimEmriId }, emirNoDe(nolar, p.uretimEmriId)) ?? '' });
  return { sonuclar };
}

export async function sayimBekleyenler(db: Db): Promise<{ gun: number; gozler: { konumId: number; kod: string; sonSayim: string | null }[] }> {
  const y = (await sorgular.yerlesim(db, await anaDepo(db)))!;
  return { gun: y.sayim_suresi_gun, gozler: await sorgular.sayimBekleyenGozler(db, y.sayim_suresi_gun) };
}

// ---- Son partiler ve sertifikaları (#960) ------------------------------------------------------------------------------------
export async function partiBelgeleri(db: Db, partiIdler: number[]): Promise<Map<number, PartiBelgesi[]>> {
  if (partiIdler.length === 0) return new Map();
  const bagli = await kayitlaraBagliBelgeler(db, 'stok', [...new Set(partiIdler)]);
  return new Map([...bagli].map(([id, l]) => [id, l.map(({ id: belgeId, ad, tur, harf, revKodu }) => ({ id: belgeId, ad, tur, harf, revKodu }))]));
}
export async function sonPartiler(db: Db, malzemeId: number, sinir: number): Promise<SonParti[]> {
  const partiler = await sorgular.sonPartiler(db, malzemeId, sinir);
  const belgeler = await partiBelgeleri(db, partiler.map((p) => p.partiId));
  return partiler.map((p) => ({ ...p, belgeler: belgeler.get(p.partiId) ?? [] }));
}
// Dosya yalnız o partiye bağlıysa verilir: stok, kendi gösterdiği kaydın belgesini kendi ucundan verir.
export async function partiBelgeDosyasi(db: Db, partiId: number, belgeId: number): Promise<IkiliCevap> {
  const dosya = await kayittakiBelgeDosyasi(db, 'stok', partiId, belgeId);
  if (dosya === null) throw bulunamadi('Partide bu belge yok.');
  return dosya;
}

export async function siparisIrsaliyeleri(db: Db, siparisSatirIdler: readonly number[]): Promise<SiparisIrsaliyeleriCevabi> {
  const l = await sorgular.siparisIrsaliyeleri(db, siparisSatirIdler);
  const belgeler = await malKabullerinIrsaliyeleri(db, l.map((x) => x.malKabulId));
  return { irsaliyeler: l.map((x) => ({ ...x, belgeler: belgeler.get(x.malKabulId) ?? [] })) };
}
