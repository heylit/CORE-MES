import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, gecersiz } from '#cekirdek/hata.ts';
import type { AgacCevabi, PatlatmaCevabi, PatlatmaOnizlemeCevabi, UrunOzeti } from '#paylasilan/sozlesme/rota.ts';
import { AZAMI_AGAC_DERINLIGI } from '#paylasilan/sozlesme/rota.ts';
import { cokKatmanaCevir, dugumDalAdi, emirFireCarpanlari, emirOpNumaralari, agaciAc, ondalikMetin } from '../kurallar.ts';
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
      bagimlilik: a.bagimlilik,
      dal: a.dal,
      birlesen: a.birlesen,
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
// 2557: adım adedi ve malzeme, açılacak emrin adımları üzerinde emir kuralıyla (uretim-emirleri malzemeIhtiyaci) hesaplanır: adım miktarı
// sipariş x düğümün kök başına adedi x fire çarpanı, bileşen bunun miktar x (1 + bileşen firesi) katı. Adet dal çarpanıyla büyür, malzeme
// büyümez (1333 a). Emir açılamıyorsa (engel) emir adımı yoktur; sayılar null kalır, uydurulmaz.
export async function patlatmaOnizlemesi(db: Db, revizyonId: number, miktar = 1): Promise<PatlatmaOnizlemeCevabi> {
  const kok = await revizyonGetir(db, revizyonId);
  if (kok === null) throw bulunamadi('Rota revizyonu bulunamadı.');
  const kokRevizyon = { id: kok.id, harf: kok.harf };
  const p = await patlatmaKur(db, kok.id, kok.malzemeId);
  if ('ileti' in p) return { kokRevizyon, miktar: ondalikMetin(miktar), ileti: p.ileti, engel: null, dugumler: [], hammaddeToplami: [] };
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
  const emirAdimi = new Map('ileti' in c ? [] : c.girdiler.map((g) => [`${g.dugum.ad}|${g.dugum.kaynakOpNo}`, g] as const));
  const fireCarpani = emirFireCarpanlari([...emirAdimi.values()].map((g) => ({ sira: g.sira, opNo: g.opNo, firePayiYuzde: Number(g.firePayiYuzde), onculler: g.onculler })));
  const ikili = (x: number) => ({ kokBasina: ondalikMetin(x), siparis: ondalikMetin(x * miktar) });
  const malzemeIdleri = [...rotalar.values()].flatMap((r) => r.adimlar.flatMap((a) => [...a.bilesenler, ...a.yanUrunler].map((b) => b.malzemeId)));
  const urunler = await urunOzetleri(db, [...bas.map((d) => d.malzemeId), ...malzemeIdleri]);
  const ozet = (mid: number): UrunOzeti => {
    const u = urunler.get(mid);
    if (u === undefined) throw gecersiz('Adımın malzeme kartı bulunamadı.');
    return u;
  };
  const hammadde = new Map<number, number>();
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
    const altlar = bas.filter((c2) => c2.tuketenDugum === d.dugum);
    for (const [i, x] of satirlar.entries()) {
      const a = rota.adimlar.find((y) => y.opNo === x.kaynakOpNo);
      const g = emirAdimi.get(`${d.dugum}|${x.kaynakOpNo}`);
      const fc = g === undefined ? undefined : fireCarpani.get(g.opNo);
      const fire = a === undefined ? 0 : Number(a.firePayiYuzde);
      const adet = g === undefined || fc === undefined ? null : (g.adetCarpani ?? 1) * fc;
      const malzemeCarpani = fc === undefined ? null : d.birimCarpani * fc;
      const girenler = (a?.bilesenler ?? []).map((b) => {
        const alt = altlar.find((c2) => c2.tuketenOpNo === x.kaynakOpNo && c2.malzemeId === b.malzemeId);
        const toplam = malzemeCarpani === null ? null : malzemeCarpani * Number(b.miktar) * (1 + Number(b.fireYuzde) / 100);
        if (alt === undefined && toplam !== null) hammadde.set(b.malzemeId, (hammadde.get(b.malzemeId) ?? 0) + toplam);
        return {
          malzeme: ozet(b.malzemeId), altDugum: alt?.dugum ?? null, miktar: ondalikMetin(Number(b.miktar)), fireYuzde: ondalikMetin(Number(b.fireYuzde), 2),
          toplam: toplam === null ? null : ikili(toplam),
        };
      });
      const yanUrunler = (a?.yanUrunler ?? []).map((y) => ({
        malzeme: ozet(y.malzemeId), miktar: ondalikMetin(Number(y.miktar)),
        toplam: malzemeCarpani === null ? null : ikili(malzemeCarpani * Number(y.miktar)),
      }));
      adimlar.push({
        kaynakOpNo: x.kaynakOpNo, emirOpNo: numara.get(`${d.dugum}|${x.kaynakOpNo}`)!, ad: a?.ad ?? '', yer: a ? await yer(a) : null,
        hedef: g === undefined ? null : ikili(g.adetCarpani ?? 1), adet: adet === null ? null : ikili(adet), cikanAdet: adet === null ? null : ikili(adet * (1 - fire / 100)),
        cikti: i === satirlar.length - 1 ? 'urun' as const : 'ara-hal' as const, girenler, yanUrunler,
      });
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
  return {
    kokRevizyon, miktar: ondalikMetin(miktar), ileti: null, engel: 'ileti' in c ? c.ileti : null, dugumler,
    hammaddeToplami: [...hammadde].map(([mid, t]) => ({ malzeme: ozet(mid), toplam: ikili(t) })).sort((x, y) => x.malzeme.id - y.malzeme.id),
  };
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
