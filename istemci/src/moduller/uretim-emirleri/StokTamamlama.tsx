import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { EmirTamamlamaCevabi, HareketCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import './uretim-emirleri.css';

export type TamamlamaKomutu = { tur: 'gonder'; girecek: string } | { tur: 'yapilacak-yok' };

// Sunucu çıktıyı emrin sağlam adedinden hesaplar (#447); miktarsız komut girilmemiş sağlam adedi girer, sıfırsa yalnız kalan sarfı yazar.
export function tamamlamaKomutu(c: EmirTamamlamaCevabi): TamamlamaKomutu {
  const sarfVar = c.bilesenler.some((b) => !b.hizmet && Number(b.kalan) > 0);
  return Number(c.cikti.kalan) > 0 || sarfVar ? { tur: 'gonder', girecek: c.cikti.kalan } : { tur: 'yapilacak-yok' };
}

const sayiMetni = (m: string | null): string => (m === null ? 'yok' : m.replace('.', ','));

type Bilesen = EmirTamamlamaCevabi['bilesenler'][number];

const SUTUNLAR: Sutun<Bilesen>[] = [
  { anahtar: 'malzeme', baslik: 'Malzeme', hucre: (b) => <>{b.malzemeAd ?? '–'}{b.hizmet && <> <small>(hizmet)</small></>}</> },
  { anahtar: 'brut', baslik: 'Brüt', hizala: 'sag', hucre: (b) => sayiMetni(b.brut) },
  { anahtar: 'verilen', baslik: 'Verilen', hizala: 'sag', hucre: (b) => sayiMetni(b.verilen) },
  { anahtar: 'kalan', baslik: 'Kalan', hizala: 'sag', hucre: (b) => (b.hizmet ? '–' : sayiMetni(b.kalan)) },
  { anahtar: 'mevcut', baslik: 'Mevcut', hizala: 'sag', hucre: (b) => (b.hizmet ? '–' : sayiMetni(b.mevcut)) },
  { anahtar: 'eksik', baslik: 'Eksik', hizala: 'sag', hucre: (b) => (b.hizmet ? '–' : sayiMetni(b.eksik)) },
];

// Bitmiş emrin kalan sarfı ve çıktısı stok modülünün tek komutuyla (#428). Komut hem giriş hem çıkış yazdığı için iki yetki de
// gerekir; yoksa kart çizilmez.
// Ürün kartı olmayan (eski) emir stokta tamamlanmaz: bölüm çizilmez, sunucu da sorulmaz.
export function StokTamamlama({ emir }: { emir: { id: number; emirNo: string; durum: string; malzemeNo?: number | null } }) {
  const islemler = (useOturum().data?.islemler ?? []) as readonly string[];
  const gorunur = emir.durum === 'bitti' && emir.malzemeNo != null && islemler.includes('stok.giris') && islemler.includes('stok.cikis');
  if (!gorunur) return null;
  return <Kart emir={emir} />;
}

function Kart({ emir }: { emir: { id: number; emirNo: string } }) {
  const istemci = useQueryClient();
  const yonlendir = useNavigate();
  const { bildir } = useBildirim();
  const [silahli, silahliYaz] = useState(false);
  // Aynı onayın yeniden gönderimi aynı kimlikle gider: ağ kopunca ikinci sarf yazılmaz.
  const kimlik = useRef(yeniIstekKimligi());
  const t = useQuery({
    queryKey: ['uretim-emirleri', 'stok-tamamlama', emir.id],
    queryFn: () => api.get<EmirTamamlamaCevabi>(`/stok/uretim-emirleri/${emir.id}/tamamlama`),
  });
  const tamamla = useMutation({
    mutationFn: () => api.post<HareketCevabi>(`/stok/uretim-emirleri/${emir.id}/tamamla`, {}, { istekKimligi: kimlik.current }),
    onSuccess: async () => {
      bildir('tamam', `${emir.emirNo} tamamlandı; sarf ve çıktı stoğa yazıldı.`);
      silahliYaz(false);
      kimlik.current = yeniIstekKimligi();
      await istemci.invalidateQueries({ queryKey: ['uretim-emirleri', 'stok-tamamlama'] });
      await istemci.invalidateQueries({ queryKey: anahtarlar.ayrinti(emir.id) });
    },
    onError: (x) => { silahliYaz(false); bildir('hata', hataIletisi(x, 'Emir tamamlanamadı.')); },
  });
  if (t.isPending || t.isError) {
    return (
      <section className="tc-emir-bolum-adim" aria-label="Stok ve tamamlama">
        <h3 className="tc-emir-bolum">Stok ve tamamlama</h3>
        {t.isPending ? <DurumKutusu durum="yukleniyor" /> : <p className="tc-emir-not">{hataIletisi(t.error, 'Stok tamamlama bilgisi okunamadı.')}</p>}
      </section>
    );
  }
  const c = t.data;
  const k = tamamlamaKomutu(c);
  const eksikVar = c.bilesenler.some((b) => !b.hizmet && Number(b.eksik) > 0);
  return (
    <section className="tc-emir-bolum-adim" aria-label="Stok ve tamamlama">
      <h3 className="tc-emir-bolum">Stok ve tamamlama</h3>
      <div className="tc-emir-ust">
        {eksikVar && <Dugme simge="plus" onClick={() => { void yonlendir(`/stok/mal-kabul?emir=${emir.id}`); }}>Eksikleri teslim al</Dugme>}
        {c.engel === null && k.tur === 'gonder' && (
          <Dugme tur={silahli ? 'tehlike' : 'birincil'} simge="check" yukleniyor={tamamla.isPending}
            onClick={() => { if (silahli) tamamla.mutate(); else silahliYaz(true); }}>
            {silahli ? 'Emin misin? Tamamla ve stoktan düş' : 'Stoka tamamla'}
          </Dugme>
        )}
      </div>
      {c.engel !== null && <p className="tc-emir-not" role="status">{c.engel}</p>}
      {c.bilesenler.length > 0 && (
        <Tablo etiket={`${emir.emirNo} sarfı`} sutunlar={SUTUNLAR} satirlar={c.bilesenler} satirAnahtari={(b) => b.malzemeId} bosMesaj="Sarf yok" />
      )}
      <p className="tc-emir-not">
        Çıktı ({c.emir.malzemeAd ?? 'ürün'}): stoğa girilen {sayiMetni(c.cikti.girilen)}, girecek {k.tur === 'gonder' ? sayiMetni(k.girecek) : '0'} adet.
        Hizmet satırları stoktan düşülmez.
      </p>
    </section>
  );
}
