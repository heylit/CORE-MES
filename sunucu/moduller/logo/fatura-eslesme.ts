import type { Db } from '#cekirdek/db.ts';
import type { FaturaEslesmeCevabi, FATURA_ESLESME_DURUMLARI } from '#paylasilan/sozlesme/logo.ts';
import { FATURA_ESLESME_DURUMLARI as DURUMLAR } from '#paylasilan/sozlesme/logo.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { logoEslesmeBelgeleri } from '../finans/disari.ts';
import { firmaLogoKodlari } from '../musteri-tedarikci/disari.ts';
import { faturaCariBaslangicGunu } from './fatura-cari-sozlesmesi.ts';
import { faturaEslesmeleri } from './kurallar.ts';
import * as s from './sorgular.ts';

export interface FaturaEslesmeIstegi {
  sayfa: number;
  sayfaBoyu?: number | undefined;
  gun: number;
  durum?: (typeof FATURA_ESLESME_DURUMLARI)[number] | undefined;
}

// 3675 D2: Logo fatura aynası ile finans faturalarının karşılaştırması. Yalnız okunur: ne Logo'ya ne de finans belgesine bir şey yazılır; eşleşme
// kaydedilmez, her istekte bellekte hesaplanır. Pencere, aynanın okuduğu başlangıçtan (son 12 ayın başı) önceye inmez: ayna dışındaki faturalar
// "Logo'da yok" diye yalancı fark vermesin. Yetki çağıranın ucundadır (finans rakamı: finans.oku).
export async function faturaEslesmeListesi(db: Db, simdi: Date, q: FaturaEslesmeIstegi): Promise<FaturaEslesmeCevabi> {
  const aynaBaslangici = faturaCariBaslangicGunu(simdi);
  const istenen = new Date(simdi.getTime() - q.gun * 86_400_000).toISOString().slice(0, 10);
  const baslangic = istenen > aynaBaslangici ? istenen : aynaBaslangici;
  const logo = await s.faturaAynaSatirlari(db, baslangic);
  const belgeler = await logoEslesmeBelgeleri(db, baslangic);
  const firmalar = await firmaLogoKodlari(db, belgeler.flatMap((b) => (b.firmaId === null ? [] : [b.firmaId])));
  const finans = belgeler.map((b) => ({
    belgeId: b.id, yon: b.yon, tur: b.tur, belgeNo: b.belgeNo, tarih: b.belgeTarihi, cariKodu: b.firmaId === null ? null : firmalar.get(b.firmaId)?.logoKodu ?? null,
    paraBirimi: b.paraBirimi, tutar: b.tutar, kdvTutari: b.kdvTutari, durum: b.durum,
  }));
  const baglanamayan = finans.filter((f) => f.cariKodu === null && f.durum !== 'iptal').length;
  const adlar = new Map(belgeler.flatMap((b) => {
    const k = b.firmaId === null ? undefined : firmalar.get(b.firmaId);
    return k?.logoKodu ? [[k.logoKodu.toLocaleUpperCase('tr'), k.ad] as const] : [];
  }));
  const hepsi = faturaEslesmeleri(logo, finans).map((x) => ({
    ...x, firmaAdi: x.cariKodu === null ? null : adlar.get(x.cariKodu.toLocaleUpperCase('tr')) ?? null,
  }));
  const secilen = q.durum === undefined ? hepsi : hepsi.filter((x) => x.durum === q.durum);
  const boy = Math.min(q.sayfaBoyu ?? 50, 200);
  const sayfa = Math.max(1, Math.min(q.sayfa, Math.ceil(secilen.length / boy) || 1));
  const acik = (await sistemAyariOku(db, 'logo.baglanti')) === true && (await sistemAyariOku(db, 'logo.fatura-listesi-okumasi')) === true;
  return {
    satirlar: secilen.slice((sayfa - 1) * boy, sayfa * boy),
    toplam: secilen.length,
    sayfa,
    sayfaBoyu: boy,
    durumlar: DURUMLAR.map((d) => ({ durum: d, sayi: hepsi.filter((x) => x.durum === d).length })),
    baglanamayan,
    baslangic,
    okuma: { acik, sonOkuma: (await s.faturaCariOzeti(db)).son },
  };
}
