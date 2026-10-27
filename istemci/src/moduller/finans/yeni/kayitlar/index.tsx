import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet } from '../../../../ortak/arayuz/index.ts';
import '../../../../ortak/arayuz/tablo.css';
import { csvIndir } from '../../../../ortak/veri/csv.ts';
import { kisaTarih, tl } from '../bicim.ts';
import type { Islem } from '../motor.ts';
import { yeniYol, type EkranOzellikleri } from '../sekmeler.ts';
import { KayitPenceresi } from './BelgeDuzelt.tsx';
import {
  aylaraBol, CSV_BASLIKLARI, ILK_SINIR, isaretliTutar, kategoriEtiketi, KAYIT_SUZGECLERI, kayitCsvSatirlari, kayitDurumu, kayitlariSuz, SINIR_ADIMI,
  suzgecSayilari, type KayitSuzgeci,
} from './kurallar.ts';
import './kayitlar.css';

// Kayıtlar (prototipte VIEWS.kayit): girilen bütün satış, alış, tahsilat ve ödemeler; tek tabloda ay başlığı satırlarıyla, en yeni üstte.
// Satıra tıklanınca düzeltme penceresi, cari adına tıklanınca firma kartı açılır.
export function Kayitlar({ finans, yetki }: EkranOzellikleri) {
  const [suzgec, suzgecYaz] = useState<KayitSuzgeci>('tum');
  const [arama, aramaYaz] = useState('');
  const [sinir, sinirYaz] = useState(ILK_SINIR);
  const [secili, seciliYaz] = useState<string | null>(null);

  const tx = finans?.motor.durum.tx ?? [];
  const bugun = finans?.motor.bugun ?? '';
  const sayilar = useMemo(() => suzgecSayilari(tx, bugun), [tx, bugun]);
  const satirlar = useMemo(() => kayitlariSuz(tx, suzgec, arama, bugun), [tx, suzgec, arama, bugun]);
  if (!finans) return <DurumKutusu durum="bos" mesaj="Kayıtlar için finans okuma yetkisi gerekir." />;

  const gorunen = satirlar.slice(0, sinir);
  const firmaYolu = (t: Islem): string | null => {
    const id = finans.V.etiketten.get(t.party);
    return id === undefined ? null : `${yeniYol('firmalar')}?firma=${id}`;
  };
  const sec = (t: Islem) => seciliYaz(t.id);

  return (
    <div className="tc-fk">
      <div className="tc-fk-bas">
        <p className="tc-fk-not">Girilen tüm satış, alış, tahsilat ve ödemeler. Düzeltmek için satıra tıklayın.</p>
        <Dugme simge="download" disabled={tx.length === 0} onClick={() => csvIndir('finans-kayitlar', CSV_BASLIKLARI, kayitCsvSatirlari(tx))}>
          Excel'e aktar
        </Dugme>
      </div>
      <div className="tc-fk-arac">
        <div className="tc-fk-cipler" role="group" aria-label="Kayıt süzgeci">
          {KAYIT_SUZGECLERI.map(([k, b]) => (
            <Dugme key={k} aria-pressed={suzgec === k} onClick={() => { suzgecYaz(k); sinirYaz(ILK_SINIR); }}>
              {b} <span className="tc-fk-sayi">{sayilar[k]}</span>
            </Dugme>
          ))}
        </div>
        <div className="tc-fk-arama">
          <Girdi
            etiket="Kayıtlarda ara" type="search" placeholder="Cari, açıklama veya kategori ara" autoComplete="off"
            value={arama} onChange={(o) => { aramaYaz(o.target.value); sinirYaz(ILK_SINIR); }}
          />
        </div>
      </div>
      <Kart>
        {gorunen.length === 0 ? (
          <DurumKutusu durum="bos" mesaj="Bu filtrede kayıt yok." />
        ) : (
          <div className="tc-tablo-kap">
            <table className="tc-tablo" aria-label="Kayıtlar">
              <thead>
                <tr>
                  <th scope="col">Tarih</th><th scope="col">Cari</th><th scope="col">Açıklama</th><th scope="col">Kategori</th>
                  <th scope="col" className="tc-tablo-sag">Tutar (KDV dahil)</th><th scope="col">Durum</th>
                </tr>
              </thead>
              <tbody>
                {aylaraBol(gorunen).map((g) => (
                  <Fragment key={g.ay}>
                    <tr className="tc-fk-grup"><td colSpan={6}>{g.baslik}</td></tr>
                    {g.satirlar.map((t) => {
                      const yol = firmaYolu(t);
                      const d = kayitDurumu(t, bugun);
                      return (
                        <tr
                          key={t.id} className="tc-tablo-secilir" tabIndex={0} onClick={() => sec(t)}
                          onKeyDown={(o) => { if (o.target === o.currentTarget && (o.key === 'Enter' || o.key === ' ')) { o.preventDefault(); sec(t); } }}
                        >
                          <td className="tc-tablo-kirilmaz">{kisaTarih(t.date)}</td>
                          <td>{yol ? <Link to={yol} onClick={(o) => o.stopPropagation()}>{t.party}</Link> : t.party}</td>
                          <td>{t.desc ?? ''}</td>
                          <td><Rozet ton="bilgi">{kategoriEtiketi(t)}</Rozet></td>
                          <td className="tc-tablo-sag mono tc-tablo-kirilmaz">
                            <span className={t.type === 'gelir' ? 'tc-fk-arti' : undefined}>{t.type === 'gider' ? '−' : '+'}{tl(Math.abs(isaretliTutar(t)))}</span>
                          </td>
                          <td><Rozet ton={d.ton}>{d.metin}</Rozet></td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Kart>
      {satirlar.length > gorunen.length && (
        <div className="tc-fk-daha">
          <Dugme onClick={() => sinirYaz((s) => s + SINIR_ADIMI)}>Daha fazla göster ({satirlar.length - gorunen.length})</Dugme>
        </div>
      )}
      {secili !== null && <KayitPenceresi key={secili} txId={secili} finans={finans} yetki={yetki} kapat={() => seciliYaz(null)} />}
    </div>
  );
}
