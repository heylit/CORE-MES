import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, gecersiz } from '#cekirdek/hata.ts';
import type { AgacCevabi, PatlatmaCevabi, PatlatmaOnizlemeCevabi, UrunOzeti } from '#paylasilan/sozlesme/rota.ts';
import { AZAMI_AGAC_DERINLIGI } from '#paylasilan/sozlesme/rota.ts';
import { cokKatmanaCevir, dugumDalAdi, emirOpNumaralari, agaciAc, ondalikMetin } from '../kurallar.ts';
import type { AgacRotasi } from '../kurallar.ts';
import * as s from '../sorgular.ts';
import type { Icerik } from '../sorgular.ts';
import { isEmriGirdileri, kaynakBaglami, kaynakOzetiAl, patlatmaKur, revizyonuAl, sayi, urunOzetiAl, urunOzetleri } from './ortak.ts';
import { type RotaAdimi, type RotaRevizyonu, revizyonGetir } from './okuma.ts';

/* ---------------- ürün ağacı ve döngü ---------------- */

function agacRotasi(revizyonId: number, icerik: Icerik): AgacRotasi {
  return {
    revizyonId,
    adimlar: icerik.adimlar.map((a) => ({
      opNo: a.opNo,
      firePayiYuzde: sayi(a.firePayiYuzde),
      bilesenler: icerik.bilesenler.filter((b) => b.adimId === a.id)
        .map((b) => ({ malzemeId: b.malzemeId, miktar: sayi(b.miktar), fireYuzde: sayi(b.fireYuzde) })),
    })),
  };
}

// Kökün rotası verilen revizyondur; alt mamuller yürürlükteki revizyonlarıyla açılır.
async function agacRotalari(db: Db, kok: number, kokRevizyon: number, kokIcerik: Icerik): Promise<Map<number, AgacRotasi>> {
  const rotalar = new Map<number, AgacRotasi>([[kok, agacRotasi(kokRevizyon, kokIcerik)]]);
  let sinir = [...new Set(kokIcerik.bilesenler.map((b) => b.malzemeId))];
  for (let derinlik = 0; sinir.length > 0 && derinlik < AZAMI_AGAC_DERINLIGI; derinlik += 1) {
    const sonraki: number[] = [];
    for (const urun of sinir) {
      if (rotalar.has(urun)) continue;
      const rid = await s.yururluktekiRevizyonId(db, urun);
      if (rid === null) continue;
      const icerik = await s.icerikOku(db, rid);
      rotalar.set(urun, agacRotasi(rid, icerik));
      sonraki.push(...icerik.bilesenler.map((b) => b.malzemeId));
    }
    sinir = [...new Set(sonraki)];
  }
  return rotalar;
}

// 1476-E: patlatma başına düğümün rota revizyonu ve malzemesi (donmuş görüntü, 1481 a). Çok katmanlı emrin iş emri rota adımına
// (revizyon, kaynak_op_no) ile bağlanır; emrin kaynak revizyonu yalnız kökündür. Bulunmayan patlatma haritada yoktur; yetki denetlemez.
export interface PatlatmaDugumu { revizyonId: number; malzemeId: number }
export async function patlatmaDugumleri(db: Db, patlatmaIdleri: readonly number[]): Promise<Map<number, Map<string, PatlatmaDugumu>>> {
  const sonuc = new Map<number, Map<string, PatlatmaDugumu>>();
  for (const id of new Set(patlatmaIdleri)) {
    const satirlar = await s.patlatmaSatirlariOku(db, id);
    if (satirlar.length === 0) continue;
    sonuc.set(id, new Map(satirlar.map((x) => [x.dugum, { revizyonId: x.revizyonId, malzemeId: x.malzemeId }])));
  }
  return sonuc;
}

// Patlatmada malzemenin rota revizyonu (1476-C stok): patlatma malzeme başına tek revizyon kullanır, malzeme birden çok düğümde olsa da
// revizyonu aynıdır. Patlatmada olmayan malzeme ya da patlatma null döner; yetki denetlemez.
export async function patlatmaRevizyonu(db: Db, patlatmaId: number, malzemeId: number): Promise<number | null> {
  const satir = (await s.patlatmaSatirlariOku(db, patlatmaId)).find((x) => x.malzemeId === malzemeId);
  return satir?.revizyonId ?? null;
}

export async function patlatmaGetir(db: Db, id: number): Promise<PatlatmaCevabi> {
  const b = await s.patlatmaBasligiOku(db, id);
  if (b === null) throw bulunamadi('Patlatma bulunamadı.');
  return { id: b.id, kokMalzemeId: b.kokMalzemeId, kokRevizyonId: b.kokRevizyonId, zaman: b.zaman, satirlar: await s.patlatmaSatirlariOku(db, id) };
}

