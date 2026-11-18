import { useQuery } from '@tanstack/react-query';
import type { LogoSonAlisCevabi } from '#paylasilan/sozlesme/logo.ts';
import { Simge } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { fiyatMetni, tarihMetni } from './gorunum.ts';

export type LogoSonAlis = LogoSonAlisCevabi['kayitlar'][number];
export interface Hammadde { kod: string; birim: string | null }

// 3384-c a: maliyeti olmayan kalemin hammaddeleri için Logo son alış önerisi. Yalnız maliyet gören (finans.maliyet-oku) sorar; öneri
// hesaba girmez, fiyat alanını doldurmaz.
export function useLogoSonAlislar(kodlar: readonly string[], etkin: boolean) {
  const anahtar = [...new Set(kodlar)].sort();
  return useQuery({
    queryKey: ['logo', 'son-alislar', anahtar],
    enabled: etkin && anahtar.length > 0,
    queryFn: () => api.get<LogoSonAlisCevabi>(`/logo/son-alislar?malzemeler=${encodeURIComponent(anahtar.join(','))}`),
    staleTime: 5 * 60_000,
  });
}

const birimAyni = (a: string | null, b: string | null): boolean => a === null || b === null || a.toLocaleUpperCase('tr') === b.toLocaleUpperCase('tr');

// Tek satır: fiyat yerel para (TL) ve Logo birimi başına; dövizli faturada faturadaki döviz fiyatı ayrıca, kur çevrilmez. Birden çok
// hammaddede satır stok koduyla başlar.
export function sonAlisMetni(h: Hammadde, a: LogoSonAlis | undefined, kodlu = false): string {
  const bas = kodlu ? `${h.kod}: ` : '';
  if (a === undefined) return `${bas}Logo'da faturalı alış yok`;
  const fiyat = `${fiyatMetni(a.fiyat, 'TRY')}${a.birim === null ? '' : ` / ${a.birim.toLocaleLowerCase('tr')}`}`;
  if (!birimAyni(h.birim, a.birim)) return `${bas}Logo son alış ${fiyat}; birim tutmuyor (kalem ${h.birim ?? ''}), karşılaştırılmaz`;
  const doviz = a.dovizFiyati === null ? '' : ` · faturada ${fiyatMetni(a.dovizFiyati, a.dovizKodu ?? 'döviz')}`;
  return `${bas}Logo son alış ${fiyat}${doviz} · ${tarihMetni(a.tarih)}${a.cariKodu === null ? '' : ` · ${a.cariKodu}`}`;
}

export function LogoSonAlisSatirlari({ hammaddeler, veri }: { hammaddeler: readonly Hammadde[]; veri: LogoSonAlisCevabi | undefined }) {
  if (veri === undefined || veri.okuma !== 'acik' || hammaddeler.length === 0) return null;
  const bul = new Map(veri.kayitlar.map((k) => [k.stokKodu, k]));
  return (
    <>
      {hammaddeler.map((h) => (
        <span key={h.kod} className="tc-sp-soluk tc-sp-logo-alis"><Simge ad="file" boyut="k" />{sonAlisMetni(h, bul.get(h.kod), hammaddeler.length > 1)}</span>
      ))}
    </>
  );
}
