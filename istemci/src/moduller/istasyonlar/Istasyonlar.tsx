import { Link, Navigate, useParams } from 'react-router-dom';
import { DurumKutusu, Kart, Rozet } from '../../ortak/arayuz/index.ts';
import { maddeGorunurMu } from '#paylasilan/sayfalar.ts';
import { IKINCI_MENU_TANIMLARI, menuMaddeleri, type MenuMaddesi } from '../../ortak/rota/ikinci-menu.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { GenelBakis } from './GenelBakis.tsx';
import { MakineSekmesi } from './MakineSekmesi.tsx';
import { MerkezIstasyonlari } from './MerkezIstasyonlari.tsx';
import { OperasyonTipleri } from './OperasyonTipleri.tsx';
import { PersonelSekmesi } from './PersonelSekmesi.tsx';
import { saatMetni } from './tesis.ts';
import { useTesisVerisi, useTesisYaz, type TesisVerisi } from './tesisVerisi.ts';
import { YetkinlikMatrisi } from './YetkinlikMatrisi.tsx';
import './istasyonlar.css';

// Bölümler ikinci menünün maddeleridir (`paylasilan/sayfalar/istasyonlar.ts`); menüyü kabuk çizer, bölümü adres seçer.
// Kök adresin maddesi `genel` bölümüdür; ötekilerin adı yolun son parçasıdır.
const KOK = '/istasyonlar';
const MENU = IKINCI_MENU_TANIMLARI.find((m) => m.kok === KOK);
const BOLUMLER: ReadonlyMap<string, MenuMaddesi> = new Map(
  (MENU === undefined ? [] : menuMaddeleri(MENU)).map((m) => [m.yol === KOK ? 'genel' : m.yol.slice(KOK.length + 1), m]),
);
type Bolum = 'genel' | 'is-merkezleri' | 'makineler' | 'personel' | 'yetkinlik' | 'vardiyalar' | 'operasyon-tipleri';
// Eski adresler (yer imi, paylaşılan bağlantı) yeni bölüme gider: ekipler ve kişi kısıtları Personel'in içindedir.
const TASINAN: Record<string, Exclude<Bolum, 'genel'>> = { ekipler: 'personel', 'kisi-kisitlari': 'personel' };

// Vardiya modülü bu modülün istasyon seçimini ithal eder; burada onun ekranı ithal edilirse modüller döngüye girer (sınır kuralı f).
// Düzen bu yüzden vardiya modülünün kendi ekranında yazılır; burada özet ve bağlantı vardır (BASKA-MODUL-ISTEKLERI 15).
function VardiyaBolumu({ v, sayfaVar }: { v: TesisVerisi; sayfaVar: boolean }) {
  if (v.takvim === undefined) return <DurumKutusu durum="yukleniyor" />;
  if (v.takvim === null) return <DurumKutusu durum="hata" mesaj="Vardiya bilgisi alınamadı; Vardiya sayfasını görme yetkiniz olmayabilir." />;
  const t = v.takvim;
  return (
    <div className="tc-ist-bolum">
      <div className="tc-ist-arac">
        <p className="tc-ist-ipucu">Vardiyalar, haftalık düzen, tatil günleri ve kişinin vardiyası Vardiya sayfasında yazılır; kişinin vardiyası Personel bölümünde de seçilir.</p>
        {sayfaVar && <div className="tc-ist-arac-sag"><Link to="/vardiya">Vardiya düzenini aç</Link></div>}
      </div>
      <section className="tc-ist-panel" aria-label="Vardiya tanımları">
        <h3 className="tc-ist-alt-baslik">Vardiya tanımları</h3>
        {t.vardiyalar.length === 0 ? <p className="tc-ist-ipucu">Vardiya tanımlı değil.</p> : (
          <div className="tc-ist-cipler">
            {t.vardiyalar.map((x) => (
              <span key={x.id} className={`tc-ist-cip${x.aktif ? '' : ' tc-ist-soluk'}`}>
                <b>{x.ad}</b> {x.baslangic}-{x.bitis}, net {saatMetni(x.netDakika)} sa{!x.aktif && <Rozet ton="pasif">Pasif</Rozet>}
              </span>
            ))}
          </div>
        )}
      </section>
      <section className="tc-ist-panel" aria-label="Haftalık çalışma">
        <h3 className="tc-ist-alt-baslik">Haftalık çalışma</h3>
        <div className="tc-ist-cipler">
          {t.isMerkezleri.filter((m) => m.aktif).map((m) => (
            <span key={m.id} className="tc-ist-cip"><span className="tc-ist-mono">{m.kod}</span> {m.ad}: {saatMetni(m.haftalikDakika)} sa</span>
          ))}
        </div>
      </section>
    </div>
  );
}

export function Istasyonlar() {
  const oturum = useOturum();
  const { bolum: adresteki } = useParams();
  const islemler = oturum.data?.islemler ?? [];
  const yazabilir = islemler.includes('istasyonlar.yaz');
  // Operasyon tipleri kendi verisini okur; tesis verisi orada istenmez.
  const v = useTesisVerisi(yazabilir, adresteki !== 'operasyon-tipleri');
  const y = useTesisYaz();

  if (!oturum.data) return null;
  const tasinan = adresteki === undefined ? undefined : TASINAN[adresteki];
  if (tasinan !== undefined) return <Navigate to={`/istasyonlar/${tasinan}`} replace />;
  // Kök adres genel bakıştır; aynı bölüm ikinci adresle (/istasyonlar/genel) açılmaz.
  const bolum = adresteki ?? 'genel';
  const tanim = BOLUMLER.get(bolum);
  if (tanim === undefined || adresteki === 'genel') return <p role="alert">İstasyonlarda böyle bir bölüm yok.</p>;
  if (!maddeGorunurMu(tanim, islemler)) return <p role="alert">Bu bölümü açma yetkiniz yok.</p>;
  return (
    // Bölüm adı ikinci menüde seçili madde olarak yazar; kartta yinelenmez. Ekran okuyucu için bölge adı kalır.
    <Kart>
      <div className="tc-ist-sayfa" role="region" aria-label={tanim.baslik}>
        {bolum === 'genel' && <GenelBakis v={v} />}
        {bolum === 'is-merkezleri' && <MerkezIstasyonlari v={v} y={y} yazabilir={yazabilir} />}
        {bolum === 'makineler' && <MakineSekmesi v={v} y={y} yazabilir={yazabilir} durumYazabilir={yazabilir || islemler.includes('istasyonlar.makine-durumu')} haritaVar={islemler.includes('sayfa.atolye')} />}
        {bolum === 'personel' && (
          <PersonelSekmesi v={v} y={y} yazabilir={yazabilir} kisitYazabilir={yazabilir || islemler.includes('arkon.amir')} benId={oturum.data.id} kisiAcabilir={islemler.includes('kisiler.yaz')} vardiyaYazabilir={islemler.includes('vardiya.yaz')} />
        )}
        {bolum === 'yetkinlik' && <YetkinlikMatrisi v={v} yazabilir={yazabilir} />}
        {bolum === 'vardiyalar' && <VardiyaBolumu v={v} sayfaVar={islemler.includes('sayfa.vardiya')} />}
        {bolum === 'operasyon-tipleri' && <OperasyonTipleri yazabilir={yazabilir} />}
      </div>
    </Kart>
  );
}
