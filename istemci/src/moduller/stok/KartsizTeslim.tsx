import { useState } from 'react';
import type { KartsizTeslimAyrintisi, RefakatPartisiCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, Pencere, useBildirim } from '../../ortak/arayuz/index.ts';
import { ApiHatasi, api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useDogrudanBasim } from '../etiket-merkezi/disari.ts';

// 3337 (3337-2 a): emre giden lotlu hammadde kartsız gitmez. Sunucu gönderimi kartın emri ve lotuyla reddeder; pencere kartı açar,
// bu cihazın varsayılan yazıcısına basar ve gönderimi kartla yineler. Varsayılan yazıcı yoksa kart Etiket Merkezi'nde bekler.
export type KartsizBilgi = { uretimEmriId: number; partiId: number; malzemeId: number };
export function kartsizBilgisi(hata: unknown): KartsizBilgi | null {
  if (!(hata instanceof ApiHatasi) || hata.govde.kod !== 'DOGRULAMA') return null;
  const k = (hata.govde as { ayrinti?: Partial<KartsizTeslimAyrintisi> }).ayrinti?.kartsiz;
  return k && typeof k.uretimEmriId === 'number' && typeof k.partiId === 'number' && typeof k.malzemeId === 'number' ? k : null;
}

export function KartaDonusturPenceresi({ bilgi, yukleniyor, gonder, vazgec }: {
  bilgi: KartsizBilgi | null; yukleniyor: boolean; gonder: (refakatPartisiId: number, partiId: number) => void; vazgec: () => void;
}) {
  const basim = useDogrudanBasim('refakat-partisi');
  const { bildir } = useBildirim();
  const [aciliyor, setAciliyor] = useState(false);
  const donustur = async () => {
    if (bilgi === null) return;
    setAciliyor(true);
    try {
      const c = await api.post<RefakatPartisiCevabi>('/stok/refakat-partileri/ac', { uretimEmriId: bilgi.uretimEmriId, partiId: bilgi.partiId }, { istekKimligi: yeniIstekKimligi() });
      if (basim.yazici !== null) basim.bas([c.refakat.id]);
      else bildir('bilgi', `Kart ${c.refakat.etiket} açıldı. Bu cihazda varsayılan yazıcı yok; kartı Etiket Merkezi'nden basın.`);
      gonder(c.refakat.id, bilgi.partiId);
    } catch (h) {
      bildir('hata', hataIletisi(h, 'Refakat kartı açılamadı.'));
    } finally {
      setAciliyor(false);
    }
  };
  return (
    <Pencere acik={bilgi !== null} kapat={vazgec} baslik="Refakat kartıyla gider"
      alt={(
        <>
          <Dugme onClick={vazgec} disabled={aciliyor || yukleniyor} data-ilk-odak>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="printer" onClick={() => { void donustur(); }} yukleniyor={aciliyor || yukleniyor}>Refakat kartına dönüştür</Dugme>
        </>
      )}>
      <p className="tc-stok-not">
        Lot etiketi depoda kalır; emre giden malzeme refakat kartıyla gider. Kart açılır, {basim.yazici !== null ? `${basim.yazici.yaziciAd} yazıcısına basılır` : 'Etiket Merkezi\'nde basılmayı bekler'} ve teslim kartla yapılır.
      </p>
    </Pencere>
  );
}
