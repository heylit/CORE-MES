import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { HazirlikMaddeleriCevabi, HazirlikMaddesiOlayi } from '#paylasilan/sozlesme/arkon.ts';
import { Dugme, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { useYetki } from '../../../../ortak/veri/yetki.ts';

// 2227-1 b: iş emrine özel hazırlık maddesi (rota talimatı dışında o işe özgü yapılacak iş). Hazırlık ve yönetici ekler ve işaretler,
// planlama yalnız görür; asıl denetim sunucudadır. Matristeki "Ek madde" sütunu bu listeden çıkar, yalnız uyarır.
export function EkHazirlikMaddeleri({ isEmriId, degisti }: { isEmriId: number; degisti: () => void }) {
  const yetki = useYetki();
  const yazar = yetki.herhangi('arkon.hazirlik', 'arkon.yonetici');
  const okur = yazar || yetki.var('arkon.planlama');
  const { bildir } = useBildirim();
  const [v, vYaz] = useState<HazirlikMaddeleriCevabi | null>(null);
  const [ad, adYaz] = useState('');
  const [mesgul, mesgulYaz] = useState(false);

  useEffect(() => {
    if (!okur) return;
    let canli = true;
    vYaz(null);
    api.get<HazirlikMaddeleriCevabi>(`/arkon/hazirlik-maddeleri?isEmriId=${String(isEmriId)}`)
      .then((c) => { if (canli) vYaz(c); })
      .catch(() => { if (canli) vYaz(null); });
    return () => { canli = false; };
  }, [isEmriId, okur]);

  const yaz = useCallback(async (yol: string, govde: unknown, ekran: string): Promise<boolean> => {
    mesgulYaz(true);
    try {
      vYaz(await api.post<HazirlikMaddeleriCevabi>(yol, govde));
      degisti();
      return true;
    } catch (e) {
      bildir('hata', hataIletisi(e, ekran));
      return false;
    } finally {
      mesgulYaz(false);
    }
  }, [bildir, degisti]);

  if (!okur || v === null) return null;
  const duzenler = yazar && !v.kapali;
  const ekle = async (e: FormEvent) => {
    e.preventDefault();
    const metin = ad.trim();
    if (metin === '') return;
    if (await yaz('/arkon/hazirlik-maddeleri', { isEmriId, ad: metin }, 'Madde eklenemedi.')) adYaz('');
  };
  const isaretle = (id: number, olay: HazirlikMaddesiOlayi) => {
    void yaz(`/arkon/hazirlik-maddeleri/${String(id)}/isaretle`, { olay }, 'Madde değiştirilemedi.');
  };
  const tamam = v.maddeler.filter((m) => m.tamam).length;

  return (
    <section className="tc-ay2-kart" aria-label="Ek hazırlık maddeleri">
      <div className="tc-ay2-kb">
        <b>Ek hazırlık maddeleri</b>
        <span className="tc-ay2-ust-yazi">{v.maddeler.length === 0 ? 'Madde yok' : `${String(tamam)} / ${String(v.maddeler.length)} tamam`}</span>
      </div>
      {v.maddeler.length > 0 ? (
        <div className="tc-ay2-adim-listesi">
          {v.maddeler.map((m) => (
            <div key={m.id} className="tc-ay2-denetim" data-durum={m.tamam ? 'tamam' : 'yumusak'}>
              <span>{m.tamam ? <Simge ad="check" boyut="k" /> : '!'}</span>
              <div>
                <b>{m.ad}</b>
                <small>{m.tamam ? `Tamamlayan: ${m.tamamlayanAdi ?? 'bilinmiyor'}` : `Ekleyen: ${m.ekleyenAdi ?? 'bilinmiyor'}`}</small>
              </div>
              {duzenler ? (
                <span className="tc-ay2-satir">
                  <button type="button" className="tc-ay2-onay" aria-pressed={m.tamam} disabled={mesgul} onClick={() => isaretle(m.id, m.tamam ? 'geri-al' : 'tamamla')}>
                    {m.tamam ? 'Geri al' : 'Tamamlandı'}
                  </button>
                  <button type="button" className="tc-ay2-arac" aria-label={`${m.ad}: kaldır`} disabled={mesgul} onClick={() => isaretle(m.id, 'kaldir')}><Simge ad="trash" /></button>
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {duzenler ? (
        <form className="tc-ay2-satir" onSubmit={(e) => { void ekle(e); }}>
          <input value={ad} maxLength={120} placeholder="Bu işe özel hazırlık maddesi" aria-label="Yeni hazırlık maddesi" onChange={(e) => adYaz(e.target.value)} />
          <Dugme type="submit" tur="ikincil" simge="plus" disabled={mesgul || ad.trim() === ''}>Ekle</Dugme>
        </form>
      ) : v.kapali ? <p className="tc-ay2-bilgi">İş emri bitti; maddeler değişmez.</p> : null}
    </section>
  );
}
