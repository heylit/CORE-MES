import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type { RotaListesiCevabi } from '#paylasilan/sozlesme/rota.ts';
import { Dugme } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { DURUM_ETIKETI, kartAdi } from './gorunum.ts';
import { csvIndir } from './csv.ts';
import './kaynak.css';
import './rotalar.css';

// Rota revizyonları. Operasyon tipi kataloğu İstasyonlar > Operasyon tipleri'ndedir (#544); burada yalnız oraya bağlantı kalır.
export function OperasyonlarEkrani() {
  const yonlendir = useNavigate();
  const katalogGorur = (useOturum().data?.islemler ?? []).includes('sayfa.istasyonlar');
  const rotalar = useQuery({ queryKey: anahtarlar.liste, queryFn: () => api.get<RotaListesiCevabi>('/rota/urunler') });
  return (
    <div className="tc-merkez">
      <section className="tc-sch2" aria-label="Rota revizyonları">
        <div className="tc-satir">
          <h2>Rota revizyonları</h2>
          <span className="tc-grow" />
          <Dugme simge="sort" disabled={!rotalar.data?.rotalar.length} onClick={() => csvIndir('rota-revizyonlari', ['Stok kodu', 'Ürün', 'Yürürlükte', 'Açık revizyon', 'Durum', 'Revizyon sayısı'],
            (rotalar.data?.rotalar ?? []).map((r) => [r.urun.stokKodu, r.urun.ad, r.yururlukte ? `Rev ${r.yururlukte.harf}` : null, r.acik ? `Rev ${r.acik.harf}` : null,
              r.acik ? DURUM_ETIKETI[r.acik.durum] : null, r.revizyonSayisi]))}>CSV indir</Dugme>
        </div>
        <p className="tc-rota-ipucu">
          Plan her ürün için yürürlükteki revizyonu kullanır. Akış şemasında yapılan rota değişiklikleri taslak revizyona yazılır; onaylanınca yürürlüğe girer.
          {katalogGorur && <> Operasyon kataloğu <Link to="/istasyonlar/operasyon-tipleri">İstasyonlar &gt; Operasyon tipleri</Link> sayfasındadır.</>}
        </p>
        <div className="tc-kgrid tc-g-rv" role="table" aria-label="Rota revizyonları">
          <div className="tc-kgrid-bas" role="row"><span>Ürün</span><span>Yürürlükte</span><span>Açık revizyon</span><span>Revizyon</span><span /></div>
          {(rotalar.data?.rotalar ?? []).map((r) => (
            <div key={r.urun.id} className="tc-kgrid-satir" role="row">
              <b>{kartAdi(r.urun)}</b>
              <span>{r.yururlukte ? <span className="tc-rvchip tc-rv-yururlukte">Rev {r.yururlukte.harf}</span> : '–'}</span>
              <span>{r.acik ? <span className={`tc-rvchip tc-rv-${r.acik.durum}`}>Rev {r.acik.harf} {DURUM_ETIKETI[r.acik.durum].toLocaleLowerCase('tr-TR')}</span> : '–'}</span>
              <span>{r.revizyonSayisi}</span>
              <button type="button" className="tc-btn-sm" onClick={() => { void yonlendir(`/rota/${r.urun.id}`); }}>Akışta aç</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
