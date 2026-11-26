import { useState } from 'react';
import type { z } from 'zod';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { URETIM_EMRI_YAZMA_ISLEMLERI } from '#paylasilan/islemler.ts';
import type {
  ADIMLI_OKUMA_ISLEMLERI as SUNUCUDAKI_LISTE, TerminOnerisi, TerminOnerileriCevabi, terminKarariGovdesi,
} from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, Kart, OnayPenceresi, Rozet, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { tarihMetni } from './gorunum.ts';

// Öneri ucunu okuyabilen işlemler; tip sözleşmedeki listeye birebir eşit olmak zorundadır (sapma derlemede yakalanır).
const OKUMA_ISLEMLERI: typeof SUNUCUDAKI_LISTE = ['sayfa.uretim-emirleri', 'sayfa.rota', ...URETIM_EMRI_YAZMA_ISLEMLERI, 'uretim-emirleri.fason', 'plan.yaz'];

// Emrin teslimi terminden kaç gün erken ya da geç (emir ayrıntısındaki öneri satırı aynı sözü kullanır).
function terminFarkiMetni(teslim: string | null, termin: string): { metin: string; gec: boolean } {
  if (teslim === null) return { metin: 'emrin teslimi yok', gec: true };
  const gun = Math.round((Date.parse(`${termin}T00:00:00Z`) - Date.parse(`${teslim}T00:00:00Z`)) / 86_400_000);
  return gun >= 0 ? { metin: `teslim ${String(gun)} gün erken`, gec: false } : { metin: `teslim ${String(-gun)} gün geç`, gec: true };
}

// 3429-3 G (3429 a): kalemin termini emrin tesliminden farklıysa öneri; bilgi ve karar Üretim Emirleri'nin uçlarıdır.
// Hiçbir şey kendiliğinden değişmez: planlayıcı (uretim-emirleri.duzenle) uygular ya da yoksayar; Yoksay o termin için kalıcıdır,
// onay penceresiyle sorulur. Okuma yetkisi yoksa (403) görünmez.
function OneriSatiri({ siparisId, oneri, yazar }: { siparisId: number; oneri: TerminOnerisi; yazar: boolean }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [soru, soruYaz] = useState(false);
  const karar = useMutation({
    mutationFn: (k: 'uygula' | 'yoksay') => api.post<unknown>(
      `/adimli-emirler/${String(oneri.emirId)}/termin-onerisi/${k}`,
      { surum: oneri.surum, termin: oneri.termin } satisfies z.input<typeof terminKarariGovdesi>,
      { istekKimligi: yeniIstekKimligi() },
    ),
    onSuccess: (_c, k) => { bildir('tamam', k === 'uygula' ? 'Emrin teslimi sipariş terminine yazıldı.' : 'Öneri yoksayıldı.'); },
    onError: (h) => { bildir('hata', hataIletisi(h, 'Karar kaydedilemedi')); },
    onSettled: async () => {
      soruYaz(false);
      await istemci.invalidateQueries({ queryKey: ['uretim-emirleri'] });
      await istemci.invalidateQueries({ queryKey: anahtarlar.terminOnerileri(siparisId) });
      await istemci.invalidateQueries({ queryKey: anahtarlar.siparisAkisi(siparisId) });
    },
  });
  const fark = terminFarkiMetni(oneri.teslim, oneri.termin);
  return (
    <li className="tc-sp-termin-onerisi">
      <Rozet ton={fark.gec ? 'uyari' : 'bilgi'} gorunum="cizgi">{fark.gec ? 'Geç' : 'Erken'}</Rozet>
      <span>
        {`Kalem ${String(oneri.kalemSira)} · `}
        <Link to={`/uretim-emirleri/${String(oneri.emirId)}`}>{oneri.emirNo}</Link>
        {`: sipariş termini ${tarihMetni(oneri.termin)}, emrin teslimi ${tarihMetni(oneri.teslim)} (${fark.metin})`}
      </span>
      {oneri.baslamis && <small>Emir başladı; teslimi değiştirmek planı etkiler.</small>}
      {yazar && (
        <span className="tc-sp-termin-onerisi-dugmeler">
          <Dugme simge="check" yukleniyor={karar.isPending && karar.variables === 'uygula'} disabled={karar.isPending} onClick={() => { karar.mutate('uygula'); }}>
            {`Teslimi ${tarihMetni(oneri.termin)} yap`}
          </Dugme>
          <Dugme simge="x" disabled={karar.isPending} onClick={() => { soruYaz(true); }}>Yoksay</Dugme>
          <OnayPenceresi acik={soru} baslik="Öneri yoksayılsın mı?" onayMetni="Yoksay" yukleniyor={karar.isPending}
            vazgec={() => { soruYaz(false); }} onayla={() => { karar.mutate('yoksay'); }}>
            <p>{`${oneri.emirNo}: ${tarihMetni(oneri.termin)} termini için öneri bir daha gösterilmez; emrin teslimi değişmez. Termin yeniden değişirse öneri yeniden çıkar.`}</p>
          </OnayPenceresi>
        </span>
      )}
    </li>
  );
}

export function SiparisTerminOnerileri({ siparisId }: { siparisId: number }) {
  const islemler = useOturum().data?.islemler ?? [];
  const yazar = islemler.includes('uretim-emirleri.duzenle');
  // Okuyamayan kişide istek hiç gitmez; her açılışta 403 konsolu kirletiyordu.
  const okur = OKUMA_ISLEMLERI.some((i) => islemler.includes(i));
  const d = useQuery({
    queryKey: anahtarlar.terminOnerileri(siparisId),
    queryFn: () => api.get<TerminOnerileriCevabi>(`/uretim-emirleri/termin-onerileri?siparisId=${String(siparisId)}`),
    enabled: okur,
  });
  const liste = d.data?.oneriler ?? [];
  if (liste.length === 0) return null;
  return (
    <Kart baslik="Termin farkı" simge="calendar" baslikEki={<Rozet ton="uyari" gorunum="cizgi">{`${String(liste.length)} emir`}</Rozet>}>
      <ul className="tc-sp-termin-onerileri" aria-label="Emir termin önerileri">
        {liste.map((o) => <OneriSatiri key={o.emirId} siparisId={siparisId} oneri={o} yazar={yazar} />)}
      </ul>
    </Kart>
  );
}
