import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SeciciCizimi, TalepCizimi, TalepCizimiSecimi } from '#paylasilan/sozlesme/satin-alma.ts';
import { Dugme, Menu, OnayPenceresi, Pencere, Rozet, Sekmeler, Simge, type MenuOgesi } from '../../../ortak/arayuz/index.ts';
import { ApiHatasi } from '../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import { DosyaHatasi, dosyaYukle } from '../../belge-merkezi/disari.ts';
import { SURE, cagri } from './ortak.ts';
import './talep.css';

// 3442-2, 3571: talebin çizimi (PDF). Bilgisayardan yüklenir ya da Çizim Merkezi (yalnız yayındaki revizyon) ve Ortak Dosyalar'dan
// seçilir. Seçimde istemci özet göndermez, kaynağın kimliğini gönderir; kimin gördüğü ve neyi seçebildiği sunucudadır.
export type SecilenCizim =
  | { tur: 'yuklendi'; ozet: string; ad: string }
  | { tur: 'cizim-merkezi'; belgeId: number; revizyonId: number; ad: string; revKodu: string | null }
  | { tur: 'ortak-dosyalar'; dosyaId: number; surumSirasi: number; ad: string; klasorYolu: string[]; dar: boolean };
const secimAnahtari = (c: SecilenCizim): string =>
  c.tur === 'yuklendi' ? c.ozet : c.tur === 'cizim-merkezi' ? `cm:${String(c.belgeId)}:${String(c.revizyonId)}` : `od:${String(c.dosyaId)}:${String(c.surumSirasi)}`;
const secimGovdesi = (c: Exclude<SecilenCizim, { tur: 'yuklendi' }>): TalepCizimiSecimi =>
  c.tur === 'cizim-merkezi' ? { kaynak: 'cizim-merkezi', belgeId: c.belgeId, revizyonId: c.revizyonId } : { kaynak: 'ortak-dosyalar', dosyaId: c.dosyaId, surumSirasi: c.surumSirasi };

const anahtar = (talepId: string) => ['satin-alma', 'cizimler', talepId] as const;
export const cizimAdresi = (talepId: string, ozet: string) =>
  `/api/satin-alma-talepleri/${encodeURIComponent(talepId)}/cizimler/${encodeURIComponent(ozet)}/dosya`;
