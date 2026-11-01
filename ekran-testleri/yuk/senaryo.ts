import { z } from 'zod';

// Yük senaryosu: sanal kişi bir profil alır; profil ekranların kendiliğinden yokladığı uçları (aralıkla) ve kişinin açtığı
// sayfaları (ağırlıkla, düşünme süresiyle) taşır. Varsayılan karışım bir varsayımdır; gerçek dağılım bilinince
// TMIV2_YUK_SENARYO dosyasıyla değiştirilir.

const YOL = z.string().regex(/^\/[A-Za-z0-9/_?=&.%-]*$/, 'Yol / ile başlar, yalnız adres karakterleri içerir.');

export const profilSemasi = z.object({
  ad: z.string().min(1),
  // Rolü bu örnek hesabın rolünden alınır (örnek veri, sunucu/moduller/kisiler/ornek-veri.ts).
  ornekHesap: z.string().min(1),
  pay: z.number().positive(),
  yoklamalar: z.array(z.object({ yol: YOL, aralikSn: z.number().positive() })),
  sayfalar: z.array(z.object({ yol: YOL, agirlik: z.number().positive() })),
  dusunmeSn: z.number().positive(),
});

export const senaryoSemasi = z.array(profilSemasi).min(1);

export type Profil = z.output<typeof profilSemasi>;

// Aralıklar ekranlardaki yoklama süreleridir: bildirim sayacı 30 sn (bildirim/gorunum.ts), atölye ve kalite 15 sn.
const BILDIRIM = { yol: '/bildirimler/sayac', aralikSn: 30 };

export const VARSAYILAN_SENARYO: readonly Profil[] = [
  {
    ad: 'operator', ornekHesap: 'ornek.operator1', pay: 70, dusunmeSn: 45,
    yoklamalar: [BILDIRIM, { yol: '/arkon/son-olaylar?sayi=20', aralikSn: 15 }],
    sayfalar: [{ yol: '/uretim-emirleri?kapsam=hepsi', agirlik: 3 }, { yol: '/oturum', agirlik: 1 }],
  },
  {
    ad: 'planlama', ornekHesap: 'ornek.planlama', pay: 10, dusunmeSn: 30,
    yoklamalar: [BILDIRIM],
    sayfalar: [{ yol: '/uretim-emirleri?kapsam=hepsi', agirlik: 3 }, { yol: '/atolye/modeller', agirlik: 1 }],
  },
  {
    ad: 'depo', ornekHesap: 'ornek.depo', pay: 10, dusunmeSn: 30,
    yoklamalar: [BILDIRIM],
    sayfalar: [{ yol: '/atolye/goz-kalemleri', agirlik: 2 }, { yol: '/atolye/modeller', agirlik: 1 }],
  },
  {
    ad: 'kalite', ornekHesap: 'ornek.kalite', pay: 5, dusunmeSn: 30,
    yoklamalar: [BILDIRIM, { yol: '/kalite-merkezi/emir-kaynaklari', aralikSn: 15 }],
    sayfalar: [{ yol: '/kalite-merkezi/olcu-aletleri', agirlik: 1 }, { yol: '/kalite-merkezi/kimlik', agirlik: 1 }],
  },
  {
    ad: 'mudur', ornekHesap: 'ornek.mudur', pay: 5, dusunmeSn: 60,
    yoklamalar: [BILDIRIM],
    sayfalar: [{ yol: '/uretim-emirleri?kapsam=hepsi', agirlik: 2 }, { yol: '/arkon/son-olaylar?sayi=20', agirlik: 1 }],
  },
];

