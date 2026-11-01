import type { Db, Veritabani } from '#cekirdek/db.ts';
import type { IkiliCevap } from '#cekirdek/uc.ts';
import type { Gunluk } from '#cekirdek/gunluk.ts';
import { bulunamadi, eskiSurum } from '#cekirdek/hata.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import type {
  GeometriAnalizCevabi, GeometriDosyaTuru, GeometriDurumu, GeometriHamCevabi, GeometriModelSatiri,
} from '#paylasilan/sozlesme/geometri.ts';
import { alinanRevizyonDosyasi, kayitlaraBagliYayindakiBelgeler } from '../cizimler/disari.ts';
import { malzemeOzetleri } from '../malzemeler/disari.ts';
import {
  bicimDenetimi, DOSYA_EN_BUYUK_BAYT, enAzHam, hataMetniKisalt, hataSonrasiDurum, ILETILER, MOTOR, TUR_BASINA_EN_COK_IS,
} from './kurallar.ts';
import * as sorgular from './sorgular.ts';
import type { GeometriSureci } from './surec.ts';

const DOSYA_TURLERI: readonly GeometriDosyaTuru[] = ['step', 'iges'];
const geometriTuruMu = (t: string): t is GeometriDosyaTuru => (DOSYA_TURLERI as readonly string[]).includes(t);

interface Model {
  malzemeNo: number;
  belgeId: number;
  belgeAdi: string;
  revizyonId: number;
  harf: string;
  ozet: string;
  dosyaTuru: GeometriDosyaTuru;
}

// Malzeme kartına bağlı, yayındaki STEP/IGES modeller. Aynı belge iki karta bağlıysa iki satırdır (iş ve analiz revizyon başına tektir).
async function modeller(db: Db): Promise<Model[]> {
  const sonuc: Model[] = [];
  for (const [malzemeNo, belgeler] of await kayitlaraBagliYayindakiBelgeler(db, 'malzemeler', DOSYA_TURLERI)) {
    for (const b of belgeler) {
      if (!geometriTuruMu(b.dosyaTuru)) continue;
      sonuc.push({ malzemeNo, belgeId: b.id, belgeAdi: b.ad, revizyonId: b.revizyonId, harf: b.harf, ozet: b.ozet, dosyaTuru: b.dosyaTuru });
    }
  }
  return sonuc;
}

async function model(db: Db, revizyonId: number): Promise<Model> {
  const m = (await modeller(db)).find((x) => x.revizyonId === revizyonId);
  if (m === undefined) throw bulunamadi(ILETILER.modelYok);
  return m;
}

const durumu = (is: sorgular.IsSatiri | undefined | null): GeometriDurumu => is?.durum ?? 'yok';
const kucuk = (s: string): string => s.toLocaleLowerCase('tr-TR');

export async function modelListesi(
  db: Db, s: { sayfa: number; sayfaBoyu?: number | undefined; ara?: string | undefined; durum?: GeometriDurumu | undefined },
): Promise<SayfaliListe<GeometriModelSatiri>> {
  const liste = await modeller(db);
  const malzemeler = await malzemeOzetleri(db, liste.map((m) => m.malzemeNo));
  const isler = new Map((await sorgular.isler(db, [...new Set(liste.map((m) => m.revizyonId))])).map((i) => [i.revizyonId, i]));
  const ara = s.ara ? kucuk(s.ara) : null;
  const satirlar: GeometriModelSatiri[] = [];
  for (const m of liste) {
    const mz = malzemeler.get(m.malzemeNo);
    if (mz === undefined) continue;
    const is = isler.get(m.revizyonId);
    const satir: GeometriModelSatiri = {
      malzemeNo: m.malzemeNo, malzemeKodu: mz.kod, malzemeAdi: mz.ad, belgeId: m.belgeId, belgeAdi: m.belgeAdi, revizyonId: m.revizyonId,
      harf: m.harf, dosyaTuru: m.dosyaTuru, durum: durumu(is), hataMetni: is?.hataMetni ?? null,
    };
    if (s.durum !== undefined && satir.durum !== s.durum) continue;
    if (ara !== null && ![satir.malzemeKodu, satir.malzemeAdi ?? '', satir.belgeAdi].some((x) => kucuk(x).includes(ara))) continue;
    satirlar.push(satir);
  }
  satirlar.sort((a, b) => a.malzemeKodu.localeCompare(b.malzemeKodu, 'tr') || a.revizyonId - b.revizyonId);
  return sayfaliListe(s, { say: () => Promise.resolve(satirlar.length), satirlar: (d) => Promise.resolve(satirlar.slice(d.atla, d.atla + d.sinir)) });
}

async function analizCevabi(db: Db, m: Model): Promise<GeometriAnalizCevabi> {
  const is = await sorgular.is(db, m.revizyonId);
  const a = await sorgular.analiz(db, m.revizyonId);
  return {
    revizyonId: m.revizyonId, belgeId: m.belgeId, dosyaTuru: m.dosyaTuru, durum: durumu(is),
    is: is === null ? null : {
      durum: is.durum, denemeSayisi: is.denemeSayisi, hataMetni: is.hataMetni, olusturma: is.olusturma, baslama: is.baslama, bitis: is.bitis, surum: is.surum,
    },
    analiz: a === null || a.ozet !== m.ozet ? null : {
      motor: a.motor, kutu: { x: a.kutuX, y: a.kutuY, z: a.kutuZ },
      obb: { a: a.obbA, b: a.obbB, c: a.obbC, cap: a.capMm, yon: [0, 1, 2].map((i) => a.obbYon.slice(i * 3, i * 3 + 3)) },
      hacimMm3: a.hacimMm3, alanMm2: a.alanMm2, govdeSayisi: a.govdeSayisi, kapali: a.kapali, ucgenSayisi: a.ucgenSayisi,
      hesapSuresiMs: a.hesapSuresiMs, hesapZamani: a.hesapZamani,
    },
  };
}

