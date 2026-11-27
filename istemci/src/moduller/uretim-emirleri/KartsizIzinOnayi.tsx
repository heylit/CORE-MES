import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import type { KartsizIzin, KartsizIzinKararGovdesi } from '#paylasilan/sozlesme/kartsiz-izin.ts';
import { CokSatir, Dugme, DurumKutusu, Kart, Rozet, SayfaBasligi, type RozetTonu } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import './uretim-emirleri.css';
import './kartsiz-izin.css';

// 3771 a: yetkili, operatörün çağrısını bildirimden açar ve telefondan gerekçeyle izin verir ya da reddeder. İzin tek iş ve tek
// operatör içindir; operatörün yetkisi değişmez. Gerekçe ve izni veren başlatma kaydına geçer. Sayfa Adım Durumu'nun altındadır:
// izni verebilen roller (yönetici, üretim müdürü) bu sayfayı açar.
export const KARTSIZ_IZIN_ISLEMI = 'uretim-emirleri.kartsiz-baslat';
const GEREKCE_AZAMI = 500;
const izinUcu = (id: string) => `/uretim-emirleri/kartsiz-izinler/${id}`;
const DURUM: Readonly<Record<KartsizIzin['durum'], { ad: string; ton: RozetTonu }>> = {
  bekliyor: { ad: 'Cevap bekliyor', ton: 'uyari' }, izin: { ad: 'İzin verildi', ton: 'tamam' }, kullanildi: { ad: 'İzinle başladı', ton: 'tamam' },
  ret: { ad: 'Reddedildi', ton: 'hata' }, iptal: { ad: 'Operatör iptal etti', ton: 'pasif' }, 'sure-doldu': { ad: 'Süre doldu', ton: 'pasif' },
};
const saat = (an: string | null): string => (an === null ? '' : new Date(an).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));

export function KartsizIzinOnayi() {
  const { id = '' } = useParams();
  const istemci = useQueryClient();
  const izinVerir = (useOturum().data?.islemler ?? []).includes(KARTSIZ_IZIN_ISLEMI);
  const [gerekce, gerekceYaz] = useState('');
  const anahtar = ['uretim-emirleri', 'kartsiz-izin', id] as const;
  const izin = useQuery({ queryKey: anahtar, queryFn: () => api.get<KartsizIzin>(izinUcu(id)), refetchInterval: (q) => (q.state.data?.durum === 'bekliyor' ? 5000 : false) });
  const karar = useMutation({
    mutationFn: (g: KartsizIzinKararGovdesi) => tekrarKorumaliGonder((d) => api.post<KartsizIzin>(`${izinUcu(id)}/karar`, g, d)),
    onSuccess: (c) => { istemci.setQueryData(anahtar, c); },
  });
  const z = izin.data;
  if (z === undefined) return <DurumKutusu durum={izin.isError ? 'hata' : 'yukleniyor'} hata={izin.error} yenile={() => { void izin.refetch(); }} />;
  const d = DURUM[z.durum];
  const adim = z.adim === null ? '' : ` · Op ${String(z.adim.sira)} ${z.adim.ad}`;
  const gonder = (sonuc: 'izin' | 'ret') => { if (gerekce.trim() !== '') karar.mutate({ sonuc, gerekce: gerekce.trim() }); };
  return (
    <section className="tc-ue-kartsiz-izin">
      <SayfaBasligi baslik="Kartsız başlatma izni" simge="alert" alt={z.emir.no} ek={<Rozet ton={d.ton}>{d.ad}</Rozet>} />
      <Kart>
        <dl className="tc-ue-kartsiz-izin-bilgi">
          <dt>İş</dt><dd>{`${z.emir.no}${adim}`}</dd>
          <dt>Operatör</dt><dd>{z.isteyen.ad}</dd>
          <dt>İstek</dt><dd>{saat(z.istekAn)}</dd>
          {z.kararVeren === null ? null : <><dt>Karar</dt><dd>{`${z.kararVeren}, ${saat(z.kararAn)}: "${z.kararGerekce ?? ''}"`}</dd></>}
        </dl>
        <p className="tc-ue-kartsiz-izin-not">İzin yalnız bu iş ve bu operatör içindir, bir kez kullanılır ve 10 dakika geçerlidir. Gerekçe ve adınız başlatma kaydına geçer.</p>
        {z.durum === 'bekliyor' && izinVerir ? (
          <form onSubmit={(e) => { e.preventDefault(); gonder('izin'); }}>
            <CokSatir etiket="Gerekçe (zorunlu)" maxLength={GEREKCE_AZAMI} value={gerekce} onChange={(e) => { gerekceYaz(e.target.value); }}
              hata={karar.isError ? hataIletisi(karar.error, 'Karar kaydedilemedi.') : undefined} placeholder="Örnek: kart basılmadı, ilk parti" />
            <div className="tc-ue-kartsiz-izin-dugmeler">
              <Dugme type="submit" tur="birincil" simge="check" yukleniyor={karar.isPending && karar.variables.sonuc === 'izin'} disabled={gerekce.trim() === ''}>İzin ver</Dugme>
              <Dugme type="button" tur="ikincil" simge="x" yukleniyor={karar.isPending && karar.variables.sonuc === 'ret'} disabled={gerekce.trim() === ''} onClick={() => { gonder('ret'); }}>Reddet</Dugme>
            </div>
          </form>
        ) : z.durum === 'bekliyor' ? <p className="tc-ue-kartsiz-izin-not">İzni kartsız başlatma yetkisi olan kişi verir.</p> : null}
      </Kart>
    </section>
  );
}