// Patlamış rota önizlemesi (1476-F): emir açılışıyla aynı kural ve numara, kayıt yazmadan. Kök verilen revizyondur, alt ürünler
// yürürlükteki revizyonlarıyla açılır (emir yalnız yürürlükteki kök revizyondan açılır; ekran onu sorar).
export async function patlatmaOnizlemesi(db: Db, revizyonId: number): Promise<PatlatmaOnizlemeCevabi> {
  const kok = await revizyonGetir(db, revizyonId);
  if (kok === null) throw bulunamadi('Rota revizyonu bulunamadı.');
  const kokRevizyon = { id: kok.id, harf: kok.harf };
  const p = await patlatmaKur(db, kok.id, kok.malzemeId);
  if ('ileti' in p) return { kokRevizyon, ileti: p.ileti, engel: null, dugumler: [] };
  const bas = [...new Map(p.satirlar.map((x) => [x.dugum, x])).values()];
  const rotalar = new Map<string, RotaRevizyonu>();
  const girdiler = new Map<string, Awaited<ReturnType<typeof isEmriGirdileri>>>();
  for (const d of bas) {
    const rota = d.dugum === '0' ? kok : await revizyonGetir(db, d.revizyonId);
    if (rota === null) throw gecersiz('Alt parçanın rotası bulunamadı.');
    rotalar.set(d.dugum, rota);
    girdiler.set(d.dugum, await isEmriGirdileri(db, d.malzemeId, rota));
  }
  const c = cokKatmanaCevir(p.satirlar, girdiler, []);
  const numara = emirOpNumaralari(p.satirlar);
  const urunler = await urunOzetleri(db, bas.map((d) => d.malzemeId));
  const b = await kaynakBaglami(db);
  const yer = async (a: RotaAdimi): Promise<string | null> => {
    if (a.fason) return (await kaynakOzetiAl(db, b, { tur: 'fason', id: a.fason.firmaId })).ad;
    if (a.kaynak === null) return null;
    const k = await kaynakOzetiAl(db, b, a.kaynak);
    return k.istasyon?.ad ?? k.ad;
  };
  const dugumler: PatlatmaOnizlemeCevabi['dugumler'] = [];
  for (const d of bas) {
    const rota = rotalar.get(d.dugum)!;
    const urun = urunler.get(d.malzemeId);
    if (urun === undefined) throw gecersiz('Alt parçanın malzeme kartı bulunamadı.');
    const satirlar = p.satirlar.filter((x) => x.dugum === d.dugum);
    const adimlar = [];
    for (const x of satirlar) {
      const a = rota.adimlar.find((y) => y.opNo === x.kaynakOpNo);
      adimlar.push({ kaynakOpNo: x.kaynakOpNo, emirOpNo: numara.get(`${d.dugum}|${x.kaynakOpNo}`)!, ad: a?.ad ?? '', yer: a ? await yer(a) : null });
    }
    dugumler.push({
      dugum: d.dugum, dal: dugumDalAdi(d.dugum), katman: d.katman, malzeme: urun, revizyon: { id: rota.id, harf: rota.harf },
      kokBasina: ondalikMetin(d.birimCarpani),
      tuketen: d.tuketenDugum === null || d.tuketenOpNo === null ? null : {
        dugum: d.tuketenDugum, dal: dugumDalAdi(d.tuketenDugum), kaynakOpNo: d.tuketenOpNo, emirOpNo: numara.get(`${d.tuketenDugum}|${d.tuketenOpNo}`)!,
      },
      adimlar,
    });
  }
  return { kokRevizyon, ileti: null, engel: 'ileti' in c ? c.ileti : null, dugumler };
}

export async function agac(db: Db, id: number, miktar: number): Promise<AgacCevabi> {
  const r = revizyonuAl(await s.revizyonOku(db, id));
  const urun = await urunOzetiAl(db, r.malzemeId);
  const rotalar = await agacRotalari(db, r.malzemeId, id, await s.icerikOku(db, id));
  const { dugumler, toplamlar } = agaciAc(r.malzemeId, miktar, rotalar, AZAMI_AGAC_DERINLIGI);
  const ozetler = await urunOzetleri(db, [...dugumler.map((d) => d.malzemeId)]);
  const harfler = new Map<number, string>();
  for (const d of dugumler) {
    if (d.revizyonId !== null && !harfler.has(d.revizyonId)) {
      const rr = await s.revizyonOku(db, d.revizyonId);
      if (rr) harfler.set(rr.id, rr.harf);
    }
  }
  const ozet = (mid: number): UrunOzeti => ozetler.get(mid) ?? { id: mid, stokKodu: null, ad: 'Bilinmeyen kart', tur: '?', stokBirimi: null, onayDurumu: '?' };
  return {
    urun,
    miktar: ondalikMetin(miktar),
    dugumler: dugumler.map((d) => ({
      derinlik: d.derinlik, ust: d.ust, malzeme: ozet(d.malzemeId), opNo: d.opNo, birimMiktar: ondalikMetin(d.birimMiktar),
      fireYuzde: ondalikMetin(d.fireYuzde, 2), toplamMiktar: ondalikMetin(d.toplamMiktar),
      revizyon: d.revizyonId === null ? null : { id: d.revizyonId, harf: harfler.get(d.revizyonId) ?? '?' },
    })),
    toplamlar: [...toplamlar].map(([mid, m]) => ({ malzeme: ozet(mid), miktar: ondalikMetin(m) })),
  };
}
