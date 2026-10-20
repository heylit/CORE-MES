// Bekleme listesi (kart #1310): biten üretim emrinin ürünü, firmanın sevkiyat noktası olmadığı için işe çevrilemeyen fason gönderimi ve
// alınacak malzeme. Planlayıcı "İşe çevir" ile gün, nokta ve yükü verir; iş havuza düşer, kayıt listeden çıkar.
import { useState } from 'react';
import type { Bekleyen, BekleyenKaynagi } from '#paylasilan/sozlesme/sevkiyat.ts';
import { Dugme, Girdi, OnayPenceresi, Pencere, Rozet, useBildirim } from '../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../ortak/veri/api.ts';
import { sayiMetni, tarihMetni } from './bicim.ts';
import { useBekleyenBol, useBekleyenKaldir } from './veri.ts';

const KAYNAK_ADI: Record<BekleyenKaynagi, string> = { urun: 'Sevke hazır', fason: 'Fasona gidecek', alim: 'Alınacak malzeme' };
const KAYNAK_TURU: Record<BekleyenKaynagi, 'teslimat' | 'alim'> = { urun: 'teslimat', fason: 'teslimat', alim: 'alim' };
const OK: Record<BekleyenKaynagi, string> = { urun: '↓', fason: '↓', alim: '↑' };

export const bekleyenBasligi = (b: Bekleyen): string => b.malzemeAd ?? (b.malzemeNo === null ? 'Malzeme' : `Malzeme ${String(b.malzemeNo)}`);

export function BeklemeListesi({ bekleyenler, isYazabilir, iseCevir }: { bekleyenler: readonly Bekleyen[]; isYazabilir: boolean; iseCevir: (b: Bekleyen) => void }) {
  const kaldir = useBekleyenKaldir();
  const { bildir } = useBildirim();
  const [kaldirilacak, setKaldirilacak] = useState<Bekleyen | null>(null);
  // Kısmi sevk (261 a): ayrılan adet ayrı kayıt olur, ayrı işe çevrilir.
  const bol = useBekleyenBol();
  const [bolunecek, setBolunecek] = useState<{ b: Bekleyen; adet: string } | null>(null);
  if (bekleyenler.length === 0) return null;
  return (
    <section className="tc-sevkiyat-bekleyen" data-dolu aria-label="Bekleme listesi">
      <header>
        <h3>Bekleme listesi <em>{bekleyenler.length} kayıt</em></h3>
      </header>
      <p className="tc-sevkiyat-ince">Gün, nokta ve yük verilince iş sevkiyat havuzuna düşer.</p>
      <ul className="tc-sevkiyat-duraklar">
        {bekleyenler.map((b) => {
          const ayrinti = [
            b.adet === null ? '' : `${sayiMetni(b.adet)} adet`,
            b.emirNo ?? b.talepNo ?? '',
            b.firmaAd ?? '',
            b.istenenTarih ? `istenen ${tarihMetni(b.istenenTarih)}` : '',
          ].filter(Boolean).join(' · ');
          return (
            <li key={b.id} className="tc-sevkiyat-durak" data-tur={KAYNAK_TURU[b.kaynak]}>
              <span className="tc-sevkiyat-durak-no">{OK[b.kaynak]}</span>
              <span className="tc-sevkiyat-durak-adi">
                {bekleyenBasligi(b)}
                <em>{ayrinti}</em>
                <span className="tc-sevkiyat-rozetler">
                  <Rozet ton={b.kaynak === 'urun' ? 'tamam' : 'bilgi'}>{KAYNAK_ADI[b.kaynak]}</Rozet>
                  {b.kaynak !== 'urun' && b.noktaId === null && <Rozet ton="uyari">Firmanın sevkiyat noktası yok</Rozet>}
                </span>
              </span>
              {isYazabilir && (
                <span className="tc-sevkiyat-satir">
                  <Dugme simge="plus" onClick={() => iseCevir(b)} title="Gün, nokta ve yükü verip sevkiyat havuzuna ekler">İşe çevir</Dugme>
                  {b.kaynak === 'urun' && b.adet !== null && (
                    <Dugme simge="layers" onClick={() => setBolunecek({ b, adet: '' })} title="Adedin bir kısmını ayrı kayda ayırır; kısımlar ayrı günlerde gönderilebilir">Böl</Dugme>
                  )}
                  <Dugme simge="x" onClick={() => setKaldirilacak(b)} title="İşe çevirmeden listeden çıkarır (ör. müşteri kendisi aldı)">Kaldır</Dugme>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <Pencere acik={bolunecek !== null} kapat={() => setBolunecek(null)} baslik="Kısmi sevk"
        alt={<><Dugme onClick={() => setBolunecek(null)}>Vazgeç</Dugme><Dugme tur="birincil" yukleniyor={bol.isPending} disabled={!bolunecek?.adet}
          onClick={() => {
            if (!bolunecek) return;
            bol.mutate({ id: bolunecek.b.id, govde: { adet: bolunecek.adet } }, {
              onSuccess: () => { bildir('tamam', `${sayiMetni(bolunecek.adet)} adet ayrı kayda ayrıldı.`); setBolunecek(null); },
              onError: (h) => { bildir('hata', hataIletisi(h, 'Kayıt bölünemedi')); },
            });
          }}>Ayır</Dugme></>}>
        <p><b>{bolunecek ? bekleyenBasligi(bolunecek.b) : ''}</b>: {bolunecek?.b.adet ? sayiMetni(bolunecek.b.adet) : ''} adetten ayrılacak kısım ayrı kayıt olur; kalan bu kayıtta bekler.</p>
        <Girdi etiket="Ayrılacak adet" type="number" min={0} step="any" inputMode="decimal" value={bolunecek?.adet ?? ''}
          onChange={(e) => setBolunecek((x) => (x ? { ...x, adet: e.target.value } : x))} />
      </Pencere>
      <OnayPenceresi acik={kaldirilacak !== null} baslik="Listeden kaldırılsın mı?" onayMetni="Kaldır" tehlikeli yukleniyor={kaldir.isPending}
        vazgec={() => setKaldirilacak(null)}
        onayla={() => {
          if (!kaldirilacak) return;
          kaldir.mutate(kaldirilacak.id, {
            onSuccess: () => { bildir('tamam', 'Kayıt bekleme listesinden kaldırıldı.'); setKaldirilacak(null); },
            onError: (h) => { bildir('hata', hataIletisi(h, 'Kayıt kaldırılamadı')); },
          });
        }}>
        <p><b>{kaldirilacak ? bekleyenBasligi(kaldirilacak) : ''}</b> sevkiyata gitmeden listeden çıkar.</p>
      </OnayPenceresi>
    </section>
  );
}
