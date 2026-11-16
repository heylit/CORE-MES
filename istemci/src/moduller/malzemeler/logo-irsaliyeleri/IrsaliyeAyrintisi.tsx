import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import type { IrsaliyeCevabi } from '#paylasilan/sozlesme/logo.ts';
import { DurumKutusu, Kart, Rozet, SayfaBasligi, Simge } from '../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import { api } from '../../../ortak/veri/api.ts';
import { tarihMetni, tarihSaatMetni } from '../../../ortak/veri/zaman-metni.ts';
import { ALIS_TURLERI, birimMetni, DURUMLAR, IRSALIYE_ANAHTARI, irsaliyeYolu, miktarMetni } from './ortak.ts';
import './logo-irsaliyeleri.css';

type Satir = IrsaliyeCevabi['satirlar'][number];
type Karsilik = NonNullable<Satir['core']>;

// CORE karşılığının sayfası; düzeltme orada (mal kabul stokta, sevk sevkiyatta) ya da Logo'da yapılır. Bu sayfa hiçbir kaydı değiştirmez.
const KARSILIK: Readonly<Record<Karsilik['tur'], { yol: string; simge: SimgeAdi; ad: string }>> = {
  siparis: { yol: '/satin-alma/siparisler', simge: 'cart', ad: 'Sipariş' },
  sevk: { yol: '/sevkiyat/tum-isler', simge: 'truck', ad: 'Sevk' },
  'mal-kabul': { yol: '/stok/mal-kabul', simge: 'box', ad: 'Mal kabul' },
};

export function useIrsaliye(anahtar: { firma: number; donem: number; kayitNo: number } | null) {
  return useQuery({
    queryKey: [...IRSALIYE_ANAHTARI, 'tek', anahtar],
    queryFn: () => api.get<IrsaliyeCevabi>(`/logo/irsaliyeler/${anahtar!.firma}/${anahtar!.donem}/${anahtar!.kayitNo}`),
    enabled: anahtar !== null,
  });
}

function SatirKarti({ s, fiyatGorunur }: { s: Satir; fiyatGorunur: boolean }) {
  const d = DURUMLAR[s.durum];
  const karsilik = s.core === null ? null : KARSILIK[s.core.tur];
  return (
    <li className="tc-li-satir">
      <div className="tc-li-satir-bas">
        <b className="tc-li-mono">{s.malzemeKodu ?? 'Kodsuz satır'}</b>
        {s.malzemeAdi !== null && <span>{s.malzemeAdi}</span>}
        <Rozet ton={d.ton}><Simge ad={d.simge} />{d.ad}</Rozet>
      </div>
      <div className="tc-li-alt">
        Logo {miktarMetni(s.miktar)} {birimMetni(s.birim)}
        {s.coreMiktari !== null && <> · CORE teslim {miktarMetni(s.coreMiktari)} {birimMetni(s.coreBirimi)}</>}
        {s.siparisNo !== null && <> · Logo siparişi <span className="tc-li-mono">{s.siparisNo}</span></>}
      </div>
      {s.neden !== null && <div className="tc-li-alt">{s.neden}</div>}
      {fiyatGorunur && s.fiyat !== null && (
        <div className="tc-li-alt">
          Fiyat {miktarMetni(s.fiyat)} TL{s.tutar !== null && <> · Tutar {miktarMetni(s.tutar)} TL</>}
          {s.dovizTuru !== null && s.dovizTuru !== 0 && <> · döviz (Logo kur kodu {s.dovizTuru}){s.dovizFiyati !== null && <> {miktarMetni(s.dovizFiyati)}</>}</>}
        </div>
      )}
      {s.core !== null && karsilik !== null && (
        <Link className="tc-li-karsilik" to={karsilik.yol}><Simge ad={karsilik.simge} />{karsilik.ad} {s.core.no}</Link>
      )}
    </li>
  );
}

