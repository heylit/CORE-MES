import { useState } from 'react';
import type { VardiyaGovdesi } from '#paylasilan/sozlesme/vardiya.ts';
import { Dugme, DurumKutusu, OnayPenceresi, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { useVardiyaYaz } from './komut.ts';

// Gece yarısı 24:00 yazılamaz: bitişi başlangıçtan önce olan vardiya sunucuda gece yarısını geçen sayılır.
export const ORNEK_DUZEN: readonly VardiyaGovdesi[] = [
  { ad: 'Gündüz', baslangic: '08:00', bitis: '16:00', molalar: [{ baslangic: '12:00', bitis: '12:30' }] },
  { ad: 'Akşam', baslangic: '16:00', bitis: '00:00', molalar: [{ baslangic: '20:00', bitis: '20:30' }] },
];

// Yeni kurulumda vardiya yoktur ve kurulum veri yazmaz; yazma yetkisi olan ilkini kendisi ekler, olmayan yöneticisini bekler.
export function BosVardiya() {
  const oturum = useOturum();
  const yaz = oturum.data?.islemler.includes('vardiya.yaz') ?? false;
  const y = useVardiyaYaz();
  const { bildir } = useBildirim();
  const [onay, onayYaz] = useState(false);

  // İki vardiya sırayla eklenir, her biri kendi istek kimliğiyle; biri düşerse sonrakine geçilmez ve eklenemeyen ad bildirilir.
  const orneginiEkle = async () => {
    let eklenen = 0;
    try {
      for (const govde of ORNEK_DUZEN) {
        await y.mutateAsync({ yol: '/vardiyalar', tekrar: true, govde });
        eklenen += 1;
      }
    } catch {
      const eklenemeyen = ORNEK_DUZEN.slice(eklenen).map((v) => v.ad).join(', ');
      bildir('hata', `Örnek düzen yarım kaldı: ${eklenemeyen} eklenemedi. Vardiyayı elle ekle.`);
    } finally {
      onayYaz(false);
    }
  };

  // Yetki gelmeden yönetici metni göstermek yazma yetkisi olana yanlış mesaj verir.
  if (oturum.isPending) return <DurumKutusu durum="yukleniyor" />;
  return (
    <section className="tc-vr-panel tc-vr-bos" aria-label="Vardiya tanımlı değil">
      <span className="tc-vr-bos-simge"><Simge ad="clock" boyut="b" /></span>
      {yaz ? (
        <>
          <h3>Vardiya tanımlı değil</h3>
          <p className="tc-vr-ipucu">Planlama ve mesai vardiya saatlerinden hesaplanır. İlk vardiyayı ekle ya da iki vardiyalı örnek düzenle başla; saatleri ve molaları sonra değiştirebilirsin.</p>
          <div className="tc-vr-satir">
            <Dugme tur="birincil" simge="plus" disabled={y.isPending}
              onClick={() => y.mutate({ yol: '/vardiyalar', tekrar: true, govde: { ad: 'Vardiya 1', baslangic: '08:00', bitis: '16:00', molalar: [] } })}>
              İlk vardiyayı ekle
            </Dugme>
            <Dugme simge="layers" disabled={y.isPending} onClick={() => onayYaz(true)}>İki vardiyalı örnek düzen</Dugme>
          </div>
          <OnayPenceresi acik={onay} baslik="Örnek düzeni ekle" onayMetni="Ekle" yukleniyor={y.isPending} onayla={() => { void orneginiEkle(); }} vazgec={() => onayYaz(false)}>
            <p>İki vardiya eklenir: Gündüz 08:00–16:00 (mola 12:00–12:30) ve Akşam 16:00–00:00 (mola 20:00–20:30). Sonradan değiştirilebilir.</p>
          </OnayPenceresi>
        </>
      ) : (
        <p>Vardiya tanımlı değil; yöneticiniz tanımlayınca burada görünür.</p>
      )}
    </section>
  );
}
