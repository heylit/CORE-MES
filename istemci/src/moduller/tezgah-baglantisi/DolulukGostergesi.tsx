import { Link } from 'react-router-dom';
import type { TezgahDoluluguCevabi } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';
import { Rozet, Simge } from '../../ortak/arayuz/index.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';
import { DOLULUK_SEVIYESI, boyutMetni, dakikadaMetni, kayitYasiMetni, ondalikMetni, sayiMetni, yuzdeMetni } from './gosterim.ts';

const TON: Record<TezgahDoluluguCevabi['seviye'], RozetTonu> = { normal: 'tamam', uyari: 'uyari', kritik: 'hata' };

// Normalde tek satır; uyarı ve kritikte açıklama cümlesi ve dört sayı karosu (kart 3680, "Karma"). Yalnız okur.
export function DolulukGostergesi({ doluluk: d, simdi }: { doluluk: TezgahDoluluguCevabi; simdi: number }) {
  const sorunlu = d.seviye !== 'normal';
  const olcum = d.olcum;
  return (
    <section className="tc-tzb-dol" data-seviye={d.seviye} aria-label="Geçmiş doluluğu">
      <div className="tc-tzb-dol-ust">
        <span className="tc-tzb-dol-ad"><Simge ad="layers" boyut="k" /><strong>Geçmiş doluluğu</strong><Rozet ton={TON[d.seviye]}>{DOLULUK_SEVIYESI[d.seviye]}</Rozet></span>
        <strong className="tc-tzb-dol-yuzde">{yuzdeMetni(d.yuzde)}</strong>
      </div>
      <progress className="tc-tzb-dol-cubuk" max={100} value={Math.min(100, d.yuzde)} aria-label={`Geçmiş tablosu doluluğu ${yuzdeMetni(d.yuzde)}`} />
      <p className="tc-tzb-not">
        {sayiMetni(d.satirSayisi)} / {sayiMetni(d.satirSiniri)} satır · {olcum === null ? 'ölçüm başlıyor' : `${ondalikMetni(olcum.yazilanDakikada)} satır/dk yazılıyor`}
      </p>
      {sorunlu && (
        <>
          <p className="tc-tzb-dol-uyari" role="status">
            <Simge ad="alert" boyut="k" />
            <span>Dolunca en eski kayıtlar silinir; sınırı <Link to="/ayarlar">Sistem Ayarları</Link>’nda (“Tezgâh değer geçmişi satır sınırı”) yükseltin.</span>
          </p>
          <dl className="tc-tzb-dol-karolar">
            <div><dt>Yazılan (son 60 dk)</dt><dd>{olcum === null ? 'Ölçüm başlıyor' : dakikadaMetni(olcum.yazilanDakikada)}</dd></div>
            <div><dt>Atlanan (eşik altı değişim)</dt><dd>{olcum === null ? 'Ölçüm başlıyor' : dakikadaMetni(olcum.atlananDakikada)}</dd></div>
            <div><dt>Tablo boyutu</dt><dd>{boyutMetni(d.diskBayt)}</dd></div>
            <div><dt>En eski kayıt (yaşı)</dt><dd>{kayitYasiMetni(d.enEskiKayit, simdi)}</dd></div>
          </dl>
        </>
      )}
    </section>
  );
}
