import type { FaturaEslesmeSatiri } from '#paylasilan/sozlesme/logo.ts';

// 3675 D3: Logo uyumu ekranının saf kuralları (biçim, fark, tür adı). Veri sunucudan olduğu gibi gelir; sıfır uydurulmaz:
// bir taraf yoksa fark "—", iki taraf eşitse "0,00".
type Durum = FaturaEslesmeSatiri['durum'];
type FarkKodu = FaturaEslesmeSatiri['farklar'][number];
type Taraf = NonNullable<FaturaEslesmeSatiri['logo']>;

export const DURUMLAR: Readonly<Record<Durum, { ad: string; ton: 'run' | 'hold' | 'stop' | 'done' | 'muted' }>> = {
  eslesti: { ad: 'Eşleşti', ton: 'run' },
  farkli: { ad: 'Farklı', ton: 'hold' },
  'logoda-var-finansta-yok': { ad: "Yalnız Logo'da", ton: 'stop' },
  'finansta-var-logoda-yok': { ad: 'Yalnız finansta', ton: 'done' },
  'cari-kodu-yok': { ad: 'Cari kodu yok', ton: 'muted' },
};
export const DURUM_SIRASI = Object.keys(DURUMLAR) as readonly Durum[];

export const FARK_ADLARI: Readonly<Record<FarkKodu, string>> = {
  iptal: 'İptal', 'para-birimi': 'Para birimi', tarih: 'Tarih', net: 'Net', kdv: 'KDV', toplam: 'Toplam',
};

// Fark etiketi: iptal farkında hangi tarafın iptal olduğu yazılır (kartta taraf okunsun).
export function farkEtiketi(s: FaturaEslesmeSatiri, kod: FarkKodu): string {
  if (kod !== 'iptal') return FARK_ADLARI[kod];
  return s.logo?.iptal === true && s.finans?.iptal !== true ? "İptal: Logo'da" : s.finans?.iptal === true && s.logo?.iptal !== true ? 'İptal: finansta' : 'İptal';
}

// Dar kartta toplam sütunları yoktur: bulunan tarafların toplamı kısa yazılır; olmayan taraf yazılmaz.
export function ozetParcalari(s: FaturaEslesmeSatiri): readonly string[] {
  return [
    ...(s.logo === null ? [] : [`Logo: ${paraMetni(s.logo.toplam, s.logo.paraBirimi)}`]),
    ...(s.finans === null ? [] : [`Finans: ${paraMetni(s.finans.toplam, s.finans.paraBirimi)}`]),
  ];
}

export const TURLER = [
  { deger: 'satis', baslik: 'Satış' }, { deger: 'alis', baslik: 'Alış' },
  { deger: 'satis-iade', baslik: 'Satış iade' }, { deger: 'alis-iade', baslik: 'Alış iade' },
] as const;
export const GUNLER = [{ deger: '30', baslik: 'Son 30 gün' }, { deger: '90', baslik: 'Son 90 gün' }, { deger: '365', baslik: 'Son 365 gün' }] as const;

// Satış gelir, alış gider; iade finansta ters yöndedir (gelir + iade = alış iadesi).
export function turAdi(s: Pick<FaturaEslesmeSatiri, 'yon' | 'iade'>): string {
  if (s.yon === 'gelir') return s.iade ? 'Alış iade' : 'Satış';
  return s.iade ? 'Satış iade' : 'Alış';
}

export const satirAnahtari = (s: FaturaEslesmeSatiri): string =>
  [s.yon, s.iade ? 'iade' : 'fatura', s.cariKodu ?? '', s.faturaNo, s.finans?.belgeId ?? ''].join('|');

