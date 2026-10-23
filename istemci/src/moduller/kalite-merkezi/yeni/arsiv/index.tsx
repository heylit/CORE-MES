import { useState } from 'react';
import { IsaretKutusu, Secim } from '../../../../ortak/arayuz/Alan.tsx';
import { useBildirim } from '../../../../ortak/arayuz/Bildirim.tsx';
import { Dugme } from '../../../../ortak/arayuz/Dugme.tsx';
import { OnayPenceresi } from '../../../../ortak/arayuz/OnayPenceresi.tsx';
import { SayfaBasligi } from '../../../../ortak/arayuz/SayfaBasligi.tsx';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import type { EkranOzellikleri, KmSayaci } from '../sekmeler.ts';
import { useArsivGorunumu } from '../ArsivGorunumu.tsx';
import { useKmKomutu } from '../veri.ts';
import { Panel } from '../gostergeler/index.tsx';
import { ARSIV_AYLARI, arsivAdaylari } from './hesap.ts';
import '../gostergeler/k4.css';

// Arşiv: kapanmış eski kayıt listelerden kalkar, silinmez. Arşive alma yönetici işidir (229 a); "listelerde göster" anahtarı
// uygulamadaki gibi geneldir (ArsivGorunumu).
export function Arsiv({ veri, yetki }: EkranOzellikleri) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  const arsivGorunumu = useArsivGorunumu();
  const [ay, ayYaz] = useState(24);
  const [soruyor, soruyorYaz] = useState(false);
  const [calisiyor, calisiyorYaz] = useState(false);
  const A = arsivAdaylari(veri, ay);
  const toplam = A.reduce((a, x) => a + x.kayitlar.length, 0);

  const arsivle = async () => {
    soruyorYaz(false);
    calisiyorYaz(true);
    bildir('bilgi', 'Arşivleniyor…');
    try {
      for (const x of A) for (const r of x.kayitlar) await komut.kaydet(x.kol, { ...r, arsiv: true });
      await komut.izYaz({ islem: 'arşivleme', col: 'settings', id: 'arsiv', no: `${toplam} kayıt, ${ay} aydan eski` });
      bildir('tamam', `${toplam} kayıt arşive alındı`);
    } catch (e) {
      bildir('hata', hataIletisi(e, 'Arşivleme yarıda kaldı.'));
    } finally {
      calisiyorYaz(false);
    }
  };

  return (
    <div className="tc-km4">
      <SayfaBasligi
        baslik="Arşiv"
        simge="box"
        alt="Kapanmış eski kayıtlar listelerden kaldırılır ama silinmez; aramada ve parça sayfalarında &quot;arşiv&quot; etiketiyle bulunur. Listeleri sade ve hızlı tutar."
      />
      <Panel baslik="Arşivlenebilecek kayıtlar" alt="Yalnızca kapanmış, onaylanmış veya sonuçlanmış kayıtlar arşive alınır.">
        <Secim etiket="Şundan eski" value={String(ay)} onChange={(o) => ayYaz(Number(o.target.value))}
          secenekler={ARSIV_AYLARI.map((m) => ({ deger: String(m), baslik: `${m} ay` }))} />
        <div className="tc-km-tablo-kap">
          <table className="tc-km-tablo">
            <thead><tr><th>Kayıt türü</th><th className="tc-km4-sag">Arşivlenecek</th><th className="tc-km4-sag">Şu an arşivde</th></tr></thead>
            <tbody>
              {A.map((x) => <tr key={x.kol}><td>{x.ad}</td><td className="tc-km4-sag mono">{x.kayitlar.length}</td><td className="tc-km4-sag mono">{x.arsivde}</td></tr>)}
            </tbody>
          </table>
        </div>
        {yetki.arsiv && (
          <div className="tc-km4-satir">
            <Dugme simge="box" disabled={!toplam} yukleniyor={calisiyor} onClick={() => soruyorYaz(true)}>{`${toplam} kaydı arşive al`}</Dugme>
          </div>
        )}
      </Panel>
      <Panel baslik="Arşivi görüntüleme" alt="Listelerde arşivlenmiş kayıtları da göstermek için açın.">
        <IsaretKutusu etiket="Listelerde arşivlenmiş kayıtları göster" checked={arsivGorunumu.goster} onChange={(o) => arsivGorunumu.yaz(o.target.checked)} />
      </Panel>
      <OnayPenceresi acik={soruyor} baslik="Arşive al" onayMetni="Arşivle" onayla={() => void arsivle()} vazgec={() => soruyorYaz(false)}>
        {toplam} kayıt arşive alınacak. Kayıtlar silinmez; &quot;Arşivi göster&quot; ile ya da aramayla yeniden görülebilir.
      </OnayPenceresi>
    </div>
  );
}

export const ArsivSayaci: KmSayaci = null;
