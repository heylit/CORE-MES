import type {
  AileIpligi, EmirDurumu, KonfigurasyonCevabi, OlayIlgilisi, OlayTuru, RaporCevabi, SeriDurumu, UyumHali,
} from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';

// Konfigürasyon, İzlenebilirlik, Raporlar ve Olay günlüğü ekranlarının saf yardımcıları; veri ve saat okumaz.

export type KonfigurasyonSerisi = NonNullable<KonfigurasyonCevabi['seriler']>[number];
export type Gecerlilik = KonfigurasyonCevabi['gecerlilikler'][number];
export type AileDugumu = AileIpligi['dugumler'][number];
export type AileBagi = AileIpligi['baglar'][number];

// Seri numarasının sondaki sayısı şeritteki yeridir; geçerlilik de son ürünün ilk seri sayısıyla verilir.
export function seriSirasi(seriNo: string): number | null {
  const m = /(\d+)\D*$/.exec(seriNo);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) ? n : null;
}

export const DURUM_ADLARI: Readonly<Record<SeriDurumu, string>> = { planli: 'Planlı', uretimde: 'Üretimde', stokta: 'Stokta', sahada: 'Sahada' };
export const UYUM_ADLARI: Readonly<Record<UyumHali, string>> = {
  uyumlu: 'Uyumlu', uyumsuz: 'Uyumsuz', sapmali: 'Sapmalı', bilinmiyor: 'Bilinmiyor',
};
export const UYUM_TONLARI: Readonly<Record<UyumHali, RozetTonu>> = { uyumlu: 'tamam', uyumsuz: 'hata', sapmali: 'uyari', bilinmiyor: 'pasif' };

// Renk mod seviyesidir (prototip); dördüncü moddan sonrakiler aynı renkte kalır. Renk tek başına anlam taşımaz, ipucu yazar.
export const MOD_RENGI_SAYISI = 4;
// Boşlukları doldurmak yalnız kısa aralıkta anlamlıdır; uzun aralıkta yalnız kayıtlı seriler çizilir.
export const SERIT_BOSLUK_SINIRI = 400;

export const modRengi = (mod: number | null): number | null => (mod === null ? null : Math.min(mod, MOD_RENGI_SAYISI) - 1);

export type SeritHucresi =
  | { tur: 'seri'; sira: number | null; seri: KonfigurasyonSerisi; renk: number | null }
  | { tur: 'bos'; sira: number };

export interface Serit {
  hucreler: SeritHucresi[];
  // Mod başına seri sayısı ve o moddaki son revizyon.
  modlar: { mod: number | null; renk: number | null; adet: number; revizyon: string | null }[];
  durumlar: { sahada: number; stokta: number; uretimde: number; planli: number; bilinmiyor: number };
}

export function seritKur(seriler: readonly KonfigurasyonSerisi[]): Serit {
  const sirali = seriler
    .map((seri) => ({ seri, sira: seriSirasi(seri.seriNo) }))
    .sort((a, b) => (a.sira ?? Number.MAX_SAFE_INTEGER) - (b.sira ?? Number.MAX_SAFE_INTEGER) || a.seri.seriNo.localeCompare(b.seri.seriNo, 'tr'));
  const sayilar = sirali.flatMap((s) => (s.sira === null ? [] : [s.sira]));
  const enAz = sayilar.length ? Math.min(...sayilar) : 0;
  const enCok = sayilar.length ? Math.max(...sayilar) : 0;
  const boslukDoldur = sayilar.length > 0 && enCok - enAz + 1 <= SERIT_BOSLUK_SINIRI;
  const hucreler: SeritHucresi[] = [];
  let onceki: number | null = null;
  for (const { seri, sira } of sirali) {
    if (boslukDoldur && sira !== null && onceki !== null) for (let s = onceki + 1; s < sira; s++) hucreler.push({ tur: 'bos', sira: s });
    hucreler.push({ tur: 'seri', sira, seri, renk: modRengi(seri.mod) });
    if (sira !== null) onceki = sira;
  }
  const durumlar = { sahada: 0, stokta: 0, uretimde: 0, planli: 0, bilinmiyor: 0 };
  for (const { seri } of sirali) durumlar[seri.durum ?? 'bilinmiyor']++;
  const modSirasi = [...new Set(sirali.map((s) => s.seri.mod))].sort((a, b) => (a ?? Number.MAX_SAFE_INTEGER) - (b ?? Number.MAX_SAFE_INTEGER));
  const modlar = modSirasi.map((mod) => {
    const bu = sirali.filter((s) => s.seri.mod === mod);
    return { mod, renk: modRengi(mod), adet: bu.length, revizyon: bu.at(-1)?.seri.revizyon ?? null };
  });
  return { hucreler, modlar, durumlar };
}