const boyutYaz = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024)).toLocaleString('tr-TR')} KB`);
const zamanYaz = (z: string) => new Date(z).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
// Sınır sunucudadır (sozlesme TALEP_CIZIMI_AZAMI_BAYT); burada yalnız yüklemeden önce uyarmak için (istemci sözleşmeyi değer olarak ithal etmez).
const AZAMI_MB = 20;
const TALEP_CIZIMI_AZAMI_BAYT = AZAMI_MB * 1024 * 1024;
const MERKEZ_OKUR = ['sayfa.cizimler', 'belge-merkezi.oku'];
const ORTAK_OKUR = 'sayfa.ortak-dosyalar';

async function pdfYukle(dosya: File): Promise<SecilenCizim> {
  if (dosya.type !== 'application/pdf' && !/\.pdf$/i.test(dosya.name)) throw new DosyaHatasi('Çizim PDF olmalı.');
  if (dosya.size > TALEP_CIZIMI_AZAMI_BAYT) throw new DosyaHatasi(`Çizim en çok ${String(AZAMI_MB)} MB olur.`);
  const ozet = await dosyaYukle(new Uint8Array(await dosya.arrayBuffer()), () => undefined);
  return { tur: 'yuklendi', ozet, ad: dosya.name.slice(-120) };
}
const hataMetni = (h: unknown) => (h instanceof DosyaHatasi ? h.message : h instanceof ApiHatasi && h.sunucuIletisi ? h.sunucuIletisi : 'Çizim eklenemedi; yeniden deneyin.');

export async function cizimBagla(talepId: string, c: SecilenCizim): Promise<void> {
  const istekKimligi = yeniIstekKimligi();
  if (c.tur === 'yuklendi') {
    await tekrarKorumaliGonder(
      (deneme) => cagri.post('/satin-alma-talepleri/:id/cizim-bagla', { parametre: { id: talepId }, govde: { ozet: c.ozet, dosyaAdi: c.ad }, ...deneme, ...SURE }),
      { ...SURE, istekKimligi },
    );
    return;
  }
  await tekrarKorumaliGonder(
    (deneme) => cagri.post('/satin-alma-talepleri/:id/cizim-sec', { parametre: { id: talepId }, govde: secimGovdesi(c), ...deneme, ...SURE }),
    { ...SURE, istekKimligi },
  );
}

// Seçici sekmeleri yalnız kaynağı okuyabilene görünür; sunucu yine denetler (görmediği kayıt 404).
function useKaynaklar(): { merkez: boolean; ortak: boolean } {
  const { data: k } = useOturum();
  const islemler: readonly string[] = k?.islemler ?? [];
  return { merkez: MERKEZ_OKUR.some((i) => islemler.includes(i)), ortak: islemler.includes(ORTAK_OKUR) };
}

const cizimAdi = (c: SeciciCizimi) => (/\.pdf$/i.test(c.ad) ? c.ad : `${c.ad}.pdf`);
const merkezSecimi = (c: SeciciCizimi): SecilenCizim => ({ tur: 'cizim-merkezi', belgeId: c.belgeId, revizyonId: c.revizyonId, ad: cizimAdi(c), revKodu: c.revKodu });
const KULLANIM: Record<string, string> = { 'dis-uretim': 'dış üretim', 'ic-uretim': 'iç üretim', kalite: 'kalite', montaj: 'montaj' };
const cizimAlti = (c: SeciciCizimi) => [
  c.revKodu === null ? null : `Rev ${c.revKodu}`, c.kullanim === null ? null : `türev · ${KULLANIM[c.kullanim] ?? c.kullanim}`,
].filter(Boolean).join(' · ');

// Öneri şeridi: talep kalemlerinin malzemelerine bağlı yayındaki çizimler. Çizim Merkezi'ni okuyamayan kişide istek gitmez
// (sunucu 404 verirdi; her açılışta konsol hatası), şerit çizilmez.
function OneriSeridi({ talepId, malzemeNolari, ekli, ekle, yukleniyor }: {
  talepId?: string; malzemeNolari?: readonly number[]; ekli: ReadonlySet<string>; ekle: (c: SecilenCizim) => void; yukleniyor: boolean;
}) {
  const { merkez: merkezOkur } = useKaynaklar();
  const malzeme = malzemeNolari?.length ? [...new Set(malzemeNolari)].slice(0, 50).join(',') : undefined;
  const sorgu = useQuery({
    queryKey: ['satin-alma', 'cizim-onerileri', talepId ?? null, malzeme ?? null],
    queryFn: () => cagri.get('/satin-alma-cizim-secici/cizimler', { sorgu: { ...(talepId ? { talep: talepId } : {}), ...(malzeme ? { malzeme } : {}) }, ...SURE }),
    enabled: merkezOkur && (talepId !== undefined || malzeme !== undefined),
    retry: false,
  });
  const oneriler = (sorgu.data?.oneriler ?? []).filter((c) => c.pdf);
  if (oneriler.length === 0) return null;
  return (
    <div className="sa-cizim-oneri" role="group" aria-label="Bu malzemelerin Çizim Merkezi'ndeki çizimleri">
      <span className="sa-cizim-oneri-baslik"><Simge ad="list" boyut="k" /> Bu malzemelerin Çizim Merkezi'ndeki çizimleri</span>
      <ul>
        {oneriler.map((c) => {
          const s = merkezSecimi(c);
          const var_ = ekli.has(secimAnahtari(s));
          return (
            <li key={secimAnahtari(s)}>
              <span className="sa-cizim-tur">PDF</span>
              <span className="sa-cizim-oneri-ad"><b>{c.ad}</b><small>{[cizimAlti(c), var_ ? 'eklendi' : null].filter(Boolean).join(' · ')}</small></span>
              {var_ ? <Simge ad="check" boyut="k" /> : <Dugme simge="plus" yukleniyor={yukleniyor} aria-label={`${c.ad}: ekle`} onClick={() => ekle(s)}>Ekle</Dugme>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type SeciciSekmesi = 'merkez' | 'ortak';
const DAR = '(max-width: 479px)';
const darAbone = (f: () => void) => {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const m = window.matchMedia(DAR);
  m.addEventListener('change', f);
  return () => { m.removeEventListener('change', f); };
};
const useDarEkran = () => useSyncExternalStore(darAbone, () => typeof window.matchMedia === 'function' && window.matchMedia(DAR).matches);

function SeciciSatiri({ ad, alt, pdf, secili, degistir, uyari }: { ad: string; alt: string; pdf: boolean; secili: boolean; degistir: () => void; uyari?: string | null }) {
  return (
    <li className={`sa-secici-satir${pdf ? '' : ' sa-secici-soluk'}${secili ? ' sa-secici-secili' : ''}`}>
      <label>
        <input type="checkbox" checked={secili} disabled={!pdf} onChange={degistir} />
        <span className="sa-cizim-tur">{pdf ? 'PDF' : 'DOSYA'}</span>
        <span className="sa-secici-ad"><span>{ad}</span><small>{pdf ? alt : 'Yalnız PDF eklenir'}</small>
          {pdf && uyari && <small className="sa-secici-uyari"><Simge ad="alert" boyut="k" /> {uyari}</small>}</span>
      </label>
    </li>
  );
}

function ListeDurumu({ okunuyor, hata, yenile, bos }: { okunuyor: boolean; hata: boolean; yenile: () => void; bos: string | null }) {
  if (okunuyor) return <p className="sa-talep-not" role="status">Liste okunuyor</p>;
  if (hata) return <p className="sa-talep-hata" role="alert">Liste okunamadı. <Dugme simge="rotate" onClick={yenile}>Yeniden dene</Dugme></p>;
  return bos === null ? null : <p className="sa-talep-not">{bos}</p>;
}

function MerkezSekmesi({ talepId, malzemeNolari, secim, degistir, ekli }: {
  talepId?: string; malzemeNolari?: readonly number[]; secim: ReadonlyMap<string, SecilenCizim>; degistir: (c: SecilenCizim) => void; ekli: ReadonlySet<string>;
}) {
  const [ara, araYaz] = useState('');
  const malzeme = malzemeNolari?.length ? [...new Set(malzemeNolari)].slice(0, 50).join(',') : undefined;
  const q = useQuery({
    queryKey: ['satin-alma', 'cizim-secici', talepId ?? null, malzeme ?? null, ara.trim()],
    queryFn: () => cagri.get('/satin-alma-cizim-secici/cizimler', {
      sorgu: { ...(talepId ? { talep: talepId } : {}), ...(malzeme ? { malzeme } : {}), ...(ara.trim() ? { ara: ara.trim() } : {}) }, ...SURE,
    }),
    retry: false,
  });
  const grup = (baslik: string, l: readonly SeciciCizimi[]) => (l.length === 0 ? null : (
    <section className="sa-secici-grup" aria-label={baslik}>
      <h3>{baslik}</h3>
      <ul>{l.map((c) => {
        const s = merkezSecimi(c);
        const k = secimAnahtari(s);
        const zatenEkli = ekli.has(k);
        return <SeciciSatiri key={k} ad={c.ad} alt={[cizimAlti(c), zatenEkli ? 'talepte ekli' : null].filter(Boolean).join(' · ')} pdf={c.pdf && !zatenEkli} secili={secim.has(k)} degistir={() => degistir(s)} />;
      })}</ul>
    </section>
  ));
  const oneriler = q.data?.oneriler ?? [];
  const onerilenler = new Set(oneriler.map((c) => c.belgeId));
  const bulunan = (q.data?.bulunan ?? []).filter((c) => !onerilenler.has(c.belgeId));
  return (
    <div className="sa-secici-govde">
      <label className="sa-secici-ara"><Simge ad="search" boyut="k" />
        <input type="search" value={ara} onChange={(e) => araYaz(e.target.value)} maxLength={80} placeholder="Çizim adı ya da malzeme kodu" aria-label="Çizim ara" /></label>
      <ListeDurumu okunuyor={q.isPending} hata={q.isError} yenile={() => { void q.refetch(); }}
        bos={q.isSuccess && oneriler.length === 0 && bulunan.length === 0 ? (ara.trim() ? 'Aramaya uyan yayındaki çizim yok.' : 'Talebin malzemelerine bağlı çizim yok; aramak için yazın.') : null} />
      {grup('Talebin malzemeleri', oneriler)}
      {grup('Aramada bulunan', bulunan)}
    </div>
  );
}

function OrtakSekmesi({ secim, degistir }: { secim: ReadonlyMap<string, SecilenCizim>; degistir: (c: SecilenCizim) => void }) {
  const [klasorId, klasorIdYaz] = useState<number | null>(null);
  const [ara, araYaz] = useState('');
  const klasorler = useQuery({ queryKey: ['satin-alma', 'cizim-secici', 'klasorler'], queryFn: () => cagri.get('/satin-alma-cizim-secici/klasorler', SURE), retry: false });
  const liste = klasorler.data?.klasorler ?? [];
  const derinlik = useMemo(() => {
    const ust = new Map(liste.map((k) => [k.id, k.ustId]));
    const d = (id: number): number => { let n = 0; for (let u = ust.get(id) ?? null; u !== null && n < 20; u = ust.get(u) ?? null) n += 1; return n; };
    return new Map(liste.map((k) => [k.id, d(k.id)]));
  }, [liste]);
  // Ağaç sırası: üst klasörün hemen altında çocukları.
  const sirali = useMemo(() => {
    const cocuk = (ust: number | null) => liste.filter((k) => k.ustId === ust || (ust === null && k.ustId !== null && !liste.some((x) => x.id === k.ustId))).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
    const sonuc: typeof liste = [];
    const gez = (ust: number | null, n: number) => { if (n > 20) return; for (const k of cocuk(ust)) { sonuc.push(k); gez(k.id, n + 1); } };
    gez(null, 0);
    return sonuc;
  }, [liste]);
  const secili = liste.find((k) => k.id === klasorId) ?? null;
  const yol = (id: number): string[] => { const y: string[] = []; for (let k = liste.find((x) => x.id === id); k && y.length < 20; k = liste.find((x) => x.id === k?.ustId)) y.unshift(k.ad); return y; };
  const dosyalar = useQuery({
    queryKey: ['satin-alma', 'cizim-secici', 'dosyalar', klasorId, ara.trim()],
    queryFn: () => cagri.get('/satin-alma-cizim-secici/klasorler/:klasorId/dosyalar', { parametre: { klasorId: klasorId! }, sorgu: ara.trim() ? { ara: ara.trim() } : {}, ...SURE }),
    enabled: klasorId !== null, retry: false,
  });
  return (
    <div className="sa-secici-govde">
      <label className="sa-secici-ara"><Simge ad="search" boyut="k" />
        <input type="search" value={ara} onChange={(e) => araYaz(e.target.value)} maxLength={80} placeholder="Bu klasörde ara" aria-label="Klasörde ara" disabled={klasorId === null} /></label>
      <ListeDurumu okunuyor={klasorler.isPending} hata={klasorler.isError} yenile={() => { void klasorler.refetch(); }} bos={klasorler.isSuccess && liste.length === 0 ? 'Görebildiğiniz klasör yok.' : null} />
      {liste.length > 0 && (
        <div className="sa-secici-od">
          <ul className="sa-secici-klasorler" aria-label="Klasörler">
            {sirali.map((k) => (
              <li key={k.id} data-derinlik={Math.min(derinlik.get(k.id) ?? 0, 4)}>
                <button type="button" className={k.id === klasorId ? 'sa-secici-klasor secili' : 'sa-secici-klasor'} aria-pressed={k.id === klasorId} onClick={() => klasorIdYaz(k.id)}>
                  <Simge ad="box" boyut="k" /> {k.ad}
                </button>
              </li>
            ))}
          </ul>
          <div className="sa-secici-dosyalar">
            {secili === null ? <p className="sa-talep-not">Bir klasör seçin.</p> : (
              <>
                <ListeDurumu okunuyor={dosyalar.isPending} hata={dosyalar.isError} yenile={() => { void dosyalar.refetch(); }}
                  bos={dosyalar.isSuccess && dosyalar.data.dosyalar.length === 0 ? 'Bu klasörde dosya yok.' : null} />
                <ul>{(dosyalar.data?.dosyalar ?? []).map((d) => {
                  const s: SecilenCizim = { tur: 'ortak-dosyalar', dosyaId: d.dosyaId, surumSirasi: d.surumSirasi, ad: d.ad, klasorYolu: yol(secili.id), dar: d.dar };
                  const k = secimAnahtari(s);
                  return <SeciciSatiri key={k} ad={d.ad} alt={`sürüm ${String(d.surumSirasi)} · ${boyutYaz(d.boyut)}`} pdf={d.pdf} secili={secim.has(k)} degistir={() => degistir(s)}
                    uyari={d.dar ? 'Dar klasör: talebi gören herkes görür' : null} />;
                })}</ul>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CizimSeciciPenceresi({ acik, kapat, sekme, sekmeYaz, kaynaklar, talepId, malzemeNolari, ekli, ekle, yukleniyor }: {
  acik: boolean; kapat: () => void; sekme: SeciciSekmesi; sekmeYaz: (s: SeciciSekmesi) => void; kaynaklar: { merkez: boolean; ortak: boolean };
  talepId?: string; malzemeNolari?: readonly number[]; ekli: ReadonlySet<string>; ekle: (l: SecilenCizim[]) => void; yukleniyor: boolean;
}) {
  const [secim, secimYaz] = useState<Map<string, SecilenCizim>>(new Map());
  const degistir = (c: SecilenCizim) => secimYaz((m) => { const y = new Map(m); const k = secimAnahtari(c); if (y.has(k)) y.delete(k); else y.set(k, c); return y; });
  const bitir = () => { secimYaz(new Map()); kapat(); };
  const dar_ = useDarEkran();
  const secilenler = [...secim.values()];
  const say = (tur: SecilenCizim['tur']) => secilenler.filter((c) => c.tur === tur).length;
  // Sekmede o kaynaktan seçilen sayısı: öbür sekmede seçilen dosya görünmese de kaybolmaz. Telefonda iki sekme tek satıra sığsın diye kısa ad.
  const sekmeler = [
    ...(kaynaklar.merkez ? [{ anahtar: 'merkez' as const, baslik: dar_ ? 'Merkez' : 'Çizim Merkezi', simge: 'layers' as const, sayi: say('cizim-merkezi') }] : []),
    ...(kaynaklar.ortak ? [{ anahtar: 'ortak' as const, baslik: dar_ ? 'Ortak' : 'Ortak Dosyalar', simge: 'box' as const, sayi: say('ortak-dosyalar') }] : []),
  ];
  const dar = secilenler.some((c) => c.tur === 'ortak-dosyalar' && c.dar);
  return (
    <Pencere acik={acik} kapat={bitir} baslik="Çizim seç" tur="yan"
      alt={(
        <div className="sa-secici-alt">
          <span>{secim.size === 0 ? 'Çizim seçilmedi' : `${String(secim.size)} çizim seçildi: ${secilenler.map((c) => c.ad).join(', ')}`}
            {dar && <small className="sa-secici-uyari"><Simge ad="alert" boyut="k" /> Dar klasördeki dosya talebi gören herkese açılır</small>}</span>
          <Dugme onClick={bitir}>Vazgeç</Dugme>
          <Dugme tur="birincil" disabled={secim.size === 0} yukleniyor={yukleniyor} onClick={() => { ekle([...secim.values()]); secimYaz(new Map()); }}>
            {secim.size > 0 ? `${String(secim.size)} çizim ekle` : 'Çizim ekle'}
          </Dugme>
        </div>
      )}>
      {!kaynaklar.merkez && <p className="sa-talep-not">Çizim Merkezi'ni görme yetkiniz yok; yalnız Ortak Dosyalar'dan ya da bilgisayardan eklersiniz.</p>}
      {sekmeler.length > 1 && <Sekmeler etiket="Çizim kaynağı" sekmeler={sekmeler} secili={sekme} sec={sekmeYaz} />}
      {sekme === 'merkez' && kaynaklar.merkez && <MerkezSekmesi {...(talepId ? { talepId } : {})} {...(malzemeNolari ? { malzemeNolari } : {})} secim={secim} degistir={degistir} ekli={ekli} />}
      {sekme === 'ortak' && kaynaklar.ortak && <OrtakSekmesi secim={secim} degistir={degistir} />}
    </Pencere>
  );
}

// "Çizim ekle" menüsü: Bilgisayardan (PDF), Çizim Merkezi'nden, Ortak Dosyalar'dan. Görmediği kaynak menüde yoktur.
function CizimEkle({ yukleniyor, bilgisayardan, sec, talepId, malzemeNolari, ekli }: {
  yukleniyor: boolean; bilgisayardan: (d: File[]) => void; sec: (l: SecilenCizim[]) => void; talepId?: string; malzemeNolari?: readonly number[]; ekli: ReadonlySet<string>;
}) {
  const girdi = useRef<HTMLInputElement>(null);
  const kaynaklar = useKaynaklar();
  const [acik, acikYaz] = useState<SeciciSekmesi | null>(null);
  const ogeler: MenuOgesi[] = [
    { anahtar: 'pc', baslik: 'Bilgisayardan (PDF)', simge: 'upload', sec: () => girdi.current?.click() },
    ...(kaynaklar.merkez ? [{ anahtar: 'merkez', baslik: "Çizim Merkezi'nden", simge: 'layers' as const, sec: () => acikYaz('merkez') }] : []),
    ...(kaynaklar.ortak ? [{ anahtar: 'ortak', baslik: "Ortak Dosyalar'dan", simge: 'box' as const, sec: () => acikYaz('ortak') }] : []),
  ];
  return (
    <>
      <input ref={girdi} type="file" accept="application/pdf,.pdf" multiple hidden aria-label="Çizim dosyası (PDF)"
        onChange={(e) => { bilgisayardan([...(e.target.files ?? [])]); e.target.value = ''; }} />
      {ogeler.length === 1
        ? <Dugme simge="upload" yukleniyor={yukleniyor} onClick={() => girdi.current?.click()}>Çizim ekle (PDF)</Dugme>
        : <Menu etiket="Çizim ekle" metin="Çizim ekle" simge="plus" ogeler={ogeler} pasif={yukleniyor} />}
      <CizimSeciciPenceresi acik={acik !== null} kapat={() => acikYaz(null)} sekme={acik ?? 'merkez'} sekmeYaz={acikYaz} kaynaklar={kaynaklar}
        {...(talepId ? { talepId } : {})} {...(malzemeNolari ? { malzemeNolari } : {})} ekli={ekli} yukleniyor={yukleniyor}
        ekle={(l) => { acikYaz(null); sec(l); }} />
    </>
  );
}

const KAYNAK_METNI = { yuklendi: 'Yüklendi', 'cizim-merkezi': 'Çizim Merkezi', 'ortak-dosyalar': 'Ortak Dosyalar' } as const;
function KaynakRozeti({ c }: { c: SecilenCizim | TalepCizimi['kaynak'] }) {
  const tur = c.tur;
  const rev = c.tur === 'cizim-merkezi' && c.revKodu !== null ? ` · Rev ${c.revKodu}` : '';
  return <Rozet ton="pasif" gorunum="cizgi">{KAYNAK_METNI[tur]}{rev}</Rozet>;
}

// Talep açılmadan seçilen çizimler: bilgisayardan seçilen dosya hemen depoya yüklenir; hepsi talep açılınca bağlanır.
export function CizimSecici({ secilen, degistir, malzemeNolari }: { secilen: readonly SecilenCizim[]; degistir: (l: SecilenCizim[]) => void; malzemeNolari?: readonly number[] }) {
  const [yukleniyor, yukleniyorYaz] = useState(false);
  const [hata, hataYaz] = useState<string | null>(null);
  const ekli = new Set(secilen.map(secimAnahtari));
  const ekle = (l: readonly SecilenCizim[]) => degistir([...secilen, ...l.filter((x) => !ekli.has(secimAnahtari(x)))]);
  const sec = async (dosyalar: File[]) => {
    yukleniyorYaz(true); hataYaz(null);
    const eklenen: SecilenCizim[] = [];
    const hatalar: string[] = [];
    for (const d of dosyalar) {
      try { eklenen.push(await pdfYukle(d)); } catch (h) { hatalar.push(dosyalar.length > 1 ? `${d.name}: ${hataMetni(h)}` : hataMetni(h)); }
    }
    if (hatalar.length) hataYaz(dosyalar.length > 1 ? `${String(dosyalar.length)} dosyadan ${String(hatalar.length)} tanesi eklenemedi. ${hatalar.join(' ')}` : hatalar.join(' '));
    ekle(eklenen);
    yukleniyorYaz(false);
  };
  return (
    <div className="sa-cizim">
      <div className="sa-cizim-ust">
        <span className="sa-cizim-baslik"><Simge ad="file" boyut="k" /> Çizim{secilen.length > 0 && <small>{String(secilen.length)} çizim</small>}</span>
        <CizimEkle yukleniyor={yukleniyor} bilgisayardan={(d) => { void sec(d); }} sec={ekle} {...(malzemeNolari ? { malzemeNolari } : {})} ekli={ekli} />
      </div>
      <OneriSeridi {...(malzemeNolari ? { malzemeNolari } : {})} ekli={ekli} ekle={(c) => ekle([c])} yukleniyor={false} />
      {secilen.length > 0 && (
        <ul className="sa-cizim-liste">
          {secilen.map((c) => (
            <li key={secimAnahtari(c)}>
              <span className="sa-cizim-tur">PDF</span>
              <span className="sa-cizim-govde"><span className="sa-cizim-ad">{c.ad}</span>
                <span className="sa-cizim-bilgi"><KaynakRozeti c={c} />{c.tur === 'ortak-dosyalar' && <small>{c.klasorYolu.join(' › ')}</small>}</span></span>
              <Dugme simge="trash" aria-label={`${c.ad}: kaldır`} onClick={() => degistir(secilen.filter((x) => secimAnahtari(x) !== secimAnahtari(c)))}>Kaldır</Dugme>
            </li>
          ))}
        </ul>
      )}
      <p className="sa-talep-not">İsteğe bağlı. Yalnız PDF, en çok {AZAMI_MB} MB; satın alma teklif isterken görür.</p>
      {hata && <p className="sa-talep-hata" role="alert">{hata}</p>}
    </div>
  );
}

// Var olan talebin çizimleri: herkes açar; `yazabilir` ise ekler, kaldırır ve günceller (sunucu yine denetler). Satın alma görünümünde
// satır "Talep eden ekledi" ya da "Satın alma ekledi" der; talep görünümünde satın almanın kaldırdığı çizimin notu durur.
export function TalepCizimleri({ talepId, yazabilir, bosGizle = false, gorunum = 'talep' }: {
  talepId: string; yazabilir: boolean; bosGizle?: boolean; gorunum?: 'talep' | 'satin-alma';
}) {
  const istemci = useQueryClient();
  const [hata, hataYaz] = useState<string | null>(null);
  const [silinecek, silinecekYaz] = useState<TalepCizimi | null>(null);
  const liste = useQuery({
    queryKey: anahtar(talepId),
    queryFn: () => cagri.get('/satin-alma-talepleri/:id/cizimler', { parametre: { id: talepId }, ...SURE }),
  });
  const yenile = () => istemci.invalidateQueries({ queryKey: anahtar(talepId) });
  const ekle = useMutation({
    mutationFn: async (l: readonly (File | SecilenCizim)[]) => {
      let olmayan = 0;
      for (const x of l) { try { await cizimBagla(talepId, x instanceof File ? await pdfYukle(x) : x); } catch (h) { olmayan += 1; if (l.length === 1) throw h; } }
      if (olmayan > 0) throw new DosyaHatasi(`${String(l.length)} çizimden ${String(olmayan)} tanesi eklenemedi.`);
    },
    onSuccess: () => { hataYaz(null); },
    onError: (h) => hataYaz(hataMetni(h)),
    onSettled: () => { void yenile(); },
  });
  const kaldir = useMutation({
    mutationFn: (ozet: string) => cagri.post('/satin-alma-talepleri/:id/cizimler/:ozet/kaldir', { parametre: { id: talepId, ozet }, ...SURE }),
    onSuccess: () => { silinecekYaz(null); void yenile(); },
    onError: (h) => { silinecekYaz(null); hataYaz(hataMetni(h)); },
  });
  const guncelle = useMutation({
    mutationFn: (ozet: string) => tekrarKorumaliGonder(
      (deneme) => cagri.post('/satin-alma-talepleri/:id/cizimler/:ozet/guncelle', { parametre: { id: talepId, ozet }, ...deneme, ...SURE }),
      { ...SURE, istekKimligi: yeniIstekKimligi() },
    ),
    onSuccess: () => { hataYaz(null); void yenile(); },
    onError: (h) => hataYaz(hataMetni(h)),
  });
  const cizimler = liste.data?.cizimler ?? [];
  const kaldirilanlar = gorunum === 'talep' ? (liste.data?.kaldirilanlar ?? []) : [];
  const ekli = new Set(cizimler.flatMap((c) => (c.kaynak.tur === 'cizim-merkezi' ? [`cm:${String(c.kaynak.belgeId)}:${String(c.kaynak.revizyonId)}`] : [])));
  if (liste.isError) return bosGizle ? null : <p className="sa-talep-not">Çizimler okunamadı.</p>;
  if (bosGizle && !yazabilir && cizimler.length === 0) return null;
  const satinAlmaKaldiriyor = gorunum === 'satin-alma' && silinecek?.talepten === true;
  return (
    <div className="sa-cizim">
      <div className="sa-cizim-ust">
        <span className="sa-cizim-baslik"><Simge ad="file" boyut="k" /> Çizim{cizimler.length > 0 && <small>{String(cizimler.length)} çizim</small>}</span>
        {yazabilir && <CizimEkle yukleniyor={ekle.isPending} bilgisayardan={(d) => { if (d.length) ekle.mutate(d); }} sec={(l) => { if (l.length) ekle.mutate(l); }} talepId={talepId} ekli={ekli} />}
      </div>
      {yazabilir && <OneriSeridi talepId={talepId} ekli={ekli} ekle={(c) => ekle.mutate([c])} yukleniyor={ekle.isPending} />}
      {liste.isPending ? <p className="sa-talep-not">Çizimler okunuyor</p> : cizimler.length === 0 ? <p className="sa-talep-not">Çizim eklenmemiş.</p> : (
        <ul className="sa-cizim-liste">
          {cizimler.map((c) => {
            const yeni = c.kaynak.tur === 'cizim-merkezi' ? c.kaynak.yeniRevizyon : null;
            return (
              <li key={c.ozet}>
                <span className="sa-cizim-tur">PDF</span>
                <span className="sa-cizim-govde">
                  <a className="sa-cizim-bag" href={cizimAdresi(talepId, c.ozet)} download={c.ad}><span className="sa-cizim-ad">{c.ad}</span></a>
                  <span className="sa-cizim-bilgi">
                    {gorunum === 'satin-alma' && (c.talepten
                      ? <Rozet ton="uyari" gorunum="cizgi">Talep eden ekledi{c.kaynakTalepNo ? ` · ${c.kaynakTalepNo}` : ''}</Rozet>
                      : <Rozet ton="pasif" gorunum="cizgi">Satın alma ekledi</Rozet>)}
                    <KaynakRozeti c={c.kaynak} />
                    {c.kaynak.tur === 'ortak-dosyalar' && c.kaynak.klasorYolu !== null && <small>{c.kaynak.klasorYolu.join(' › ')}</small>}
                    <small>{[c.ekleyenAd, zamanYaz(c.zaman), boyutYaz(c.boyut)].filter(Boolean).join(' · ')}</small>
                    {yazabilir && c.kaldirmaReddi !== null && <small className="sa-cizim-neden">{c.kaldirmaReddi}</small>}
                  </span>
                  {yeni && <span className="sa-cizim-yeni"><Simge ad="alert" boyut="k" /> Yeni revizyon var{yeni.revKodu ? `: Rev ${yeni.revKodu}` : ''}</span>}
                </span>
                <span className="sa-cizim-dugmeler">
                  {yazabilir && yeni && <Dugme simge="rotate" yukleniyor={guncelle.isPending} onClick={() => guncelle.mutate(c.ozet)}>Güncelle</Dugme>}
                  <a className="tc-dugme tc-dugme-ikincil tc-dugme-normal" href={cizimAdresi(talepId, c.ozet)} download={c.ad} aria-label={`${c.ad} indir`}><Simge ad="download" boyut="k" /> İndir</a>
                  {yazabilir && (
                    <Dugme simge="trash" aria-label={`${c.ad}: kaldır`} aria-disabled={c.kaldirmaReddi !== null} {...(c.kaldirmaReddi !== null ? { title: c.kaldirmaReddi } : {})}
                      onClick={() => { if (c.kaldirmaReddi === null) silinecekYaz(c); }}>Kaldır</Dugme>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {kaldirilanlar.length > 0 && (
        <ul className="sa-cizim-kaldirilan" aria-label="Satın almanın kaldırdığı çizimler">
          {kaldirilanlar.map((x, i) => <li key={`${x.ad}-${String(i)}`}><Simge ad="trash" boyut="k" /> Satın alma kaldırdı: {x.ad}{x.kaldiranAd ? ` · ${x.kaldiranAd}` : ''} · {zamanYaz(x.zaman)}</li>)}
        </ul>
      )}
      {gorunum === 'satin-alma' && cizimler.some((c) => c.talepten) && (
        <p className="sa-talep-not">Teklif isteği gönderildikten sonra talepten gelen çizim kaldırılamaz; Güncelle yeni revizyonu ekler, eskisi teklif isteğinde gönderilmiş olarak kalır.</p>
      )}
      {hata && <p className="sa-talep-hata" role="alert">{hata}</p>}
      <OnayPenceresi acik={silinecek !== null} baslik={`${silinecek?.ad ?? ''} talepten kaldırılsın mı?`} onayMetni="Kaldır" tehlikeli
        yukleniyor={kaldir.isPending} onayla={() => { if (silinecek) kaldir.mutate(silinecek.ozet); }} vazgec={() => silinecekYaz(null)}>
        {satinAlmaKaldiriyor
          ? <p>Bu çizimi talep eden ekledi. Kaldırırsanız talep eden de göremez; Taleplerim'de "Satın alma kaldırdı" notu kalır. Çizim Merkezi ve Ortak Dosyalar'daki dosya değişmez.</p>
          : <p>Çizim bu talepten çıkar; geri almak için yeniden eklemek gerekir. Çizim Merkezi ve Ortak Dosyalar'daki dosya değişmez.</p>}
      </OnayPenceresi>
    </div>
  );
}