const SEMBOL: Readonly<Record<string, string>> = { TRY: '₺', EUR: '€', USD: '$' };
export const paraBirimiMetni = (p: string): string => SEMBOL[p] ?? p;
const kurus = (m: string): number => Math.round(Number(m) * 100);
const tutarMetni = (k: number): string => (k / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const paraMetni = (m: string | null, p: string): string => (m === null ? '—' : `${tutarMetni(kurus(m))} ${paraBirimiMetni(p)}`);

// Logo eksi finans. Para birimleri farklıysa tutar farkı anlamsızdır: "—" (farkın nedeni para birimidir). Cari kodu olmayan satırda
// karşılaştırma yapılmaz.
export function farkKurusu(s: FaturaEslesmeSatiri, alan: 'net' | 'kdv' | 'toplam'): number | null {
  if (s.logo === null || s.finans === null || s.durum === 'cari-kodu-yok' || s.logo.paraBirimi !== s.finans.paraBirimi) return null;
  return kurus(s.logo[alan]) - kurus(s.finans[alan]);
}
export function farkMetni(k: number | null, p?: string): string {
  if (k === null) return '—';
  return `${k > 0 ? '+' : k < 0 ? '−' : ''}${tutarMetni(Math.abs(k))}${p === undefined ? '' : ` ${paraBirimiMetni(p)}`}`;
}
// Kuruş toleransı sunucudadır (1 kuruş); satır bu yüzden "eşleşti" olup küçük bir fark taşıyabilir.
export const farkVar = (k: number | null): boolean => k !== null && k !== 0;

export function taraflarFarkli(s: FaturaEslesmeSatiri, kod: FarkKodu): boolean { return s.farklar.includes(kod); }

export interface AyrintiSatiri { anahtar: string; ad: string; logo: string; finans: string; fark: string; farkli: boolean }
export function ayrintiSatirlari(s: FaturaEslesmeSatiri): readonly AyrintiSatiri[] {
  const para = (t: Taraf | NonNullable<FaturaEslesmeSatiri['finans']> | null, alan: 'net' | 'kdv' | 'toplam') => (t === null ? 'Kayıt yok' : paraMetni(t[alan], t.paraBirimi));
  const tutar = (alan: 'net' | 'kdv' | 'toplam', kod: FarkKodu): AyrintiSatiri => ({
    anahtar: alan, ad: FARK_ADLARI[kod], logo: para(s.logo, alan), finans: para(s.finans, alan), fark: farkMetni(farkKurusu(s, alan)),
    farkli: taraflarFarkli(s, kod),
  });
  const durumMetni = (t: { iptal: boolean } | null) => (t === null ? 'Kayıt yok' : t.iptal ? 'İptal' : 'Açık');
  return [
    tutar('net', 'net'), tutar('kdv', 'kdv'), tutar('toplam', 'toplam'),
    { anahtar: 'para-birimi', ad: 'Para birimi', logo: s.logo?.paraBirimi ?? 'Kayıt yok', finans: s.finans?.paraBirimi ?? 'Kayıt yok', fark: '—', farkli: taraflarFarkli(s, 'para-birimi') },
    { anahtar: 'iptal', ad: 'İptal', logo: durumMetni(s.logo), finans: durumMetni(s.finans), fark: '—', farkli: taraflarFarkli(s, 'iptal') },
  ];
}

// Farkın nedeni cümleyle; etiket tek başına yetmez (Arayüz ön bakışı 4).
export function aciklama(s: FaturaEslesmeSatiri): string | null {
  switch (s.durum) {
    case 'eslesti': return null;
    case 'logoda-var-finansta-yok': return 'Finansta karşılığı yok. Faturayı finansa elle girmek gerekir; bu ekran yazmaz.';
    case 'finansta-var-logoda-yok': return "Logo'da bu numarayla fatura yok. Logo okuması henüz bu faturayı getirmemiş olabilir.";
    case 'cari-kodu-yok': return s.logo === null
      ? "Firmanın Logo cari kodu tanımlı değil; Logo tarafında aynı numaralı fatura bulunamadı. Firma kartına Logo cari kodunu yazın."
      : 'Firmanın Logo cari kodu tanımlı değil. Numarası aynı olan tek Logo faturası yan yana gösterilir ama karşılaştırma yapılmaz; Firma kartına Logo cari kodunu yazın.';
    case 'farkli': {
      const parca: string[] = [];
      if (taraflarFarkli(s, 'iptal')) parca.push(s.logo?.iptal === true ? "Logo'da iptal edilmiş, finansta açık görünüyor." : "Finansta iptal edilmiş, Logo'da açık görünüyor.");
      if (taraflarFarkli(s, 'para-birimi')) parca.push(`Para birimi farklı (Logo ${s.logo?.paraBirimi ?? '—'}, finans ${s.finans?.paraBirimi ?? '—'}); tutar farkı hesaplanmaz.`);
      if (taraflarFarkli(s, 'tarih')) parca.push('Fatura tarihi iki tarafta farklı.');
      const tutarlar = (['net', 'kdv', 'toplam'] as const).filter((k) => taraflarFarkli(s, k)).map((k) => FARK_ADLARI[k]);
      if (tutarlar.length > 0) parca.push(`${tutarlar.join(', ')} tutarı iki tarafta farklı girilmiş.`);
      return parca.join(' ');
    }
  }
}

// Okuma bu süreden eskiyse liste bayattır (Logo okuması durmuş ya da hata veriyor olabilir).
export const BAYAT_SAAT = 24;
export function bayatMi(sonOkuma: string | null, simdi: number): boolean {
  if (sonOkuma === null) return false;
  const t = Date.parse(sonOkuma);
  return Number.isFinite(t) && simdi - t > BAYAT_SAAT * 3_600_000;
}