// Geçerlilik sınırı yalnız yayınlanmış emirde çizilir; yayından önce sınır kesin değildir.
const YAYINLANMIS: readonly EmirDurumu[] = ['karar', 'uygulamada', 'dogrulama', 'kapandi'];

export function gecerlilikCizgileri(hucreler: readonly SeritHucresi[], gecerlilikler: readonly Gecerlilik[]): { gecerlilik: Gecerlilik; konum: number }[] {
  return gecerlilikler
    .filter((g) => YAYINLANMIS.includes(g.durum))
    .flatMap((gecerlilik) => {
      const konum = hucreler.findIndex((h) => h.sira === gecerlilik.ilkSeri);
      return konum < 0 ? [] : [{ gecerlilik, konum }];
    });
}

export function revizyonEtiketi(revizyon: string | null): string {
  return revizyon === null ? 'Revizyon bilinmiyor' : `Rev ${revizyon}`;
}

export function seriIpucu(seri: KonfigurasyonSerisi): string {
  const parcalar = [
    seri.seriNo, revizyonEtiketi(seri.revizyon), seri.mod === null ? 'Mod bilinmiyor' : `mod ${seri.mod}`,
    seri.durum ? DURUM_ADLARI[seri.durum] : 'Durum bilinmiyor', `Uyum: ${UYUM_ADLARI[seri.uyum]}`,
  ];
  if (seri.karantinada) parcalar.push('Karantinada');
  if (seri.emirNo) parcalar.push(`Emir ${seri.emirNo}`);
  if (seri.sapmaReferansi) parcalar.push(`Sapma ${seri.sapmaReferansi}`);
  return parcalar.join(', ');
}

export function malzemeEtiketi(m: { malzemeId: number; kod: string | null; ad: string | null }): string {
  if (m.kod && m.ad) return `${m.kod} ${m.ad}`;
  return m.kod ?? m.ad ?? `Malzeme #${m.malzemeId}`;
}

// Aile ipliği: dört sütun soldan sağa (tasarım, planlama, emir, üretilen).
export const IPLIK_KATMAN_ADLARI = {
  tasarim: { baslik: 'Tasarım', alt: 'as-designed: parça revizyonları' },
  planlama: { baslik: 'Planlama', alt: 'as-planned: MBOM ve rota' },
  emir: { baslik: 'Üretim emri', alt: 'dondurulmuş kopya' },
  uretim: { baslik: 'Üretilen', alt: 'as-built: seri ve stok' },
} as const satisfies Record<AileDugumu['katman'], { baslik: string; alt: string }>;
const KATMANLAR = Object.keys(IPLIK_KATMAN_ADLARI) as AileDugumu['katman'][];

// Yerleşim viewBox birimidir (prototipteki ölçüler): sütun aralığı, kutu eni ve boyu, satır boşluğu, başlık payı.
export const IPLIK_OLCU = { sutun: 272, en: 240, boy: 46, bosluk: 10, ust: 46 } as const;

export interface YerlesikDugum { dugum: AileDugumu; x: number; y: number }
export interface IplikYerlesimi {
  dugumler: YerlesikDugum[];
  // Kaynak ve hedefi çizilmiş bağlar; eksik uçlu bağ çizilmez.
  baglar: { bag: AileBagi; yol: string }[];
  en: number;
  boy: number;
}

export function ipligiYerlestir(iplik: AileIpligi): IplikYerlesimi {
  const { sutun, en, boy, bosluk, ust } = IPLIK_OLCU;
  const dugumler = KATMANLAR.flatMap((katman, k) =>
    iplik.dugumler.filter((d) => d.katman === katman).map((dugum, i) => ({ dugum, x: k * sutun, y: ust + i * (boy + bosluk) })));
  const yer = new Map(dugumler.map((d) => [d.dugum.anahtar, d]));
  const baglar = iplik.baglar.flatMap((bag) => {
    const a = yer.get(bag.kaynak);
    const b = yer.get(bag.hedef);
    if (!a || !b) return [];
    const x1 = a.x + en; const y1 = a.y + boy / 2; const x2 = b.x; const y2 = b.y + boy / 2; const ox = (x1 + x2) / 2;
    return [{ bag, yol: `M${x1} ${y1} C${ox} ${y1}, ${ox} ${y2}, ${x2} ${y2}` }];
  });
  const satir = Math.max(1, ...KATMANLAR.map((k) => iplik.dugumler.filter((d) => d.katman === k).length));
  return { dugumler, baglar, en: (KATMANLAR.length - 1) * sutun + en + 4, boy: ust + satir * (boy + bosluk) + 8 };
}