// mulberry32: aynı tohum aynı koşuyu verir; başarısız koşu tohumuyla yeniden üretilir (ADR 0025 kural 7).
export function tohumluUretec(tohum: number): () => number {
  let a = tohum >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// En büyük kalan yöntemi: paylar toplamı ne olursa olsun kişi sayısı tam dağılır; sıra tekrarlanabilir olsun diye rastgelelik yok.
export function profilDagit(kisiSayisi: number, profiller: readonly Profil[]): string[] {
  const toplam = profiller.reduce((s, p) => s + p.pay, 0);
  const kesirli = profiller.map((p, sira) => ({ ad: p.ad, sira, tam: Math.floor((kisiSayisi * p.pay) / toplam), kalan: ((kisiSayisi * p.pay) / toplam) % 1 }));
  let eksik = kisiSayisi - kesirli.reduce((s, k) => s + k.tam, 0);
  for (const k of [...kesirli].sort((x, y) => y.kalan - x.kalan || x.sira - y.sira)) {
    if (eksik === 0) break;
    k.tam += 1;
    eksik -= 1;
  }
  const sonuc: string[] = [];
  for (const k of kesirli) for (let i = 0; i < k.tam; i += 1) sonuc.push(k.ad);
  return sonuc;
}

export function agirlikliSec<T extends { agirlik: number }>(secenekler: readonly T[], r: number): T | null {
  const toplam = secenekler.reduce((s, x) => s + x.agirlik, 0);
  let esik = r * toplam;
  for (const x of secenekler) {
    esik -= x.agirlik;
    if (esik < 0) return x;
  }
  return secenekler.at(-1) ?? null;
}

// Üstel dağılım: insanlar eşit aralıkla tıklamaz. Ortalamanın beş katında kesilir ki tek bir kişi koşuyu boş geçirmesin.
export function dusunmeSuresiMs(ortalamaSn: number, r: number): number {
  const sn = -Math.log(1 - Math.min(r, 0.999_999)) * ortalamaSn;
  return Math.max(0, Math.round(Math.min(sn, ortalamaSn * 5) * 1000));
}

// Sonuç uç kalıbına göre toplanır: sorgu dizgesi ve sayısal kimlik atılır (sunucu günlüğündeki "Uç süresi" satırıyla aynı ayrım).
export function yolKalibi(yontem: string, yol: string): string {
  const yalin = yol.split('?')[0] ?? yol;
  return `${yontem} ${yalin.replace(/\/\d+(?=\/|$)/g, '/:id')}`;
}

const YEREL_ADLAR = new Set(['127.0.0.1', 'localhost', '[::1]']);

// Canlı uygulama vekilin arkasında HTTPS'tir; yük koşusu yalnız aynı makinedeki düz HTTP kapısına gider. Bu tek başına yetmez:
// canlıda da API kapısı 127.0.0.1'i dinler. Ortamı ayrıca sunucunun kendi sağlık ayrıntısından okumak çağıranın işidir.
export function adresDenetle(adres: string | undefined): { tamam: true; kok: string } | { tamam: false; neden: string } {
  if (adres === undefined || adres.trim() === '') return { tamam: false, neden: 'TMIV2_YUK_ADRESI boş (örnek: http://127.0.0.1:4100).' };
  let url: URL;
  try {
    url = new URL(adres);
  } catch {
    return { tamam: false, neden: `TMIV2_YUK_ADRESI geçerli bir adres değil: ${adres}` };
  }
  if (url.protocol !== 'http:') return { tamam: false, neden: 'Yük koşusu yalnız düz HTTP yerel kapıya gider; HTTPS adres canlı vekil olabilir.' };
  if (!YEREL_ADLAR.has(url.hostname)) return { tamam: false, neden: 'Yük koşusu yalnız bu makinedeki sunucuya gider (127.0.0.1, localhost).' };
  if (url.pathname !== '/' || url.search !== '') return { tamam: false, neden: 'TMIV2_YUK_ADRESI yalnız şema, ad ve kapı taşır.' };
  return { tamam: true, kok: url.origin };
}

export function ortamDenetle(ortamDegiskeni: string | undefined, sunucununOrtami: string | null): string | null {
  if (ortamDegiskeni === 'canli') return 'TMIV2_ORTAM=canli: yük koşusu canlı ortamda açılmaz.';
  if (sunucununOrtami === null) return 'Sunucunun ortamı okunamadı (saglik/ayrinti); ortam bilinmeden koşu başlamaz.';
  if (sunucununOrtami === 'canli') return 'Hedef sunucu canlı ortamda: yük koşusu açılmaz.';
  return null;
}

export function sayiOku(deger: string | undefined, varsayilan: number, ad: string, enAz: number, enCok: number): number {
  if (deger === undefined || deger.trim() === '') return varsayilan;
  const sayi = Number(deger);
  if (!Number.isInteger(sayi) || sayi < enAz || sayi > enCok) throw new Error(`${ad} ${enAz}-${enCok} arası tam sayı olmalı: ${deger}`);
  return sayi;
}
