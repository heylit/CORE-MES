import { KARSILAMA_SOZLERI } from './karsilama-sozleri.ts';

// Kart 2232 (kullanıcı kararı R3): karşılamanın o günkü notu, sözü ve bayrağı. Saf kural; gün tesis günüdür (çağıran verir).
// Not yalnız büyük metnin yerine geçer, söz her gün yerinde kalır; 10 Kasım'da kart sade, sözsüz ve hareketsizdir.

export interface BayramGunleri {
  bas: string;
  bit: string;
}

export interface KarsilamaGunuAyari {
  sozAcik: boolean;
  gunNotuAcik: boolean;
  ramazanBayrami: BayramGunleri | null;
  kurbanBayrami: BayramGunleri | null;
}

export interface KarsilamaGunu {
  not: string | null;
  soz: string | null;
  sade: boolean;
  bayrak: boolean;
}

// Resmi ve milli günler (aa-gg). Bayrak yalnız milli bayramlarda ve 15 Temmuz'da dalgalanır; 1 Ocak ve 1 Mayıs bayraksızdır.
const SABIT_GUNLER: Readonly<Record<string, { not: string; bayrak: boolean }>> = {
  '01-01': { not: 'Yeni yıl, yeni emekler; hepimize sağlıklı ve bereketli bir yıl.', bayrak: false },
  '04-23': { not: '23 Nisan kutlu olsun; bugün çocuklarımız için üretiyoruz.', bayrak: true },
  '05-01': { not: 'Emeğe ve dayanışmaya selam; bu atölye sizin emeğinizle ayakta.', bayrak: false },
  '05-19': { not: '19 Mayıs kutlu olsun; gençlerimizin emeği geleceğimizdir.', bayrak: true },
  '07-15': { not: 'Birlik ve beraberlik içinde nice güzel günlere.', bayrak: true },
  '08-30': { not: '30 Ağustos Zafer Bayramı kutlu olsun.', bayrak: true },
  '10-28': { not: 'Yarın Cumhuriyet Bayramı; bugünün emeği için teşekkürler.', bayrak: true },
  '10-29': { not: 'Cumhuriyet Bayramımız kutlu olsun.', bayrak: true },
};

const GUN_MS = 864e5;
const gunSayisi = (iso: string): number => Date.parse(`${iso}T00:00:00Z`) / GUN_MS;
const isoGun = (sayi: number): string => new Date(sayi * GUN_MS).toISOString().slice(0, 10);
// 0 pazar, 6 cumartesi.
const haftaGunu = (sayi: number): number => new Date(sayi * GUN_MS).getUTCDay();
const isGunuMu = (sayi: number): boolean => haftaGunu(sayi) !== 0 && haftaGunu(sayi) !== 6;

function komsuIsGunu(iso: string, yon: 1 | -1): string {
  let sayi = gunSayisi(iso) + yon;
  while (!isGunuMu(sayi)) sayi += yon;
  return isoGun(sayi);
}

function dinBayramiNotu(gun: string, ad: string, gunler: BayramGunleri | null): string | null {
  if (gunler === null) return null;
  if (gun >= gunler.bas && gun <= gunler.bit) return `${ad} kutlu olsun.`;
  if (gun === komsuIsGunu(gunler.bas, -1)) return 'Bayramınız şimdiden kutlu olsun; ailenizle güzel günler geçirin.';
  if (gun === komsuIsGunu(gunler.bit, 1)) return 'Tekrar hoş geldiniz; bayramınız mübarek olsun.';
  return null;
}

// Konular sırayla döner, sözü biten konu atlanır: ardışık günler farklı konudan gelir, her söz sırada bir kez yer alır.
const SOZ_SIRASI: readonly string[] = (() => {
  const sira: string[] = [];
  const enUzun = Math.max(...KARSILAMA_SOZLERI.map((k) => k.length));
  for (let i = 0; i < enUzun; i += 1) for (const konu of KARSILAMA_SOZLERI) { const soz = konu[i]; if (soz !== undefined) sira.push(soz); }
  return sira;
})();

// Yılın kaçıncı günü (0'dan): 29 Şubat'lı yıl 366 söze tam denk gelir, öteki yıllarda son söz çıkmaz.
export function gununSozu(gun: string): string {
  const sayi = gunSayisi(gun) - gunSayisi(`${gun.slice(0, 4)}-01-01`);
  return SOZ_SIRASI[sayi % SOZ_SIRASI.length] ?? '';
}

function gununNotu(gun: string, ayar: KarsilamaGunuAyari): { not: string; bayrak: boolean } | null {
  const din = dinBayramiNotu(gun, 'Ramazan Bayramınız', ayar.ramazanBayrami) ?? dinBayramiNotu(gun, 'Kurban Bayramınız', ayar.kurbanBayrami);
  if (din !== null) return { not: din, bayrak: false };
  const sabit = SABIT_GUNLER[gun.slice(5)];
  if (sabit !== undefined) return sabit;
  const [ay, ayinGunu] = [Number(gun.slice(5, 7)), Number(gun.slice(8, 10))];
  const hg = haftaGunu(gunSayisi(gun));
  if (ay === 12 && ayinGunu >= 24) return { not: 'Yılın son günlerinde emeğin için teşekkürler.', bayrak: false };
  if (ayinGunu === 1) return { not: 'Yeni ay, yeni hedefler.', bayrak: false };
  if (hg === 1) return { not: 'Yeni hafta, temiz bir sayfa.', bayrak: false };
  if (hg === 5) return { not: 'Haftanın son düzlüğü; iyi bitirelim.', bayrak: false };
  if (hg === 0 || hg === 6) return { not: 'Hafta sonu gelenlerin emeği çok değerli.', bayrak: false };
  return null;
}

export function karsilamaGunu(gun: string, ayar: KarsilamaGunuAyari): KarsilamaGunu {
  if (ayar.gunNotuAcik && gun.slice(5) === '11-10') return { not: 'Saygıyla anıyoruz.', soz: null, sade: true, bayrak: false };
  const not = ayar.gunNotuAcik ? gununNotu(gun, ayar) : null;
  return { not: not?.not ?? null, soz: ayar.sozAcik ? gununSozu(gun) : null, sade: false, bayrak: not?.bayrak ?? false };
}
