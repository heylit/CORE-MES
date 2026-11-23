import { useMemo, useState } from 'react';
import type { HazirlikCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { HAZIRLIK_MADDE_BILGISI } from '../../../uretim-emirleri/disari.ts';
import { BASLAMA_DURUMLARI, type BaslamaDurumu } from '../operator/HazirlikListesi.tsx';
import { matrisSatirlari, type MatrisHali } from './matris.ts';
import type { Pkg } from './tipler.ts';

// 3606: Hazırlık durumu matrisi Hazırlık sayfasında görünüm olarak (Kartlar | Liste | Matris). Veri ve hesap Liste'dekiyle aynıdır
// (hazirlik-ozeti ucu, baslamaDurumu); satır iş, sütun hazırlık maddesi. Yazma yok: hücreye dokunmak paketin ayrıntısını açar.
type Madde = keyof typeof HAZIRLIK_MADDE_BILGISI;
const MADDELER = Object.keys(HAZIRLIK_MADDE_BILGISI) as Madde[];

const HUCRE: Record<MatrisHali, { ton: 'hata' | 'uyari' | 'tamam' | 'pasif'; simge: SimgeAdi; ad: string }> = {
  tamam: { ton: 'tamam', simge: 'check', ad: 'Tamam' }, eksik: { ton: 'hata', simge: 'x', ad: 'Eksik' }, uyari: { ton: 'uyari', simge: 'alert', ad: 'Uyarı' },
  muaf: { ton: 'uyari', simge: 'lock', ad: 'Muaf' }, gerekmez: { ton: 'pasif', simge: 'minus', ad: 'Gerekmez' }, bilinmiyor: { ton: 'pasif', simge: 'help', ad: 'Denetlenmiyor' },
};
const DURUM_TONU: Record<BaslamaDurumu, 'hata' | 'uyari' | 'tamam'> = { durur: 'hata', uyari: 'uyari', hazir: 'tamam' };
const DURUM_KISA: Record<BaslamaDurumu, string> = { durur: 'Durur', uyari: 'Uyarılı', hazir: 'Hazır' };
const SUZGEC: readonly (readonly [BaslamaDurumu | 'hepsi', string])[] = [['hepsi', 'Hepsi'], ['durur', 'Durur'], ['uyari', BASLAMA_DURUMLARI.uyari], ['hazir', 'Hazır']];

interface Ozellikler {
  paketler: readonly Pkg[];
  hazirlik: ReadonlyMap<number, HazirlikCevabi>;
  seciliId: string | null;
  // Hücre paketin Terminale gönder sekmesini (hazırlık maddeleri orada), iş adı Bilgiler'i açar.
  ac: (p: Pkg, hucre: boolean, tiklanan: HTMLElement, madde?: string) => void;
}

export function MatrisGorunumu({ paketler, hazirlik, seciliId, ac }: Ozellikler) {
  const [suz, suzYaz] = useState<BaslamaDurumu | 'hepsi'>('hepsi');
  const [paketsiz, paketsizYaz] = useState(false);
  const [eksikMadde, eksikYaz] = useState<'' | Madde>('');
  // Dar ekranda süzgeçler katlanır; geniş ekranda her zaman açıktır (düğme CSS'le gizlenir).
  const [suzAcik, suzAcikYaz] = useState(false);
  const tum = useMemo(() => matrisSatirlari(paketler, hazirlik), [paketler, hazirlik]);
  const sayi = (d: BaslamaDurumu) => tum.filter((s) => s.durum === d).length;
  const paketsizSayi = tum.filter((s) => s.paket === null).length;
  const satirlar = tum.filter((s) => (suz === 'hepsi' || s.durum === suz) && (!paketsiz || s.paket === null) && (eksikMadde === '' || s.hal.get(eksikMadde) === 'eksik'));
  const etkin = (suz !== 'hepsi' ? 1 : 0) + (paketsiz ? 1 : 0) + (eksikMadde !== '' ? 1 : 0);

  return (
    <div className="tc-ay2-mt" aria-label="Hazırlık matrisi">
      <div className="tc-ay2-mt-suz" data-acik={suzAcik ? '' : undefined}>
        <button type="button" className="tc-ay2-takip-cip tc-ay2-mt-suz-dugme" aria-expanded={suzAcik} onClick={() => suzAcikYaz(!suzAcik)}>
          <Simge ad="sort" boyut="k" />{etkin ? `Süzgeç · ${String(etkin)} etkin` : 'Süzgeç'}
        </button>
        <div className="tc-ay2-mt-suz-ic">
          <span className="tc-ay2-ust-yazi">Hazırlık durumu</span>
          <div className="tc-ay2-takip-cipler" role="group" aria-label="Hazırlık">
            {SUZGEC.map(([k, ad]) => {
              const n = k === 'hepsi' ? tum.length : sayi(k);
              return <button key={k} type="button" className="tc-ay2-takip-cip" aria-pressed={suz === k} data-sifir={n === 0 ? '' : undefined} onClick={() => suzYaz(k)}>{ad} {n}</button>;
            })}
          </div>
          <div className="tc-ay2-takip-cipler" role="group" aria-label="Paket">
            <button type="button" className="tc-ay2-takip-cip" aria-pressed={paketsiz} data-sifir={paketsizSayi === 0 ? '' : undefined} onClick={() => paketsizYaz(!paketsiz)}>Paket yok {paketsizSayi}</button>
          </div>
          <label className="tc-ay2-mt-sec">
            <span className="tc-gizli-etiket">Eksik madde</span>
            <select value={eksikMadde} onChange={(e) => eksikYaz(e.target.value as '' | Madde)}>
              <option value="">Eksik madde: hepsi</option>
              {MADDELER.map((m) => <option key={m} value={m}>Eksik: {HAZIRLIK_MADDE_BILGISI[m].ad}</option>)}
            </select>
          </label>
        </div>
      </div>
      <ul className="tc-ay2-mt-lejant" aria-label="Simgeler">
        {(['tamam', 'eksik', 'uyari', 'muaf', 'gerekmez'] as const).map((k) => (
          <li key={k} data-ton={HUCRE[k].ton}><Simge ad={HUCRE[k].simge} boyut="k" />{HUCRE[k].ad}{k === 'eksik' ? ', durdurur' : ''}</li>
        ))}
      </ul>
      <p className="tc-ay2-mt-acilim">{MADDELER.map((m) => `${HAZIRLIK_MADDE_BILGISI[m].kisa} = ${HAZIRLIK_MADDE_BILGISI[m].ad}`).join(' · ')}</p>
      <p className="tc-ay2-mt-ipucu">Madde sütunlarını sağa kaydırın; iş yerinde kalır.</p>
      {satirlar.length === 0 ? <p className="tc-ay2-soluk tc-ay2-bos-satir">{tum.length ? 'Süzgece uyan iş yok.' : 'Paket yok.'}</p> : (
        <div className="tc-ay2-mt-sarmal" tabIndex={0} role="region" aria-label="Hazırlık matrisi tablosu">
          <table className="tc-ay2-mt-tablo">
            <thead>
              <tr>
                <th scope="col">İş</th>
                {MADDELER.map((m) => (
                  <th key={m} scope="col" title={`${HAZIRLIK_MADDE_BILGISI[m].ad} · ${HAZIRLIK_MADDE_BILGISI[m].sahip}`}>
                    {HAZIRLIK_MADDE_BILGISI[m].kisa}<small>{HAZIRLIK_MADDE_BILGISI[m].uyarir ? 'uyarır' : 'durdurur'}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {satirlar.map((s) => {
                const p = s.paket;
                const durum = s.durum
                  ? <span className="tc-ay2-mt-durum" data-ton={DURUM_TONU[s.durum]}>{DURUM_KISA[s.durum]}{s.durum === 'hazir' && [...s.hal.values()].includes('muaf') ? ' · M' : ''}{p ? '' : ' · Paket yok'}</span>
                  : <span className="tc-ay2-mt-durum" data-ton="pasif">—{p ? '' : ' · Paket yok'}</span>;
                return (
                  <tr key={s.anahtar} data-durum={s.durum ?? undefined} aria-selected={p !== null && seciliId === p.id}>
                    <th scope="row">
                      {p ? (
                        <button type="button" className="tc-ay2-mt-is" onClick={(e) => ac(p, false, e.currentTarget)} title={`${s.emirNo} · ${s.ad}`}>
                          <b className="tc-ay2-mono">{s.emirNo}</b><small>{s.ad}</small>{durum}
                        </button>
                      ) : (
                        <span className="tc-ay2-mt-is" data-paketsiz="" title={`${s.emirNo} · ${s.ad}: bu işin paketi yok`}>
                          <b className="tc-ay2-mono">{s.emirNo}</b><small>{s.ad}</small>{durum}
                        </span>
                      )}
                    </th>
                    {MADDELER.map((m) => {
                      const h = s.hal.get(m);
                      if (!h) return <td key={m}><span className="tc-ay2-mt-h" data-ton="pasif" aria-label={`${HAZIRLIK_MADDE_BILGISI[m].ad}: okunamadı`}>·</span></td>;
                      const g = HUCRE[h];
                      return (
                        <td key={m}>
                          {p ? (
                            <button type="button" className="tc-ay2-mt-h" data-ton={g.ton} onClick={(e) => ac(p, true, e.currentTarget, m)} aria-label={`${s.emirNo} ${s.ad} ${HAZIRLIK_MADDE_BILGISI[m].ad}: ${g.ad}`}>
                              <Simge ad={g.simge} boyut="k" />
                            </button>
                          ) : (
                            <span className="tc-ay2-mt-h" data-ton={g.ton} role="img" aria-label={`${s.emirNo} ${s.ad} ${HAZIRLIK_MADDE_BILGISI[m].ad}: ${g.ad}`}><Simge ad={g.simge} boyut="k" /></span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
