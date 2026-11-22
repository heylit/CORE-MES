import type { ReactNode } from 'react';
import { alanAdi, eksikAlanlar, farkMetni, kimlikKodu, ozetSatirlari, tarihMetni, type Cm1Ozeti, type EtiketFarki } from '#paylasilan/etiket-kodu.ts';
import { Rozet } from './Rozet.tsx';
import { Simge } from './Simge.tsx';
import './etiket-bilgisi.css';

export type EtiketDurumu = 'okunuyor' | 'guncel' | 'eski' | 'cevrimdisi' | 'kayit-yok';

// Okutulan özet kodun (CM1) ekrandaki karşılığı. Sunucu kazanır: ekran önce kaydı gösterir, bu bileşen yalnız etiketin durumunu söyler.
// Güncel durum tek satırdır (art arda okutmada yer kaplamasın); uyarı gerektiren üç durum (eski, çevrimdışı, kayıt yok) kendi bandını taşır.
// Alan adları Türkçe yazılır, kısaltma yalnız etiketin kendisindedir. `eylemler` çağıranındır: yeniden basma yetkisi olmayan operatöre
// "Yeniden bas" konmaz, "Emri aç" konur.
export function EtiketBilgisi({ ozet, durum, farklar = [], eylemler }: { ozet: Cm1Ozeti | null; durum: EtiketDurumu; farklar?: readonly EtiketFarki[]; eylemler?: ReactNode }) {
  if (ozet === null) return null;
  const basim = ozet.basim === null ? null : tarihMetni(ozet.basim);
  const notlar = (
    <>
      {!ozet.surumTanindi && <p className="tc-etiket-not" role="status">Etiket sürümü tanınmadı; yalnız kimlik okundu ({kimlikKodu(ozet)}).</p>}
      {ozet.surumTanindi && ozet.eksikSayisi > 0 && (
        <p className="tc-etiket-not" role="status">
          Etikette {ozet.eksikSayisi} alan sığmadı{eksikAlanlar(ozet).length > 0 ? `: ${eksikAlanlar(ozet).map(alanAdi).join(', ')}` : ''}; bağlantı gelince kayıttan bakın.
        </p>
      )}
    </>
  );
  if (durum === 'okunuyor') return <p className="tc-etiket-satir" role="status"><Simge ad="clock" />Okunuyor</p>;
  if (durum === 'guncel') {
    return <div className="tc-etiket"><p className="tc-etiket-satir" data-ton="tamam" role="status"><Simge ad="check" />Etiket güncel{basim ? ` · basım ${basim}` : ''}</p>{notlar}</div>;
  }
  if (durum === 'kayit-yok') {
    return (
      <div className="tc-etiket">
        <div className="tc-etiket-bant" data-ton="hata" role="alert"><Simge ad="alert" /><span><b>Kayıt bulunamadı</b>{kimlikKodu(ozet)} sunucuda yok.</span></div>
        {notlar}
      </div>
    );
  }
  const satirlar = ozet.surumTanindi ? ozetSatirlari(ozet) : [];
  if (durum === 'eski') {
    return (
      <div className="tc-etiket">
        <div className="tc-etiket-bant" data-ton="dur" role="alert">
          <Simge ad="alert" />
          <span><b>Etiket eski: {farkMetni(farklar)}</b>Bu etiket {basim ? `${basim} basımına` : 'eski basıma'} göre; güncel kayıt farklı. Kullanma.</span>
        </div>
        {farklar.length > 0 && (
          <dl className="tc-etiket-alanlar">
            {farklar.map((f) => <div key={f.anahtar}><dt>{f.ad}</dt><dd>{f.kayitta} <Rozet ton="uyari" gorunum="cizgi">etikette {f.etikette}</Rozet></dd></div>)}
          </dl>
        )}
        {eylemler && <div className="tc-etiket-eylem">{eylemler}</div>}
        {notlar}
      </div>
    );
  }
  return (
    <div className="tc-etiket">
      <div className="tc-etiket-bant" data-ton="cevrimdisi" role="status">
        <Simge ad="laptop" />
        <span><b>Çevrimdışı bilgi{basim ? ` · basım ${basim}` : ''} · güncel olmayabilir</b>Aşağıdakiler etiketin kodundan okundu.</span>
      </div>
      {satirlar.length > 0 && (
        <dl className="tc-etiket-alanlar">
          {satirlar.map((s, i) => (
            <div key={`${s.ad}${String(i)}`} {...(s.eskir ? { 'data-soluk': '' } : {})}>
              <dt>{s.ad}</dt>
              <dd>{s.deger}{s.eskir && <> <Rozet ton="pasif" gorunum="cizgi">doğrulanmadı</Rozet></>}</dd>
            </div>
          ))}
        </dl>
      )}
      {notlar}
    </div>
  );
}
