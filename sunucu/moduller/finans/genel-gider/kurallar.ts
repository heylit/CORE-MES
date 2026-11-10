// 2594 b, 2612 a: genel gider bileşenleri belgelerden kurulur. Her gider belgesi tek yere gider: bir bileşene ya da "dışarıda kalan"a.
// Bileşenin kaynağı bilinmiyorsa (çözücü yok, İK değeri yok) bileşen null'dır; sıfır sayılmaz (2626 2/2 a).

export const BILESENLER = ['kira', 'amortisman', 'dolayliPersonel', 'emilmeyenDogrudan', 'diger', 'projesizSatinAlma'] as const;
export type Bilesen = (typeof BILESENLER)[number];

// 2621 2/3 b: siparişe bağlı olmayan elle mal alımı "diğer"e girer. 2621 3/3 b: enerji tamamen genel giderde.
export const DIGER_KATEGORILERI: readonly string[] = ['enerji', 'diger_gider', 'lojistik', 'pazarlama', 'mal_alimi'];

// 2711 b: araç gideri genel gidere yalnız Finans belgesiyle girer (İdari İşler'deki araç masrafı rapordur, ayrıca sayılmaz). Araç
// faturası bu kategorilerle kaydedilir; hepsi genel gidere girer (kira kirada, ötekiler diğerde). Liste DIGER_KATEGORILERI'nden
// çıkarsa araç gideri sessizce dışarıda kalır; test bunu yakalar.
export const ARAC_FATURASI_KATEGORILERI: readonly string[] = ['lojistik', 'diger_gider', 'kira'];
export const genelGidereGirer = (kategori: string): boolean => kategori === 'kira' || DIGER_KATEGORILERI.includes(kategori);

export type DisaridaNedeni = 'eski_belge' | 'oran_bilinmiyor' | 'uretime_giden_pay' | 'proje_masrafi' | 'kategori';

export interface BelgeGirdisi {
  id: number; belgeNo: string | null; kategori: string; tutarTl: number; siparisli: boolean;
  // 2643 b: siparişli belge eşikten önce oluşturulduysa dışarıda kalır.
  eski: boolean;
  // Satın almanın verdiği genel gider oranı (0-1); null ya da undefined bilinmiyor (2637 a).
  oran?: number | null | undefined;
  // Projede sayılan masraf bağı var mı (2599-a2); null proje maliyeti çözücüsü yok demektir.
  projeMasrafi: boolean | null;
}

export interface DisaridaKalan { neden: DisaridaNedeni; kategori: string | null; tutar: number; adet: number }
export interface BelgeDagilimi {
  belgeler: Record<'kira' | 'diger' | 'projesizSatinAlma', number | null>;
  disarida: DisaridaKalan[];
  // Oranı bilinmeyen siparişli belgeler (belge no ya da #id); satır bunlarla kaydedilir, eksik listesine yazılır.
  oraniBilinmeyen: string[];
  // Maliyet notu (20:36Z): tek belge bileşenin yarısından fazlasıysa (peşin ya da yıllık ödeme olabilir) uyarı.
  baskinBelgeler: { bilesen: 'kira' | 'diger'; belge: string; tutar: number }[];
}

const kurus = (v: number): number => Math.round(v * 100) / 100;
const belgeAdi = (b: Pick<BelgeGirdisi, 'id' | 'belgeNo'>): string => b.belgeNo ?? `#${b.id}`;

// Siparişli belgenin genel gidere giren payı: KDV hariç TL x oran, kuruşa yuvarlı. Oran 0-1 dışındaysa bilinmiyor sayılır.
export function siparisliPay(tutarTl: number, oran: number | null | undefined): number | null {
  if (oran === null || oran === undefined || !Number.isFinite(oran) || oran < 0 || oran > 1) return null;
  return kurus(tutarTl * oran);
}

export function belgeleriDagit(belgeler: readonly BelgeGirdisi[]): BelgeDagilimi {
  const toplam = { kira: 0, diger: 0, projesizSatinAlma: 0 };
  let projeBilinmiyor = false;
  const disarida = new Map<string, DisaridaKalan>();
  const disariya = (neden: DisaridaNedeni, kategori: string | null, tutar: number): void => {
    if (tutar <= 0 && neden !== 'oran_bilinmiyor' && neden !== 'eski_belge') return;
    const k = `${neden}:${kategori ?? ''}`;
    const d = disarida.get(k) ?? { neden, kategori, tutar: 0, adet: 0 };
    d.tutar = kurus(d.tutar + tutar);
    d.adet += 1;
    disarida.set(k, d);
  };
  const oraniBilinmeyen: string[] = [];
  const enBuyuk = { kira: null as BelgeGirdisi | null, diger: null as BelgeGirdisi | null };
  for (const b of belgeler) {
    if (b.siparisli) {
      if (b.eski) { disariya('eski_belge', null, b.tutarTl); continue; }
      const pay = siparisliPay(b.tutarTl, b.oran);
      if (pay === null) { oraniBilinmeyen.push(belgeAdi(b)); disariya('oran_bilinmiyor', null, b.tutarTl); continue; }
      toplam.projesizSatinAlma = kurus(toplam.projesizSatinAlma + pay);
      disariya('uretime_giden_pay', null, kurus(b.tutarTl - pay));
      continue;
    }
    const hedef = !genelGidereGirer(b.kategori) ? null : b.kategori === 'kira' ? 'kira' : 'diger';
    if (hedef === null) { disariya('kategori', b.kategori, b.tutarTl); continue; }
    if (b.projeMasrafi === null) { projeBilinmiyor = true; continue; }
    if (b.projeMasrafi) { disariya('proje_masrafi', b.kategori, b.tutarTl); continue; }
    toplam[hedef] = kurus(toplam[hedef] + b.tutarTl);
    const onceki = enBuyuk[hedef];
    if (onceki === null || b.tutarTl > onceki.tutarTl) enBuyuk[hedef] = b;
  }
  const baskinBelgeler: BelgeDagilimi['baskinBelgeler'] = [];
  for (const bilesen of ['kira', 'diger'] as const) {
    const b = enBuyuk[bilesen];
    if (!projeBilinmiyor && b !== null && b.tutarTl * 2 > toplam[bilesen]) baskinBelgeler.push({ bilesen, belge: belgeAdi(b), tutar: b.tutarTl });
  }
  return {
    belgeler: { kira: projeBilinmiyor ? null : toplam.kira, diger: projeBilinmiyor ? null : toplam.diger, projesizSatinAlma: toplam.projesizSatinAlma },
    disarida: [...disarida.values()],
    oraniBilinmeyen,
    baskinBelgeler,
  };
}

export interface BilesenDegerleri {
  kira: number | null; amortisman: number | null; dolayliPersonel: number | null; emilmeyenDogrudan: number | null; diger: number | null; projesizSatinAlma: number | null;
}

// Aylık genel gider = bileşenler + elle ek (Veri 2659: bileşenler kuruşa yuvarlıdır, toplam yuvarlı bileşenlerden). Bir bileşen
// bilinmiyorsa toplam da bilinmez. Emilmeyen doğrudan işçilik eksi olabilir (fazla emilim).
export function bilesenToplami(b: BilesenDegerleri, elleEk = 0): number | null {
  let t = elleEk;
  for (const k of BILESENLER) {
    const v = b[k];
    if (v === null) return null;
    t += v;
  }
  return kurus(t);
}

export function eksikBilesenler(b: BilesenDegerleri): Bilesen[] {
  return BILESENLER.filter((k) => b[k] === null);
}
