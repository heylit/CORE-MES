import { Simge } from '../../../../ortak/arayuz/index.ts';
import { gunEtiketi } from '../bicim.ts';
import { useMesaj } from '../durum.tsx';
import { teslimEtiketi } from '../kurallar.ts';
import { GorevSatiri, OnayKarti } from '../kartlar/index.ts';
import { TeslimEtiketi } from '../kartlar/parcalar.tsx';
import { SiparisIlerlemesi } from '../kartlar/SiparisKarti.tsx';
import { DurumRozeti } from '../ortak/index.ts';
import { NotListesi } from './Notlar.tsx';
import { Baslik, Bolum, Ozellik } from './parcalar.tsx';

const sayi = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });

// Prototipin orderDetail'i salt okunur (212 a): durum, teslim ve ilerleme Siparişler ile Üretim Emirleri'nden gelir; durum
// düğmeleri, üretim girişi ve "Siparişi düzenle" yoktur. Bağlı işler ve notlar Mesaj'ındır.
export function SiparisAyrinti({ id }: { id: string }) {
  const { veri, yetki, siparisler, formAc } = useMesaj();
  const o = siparisler?.find((s) => s.id === id);
  if (!o) return <p className="tc-mi-bos-kucuk">{siparisler === null ? 'Sipariş bilgisi alınamadı.' : 'Bu sipariş listede yok.'}</p>;
  const yuzde = o.hedef && o.uretilen !== null ? Math.round((o.uretilen / o.hedef) * 100) : null;
  const gorevler = veri.gorevler.filter((t) => t.orderId === id);
  const onaylar = veri.onaylar.filter((a) => a.orderId === id);
  return (
    <div className="tc-mi-sayfa">
      <Baslik simge="box" baslik={<h3 className="tc-mi-sayfa-baslik">#{o.no} {o.musteri}</h3>} alt={o.urun || undefined} />
      <dl className="tc-mi-ozellikler">
        <Ozellik simge="check" ad="Durum">{o.durum ? <DurumRozeti tur="siparis" durum={o.durum} /> : '–'}</Ozellik>
        <Ozellik simge="clock" ad="Teslim">
          {o.teslim
            ? <span className="tc-mi-ust">{gunEtiketi(o.teslim)}{o.durum !== 'sevk' && <TeslimEtiketi etiket={teslimEtiketi(o.teslim)} />}</span>
            : '–'}
        </Ozellik>
        <Ozellik simge="box" ad="Miktar">{o.hedef === null ? '–' : `${sayi.format(o.hedef)} ${o.birim || 'adet'}`}</Ozellik>
      </dl>
      <Bolum baslik="İlerleme">
        <div className="tc-mi-siparis-alt">
          <SiparisIlerlemesi siparis={o} buyuk />
          {yuzde !== null && <span>%{yuzde}</span>}
        </div>
      </Bolum>
      <Bolum
        baslik="İşler"
        ek={yetki.yaz && (
          <span className="tc-mi-bolum-eylem">
            <button type="button" className="tc-mi-baglanti" onClick={() => formAc({ tur: 'gorev', ilk: { orderId: id } })}><Simge ad="plus" />Görev</button>
            <button type="button" className="tc-mi-baglanti" onClick={() => formAc({ tur: 'onay', ilk: { orderId: id } })}><Simge ad="plus" />Onay</button>
          </span>
        )}
      >
        {gorevler.length === 0 && onaylar.length === 0
          ? <p className="tc-mi-bos-kucuk">Bu siparişe bağlı iş yok.</p>
          : (
            <div className="tc-mi-liste">
              {onaylar.map((a) => <OnayKarti key={a.id} onay={a} iletide />)}
              {gorevler.map((t) => <GorevSatiri key={t.id} gorev={t} siparissiz />)}
            </div>
          )}
      </Bolum>
      <NotListesi koleksiyon="orders" id={id} />
    </div>
  );
}
