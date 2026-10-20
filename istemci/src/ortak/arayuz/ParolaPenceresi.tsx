import { useState } from 'react';
import type { KendiParolaGovdesi } from '#paylasilan/sozlesme/oturum.ts';
import { api } from '../veri/api.ts';
import { useForm } from '../veri/form.ts';
import { Dugme } from './Dugme.tsx';
import { DurumKutusu } from './DurumKutusu.tsx';
import { Girdi } from './Alan.tsx';
import { Pencere } from './Pencere.tsx';

const FORM_KIMLIGI = 'tc-parola-formu';

// Oturumu açık kişinin kendi parolası; sayfa yetkisi istemez, her kullanıcının kabuğundadır. Yanlış eski parolanın
// beklemesi 401 döner ama oturum bitmemiştir (oturumBitirmez). Sonuç pencerede kalır: kabuk bildirim sağlayıcısı istemez.
export function ParolaPenceresi({ kapat }: { kapat: () => void }) {
  const [degisti, degistiYaz] = useState(false);
  const form = useForm<KendiParolaGovdesi>({
    ilk: { eskiParola: '', yeniParola: '' },
    dogrula: (d) => ({
      ...(d.eskiParola === '' ? { eskiParola: 'Eski parola zorunlu.' } : {}),
      ...(d.yeniParola === '' ? { yeniParola: 'Yeni parola zorunlu.' } : {}),
    }),
    kaydet: (d) => api.post<unknown>('/hesabim/parola-degistir', d, { oturumBitirmez: true }),
    basarili: () => { degistiYaz(true); },
    hataIletisi: 'Parola değiştirilemedi.',
  });

  return (
    <Pencere
      acik
      kapat={kapat}
      baslik="Parolamı değiştir"
      alt={degisti
        ? <Dugme tur="birincil" onClick={kapat}>Kapat</Dugme>
        : (
          <>
            <Dugme onClick={kapat} disabled={form.gonderiliyor}>Vazgeç</Dugme>
            <Dugme tur="birincil" type="submit" form={FORM_KIMLIGI} yukleniyor={form.gonderiliyor}>Parolayı değiştir</Dugme>
          </>
        )}
    >
      {degisti
        ? <p className="tc-pencere-ileti" role="status">Parola değiştirildi. Öbür cihazlardaki oturumlarınız kapatıldı.</p>
        : (
          <form id={FORM_KIMLIGI} className="tc-form" onSubmit={form.gonder} noValidate>
            {form.genelHata !== null && <div className="tc-form-tam"><DurumKutusu durum="hata" mesaj={form.genelHata} /></div>}
            <div className="tc-form-tam">
              <Girdi etiket="Eski parola" type="password" required autoComplete="current-password" {...form.alan('eskiParola')} />
            </div>
            <div className="tc-form-tam">
              <Girdi etiket="Yeni parola" type="password" required autoComplete="new-password" {...form.alan('yeniParola')} />
            </div>
          </form>
        )}
    </Pencere>
  );
}