// Seçilen kaydın kaynağı ve ondan doğan her şey: bağlar ileri ve geri ayrı ayrı yürünür (kardeş dallar katılmaz).
export function soyZinciri(baglar: readonly AileBagi[], anahtar: string): Set<string> {
  const zincir = new Set([anahtar]);
  const yuru = (ileri: boolean) => {
    const gorulen = new Set([anahtar]);
    const kuyruk = [anahtar];
    while (kuyruk.length) {
      const n = kuyruk.pop() as string;
      for (const b of baglar) {
        const [bas, son] = ileri ? [b.kaynak, b.hedef] : [b.hedef, b.kaynak];
        if (bas === n && !gorulen.has(son)) { gorulen.add(son); zincir.add(son); kuyruk.push(son); }
      }
    }
  };
  yuru(true);
  yuru(false);
  return zincir;
}

export const kisalt = (m: string, n: number): string => (m.length > n ? `${m.slice(0, n - 1)}…` : m);

// Raporlar.
export function ortalamaIsGunu(cevrim: RaporCevabi['cevrim']): number | null {
  if (cevrim.length === 0) return null;
  return Math.round((cevrim.reduce((t, c) => t + c.isGunu, 0) / cevrim.length) * 10) / 10;
}

// Tutar metinle gelir (numeric); toplam number'a çevrilmeden basamak basamak alınır.
function olcekli(d: string, basamak: number): bigint {
  const eksi = d.startsWith('-');
  const [tam = '0', kesir = ''] = (eksi ? d.slice(1) : d).split('.');
  const deger = BigInt(tam + kesir.padEnd(basamak, '0'));
  return eksi ? -deger : deger;
}
const kesirBasamagi = (d: string): number => d.split('.')[1]?.length ?? 0;

export function ondalikTopla(degerler: readonly (string | null)[]): string | null {
  const dolu = degerler.filter((d): d is string => d !== null);
  if (dolu.length === 0) return null;
  const basamak = Math.max(...dolu.map(kesirBasamagi));
  const toplam = dolu.reduce((t, d) => t + olcekli(d, basamak), 0n);
  const eksi = toplam < 0n;
  const mutlak = (eksi ? -toplam : toplam).toString().padStart(basamak + 1, '0');
  const tam = mutlak.slice(0, mutlak.length - basamak);
  const kesir = mutlak.slice(mutlak.length - basamak);
  return `${eksi ? '-' : ''}${tam}${basamak ? `.${kesir}` : ''}`;
}

// İki basamağa yarım yukarı yuvarlar; binlik ayırıcı nokta, ondalık virgül.
export function tlMetni(d: string | null): string {
  if (d === null) return '—';
  const kurus = olcekli(d, 3);
  const eksi = kurus < 0n;
  const yuvarli = ((eksi ? -kurus : kurus) + 5n) / 10n;
  const tam = (yuvarli / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const kesir = (yuvarli % 100n).toString().padStart(2, '0');
  return `${eksi && yuvarli > 0n ? '-' : ''}${tam},${kesir} TL`;
}

// Miktar metni: sondaki sıfırlar atılır, binlik nokta, ondalık virgül.
export function miktarMetni(d: string): string {
  const eksi = d.startsWith('-');
  const [tam = '0', kesir = ''] = (eksi ? d.slice(1) : d).split('.');
  const k = kesir.replace(/0+$/, '');
  return `${eksi ? '-' : ''}${tam.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${k ? `,${k}` : ''}`;
}

// Grafik yalnız çizim içindir; değer number'a çevrilir, metin olarak tabloda kalır.
export const ondalikSayi = (d: string): number => Number(d);

// Olay günlüğü (iç; dışarı gönderilmez).
export const OLAY_TURU_ADLARI: Readonly<Record<OlayTuru, string>> = {
  talep_gonderildi: 'Talep gönderildi', etki_analizi: 'Etki analizi', musteri_onayi_istendi: 'Müşteri onayı istendi',
  emir_acildi: 'ECO açıldı', revizyon_yayinlandi: 'Revizyon yayınlandı', gecerlilik: 'Geçerlilik', karar_onerildi: 'Karar önerildi',
  emir_karari: 'Emir kararı', stok_karari: 'Stok kararı', emir_karantinada: 'Emir karantinada', rework_istendi: 'Rework istendi',
  sapma_acildi: 'Sapma açıldı', fai_onaylandi: 'FAI onaylandı', emir_kapandi: 'ECO kapandı',
};
export const OLAY_ILGILI_ADLARI: Readonly<Record<OlayIlgilisi, string>> = {
  'uretim-emirleri': 'Üretim emirleri', rota: 'Rota', 'belge-merkezi': 'Belge Merkezi', malzemeler: 'Malzemeler', stok: 'Stok',
  plan: 'Plan', 'kalite-merkezi': 'Kalite Merkezi', sevkiyat: 'Sevkiyat',
};

export function olayVerisi(alanlar: Readonly<Record<string, string>>): string {
  return Object.entries(alanlar).map(([ad, deger]) => `${ad.replace(/_/g, ' ')}: ${deger}`).join('; ');
}
