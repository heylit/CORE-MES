import { useState } from 'react';
import { Dugme, Girdi } from '../../../../ortak/arayuz/index.ts';
import type { Duzen } from './duzen.ts';
import {
  listeAyari, listeDegerEkle, listeDegistiMi, listeEkiSil, listeGizleDegistir, listeHepsiniKullan, listeHicbiriniKullanma, listeTabani,
  listeVarsayilanaDon,
} from './islemler.ts';
import { EklendiIsareti, Kullan, Sayac, SilDugmesi } from './parcalar.tsx';

const kucuk = (s: unknown) => String(s).toLocaleLowerCase('tr');

// Bir seçim listesini açar / kapar, genişletir. Kimlik biçimi `listeTabani`'nda.
export function ListeDuzenleyici({ d, id, baslik, aciklama, hepAcik = false }: {
  d: Duzen; id: string; baslik: string; aciklama?: string; hepAcik?: boolean;
}) {
  const [yeni, yeniYaz] = useState('');
  const [ara, araYaz] = useState('');
  const taban = listeTabani(id, d.taban);
  if (!taban) return null;
  const l = listeAyari(d.v, id);
  const gizli = new Set(l.gizle);
  const kullanimda = taban.filter((x) => !gizli.has(x)).length + l.ekle.length;
  const acik = hepAcik || d.acikListeler.has(id);
  const q = kucuk(ara.trim());
  const gorunur = (x: unknown) => !q || kucuk(x).includes(q);

  const ekle = () => {
    d.listeAc(id, true);
    if (d.uygula(listeDegerEkle(d.v, id, yeni, taban))) yeniYaz('');
  };
  const yap = (fn: () => void) => { d.listeAc(id, true); fn(); };

  return (
    <details className="tc-ma-liste" open={acik} onToggle={(e) => d.listeAc(id, (e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <span className="tc-ma-liste-ad"><b>{baslik}</b>{aciklama && <small>{aciklama}</small>}</span>
        <Sayac kullanimda={kullanimda} gizli={gizli.size} eklendi={l.ekle.length} />
      </summary>
      <div className="tc-ma-liste-govde">
        {!d.ro && (
          <form className="tc-ma-liste-ekle" onSubmit={(e) => { e.preventDefault(); ekle(); }}>
            <Girdi etiket={`${baslik}: yeni değer`} value={yeni} onChange={(e) => yeniYaz(e.target.value)} placeholder="Yeni değer yaz ve Enter'a bas" autoComplete="off" />
            <Dugme tur="birincil" simge="plus" type="submit">Ekle</Dugme>
          </form>
        )}
        <div className="tc-ma-liste-arac">
          {taban.length + l.ekle.length > 8 && (
            <Girdi etiket={`${baslik}: listede ara`} value={ara} onChange={(e) => araYaz(e.target.value)} placeholder="Listede ara" autoComplete="off" />
          )}
          {!d.ro && (
            <>
              <Dugme onClick={() => yap(() => d.degis(listeHepsiniKullan(d.v, id)))}>Tümünü kullan</Dugme>
              <Dugme onClick={() => yap(() => d.degis(listeHicbiriniKullanma(d.v, id, taban)))}>Hiçbirini kullanma</Dugme>
              {listeDegistiMi(d.v, id) && <Dugme simge="rotate" onClick={() => yap(() => d.degis(listeVarsayilanaDon(d.v, id)))}>Varsayılana dön</Dugme>}
            </>
          )}
        </div>
        <ul className="tc-ma-liste-satirlar">
          {l.ekle.filter(gorunur).map((x) => (
            <li key={`ek-${x}`} className="tc-ma-liste-satir">
              <Kullan ad={String(x)} acik kilitli />
              <span className="tc-ma-liste-deger">{x}</span>
              <EklendiIsareti />
              {!d.ro && <SilDugmesi ad={String(x)} sil={() => yap(() => d.degis(listeEkiSil(d.v, id, x)))} />}
            </li>
          ))}
          {taban.filter(gorunur).map((x) => (
            <li key={`tb-${x}`} className="tc-ma-liste-satir" data-gizli={gizli.has(x) || undefined}>
              <Kullan ad={String(x)} acik={!gizli.has(x)} kilitli={d.ro} degistir={() => yap(() => d.degis(listeGizleDegistir(d.v, id, x)))} />
              <span className="tc-ma-liste-deger">{x}</span>
            </li>
          ))}
        </ul>
        {!taban.length && !l.ekle.length && <p className="tc-ma-yardim">Liste boş; yukarıdan değer ekle.</p>}
      </div>
    </details>
  );
}
