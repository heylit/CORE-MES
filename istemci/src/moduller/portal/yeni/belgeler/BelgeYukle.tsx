import { useEffect, useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dugme, FormPenceresi, Girdi, Secim, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { useForm, type AlanHatalari } from '../../../../ortak/veri/form.ts';
import { bugun } from '../bicim.ts';
import { BELGE_TURLERI } from '../kurallar.ts';
import type { Firma } from '../tipler.ts';
import { hataMetni, kaydet, portalAnahtarlari, usePortal, yeniKimlik } from '../veri.ts';
import { EN_COK_GORSEL, gorselMi, gorselYukle, type BelgeKaydi } from './gorseller.ts';

// Belge ekleme (prototip adddoc, firma tarafı): firma tarafından eklenen belge doğrudan onaylı kaydedilir. Görüntüler seçilince
// yüklenir; kayıt yalnız yüklenmiş görüntülerin kimliğini taşır.

export interface BelgeFormu { firma: string; tur: string; no: string; duzenleme: string; bitis: string }

export function belgeFormuDogrula(f: BelgeFormu, simdi: number): AlanHatalari {
  const h: AlanHatalari = {};
  if (!f.firma) h['firma'] = 'Firma seçin.';
  if (f.duzenleme && f.duzenleme > bugun(simdi)) h['duzenleme'] = 'Düzenleme tarihi bugünden sonra olamaz.';
  if (f.bitis && f.duzenleme && f.bitis < f.duzenleme) h['bitis'] = 'Bitiş tarihi düzenleme tarihinden önce olamaz.';
  return h;
}

export function yeniBelge(f: BelgeFormu, fotograflar: readonly string[], kullaniciKimligi: string, simdi: number): Omit<BelgeKaydi, 'surum'> {
  const an = new Date(simdi).toISOString();
  return {
    id: yeniKimlik('dc', simdi), partyId: f.firma, type: f.tur, no: f.no.trim(), issuedAt: f.duzenleme,
    ...(f.bitis ? { expiresAt: f.bitis } : {}),
    status: 'approved', photos: [...fotograflar], u: kullaniciKimligi, at: an,
    history: [{ at: an, by: 'firm', u: kullaniciKimligi, text: `${f.tur} eklendi ve onaylandı` }],
  };
}

interface Gorsel { anahtar: string; ad: string; id: string | null; onizleme: string | null }

const onizleme = (f: File): string | null => (typeof URL.createObjectURL === 'function' ? URL.createObjectURL(f) : null);
const birak = (g: Gorsel): void => { if (g.onizleme && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(g.onizleme); };

interface Ozellikler { acik: boolean; kapat: () => void; firmalar: readonly Firma[] }

export function BelgeYukle({ acik, kapat, firmalar }: Ozellikler) {
  const { kisiKimligi, kurumAdi, simdi } = usePortal();
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const sirali = [...firmalar].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const bos = (): BelgeFormu => ({ firma: sirali[0]?.id ?? '', tur: BELGE_TURLERI[0], no: '', duzenleme: bugun(Date.now()), bitis: '' });
  const [gorseller, gorselYaz] = useState<Gorsel[]>([]);
  const yukleniyor = gorseller.some((g) => g.id === null);

  const form = useForm<BelgeFormu>({
    ilk: bos(),
    dogrula: (f) => ({
      ...belgeFormuDogrula(f, Date.now()),
      ...(yukleniyor ? { gorsel: 'Görüntüler yükleniyor; bitince kaydedin.' } : {}),
    }),
    kaydet: async (f) => {
      const c = await kaydet('docs', yeniBelge(f, gorseller.flatMap((g) => (g.id ? [g.id] : [])), kisiKimligi, Date.now()));
      void istemci.invalidateQueries({ queryKey: portalAnahtarlari.koleksiyonlar });
      return c;
    },
    basarili: () => { bildir('tamam', 'Belge kaydedildi'); kapat(); },
    hataIletisi: 'Belge kaydedilemedi.',
  });

  useEffect(() => {
    if (acik) form.sifirla(bos());
    else gorselYaz((g) => { g.forEach(birak); return []; });
  }, [acik]);

  const sec = (o: ChangeEvent<HTMLInputElement>) => {
    const secilen = [...(o.target.files ?? [])];
    o.target.value = '';
    const resimler = secilen.filter(gorselMi).slice(0, Math.max(0, EN_COK_GORSEL - gorseller.length));
    if (resimler.length === 0) {
      bildir('hata', secilen.length > 0 && !secilen.some(gorselMi) ? 'Yalnızca resim dosyaları eklenebilir (JPG, PNG, WEBP).' : `En çok ${String(EN_COK_GORSEL)} görüntü eklenebilir.`);
      return;
    }
    for (const f of resimler) {
      const g: Gorsel = { anahtar: yeniKimlik('g'), ad: f.name, id: null, onizleme: onizleme(f) };
      gorselYaz((l) => [...l, g]);
      gorselYukle(f, kisiKimligi).then(
        (id) => { gorselYaz((l) => l.map((x) => (x.anahtar === g.anahtar ? { ...x, id } : x))); },
        (e: unknown) => {
          birak(g);
          gorselYaz((l) => l.filter((x) => x.anahtar !== g.anahtar));
          bildir('hata', `Resim yüklenemedi: ${hataMetni(e, e instanceof Error ? e.message : 'bilinmeyen hata')}`);
        },
      );
    }
  };
  const kaldir = (g: Gorsel) => { birak(g); gorselYaz((l) => l.filter((x) => x.anahtar !== g.anahtar)); };

  return (
    <FormPenceresi acik={acik} kapat={kapat} baslik="Belge ekle" form={form}>
      <Secim etiket="Firma" required secenekler={sirali.map((p) => ({ deger: p.id, baslik: p.name }))} {...form.alan('firma')} />
      <div className="tc-pt-belgeler-satir">
        <Secim etiket="Belge türü" secenekler={BELGE_TURLERI.map((t) => ({ deger: t, baslik: t }))} {...form.alan('tur')} />
        <Girdi etiket="Belge no" {...form.alan('no')} />
      </div>
      <div className="tc-pt-belgeler-satir">
        <Girdi etiket="Düzenleme tarihi" type="date" max={bugun(simdi)} {...form.alan('duzenleme')} />
        <Girdi etiket="Geçerlilik bitişi (süresizse boş)" type="date" {...form.alan('bitis')} />
      </div>
      <fieldset className="tc-pt-belgeler-yukle">
        <legend>Belge görüntüsü</legend>
        {gorseller.length > 0 && (
          <ul className="tc-pt-belgeler-gorseller" aria-label="Eklenen görüntüler">
            {gorseller.map((g) => (
              <li key={g.anahtar}>
                <span className="tc-pt-belgeler-kucuk" aria-busy={g.id === null || undefined}>
                  {g.onizleme ? <img src={g.onizleme} alt={g.ad} /> : <span>{g.ad}</span>}
                </span>
                <Dugme simge="x" aria-label={`${g.ad} kaldır`} onClick={() => { kaldir(g); }} disabled={g.id === null} />
              </li>
            ))}
          </ul>
        )}
        <label className="tc-pt-belgeler-sec">
          <input type="file" accept="image/*" multiple onChange={sec} disabled={gorseller.length >= EN_COK_GORSEL} />
          <Simge ad="camera" />
          <span>Belge fotoğrafı ekle</span>
        </label>
        {form.hata('gorsel') && <p className="tc-pt-belgeler-hata" role="alert">{form.hata('gorsel')}</p>}
      </fieldset>
      <p className="tc-pt-belgeler-ipucu">{`${kurumAdi} tarafından eklenen belge doğrudan onaylı kaydedilir.`}</p>
    </FormPenceresi>
  );
}
