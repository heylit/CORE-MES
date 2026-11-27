import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MuayeneBelgeBaglaGovdesi, MuayeneBelgeleriCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, DurumKutusu, Girdi, Secim, Simge } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { DosyaHatasi, dosyaYukle } from '../belge-merkezi/disari.ts';
import { anahtarlar } from './anahtarlar.ts';
import './muayene-belgeleri.css';

// 3708: kaynağında muayene adımının belgeleri (sertifika, test raporu). Zorunlu adlar adımın operasyon tipindedir; eksik belgeyle
// adım bitirilemez (sunucu kapısı). Dosya önce dosya ucuna yüklenir (özet), bağ komutu belge türüyle kurulur.
const TURLER = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
const KABUL = TURLER.join(',');
const AZAMI_BAYT = 20 * 1024 * 1024;
// Sunucu da reddeder; seçilen dosya yüklenmeden önce burada elenir (Test1 G1).
export const dosyaReddi = (d: { type: string; size: number }): string | null => {
  if (!(TURLER as readonly string[]).includes(d.type)) return 'Yalnız PDF ya da resim (JPEG, PNG, WEBP) yüklenir.';
  if (d.size > AZAMI_BAYT) return 'Dosya en çok 20 MB olabilir.';
  return null;
};
const yol = (emirId: number, isEmriId: number) => `/adimli-emirler/${String(emirId)}/is-emirleri/${String(isEmriId)}/muayene-belgeleri`;
export const muayeneBelgesiAdresi = (emirId: number, isEmriId: number, ozet: string) =>
  `/api${yol(emirId, isEmriId)}/${encodeURIComponent(ozet)}/dosya`;

// Belge durumu (zorunlu, eksik) başka ekranda da okunur (Kalite Merkezi onay düğmesi); bağ ve kaldırma aynı önbelleği günceller.
export const useMuayeneBelgeleri = (emirId: number, isEmriId: number) => useQuery({
  queryKey: anahtarlar.muayeneBelgeleri(emirId, isEmriId),
  queryFn: () => api.get<MuayeneBelgeleriCevabi>(yol(emirId, isEmriId)),
});
const YAZMA_ISLEMLERI = ['uretim-emirleri.fason', 'kalite-merkezi.onayla'] as const;

// Bölüm Adım Durumu'nu okuyan herkese görünür (kalite dahil); yükleme ve kaldırma fason yetkisiyle ya da muayeneyi onaylayan
// kaliteyle (kalite-merkezi.onayla).
export function MuayeneBelgeleri({ emirId, isEmriId, opNo, bitti = false }: { emirId: number; isEmriId: number; opNo: number; bitti?: boolean }) {
  const islemler = useOturum().data?.islemler ?? [];
  const yazar = YAZMA_ISLEMLERI.some((i) => islemler.includes(i));
  const q = useMuayeneBelgeleri(emirId, isEmriId);
  return (
    <section className="tc-at-kutu" aria-label={`OP ${String(opNo)} muayene belgeleri`}>
      <header className="tc-at-kutu-bas">
        <h4><Simge ad="file" boyut="k" />Muayene belgeleri</h4>
        {q.data !== undefined && q.data.zorunlu.length > 0 && (
          <span className="tc-at-sayi">{q.data.zorunlu.length - q.data.eksik.length} / {q.data.zorunlu.length} zorunlu</span>
        )}
      </header>
      {q.isPending ? <DurumKutusu durum="yukleniyor" />
        : q.isError ? <DurumKutusu durum="hata" mesaj={hataIletisi(q.error, 'Belgeler okunamadı.')} yenile={() => { void q.refetch(); }} />
          : <Icerik emirId={emirId} isEmriId={isEmriId} v={q.data} bitti={bitti} yazar={yazar} />}
    </section>
  );
}

