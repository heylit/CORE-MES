import { useEffect, useRef, useState } from 'react';
import { Dugme, Girdi, OnayPenceresi } from '../../../../ortak/arayuz/index.ts';
import { state } from '../depo.ts';
import { stokKartiBagla, stokKartlari, useCncYetkisi } from '../veri.ts';

interface Kart { malzemeId: number; kod: string; ad: string | null }
// Kimlik sunucu sözleşmesindeki desendir; uymayan kalemde bölüm çizilmez (bugünkü köprü gibi).
const KIMLIK = /^[A-Za-z0-9_.-]{1,64}$/;

// Kalemin bağlı stok kartı; bağ yoksa null. Okurken sunucu bağı `tmiStok` alanına yazar (153 a).
export function bagliKart(kimlik: string): Kart | null {
  const bag = Object.prototype.hasOwnProperty.call(state.inv, kimlik) ? state.inv[kimlik]?.tmiStok : undefined;
  return bag != null && typeof bag.malzemeId === 'number' && typeof bag.kod === 'string'
    ? { malzemeId: bag.malzemeId, kod: bag.kod, ad: typeof bag.ad === 'string' ? bag.ad : null } : null;
}

interface Arama { metin: string; kartlar: Kart[]; toplam: number | null; ileti: string }

// Bugünkü köprünün stok kartı bölümü (cerceve-kopru.ts takım stoğu): kartı yazabilen kişi kalemi bağlar, kartını değiştirir
// ya da bağı kaldırır. Arama kalem başınadır.
export function StokKarti({ kimlik }: { kimlik: string }) {
  const yetki = useCncYetkisi();
  const [arama, aramaYaz] = useState<Arama | null>(null);
  const [yazmada, yazmadaYaz] = useState(false);
  const [kaldirSor, kaldirSorYaz] = useState(false);
  const sayac = useRef(0);
  const zaman = useRef<number | undefined>(undefined);

  useEffect(() => { aramaYaz(null); kaldirSorYaz(false); }, [kimlik]);
  useEffect(() => () => { window.clearTimeout(zaman.current); }, []);

  if (!KIMLIK.test(kimlik)) return null;
  const bag = bagliKart(kimlik);
  if (bag === null && !yetki.stokKartiBaglayabilir) return null;

  const ara = (metin: string, onceki: Arama | null): void => {
    const a: Arama = { metin, kartlar: onceki?.kartlar ?? [], toplam: onceki?.toplam ?? null, ileti: 'Aranıyor…' };
    aramaYaz(a);
    sayac.current += 1;
    const no = sayac.current;
    stokKartlari(metin, 1).then(
      (c) => { if (no === sayac.current) aramaYaz({ metin, kartlar: c.kartlar, toplam: c.toplam, ileti: c.kartlar.length === 0 ? 'Uyan kart yok.' : '' }); },
      (h: Error) => { if (no === sayac.current) aramaYaz({ ...a, ileti: h.message }); },
    );
  };
  const bagla = (malzemeId: number | null): void => {
    if (yazmada) return;
    yazmadaYaz(true);
    if (arama !== null) aramaYaz({ ...arama, ileti: 'Kaydediliyor…' });
    stokKartiBagla(kimlik, malzemeId).then(
      () => { yazmadaYaz(false); aramaYaz(null); },
      (h: Error) => { yazmadaYaz(false); aramaYaz({ metin: arama?.metin ?? '', kartlar: arama?.kartlar ?? [], toplam: arama?.toplam ?? null, ileti: h.message }); },
    );
  };

  return (
    <div className="tc-cl-stokkarti">
      <div className="tc-cl-ara-baslik">Stok kartı</div>
      {bag !== null
        ? (
          <>
            <div className="tc-cl-kartsatir"><span className="mono">{bag.kod}</span><b>{bag.ad ?? ''}</b></div>
            <p className="tc-cl-not">
              {yetki.stokDusebilir
                ? 'Adet stoktan gelir; değişimde ve azaltmada düşen adet stoktan çıkar. Giriş ve sayım Stok ekranından.'
                : 'Adet stoktan gelir; giriş, çıkış ve sayım Stok ekranından.'}
            </p>
          </>
        )
        : <p className="tc-cl-not">Stok kartına bağlı değil; adet yalnız bu kurulumda tutulur.</p>}
      {yetki.stokKartiBaglayabilir && arama === null && (
        <div className="tc-cl-dugmeler">
          <Dugme simge="tag" data-tmi="stok-ac" onClick={() => { ara('', null); }}>{bag === null ? 'Stok kartına bağla' : 'Kartı değiştir'}</Dugme>
          {bag !== null && <Dugme tur="tehlike" simge="x" data-tmi="stok-kaldir" onClick={() => { kaldirSorYaz(true); }}>Bağı kaldır</Dugme>}
        </div>
      )}
      {yetki.stokKartiBaglayabilir && arama !== null && (
        <>
          <Girdi
            etiket="Sarf ya da demirbaş kartı ara" type="search" placeholder="Kod ya da ad" maxLength={100} autoFocus value={arama.metin}
            onChange={(o) => {
              const v = o.target.value;
              aramaYaz({ ...arama, metin: v });
              window.clearTimeout(zaman.current);
              zaman.current = window.setTimeout(() => { ara(v, arama); }, 300);
            }}
          />
          {arama.kartlar.map((k) => (
            <button
              key={k.malzemeId} type="button" className="tc-cl-kartsatir tc-cl-kartsec" aria-pressed={bag?.malzemeId === k.malzemeId}
              data-tmi-kart={k.malzemeId} onClick={() => { if (bag?.malzemeId !== k.malzemeId) bagla(k.malzemeId); }}
            >
              <span className="mono">{k.kod}</span><b>{k.ad ?? ''}</b>
            </button>
          ))}
          {arama.ileti !== ''
            ? <p className="tc-cl-uyari" role="status">{arama.ileti}</p>
            : arama.toplam !== null && arama.toplam > arama.kartlar.length
              ? <p className="tc-cl-not">{`${String(arama.toplam)} karttan ilk ${String(arama.kartlar.length)} gösteriliyor; aramayı daraltın.`}</p>
              : null}
          <div className="tc-cl-dugmeler"><Dugme data-tmi="stok-vazgec" onClick={() => { aramaYaz(null); }}>Vazgeç</Dugme></div>
        </>
      )}
      <OnayPenceresi
        acik={kaldirSor} baslik="Bağı kaldır" tehlikeli onayMetni="Bağı kaldır"
        onayla={() => { kaldirSorYaz(false); bagla(null); }} vazgec={() => { kaldirSorYaz(false); }}
      >
        <p>Kalemin stok kartı bağı kaldırılsın mı? Adet bundan sonra yalnız bu kurulumda tutulur.</p>
      </OnayPenceresi>
    </div>
  );
}
