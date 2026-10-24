import { useState } from 'react';
import { CokSatir, OnayPenceresi, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { kilitliMi } from '../kurallar.ts';
import { useKmKomutu } from '../veri.ts';
import type { KmKayit, KmKoleksiyonu } from '../tipler.ts';
import type { KmYetkisi } from '../yetki.ts';

export type KilitKarari = 'ac' | 'yasak' | 'sor';

// Tamamlanmış kayıt (sonuçlu muayene, kararlı lot) düzenlenmeden önce kilidi gerekçeyle açılır; gerekçe değişiklik izine yazılır.
export function kilitKarari(kol: KmKoleksiyonu, kayit: KmKayit | null | undefined, yetki: KmYetkisi): KilitKarari {
  if (!kayit || !kilitliMi(kol, kayit)) return 'ac';
  return yetki.kilitAc ? 'sor' : 'yasak';
}

export const KILIT_YASAK = 'Bu kayıt tamamlanmış ve kilitli. Değiştirmek için kalite mühendisi kilidi açmalı.';

export function KilitPenceresi({ yetki, kol, kimlik, no, devam, vazgec }: { yetki: KmYetkisi; kol: KmKoleksiyonu; kimlik: string; no: string; devam: () => void; vazgec: () => void }) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  const [gerekce, gerekceYaz] = useState('');
  const [hata, hataYaz] = useState<string | undefined>();
  return (
    <OnayPenceresi
      acik baslik="Kilitli kayıt" onayMetni="Kilidi aç"
      onayla={() => {
        const g = gerekce.trim();
        if (g.length < 5) { hataYaz('Gerekçe en az 5 karakter olmalı.'); return; }
        void komut.izYaz({ islem: 'kilit açma', col: kol, id: kimlik, no, gerekce: g }).catch(() => { bildir('hata', 'Değişiklik izine yazılamadı.'); });
        devam();
      }}
      vazgec={vazgec}
    >
      <p><b>{no}</b> tamamlanmış bir kayıt. Değişiklik yapmak için gerekçe girin; gerekçe değişiklik izine yazılır.</p>
      <CokSatir etiket="Gerekçe" required rows={3} value={gerekce} hata={hata} onChange={(e) => { gerekceYaz(e.target.value); hataYaz(undefined); }} />
    </OnayPenceresi>
  );
}