// Biten muayenenin belgesi kaldırılmaz (sunucu da reddeder); ekleme açık kalır.
function Icerik({ emirId, isEmriId, v, bitti, yazar }: { emirId: number; isEmriId: number; v: MuayeneBelgeleriCevabi; bitti: boolean; yazar: boolean }) {
  const istemci = useQueryClient();
  const [tur, turYaz] = useState(v.eksik[0] ?? v.zorunlu[0] ?? '');
  const [oran, oranYaz] = useState<number | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);
  const [kimlik, kimlikYaz] = useState(yeniIstekKimligi);
  const yenile = (c: MuayeneBelgeleriCevabi) => {
    istemci.setQueryData(anahtarlar.muayeneBelgeleri(emirId, isEmriId), c);
    turYaz(c.eksik[0] ?? c.zorunlu[0] ?? '');
  };
  const bagla = useMutation({
    mutationFn: (g: MuayeneBelgeBaglaGovdesi) => tekrarKorumaliGonder(
      (deneme) => api.post<MuayeneBelgeleriCevabi>(yol(emirId, isEmriId), g, deneme), { istekKimligi: kimlik }),
    onSuccess: (c) => { kimlikYaz(yeniIstekKimligi()); yenile(c); },
    onError: (x) => hataYaz(hataIletisi(x, 'Belge bağlanamadı; yeniden deneyin.')),
  });
  const kaldir = useMutation({
    mutationFn: (ozet: string) => api.post<MuayeneBelgeleriCevabi>(`${yol(emirId, isEmriId)}/${encodeURIComponent(ozet)}/kaldir`, {}),
    onSuccess: yenile,
    onError: (x) => hataYaz(hataIletisi(x, 'Belge kaldırılamadı.')),
  });
  const yukle = async (d: File | null): Promise<void> => {
    hataYaz(null);
    if (d === null) return;
    const red = dosyaReddi(d);
    if (red !== null) { hataYaz(red); return; }
    if (tur.trim() === '') { hataYaz('Önce belge türünü yazın.'); return; }
    oranYaz(0);
    try {
      const ozet = await dosyaYukle(new Uint8Array(await d.arrayBuffer()), oranYaz);
      bagla.mutate({ ozet, dosyaAdi: d.name, belgeTuru: tur.trim() });
    } catch (e) {
      hataYaz(e instanceof DosyaHatasi ? e.message : `Yükleme kesildi; yeniden seçin. (${hataIletisi(e, 'Hata')})`);
    } finally {
      oranYaz(null);
    }
  };
  const mesgul = oran !== null || bagla.isPending || kaldir.isPending;
  return (
    <>
      {v.zorunlu.length === 0
        ? <p className="tc-emir-not">Bu muayenede zorunlu belge tanımlı değil; belge eklemek isteğe bağlıdır.</p>
        : v.eksik.length > 0
          ? <p className="tc-ad-uyari tc-ad-uyari-hata" role="alert"><Simge ad="alert" boyut="k" /><span>Eksik: {v.eksik.join(', ')}. Eksik belgeyle adım bitirilemez.</span></p>
          : <p className="tc-emir-not" role="status"><Simge ad="check" boyut="k" /> Zorunlu belgelerin hepsi yüklendi.</p>}
      {v.belgeler.length > 0 && (
        <ul className="tc-at-maddeler">
          {v.belgeler.map((b) => (
            <li key={b.ozet} className="tc-at-madde">
              <span className="tc-at-madde-ad">
                <Simge ad="file" boyut="k" />
                <span><b>{b.belgeTuru ?? 'Belge'}</b><small><a className="tc-mb-bag" href={muayeneBelgesiAdresi(emirId, isEmriId, b.ozet)} target="_blank" rel="noreferrer">{b.ad}</a></small></span>
              </span>
              {yazar && !bitti && (
                <span className="tc-at-madde-eylem">
                  <Dugme simge="x" aria-label={`${b.ad} kaldır`} disabled={mesgul} onClick={() => kaldir.mutate(b.ozet)}>Kaldır</Dugme>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {yazar && (<div className="tc-emir-ust">
        {v.zorunlu.length > 0
          ? <Secim etiket="Belge türü" secenekler={v.zorunlu.map((z) => ({ deger: z, baslik: v.eksik.includes(z) ? `${z} (eksik)` : z }))} value={tur} onChange={(e) => turYaz(e.target.value)} disabled={mesgul} />
          : <Girdi etiket="Belge türü" maxLength={60} value={tur} onChange={(e) => turYaz(e.target.value)} disabled={mesgul} ipucu="Ör. Test raporu" />}
        <Girdi etiket="Dosya" type="file" accept={KABUL} disabled={mesgul}
          onChange={(e) => { const d = e.target.files?.[0] ?? null; e.target.value = ''; void yukle(d); }}
          ipucu="PDF ya da resim, en çok 20 MB." />
      </div>)}
      {oran !== null && (
        <span className="tc-ad-yukleme"><progress max={1} value={oran} aria-label="Yükleniyor" />Yükleniyor %{Math.round(oran * 100)}</span>
      )}
      {hata !== null && <p className="tc-ad-uyari tc-ad-uyari-hata" role="alert"><Simge ad="alert" boyut="k" />{hata}</p>}
    </>
  );
}
