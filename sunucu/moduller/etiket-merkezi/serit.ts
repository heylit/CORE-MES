import type { Sablon, SablonOgesi, SablonTuru } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { SERIT_KOD_BASLIGI, seritEni, seritKodBasligiVar, seritKodKenari, seritKodYazisi } from './kod-yaz.ts';
import { metinGenisligi } from './kurallar.ts';

// Kart 3562 (A, kod şeridi): her etiket soldan sağa şerit ve gövdedir. Şerit: üst ortada DataMatrix (kod altına kimlik, kurallar.ts qrVeKodu),
// altında tür adı ve basım tarihi, tabanda piktogram; 0,3 mm ayırıcı çizgi; sağda gövde. Gövde sıralı bloklardan kurulur; yüksekliğe
// sığmayan satır DÜŞER ve şablonun `uyari`sında söylenir, yazı küçültülmez. Saf kural: veri ve SQL yok.

const yuvarla = (v: number): number => Math.round(v * 100) / 100;
type Ek = { ters?: boolean; kosul?: string };
const metin = (x: number, y: number, genislik: number, yukseklik: number, yaziMm: number, alan: string, kalin = false, ek: Ek = {}): SablonOgesi => ({
  tur: 'metin', x: yuvarla(x), y: yuvarla(y), genislik: yuvarla(genislik), yukseklik: yuvarla(yukseklik), yaziMm, kalin, alan, ...(ek.ters ? { ters: true } : {}), ...(ek.kosul === undefined ? {} : { kosul: ek.kosul }),
});
const kutu = (x: number, y: number, genislik: number, yukseklik: number, kalinlik = 0.3, kosul?: string): SablonOgesi => ({
  tur: 'kutu', x: yuvarla(x), y: yuvarla(y), genislik: yuvarla(genislik), yukseklik: yuvarla(yukseklik), kalinlik: yuvarla(kalinlik), ...(kosul === undefined ? {} : { kosul }),
});
const simge = (x: number, y: number, boyut: number, alan: string, kosul?: string): SablonOgesi => ({
  tur: 'simge', x: yuvarla(x), y: yuvarla(y), boyut: yuvarla(boyut), alan, ...(kosul === undefined ? {} : { kosul }),
});
// Dolu siyah bant: kalınlığı yüksekliğine eşit kutu (yazıcı dili bunu dolu kutu basar, içindeki ters yazı beyaz çıkar).
const bandKutusu = (x: number, y: number, genislik: number, yukseklik: number, kosul?: string): SablonOgesi => kutu(x, y, genislik, yukseklik, yukseklik, kosul);

export const BILGI_YAZI = 1.8;
const SERIT_YAZI = 2;
const SERIT_ADIM = 2.5;

export interface Yer { bx: number; bw: number; kucuk: boolean; en: (y: number) => number }
export interface Blok { ad: string; h: number; dusebilir: boolean; yap: (y: number, yer: Yer) => SablonOgesi[] }

