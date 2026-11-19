import type { AyarSecenegi } from './ayar-tanimi.ts';

// 3445: dış sistemden (Logo, SmartES) zamanlanmış okumanın sıklığı. "elle" yalnız "Şimdi oku" ile okur; aç/kapat ayrı anahtardadır.
export const OKUMA_SIKLIKLARI = ['elle', '1dk', '5dk', '15dk', '60dk', 'gunluk'] as const;
export type OkumaSikligi = (typeof OKUMA_SIKLIKLARI)[number];

const DAKIKA = 60_000;
export const SIKLIK_MS: Readonly<Record<OkumaSikligi, number | null>> = {
  elle: null, '1dk': DAKIKA, '5dk': 5 * DAKIKA, '15dk': 15 * DAKIKA, '60dk': 60 * DAKIKA, gunluk: 24 * 60 * DAKIKA,
};

export const SIKLIK_ETIKETI: Readonly<Record<OkumaSikligi, string>> = {
  elle: 'Yalnız elle', '1dk': 'Dakikada bir', '5dk': '5 dakikada bir', '15dk': '15 dakikada bir', '60dk': 'Saatte bir', gunluk: 'Günde bir',
};

export const okumaSikligiMi = (d: string): d is OkumaSikligi => (OKUMA_SIKLIKLARI as readonly string[]).includes(d);

// Ayar tanımının seçenekleri; akış kendi iç sınırından sık okuyamıyorsa (ör. saatte bir tazelenen liste) yalnız izinli olanlar verilir.
export function siklikSecenekleri(izinli: readonly OkumaSikligi[]): readonly AyarSecenegi[] {
  return OKUMA_SIKLIKLARI.filter((s) => izinli.includes(s)).map((s) => ({ deger: s, etiket: SIKLIK_ETIKETI[s] }));
}

// Zamanlanmış okumanın kapısı (Logo, SmartES; saf). İş her zamanki aralığıyla döner; istek ancak tur sırası gelince çıkar.
// Tur bir "pencere"dir: açılınca okuma her işte bir kez koşar; kayıt geldikçe (sayfa sayfa yetişme) pencere açık kalır, en az
// `enAzTur` koşar, sonra kapanır ve sonraki tur sıklık dolunca başlar. "Şimdi oku" pencereyi hemen açar.
export interface SiklikDurumu {
  sonTur: Date | null;
  pencere: boolean;
  pencereTuru: number;
  istendi: boolean;
  // "Şimdi oku" ile açılan pencerenin başı: akışın kendi iç aralığı (ör. saatte bir tazelenen liste) bu andan eski okumayı bekletmez.
  zorlaAni: Date | null;
}
export const yeniSiklikDurumu = (): SiklikDurumu => ({ sonTur: null, pencere: false, pencereTuru: 0, istendi: false, zorlaAni: null });

// Pencere kapalıyken açılır mı: istenmişse ya da sıklık dolmuşsa. "Yalnız elle" yalnız istekle açılır. İlk turda (süreç yeni açıldı) açılır.
export function turBaslasinMi(d: SiklikDurumu, siklik: OkumaSikligi, simdi: Date): SiklikDurumu | null {
  if (d.pencere) return d;
  if (d.istendi) return { ...d, pencere: true, pencereTuru: 0, istendi: false, zorlaAni: simdi };
  const ms = SIKLIK_MS[siklik];
  if (ms === null) return null;
  if (d.sonTur !== null && simdi.getTime() - d.sonTur.getTime() < ms) return null;
  return { ...d, pencere: true, pencereTuru: 0, zorlaAni: null };
}

// Yetişme sınırı: hep kayıt dönen bozuk bir okuma pencereyi sonsuza dek açık tutmasın.
export const PENCERE_EN_COK_TUR = 100;

// Tur koştuktan sonra: kayıt geldiyse ya da en az tur sayısı dolmadıysa pencere açık kalır; değilse kapanır, zaman yazılır.
// `null` sonuç akışın kapalı ya da bağlantının olmadığı demektir: pencere kapanır ama zaman yazılmaz (açılınca hemen okunur).
export function turBitti(d: SiklikDurumu, sonuc: { kayitGeldi: boolean } | null, enAzTur: number, simdi: Date): SiklikDurumu {
  if (sonuc === null) return { ...d, pencere: false, pencereTuru: 0, zorlaAni: null };
  const tur = d.pencereTuru + 1;
  if ((sonuc.kayitGeldi && tur < PENCERE_EN_COK_TUR) || tur < enAzTur) return { ...d, pencere: true, pencereTuru: tur };
  return { ...d, pencere: false, pencereTuru: 0, zorlaAni: null, sonTur: simdi };
}

// Bir sonraki turun en erken zamanı (ekran için); pencere açıkken ya da "Yalnız elle"de null.
export function sonrakiTur(d: SiklikDurumu, siklik: OkumaSikligi): Date | null {
  const ms = SIKLIK_MS[siklik];
  if (d.pencere || ms === null || d.sonTur === null) return null;
  return new Date(d.sonTur.getTime() + ms);
}
