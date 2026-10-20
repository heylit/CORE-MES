import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TalimatlarCevabi, TalimatYazGovdesi } from '#paylasilan/sozlesme/rota.ts';
import { CokSatir, Dugme, DurumKutusu, Pencere, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { zamanMetni } from './gorunum.ts';

interface Ozellikler {
  urunId: number;
  opNo: number;
  adimAdi: string;
  yazabilir: boolean;
  kapat: () => void;
}

// Talimat revizyondan bağımsızdır: yazmak yeni sürüm ekler, rota revizyonu değişmez.
export function TalimatPenceresi({ urunId, opNo, adimAdi, yazabilir, kapat }: Ozellikler) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [metin, metinYaz] = useState<string | null>(null);
  const liste = useQuery({
    queryKey: anahtarlar.talimatlar(urunId, opNo),
    queryFn: () => api.get<TalimatlarCevabi>(`/rota/urunler/${urunId}/talimatlar/${opNo}`),
  });
  const son = liste.data?.surumler[0] ?? null;
  const yaz = useMutation({
    mutationFn: (govde: TalimatYazGovdesi) => api.post<TalimatlarCevabi>(`/rota/urunler/${urunId}/talimat-yaz`, govde),
    onSuccess: async () => {
      await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
      bildir('tamam', 'Talimat kaydedildi.');
      metinYaz(null);
    },
  });
  const duzenlenen = metin ?? son?.metin ?? '';
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={`OP ${opNo} talimatı · ${adimAdi}`}
      alt={yazabilir ? (
        <>
          <Dugme onClick={kapat}>Kapat</Dugme>
          <Dugme tur="birincil" simge="check" yukleniyor={yaz.isPending} disabled={duzenlenen.trim() === '' || liste.isPending}
            onClick={() => yaz.mutate({ opNo, metin: duzenlenen, okunanSurum: son?.surum ?? null })}>Yeni sürüm olarak kaydet</Dugme>
        </>
      ) : <Dugme onClick={kapat}>Kapat</Dugme>}
    >
      <div className="tc-rota-yigin">
        {liste.isPending && <DurumKutusu durum="yukleniyor" />}
        {liste.isError && <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} />}
        {yazabilir
          ? <CokSatir etiket="Talimat" rows={6} value={duzenlenen} onChange={(e) => metinYaz(e.target.value)} />
          : <p className="tc-rota-metin">{son?.metin ?? 'Talimat yok.'}</p>}
        {yaz.isError && <p role="alert" className="tc-rota-hata">{hataIletisi(yaz.error, 'Talimat kaydedilemedi.')}</p>}
        {liste.data && liste.data.surumler.length > 0 && (
          <ol className="tc-rota-surumler" aria-label="Talimat sürümleri">
            {liste.data.surumler.map((s) => (
              <li key={s.surum}><strong>Sürüm {s.surum}</strong> · {s.yazan.ad ?? 'bilinmeyen'} · {zamanMetni(s.yazma)}<p className="tc-rota-metin">{s.metin}</p></li>
            ))}
          </ol>
        )}
      </div>
    </Pencere>
  );
}
