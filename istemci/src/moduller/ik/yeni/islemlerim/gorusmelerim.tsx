import { useState } from 'react';
import { Dugme, Kart, Pencere, Rozet, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { tarih } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import type { Aday, Gorusme } from '../tipler.ts';
import { gorusmecininGorusmeleri, sayiMetni } from './kurallar.ts';
import { BilgiListesi, bugun, KisaListe } from './parcalar.tsx';

const KISA_LISTE = 5;
const DURUM_TONU: Record<string, RozetTonu> = { Planlandı: 'bilgi', Tamamlandı: 'tamam', 'Aday gelmedi': 'uyari' };
const adayAdi = (a: Aday | undefined): string => (a ? `${a.ad ?? ''} ${a.soyad ?? ''}`.trim() || 'İsimsiz aday' : 'Aday');
const zamanMetni = (g: Gorusme): string => `${tarih(g.tarih)}${g.saat ? `, ${g.saat}` : ''}`;

// Görüşmelerim (1844 IK-9 a): görüşmeci kendi görüşmelerini ve adayın değerlendirmeye yeten bilgilerini görür. Sunucu adayın iletişim,
// ücret ve teklif alanlarını göndermez; değerlendirme İK'nın işe alım ekranından yazılır. Görüşmesi olmayanda kart hiç çıkmaz.
export function GorusmelerimKarti({ o, personel }: { o: IkEkranOzellikleri; personel: string }) {
  const [secili, seciliYaz] = useState<Gorusme | null>(null);
  const gorusmeler = gorusmecininGorusmeleri(o.depo.tur('intv'), personel, bugun());
  if (!gorusmeler.length) return null;
  const aday = (g: Gorusme | null) => o.depo.tur('cand').find((a) => a.id === g?.candId);
  const pozisyon = (a: Aday | undefined) => o.depo.tur('job').find((p) => p.id === a?.jobId)?.baslik;
  const a = aday(secili);

  return (
    <>
      <Kart baslik="Görüşmelerim">
        <KisaListe satirlar={gorusmeler.slice(0, KISA_LISTE).map((g) => {
          const x = aday(g);
          return {
            anahtar: g.id,
            baslik: adayAdi(x),
            alt: [pozisyon(x), g.tur, zamanMetni(g)].filter(Boolean).join(', '),
            sag: (
              <span className="tc-ikm-gorusme-sag">
                <Rozet ton={DURUM_TONU[g.durum ?? 'Planlandı'] ?? 'pasif'}>{g.durum ?? 'Planlandı'}</Rozet>
                <Dugme simge="eye" onClick={() => { seciliYaz(g); }} aria-label={`${adayAdi(x)} görüşmesinin ayrıntısı`}>Ayrıntı</Dugme>
              </span>
            ),
          };
        })} />
        {gorusmeler.length > KISA_LISTE && <p className="tc-ikm-kucuk tc-ikm-soluk">{`Son ${KISA_LISTE} görüşme gösteriliyor; toplam ${gorusmeler.length}.`}</p>}
      </Kart>
      <Pencere acik={secili !== null} kapat={() => { seciliYaz(null); }} baslik={`Görüşme: ${adayAdi(a)}`} tur="yan">
        {secili && (
          <>
            <BilgiListesi satirlar={[
              ['Pozisyon', pozisyon(a)], ['Görüşme', secili.tur], ['Zaman', zamanMetni(secili)],
              ['Şekil', [secili.sekil, secili.yer].filter(Boolean).join(', ')], ['Durum', secili.durum ?? 'Planlandı'],
            ]} />
            <h3 className="tc-ikm-ara-baslik">Aday</h3>
            <BilgiListesi satirlar={[
              ['Aşama', a?.asama], ['Mevcut şirket', a?.mevcutSirket], ['Mevcut pozisyon', a?.mevcutPozisyon],
              ['Tecrübe', a?.tecrubeYil === undefined ? null : `${sayiMetni(a.tecrubeYil)} yıl`], ['Eğitim', [a?.egitim, a?.okul].filter(Boolean).join(', ')],
              ['Yabancı dil', a?.yabanciDil], ['Özgeçmiş', a?.cvLink],
            ]} />
            {a?.ozet && <p className="tc-ikm-kucuk tc-ikm-gorusme-ozet">{a.ozet}</p>}
          </>
        )}
      </Pencere>
    </>
  );
}
