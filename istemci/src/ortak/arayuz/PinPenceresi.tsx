import { useState } from 'react';
import type { KendiPinGovdesi } from '#paylasilan/sozlesme/oturum.ts';
import { api } from '../veri/api.ts';
import { useForm } from '../veri/form.ts';
import { Dugme } from './Dugme.tsx';
import { DurumKutusu } from './DurumKutusu.tsx';
import { Girdi } from './Alan.tsx';
import { Pencere } from './Pencere.tsx';

const FORM_KIMLIGI = 'tc-pin-formu';

// Oturumu açık kişinin kendi PIN'i; eski olarak geçerli PIN ya da parola girilir (PIN'ini unutan parolasıyla değiştirir).
// Bekleme 401 döner ama oturum bitmemiştir (oturumBitirmez).
export function PinPenceresi({ kapat }: { kapat: () => void }) {
  const [degisti, degistiYaz] = useState(false);
  // Tekrar alanı yalnız ekrandadır: yazım hatası kişiyi terminalin dışında bırakmasın; sunucuya gitmez.
  const form = useForm<KendiPinGovdesi & { yeniTekrar: string }>({
    ilk: { eski: '', yeniPin: '', yeniTekrar: '' },
    dogrula: (d) => ({
      ...(d.eski === '' ? { eski: 'Eski PIN ya da parola zorunlu.' } : {}),
      ...(d.yeniPin === '' ? { yeniPin: 'Yeni PIN zorunlu.' }
        : d.yeniPin === d.eski ? { yeniPin: 'Yeni PIN eskisiyle aynı olamaz.' } : {}),
      ...(d.yeniPin !== '' && d.yeniTekrar !== d.yeniPin ? { yeniTekrar: 'Yeni PIN ile tekrarı aynı değil.' } : {}),
    }),
    kaydet: ({ eski, yeniPin }) => api.post<unknown>('/hesabim/pin-degistir', { eski, yeniPin }, { oturumBitirmez: true }),
    basarili: () => { degistiYaz(true); },
    hataIletisi: 'PIN değiştirilemedi.',
  });

  return (
    <Pencere
      acik
      kapat={kapat}
      baslik="PIN'imi değiştir"
      alt={degisti
        ? <Dugme tur="birincil" onClick={kapat}>Kapat</Dugme>
        : (
          <>
            <Dugme onClick={kapat} disabled={form.gonderiliyor}>Vazgeç</Dugme>
            <Dugme tur="birincil" type="submit" form={FORM_KIMLIGI} yukleniyor={form.gonderiliyor}>PIN'i değiştir</Dugme>
          </>
        )}
    >
      {degisti
        ? <p className="tc-pencere-ileti" role="status">PIN değiştirildi. Öbür cihazlardaki oturumlarınız kapatıldı.</p>
        : (
          <form id={FORM_KIMLIGI} className="tc-form" onSubmit={form.gonder} noValidate>
            {form.genelHata !== null && <div className="tc-form-tam"><DurumKutusu durum="hata" mesaj={form.genelHata} /></div>}
            <div className="tc-form-tam">
              <Girdi etiket="Eski PIN ya da parola" type="password" required autoComplete="current-password" {...form.alan('eski')} />
            </div>
            <div className="tc-form-tam">
              <Girdi
                etiket="Yeni PIN (6 rakam)" type="password" inputMode="numeric" maxLength={6} required autoComplete="new-password"
                {...form.alan('yeniPin')}
              />
            </div>
            <div className="tc-form-tam">
              <Girdi
                etiket="Yeni PIN (tekrar)" type="password" inputMode="numeric" maxLength={6} required autoComplete="new-password"
                {...form.alan('yeniTekrar')}
              />
            </div>
          </form>
        )}
    </Pencere>
  );
}
