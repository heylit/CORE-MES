import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dugme, OnayPenceresi, Simge } from '../../../ortak/arayuz/index.ts';
import { ApiHatasi } from '../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../../ortak/veri/istek-kimligi.ts';
import { DosyaHatasi, dosyaYukle } from '../../belge-merkezi/disari.ts';
import { SURE, cagri } from './ortak.ts';
import './talep.css';

// 3442-2: talebin çizimi (PDF). Talep eden açarken ya da taslakta ekler; satın alma her adımda görür ve ekler. Kimin gördüğü sunucudadır.
export interface SecilenCizim { ozet: string; ad: string }
const anahtar = (talepId: string) => ['satin-alma', 'cizimler', talepId] as const;
export const cizimAdresi = (talepId: string, ozet: string) =>
  `/api/satin-alma-talepleri/${encodeURIComponent(talepId)}/cizimler/${encodeURIComponent(ozet)}/dosya`;
const boyutYaz = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024)).toLocaleString('tr-TR')} KB`);
// Sınır sunucudadır (sozlesme TALEP_CIZIMI_AZAMI_BAYT); burada yalnız yüklemeden önce uyarmak için (istemci sözleşmeyi değer olarak ithal etmez).
const AZAMI_MB = 20;
const TALEP_CIZIMI_AZAMI_BAYT = AZAMI_MB * 1024 * 1024;

async function pdfYukle(dosya: File): Promise<SecilenCizim> {
  if (dosya.type !== 'application/pdf' && !/\.pdf$/i.test(dosya.name)) throw new DosyaHatasi('Çizim PDF olmalı.');
  if (dosya.size > TALEP_CIZIMI_AZAMI_BAYT) throw new DosyaHatasi(`Çizim en çok ${String(AZAMI_MB)} MB olur.`);
  const ozet = await dosyaYukle(new Uint8Array(await dosya.arrayBuffer()), () => undefined);
  return { ozet, ad: dosya.name.slice(-120) };
}
const hataMetni = (h: unknown) => (h instanceof DosyaHatasi ? h.message : h instanceof ApiHatasi && h.sunucuIletisi ? h.sunucuIletisi : 'Çizim yüklenemedi; yeniden deneyin.');

export async function cizimBagla(talepId: string, c: SecilenCizim): Promise<void> {
  await tekrarKorumaliGonder(
    (deneme) => cagri.post('/satin-alma-talepleri/:id/cizim-bagla', { parametre: { id: talepId }, govde: { ozet: c.ozet, dosyaAdi: c.ad }, ...deneme, ...SURE }),
    { ...SURE, istekKimligi: yeniIstekKimligi() },
  );
}

function PdfSec({ sec, yukleniyor }: { sec: (d: File[]) => void; yukleniyor: boolean }) {
  const girdi = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={girdi} type="file" accept="application/pdf,.pdf" multiple hidden aria-label="Çizim dosyası (PDF)"
        onChange={(e) => { sec([...(e.target.files ?? [])]); e.target.value = ''; }} />
      <Dugme simge="upload" yukleniyor={yukleniyor} onClick={() => girdi.current?.click()}>Çizim ekle (PDF)</Dugme>
    </>
  );
}

// Talep açılmadan seçilen çizimler: dosya hemen depoya yüklenir, talep açılınca bağlanır.
export function CizimSecici({ secilen, degistir }: { secilen: readonly SecilenCizim[]; degistir: (l: SecilenCizim[]) => void }) {
  const [yukleniyor, yukleniyorYaz] = useState(false);
  const [hata, hataYaz] = useState<string | null>(null);
  const sec = async (dosyalar: File[]) => {
    yukleniyorYaz(true); hataYaz(null);
    const eklenen: SecilenCizim[] = [];
    const hatalar: string[] = [];
    for (const d of dosyalar) {
      try { eklenen.push(await pdfYukle(d)); } catch (h) { hatalar.push(dosyalar.length > 1 ? `${d.name}: ${hataMetni(h)}` : hataMetni(h)); }
    }
    if (hatalar.length) hataYaz(dosyalar.length > 1 ? `${String(dosyalar.length)} dosyadan ${String(hatalar.length)} tanesi eklenemedi. ${hatalar.join(' ')}` : hatalar.join(' '));
    degistir([...secilen, ...eklenen.filter((x) => !secilen.some((s) => s.ozet === x.ozet))]);
    yukleniyorYaz(false);
  };
  return (
    <div className="sa-cizim">
      <span className="sa-cizim-baslik"><Simge ad="file" boyut="k" /> Çizim</span>
      {secilen.length > 0 && (
        <ul className="sa-cizim-liste">
          {secilen.map((c) => (
            <li key={c.ozet}><Simge ad="file" boyut="k" /><span className="sa-cizim-ad">{c.ad}</span>
              <Dugme simge="trash" aria-label={`${c.ad}: kaldır`} onClick={() => degistir(secilen.filter((x) => x.ozet !== c.ozet))}>Kaldır</Dugme></li>
          ))}
        </ul>
      )}
      <PdfSec sec={(d) => { void sec(d); }} yukleniyor={yukleniyor} />
      <p className="sa-talep-not">İsteğe bağlı. Yalnız PDF, en çok {AZAMI_MB} MB; satın alma teklif isterken görür.</p>
      {hata && <p className="sa-talep-hata" role="alert">{hata}</p>}
    </div>
  );
}

// Var olan talebin çizimleri: herkes açar; `yazabilir` ise ekler ve kaldırır (sunucu yine denetler).
export function TalepCizimleri({ talepId, yazabilir, bosGizle = false }: { talepId: string; yazabilir: boolean; bosGizle?: boolean }) {
  const istemci = useQueryClient();
  const [hata, hataYaz] = useState<string | null>(null);
  const [silinecek, silinecekYaz] = useState<SecilenCizim | null>(null);
  const liste = useQuery({
    queryKey: anahtar(talepId),
    queryFn: () => cagri.get('/satin-alma-talepleri/:id/cizimler', { parametre: { id: talepId }, ...SURE }),
  });
  const yenile = () => istemci.invalidateQueries({ queryKey: anahtar(talepId) });
  const ekle = useMutation({
    mutationFn: async (dosyalar: File[]) => { for (const d of dosyalar) await cizimBagla(talepId, await pdfYukle(d)); },
    onSuccess: () => { hataYaz(null); },
    onError: (h) => hataYaz(hataMetni(h)),
    onSettled: () => { void yenile(); },
  });
  const kaldir = useMutation({
    mutationFn: (ozet: string) => cagri.post('/satin-alma-talepleri/:id/cizimler/:ozet/kaldir', { parametre: { id: talepId, ozet }, ...SURE }),
    onSuccess: () => { silinecekYaz(null); void yenile(); },
    onError: (h) => { silinecekYaz(null); hataYaz(hataMetni(h)); },
  });
  const cizimler = liste.data?.cizimler ?? [];
  if (liste.isError) return bosGizle ? null : <p className="sa-talep-not">Çizimler okunamadı.</p>;
  if (bosGizle && !yazabilir && cizimler.length === 0) return null;
  return (
    <div className="sa-cizim">
      <span className="sa-cizim-baslik"><Simge ad="file" boyut="k" /> Çizim</span>
      {liste.isPending ? <p className="sa-talep-not">Çizimler okunuyor</p> : cizimler.length === 0 ? <p className="sa-talep-not">Çizim eklenmemiş.</p> : (
        <ul className="sa-cizim-liste">
          {cizimler.map((c) => (
            <li key={c.ozet}>
              <a className="sa-cizim-bag" href={cizimAdresi(talepId, c.ozet)} download={c.ad} aria-label={`${c.ad} indir`}><Simge ad="download" boyut="k" /><span className="sa-cizim-ad">{c.ad}</span></a>
              <span className="sa-talep-not">{boyutYaz(c.boyut)}</span>
              {yazabilir && <Dugme simge="trash" aria-label={`${c.ad}: kaldır`} onClick={() => silinecekYaz({ ozet: c.ozet, ad: c.ad })}>Kaldır</Dugme>}
            </li>
          ))}
        </ul>
      )}
      {yazabilir && <PdfSec sec={(d) => { if (d.length) ekle.mutate(d); }} yukleniyor={ekle.isPending} />}
      {hata && <p className="sa-talep-hata" role="alert">{hata}</p>}
      <OnayPenceresi acik={silinecek !== null} baslik={`${silinecek?.ad ?? ''} talepten kaldırılsın mı?`} onayMetni="Kaldır" tehlikeli
        yukleniyor={kaldir.isPending} onayla={() => { if (silinecek) kaldir.mutate(silinecek.ozet); }} vazgec={() => silinecekYaz(null)}>
        <p>Çizim bu talepten çıkar; geri almak için dosyayı yeniden eklemek gerekir.</p>
      </OnayPenceresi>
    </div>
  );
}
