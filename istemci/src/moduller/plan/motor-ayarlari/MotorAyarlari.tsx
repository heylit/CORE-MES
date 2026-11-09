import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MotorAyarlari as Ayarlar, MotorAyarlariCevabi } from '#paylasilan/sozlesme/plan.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Secim, useBildirim } from '../../../ortak/arayuz/index.ts';
import { SayfaBasligi } from '../../../ortak/arayuz/SayfaBasligi.tsx';
import { api, ApiHatasi, hataIletisi } from '../../../ortak/veri/api.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import { ACIL_PAY, ACIL_PAY_SINIRI, AYAR_SECENEKLERI, degerAdi, secilebilir, surumMetni, yuzdeMetni, yuzdeOku, type SecimAyari } from './kurallar.ts';

// Plan motoru ayarları (kart 811): planlama sayfalarını gören okur, plan.motor-ayari değiştirir (775 b). Kayıt yeni sürümdür; açık
// taslaklar açıldıkları sürümde kalır (774 a).
export const MOTOR_AYARLARI_YOLU = '/plan/motor-ayarlari';
const ANAHTAR = ['plan', 'motor-ayarlari'] as const;
const ANAHTARLAR = Object.keys(AYAR_SECENEKLERI) as SecimAyari[];

export function MotorAyarlari() {
  const yazabilir = (useOturum().data?.islemler ?? []).includes('plan.motor-ayari');
  const q = useQuery({ queryKey: ANAHTAR, queryFn: () => api.get<MotorAyarlariCevabi>(MOTOR_AYARLARI_YOLU) });
  return (
    <div>
      <SayfaBasligi baslik="Motor ayarları" simge="gear" alt="Planlama motorunun amacı, eksik stokta davranışı, sıralama kuralı, süre öğrenmesi ve acil iş payı." />
      {q.isPending ? <DurumKutusu durum="yukleniyor" />
        : q.isError ? <DurumKutusu durum="hata" mesaj={hataIletisi(q.error, 'Motor ayarları alınamadı')} yenile={() => { void q.refetch(); }} />
          : <Kart baslik="Güncel ayarlar" simge="gear">
            <p role="status">{surumMetni(q.data.guncel)}</p>
            {yazabilir ? <AyarFormu key={q.data.guncel.surumId ?? 0} surumId={q.data.guncel.surumId} degerler={q.data.guncel.degerler} /> : (
              <dl>
                {ANAHTARLAR.map((k) => <div key={k}><dt>{AYAR_SECENEKLERI[k].baslik}</dt><dd>{degerAdi(k, q.data.guncel.degerler[k])}</dd></div>)}
                <div><dt>{ACIL_PAY.baslik}</dt><dd>{yuzdeMetni(q.data.guncel.degerler.acilPay)}</dd></div>
              </dl>
            )}
            <p>Değişiklik sonraki planları etkiler. Açık taslaklar açıldıkları ayarda kalır; planlamacı taslakta güncel ayarları uygulayabilir.</p>
          </Kart>}
    </div>
  );
}

// 1786 (PLN-9): okunan sürümle yazılır; arada başkası yazdıysa sunucu reddeder, ekran güncel ayarı yeniden okur.
function AyarFormu({ degerler, surumId }: { degerler: Ayarlar; surumId: number | null }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [f, setF] = useState<Ayarlar>(degerler);
  const [pay, setPay] = useState(yuzdeMetni(degerler.acilPay));
  const payOrani = yuzdeOku(pay, ACIL_PAY_SINIRI);
  const degisti = ANAHTARLAR.some((k) => f[k] !== degerler[k]) || (payOrani !== null && payOrani !== degerler.acilPay);
  const yaz = useMutation({
    mutationFn: () => api.post<MotorAyarlariCevabi>(MOTOR_AYARLARI_YOLU, { ...f, acilPay: payOrani ?? degerler.acilPay, surumId }),
    onSuccess: (c) => { istemci.setQueryData(ANAHTAR, c); bildir('tamam', 'Motor ayarları kaydedildi.'); },
    onError: (h) => {
      bildir('hata', hataIletisi(h, 'Motor ayarları kaydedilemedi.'));
      if (h instanceof ApiHatasi && h.durum === 409) void istemci.invalidateQueries({ queryKey: ANAHTAR });
    },
  });
  const gonder = (e: FormEvent) => { e.preventDefault(); yaz.mutate(); };
  return (
    <form onSubmit={gonder} aria-label="Motor ayarlarını değiştir">
      {ANAHTARLAR.map((k) => (
        <Secim key={k} etiket={AYAR_SECENEKLERI[k].baslik} ipucu={AYAR_SECENEKLERI[k].ipucu} value={f[k]}
          onChange={(e) => setF({ ...f, [k]: e.target.value })} secenekler={secilebilir(k, degerler[k])} />
      ))}
      <Girdi etiket={ACIL_PAY.baslik} ipucu={ACIL_PAY.ipucu} inputMode="decimal" value={pay} onChange={(e) => setPay(e.target.value)}
        hata={payOrani === null ? '0 ile 30 arasında bir sayı girin.' : undefined} />
      <Dugme type="submit" simge="check" disabled={!degisti || payOrani === null} yukleniyor={yaz.isPending}>Kaydet</Dugme>
    </form>
  );
}
