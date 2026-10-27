import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { islemAdi } from '#paylasilan/islem-adlari.ts';
import type {
  BildirimAliciDegistirGovdesi, BildirimAliciSatiri, BildirimAlicilariCevabi, BildirimOnemi, CagriYonlendirmeCevabi, CagriYonlendirmeSatiri,
} from '#paylasilan/sozlesme/bildirim.ts';
import type { CagriEkibi } from '#paylasilan/sozlesme/durus-nedenleri.ts';
import { Dugme, DurumKutusu, IsaretKutusu, Kart, Secim, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
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

export function BildirimYonetimi() {
  return (
    <>
      <EkipCagrilari />
      <BildirimAlicilari />
    </>
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

const ONEM_SIMGELERI: Record<BildirimOnemi, SimgeAdi> = { bilgi: 'bell', uyari: 'alert', acil: 'alert' };

interface AliciDegisimi extends BildirimAliciDegistirGovdesi { tur: BildirimAliciSatiri['tur'] }

// Tür başına alıcılar (760 c, 761 b): seçim yapılan türde bildirim yalnız seçilen rollerdeki ve seçilen kişilere gider, yönetici de
// seçilmediyse almaz. Seçimsiz türde türün işlemini taşıyanlar alır. Talebi açan gibi kayda bağlı kişi her durumda alır.
function BildirimAlicilari() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const liste = useQuery({ queryKey: anahtarlar.bildirimAlicilari, queryFn: () => api.get<BildirimAlicilariCevabi>('/bildirimler/alicilar') });
  const degisim = useMutation({
    mutationFn: ({ tur, ...govde }: AliciDegisimi) => api.post<BildirimAlicilariCevabi>(`/bildirimler/alicilar/${tur}/degistir`, govde),
    onSuccess: (guncel) => {
      istemci.setQueryData(anahtarlar.bildirimAlicilari, guncel);
      bildir('tamam', 'Bildirim alıcıları kaydedildi.');
    },
    onError: (hata) => {
      bildir('hata', hataIletisi(hata, 'Bildirim alıcıları kaydedilemedi.'));
      void liste.refetch();
    },
  });

  if (liste.isPending) return <Kart baslik="Bildirim alıcıları"><DurumKutusu durum="yukleniyor" /></Kart>;
  if (liste.isError) {
    return (
      <Kart baslik="Bildirim alıcıları">
        <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Bildirim alıcıları alınamadı.')} yenile={() => { void liste.refetch(); }} />
      </Kart>
    );
  }
  const { satirlar, roller, kisiler } = liste.data;
  const kisiAdi = new Map(kisiler.map((k) => [k.id, k.ad]));
  const yaz = (s: BildirimAliciSatiri, rolIdleri: number[], kisiIdleri: number[]) => {
    degisim.mutate({ tur: s.tur, rolIdleri, kisiIdleri, surum: s.surum });
  };
  const ozet = (s: BildirimAliciSatiri): string => {
    if (s.surum === null) {
      return s.varsayilanIslemler.length === 0
        ? 'Varsayılan: yalnız kayda bağlı kişiler'
        : `Varsayılan: ${s.varsayilanIslemler.map(islemAdi).join(', ')} yetkisi olanlar`;
    }
    const parcalar = [s.rolIdleri.length > 0 ? `${s.rolIdleri.length} rol` : null, s.kisiIdleri.length > 0 ? `${s.kisiIdleri.length} kişi` : null];
    return `Yalnız seçilenler: ${parcalar.filter(Boolean).join(', ')}`;
  };

  return (
    <Kart baslik="Bildirim alıcıları">
      <p className="tc-ayar-aciklama">
        Rol ya da kişi seçilen bildirim yalnız seçilenlere gider; yönetici de seçilmediyse almaz. Seçim yapılmayan bildirim, türün yetkisini
        taşıyanlara gider. Talebi açan gibi kayda bağlı kişi her durumda alır. Seçim yetki vermez.
      </p>
      <ul className="tc-ayarlar" aria-label="Bildirim alıcıları">
        {satirlar.map((s) => {
          const eklenebilir = kisiler.filter((k) => !s.kisiIdleri.includes(k.id));
          return (
            <li key={s.tur} className="tc-ayar tc-cagri-ekibi">
              <div className="tc-ayar-metin">
                <p className="tc-ayar-baslik"><Simge ad={ONEM_SIMGELERI[s.onem]} boyut="k" /> {s.baslik}</p>
                <p className="tc-ayar-aciklama">
                  {ozet(s)}
                  {s.degistiren !== null && s.degistirildi !== null && ` · ${s.degistiren.ad ?? 'Silinmiş kişi'}, ${zaman(s.degistirildi)}`}
                </p>
                {s.surum !== null && (
                  <Dugme simge="x" disabled={degisim.isPending} onClick={() => { yaz(s, [], []); }}>Seçimi kaldır</Dugme>
                )}
              </div>
              <div className="tc-alici-secimi">
                <div className="tc-cagri-rolleri" role="group" aria-label={`${s.baslik} alıcı rolleri`}>
                  {roller.map((r) => (
                    <IsaretKutusu
                      key={r.id}
                      etiket={r.ad}
                      checked={s.rolIdleri.includes(r.id)}
                      disabled={degisim.isPending}
                      onChange={(o) => {
                        yaz(s, o.target.checked ? [...s.rolIdleri, r.id] : s.rolIdleri.filter((x) => x !== r.id), s.kisiIdleri);
                      }}
                    />
                  ))}
                </div>
                <ul className="tc-alici-kisiler" aria-label={`${s.baslik} alıcı kişiler`}>
                  {s.kisiIdleri.map((id) => (
                    <li key={id}>
                      <Dugme
                        simge="x"
                        disabled={degisim.isPending}
                        aria-label={`${kisiAdi.get(id) ?? `Kişi ${id}`} çıkar`}
                        onClick={() => { yaz(s, s.rolIdleri, s.kisiIdleri.filter((x) => x !== id)); }}
                      >
                        {kisiAdi.get(id) ?? `Kişi ${id}`}
                      </Dugme>
                    </li>
                  ))}
                </ul>
                <Secim
                  etiket="Kişi ekle"
                  value=""
                  bosSecenek="Kişi seçin"
                  disabled={degisim.isPending || eklenebilir.length === 0}
                  secenekler={eklenebilir.map((k) => ({ deger: String(k.id), baslik: k.ad }))}
                  onChange={(o) => {
                    const id = Number(o.target.value);
                    if (id > 0) yaz(s, s.rolIdleri, [...s.kisiIdleri, id]);
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Kart>
  );
}