export function IrsaliyeIcerigi({ veri }: { veri: IrsaliyeCevabi }) {
  const b = veri.baslik;
  const d = DURUMLAR[b.durum];
  const alis = ALIS_TURLERI.includes(b.tur);
  return (
    <div className="tc-li-ayrinti">
      <div className="tc-li-ayrinti-bas">
        <h3 className="tc-li-mono">{b.fisNo ?? `Logo kaydı ${b.kayitNo}`}</h3>
        <Rozet ton={d.ton}><Simge ad={d.simge} />{d.ad}</Rozet>
      </div>
      <dl className="tc-li-alanlar">
        <dt>Tür</dt><dd>{b.turAdi} (Logo tür {b.tur})</dd>
        <dt>{alis ? 'Tedarikçi' : 'Müşteri'}</dt><dd>{b.cariAdi ?? '—'} {b.cariKodu !== null && <span className="tc-li-mono tc-li-soluk">{b.cariKodu}</span>}</dd>
        <dt>Tarih</dt><dd>{tarihMetni(b.tarih)}</dd>
        <dt>Ambar</dt><dd>{b.ambar ?? '—'}</dd>
        <dt>Belge</dt><dd>{b.eIrsaliye ? 'e-İrsaliye' : 'Kağıt'}{b.belgeNo !== null && <> · <span className="tc-li-mono">{b.belgeNo}</span></>}</dd>
        <dt>Fatura</dt><dd>{b.faturaNo ?? 'Henüz yok'}</dd>
        <dt>Okundu</dt><dd>{tarihSaatMetni(b.okumaZamani)}</dd>
      </dl>
      {(b.iptal || b.logodaYok) && <p className="tc-li-not">{b.logodaYok ? 'Bu irsaliye Logo\'da artık yok (silinmiş).' : 'Bu irsaliye Logo\'da iptal edilmiş.'}</p>}
      <h4>Satırlar ve CORE karşılığı</h4>
      {veri.satirlar.length === 0 ? <p className="tc-li-soluk">Satırı yok.</p> : (
        <ul className="tc-li-satirlar">{veri.satirlar.map((s) => <SatirKarti key={s.kayitNo} s={s} fiyatGorunur={veri.fiyatGorunur} />)}</ul>
      )}
      <p className="tc-li-not"><Simge ad="help" />Bu sayfa hiçbir kaydı değiştirmez. Fark mal kabulde, sevkte, siparişte ya da Logo&apos;da düzeltilir.</p>
    </div>
  );
}

// Tam sayfa: çekmecedeki ayrıntının kendi adresi (bağlantı paylaşılabilir).
export function IrsaliyeSayfasi() {
  const p = useParams();
  const anahtar = { firma: Number(p['firma']), donem: Number(p['donem']), kayitNo: Number(p['kayitNo']) };
  const gecerli = [anahtar.firma, anahtar.donem, anahtar.kayitNo].every((n) => Number.isSafeInteger(n) && n >= 0);
  const q = useIrsaliye(gecerli ? anahtar : null);
  const geri = q.data !== undefined && !ALIS_TURLERI.includes(q.data.baslik.tur) ? 'satis' : 'alis';
  return (
    <section className="tc-li-sayfa">
      <SayfaBasligi baslik="Logo irsaliyesi" simge="file" alt={<Link className="tc-li-geri" to={irsaliyeYolu(geri)}><Simge ad="back" />{geri === 'alis' ? 'Alış irsaliyeleri' : 'Satış irsaliyeleri'}</Link>} />
      <Kart>
        {!gecerli ? <DurumKutusu durum="bos" mesaj="İrsaliye bulunamadı." />
          : q.isPending ? <DurumKutusu durum="yukleniyor" />
            : q.isError ? <DurumKutusu durum="hata" hata={q.error} yenile={() => { void q.refetch(); }} />
              : <IrsaliyeIcerigi veri={q.data} />}
      </Kart>
    </section>
  );
}
