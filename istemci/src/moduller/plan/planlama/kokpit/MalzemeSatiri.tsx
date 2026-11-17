import { Rozet, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { MALZEME_DURUM_ADI, miktarYaz, terminYazisi, type MalzemeDurumu, type MalzemeSatiri as Satir, type MalzemeSiparisi } from './malzeme.ts';

// Emrin adım tablosunda rotadan önceki "Malzeme" satırı (3369 a). Yalnız bilgi verir: taşınmaz, kilitlenmez; şirket ve termin Satın
// Alma'dandır. Sütunlar adım satırınınkilerle aynı yerdedir; dar ekranda hücre kendi etiketini taşır.

const TON: Record<MalzemeDurumu, RozetTonu> = { stokta: 'tamam', geliyor: 'uyari', terminsiz: 'uyari', eksik: 'hata' };

const siparisYazisi = (s: MalzemeSiparisi): string => (s.no === null ? (s.talep ? 'onaylı talep' : 'sipariş') : `${s.talep ? 'talep' : 'sipariş'} ${s.no}`);

export interface MalzemeSatirlariOzellikleri {
  satirlar: readonly Satir[];
  zaman: (t: number) => string;
  // Tüketen adımın adı (adım kimliğiyle); bilinmeyen adımda yazmaz.
  adimAdi: (adimId: string) => string | null;
}

export function MalzemeSatirlari({ satirlar, zaman, adimAdi }: MalzemeSatirlariOzellikleri) {
  return (
    <>
      {satirlar.map((x, i) => {
        const adim = x.adimId === null ? null : adimAdi(x.adimId);
        const t = terminYazisi(x, zaman, adim);
        return (
          <tr key={`${x.kod}:${String(i)}`} className="tc-pyq-malzeme" data-malzeme={x.kod} data-durum={x.durum}>
            <td data-ad="#" aria-hidden="true">M</td>
            <td data-ad="Operasyon">
              <b>Malzeme</b>
              <small>{x.ad} · {miktarYaz(x.ihtiyac, x.birim)} gerekli</small>
            </td>
            <td data-ad="Bağımlılık">{adim === null ? 'ilk adımdan önce' : `${adim} için`}</td>
            <td data-ad="Süre">—</td>
            <td data-ad="Şirket">
              {x.siparisler.length === 0 ? <span className="tc-pyq-not">{x.durum === 'eksik' ? 'sipariş yok' : '—'}</span> : x.siparisler.map((s, k) => (
                <span key={k} data-malzeme-siparis="">{s.tedarikci ?? '—'}<small>{siparisYazisi(s)}</small></span>
              ))}
            </td>
            <td data-ad="Termin">
              <b data-malzeme-termin="">{t.ana}</b>
              {t.alt !== null && <small>{t.alt}</small>}
            </td>
            <td data-ad="Adet" data-malzeme-adet="">
              <span><b>{miktarYaz(x.stoktan, x.birim)}</b> stoktan</span>
              {(x.siparisten > 0 || x.siparisler.length > 0) && <span><b>{miktarYaz(x.siparisten, x.birim)}</b> siparişten</span>}
              {x.eksik > 0 && <span data-malzeme-eksik=""><b>{miktarYaz(x.eksik, x.birim)}</b> eksik</span>}
            </td>
            <td data-ad="Durum"><Rozet ton={TON[x.durum]} gorunum="cizgi">{MALZEME_DURUM_ADI[x.durum]}</Rozet></td>
          </tr>
        );
      })}
    </>
  );
}
