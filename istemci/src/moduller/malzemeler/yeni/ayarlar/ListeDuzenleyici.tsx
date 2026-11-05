import { useState } from 'react';
import { Dugme, Girdi } from '../../../../ortak/arayuz/index.ts';
import type { Duzen } from './duzen.ts';
import {
  listeAyari, listeDegerEkle, listeDegistiMi, listeEkiSil, listeGizleDegistir, listeHepsiniKullan, listeHicbiriniKullanma, listeTabani,
  listeVarsayilanaDon,
} from './islemler.ts';
import { EklendiIsareti, Kullan, Sayac, SilDugmesi } from './parcalar.tsx';
import {
  STANDART_AD_SINIRI, standartAdiYaz, standartAdlari, standartlaEslesir, type StandartAdi, type StandartAdlari,
} from '../standart-adlari.ts';

// 2117: hammaddenin durum ve işlem listelerinde değerin ASTM ve EN adı tutulur.
const standartListesiMi = (id: string) => /^opt\|[^|]+\|(durum|islem)$/.test(id);

const adMetni = (a: StandartAdi | undefined) => [a?.astm && `ASTM ${a.astm}`, a?.en && `EN ${a.en}`].filter(Boolean).join(' · ');

// Değerin eşli adları; alan bırakılınca yazılır (her tuşta ayar kaydı gitmesin).
function StandartAdlariFormu({ d, deger, adlar, kapat }: { d: Duzen; deger: string; adlar: StandartAdlari; kapat: () => void }) {
  const a = adlar[deger];
  const [astm, astmYaz] = useState(a?.astm ?? '');
  const [en, enYaz] = useState(a?.en ?? '');
  const kaydet = () => {
    if (astm.trim() !== (a?.astm ?? '') || en.trim() !== (a?.en ?? '')) {
      d.degis(standartAdiYaz(d.v, deger, { astm, en }), `${deger}: standart adları kaydedildi.`);
    }
    kapat();
  };
  return (
    <form className="tc-ma-liste-ekle" onSubmit={(e) => { e.preventDefault(); kaydet(); }}>
      <Girdi etiket={`${deger}: ASTM adı`} value={astm} maxLength={STANDART_AD_SINIRI} onChange={(e) => astmYaz(e.target.value)} placeholder="ör. H1025" autoComplete="off" />
      <Girdi etiket={`${deger}: EN adı`} value={en} maxLength={STANDART_AD_SINIRI} onChange={(e) => enYaz(e.target.value)} placeholder="ör. P1070" autoComplete="off" />
      <Dugme tur="birincil" simge="check" type="submit">Kaydet</Dugme>
      <Dugme onClick={kapat}>Vazgeç</Dugme>
    </form>
  );
}

// Bir seçim listesini açar / kapar, genişletir. Kimlik biçimi `listeTabani`'nda.
export function ListeDuzenleyici({ d, id, baslik, aciklama, hepAcik = false }: {
  d: Duzen; id: string; baslik: string; aciklama?: string; hepAcik?: boolean;
}) {
  const [yeni, yeniYaz] = useState('');
  const [ara, araYaz] = useState('');
  const [duzenlenen, duzenlenenYaz] = useState<string | null>(null);
  const standartli = standartListesiMi(id);
  const adlar = standartli ? standartAdlari(d.v) : {};
  const taban = listeTabani(id, d.taban);
  if (!taban) return null;
  const l = listeAyari(d.v, id);
  const gizli = new Set(l.gizle);
  const kullanimda = taban.filter((x) => !gizli.has(x)).length + l.ekle.length;
  const acik = hepAcik || d.acikListeler.has(id);
  const gorunur = (x: unknown) => standartlaEslesir(String(x), adlar, ara);
  const deger = (x: unknown) => {
    const v = String(x);
    if (!standartli) return <span className="tc-ma-liste-deger">{v}</span>;
    const m = adMetni(adlar[v]);
    return (
      <span className="tc-ma-liste-deger">
        {v}{m && <small> · {m}</small>}
        {duzenlenen === v && <StandartAdlariFormu d={d} deger={v} adlar={adlar} kapat={() => duzenlenenYaz(null)} />}
      </span>
    );
  };
  const adDugmesi = (x: unknown) => (standartli && !d.ro && duzenlenen !== String(x)
    ? <Dugme simge="edit" aria-label={`${String(x)}: ASTM ve EN adı`} onClick={() => duzenlenenYaz(String(x))}>ASTM / EN</Dugme>
    : null);

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
          {(standartli || taban.length + l.ekle.length > 8) && (
            <Girdi
              etiket={`${baslik}: listede ara`} type="search" value={ara} onChange={(e) => araYaz(e.target.value)}
              placeholder={standartli ? 'Ad, ASTM ya da EN adı' : 'Listede ara'} autoComplete="off"
            />
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
              {deger(x)}
              <EklendiIsareti />
              {adDugmesi(x)}
              {!d.ro && <SilDugmesi ad={String(x)} sil={() => yap(() => d.degis(listeEkiSil(d.v, id, x)))} />}
            </li>
          ))}
          {taban.filter(gorunur).map((x) => (
            <li key={`tb-${x}`} className="tc-ma-liste-satir" data-gizli={gizli.has(x) || undefined}>
              <Kullan ad={String(x)} acik={!gizli.has(x)} kilitli={d.ro} degistir={() => yap(() => d.degis(listeGizleDegistir(d.v, id, x)))} />
              {deger(x)}
              {adDugmesi(x)}
            </li>
          ))}
        </ul>
        {!taban.length && !l.ekle.length && <p className="tc-ma-yardim">Liste boş; yukarıdan değer ekle.</p>}
      </div>
    </details>
  );
}
