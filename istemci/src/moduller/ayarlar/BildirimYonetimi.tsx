import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { CagriYonlendirmeCevabi, CagriYonlendirmeSatiri } from '#paylasilan/sozlesme/bildirim.ts';
import type { CagriEkibi } from '#paylasilan/sozlesme/durus-nedenleri.ts';
import { DurumKutusu, IsaretKutusu, Kart, Sekmeler, Simge, useBildirim, type Sekme } from '../../ortak/arayuz/index.ts';
import { useYetki } from '../../ortak/veri/yetki.ts';
import { KademeliUyari } from '../bildirim/disari.ts';
import { BildirimMatrisi } from './BildirimMatrisi.tsx';
import { EpostaSablonlari } from './EpostaAyarlari.tsx';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import './ayarlar.css';

// Sözleşmedeki ad listesi zod'lu dosyadadır; istemci yalnız tip ithal eder, adlar burada tekrarlanır ve tip eksik ekibi yakalar.
const CAGRI_EKIP_ADLARI: Record<CagriEkibi, string> = {
  bakim: 'Bakım', kalite: 'Kalite', malzeme: 'Malzeme', amir: 'Vardiya amiri', ayarci: 'Ayarcı',
};
const EKIP_SIMGELERI: Record<CagriEkibi, SimgeAdi> = { bakim: 'wrench', kalite: 'search', malzeme: 'truck', amir: 'user', ayarci: 'tool' };

interface Degisim { ekip: CagriEkibi; rolIdleri: number[]; surum: number }

const zaman = (deger: string) => new Date(deger).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

// 3435-3 a: bildirim ve uyarının bütün ayarları tek sayfada. Olaylar sekmesi olay başına kanalları (alıcı, ekran ortası, telefon,
// e-posta, şablon) birlikte gösterir; şablonlar, kademeli uyarı kaynakları ve ekip çağrıları kendi sekmesindedir. Her sekme
// bugünkü işlemiyle görünür; yetki modeli değişmez.
// Olaylar tablosu alıcı, gösterim, telefon ve e-posta uçlarından dolar: yalnız kademeli uyarı yöneten kişiye boş kalır, ona gösterilmez.
type YonetimSekmesi = 'olaylar' | 'sablonlar' | 'kademe' | 'ekip';
type YonetimIslemi = 'ayarlar.yaz' | 'bildirim.eposta-yonet' | 'bildirim.kademe-yonet';
const SEKMELER: readonly (Sekme<YonetimSekmesi> & { islemler: readonly YonetimIslemi[] })[] = [
  { anahtar: 'olaylar', baslik: 'Olaylar', simge: 'grid', islemler: ['ayarlar.yaz', 'bildirim.eposta-yonet'] },
  { anahtar: 'sablonlar', baslik: 'E-posta şablonları', simge: 'mail', islemler: ['bildirim.eposta-yonet'] },
  { anahtar: 'kademe', baslik: 'Kademeli uyarı', simge: 'alert', islemler: ['bildirim.kademe-yonet'] },
  { anahtar: 'ekip', baslik: 'Ekip çağrıları', simge: 'users', islemler: ['ayarlar.yaz'] },
];
const sekmeMi = (d: string | null): d is YonetimSekmesi => SEKMELER.some((s) => s.anahtar === d);

export function BildirimYonetimi() {
  const yetki = useYetki();
  const [sorgu, setSorgu] = useSearchParams();
  const gorunen = SEKMELER.filter((s) => s.islemler.some((i) => yetki.var(i)));
  const ilk = gorunen[0]?.anahtar ?? 'olaylar';
  const istenen = sorgu.get('sekme');
  const secili = sekmeMi(istenen) && gorunen.some((s) => s.anahtar === istenen) ? istenen : ilk;
  const sec = (s: YonetimSekmesi) => { setSorgu(s === ilk ? {} : { sekme: s }, { replace: true }); };
  return (
    <div className="tc-eposta">
      <Sekmeler etiket="Bildirim ve uyarı yönetimi" sekmeler={gorunen} secili={secili} sec={sec} />
      <div className="tc-ayar-bolum" role="tabpanel" aria-label={gorunen.find((s) => s.anahtar === secili)?.baslik}>
        {secili === 'olaylar' && <BildirimMatrisi />}
        {secili === 'sablonlar' && <EpostaSablonlari />}
        {secili === 'kademe' && <KademeliUyari />}
        {secili === 'ekip' && <EkipCagrilari />}
      </div>
    </div>
  );
}

