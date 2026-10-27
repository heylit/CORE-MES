import { useEffect, useState } from 'react';
import { CokSatir, DurumKutusu, OnayPenceresi, Pencere } from '../../../../ortak/arayuz/index.ts';
import { tarih } from '../bicim.ts';
import { gecmisEkle } from '../kurallar.ts';
import { kaydet, useEk, usePortal, usePortalKomutu } from '../veri.ts';
import { useDosyalar, type BelgeKaydi, type Dosya } from './gorseller.ts';

// Belgeyi onaylama ve reddetme (prototip docdecide). Ret gerekçesi firmaya görünür ve zorunludur. Kayıt okunduğu sürümle
// yazılır; araya giren değişiklik ortak çatışma iletisiyle döner.

export interface BelgeKarariGirdisi { belge: BelgeKaydi; onay: boolean }

export function kararKaydi(b: BelgeKaydi, onay: boolean, not: string, kullaniciKimligi: string, simdi: number): BelgeKaydi {
  const n = not.trim();
  const metin = onay ? (n ? `Onaylandı: ${n}` : 'Onaylandı') : `Reddedildi: ${n}`;
  return { ...b, status: onay ? 'approved' : 'rejected', rejectNote: onay ? '' : n, history: gecmisEkle(b, metin, kullaniciKimligi, simdi) };
}

interface Ozellikler {
  karar: BelgeKarariGirdisi | null;
  firmaAdi: string;
  kapat: () => void;
}

export function BelgeKarari({ karar, firmaAdi, kapat }: Ozellikler) {
  const { kisiKimligi } = usePortal();
  const [not, notYaz] = useState('');
  const [hata, hataYaz] = useState<string | undefined>();
  const komut = usePortalKomutu((k: BelgeKaydi) => kaydet('docs', k));

  useEffect(() => { notYaz(''); hataYaz(undefined); }, [karar]);

  if (karar === null) return null;
  const { belge, onay } = karar;
  const gonder = () => {
    if (!onay && not.trim() === '') { hataYaz('Gerekçe yazın.'); return; }
    komut.mutate(kararKaydi(belge, onay, not, kisiKimligi, Date.now()), { onSuccess: kapat });
  };

  return (
    <OnayPenceresi
      acik baslik={onay ? 'Belgeyi onayla' : 'Belgeyi reddet'} onayMetni={onay ? 'Onayla' : 'Reddet'} tehlikeli={!onay}
      yukleniyor={komut.isPending} onayla={gonder} vazgec={kapat}
    >
      <p>{`${firmaAdi}: ${belge.type}${belge.expiresAt ? `, geçerlilik ${tarih(belge.expiresAt)}` : ''}.`}</p>
      <Gorseller idler={belge.photos ?? []} />
      <CokSatir
        etiket={onay ? 'Not' : 'Ret gerekçesi (firma görür)'} required={!onay} value={not} hata={hata}
        onChange={(o) => { notYaz(o.target.value); hataYaz(undefined); }}
      />
    </OnayPenceresi>
  );
}

// Belge görüntüleri: küçük resim, tıklanınca büyük görünüm.
export function Gorseller({ idler }: { idler: readonly string[] }) {
  const dosyalar = useDosyalar(idler);
  const [buyuk, buyukYaz] = useState<Dosya | null>(null);
  if (idler.length === 0) return <p className="tc-pt-belgeler-ipucu">Görüntü eklenmemiş.</p>;
  return (
    <>
      <ul className="tc-pt-belgeler-gorseller" aria-label="Belge görüntüleri">
        {dosyalar.map((d, i) => (
          <li key={idler[i]}>
            {d.isPending ? <span className="tc-pt-belgeler-kucuk" aria-busy="true" />
              : d.data ? (
                <button type="button" className="tc-pt-belgeler-kucuk" aria-label={`${d.data.name || 'Resim'} büyüt`} onClick={() => { buyukYaz(d.data ?? null); }}>
                  <Resim dosya={d.data} />
                </button>
              ) : <span className="tc-pt-belgeler-kucuk">Okunamadı</span>}
          </li>
        ))}
      </ul>
      <Pencere acik={buyuk !== null} kapat={() => { buyukYaz(null); }} baslik={buyuk?.name || 'Belge görüntüsü'} tur="tam">
        {buyuk && <div className="tc-pt-belgeler-buyuk"><Resim dosya={buyuk} /></div>}
      </Pencere>
    </>
  );
}

// Eski kayıtta resim adresi belgede durur; yalnız gömülü resim kabul edilir (dış adres açılmaz).
const gomuluResim = (url: string | undefined): string | null => (url && /^data:image\/[a-z+.-]+;base64,/.test(url) ? url : null);

export function Resim({ dosya }: { dosya: Dosya }) {
  const ek = useEk(dosya.assetId ?? null);
  const adres = dosya.assetId ? (ek.data ? `data:${ek.data.tur};base64,${ek.data.veri}` : null) : gomuluResim(dosya.url);
  if (dosya.assetId && ek.isError) return <DurumKutusu durum="hata" mesaj="Görüntü okunamadı." />;
  if (adres === null) return dosya.assetId ? <span aria-busy="true" /> : <span>Görüntü yok</span>;
  return <img src={adres} alt={dosya.name ?? ''} loading="lazy" />;
}
