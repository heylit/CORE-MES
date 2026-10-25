import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
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

// Kayıtlar (prototipte VIEWS.kayit): girilen bütün satış, alış, tahsilat ve ödemeler; ay ay, en yeni üstte.
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
  const sutunlar: Sutun<Islem>[] = [
    { anahtar: 'tarih', baslik: 'Tarih', kirilmaz: true, hucre: (t) => kisaTarih(t.date) },
    {
      anahtar: 'cari', baslik: 'Cari',
      hucre: (t) => {
        const yol = firmaYolu(t);
        return yol ? <Link to={yol} onClick={(o) => o.stopPropagation()}>{t.party}</Link> : t.party;
      },
    },
    { anahtar: 'aciklama', baslik: 'Açıklama', hucre: (t) => t.desc ?? '' },
    { anahtar: 'kategori', baslik: 'Kategori', hucre: (t) => <Rozet ton="bilgi">{kategoriEtiketi(t)}</Rozet> },
    {
      anahtar: 'tutar', baslik: 'Tutar (KDV dahil)', hizala: 'sag', mono: true, kirilmaz: true,
      hucre: (t) => <span className={t.type === 'gelir' ? 'tc-fk-arti' : undefined}>{t.type === 'gider' ? '−' : '+'}{tl(Math.abs(isaretliTutar(t)))}</span>,
    },
    { anahtar: 'durum', baslik: 'Durum', hucre: (t) => { const d = kayitDurumu(t, bugun); return <Rozet ton={d.ton}>{d.metin}</Rozet>; } },
  ];

  return (
    <div className="tc-fk">
      <Kart>
        <p className="tc-fk-not">Girilen tüm satış, alış, tahsilat ve ödemeler. Düzeltmek için satıra tıklayın.</p>
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
          <Dugme simge="download" disabled={tx.length === 0} onClick={() => csvIndir('finans-kayitlar', CSV_BASLIKLARI, kayitCsvSatirlari(tx))}>
            Excel'e aktar
          </Dugme>
        </div>
      </Kart>
      {gorunen.length === 0 ? (
        <DurumKutusu durum="bos" mesaj="Bu filtrede kayıt yok." />
      ) : (
        aylaraBol(gorunen).map((g) => (
          <section key={g.ay} className="tc-fk-ay" aria-label={g.baslik}>
            <h3 className="tc-fk-ay-baslik">{g.baslik}</h3>
            <Tablo
              etiket={`${g.baslik} kayıtları`} sutunlar={sutunlar} satirlar={g.satirlar} satirAnahtari={(t) => t.id}
              satirSec={(t) => seciliYaz(t.id)}
            />
          </section>
        ))
      )}
      {satirlar.length > gorunen.length && (
        <div className="tc-fk-daha">
          <Dugme onClick={() => sinirYaz((s) => s + SINIR_ADIMI)}>Daha fazla göster ({satirlar.length - gorunen.length})</Dugme>
        </div>
      )}
      {secili !== null && <KayitPenceresi key={secili} txId={secili} finans={finans} yetki={yetki} kapat={() => seciliYaz(null)} />}
    </div>
  );
}
