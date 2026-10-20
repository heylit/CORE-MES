import { DurumKutusu } from '../../ortak/arayuz/index.ts';
import { ApiHatasi } from '../../ortak/veri/api.ts';

// Rota sayfasındaki bölümlerden bazılarının verisi başka modüllerdedir (karar K2). O modülün ucu bu kurulumda yoksa (404) bölüm
// hata değil "modülü bekleniyor" gösterir; başka hata olağan hata kutusuyla gösterilir.
export function BolumHatasi({ hata, modul, yenile }: { hata: unknown; modul: string; yenile: () => void }) {
  if (hata instanceof ApiHatasi && hata.durum === 404) {
    return (
      <div className="tc-emptycv" role="status">
        <h3>{modul} modülü bekleniyor</h3>
        <p className="tc-rota-ipucu">Bu bölümün verisi {modul} modülündedir. Modül bu kuruluma eklenince bölüm burada, aynı görünümle açılır.</p>
      </div>
    );
  }
  return <DurumKutusu durum="hata" yenile={yenile} />;
}
