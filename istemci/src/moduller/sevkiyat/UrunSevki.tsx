import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { IsDurumuGovdesi, UrunSevki, UrunSevkleriCevabi } from '#paylasilan/sozlesme/sevkiyat.ts';
import { Dugme, DurumKutusu, Rozet, type RozetTonu } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { bugun, sayiMetni, tarihMetni } from './bicim.ts';
import { useIsKomutu } from './veri.ts';
import './sevkiyat.css';

// Malzeme · Teslim panelindeki Sevk bölümü (kart #96, soru 98 a): okutulan mamulün stoktan düşümü sevkiyat işinin durumuyla
// yapılır; bölüm o işi bir adım ilerletir. Durum geçişlerini sunucu denetler (iş durum ucu, sevkiyat.is-yaz); burada yalnız
// geçerli düğmeler gösterilir.
const DURUM: Record<NonNullable<UrunSevki['is']>['durum'], { ad: string; ton: RozetTonu }> = {
  havuzda: { ad: 'Havuzda', ton: 'pasif' }, planlandi: { ad: 'Taslak planda', ton: 'uyari' }, yolda: { ad: 'Yolda', ton: 'bilgi' }, tamamlandi: { ad: 'Teslim edildi', ton: 'tamam' },
};

function SevkSatiri({ s, yazar }: { s: UrunSevki; yazar: boolean }) {
  const komut = useIsKomutu();
  const [uyarilar, setUyarilar] = useState<string[]>([]);
  const gonder = (id: number, durum: IsDurumuGovdesi['durum']) =>
    komut.mutate({ tur: 'durum', id, govde: { durum, tarih: bugun(), not: null } }, { onSuccess: (c) => setUyarilar(c.uyarilar ?? []) });
  const is = s.is;
  return (
    <li className="tc-sevkiyat-urun-sevki">
      <div>
        <strong>{s.emirNo ?? 'Emirsiz'} · {s.adet === null ? 'adet bilinmiyor' : `${sayiMetni(s.adet)} adet`}</strong>
        <span>{[s.malzemeAd, s.firmaAd, is ? tarihMetni(is.tarih) : null, is?.belgeNo].filter(Boolean).join(' · ')}</span>
        {is === null && <span>İşe çevrilmedi; işe çevirmek <Link to="/sevkiyat">Sevkiyat</Link> ekranındadır.</span>}
        {is?.durum === 'planlandi' && <span>İş taslak planda; önce plan onaylanır ya da iş plandan çıkarılır.</span>}
        {komut.isError && <span role="alert">{komut.error instanceof Error ? komut.error.message : 'Kaydedilemedi.'}</span>}
        {uyarilar.map((u) => <span key={u} role="status">{u}</span>)}
      </div>
      {is && <Rozet ton={DURUM[is.durum].ton}>{DURUM[is.durum].ad}</Rozet>}
      {is && yazar && (is.durum === 'yolda' || is.durum === 'havuzda') && (
        <div className="tc-sevkiyat-satir">
          <Dugme tur="birincil" simge="check" yukleniyor={komut.isPending} onClick={() => gonder(is.id, 'tamamlandi')}>Teslim edildi</Dugme>
          {is.durum === 'yolda' && <Dugme simge="x" yukleniyor={komut.isPending} onClick={() => gonder(is.id, 'yapilamadi')}>Yapılamadı</Dugme>}
        </div>
      )}
    </li>
  );
}

// Emir (lot okutulduysa) ya da kart verilir. Sevkiyat okuması olmayan kişide bölüm hiç görünmez.
export function UrunSevkleri({ uretimEmriId, malzemeId }: { uretimEmriId?: number | undefined; malzemeId?: number | undefined }) {
  const islemler = useOturum().data?.islemler ?? [];
  const okur = islemler.includes('sevkiyat.oku');
  const sorgu = uretimEmriId !== undefined ? `uretimEmriId=${uretimEmriId}` : malzemeId !== undefined ? `malzemeNo=${malzemeId}` : null;
  const q = useQuery({
    queryKey: anahtarlar.urunSevkleri(sorgu ?? ''), enabled: okur && sorgu !== null,
    queryFn: () => api.get<UrunSevkleriCevabi>(`/sevkiyat/urun-sevkleri?${sorgu}`),
  });
  if (!okur || sorgu === null) return null;
  if (q.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (q.isError) return <DurumKutusu durum="hata" mesaj={q.error instanceof Error ? q.error.message : 'Sevkler okunamadı.'} yenile={() => { void q.refetch(); }} />;
  if (q.data.sevkler.length === 0) return <DurumKutusu durum="bos" mesaj="Bu ürünün açık sevki yok." />;
  return (
    <ul className="tc-sevkiyat-urun-sevkleri" aria-label="Ürünün sevkleri">
      {q.data.sevkler.map((s) => <SevkSatiri key={s.bekleyenId} s={s} yazar={islemler.includes('sevkiyat.is-yaz')} />)}
    </ul>
  );
}
