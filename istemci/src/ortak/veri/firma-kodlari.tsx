import { useQuery } from '@tanstack/react-query';
import type { FirmaKodlariCevabi, FirmaKodu } from '#paylasilan/sozlesme/ayarlar.ts';
import { Secim } from '../arayuz/index.ts';
import { api } from './api.ts';
import { anahtarlar } from './anahtarlar.ts';

// 3399 a: kendi firmalarımızın kodu (Sistem Ayarları > Firma kodları). Liste seyrek değişir; her form açılışında sorulmasın.
const TAZE_SURE = 5 * 60 * 1000;

export interface FirmaKodlari {
  readonly kodlar: readonly FirmaKodu[];
  // Varsayılan kod; liste boşsa null. Yeni kaydın seçimi bununla dolu gelir.
  readonly varsayilan: string | null;
  readonly yuklendi: boolean;
}

export function useFirmaKodlari(): FirmaKodlari {
  const sorgu = useQuery({ queryKey: anahtarlar.firmaKodlari, queryFn: () => api.get<FirmaKodlariCevabi>('/firma-kodlari'), staleTime: TAZE_SURE });
  const kodlar = sorgu.data?.firmaKodlari ?? [];
  return { kodlar, varsayilan: kodlar.find((k) => k.varsayilan)?.kod ?? null, yuklendi: sorgu.data !== undefined };
}

// Kayıtlı belgede kod kilitlidir. Kalıpta {FIRMA} yoksa numarada kod geçmez; o zaman "bu kodla verildi" yanlış olur.
export function kayitliKodIpucu(belge: string, no: string, kod: string | null): string {
  return kod !== null && no.split('-').includes(kod) ? `${belge} numarası bu kodla verildi.` : 'Firma kodu kayıttan sonra değişmez.';
}

// Seçenekler aktif kodlardır; kaydın kendi kodu pasife alınmışsa yine görünür (kayıt onu taşımaya devam eder).
// Liste boşsa alan çizilmez: firma kodu kullanmayan kurulumda form değişmez.
export function FirmaKoduSecimi({
  deger, degistir, etiket = 'Firma kodu', kilitli = false, ipucu, bosSecenek = 'Seçilmedi',
}: {
  deger: string | null;
  degistir: (kod: string | null) => void;
  etiket?: string;
  kilitli?: boolean;
  ipucu?: string;
  bosSecenek?: string;
}) {
  const { kodlar } = useFirmaKodlari();
  if (kodlar.length === 0) return null;
  const secenekler = kodlar
    .filter((k) => k.aktif || k.kod === deger)
    .map((k) => ({ deger: k.kod, baslik: `${k.kod} · ${k.ad}${k.aktif ? '' : ' (pasif)'}` }));
  return (
    <Secim
      etiket={etiket} secenekler={secenekler} bosSecenek={bosSecenek} value={deger ?? ''} disabled={kilitli}
      {...(ipucu === undefined ? {} : { ipucu })}
      onChange={(olay) => { degistir(olay.target.value === '' ? null : olay.target.value); }}
    />
  );
}
