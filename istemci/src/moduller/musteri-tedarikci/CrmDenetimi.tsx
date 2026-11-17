import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { LOGO_CRM_DENETIM_SINIRI } from '#paylasilan/sozlesme/logo-gecisi-sabitleri.ts';
import type { LogoCrmDenetimiCevabi } from '#paylasilan/sozlesme/logo.ts';
import { Dugme, DurumKutusu, Kart, Rozet, Tablo, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';

// 3391-2 a: Logo geçişinde CRM bağı denetimi. Aktif müşterilerin carileri Logo'da tek tek sorulur (tek lisanslı yardımcı); bu yüzden
// düğmeyle çalışır, kendiliğinden yinelenmez. Yalnız düzeltilecek müşteriler listelenir; düzeltme firma kartında ya da Logo'dadır.
type Satir = LogoCrmDenetimiCevabi['satirlar'][number];
const SORUN: Record<Satir['sorun'], { ad: (s: Satir) => string; ton: RozetTonu; ne: string }> = {
  'crm-yok': { ad: () => 'CRM yok', ton: 'hata', ne: "Logo'da cariyi bir CRM satış müşterisine bağlayın; yoksa teklif gitmez." },
  'cok-bag': { ad: (s) => `CRM ×${String(s.sayi ?? 2)}`, ton: 'uyari', ne: "Firma kartında tekliflerde kullanılacak kodu seçin; seçilmezse Logo'nun seçtiği (varsayılan işaretli) bağ gider." },
  'secim-kalkti': { ad: () => 'Seçim geçersiz', ton: 'hata', ne: "Seçili kod Logo'da artık bağlı değil; firma kartında yeniden seçin." },
};

export function CrmDenetimi() {
  const navigate = useNavigate();
  const sorgu = useQuery({
    queryKey: ['logo', 'crm-denetimi'],
    queryFn: () => api.get<LogoCrmDenetimiCevabi>('/logo/crm-denetimi'),
    enabled: false,
    gcTime: 0,
  });
  const veri = sorgu.data;
  const sutunlar: Sutun<Satir>[] = [
    { anahtar: 'firma', baslik: 'Firma', hucre: (s) => <span className="tc-mt-ad">{s.kod && <span className="mono">{s.kod}</span>}{s.ad}</span> },
    { anahtar: 'cari', baslik: 'Logo cari', mono: true, kirilmaz: true, hucre: (s) => s.cariKodu },
    { anahtar: 'sorun', baslik: 'Durum', hucre: (s) => <Rozet ton={SORUN[s.sorun].ton}>{SORUN[s.sorun].ad(s)}</Rozet> },
    { anahtar: 'ne', baslik: 'Yapılacak', hucre: (s) => <span className="tc-mt-gecis-ek">{SORUN[s.sorun].ne}</span> },
    {
      anahtar: 'ac', baslik: '', hizala: 'sag', kirilmaz: true,
      hucre: (s) => (
        <Dugme simge="next" aria-label={`${s.ad} firmasını aç`} onClick={() => { void navigate(`/musteri-tedarikci?firma=${String(s.firmaId)}`); }}>Firmayı aç</Dugme>
      ),
    },
  ];
  return (
    <Kart baslik="CRM bağı denetimi" simge="users" sag={(
      <Dugme simge="search" yukleniyor={sorgu.isFetching} onClick={() => { void sorgu.refetch(); }}>Denetle</Dugme>
    )}>
      <p className="tc-mt-yok">
        {`Aktif müşterilerin Logo carileri tek tek sorulur (en çok ${String(LOGO_CRM_DENETIM_SINIRI)}); CRM'siz, birden fazla CRM müşterisine bağlı ve seçimi geçersiz olanlar listelenir. Logo'ya yazılmaz.`}
      </p>
      {sorgu.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'CRM bağları denetlenemedi.')} yenile={() => { void sorgu.refetch(); }} />}
      {veri && veri.durum !== 'tamam' && <p className="tc-mt-hata" role="alert">{veri.neden ?? 'Logo okunamadı.'}{veri.taranan > 0 ? ` ${String(veri.taranan)} cari denetlendi.` : ''}</p>}
      {veri && veri.durum === 'tamam' && (
        <p className="tc-mt-yok" role="status">
          {`${String(veri.taranan)} cari denetlendi; ${veri.satirlar.length === 0 ? 'düzeltilecek yok' : `${String(veri.satirlar.length)} düzeltilecek`}.`}
          {veri.eksik ? ` İlk ${String(LOGO_CRM_DENETIM_SINIRI)} müşteri denetlendi; kalanlar için firmaları tek tek açın.` : ''}
        </p>
      )}
      {veri && veri.satirlar.length > 0 && (
        <Tablo etiket="CRM bağı düzeltilecek müşteriler" sutunlar={sutunlar} satirlar={veri.satirlar} satirAnahtari={(s) => s.firmaId}
          bosMesaj="Düzeltilecek müşteri yok." arac={{ csv: { ad: 'logo-crm-denetimi' } }} />
      )}
    </Kart>
  );
}
