import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Ayrinti } from '#paylasilan/sozlesme/saglik.ts';
import { Pencere, Simge } from '../../ortak/arayuz/index.ts';
import type { UstEylem, UstEylemOzellikleri } from '../../ortak/rota/ust-eylemler.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { SistemDurumu } from './SistemDurumu.tsx';
import './sistem-durumu.css';

// Uyarılar arka planda oluşur (yedek, iş, disk); yönetici sayfa açmadan görsün diye çubuk kendisi yoklar.
const UYARI_YOKLAMA_MS = 60_000;

function SistemDugmesi({ acmaIstegi = 0 }: UstEylemOzellikleri) {
  const [acik, acikYaz] = useState(false);
  useEffect(() => { if (acmaIstegi > 0) acikYaz(true); }, [acmaIstegi]);
  const ayrinti = useQuery({
    queryKey: anahtarlar.sistemAyrinti,
    queryFn: () => api.get<Ayrinti>('/saglik/ayrinti'),
    refetchInterval: UYARI_YOKLAMA_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const sayi = ayrinti.data?.uyarilar.length ?? 0;
  const etiket = sayi > 0 ? `Sistem durumu, ${sayi} uyarı` : 'Sistem durumu';
  return (
    <>
      <button type="button" className="tc-kabuk-tema tc-sistem-dugme" onClick={() => acikYaz(true)} aria-haspopup="dialog" aria-label={etiket} title={etiket}>
        <Simge ad="cpu" />
        {sayi > 0 && <span className="tc-sistem-sayac" aria-hidden="true">{sayi > 99 ? '99+' : sayi}</span>}
      </button>
      {acik && (
        <Pencere acik kapat={() => acikYaz(false)} baslik="Sistem durumu" tur="yan">
          <SistemDurumu />
        </Pencere>
      )}
    </>
  );
}

// Ayrı sayfa yok (sistem durumu 15.10.2026'da panodan kalktı); ayrıntıyı okuyan çubuktan açar, yeni işlem gerekmez.
// Tablette çubukta yer yok: orada Hesap menüsünden açılır.
export const ustEylemler: readonly UstEylem[] = [{
  anahtar: 'sistem-durumu', sira: 70, islem: 'saglik.ayrinti-oku', hesapMaddesi: { baslik: 'Sistem durumu', simge: 'cpu' }, dugme: SistemDugmesi,
}];
