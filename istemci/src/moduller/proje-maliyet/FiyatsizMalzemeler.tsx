import { useQuery } from '@tanstack/react-query';
import type { LogoSonAlisCevabi } from '#paylasilan/sozlesme/logo.ts';
import type { ProjeMaliyetCevabi } from '#paylasilan/sozlesme/proje-maliyet.ts';
import { Kart, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';

type Malzeme = NonNullable<ProjeMaliyetCevabi['fiyatsizMalzemeler']>[number];
type SonAlis = LogoSonAlisCevabi['kayitlar'][number];

const sayi = (x: string | number, en = 2): string => Number(x).toLocaleString('tr-TR', { minimumFractionDigits: en === 2 ? 2 : 0, maximumFractionDigits: en });
const tarih = (t: string): string => `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`;
const birimAyni = (a: string | null, b: string | null): boolean => a === null || b === null || a.toLocaleUpperCase('tr') === b.toLocaleUpperCase('tr');

// 3384-c a: Logo son alış yalnız öneridir; fiyat TL ve Logo birimi başına, dövizli faturada faturadaki döviz fiyatı ayrıca (kur çevrilmez).
function sonAlisHucresi(m: Malzeme, a: SonAlis | undefined, okuma: LogoSonAlisCevabi['okuma'] | undefined) {
  if (okuma === undefined) return <span className="tc-pm-soluk">…</span>;
  if (okuma === 'kapali') return <span className="tc-pm-soluk">Okuma kapalı</span>;
  if (a === undefined) return <span className="tc-pm-soluk">Logo'da faturalı alış yok</span>;
  const fiyat = `${sayi(a.fiyat)} TL${a.birim === null ? '' : ` / ${a.birim.toLocaleLowerCase('tr')}`}`;
  if (!birimAyni(m.birim, a.birim)) return <span className="tc-pm-soluk">{`${fiyat}; birim tutmuyor (${m.birim ?? ''}), karşılaştırılmaz`}</span>;
  return (
    <span className="tc-pm-logo-alis">
      <strong>{fiyat}</strong>
      {a.dovizFiyati !== null && <small>{`faturada ${sayi(a.dovizFiyati)} ${a.dovizKodu ?? 'döviz'}`}</small>}
      <small>{`${tarih(a.tarih)}${a.cariKodu === null ? '' : ` · ${a.cariKodu}`}${a.faturaNo === null ? '' : ` · ${a.faturaNo}`}`}</small>
    </span>
  );
}

// Birim fiyatı bilinmeyen malzemeler; sekmeyi açan zaten maliyet görür (finans.maliyet-oku), öneri ucu da onu ister. Toplamlara girmez.
export function FiyatsizMalzemeler({ malzemeler }: { malzemeler: readonly Malzeme[] }) {
  const kodlar = [...new Set(malzemeler.map((m) => m.stokKodu))].sort();
  const sorgu = useQuery({
    queryKey: ['logo', 'son-alislar', kodlar],
    enabled: kodlar.length > 0,
    queryFn: () => api.get<LogoSonAlisCevabi>(`/logo/son-alislar?malzemeler=${encodeURIComponent(kodlar.join(','))}`),
    staleTime: 5 * 60_000,
  });
  if (malzemeler.length === 0) return null;
  const bul = new Map((sorgu.data?.kayitlar ?? []).map((k) => [k.stokKodu, k]));
  const okuma = sorgu.isError ? 'kapali' : sorgu.data?.okuma;
  const sutunlar: Sutun<Malzeme>[] = [
    { anahtar: 'malzeme', baslik: 'Malzeme', kirilmaz: true, hucre: (m) => <span className="tc-pm-logo-alis"><strong>{m.ad ?? m.stokKodu}</strong><small>{m.stokKodu}</small></span> },
    { anahtar: 'miktar', baslik: 'İhtiyaç', hizala: 'sag', kirilmaz: true, hucre: (m) => `${sayi(m.miktar, 3)}${m.birim === null ? '' : ` ${m.birim}`}` },
    { anahtar: 'logo', baslik: 'Logo son alış', kartTamSatir: true, hucre: (m) => sonAlisHucresi(m, bul.get(m.stokKodu), okuma) },
  ];
  return (
    <Kart baslik="Fiyatı bilinmeyen malzemeler">
      <p className="tc-pm-soluk">Logo son alışı yalnız öneridir, toplamlara girmez. Fiyat Satın Alma'da girilince hesaba girer.</p>
      <Tablo etiket="Fiyatı bilinmeyen malzemeler" sutunlar={sutunlar} satirlar={[...malzemeler]} satirAnahtari={(m) => m.malzemeNo} />
    </Kart>
  );
}