export async function analizOku(db: Db, revizyonId: number): Promise<GeometriAnalizCevabi> {
  return analizCevabi(db, await model(db, revizyonId));
}

export async function hamOnerisi(db: Db, revizyonId: number, payMm: number): Promise<GeometriHamCevabi> {
  const c = await analizOku(db, revizyonId);
  if (c.analiz === null) return { revizyonId, payMm, enAz: null, stokOlcusu: null, neden: 'analiz-yok' };
  return { revizyonId, payMm, enAz: enAzHam(c.analiz.obb, payMm), stokOlcusu: null, neden: 'stok-listesi-yok' };
}

// İş yoksa (tarama yakalamadı) açılır; varsa sürüm koşuluyla yeniden kuyruğa girer. Süren iş de yeniden kuyruğa alınabilir:
// süreç sonucu dönünce 'bitti' yazar, yeni tur aynı içeriği yeniden hesaplar (zarar yok).
export async function yenidenHesapla(db: Db, revizyonId: number, surum: number | null): Promise<GeometriAnalizCevabi> {
  const m = await model(db, revizyonId);
  const var_ = await sorgular.is(db, revizyonId);
  if (var_ === null) {
    if (surum !== null) throw eskiSurum();
    const eklenen = await sorgular.kuyrugaEkle(db, [m]);
    if (eklenen === 0) throw eskiSurum();
  } else {
    if (surum === null) throw eskiSurum();
    if ((await sorgular.yenidenKuyruga(db, revizyonId, surum)) === null) throw eskiSurum();
  }
  return analizCevabi(db, m);
}

// Görüntüleyicinin dosyası: listede gösterilen revizyon (geometri.oku); Çizim Merkezi okuma yetkisi ayrıca istenmez.
export async function modelDosyasi(db: Db, revizyonId: number): Promise<IkiliCevap> {
  const m = await model(db, revizyonId);
  const d = await alinanRevizyonDosyasi(db, m.belgeId, m.ozet);
  if (d === null) throw bulunamadi(ILETILER.dosyaYok);
  return d.dosya;
}

export async function kuyrugaTara(db: Db): Promise<number> {
  return sorgular.kuyrugaEkle(db, await modeller(db));
}

async function dosyaOku(db: Db, is: sorgular.IsSatiri): Promise<Uint8Array | string> {
  const d = await alinanRevizyonDosyasi(db, is.belgeId, is.ozet);
  if (d === null) return ILETILER.dosyaYok;
  if (d.dosya.boyut > DOSYA_EN_BUYUK_BAYT) return ILETILER.dosyaBuyuk;
  const parcalar: Buffer[] = [];
  let toplam = 0;
  for await (const p of d.dosya.akis(db)) {
    toplam += p.length;
    if (toplam > DOSYA_EN_BUYUK_BAYT) return ILETILER.dosyaBuyuk;
    parcalar.push(p);
  }
  const veri = new Uint8Array(Buffer.concat(parcalar));
  return bicimDenetimi(is.dosyaTuru, veri) ?? veri;
}

// Zamanlayıcı turu: tara, öksüzleri kapat, sırayla en çok TUR_BASINA_EN_COK_IS işi hesaplat. Dosya kısa transaction'da okunur,
// hesap transaction dışında beklenir (bağlantı tutulmaz), sonuç ayrı transaction'da yazılır.
export async function geometriTuru(vt: Veritabani, surec: GeometriSureci, gunluk: Gunluk): Promise<number> {
  await vt.tx(async (db) => {
    await kuyrugaTara(db);
    for (const o of await sorgular.oksuzIsler(db)) {
      await sorgular.isBitir(db, o.id, hataSonrasiDurum(o.denemeSayisi, false), ILETILER.surecDustu);
    }
  });
  const alinanlar: number[] = [];
  while (alinanlar.length < TUR_BASINA_EN_COK_IS) {
    const alinan = await vt.tx(async (db) => {
      const is = await sorgular.siradakiIsiAl(db, alinanlar);
      if (is === null) return null;
      alinanlar.push(is.id);
      const veri = await dosyaOku(db, is);
      if (typeof veri === 'string') {
        await sorgular.isBitir(db, is.id, 'hata', veri);
        return { is, veri: null };
      }
      return { is, veri };
    });
    if (alinan === null) break;
    if (alinan.veri === null) continue;
    const { is, veri } = alinan;
    const yanit = await surec.hesapla(is.dosyaTuru, veri);
    await vt.tx(async (db) => {
      if (yanit.tamam) {
        await sorgular.analizYaz(db, { revizyonId: is.revizyonId, belgeId: is.belgeId, ozet: is.ozet, motor: MOTOR, olcum: yanit.olcum, sureMs: yanit.sureMs });
        await sorgular.isBitir(db, is.id, 'bitti', null);
      } else {
        if (!yanit.kalici) gunluk.uyar(`Geometri hesabı yarıda kaldı (revizyon ${String(is.revizyonId)}): ${yanit.hata}`);
        await sorgular.isBitir(db, is.id, hataSonrasiDurum(is.denemeSayisi, yanit.kalici), hataMetniKisalt(yanit.hata));
      }
    });
  }
  return alinanlar.length;
}
