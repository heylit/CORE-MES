import { useState } from 'react';
import { CokSatir, OnayPenceresi, Secim, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import type { FormKaydi } from '../tipler.ts';
import { useKmKomutu } from '../veri.ts';
import type { KmRolu } from '../yetki.ts';

const KARARLAR = ['Onayla', 'Düzeltme için iade et'] as const;

// Uygulamada Bugün'deki "Onayla" form listesine gitmeden onay penceresini açar (Soru 275); karar ve not Formlar'daki onayla aynıdır.
// Onaylayan ve onay günü sunucuda oturumdaki kişi ve tesisin günüdür; istemci göndermez.
export function FormOnayi({ kayit, rol, kapat }: { kayit: FormKaydi; rol: KmRolu; kapat: () => void }) {
  const komut = useKmKomutu(rol);
  const { bildir } = useBildirim();
  const [karar, kararYaz] = useState<string>(KARARLAR[0]);
  const [not, notYaz] = useState('');
  const [mesgul, mesgulYaz] = useState(false);

  const kaydet = async () => {
    const { onaylayan: _o, onayTarih: _t, ...govde } = kayit as FormKaydi & { onayTarih?: string };
    const onay = karar === KARARLAR[0];
    mesgulYaz(true);
    try {
      await komut.kaydet('frm', { ...govde, onayNot: not, durum: onay ? 'Onaylandı' : 'Taslak' });
      bildir('tamam', onay ? 'Form onaylandı' : 'Form düzeltme için iade edildi');
      kapat();
    } catch (e) {
      bildir('hata', hataIletisi(e, 'Form onaylanamadı.'));
    } finally {
      mesgulYaz(false);
    }
  };

  return (
    <OnayPenceresi acik baslik={`${kayit.kod ?? ''} onayı`} onayMetni="Kaydet" yukleniyor={mesgul} onayla={() => { void kaydet(); }} vazgec={kapat}>
      <div className="tc-km-form">
        <Secim etiket="Karar" value={karar} onChange={(o) => { kararYaz(o.target.value); }} secenekler={KARARLAR.map((k) => ({ deger: k, baslik: k }))} />
        <CokSatir etiket="Not" rows={2} value={not} onChange={(o) => { notYaz(o.target.value); }} />
      </div>
    </OnayPenceresi>
  );
}
