import type { EmirAkisiCevabi } from '#paylasilan/sozlesme/akis.ts';
import type { EmirAyrintiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { saglamSayisi } from './gorunum.ts';

export type DurakTuru = 'malkabul' | 'adim' | 'kalite' | 'sevk' | 'konum';

export interface Durak {
  anahtar: string;
  tur: DurakTuru;
  ad: string;
  satirlar: string[];
  // Yanlış izlenim vermemek için yalnız kaydı olan durak yanar; kaydı olmayan soluk kalır.
  kayitli: boolean;
}

export const KAYIT_YOK = 'kayıt yok';

export function kisaZaman(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const aralik = (bas: string | null, bit: string | null, surer: boolean): string | null => {
  if (bas === null) return null;
  return `${kisaZaman(bas)} – ${bit === null ? (surer ? 'sürüyor' : '?') : kisaZaman(bit)}`;
};

function malKabulDuragi(akis: EmirAkisiCevabi | null): Durak {
  const partiler = akis?.hammadde ?? [];
  const ilk = [...partiler].sort((a, b) => (a.malKabul ?? '￿').localeCompare(b.malKabul ?? '￿'))[0];
  if (ilk === undefined) return { anahtar: 'malkabul', tur: 'malkabul', ad: 'Mal kabul', satirlar: [KAYIT_YOK], kayitli: false };
  const ek = partiler.length > 1 ? ` +${String(partiler.length - 1)}` : '';
  return {
    anahtar: 'malkabul', tur: 'malkabul', ad: 'Mal kabul', kayitli: true,
    satirlar: [`Parti ${ilk.lotNo ?? `#${String(ilk.partiId)}`}${ek}`, ilk.malKabul === null ? 'kabul saati yok' : kisaZaman(ilk.malKabul)],
  };
}

// Rota adımları akış okumasından gelir (iş emirleri, istasyon, saat, sağlam adet). Okunamazsa emrin kendi adımları,
// adımı da yoksa emrin istasyonu tek durak olur.
function adimDuraklari(ayrinti: EmirAyrintiCevabi, akis: EmirAkisiCevabi | null): Durak[] {
  const { emir } = ayrinti;
  const surer = emir.durum !== 'iptal' && emir.durum !== 'bitti';
  if (akis && akis.adimlar.length > 0) {
    return akis.adimlar.map((a) => {
      const bolumler = (akis.seritler.find((s) => s.anahtar === `adim-${String(a.isEmriId)}`)?.bolumler ?? []).filter((b) => b.tur !== 'bekleme');
      const ilk = bolumler[0];
      const son = bolumler.at(-1);
      const op = `OP${String(a.opNo)}`;
      const ad = a.fason ? 'Fason' : a.istasyon ?? op;
      if (ilk === undefined || son === undefined) return { anahtar: `adim-${String(a.isEmriId)}`, tur: 'adim', ad, satirlar: [op, KAYIT_YOK], kayitli: false };
      return {
        anahtar: `adim-${String(a.isEmriId)}`, tur: 'adim', ad, kayitli: true,
        satirlar: [`${op} · ${String(a.saglamAdet)} adet`, aralik(ilk.baslangic, son.acik ? null : son.bitis, son.acik) ?? KAYIT_YOK],
      };
    });
  }
  const adimlar = ayrinti.adimlar ?? [];
  if (adimlar.length > 0) {
    return adimlar.map((a) => ({
      anahtar: `adim-${String(a.id)}`, tur: 'adim', ad: a.ad, kayitli: a.tamam,
      satirlar: a.tamam && a.tamamlayan && a.tamamlanma ? [a.tamamlayan.ad, kisaZaman(a.tamamlanma)] : [KAYIT_YOK],
    }));
  }
  const saglam = saglamSayisi(emir);
  const zaman = aralik(emir.baslama, emir.bitis, surer);
  return [{
    anahtar: 'adim-emir', tur: 'adim', ad: emir.istasyon?.ad ?? 'Üretim', kayitli: zaman !== null,
    satirlar: zaman === null ? [KAYIT_YOK] : [`${saglam === null ? '?' : String(saglam)} / ${String(emir.adet)} adet`, zaman],
  }];
}

// Depoda emre bağlı kalite kaydı okuyan uç yok; durak uydurulmaz, soluk kalır.
const KALITE_DURAGI: Durak = { anahtar: 'kalite', tur: 'kalite', ad: 'Kalite', satirlar: [KAYIT_YOK], kayitli: false };

function sevkDuragi(akis: EmirAkisiCevabi | null): Durak {
  const hazir = akis?.damgalar.sevkeHazir ?? null;
  const sevk = akis?.damgalar.sevk ?? null;
  const satirlar = [...(hazir === null ? [] : [`Hazır ${kisaZaman(hazir)}`]), ...(sevk === null ? [] : [`Sevk ${kisaZaman(sevk)}`])];
  return { anahtar: 'sevk', tur: 'sevk', ad: 'Sevk', satirlar: satirlar.length > 0 ? satirlar : [KAYIT_YOK], kayitli: satirlar.length > 0 };
}

export function iplikDuraklari(ayrinti: EmirAyrintiCevabi, akis: EmirAkisiCevabi | null): Durak[] {
  return [malKabulDuragi(akis), ...adimDuraklari(ayrinti, akis), KALITE_DURAGI, sevkDuragi(akis)];
}

// ---- Konum akışı (2224-1 b) -------------------------------------------------------------------------------------------------
// Parçayı izle konumdan konuma yolu çizer: önce hammaddenin geçtiği konumlar (sarfa kadar), sonra emrin ürününün konumları (sevke
// kadar). Aynı konumda kalan statü ve kalite değişimi, geri alma ve geri alınan hareket yol sayılmaz. İstasyon konumunda o
// istasyonun rota adımları (OP no ve sağlam adet) yazılır. Konum hareketi yoksa boş döner; ekran adım ipliğine düşer.
type KonumHareketi = NonNullable<EmirAkisiCevabi['konumHareketleri']>[number];
type KonumUcu = NonNullable<KonumHareketi['kaynak']>;
interface Ziyaret { konum: KonumUcu | null; gelis: string | null; cikis: string | null; sevk: boolean }

export function sureKisa(ms: number): string {
  const dk = Math.max(0, Math.floor(ms / 60_000));
  if (dk >= 1440) return `${String(Math.floor(dk / 1440))} gün`;
  if (dk >= 60) return `${String(Math.floor(dk / 60))} sa`;
  return `${String(dk)} dk`;
}

function ziyaretler(hareketler: readonly KonumHareketi[]): Ziyaret[] {
  const z: Ziyaret[] = [];
  for (const h of hareketler) {
    const son = z.at(-1);
    if (h.kaynak && son?.konum?.id !== h.kaynak.id) z.push({ konum: h.kaynak, gelis: null, cikis: null, sevk: false });
    const once = z.at(-1);
    if (h.hedef) {
      if (once?.konum?.id === h.hedef.id) continue;
      if (once) once.cikis = h.zaman;
      z.push({ konum: h.hedef, gelis: h.zaman, cikis: null, sevk: false });
    } else if (once) {
      once.cikis = h.zaman;
      if (h.cikisNedeni === 'sevk') z.push({ konum: null, gelis: h.zaman, cikis: null, sevk: true });
    }
  }
  return z;
}

export function konumDuraklari(ayrinti: EmirAyrintiCevabi, akis: EmirAkisiCevabi | null): Durak[] {
  const tum = akis?.konumHareketleri ?? [];
  const geriAlinan = new Set(tum.flatMap((h) => (h.geriAlinanId === null ? [] : [h.geriAlinanId])));
  const gecerli = tum.filter((h) => h.tur !== 'geri_alma' && !geriAlinan.has(h.id) && !(h.kaynak && h.hedef && h.kaynak.id === h.hedef.id));
  if (gecerli.length === 0) return [];
  const urun = ayrinti.emir.malzemeNo ?? null;
  const yol = urun === null ? ziyaretler(gecerli)
    : [...ziyaretler(gecerli.filter((h) => h.malzemeId !== urun)), ...ziyaretler(gecerli.filter((h) => h.malzemeId === urun))];
  const simdi = Date.parse(akis?.simdi ?? new Date().toISOString());
  return yol.map((v, i): Durak => {
    if (v.sevk || v.konum === null) {
      return { anahtar: `konum-${String(i)}`, tur: 'sevk', ad: 'Sevk', kayitli: true, satirlar: v.gelis === null ? [] : [kisaZaman(v.gelis)] };
    }
    const k = v.konum;
    const adimlar = k.istasyon === null ? [] : (akis?.adimlar ?? []).filter((a) => a.istasyon === k.istasyon);
    const fason = k.tur === 'fason' || k.tur === 'yolda' ? (akis?.adimlar ?? []).filter((a) => a.fason) : [];
    const op = [...adimlar, ...fason].map((a) => `OP${String(a.opNo)} · ${String(a.saglamAdet)} adet`);
    const sure = v.gelis === null ? null
      : v.cikis !== null ? `${sureKisa(Date.parse(v.cikis) - Date.parse(v.gelis))} kaldı`
        : `burada ${sureKisa(simdi - Date.parse(v.gelis))}`;
    return {
      anahtar: `konum-${String(i)}`, tur: 'konum', ad: k.istasyon ?? k.ad ?? k.kod, kayitli: true,
      satirlar: [
        ...(op.length > 0 ? [op.join(', ')] : k.istasyon !== null || k.ad !== null ? [k.kod] : []),
        ...(v.gelis === null ? [] : [kisaZaman(v.gelis)]),
        ...(sure === null ? [] : [sure]),
      ],
    };
  });
}