// Tür adı gövde başlığıdır; ters yazıda (Kalite durumu, Hatalı parça: Z1) siyah zemin üstüne beyaz yazı.
export interface YanAlan { alan: string; genislik: number | 'kalan'; yazi: number; kalin?: boolean }
export function baslik(ad: string, ters = false, kucuk = false, yan: readonly YanAlan[] = []): Blok {
  const f = kucuk ? 2.4 : 3.2;
  return {
    ad: 'başlık', dusebilir: false, h: yuvarla(f * 1.35 + 0.2 + (ters ? 1.2 : 0)),
    yap: (y, yer) => {
      const w = Math.min(metinGenisligi(ad, f, true) + 2.4, yer.en(y));
      const ogeler = ters
        ? [bandKutusu(yer.bx - 0.4, y - 0.4, w, f * 1.45 + 0.2), metin(yer.bx + 0.8, y, w - 1.2, f * 1.25, f, `=${ad}`, true, { ters: true })]
        : [metin(yer.bx, y, w, f * 1.25, f, `=${ad}`, true)];
      // Başlığın yanındaki alanlar (lot etiketinde kart ve tür, malzeme etiketinde tür ve miktar) aynı satırda soldan sağa dizilir.
      let x = yer.bx + w + 1.5;
      for (const k of yan) {
        const gen = k.genislik === 'kalan' ? yer.bx + yer.en(y) - x : k.genislik;
        ogeler.push(metin(x, y + (f - k.yazi) * 0.4, gen, k.yazi * 1.25, k.yazi, k.alan, k.kalin === true));
        x += gen + 1;
      }
      return ogeler;
    },
  };
}
// Blok üreticileri. Yükseklikler mm; satır yüksekliği yazının 1,25 katıdır.
export function ana(alan: string, enBuyuk: number, ek: { baslik?: string; kosul?: string; satir?: 1 | 2 } = {}): Blok {
  const ust = ek.baslik === undefined ? 0 : 2.3;
  const kutuH = enBuyuk * 1.25 * (ek.satir ?? 1);
  return {
    ad: alan, dusebilir: false, h: yuvarla(ust + kutuH + 0.5),
    yap: (y, yer) => [
      ...(ek.baslik === undefined ? [] : [metin(yer.bx, y, yer.en(y), 2.2, BILGI_YAZI, `=${ek.baslik}`, false, ek.kosul === undefined ? {} : { kosul: ek.kosul })]),
      metin(yer.bx, y + ust, yer.en(y + ust), kutuH, enBuyuk, alan, true),
    ],
  };
}
export function altSatir(alan: string, yazi = 2.6): Blok {
  return { ad: alan, dusebilir: false, h: yuvarla(yazi * 1.3 + 0.6), yap: (y, yer) => [metin(yer.bx, y, yer.en(y), yazi * 1.25, yazi, alan, false)] };
}
// Başlıklı satır: başlık 1,8 mm (değer yoksa basılmaz), altında değer. Başlıksız satırda değer kalındır.
export function satir(b: string, alan: string, yazi = 2.6): Blok {
  const ust = b === '' ? 0 : 2.3;
  return {
    ad: b === '' ? alan : b, dusebilir: true, h: yuvarla(ust + yazi * 1.25 + 0.7),
    yap: (y, yer) => [
      ...(b === '' ? [] : [metin(yer.bx, y, yer.bw, 2.2, BILGI_YAZI, `=${b}`, false, { kosul: alan })]),
      metin(yer.bx, y + ust, yer.bw, yazi * 1.25, yazi, alan, b === ''),
    ],
  };
}
// Etiket ile değer aynı satırda (malzeme etiketi: dar yükseklikte çok satır); en çok iki sütun.
export function yanSatir(sutunlar: readonly (readonly [baslik: string, alan: string, pay: number])[], yazi = 2.5): Blok {
  return {
    ad: sutunlar.map(([b]) => b).join(' · '), dusebilir: true, h: 3.5,
    yap: (y, yer) => {
      let x = yer.bx;
      const ogeler: SablonOgesi[] = [];
      for (const [b, alan, pay] of sutunlar) {
        const en = yer.bw * pay;
        const basEn = Math.min(13.4, en * 0.4);
        ogeler.push(metin(x, y + 0.45, basEn, 2.2, BILGI_YAZI, `=${b}`, false, { kosul: alan }), metin(x + basEn, y, en - basEn - 0.6, yazi * 1.2, yazi, alan, true));
        x += en;
      }
      return ogeler;
    },
  };
}
// Koşullu siyah bant (durum): ters yazı; alt satır varsa küçük yazı. Bant yalnız ana alanın değeri varken basılır.
export function bant(alan: string, ek: { alt?: string; buyuk?: boolean } = {}): Blok {
  const bh = ek.buyuk ? 8 : 6.8;
  const f = ek.buyuk ? 4.4 : 3.6;
  return {
    ad: alan, dusebilir: false, h: yuvarla(bh + 0.8),
    yap: (y, yer) => [
      bandKutusu(yer.bx, y, yer.bw, bh, alan),
      metin(yer.bx + 1.2, ek.alt === undefined ? y + (bh - f * 1.25) / 2 : y + 0.7, yer.bw - 2.4, f * 1.25, f, alan, true, { ters: true, kosul: alan }),
      ...(ek.alt === undefined ? [] : [metin(yer.bx + 1.2, y + bh - 2.1, yer.bw - 2.4, 1.9, BILGI_YAZI, ek.alt, false, { ters: true, kosul: ek.alt })]),
    ],
  };
}
export const ozel = (ad: string, h: number, yap: (y: number, yer: Yer) => SablonOgesi[], dusebilir = false): Blok => ({ ad, h, dusebilir, yap });

