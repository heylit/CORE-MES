import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Bildirim, BildirimOnayCevabi, TumunuOkunduCevabi } from '#paylasilan/sozlesme/bildirim.ts';
import { Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { gecenZaman, ONEM_ADI, satirKaynagi, satirSimgesi } from './gorunum.ts';

// Okundu, arşiv ve tümünü okundu; hepsi yalnız kendi satırına dokunur (sunucu oturumdaki kişiyi alır).
export function useBildirimKomutlari() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const yenile = () => istemci.invalidateQueries({ queryKey: anahtarlar.kok });
  const hata = (h: unknown) => bildir('hata', hataIletisi(h, 'İşlem yapılamadı.'));
  const okundu = useMutation({ mutationFn: (id: number) => api.post<Bildirim>(`/bildirimler/${id}/okundu`), onSettled: yenile, onError: hata });
  const arsivle = useMutation({ mutationFn: (id: number) => api.post<Bildirim>(`/bildirimler/${id}/arsivle`), onSettled: yenile, onError: hata });
  const tumu = useMutation({ mutationFn: () => api.post<TumunuOkunduCevabi>('/bildirimler/tumunu-okundu'), onSettled: yenile, onError: hata });
  const onayla = useMutation({ mutationFn: (id: number) => api.post<BildirimOnayCevabi>(`/bildirimler/${id}/onayla`), onSettled: yenile, onError: hata });
  return { okundu, arsivle, tumu, onayla };
}

// Satıra basınca okundu olur ve kayıt varsa açılır; bildirim yetki vermez, açılan ekran kendi yetkisini sorar.
export function BildirimSatiri({ b, kisa = false, acildi, arsivle }: {
  b: Bildirim; kisa?: boolean; acildi?: () => void; arsivle?: () => void;
}) {
  const git = useNavigate();
  const { okundu, onayla } = useBildirimKomutlari();
  const yeni = b.okundu === null;
  const onayBekliyor = b.onayIstenir && b.onaylandi === null;
  const geri = b.yayin?.geriCekildi != null;
  const ac = () => {
    if (yeni) okundu.mutate(b.id);
    if (b.yol !== null) void git(b.yol);
    acildi?.();
  };
  return (
    <li className={`tc-bildirim-satir${yeni ? ' tc-bildirim-yeni' : ''}`} data-onay-bekliyor={onayBekliyor ? '' : undefined}>
      <button type="button" className="tc-bildirim-ac" onClick={ac} aria-label={`${b.baslik}${yeni ? ', okunmamış' : ''}`}>
        <span className="tc-bildirim-nokta" aria-hidden="true" />
        <span className={`tc-bildirim-simge tc-bildirim-${b.onem}`} title={ONEM_ADI[b.onem]}><Simge ad={satirSimgesi(b)} /></span>
        <span className="tc-bildirim-govde">
          <span className={`tc-bildirim-baslik${geri ? ' tc-bildirim-geri' : ''}`}>
            {b.baslik}
            {b.tekrarSayisi > 1 && <span className="tc-bildirim-tekrar mono"> ×{b.tekrarSayisi}</span>}
          </span>
          {b.metin !== null && <span className="tc-bildirim-metin">{b.metin}</span>}
          {!kisa && <span className="tc-bildirim-kaynak">{satirKaynagi(b)}{geri ? ' · geri çekildi' : ''}{onayBekliyor ? ' · onay bekliyor' : b.onaylandi !== null ? ' · onaylandı' : ''}</span>}
        </span>
        <span className="tc-bildirim-zaman">{gecenZaman(b.olusturuldu, new Date())}</span>
      </button>
      {onayBekliyor && !geri && (
        <button type="button" className="tc-bildirim-arsivle tc-bildirim-onayla" onClick={() => onayla.mutate(b.id)} disabled={onayla.isPending}
          aria-label={`Okudum, anladım: ${b.baslik}`} title="Okudum, anladım">
          <Simge ad="check" />
        </button>
      )}
      {arsivle && !onayBekliyor && (
        <button type="button" className="tc-bildirim-arsivle" onClick={arsivle} aria-label={`Arşive kaldır: ${b.baslik}`} title="Arşive kaldır">
          <Simge ad="layers" />
        </button>
      )}
    </li>
  );
}

export function BosListe({ metin }: { metin: string }) {
  return (
    <div className="tc-bildirim-bos">
      <Simge ad="check" />
      <p>{metin}</p>
    </div>
  );
}
