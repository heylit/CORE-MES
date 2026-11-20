import { useEffect, useState } from 'react';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { sureYaz, type KokpitEmri, type KokpitModeli } from './kurallar.ts';
import { useElleYer, type YerlestirmeHedefi } from './Yerlestirme.tsx';

// Yerleşmeyen adımı elle yerleştirme (3488 a): adımın uygun tezgâhlarındaki boş yerler sunucu önizlemesiyle bulunur, tahtada yanar ve
// burada listelenir (telefonda tahta yerine bu liste). Yer seçilince sonucu (bitiş, termine göre) yazılır; "Yerleştir ve kilitle" adımı o
// yerde kilitleyen taşıma komutunu taslağa yazar. Sığan yer yoksa "Böl" adedi tezgâhlara paylaştırır.

export interface ElleYerlestirOzellikleri {
  m: KokpitModeli;
  e: KokpitEmri;
  isId: string;
  ad: string;
  zaman: (t: number) => string;
  surum: number | null;
  // Tahtaya yer işaretleri (Kokpit'in yerleştirme hedefi); kapanınca null verilir.
  hedef: (h: YerlestirmeHedefi | null) => void;
  // Taşıma komutu (Kokpit tasiDene: önizler, emri geç bırakıyorsa onay sorar, taslağa yazar).
  tasi: (isId: string, tezgah: string, baslangic: number) => void;
  // Elle böl panelini açar; yazamayan kişide null.
  bol: ((isId: string) => void) | null;
  kapat: () => void;
}

export function ElleYerlestir({ m, e, isId, ad, zaman, surum, hedef, tasi, bol, kapat }: ElleYerlestirOzellikleri) {
  const { yerler, gerekli } = useElleYer(m, e, isId, surum);
  const [secilen, setSecilen] = useState<string | null>(null);
  const kod = (id: string): string => m.tezgahlar.find((t) => t.id === id)?.kod ?? id;
  const yerlerAnahtari = JSON.stringify(yerler);
  useEffect(() => {
    if (yerler === null) { hedef(null); return undefined; }
    hedef({ emirId: e.id, adimId: isId, tezgahlar: yerler.map((b) => b.tezgah), yerler, yerlestir: setSecilen, fiil: 'tasi' });
    return () => { hedef(null); };
    // Yer listesi anahtarda toplanır; her hesapta yeni dizidir.
  }, [yerlerAnahtari, isId, e.id, hedef]);
  useEffect(() => {
    const f = (ev: KeyboardEvent): void => { if (ev.key === 'Escape') kapat(); };
    window.addEventListener('keydown', f);
    return () => { window.removeEventListener('keydown', f); };
  }, [kapat]);
  // Bitiş başka güne düşüyorsa gün adıyla yazılır ("→ Sal 00:00").
  const bitisYaz = (s: number, c: number): string => (zaman(s).slice(0, -6) === zaman(c).slice(0, -6) ? zaman(c).slice(-5) : zaman(c).slice(6));
  const yer = secilen === null ? undefined : yerler?.find((b) => b.tezgah === secilen);
  const termin = (b: number | null): string => {
    if (b === null || e.termin === null) return '';
    const f = e.termin - b;
    return f >= -0.01 ? `termine ${sureYaz(f)} kala` : `terminden ${sureYaz(-f)} geç`;
  };
  return (
    <div className="tc-pyq-elle" role="group" aria-label={`${ad} için elle yerleştirme`} data-elle={isId}>
      <p className="tc-pyq-not">
        {gerekli !== null && <b data-gerekli="">Gerekli {sureYaz(gerekli)} (hazırlık dahil). </b>}
        Tahtada işaretli yere ya da aşağıdaki bir yere basın; adım o yerde kilitlenir, otomatik planlama ona dokunmaz. Geri al ile kalkar. Esc vazgeçer.
      </p>
      {yerler === null ? <p className="tc-pyq-not" role="status">Boş yerler hesaplanıyor</p>
        : yerler.length === 0 ? <p className="tc-pyq-not" role="status" data-elle-yok="">Uygun tezgâhlarda bu adıma yeten boş yer bulunamadı.{bol ? ' Böl ile adedi birden çok tezgâha paylaştırabilirsiniz.' : ''}</p>
          : (
            <ul className="tc-pyq-elle-yerler" aria-label="Boş yerler">
              {yerler.map((b) => (
                <li key={b.tezgah}>
                  <button type="button" data-elle-yer={b.tezgah} aria-pressed={secilen === b.tezgah} onClick={() => { setSecilen(b.tezgah); }}>
                    <b className="tc-pyq-mono">{kod(b.tezgah)}</b>
                    <span>{zaman(b.S)} → {bitisYaz(b.S, b.C)}{b.enErken ? ' · en erken biten' : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
      {yer && (
        <div className="tc-pyq-elle-sonuc" role="status" data-elle-secilen={yer.tezgah}>
          <span>Seçilen: <b className="tc-pyq-mono">{kod(yer.tezgah)}</b> · {zaman(yer.S)}</span>
          <span>Adım biter <b>{zaman(yer.C)}</b></span>
          {yer.bitis !== null && <span>Emir biter <b>{zaman(yer.bitis)}</b>{termin(yer.bitis) !== '' && ` · ${termin(yer.bitis)}`}</span>}
        </div>
      )}
      <span className="tc-pyq-elle-dugmeler">
        <Dugme tur="birincil" simge="lock" disabled={!yer} onClick={() => { if (yer) { tasi(isId, yer.tezgah, yer.baslangic); kapat(); } }}>Yerleştir ve kilitle</Dugme>
        {bol && <Dugme tur="ikincil" simge="layers" onClick={() => { bol(isId); }}>Böl</Dugme>}
        <Dugme tur="ikincil" simge="x" onClick={kapat}>Vazgeç</Dugme>
      </span>
    </div>
  );
}