// Operatör bir ekibi çağırınca bildirim seçilen rollerdeki kişilere gider (298 a). Rol yetki vermez, yalnız alıcıyı seçer;
// boş bırakılan ekip kimseye gitmez. Her değişiklik o ekibin sürümüyle yazılır.
function EkipCagrilari() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const liste = useQuery({ queryKey: anahtarlar.cagriYonlendirme, queryFn: () => api.get<CagriYonlendirmeCevabi>('/bildirimler/cagri-yonlendirme') });
  const degisim = useMutation({
    mutationFn: ({ ekip, ...govde }: Degisim) => api.post<CagriYonlendirmeCevabi>(`/bildirimler/cagri-yonlendirme/${ekip}/degistir`, govde),
    onSuccess: (guncel) => {
      istemci.setQueryData(anahtarlar.cagriYonlendirme, guncel);
      bildir('tamam', 'Çağrı alıcıları kaydedildi.');
    },
    onError: (hata) => {
      bildir('hata', hataIletisi(hata, 'Çağrı alıcıları kaydedilemedi.'));
      void liste.refetch();
    },
  });

  if (liste.isPending) return <Kart baslik="Ekip çağrıları"><DurumKutusu durum="yukleniyor" /></Kart>;
  if (liste.isError) {
    return (
      <Kart baslik="Ekip çağrıları">
        <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Çağrı yönlendirmesi alınamadı.')} yenile={() => { void liste.refetch(); }} />
      </Kart>
    );
  }
  const { satirlar, roller } = liste.data;
  const cevir = (s: CagriYonlendirmeSatiri, rolId: number, secili: boolean) => {
    const rolIdleri = secili ? [...s.rolIdleri, rolId] : s.rolIdleri.filter((r) => r !== rolId);
    degisim.mutate({ ekip: s.ekip, rolIdleri, surum: s.surum });
  };

  return (
    <Kart baslik="Ekip çağrıları">
      <p className="tc-ayar-aciklama">
        Operatör bir ekibi çağırınca bildirim seçili rollerdeki kişilere gider. Rol seçmek yetki vermez; boş bırakılan ekibin çağrısı kimseye gitmez.
      </p>
      <ul className="tc-ayarlar" aria-label="Ekip çağrıları">
        {satirlar.map((s) => (
          <li key={s.ekip} className="tc-ayar tc-cagri-ekibi">
            <div className="tc-ayar-metin">
              <p className="tc-ayar-baslik"><Simge ad={EKIP_SIMGELERI[s.ekip]} boyut="k" /> {CAGRI_EKIP_ADLARI[s.ekip]}</p>
              <p className="tc-ayar-aciklama">
                {s.rolIdleri.length === 0 ? 'Kimseye gitmiyor' : `${s.rolIdleri.length} rol`}
                {s.degistiren !== null && ` · ${s.degistiren.ad ?? 'Silinmiş kişi'}, ${zaman(s.degistirildi)}`}
              </p>
            </div>
            <div className="tc-cagri-rolleri" role="group" aria-label={`${CAGRI_EKIP_ADLARI[s.ekip]} alıcı rolleri`}>
              {roller.map((r) => (
                <IsaretKutusu
                  key={r.id}
                  etiket={r.ad}
                  checked={s.rolIdleri.includes(r.id)}
                  disabled={degisim.isPending}
                  onChange={(o) => { cevir(s, r.id, o.target.checked); }}
                />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Kart>
  );
}
