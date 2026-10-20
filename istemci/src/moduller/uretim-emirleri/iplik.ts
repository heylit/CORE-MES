import type { EmirAkisiCevabi } from '#paylasilan/sozlesme/akis.ts';
import type { EmirAyrintiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { saglamSayisi } from './gorunum.ts';

export type DurakTuru = 'malkabul' | 'adim' | 'kalite' | 'sevk';

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
