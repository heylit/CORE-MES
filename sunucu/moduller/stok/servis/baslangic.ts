import { type Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type {
  BaslangicDenetleCevabi, BaslangicDuzeltmesi, BaslangicGeriAlmaDurumu, BaslangicSatirDenetimi, BaslangicYukleCevabi, MalKabulCevabi, MalzemeTuru,
} from '#paylasilan/sozlesme/stok.ts';
import type { z } from 'zod';
import type { baslangicDenetleGovdesi, baslangicYukleGovdesi } from '#paylasilan/sozlesme/stok.ts';
import { kisiAdlari } from '../../kisiler/disari.ts';
import { malzemeNoKoddan, malzemeOzellikleri, malzemeOzetleri, sktTakipliKartlar } from '../../malzemeler/disari.ts';
import { baslangicAciklamasi, baslangicGeriAlmaEngeli, baslangicSatirDenetimi, binde, bindenMetin } from '../kurallar.ts';
import * as sorgular from '../sorgular.ts';
import { tersCevir } from './hareket.ts';
import { bakiyeDegistir, belgeNo, hareket, korumali, partiBulVeyaAc, partiyiNoylaAc } from './ortak.ts';
import { bekleyenlereDagit } from './uretim.ts';

// Başlangıç stoğu (3129, 3134 a, 3144 a): Excel'den toplu giriş tek mal kabul belgesidir (tür 'baslangic'). İstemci sütunları eşler ve
// satırları düzeltir; sunucu son satırları aynı kurallarla yeniden denetler ve ya hepsini ya hiçbirini yazar. Dosyanın kendisi saklanmaz
// (3144 a, ADR 0030): belgede adı, özeti ve düzeltmeler kalır. Logo'ya hiçbir şey gitmez (giriş fişi yalnız üretimde bağlanır).
type DenetleKomutu = z.output<typeof baslangicDenetleGovdesi>;
type YukleKomutu = z.output<typeof baslangicYukleGovdesi>;
type Satir = DenetleKomutu['satirlar'][number];

const bos = (x: string | undefined): string | null => (x === undefined || x.trim() === '' ? null : x.trim());
const bindeMetni = (m: string | undefined): string | null => (m === undefined ? null : bindenMetin(binde(m)));
const kodAnahtari = (k: string): string => k.trim().toLocaleUpperCase('tr');

interface CozulenSatir {
  girdi: Satir;
  denetim: BaslangicSatirDenetimi;
  malzemeId: number | null;
  konumId: number | null;
  tur: MalzemeTuru | null;
  lotNo: string | null;
  varOlanLot: number | null;
  sonKullanma: string | null;
}

// Satırlar toplu çözülür: kodlar kart ve konuma, lot no'lar var olan lotlara, (malzeme, göz) çiftleri bakiyeye. Sorgu sayısı satır sayısına
// değil ayrı kod sayısına bağlıdır.
async function coz(db: Db, satirlar: readonly Satir[]): Promise<CozulenSatir[]> {
  const kodlar = [...new Set(satirlar.flatMap((s) => (s.malzemeId === undefined && bos(s.malzemeKodu) !== null ? [kodAnahtari(s.malzemeKodu!)] : [])))];
  const koddan = new Map<string, number | null>();
  for (const k of kodlar) koddan.set(k, await malzemeNoKoddan(db, k));
  const malzemeNo = (s: Satir): number | null => (s.malzemeId !== undefined ? Number(s.malzemeId) : bos(s.malzemeKodu) === null ? null : koddan.get(kodAnahtari(s.malzemeKodu!)) ?? null);
  const nolar = satirlar.map(malzemeNo);
  const kartIdleri = [...new Set(nolar.filter((n): n is number => n !== null))];
  const ozetler = await malzemeOzetleri(db, kartIdleri);
  const ozellikler = await malzemeOzellikleri(db, kartIdleri);
  const skt = await sktTakipliKartlar(db, kartIdleri);

  const konumKodlari = [...new Set(satirlar.flatMap((s) => (s.konumId === undefined && bos(s.konumKodu) !== null ? [s.konumKodu!.trim()] : [])))];
  const konumIdleri = [...new Set(satirlar.flatMap((s) => (s.konumId === undefined ? [] : [Number(s.konumId)])))];
  const kodluKonumlar = new Map<string, sorgular.BaslangicKonumu>();
  for (const k of await sorgular.konumlarKodlarla(db, konumKodlari)) if (!kodluKonumlar.has(k.kod.toUpperCase())) kodluKonumlar.set(k.kod.toUpperCase(), k);
  const idliKonumlar = new Map((await sorgular.konumlarIdlerle(db, konumIdleri)).map((k) => [k.id, k]));
  const konumu = (s: Satir): sorgular.BaslangicKonumu | null =>
    (s.konumId !== undefined ? idliKonumlar.get(Number(s.konumId)) ?? null : bos(s.konumKodu) === null ? null : kodluKonumlar.get(s.konumKodu!.trim().toUpperCase()) ?? null);
  const konumlar = satirlar.map(konumu);

  const lotNolari = [...new Set(satirlar.flatMap((s) => (bos(s.lotNo) === null ? [] : [s.lotNo!.trim().toUpperCase()])))];
  const lotlar = new Map((await sorgular.lotlarNoyla(db, lotNolari)).map((l) => [l.lotNo.toUpperCase(), l]));
  const lotKartlari = await malzemeOzetleri(db, [...new Set([...lotlar.values()].map((l) => l.malzemeId))]);
  const ciftler = satirlar.flatMap((_, i) => (nolar[i] != null && konumlar[i] != null ? [{ malzemeId: nolar[i]!, konumId: konumlar[i]!.id }] : []));
  const gozde = await sorgular.gozBakiyeleri(db, ciftler);

  // Dosya içi: aynı lot no'nun ilk kartı ve SKT'si, aynı (malzeme, göz, lot) üçlüsünün ilk satırı.
  const dosyaLotu = new Map<string, { malzemeId: number | null; kod: string | null; sonKullanma: string | null }>();
  const ilkUclu = new Map<string, number>();
  return satirlar.map((s, i) => {
    const id = nolar[i] ?? null;
    const o = id === null ? undefined : ozetler.get(id);
    const k = konumlar[i] ?? null;
    const lotNo = bos(s.lotNo);
    const lotAnahtari = lotNo?.toUpperCase() ?? null;
    const lot = lotAnahtari === null ? null : lotlar.get(lotAnahtari) ?? null;
    const sonKullanma = bos(s.sonKullanma);
    const ilkLot = lotAnahtari === null ? undefined : dosyaLotu.get(lotAnahtari);
    if (lotAnahtari !== null && ilkLot === undefined) dosyaLotu.set(lotAnahtari, { malzemeId: o ? id : null, kod: o?.kod ?? null, sonKullanma });
    const uclu = `${id}:${k?.id}:${lotAnahtari ?? ''}`;
    const onceki = o && k && lotAnahtari !== null ? ilkUclu.get(uclu) ?? null : null;
    if (o && k && lotAnahtari !== null && onceki === null) ilkUclu.set(uclu, s.sira);
    const r = baslangicSatirDenetimi({
      malzemeKodu: bos(s.malzemeKodu), malzeme: o ? { kod: o.kod, ad: o.ad, birim: o.birim, tur: o.tur as MalzemeTuru, aktif: o.onayDurumu === 'aktif' } : null,
      konumKodu: bos(s.konumKodu), konum: k ? { tur: k.tur, aktif: k.aktif } : null, miktar: s.miktar.trim(), lotNo,
      lot: lot ? { malzemeId: lot.malzemeId, malzemeKodu: lotKartlari.get(lot.malzemeId)?.kod ?? null, uretimEmriId: lot.uretimEmriId, sonKullanma: lot.sonKullanma } : null,
      malzemeId: o ? id : null,
      dosyadaBaskaKart: ilkLot !== undefined && ilkLot.malzemeId !== null && o !== undefined && ilkLot.malzemeId !== id ? ilkLot.kod : null,
      partiBilgisiVar: bos(s.tedarikciPartiNo) !== null || bos(s.dokumNo) !== null || bos(s.sertifikaNo) !== null,
      sonKullanma, sktTakipli: id !== null && skt.has(id), gozdeki: id !== null && k !== null ? bindeMetni(gozde.get(`${id}:${k.id}`)) : null, oncekiSatir: onceki,
    });
    // Aynı dosyada aynı yeni lotun iki satırı iki tarih taşıyamaz (lot başına tek tarih).
    if (ilkLot !== undefined && lot === null && ilkLot.malzemeId === id && ilkLot.sonKullanma !== sonKullanma && r.hatalar.every((h) => h.alan !== 'sonKullanma')) {
      r.hatalar.push({ alan: 'sonKullanma', ileti: 'Aynı lot no dosyanın başka satırında başka son kullanma tarihiyle geçiyor; lot başına tek tarih.' });
    }
    const oz = id === null ? undefined : ozellikler.get(id);
    return {
      girdi: s, malzemeId: o ? id : null, konumId: k?.id ?? null, tur: (o?.tur as MalzemeTuru | undefined) ?? null, lotNo, varOlanLot: lot?.id ?? null, sonKullanma,
      denetim: {
        sira: s.sira,
        malzeme: o ? { id: o.id, kod: o.kod, ad: o.ad, birim: o.birim, tur: o.tur as MalzemeTuru, kalite: oz?.kalite ?? null, durum: oz?.durum ?? null, islem: oz?.islem ?? null, olcu: oz?.olcu ?? null } : null,
        konum: k ? { id: k.id, kod: k.kod } : null,
        durum: r.hatalar.length > 0 ? 'hatali' : r.uyarilar.length > 0 ? 'uyarili' : 'eklenecek',
        hatalar: r.hatalar, uyarilar: r.uyarilar,
      },
    };
  });
}

export async function baslangicDenetle(db: Db, g: DenetleKomutu): Promise<BaslangicDenetleCevabi> {
  const satirlar = await coz(db, g.satirlar);
  return { satirlar: satirlar.map((s) => s.denetim), tekrar: g.dosyaOzeti === undefined ? null : await sorgular.tekrarBelgesi(db, g.dosyaOzeti) };
}

async function belgeOzeti(db: Db, id: number): Promise<MalKabulCevabi['belge']> {
  const { kisiId, ...b } = (await sorgular.malKabulBul(db, id))!;
  return { ...b, kisiAd: (await kisiAdlari(db, [kisiId])).get(kisiId) ?? null };
}

export async function baslangicYukle(db: Db, k: Kullanici, g: YukleKomutu): Promise<BaslangicYukleCevabi> {
  // Özet tarayıcıda hesaplanır: dosya sunucuya gelmez (3144 a). Tekrar engeli yanlışlıkla ikinci yüklemeye karşıdır; satırların o dosyadan
  // geldiğini kanıtlamaz (dosya yüklense de kanıtlamazdı).
  const siralar = new Set(g.satirlar.map((s) => s.sira));
  if (siralar.size !== g.satirlar.length) throw dogrulama('Aynı satır numarası iki kez gönderildi.', 'satirlar');
  await sorgular.baslangicKilidi(db);
  const tekrar = await sorgular.tekrarBelgesi(db, g.dosyaOzeti);
  if (tekrar) throw cakisma(`Bu dosya ${tekrar.no} olarak yüklendi.`);
  const satirlar = await coz(db, g.satirlar);
  if (satirlar.some((s) => s.denetim.hatalar.length > 0)) return { belge: null, denetim: { satirlar: satirlar.map((s) => s.denetim), tekrar: null } };

  const no = await belgeNo(db, 'stok.mal-kabul-no', 'stok_mal_kabul');
  const belgeId = await korumali(() => sorgular.baslangicBelgesiAc(db, { no, kisiId: k.id, dosyaOzeti: g.dosyaOzeti, dosyaAdi: g.dosyaAdi, duzeltmeler: g.duzeltmeler }));
  // Aynı yüklemede aynı lot no'nun ilk satırı lotu açar, sonrakiler ona eklenir.
  const acilan = new Map<string, number>();
  for (const [i, s] of satirlar.entries()) {
    const malzemeId = s.malzemeId!;
    const konumId = s.konumId!;
    const miktar = bindenMetin(binde(s.girdi.miktar.trim()));
    let parti: number | null = null;
    if (s.tur !== 'demirbas') {
      const p = { malzemeId, tedarikciPartiNo: bos(s.girdi.tedarikciPartiNo), dokumNo: bos(s.girdi.dokumNo), sertifikaNo: bos(s.girdi.sertifikaNo), kisiId: k.id };
      const anahtar = s.lotNo?.toUpperCase() ?? null;
      parti = s.varOlanLot ?? (anahtar === null ? null : acilan.get(anahtar) ?? null);
      if (parti === null) {
        parti = await korumali(() => (s.lotNo === null ? partiBulVeyaAc(db, { ...p, uretimEmriId: null }) : partiyiNoylaAc(db, p, s.lotNo)));
        if (anahtar !== null) acilan.set(anahtar, parti);
      }
      if (s.sonKullanma !== null && (await sorgular.partiSonKullanma(db, parti)) === null) await sorgular.partiSonKullanmaYaz(db, { partiId: parti, sonKullanma: s.sonKullanma, kisiId: k.id });
    }
    await korumali(async () => {
      const id = await sorgular.hareketYaz(db, hareket({
        tur: 'giris', malzemeId, miktar, kisiId: k.id, partiId: parti, partiSecimi: parti === null ? null : 'giris', hedefKonumId: konumId, girisKaynagi: 'mal_kabul',
        aciklama: baslangicAciklamasi(no, bos(s.girdi.tedarikci), bos(s.girdi.not)),
      }));
      await bakiyeDegistir(db, { malzemeId, konumId, partiId: parti, kaliteDurumu: 'serbest', fark: binde(miktar) });
      await sorgular.malKabulSatiriYaz(db, { malKabulId: belgeId, sira: i + 1, malzemeId, miktar, partiId: parti, konumId, hareketId: id, siparisSatirId: null, fasonCikisHareketId: null });
    });
  }
  // "Diğer" mal kabuldeki gibi serbest malzeme bekleyen emirlere sırayla ayrılır.
  await bekleyenlereDagit(db, k.id, [...new Set(satirlar.map((s) => s.malzemeId!))]);
  return { belge: await belgeOzeti(db, belgeId), denetim: null };
}

async function baslangicBelgesi(db: Db, id: number, kilit = false): Promise<sorgular.MalKabulHam> {
  const b = await sorgular.malKabulBul(db, id, kilit);
  if (!b || b.tur !== 'baslangic' || b.duzeltilenId !== null) throw bulunamadi('Başlangıç stoğu belgesi bulunamadı.');
  return b;
}
const etiketi = (x: sorgular.HareketGorenSatir): string => x.lotNo ?? `${x.konumKod ?? ''} (lotsuz)`;
const hareketGorenAdlari = (l: readonly sorgular.HareketGorenSatir[]): string[] => [...new Set(l.map(etiketi))];

export async function baslangicGeriAlmaDurumu(db: Db, id: number): Promise<BaslangicGeriAlmaDurumu> {
  const b = await baslangicBelgesi(db, id);
  const say = await sorgular.baslangicSayilari(db, id);
  const gorenler = new Map<string, BaslangicGeriAlmaDurumu['hareketGorenler'][number]>();
  for (const x of await sorgular.hareketGorenSatirlar(db, id)) if (!gorenler.has(etiketi(x))) gorenler.set(etiketi(x), { etiket: etiketi(x), tur: x.tur, cikisNedeni: x.cikisNedeni, zaman: x.zaman });
  return { satirSayisi: say.satir, lotSayisi: say.lot, hareketGorenler: [...gorenler.values()], geriAlindi: b.duzeltenId !== null };
}

// Belge yalnız bütün olarak ve yalnız hiçbir lotu sonradan hareket görmemişse geri alınır (KURGU V7). Eksenler önce kilitlenir: denetim
// ile ters hareketler arasında başka komut aynı lota yazamaz. Ters çevirme mal kabul iptalinin yoludur (satırsız düzeltme belgesi).
export async function baslangicGeriAl(db: Db, k: Kullanici, id: number): Promise<MalKabulCevabi> {
  const b = await baslangicBelgesi(db, id, true);
  if (b.duzeltenId !== null) throw cakisma('Bu belge zaten geri alındı.');
  await sorgular.baslangicEksenleriniKilitle(db, id);
  const engel = baslangicGeriAlmaEngeli(hareketGorenAdlari(await sorgular.hareketGorenSatirlar(db, id)));
  if (engel) throw cakisma(engel);
  const hareketIdler: number[] = [];
  for (const s of await sorgular.malKabulSatirlari(db, id)) {
    if (s.hareketId !== null) hareketIdler.push(await tersCevir(db, k.id, s.hareketId, false, `Geri alma: ${b.no}`, true));
  }
  const yeni = await korumali(async () => sorgular.malKabulAc(db, { no: await belgeNo(db, 'stok.mal-kabul-no', 'stok_mal_kabul'), tur: 'baslangic', irsaliyeNo: null, duzeltilenId: id, kisiId: k.id }));
  return { belge: await belgeOzeti(db, yeni), hareketIdler };
}

export async function baslangicAyrintisi(db: Db, id: number): Promise<{ dosyaAdi: string | null; duzeltmeler: BaslangicDuzeltmesi[] } | null> {
  const b = await sorgular.baslangicBilgisi(db, id);
  return b === null ? null : { dosyaAdi: b.dosyaAdi, duzeltmeler: b.duzeltmeler ?? [] };
}
