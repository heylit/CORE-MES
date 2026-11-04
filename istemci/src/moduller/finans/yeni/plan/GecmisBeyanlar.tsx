import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { VergiBeyaniSatiri } from '#paylasilan/sozlesme/finans.ts';
import { DurumKutusu, IsaretKutusu, Kart, Rozet, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../../../ortak/veri/istek-kimligi.ts';
import { tarih } from '../bicim.ts';

// Son günü geçmiş beyanların "verildi" işareti (1846). Takvim yalnız okur; işaret buradan konur ve takvimde
// verilmemiş beyan "Kaçırıldı" görünür. İşaret kutusu finans.beyan-yaz ister; asıl denetim sunucudadır.
export const GECMIS_BEYAN_GUN = 90;

function gunOnce(gun: string, n: number): string {
  const t = new Date(`${gun}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - n);
  return t.toISOString().slice(0, 10);
}

export function GecmisBeyanlar({ bugun, yazabilir }: { bugun: string; yazabilir: boolean }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const baslangic = gunOnce(bugun, GECMIS_BEYAN_GUN);
  const anahtar = ['finans', 'vergi-beyanlari', baslangic, bugun] as const;
  const liste = useQuery({
    queryKey: anahtar,
    queryFn: () => api.get<{ satirlar: VergiBeyaniSatiri[] }>(`/finans/vergi-beyanlari?baslangic=${baslangic}&bitis=${bugun}`),
  });
  const isaretle = useMutation({
    mutationFn: (g: { sonGun: string; kod: VergiBeyaniSatiri['kod']; verildi: boolean }) => api.post('/finans/vergi-beyani/isaretle', g, { istekKimligi: yeniIstekKimligi() }),
    onError: (h) => bildir('hata', hataIletisi(h, 'İşaret kaydedilemedi')),
    onSettled: () => istemci.invalidateQueries({ queryKey: ['finans', 'vergi-beyanlari'] }),
  });

  // Yalnız son günü geçmiş olanlar; bugün son gün olan "Yaklaşan" kartındadır.
  const satirlar = (liste.data?.satirlar ?? []).filter((s) => s.sonGun < bugun).slice().reverse();
  return (
    <Kart baslik="Geçmiş beyanlar" baslikEki={<span className="tc-fy-not">Son {GECMIS_BEYAN_GUN} gün</span>}>
      {liste.isError ? <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Geçmiş beyanlar alınamadı')} yenile={() => { void liste.refetch(); }} />
        : !liste.data ? <DurumKutusu durum="yukleniyor" />
        : satirlar.length === 0 ? <p className="tc-fy-not">Bu aralıkta son günü geçmiş beyan yok.</p>
        : (
          <ul className="tc-fc-satirlar" aria-label="Geçmiş beyanlar">
            {satirlar.map((s) => (
              <li key={`${s.sonGun}-${s.kod}`} className="tc-fc-satir tc-fc-takvim">
                <Rozet ton={s.verildi ? 'tamam' : 'hata'}>{s.verildi ? 'Verildi' : 'Kaçırıldı'}</Rozet>
                <span className="tc-fc-yigin">
                  <b>{s.ad}</b>
                  <small className="tc-fy-not">
                    {tarih(s.sonGun)} · Dönem: {s.donem}{s.verildi && s.isaretleyen ? ` · İşaretleyen: ${s.isaretleyen}` : ''}
                  </small>
                </span>
                <IsaretKutusu
                  etiket="Verildi"
                  aria-label={`${s.ad}, ${tarih(s.sonGun)}: verildi`}
                  checked={s.verildi}
                  disabled={!yazabilir || isaretle.isPending}
                  onChange={(e) => isaretle.mutate({ sonGun: s.sonGun, kod: s.kod, verildi: e.target.checked })}
                />
              </li>
            ))}
          </ul>
        )}
      <p className="tc-fy-not">Verilmemiş beyan üretim takviminde "Kaçırıldı" olarak kalır; işaretlenince kapanır.</p>
    </Kart>
  );
}
