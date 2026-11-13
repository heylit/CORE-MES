import { useEffect, useMemo, useState } from 'react';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { isTasiOnizle, type IsTasiOnizlemesi } from '../motor/atolye/gonder.ts';
import { onizlemeBitisi, sureYaz, turAdaylari, type KokpitEmri, type KokpitModeli, type TurAdayi } from './kurallar.ts';

// Bir emrin (ya da seçili adımının) tek işi taşıyan hamle seçenekleri. Yerleri istemci seçer, sonucu sunucu önizlemesi verir: önizlemeler
// sırayla istenir, bileşen kapanınca ya da plan değişince kalanlar istenmez. Önizleme okunamazsa seçenek sonuçsuz gösterilir; taşımayı
// sunucu yine denetler.
export interface HamleOzellikleri {
  m: KokpitModeli; e: KokpitEmri; isId: string | null;
  zaman: (t: number) => string;
  // Yazamayan kişide ve komut sürerken null.
  uygula: ((a: TurAdayi, gecBirakir: boolean) => void) | null;
  // Tur: en iyi hamle tek başına durur, ötekiler "Başka çözüm" altında tek dokunuşla onun yerine geçer.
  tek?: boolean;
  // Öne çıkan hamle (tahtada yeri gösterilir); hamle kalmayınca null.
  oneri?: (a: TurAdayi | null) => void;
}

type Sonuc = IsTasiOnizlemesi | 'okunamadi';
const anahtar = (a: TurAdayi): string => `${a.isId}|${a.tezgah}|${String(a.baslangic)}`;

export function Hamleler({ m, e, isId, zaman, uygula, tek = false, oneri }: HamleOzellikleri) {
  const adaylar = useMemo(() => turAdaylari(m, e, isId), [m, e, isId]);
  const [sonuc, setSonuc] = useState<Record<string, Sonuc>>({});
  const [secilen, setSecilen] = useState<string | null>(null);
  useEffect(() => {
    let gecerli = true;
    setSonuc({}); setSecilen(null);
    void (async () => {
      for (const a of adaylar) {
        const r = await isTasiOnizle(a);
        if (!gecerli) return;
        setSonuc((s) => ({ ...s, [anahtar(a)]: r ?? 'okunamadi' }));
      }
    })();
    return () => { gecerli = false; };
  }, [adaylar]);

  const kod = (id: string): string => m.tezgahlar.find((t) => t.id === id)?.kod ?? id;
  const gecerliler = adaylar.filter((a) => { const r = sonuc[anahtar(a)]; return !(r && r !== 'okunamadi' && !r.gecerli); });
  const one = tek ? gecerliler.find((a) => anahtar(a) === secilen) ?? gecerliler[0] ?? null : null;
  const oneAnahtari = one ? anahtar(one) : null;
  useEffect(() => {
    if (!oneri) return undefined;
    oneri(one);
    return () => { oneri(null); };
    // Aday nesnesi her çizimde yenidir; öne çıkan hamle anahtarıyla izlenir.
  }, [oneAnahtari, oneri]);
  if (!gecerliler.length) return <p className="tc-pyq-not">Tek işi taşıyarak daha erkene alınacak boş yer yok; tahtadan elle bakın.</p>;
  const ozet = (a: TurAdayi) => {
    const r = sonuc[anahtar(a)];
    const oz = r && r !== 'okunamadi' ? r : null;
    const bitis = oz ? onizlemeBitisi(m, e, oz.isler.map((y) => ({ isId: y.isId, C: y.C }))) : null;
    const kazanc = bitis !== null && e.bitis !== null ? e.bitis - bitis : null;
    const gec = bitis !== null && e.termin !== null ? bitis - e.termin : null;
    const itilen = oz ? oz.isler.filter((y) => y.tur !== 'tasinan').length : 0;
    return { r, bitis, kazanc, gec, itilen, yer: `${m.isler[a.isId]?.ad ?? ''} → ${kod(a.tezgah)} · ${zaman(a.baslangic).slice(6)}` };
  };
  const satir = (a: TurAdayi) => {
    const { r, bitis, kazanc, gec, itilen, yer } = ozet(a);
    const gecBirakir = gec !== null && gec > 0.01 && e.durum !== 'gec';
    return (
      <li key={anahtar(a)} data-hamle={a.tezgah}>
        <span>
          <b>{yer}</b>
          <small>
            {r === undefined ? 'hesaplanıyor'
              : bitis === null ? 'sonucu sunucu taşırken denetler'
                : `biter ${zaman(bitis).slice(6)}${kazanc !== null && kazanc > 0.01 ? ` · ${sureYaz(kazanc)} erken` : ''}${gec === null ? '' : gec > 0.01 ? ` · yine ${sureYaz(gec)} geç` : ' · termine yetişir'}${itilen ? ` · aynı emrin ${String(itilen)} adımı kayar` : ''}`}
          </small>
        </span>
        <Dugme tur={gec !== null && gec <= 0.01 ? 'birincil' : 'ikincil'} simge="check" disabled={!uygula || r === undefined} onClick={() => { uygula?.(a, gecBirakir); }}>{tek ? (gecBirakir ? 'Yine de uygula' : 'Uygula, sıradaki') : 'Uygula'}</Dugme>
      </li>
    );
  };
  if (!one) return <ul className="tc-pyq-hamleler">{gecerliler.map(satir)}</ul>;
  const baska = gecerliler.filter((a) => a !== one);
  return (
    <>
      <ul className="tc-pyq-hamleler" data-tek="">{satir(one)}</ul>
      {baska.length > 0 && (
        <div className="tc-pyq-baska" role="group" aria-label="Başka çözüm">
          <small>Başka çözüm</small>
          {baska.map((a) => {
            const { bitis, yer } = ozet(a);
            return <button type="button" key={anahtar(a)} data-baska={a.tezgah} onClick={() => { setSecilen(anahtar(a)); }}><b>{yer}</b>{bitis !== null && <small>biter {zaman(bitis).slice(6)}</small>}</button>;
          })}
        </div>
      )}
    </>
  );
}
