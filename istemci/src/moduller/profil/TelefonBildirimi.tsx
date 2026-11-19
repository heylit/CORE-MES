import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BildirimPushDurumuCevabi } from '#paylasilan/sozlesme/bildirim.ts';
import { AcKapa, DurumKutusu, Kart, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { tarayiciPushOrtami, type PushOrtami } from './telefon-bildirimi.ts';

const PUSH_ANAHTARI = ['bildirim', 'push'] as const;

// Kişide kalan tek bildirim anahtarı (3435-1): hangi olayın kime hangi kanaldan gideceğini yönetici belirler, ama telefon bildirimi
// tarayıcı izniyle cihaz başına açılır, sunucudan verilemez. Anahtar yalnız sunucuda açık, tarayıcı destekli ve izin reddedilmemişken
// görünür; öteki durumda nedeni yazılır.
export function TelefonBildirimiKarti({ push }: { push?: PushOrtami } = {}) {
  const ortam = useState(() => push ?? tarayiciPushOrtami())[0];
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const durum = useQuery({ queryKey: PUSH_ANAHTARI, queryFn: () => api.get<BildirimPushDurumuCevabi>('/bildirimler/push'), enabled: ortam.destek });
  const mevcut = useQuery({ queryKey: [...PUSH_ANAHTARI, 'bu-cihaz'], queryFn: () => ortam.mevcut(), enabled: ortam.destek });
  const degistir = useMutation({
    mutationFn: async (ac: boolean): Promise<BildirimPushDurumuCevabi> => {
      if (ac) {
        const ucNokta = await ortam.aboneOl(durum.data?.acikAnahtar ?? '');
        return api.post<BildirimPushDurumuCevabi>('/bildirimler/push/abone-ol', { ucNokta });
      }
      const ucNokta = await ortam.birak();
      if (ucNokta === null) return durum.data as BildirimPushDurumuCevabi;
      return api.post<BildirimPushDurumuCevabi>('/bildirimler/push/abonelik-sil', { ucNokta });
    },
    onSuccess: (v) => {
      istemci.setQueryData(PUSH_ANAHTARI, v);
      void mevcut.refetch();
    },
    onError: (h) => {
      void mevcut.refetch();
      bildir('hata', hataIletisi(h, 'Telefon bildirimi değiştirilemedi.'));
    },
  });
  const neden = !ortam.destek ? 'Bu tarayıcı telefon bildirimini desteklemiyor. iPhone\'da uygulamayı ana ekrana ekleyip oradan açın.'
    : durum.isError ? 'Telefon bildirimi durumu alınamadı.'
    : durum.data !== undefined && (!durum.data.acik || durum.data.acikAnahtar === null) ? 'Telefon bildirimi sistemde kapalı.'
    : ortam.izin() === 'denied' ? 'Bu cihazda bildirim izni kapalı. Tarayıcı ayarlarından bu siteye izin verin, sonra anahtarı açın.'
    : null;
  const yukleniyor = neden === null && (durum.isPending || mevcut.isPending);
  const acik = mevcut.data !== null && mevcut.data !== undefined;
  return (
    <Kart baslik="Telefon bildirimi" simge="bell" baslikEki={<span className="tc-profil-soluk">Yalnız bu cihaz</span>}>
      {yukleniyor ? <DurumKutusu durum="yukleniyor" /> : (
        <>
          <p className="tc-profil-soluk tc-profil-mp-not">
            {neden ?? `Uygulama kapalıyken görev, hatırlatma ve acil bildirimler bu cihaza düşer · açık cihazınız: ${String(durum.data?.cihazSayisi ?? 0)}`}
          </p>
          {neden === null && (
            <ul className="tc-profil-mp-liste">
              <li className="tc-profil-mp-satir">
                <strong className="tc-profil-mp-ad">Bu cihaza bildir</strong>
                <AcKapa etiket="Uygulama kapalıyken bu cihaza bildir" acik={acik} disabled={degistir.isPending} degistir={(a) => degistir.mutate(a)} />
              </li>
            </ul>
          )}
        </>
      )}
      {neden === null && !yukleniyor && (
        <p className="tc-profil-soluk tc-profil-mp-not">
          Bildirimin içeriği şirket dışına çıkmaz: tarayıcının bildirim servisinden yalnız &quot;yeni bildirim var&quot; sinyali geçer, ayrıntıyı cihaz
          sunucudan kendisi alır. Şirket ağı dışındayken yalnız genel bir uyarı görünür.
        </p>
      )}
      <p className="tc-profil-soluk tc-profil-mp-not">Hangi olayın size uygulama, telefon ya da e-postayla geleceğini sistem yöneticiniz belirler.</p>
    </Kart>
  );
}
