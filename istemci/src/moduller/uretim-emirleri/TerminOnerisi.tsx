import { useState } from 'react';
import type { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TerminOnerisi, TerminOnerisiCevabi, terminKarariGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, OnayPenceresi, Rozet, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import './uretim-emirleri.css';

const tarihMetni = (t: string | null): string => (t === null ? '—' : t.split('-').reverse().join('.'));

// Emrin teslimi terminden kaç gün erken ya da geç (sipariş ayrıntısındaki öneri satırı aynı sözü kullanır).
function terminFarkiMetni(teslim: string | null, termin: string): { metin: string; gec: boolean } {
  if (teslim === null) return { metin: 'emrin teslimi yok', gec: true };
  const gun = Math.round((Date.parse(`${termin}T00:00:00Z`) - Date.parse(`${teslim}T00:00:00Z`)) / 86_400_000);
  return gun >= 0 ? { metin: `teslim ${String(gun)} gün erken`, gec: false } : { metin: `teslim ${String(-gun)} gün geç`, gec: true };
}

// 3429-3 G: kalemin termini emrin tesliminden farklı; hiçbir şey kendiliğinden değişmez, planlayıcı uygular ya da yoksayar.
// Yoksay o termin için kalıcıdır (termin yeniden değişene kadar öneri çıkmaz): onay penceresiyle sorulur.
function OneriSatiri({ oneri }: { oneri: TerminOnerisi }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [soru, soruYaz] = useState(false);
  const yazar = (useOturum().data?.islemler ?? []).includes('uretim-emirleri.duzenle');
  const karar = useMutation({
    mutationFn: (k: 'uygula' | 'yoksay') => api.post<unknown>(
      `/adimli-emirler/${String(oneri.emirId)}/termin-onerisi/${k}`,
      { surum: oneri.surum, termin: oneri.termin } satisfies z.input<typeof terminKarariGovdesi>,
      { istekKimligi: yeniIstekKimligi() },
    ),
    onSuccess: (_c, k) => { bildir('tamam', k === 'uygula' ? 'Emrin teslimi sipariş terminine yazıldı.' : 'Öneri yoksayıldı.'); },
    onError: (h) => { bildir('hata', hataIletisi(h, 'Karar kaydedilemedi')); },
    onSettled: async () => { soruYaz(false); await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi }); },
  });
  const fark = terminFarkiMetni(oneri.teslim, oneri.termin);
  return (
    <div className="tc-emir-termin-onerisi">
      <Rozet ton={fark.gec ? 'uyari' : 'bilgi'} gorunum="cizgi">Termin farkı</Rozet>
      <span>{`Sipariş termini ${tarihMetni(oneri.termin)}, emrin teslimi ${tarihMetni(oneri.teslim)} (${fark.metin})`}</span>
      {oneri.baslamis && <small>Emir başladı; teslimi değiştirmek planı etkiler.</small>}
      {yazar && (
        <>
          <Dugme simge="check" yukleniyor={karar.isPending && karar.variables === 'uygula'} disabled={karar.isPending} onClick={() => { karar.mutate('uygula'); }}>
            {`Teslimi ${tarihMetni(oneri.termin)} yap`}
          </Dugme>
          <Dugme simge="x" disabled={karar.isPending} onClick={() => { soruYaz(true); }}>Yoksay</Dugme>
          <OnayPenceresi acik={soru} baslik="Öneri yoksayılsın mı?" onayMetni="Yoksay" yukleniyor={karar.isPending}
            vazgec={() => { soruYaz(false); }} onayla={() => { karar.mutate('yoksay'); }}>
            <p>{`${tarihMetni(oneri.termin)} termini için öneri bir daha gösterilmez; emrin teslimi değişmez. Termin yeniden değişirse öneri yeniden çıkar.`}</p>
          </OnayPenceresi>
        </>
      )}
    </div>
  );
}

// Emir ayrıntısında, teslim bağının altında; sipariş ayrıntısı aynı uçları kendi ekranıyla okur (siparisler SiparisTerminOnerileri).
export function EmrinTerminOnerisi({ emirId }: { emirId: number }) {
  const d = useQuery({
    queryKey: [...anahtarlar.hepsi, 'termin-onerisi', emirId],
    queryFn: () => api.get<TerminOnerisiCevabi>(`/adimli-emirler/${String(emirId)}/termin-onerisi`),
  });
  const o = d.data?.oneri;
  return o == null ? null : <OneriSatiri oneri={o} />;
}
