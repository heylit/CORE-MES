import { useEffect, useRef, useState } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { AYAR_ALANLARI, KAYNAK_KISITLARI, alanYaz, ayarTaslagi, farklar, kaynakAdi, kaynakSecimi, kisitYaz, planYonu, secimAdi } from '../ayarlar/alanlar.ts';
import { KaynakSecimiGrubu } from '../ayarlar/KaynakSecimi.tsx';
import { EtkiBolumu, useEtki } from './etki.tsx';
import { ayarKomutu, type TaslakYazici } from './taslak.ts';
import { Dugme } from '../../../../ortak/arayuz/index.ts';

// Üst şeritteki Yön seçiminin paneli (3304 a): tüm planın yönünü değiştirir, tek dokunuşta etkisini gösterir. Aparat ve ölçü aleti seçimi (3650)
// planı kendiliğinden değiştirmez: seçim taslağa girer, "Etkisini gör" sonucu Uygula ya da Vazgeç ile bırakır. Öteki plan ayarları Planlama
// ayarları sayfasındadır (3561); Kokpit > Araçlar > Ayarlar onu açar.

export interface AyarlarOzellikleri {
  c: PlanlamaCalismasi;
  taslak: TaslakYazici | null;
  yazabilir: boolean;
  kapat: () => void;
  yon: 'ileri' | 'geri';
  // Etki ekrandayken (Uygula ya da Vazgeç bekliyor) true: sayfa ikinci bir birincil düğmeyi kapatır.
  etkiBekliyor?: (bekliyor: boolean) => void;
}

const YON_ADI = { ileri: 'İleriye', geri: 'Teslimden geriye' } as const;

export function Ayarlar({ c, taslak, yazabilir, kapat, yon, etkiBekliyor }: AyarlarOzellikleri) {
  const [t, setT] = useState(() => {
    const t0 = ayarTaslagi(c), a = AYAR_ALANLARI.find((x) => x.k === 'yon');
    return a ? alanYaz(t0, a, yon) : t0;
  });
  // Panel açıldığı andaki yönü yazar: komut taslağa girince plan yeni yönü gösterir, başlık "eski → yeni" kalmalıdır.
  const [oncekiYon] = useState(() => planYonu(c));
  // Aynı şekilde kaynak seçimleri: başlık özeti panel açıldığındaki seçimden bugüne farkı yazar (3650).
  const [oncekiKaynak] = useState(() => ayarTaslagi(c));
  const { durum, dene, uygula, vazgec } = useEtki({ c, taslak, sonuc: () => { kapat(); } });
  const etkide = durum.tur === 'etki';
  useEffect(() => { etkiBekliyor?.(etkide); return () => { etkiBekliyor?.(false); }; }, [etkide, etkiBekliyor]);
  const degisen = farklar(c, t);
  const kilitli = !yazabilir || taslak === null || durum.tur === 'hesap' || durum.tur === 'etki';

  const etkisiniGor = async () => {
    if (degisen.length === 0) return;
    const k = ayarKomutu(c, t, degisen.join('; '));
    if (k !== null) await dene(k);
  };
  // Yön düğmesi tek dokunuşta sonucunu gösterir: kişi "Etkisini gör"ü aramaz, Uygula ya da Vazgeç der.
  const yonDenendi = useRef(false);
  useEffect(() => {
    if (yonDenendi.current || yon === planYonu(c) || !yazabilir || taslak === null) return;
    yonDenendi.current = true;
    void etkisiniGor();
  });

  // Yön panelinde etki ve Uygula en üsttedir.
  const eylem = durum.tur === 'etki' ? (
    <EtkiBolumu ad="Ayarın etkisi" e={durum.e} uygula={() => { void uygula(durum.e); }} vazgec={() => { void vazgec(); }} />
  ) : (
    <section className="tc-pyq-ayar-etki" aria-label="Değişiklik">
      {degisen.length > 0 && <ul className="tc-pyq-ayar-fark">{degisen.map((d) => <li key={d}>{d}</li>)}</ul>}
      {durum.tur === 'hata' && <p className="tc-pyq-ayar-hata" role="alert">{durum.ileti}</p>}
      {yazabilir && (
        <div className="tc-pyq-ayar-dugmeler">
          <Dugme tur="ikincil" simge="play" disabled={kilitli || degisen.length === 0} onClick={() => { void etkisiniGor(); }}>
            {durum.tur === 'hesap' ? 'Hesaplanıyor' : c.plan === null ? 'Kaydet' : 'Etkisini gör'}
          </Dugme>
        </div>
      )}
    </section>
  );
  return (
    <aside className="tc-pyq-ayrinti tc-pyq-ayarlar" aria-label="Yön ve kaynak kısıtları">
      <header>
        <div><b>Yön ve kaynak kısıtları</b><small>{oncekiYon === yon ? `Yön: ${YON_ADI[yon]}` : `${YON_ADI[oncekiYon]} → ${YON_ADI[yon]}`}</small>
          {KAYNAK_KISITLARI.filter((k) => kaynakSecimi(t, k) !== kaynakSecimi(oncekiKaynak, k)).map((k) => (
            <small key={k}>{kaynakAdi(k)}: {secimAdi(kaynakSecimi(oncekiKaynak, k))} → {secimAdi(kaynakSecimi(t, k))}</small>
          ))}</div>
        <button type="button" className="tc-pyq-simge-dugme" aria-label="Yönü kapat" onClick={kapat}><Simge ad="x" boyut="k" /></button>
      </header>
      <section className="tc-pyq-ayar-kaynak" aria-label="Aparat ve ölçü aleti">
        {KAYNAK_KISITLARI.map((k) => (
          <div key={k} className="tc-pyq-ayar-alan">
            <b>{kaynakAdi(k)}</b>
            <KaynakSecimiGrubu kimlik={`pyq-${k}`} kisit={k} deger={kaynakSecimi(t, k)} kilitli={kilitli} sec={(s) => { setT(kisitYaz(t, k, s === 'sert')); }} />
          </div>
        ))}
      </section>
      {eylem}
    </aside>
  );
}