export interface SeritGirdisi {
  anahtar: string; ad: string; tur: SablonTuru; genislik: number; yukseklik: number;
  // Şerit bilgi satırı: tür adı. Piktogram: sabit ("siyah:konum") ya da alan adı (kararSimge).
  turAdi: string; simge: string; simgeAlani?: boolean;
  // Durum etiketlerinde bütün etiketi çevreleyen çerçeve basılabilir: kod ve gövde çerçeveden içeridedir.
  cerceve?: string;
  bloklar: readonly Blok[];
  // Akışın dışındaki sabit öğeler (refakat işlem tablosu, deneme etiketi içeriği).
  ek?: readonly SablonOgesi[];
  // Gövdenin sağ üstüne konan piktogram boyutu (50x25'te şeritte yer yok); 0: konmaz.
  govdeSimgesi?: number;
}

export function seritSablonu(g: SeritGirdisi): Sablon {
  const { genislik: W, yukseklik: H } = g;
  const S = seritEni(W, H);
  const kucuk = W < 75;
  const seritH = H >= 150 ? 60 : H;
  const kenar = g.cerceve === undefined ? 1.5 : 3;
  const kutuKenar = kenar; // çerçeve kalınlığı 2,2-2,4 mm: kod ve yazı çerçevenin içinde kalır
  const ogeler: SablonOgesi[] = [];
  // ---- şerit ----
  const kenari = seritKodKenari(W, H);
  const y0 = g.cerceve === undefined ? 1.2 : 2.5;
  ogeler.push(kutu(S, kutuKenar - 0.5, 0.3, seritH - 2 * (kutuKenar - 0.5), 0.3));
  ogeler.push({ tur: 'kod', x: yuvarla((S - kenari) / 2), y: y0, boyut: yuvarla(kenari), alan: 'qr' });
  // 3758 b: karekod ile tür adı arasında elle yazılacak kodun yeri (başlık, kod satırı); kurallar.ts qrVeKodu bu yere çizer.
  const kodBandi = (seritKodBasligiVar(W) ? SERIT_KOD_BASLIGI * 1.2 + 0.1 : 0) + seritKodYazisi(W, H) * 1.2 + 0.7;
  const by = y0 + kenari + kodBandi;
  const merkez = (alan: string, ornek: string, kalin: boolean, y: number): SablonOgesi => {
    const w = Math.min(S - 2, metinGenisligi(ornek, SERIT_YAZI, kalin) + 0.8);
    return metin((S - w) / 2, y, w, SERIT_YAZI * 1.2, SERIT_YAZI, alan, kalin);
  };
  ogeler.push(merkez(`=${g.turAdi}`, g.turAdi, true, by), merkez('kodBasim', 'Basım 22.11.2026', false, by + SERIT_ADIM));
  // Piktogram şeridin tabanındadır; kod bandı uzayınca (3758 b) basım satırına binmesin diye gerekirse küçülür.
  const pikAlt = seritH - kutuKenar + (g.cerceve === undefined ? 0.3 : 0);
  const pb = Math.min(S - 8, 12, yuvarla(pikAlt - (by + SERIT_ADIM + SERIT_YAZI * 1.2) - 0.3));
  if (!kucuk && H >= 50 && pb > 0) ogeler.push(simge((S - pb) / 2, pikAlt - pb, pb, g.simgeAlani === true ? g.simge : `=${g.simge}`));
  // ---- gövde ----
  const bx = S + 2;
  const bw = W - bx - kenar;
  const ust = kenar;
  const alt = seritH - kenar;
  const gp = g.govdeSimgesi ?? (kucuk ? 5 : 0);
  if (gp > 0) ogeler.push(simge(W - kenar - gp, 1.2, gp, g.simgeAlani === true ? g.simge : `=${g.simge}`));
  const yer: Yer = { bx, bw, kucuk, en: (y) => (gp > 0 && y < 1.2 + gp + 0.2 ? bw - gp - 1 : bw) };
  let y = ust;
  const dusen: string[] = [];
  for (const b of g.bloklar) {
    const h = b.h;
    if (y + h > alt + 1e-9) {
      if (!b.dusebilir) throw new Error(`${g.anahtar}: ${b.ad} gövdeye sığmadı`);
      dusen.push(b.ad);
      continue;
    }
    ogeler.push(...b.yap(y, yer));
    y += h;
  }
  ogeler.push(...(g.ek ?? []));
  if (g.cerceve !== undefined) ogeler.push(kutu(0, 0, W, H, 2.4, g.cerceve));
  return { anahtar: g.anahtar, ad: g.ad, tur: g.tur, genislik: W, yukseklik: H, ogeler, ...(dusen.length === 0 ? {} : { uyari: `Satır düşer: ${dusen.join(', ')}` }) };
}
