import type { AcikSiparisSatirlariCevabi, MalzemelerCevabi } from '#paylasilan/sozlesme/stok.ts';
import { api } from '../../../../ortak/veri/api.ts';
import type { Malzeme, PlanVerisi } from '../tipler.ts';
import { belgedekiAlimlar, saatOku, tedarikciGecikmeleri, type AcikAlim } from './kurallar.ts';

// Stok ve açık satın alma sahiplerinin uçlarından okunur (224 a): bakiye stoktan (`/stok/malzemeler`, kullanılabilir = serbest), açık
// sipariş satırları stoktan (`/stok/acik-siparis-satirlari`, satın almanın siparişi ve kalan miktarı). İkisinden biri okunamazsa (yetki
// yok ya da uç hata verdi) plan belgesinin kendi kopyası kullanılır ve ekran bunu söyler; sıfır uydurulmaz.
// Plan belgesinde malzemenin kodu katalog malzeme numarasıdır (sunucu kurallar.ts malzemeCevir `id`, motor/girdi.betik `kod: it.id`); stok
// kodu değildir. Bakiye ve sipariş satırı bu yüzden malzeme numarasıyla eşlenir.

const SAYFA_BOYU = 200;
// Kart sayısının üst sınırı (200 x 50): sınırsız döngü olmasın.
const AZAMI_SAYFA = 50;

export interface StokKaynagi {
  // Malzeme numarası (plan belgesindeki kod) -> kullanılabilir miktar. Kartı olan ama stoğu olmayan malzeme 0'dır (kartlar kapsamı).
  bakiye: Map<string, number>;
  satirlar: AcikSiparisSatirlariCevabi['satirlar'];
}

export interface Okuyucu { get: <T>(yol: string) => Promise<T> }

export async function stokOku(o: Okuyucu = api): Promise<StokKaynagi | null> {
  try {
    const bakiye = new Map<string, number>();
    for (let sayfa = 1; sayfa <= AZAMI_SAYFA; sayfa++) {
      const c = await o.get<MalzemelerCevabi>(`/stok/malzemeler?kapsam=kartlar&sayfa=${sayfa}&sayfaBoyu=${SAYFA_BOYU}`);
      for (const s of c.satirlar) {
        const kod = String(s.malzemeId);
        bakiye.set(kod, (bakiye.get(kod) ?? 0) + Number(s.serbest));
      }
      if (c.satirlar.length < c.sayfaBoyu || (c.toplam !== null && sayfa * c.sayfaBoyu >= c.toplam)) break;
    }
    const acik = await o.get<AcikSiparisSatirlariCevabi>('/stok/acik-siparis-satirlari');
    return { bakiye, satirlar: acik.satirlar };
  } catch {
    return null;
  }
}

export interface PlanKaynagi {
  malzemeler: Malzeme[];
  alimlar: AcikAlim[];
  // 'sahip': stok ve sipariş sahibinden; 'belge': planın kendi kopyası (sahibi okunamadı).
  nereden: 'sahip' | 'belge';
  // Planın malzemesi olup stokta kartı bulunamayan kodlar (stoğu bilinmiyor; 0 sayıldı).
  kartsiz: string[];
  // Malzeme kartına ya da plandaki bir koda bağlanamayan açık sipariş satırı sayısı.
  baglanamayan: number;
}

export function kaynakKur(D: PlanVerisi, taban: number, stok: StokKaynagi | null): PlanKaynagi {
  const malzemeler = D.malzemeler ?? [];
  if (stok === null) return { malzemeler: [...malzemeler], alimlar: belgedekiAlimlar(D, taban), nereden: 'belge', kartsiz: [], baglanamayan: 0 };
  const planda = new Set(malzemeler.map((m) => m.kod));
  const gecikme = tedarikciGecikmeleri(D);
  const alimlar: AcikAlim[] = [];
  let baglanamayan = 0;
  for (const s of stok.satirlar) {
    const kod = s.malzemeId === null ? undefined : String(s.malzemeId);
    const miktar = Number(s.kalanMiktar);
    if (!(miktar > 0)) continue;
    if (kod === undefined || !planda.has(kod)) { baglanamayan++; continue; }
    // Sipariş tarihi ve referans termin stokta yoktur: termini olmayanın tahmini gelişi bugünden sayılır (durum.betik tmUygula).
    alimlar.push({ kod, miktar, soz: saatOku(taban, s.beklenenTeslim), tedarikci: s.tedarikciAdi, gecikme: gecikme(s.tedarikciAdi), no: s.siparisNo, verildi: null, ref: null });
  }
  return {
    malzemeler: malzemeler.map((m) => ({ ...m, stok: stok.bakiye.get(m.kod) ?? 0 })),
    alimlar, nereden: 'sahip', kartsiz: malzemeler.filter((m) => !stok.bakiye.has(m.kod)).map((m) => m.kod), baglanamayan,
  };
}
