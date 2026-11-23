import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { BaskiDusumNedeni, CikmadiCevabi } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { Dugme } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { anahtarlar } from './anahtarlar.ts';

// 3598: basılmış sayılan baskı çıkmadıysa işaretlenir; kayıt Basılacaklar'a döner. Basma kararı basanındır (etiket-merkezi.bas).
// Aynı baskı için istek kimliği korunur: ağ yinelemesi ikinci satır açmaz.
export function useCikmadi(): { isaretle: (baskiId: number, neden: BaskiDusumNedeni) => Promise<CikmadiCevabi>; bekliyor: boolean } {
  const istemci = useQueryClient();
  const m = useMutation({
    mutationFn: ({ baskiId, neden }: { baskiId: number; neden: BaskiDusumNedeni }) =>
      api.post<CikmadiCevabi>(`/etiket-merkezi/baskilar/${String(baskiId)}/cikmadi`, { neden }, { istekKimligi: yeniIstekKimligi() }),
    onSettled: () => {
      void istemci.invalidateQueries({ queryKey: anahtarlar.baskilar });
      void istemci.invalidateQueries({ queryKey: anahtarlar.bekleyenler });
    },
  });
  return { isaretle: (baskiId, neden) => m.mutateAsync({ baskiId, neden }), bekliyor: m.isPending };
}

// Baskı sonuç iletisinin eylemleri (Y1): etiket çıkmadıysa "Çıkmadı", çıktıysa "Basıldı" (iletiyi kapatır). Ağ, dosya ve tarayıcı yollarında ortaktır.
export function CikmadiEylemi({ baskiId, kayitSayisi, kapat }: { baskiId: number; kayitSayisi: number; kapat?: () => void }) {
  const { isaretle, bekliyor } = useCikmadi();
  const [durum, setDurum] = useState<'bekliyor' | 'isaretlendi' | 'hata' | 'tamam'>('bekliyor');
  const [hata, setHata] = useState<string | null>(null);
  if (durum === 'tamam') return null;
  if (durum === 'isaretlendi') {
    return <p className="tc-etk-not" role="status">"Çıkmadı" olarak işaretlendi. {String(kayitSayisi)} kayıt Basılacaklar listesine döndü; yeniden basabilirsiniz.</p>;
  }
  return (
    <div className="tc-etk-gonder">
      {hata !== null && <p className="tc-etk-hata" role="alert">{hata}</p>}
      <div className="tc-etk-dugmeler">
        <Dugme simge="x" yukleniyor={bekliyor} aria-label={`Çıkmadı: ${String(kayitSayisi)} kayıt Basılacaklar listesine döner`}
          onClick={() => {
            setHata(null);
            isaretle(baskiId, 'cikmadi').then(() => { setDurum('isaretlendi'); }, (h: unknown) => { setDurum('hata'); setHata(hataIletisi(h, 'İşaretlenemedi; yeniden deneyin.')); });
          }}>
          Çıkmadı{kayitSayisi > 0 ? ` (${String(kayitSayisi)})` : ''}
        </Dugme>
        <Dugme simge="check" disabled={bekliyor} onClick={() => { setDurum('tamam'); kapat?.(); }}>Basıldı</Dugme>
      </div>
    </div>
  );
}
