import { useState } from 'react';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { kisaZaman, saatDakika } from '../bicim.ts';
import { useMesaj } from '../durum.tsx';
import { bahisleriKodla } from '../kurallar.ts';
import { iz } from '../kartlar/eylemler.ts';
import { ZenginMetin } from '../kartlar/ZenginMetin.tsx';
import { KisiRozeti } from '../ortak/index.ts';
import type { Not } from '../tipler.ts';
import { useKoleksiyon } from '../veri.ts';
import { Bolum } from './parcalar.tsx';

// Ayrıntı sayfasının "Notlar ve yorumlar"ı: `<koleksiyon>/<id>/not` (en çok 200, eskiden yeniye).
export function NotListesi({ koleksiyon, id, baslik = 'Notlar ve yorumlar' }: { koleksiyon: string; id: string; baslik?: string }) {
  const { ad } = useMesaj();
  const notlar = useKoleksiyon<Not>(`${koleksiyon}/${id}/not`, { sira: ['ts', 'asc'], sinir: 200 }) ?? [];
  return (
    <Bolum baslik={notlar.length ? `${baslik} (${notlar.length})` : baslik}>
      {notlar.length === 0
        ? <p className="tc-mi-bos-kucuk">Henüz not yok. Aşağıdan yazabilirsin.</p>
        : (
          <div className="tc-mi-notlar">
            {notlar.map((n) => (
              <div key={n.id} className="tc-mi-not-satiri">
                <KisiRozeti id={n.by} boyut="s" />
                <div className="tc-mi-govde">
                  <div className="tc-mi-ust"><b>{ad(n.by)}</b><span>{kisaZaman(n.ts)} {saatDakika(n.ts)}</span></div>
                  <ZenginMetin metin={n.text} />
                </div>
              </div>
            ))}
          </div>
        )}
    </Bolum>
  );
}

// Not yazma alanı (prototipin submitNote'u). `izYaz` yanlışsa üst kayda "not ekledi" izi yazılmaz (sipariş Mesaj'ın değildir).
export function NotYazmaAlani({ koleksiyon, id, toplanti, izYaz = true }: { koleksiyon: string; id: string; toplanti?: boolean; izYaz?: boolean }) {
  const { ben, kisiHaritasi, yaz } = useMesaj();
  const [metin, metinYaz] = useState('');
  const [gidiyor, gidiyorYaz] = useState(false);
  const gonder = () => {
    const t = metin.trim();
    if (!t || gidiyor) return;
    const bilinen = new Map<string, string>();
    for (const [kisi, ad] of kisiHaritasi) if (ad && !bilinen.has(ad)) bilinen.set(ad, kisi);
    gidiyorYaz(true);
    void (async () => {
      try {
        await yaz.ekle(`${koleksiyon}/${id}/not`, { by: ben.id, text: bahisleriKodla(t, bilinen).out, ts: Date.now() } satisfies Not);
        metinYaz('');
        if (izYaz) await yaz.guncelle(`${koleksiyon}/${id}`, { last: iz(ben.id, 'not ekledi') });
      } catch { /* yazıcı hatayı gösterdi */ } finally { gidiyorYaz(false); }
    })();
  };
  return (
    <form className="tc-mi-not-yaz" onSubmit={(o) => { o.preventDefault(); gonder(); }}>
      <textarea
        className="tc-alan-kutu" rows={1} value={metin} aria-label="Not yaz"
        placeholder={toplanti ? 'Toplantı notu ya da karar yaz…' : 'Not ya da soru yaz… (@ ile bahset)'}
        onChange={(o) => metinYaz(o.target.value)}
        onKeyDown={(o) => { if (o.key === 'Enter' && !o.shiftKey && !o.nativeEvent.isComposing) { o.preventDefault(); gonder(); } }}
      />
      <Dugme tur="birincil" simge="next" type="submit" aria-label="Notu gönder" yukleniyor={gidiyor} disabled={!metin.trim()} />
    </form>
  );
}
