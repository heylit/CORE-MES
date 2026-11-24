import { Pencere, Rozet } from '../../ortak/arayuz/index.ts';
import type { TakimSatiri } from '#paylasilan/sozlesme/takimhane.ts';
import { KonumDagilimi } from './Parcalar.tsx';
import { SINIF_ADI, STOK_DURUMU_ADI, STOK_DURUMU_TONU, stokDurumu } from './gosterim.ts';
import './takimhane.css';

const bos = (d: string | number | null) => (d === null ? '—' : String(d));

export function TakimAyrinti({ takim, kapat }: { takim: TakimSatiri | null; kapat: () => void }) {
  const d = takim ? stokDurumu(takim) : null;
  return (
    <Pencere acik={takim !== null} kapat={kapat} baslik={takim ? `${takim.kod} · ${takim.ad}` : 'Takım'} tur="yan">
      {takim && d && (
        <div className="tc-tkm-ayrinti">
          <div className="tc-tkm-ayrinti-ust">
            <span className="tc-tkm-ayrinti-toplam mono">{takim.toplam}</span>
            <span className="tc-tkm-soluk">adet toplam</span>
            <Rozet ton={STOK_DURUMU_TONU[d]}>{STOK_DURUMU_ADI[d]}</Rozet>
          </div>
          <h3 className="tc-tkm-bolum">Nerede</h3>
          <KonumDagilimi konumlar={takim.konumlar} />
          <h3 className="tc-tkm-bolum">Özellikler</h3>
          <dl className="tc-tkm-ozellik">
            <div><dt>Sınıf</dt><dd>{SINIF_ADI[takim.sinif]}</dd></div>
            <div><dt>Kategori</dt><dd>{takim.kategori}</dd></div>
            <div><dt>Çap</dt><dd className="mono">{takim.capMm === null ? '—' : `${takim.capMm} mm`}</dd></div>
            <div><dt>Kesici sayısı</dt><dd className="mono">{bos(takim.kesiciSayisi)}</dd></div>
            <div><dt>ISO kodu</dt><dd className="mono">{bos(takim.isoKodu)}</dd></div>
            <div><dt>Raf</dt><dd className="mono">{bos(takim.rafKodu)}</dd></div>
            <div><dt>Eşik (sipariş noktası)</dt><dd className="mono">{bos(takim.kritikSeviye)}</dd></div>
            <div><dt>Yeniden bilenir</dt><dd>{takim.yenidenBilenir ? 'Evet' : 'Hayır'}</dd></div>
            <div><dt>İzleme</dt><dd>{takim.izleme === 'adet' ? 'Adetle' : 'Tek tek'}</dd></div>
            <div>
              <dt>Uygulanabilir malzeme</dt>
              <dd>
                {takim.malzemeGruplari.length === 0
                  ? '—'
                  : <span className="tc-tkm-gruplar">{takim.malzemeGruplari.map((g) => <span key={g} className="tc-tkm-grup mono">{g}</span>)}</span>}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </Pencere>
  );
}
