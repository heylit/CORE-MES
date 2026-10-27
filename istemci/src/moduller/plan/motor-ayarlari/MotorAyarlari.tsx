import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MotorAyarlari as Ayarlar, MotorAyarlariCevabi } from '#paylasilan/sozlesme/plan.ts';
import { Dugme, DurumKutusu, Kart, Secim, useBildirim } from '../../../ortak/arayuz/index.ts';
import { SayfaBasligi } from '../../../ortak/arayuz/SayfaBasligi.tsx';
import { api, hataIletisi } from '../../../ortak/veri/api.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import { AYAR_SECENEKLERI, degerAdi, surumMetni } from './kurallar.ts';

// Plan motoru ayarları (kart 811): planlama sayfalarını gören okur, plan.motor-ayari değiştirir (775 b). Kayıt yeni sürümdür; açık
// taslaklar açıldıkları sürümde kalır (774 a).
export const MOTOR_AYARLARI_YOLU = '/plan/motor-ayarlari';
const ANAHTAR = ['plan', 'motor-ayarlari'] as const;
const ANAHTARLAR = Object.keys(AYAR_SECENEKLERI) as (keyof Ayarlar)[];

export function MotorAyarlari() {
  const yazabilir = (useOturum().data?.islemler ?? []).includes('plan.motor-ayari');
  const q = useQuery({ queryKey: ANAHTAR, queryFn: () => api.get<MotorAyarlariCevabi>(MOTOR_AYARLARI_YOLU) });
  return (
    <div>
      <SayfaBasligi baslik="Motor ayarları" simge="gear" alt="Planlama motorunun amacı, eksik stokta davranışı ve sıralama kuralı." />
      {q.isPending ? <DurumKutusu durum="yukleniyor" />
        : q.isError ? <DurumKutusu durum="hata" mesaj={hataIletisi(q.error, 'Motor ayarları alınamadı')} yenile={() => { void q.refetch(); }} />
          : <Kart baslik="Güncel ayarlar" simge="gear">
            <p role="status">{surumMetni(q.data.guncel)}</p>
            {yazabilir ? <AyarFormu key={q.data.guncel.surumId ?? 0} degerler={q.data.guncel.degerler} /> : (
              <dl>
                {ANAHTARLAR.map((k) => <div key={k}><dt>{AYAR_SECENEKLERI[k].baslik}</dt><dd>{degerAdi(k, q.data.guncel.degerler[k])}</dd></div>)}
              </dl>
            )}
            <p>Değişiklik sonraki planları etkiler. Açık taslaklar açıldıkları ayarda kalır; planlamacı taslakta güncel ayarları uygulayabilir.</p>
          </Kart>}
    </div>
  );
}

function AyarFormu({ degerler }: { degerler: Ayarlar }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [f, setF] = useState<Ayarlar>(degerler);
  const degisti = ANAHTARLAR.some((k) => f[k] !== degerler[k]);
  const yaz = useMutation({
    mutationFn: () => api.post<MotorAyarlariCevabi>(MOTOR_AYARLARI_YOLU, f),
    onSuccess: (c) => { istemci.setQueryData(ANAHTAR, c); bildir('tamam', 'Motor ayarları kaydedildi.'); },
    onError: (h) => bildir('hata', hataIletisi(h, 'Motor ayarları kaydedilemedi.')),
  });
  const gonder = (e: FormEvent) => { e.preventDefault(); yaz.mutate(); };
  return (
    <form onSubmit={gonder} aria-label="Motor ayarlarını değiştir">
      {ANAHTARLAR.map((k) => (
        <Secim key={k} etiket={AYAR_SECENEKLERI[k].baslik} ipucu={AYAR_SECENEKLERI[k].ipucu} value={f[k]}
          onChange={(e) => setF({ ...f, [k]: e.target.value })} secenekler={AYAR_SECENEKLERI[k].secenekler} />
      ))}
      <Dugme type="submit" simge="check" disabled={!degisti} yukleniyor={yaz.isPending}>Kaydet</Dugme>
    </form>
  );
}
