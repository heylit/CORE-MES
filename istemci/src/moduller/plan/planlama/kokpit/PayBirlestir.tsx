import { useEffect, useRef, useState } from 'react';
import type { TaslakKomutu } from '#paylasilan/sozlesme/planlama.ts';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import { adimKimligi, adimPaylari, payAdi, payBirlesmesi, type KokpitModeli } from './kurallar.ts';

// 3751: bölünmüş adımın paylarını birleştirme alt sayfası. Telefonda sürükleme ve sağ tık yoktur; pay kartındaki "Birleştir" bunu açar. Hangi payın
// birleşeceği seçilir, kardeşleri sonuç adediyle listelenir; birine basınca onay bölümü açılır (tahtadaki onay çubuğunun aynısı). Uygula yalnız
// taslağa yazar; plan "Canlıya al" ile değişir. Esc önce onayı, sonra sayfayı kapatır.
export interface PayBirlestirOzellikleri {
  m: Pick<KokpitModeli, 'isler' | 'tezgahlar' | 'emirler'>;
  payId: string;
  // Yazamayan kişide null; true dönerse sayfa kapanır.
  uygula: ((k: TaslakKomutu) => Promise<boolean>) | null;
  kapat: () => void;
}

export function PayBirlestir({ m, payId, uygula, kapat }: PayBirlestirOzellikleri) {
  const x = m.isler[payId];
  const paylar = x ? adimPaylari(m, adimKimligi(x)) : [];
  const [kaynak, setKaynak] = useState(payId);
  const [hedef, setHedef] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const kok = useRef<HTMLElement>(null);
  useEffect(() => { kok.current?.scrollIntoView?.({ block: 'nearest' }); }, []);
  useEffect(() => {
    const tus = (ev: KeyboardEvent): void => {
      if (ev.key !== 'Escape') return;
      ev.stopPropagation();
      if (hedef !== null) setHedef(null); else kapat();
    };
    document.addEventListener('keydown', tus, true);
    return () => { document.removeEventListener('keydown', tus, true); };
  }, [hedef, kapat]);
  const adi = x ? m.emirler.flatMap((e) => e.adimlar).find((a) => a.id === adimKimligi(x))?.ad ?? x.ad : '';
  const k = paylar.some((y) => y.id === kaynak) ? kaynak : paylar[0]?.id ?? payId;
  const kardesler = paylar.filter((y) => y.id !== k);
  const sonuc = hedef === null ? null : payBirlesmesi(m, k, hedef);
  const onayla = async (): Promise<void> => {
    if (!sonuc?.komut || !uygula) return;
    setMesgul(true);
    const tamam = await uygula(sonuc.komut);
    setMesgul(false);
    if (tamam) kapat();
  };
  return (
    <aside ref={kok} className="tc-pyq-ayrinti tc-pyq-ayarlar tc-pyq-pay-birlestir" aria-label="Payları birleştir">
      <header>
        <div><b>Payları birleştir{adi ? ` · ${adi}` : ''}</b><small>{paylar.length} pay</small></div>
        <button type="button" className="tc-pyq-simge-dugme" aria-label="Birleştirmeyi kapat" onClick={kapat}><Simge ad="x" boyut="k" /></button>
      </header>
      {paylar.length < 2 ? <p className="tc-pyq-not">Adım artık bölünmüş değil; plan değişmiş olabilir.</p> : (
        <>
          <p className="tc-pyq-not">Adetler toplanır, hedef payın tezgâhı kalır; yerini sistem seçer. Tek pay kalırsa bölme kalkar.</p>
          <div className="tc-pyq-aa-cipler" role="group" aria-label="Birleşecek pay">
            {paylar.map((y) => <button type="button" key={y.id} data-birles-kaynak={y.id} aria-pressed={y.id === k} disabled={mesgul} onClick={() => { setKaynak(y.id); setHedef(null); }}>{payAdi(m, y)}</button>)}
          </div>
          <ul className="tc-pyq-pay-birlestir-liste" aria-label="Şununla birleştir">
            {kardesler.map((y) => {
              const r = payBirlesmesi(m, k, y.id);
              return (
                <li key={y.id}>
                  <button type="button" data-birles-ile={y.id} aria-pressed={hedef === y.id} disabled={mesgul || r.hata !== null} onClick={() => { setHedef(y.id); }}>
                    <Simge ad="fit" boyut="k" /><span>{payAdi(m, y)}<small>{r.hata ?? `birleşince ${String(r.adet)} adet`}</small></span>
                  </button>
                </li>
              );
            })}
            {kardesler.length > 1 && (() => {
              const r = payBirlesmesi(m, k, 'hepsi');
              return (
                <li>
                  <button type="button" data-birles-hepsi="" aria-pressed={hedef === 'hepsi'} disabled={mesgul || r.hata !== null} onClick={() => { setHedef('hepsi'); }}>
                    <Simge ad="fit" boyut="k" /><span>Bütün payları birleştir<small>{r.hata ?? `${String(r.adet)} adet, tek pay`}</small></span>
                  </button>
                </li>
              );
            })()}
          </ul>
          {sonuc && (
            <div className="tc-pyq-ayar-dugmeler" role="group" aria-label="Birleştirmeyi onayla" data-birles-onayi="">
              <p className="tc-pyq-not" role="status"><b className="tc-pyq-onay-tur" data-onay-tur="birlestir">Birleştir</b> {sonuc.hata ?? sonuc.cumle}</p>
              <small className="tc-pyq-not">Uygula taslağınıza yazar; plan "Canlıya al" ile değişir, taslakta Geri ile alınır.</small>
              <Dugme onClick={() => { setHedef(null); }} disabled={mesgul}>Vazgeç</Dugme>
              <Dugme tur="birincil" simge="check" disabled={!uygula || sonuc.komut === null} yukleniyor={mesgul} onClick={() => { void onayla(); }}>Uygula</Dugme>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
