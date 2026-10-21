import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CagriYonlendirmeCevabi, CagriYonlendirmeSatiri } from '#paylasilan/sozlesme/bildirim.ts';
import type { CagriEkibi } from '#paylasilan/sozlesme/durus-nedenleri.ts';
import { DurumKutusu, IsaretKutusu, Kart, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

// Sözleşmedeki ad listesi zod'lu dosyadadır; istemci yalnız tip ithal eder, adlar burada tekrarlanır ve tip eksik ekibi yakalar.
const CAGRI_EKIP_ADLARI: Record<CagriEkibi, string> = {
  bakim: 'Bakım', kalite: 'Kalite', malzeme: 'Malzeme', amir: 'Vardiya amiri', ayarci: 'Ayarcı',
};
const EKIP_SIMGELERI: Record<CagriEkibi, SimgeAdi> = { bakim: 'wrench', kalite: 'search', malzeme: 'truck', amir: 'user', ayarci: 'tool' };

interface Degisim { ekip: CagriEkibi; rolIdleri: number[]; surum: number }

const zaman = (deger: string) => new Date(deger).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

// Operatör bir ekibi çağırınca bildirim seçilen rollerdeki kişilere gider (298 a). Rol yetki vermez, yalnız alıcıyı seçer;
// boş bırakılan ekip kimseye gitmez. Her değişiklik o ekibin sürümüyle yazılır.
export function BildirimYonetimi() {
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
