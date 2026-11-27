import { useState, type ChangeEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dugme, Girdi, Rozet, Tablo, useBildirim, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { DosyaReddi, dosyaIndir, dosyaOku, sablonYaz } from '../../ortak/excel/kitap.ts';
import { basligiSadele, hucreCoz, type ExcelSutunu, type ExcelTanimi } from '../../ortak/excel/kurallar.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { sha256Yazilim } from '../../ortak/veri/ozet.ts';
import type { TopluGirisCevabi } from '#paylasilan/sozlesme/takimhane.ts';
import { IkiGorunum, KompaktListe } from './KompaktListe.tsx';
import { kalemBul, type KutuphaneSatiri } from './kutuphane.ts';
import './takimhane.css';

const SAYFA = 'Açılış ve sayım';
const SUTUNLAR = [
  { anahtar: 'kalem', baslik: 'Kalem kodu', tur: 'metin', zorunlu: true, enUzun: 80, not: 'Stok kartı kodu (TKM-...) ya da kütüphane kalem kodu.' },
  { anahtar: 'goz', baslik: 'Raf gözü', tur: 'metin', zorunlu: true, enUzun: 60, not: 'Stok > Raflar\'daki göz kodu.' },
  { anahtar: 'adet', baslik: 'Adet', tur: 'sayi', zorunlu: true, not: 'Boş gözde açılış adedi, dolu gözde sayılan adet.' },
] as const satisfies readonly ExcelSutunu[];
const TANIM: ExcelTanimi = {
  ad: 'takimhane-acilis', baslik: 'Takımhane açılış ve sayım',
  sayfalar: [{ ad: SAYFA, kayitTuru: 'takım', sutunlar: SUTUNLAR, anahtarSutun: '', kayitlar: [], anahtar: () => '', satir: () => ({}) }],
  kilavuz: [
    'Her satır bir takımın bir raf gözündeki adedidir.',
    'Göz boşsa satır açılış olarak yazılır (tek Stok başlangıç belgesi, geri alınabilir). Göz doluysa kör sayımdır; fark onaya düşer.',
    'Kalemin stok kartı aktif olmalıdır.',
  ],
};

export interface TopluSatir {
  sira: number;
  kalem: string;
  gozKodu: string;
  adet: number | null;
  kartKimlik: number | null;
  tur: 'acilis' | 'sayim' | null;
  hata: string | null;
}

const SONUC: Record<'acilis' | 'sayim', { ad: string; ton: RozetTonu }> = {
  acilis: { ad: 'Açılış', ton: 'tamam' },
  sayim: { ad: 'Dolu göz · sayım farkı onaya', ton: 'uyari' },
};
function Sonuc({ s }: { s: TopluSatir }) {
  if (s.hata !== null) return <Rozet ton="hata">{s.hata}</Rozet>;
  return s.tur === null ? null : <Rozet ton={SONUC[s.tur].ton}>{SONUC[s.tur].ad}</Rozet>;
}

// Excel satırları önce tarayıcıda çözülür (kalem, göz, adet), sonra sunucu gözü ve kartı denetler. Engel varken yazılmaz.
async function dosyaCoz(dosya: File, kalemler: readonly KutuphaneSatiri[]): Promise<{ satirlar: TopluSatir[]; ozet: string }> {
  const sayfalar = await dosyaOku(TANIM, dosya);
  const okunan = sayfalar[SAYFA] ?? [];
  const basliklar = (okunan[0]?.hucreler ?? []).map((b) => (typeof b === 'string' ? basligiSadele(b) : ''));
  const yer = SUTUNLAR.map((c) => basliklar.indexOf(c.baslik));
  if (yer.some((i) => i < 0)) throw new DosyaReddi('Başlıklar şablondaki gibi değil. Şablonu yeniden indirin.');
  const satirlar = okunan.slice(1).map(({ no, hucreler }): TopluSatir => {
    const d = SUTUNLAR.map((c, i) => hucreCoz(c, hucreler[yer[i] ?? -1] ?? null));
    const kalem = String(d[0]?.deger ?? '');
    const gozKodu = String(d[1]?.deger ?? '');
    const adet = typeof d[2]?.deger === 'number' ? d[2].deger : null;
    const alanHatasi = d.find((x) => x.hata)?.hata ?? (kalem === '' ? 'Kalem kodu boş.' : gozKodu === '' ? 'Raf gözü boş.' : adet === null ? 'Adet boş.'
      : !Number.isInteger(adet) || adet < 0 ? 'Adet sıfır ya da pozitif tam sayı olmalı.' : null);
    const bulunan = alanHatasi === null ? kalemBul(kalemler, kalem) : { takim: null, hata: null };
    return { sira: no, kalem, gozKodu, adet, kartKimlik: bulunan.takim?.kartKimlik ?? null, tur: null, hata: alanHatasi ?? bulunan.hata };
  });
  if (satirlar.length === 0) throw new DosyaReddi('Dosyada başlıktan sonra satır yok.');
  const baytlar = new Uint8Array(await dosya.arrayBuffer());
  return { satirlar, ozet: sha256Yazilim(baytlar) };
}

const gonderilecek = (satirlar: readonly TopluSatir[]) => satirlar.flatMap((s) => (s.kartKimlik === null || s.adet === null ? []
  : [{ sira: s.sira, kartKimlik: s.kartKimlik, gozKodu: s.gozKodu, adet: s.adet }]));

export function TopluGiris({ kalemler }: { kalemler: readonly KutuphaneSatiri[] }) {
  const istemci = useQueryClient();
  const bildirim = useBildirim();
  const [dosya, dosyaYaz] = useState<{ ad: string; ozet: string; satirlar: TopluSatir[]; istekKimligi: string } | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);
  const oku = useMutation({
    mutationFn: async (f: File) => {
      const c = await dosyaCoz(f, kalemler);
      const giden = gonderilecek(c.satirlar);
      const denetim = giden.length === 0 ? null : await api.post<TopluGirisCevabi>('/takimhane/toplu/denetle', { satirlar: giden });
      const sonuc = new Map(denetim?.satirlar.map((s) => [s.sira, s]) ?? []);
      return { ad: f.name, ozet: c.ozet, istekKimligi: yeniIstekKimligi(), satirlar: c.satirlar.map((s) => {
        const r = sonuc.get(s.sira);
        return r ? { ...s, tur: r.tur, hata: s.hata ?? r.hata } : s;
      }) };
    },
    onSuccess: (d) => { hataYaz(null); dosyaYaz(d); },
    onError: (h) => { dosyaYaz(null); hataYaz(h instanceof DosyaReddi ? h.message : hataIletisi(h, 'Dosya okunamadı.')); },
  });
  const yaz = useMutation({
    mutationFn: (d: NonNullable<typeof dosya>) => api.post<TopluGirisCevabi>('/takimhane/toplu', {
      satirlar: gonderilecek(d.satirlar), dosyaOzeti: d.ozet, dosyaAdi: d.ad.slice(0, 120),
    }, { istekKimligi: d.istekKimligi }),
    onSuccess: (c) => {
      if (!c.yazildi) {
        const sonuc = new Map(c.satirlar.map((s) => [s.sira, s]));
        dosyaYaz((d) => d && { ...d, satirlar: d.satirlar.map((s) => { const r = sonuc.get(s.sira); return r ? { ...s, tur: r.tur, hata: r.hata } : s; }) });
        bildirim.bildir('hata', 'Engel var; hiçbir satır yazılmadı.');
        return;
      }
      bildirim.bildir('tamam', [c.belgeNo === null ? null : `Açılış belgesi ${c.belgeNo}`, c.sayim > 0 ? `${String(c.sayim)} sayım onaya düştü` : null].filter(Boolean).join(' · ') || 'Yazıldı.');
      dosyaYaz(null);
      void istemci.invalidateQueries({ queryKey: ['takimhane'] });
    },
    onError: (h) => { bildirim.bildir('hata', hataIletisi(h, 'Yazılamadı.')); },
  });
  const sec = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) oku.mutate(f);
  };
  const sablon = async () => { dosyaIndir('takimhane-acilis.xlsx', await sablonYaz(TANIM)); };
  const engel = dosya?.satirlar.filter((s) => s.hata !== null).length ?? 0;
  const sutunlar: readonly Sutun<TopluSatir>[] = [
    { anahtar: 'sira', baslik: 'Satır', mono: true, hizala: 'sag', hucre: (s) => s.sira },
    { anahtar: 'kalem', baslik: 'Kalem', mono: true, kirilmaz: true, hucre: (s) => s.kalem },
    { anahtar: 'goz', baslik: 'Raf gözü', mono: true, kirilmaz: true, hucre: (s) => s.gozKodu },
    { anahtar: 'adet', baslik: 'Adet', mono: true, hizala: 'sag', hucre: (s) => s.adet },
    { anahtar: 'durum', baslik: 'Sonuç', kartTamSatir: true, hucre: (s) => <Sonuc s={s} /> },
  ];
  return (
    <div className="tc-tkm-yigin">
      <div className="tc-tkm-eylemler tc-tkm-sola">
        <Dugme simge="download" onClick={() => { void sablon(); }}>Şablonu indir</Dugme>
      </div>
      <Girdi etiket="Excel dosyası (.xlsx, bu sayfanın şablonu)" type="file" accept=".xlsx" onChange={sec} disabled={oku.isPending} />
      {hata !== null && <p role="alert" className="tc-tkm-uyari">{hata}</p>}
      {dosya === null ? <p className="tc-tkm-bos">Dosya seçilince satırlar tek tek ön izlenir; hiçbir şey kendiliğinden yazılmaz.</p> : (
        <>
          <p className="tc-tkm-soluk">{dosya.ad} · {dosya.satirlar.length} satır{engel > 0 ? ` · ${String(engel)} engel` : ''}</p>
          <IkiGorunum
            masa={<Tablo etiket="Toplu giriş ön izlemesi" sutunlar={sutunlar} satirlar={dosya.satirlar} satirAnahtari={(s) => s.sira} kip="kaydir" />}
            kompakt={(
              <KompaktListe
                etiket="Toplu giriş ön izlemesi" satirlar={dosya.satirlar} satirAnahtari={(s) => s.sira}
                baslik={(s) => <span className="mono">{s.kalem}</span>} sag={(s) => (s.adet === null ? '—' : `${String(s.adet)} adet`)}
                alt={(s) => `satır ${String(s.sira)} · ${s.gozKodu}`} ek={(s) => <Sonuc s={s} />}
              />
            )}
          />
          <p className="tc-tkm-soluk">Engel varken yazılmaz; ya hepsi ya hiçbiri. Açılışlar tek Stok başlangıç belgesine, dolu gözler sayım farkına gider.</p>
          <div className="tc-tkm-eylemler">
            <Dugme onClick={() => { dosyaYaz(null); }}>Vazgeç</Dugme>
            <Dugme tur="birincil" simge="upload" disabled={engel > 0 || yaz.isPending} onClick={() => { yaz.mutate(dosya); }}>
              {engel > 0 ? `${String(engel)} engel giderilince yaz` : 'Yaz'}
            </Dugme>
          </div>
        </>
      )}
    </div>
  );
}
