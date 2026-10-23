import { useMemo } from 'react';
import { useBildirim } from '../../../../ortak/arayuz/Bildirim.tsx';
import { Dugme } from '../../../../ortak/arayuz/Dugme.tsx';
import { AdimliForm, type FormVerisi, type KmAdim, type KmAlan } from '../AdimliForm.tsx';
import { Damga } from '../KayitListesi.tsx';
import { bugun } from '../kurallar.ts';
import type { FormKaydi } from '../tipler.ts';
import { kisileriHatirla, useKmKomutu, type KmVerisi } from '../veri.ts';
import type { KmYetkisi } from '../yetki.ts';
import { alanAnahtari, dslCoz, formEksikleri, formSonucu, sonucTonu, tabloSatirlari, type DslAlani, type DslBolumu, type FormIcerigi } from './dsl.ts';
import { FormKaydiBelgesi } from './FormBelgesi.tsx';

export interface DoldurulanSablon {
  kod: string;
  ad: string;
  rev: string;
  std: string;
  dsl: string;
  etiket: boolean;
  yurur?: string;
}

interface Ozellikler {
  veri: KmVerisi;
  yetki: KmYetkisi;
  sablon: DoldurulanSablon;
  // Düzenlenen kayıt; yeni kayıtta null. Kayıt kendi tasarım metnini taşır (doldurulduğu revizyon).
  rec: FormKaydi | null;
  kapat: () => void;
}

type Tablolar = Record<string, Record<string, string>[]>;

const metin = (v: unknown) => (typeof v === 'string' ? v : '');
const sozluk = (v: unknown): Record<string, string> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {});
const SONUC_TONU = { hata: 'kotu', tamam: 'iyi', uyari: 'uyari' } as const;

// Formdaki alanın anahtarı "f_b_a"; kayıtta `veri["b_a"]` (eski çerçeveyle aynı gövde).
const formAnahtari = (b: number, a: number) => `f_${alanAnahtari(b, a)}`;
const TURLER: Record<DslAlani['tur'], KmAlan['tur']> = { metin: 'metin', tarih: 'tarih', sayi: 'sayi', cokSatir: 'cokSatir', secim: 'secim', isaretler: 'isaretler' };

function alanlarOf(bolumler: readonly DslBolumu[]): KmAlan[] {
  return [
    { k: 'tarih', etiket: 'Tarih', tur: 'tarih', zorunlu: true, varsayilan: bugun },
    { k: 'dolduran', etiket: 'Dolduran', zorunlu: true },
    { k: 'bolum', etiket: 'Alan / bölüm', genis: 'yarim' },
    ...bolumler.flatMap((b, bi) => b.alanlar.map((a, ai): KmAlan => ({
      k: formAnahtari(bi, ai), etiket: a.etiket, tur: TURLER[a.tur], zorunlu: a.zorunlu,
      ...(a.secenekler ? { secenekler: a.tur === 'secim' ? a.secenekler.map((s) => [s, s || '—'] as const) : a.secenekler } : {}),
      ...(/parça no/i.test(a.etiket) ? { liste: 'parca' as const } : {}),
      ...(a.tur === 'cokSatir' || a.tur === 'isaretler' ? { genis: 'tam' as const } : a.etiket.length > 28 ? { genis: 'yarim' as const } : {}),
    }))),
  ];
}

// Form verisinden kayıt içeriği: alan değerleri `veri`ye, boş tablo satırları atılır.
function icerikOf(bolumler: readonly DslBolumu[], d: FormVerisi): FormIcerigi {
  const veri: Record<string, unknown> = {};
  bolumler.forEach((b, bi) => b.alanlar.forEach((_, ai) => { veri[alanAnahtari(bi, ai)] = d[formAnahtari(bi, ai)]; }));
  const tablo = Object.fromEntries(Object.entries((d.tablo as Tablolar | undefined) ?? {}).map(([k, v]) => [k, tabloSatirlari(v)]));
  return { veri, liste: { ...sozluk(d.liste) }, listeNot: { ...sozluk(d.listeNot) }, tablo };
}

function TabloDuzeni({ bolum, si, d, degistir }: { bolum: DslBolumu; si: number; d: FormVerisi; degistir: (alan: string, deger: unknown) => void }) {
  const tablolar = (d.tablo as Tablolar | undefined) ?? {};
  const satirlar = tablolar[String(si)] ?? [];
  const yaz = (f: (rows: Record<string, string>[]) => Record<string, string>[]) => degistir('tablo', { ...tablolar, [String(si)]: f(satirlar) });
  if (!bolum.tablo) return null;
  return (
    <div className="tc-km3-tablo">
      <div className="tc-km-tablo-kap">
        <table className="tc-km-tablo">
          <thead><tr>{bolum.tablo.sutunlar.map((s) => <th key={s} scope="col">{s}</th>)}<th><span className="tc-km3-gizli">Satır</span></th></tr></thead>
          <tbody>
            {satirlar.map((r, ri) => (
              <tr key={ri}>
                {bolum.tablo!.sutunlar.map((s, ci) => (
                  <td key={s}>
                    <input className="tc-alan-kutu" aria-label={s} value={r[`c${ci}`] ?? ''}
                      onChange={(o) => yaz((rows) => rows.map((x, j) => (j === ri ? { ...x, [`c${ci}`]: o.target.value } : x)))} />
                  </td>
                ))}
                <td><Dugme tur="tehlike" simge="trash" onClick={() => yaz((rows) => rows.filter((_, j) => j !== ri))}>Satırı sil</Dugme></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dugme simge="plus" onClick={() => yaz((rows) => [...rows, {}])}>Satır ekle</Dugme>
    </div>
  );
}

// Uygulamanın form doldurma penceresi (openFormFill + focusify): kayıt bilgileri, bölüm başına adım, kontrol maddeleri tek tek, kontrol ve kaydet.
// Taslak yalnız "Dolduran" ile kaydedilir; onaya göndermek için zorunlu alan, bütün maddeler ve "Hayır" yanıtlarının açıklaması gerekir.
export function FormDoldur({ veri, yetki, sablon, rec, kapat }: Ozellikler) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  const bolumler = useMemo(() => dslCoz(sablon.dsl), [sablon.dsl]);
  const alanlar = useMemo(() => alanlarOf(bolumler), [bolumler]);

  const ilk = useMemo((): FormVerisi => {
    const recVeri = (rec?.veri ?? {}) as Record<string, unknown>;
    const d: FormVerisi = {
      liste: { ...sozluk(rec?.liste) },
      listeNot: { ...sozluk(rec?.listeNot) },
      tablo: Object.fromEntries(bolumler.flatMap((b, si) => (b.tablo ? [[String(si), [...((rec?.tablo as Tablolar | undefined)?.[String(si)] ?? [{}, {}])]]] : []))),
    };
    if (rec) {
      Object.assign(d, { _id: rec._id, tarih: metin(rec.tarih), dolduran: metin(rec.dolduran), bolum: metin(rec.bolum) });
      bolumler.forEach((b, bi) => b.alanlar.forEach((_, ai) => { const v = recVeri[alanAnahtari(bi, ai)]; if (v !== undefined) d[formAnahtari(bi, ai)] = v; }));
    }
    return d;
  }, [rec, bolumler]);

  const adimlar: KmAdim[] = [
    { baslik: 'Kayıt bilgileri', alanlar: ['tarih', 'dolduran', 'bolum'], ipucu: 'Formu kimin, ne zaman ve hangi alanda doldurduğu. Adınız bir sonraki formda hatırlanır.' },
    ...bolumler.map((b, si): KmAdim => ({
      baslik: b.baslik || `Bölüm ${si + 1}`,
      alanlar: b.alanlar.map((_, ai) => formAnahtari(si, ai)),
      maddeler: b.liste.map((m, mi) => ({ k: alanAnahtari(si, mi), metin: m })),
      ...(b.tablo ? { icerik: (d: FormVerisi, degistir: (alan: string, deger: unknown) => void) => <TabloDuzeni bolum={b} si={si} d={d} degistir={degistir} /> } : {}),
    })),
  ];

  const kayit = (d: FormVerisi, durum: string): Partial<FormKaydi> => {
    const ic = icerikOf(bolumler, d);
    return {
      ...(rec ?? {}), kod: sablon.kod, ad: sablon.ad, rev: sablon.rev || '00', std: sablon.std, dsl: sablon.dsl, etiket: sablon.etiket,
      tarih: metin(d.tarih), dolduran: metin(d.dolduran), bolum: metin(d.bolum), veri: ic.veri, liste: ic.liste, listeNot: ic.listeNot, tablo: ic.tablo,
      sonuc: formSonucu(bolumler, ic.veri, ic.liste), durum,
    };
  };
  const maddeEksikleri = (d: FormVerisi) => formEksikleri(bolumler, d, icerikOf(bolumler, d)).filter((e) => e.alan === undefined);

  // Kural hatası sunucuya gitmeden bildirimle gösterilir; AdimliForm atılan hatada yalnız sunucu iletisini gösterir.
  const gonder = async (d: FormVerisi, durum: 'Taslak' | 'Onay bekliyor') => {
    await komut.kaydet('frm', kayit(d, durum));
    bildir('tamam', durum === 'Taslak' ? 'Taslak kaydedildi' : 'Kaydedildi ve onaya gönderildi');
    kapat();
  };
  const onayaGonder = async (d: FormVerisi) => {
    if (maddeEksikleri(d).length) { bildir('hata', 'Eksikleri tamamlayın ya da taslak olarak kaydedin.'); return; }
    await gonder(d, 'Onay bekliyor');
  };
  const taslakKaydet = async (d: FormVerisi) => {
    if (!metin(d.dolduran).trim()) { bildir('hata', 'Taslak için en az "Dolduran" girin.'); return; }
    await gonder(d, 'Taslak');
    kisileriHatirla(d);
  };

  return (
    <AdimliForm
      baslik={`${sablon.kod} ${sablon.ad}${rec ? ' (düzenleme)' : ''}`}
      alanlar={alanlar}
      ilk={ilk}
      adimlar={adimlar}
      kaydet={onayaGonder}
      kaydetMetni="Kaydet ve onaya gönder"
      pencere="tam"
      ikinciKaydet={{ etiket: 'Taslak kaydet', yap: taslakKaydet }}
      denetle={(d) => maddeEksikleri(d).map((e) => ({ metin: e.metin, adim: e.adim }))}
      sonuc={(d) => {
        const s = kayit(d, '').sonuc ?? '';
        return <p>Kaydın sonucu: <Damga ton={SONUC_TONU[sonucTonu(s)]}>{String(s)}</Damga></p>;
      }}
      onizleme={(d) => <FormKaydiBelgesi veri={veri} r={kayit(d, metin(rec?.durum) || 'Taslak')} yurur={sablon.yurur} />}
      kapat={kapat}
    />
  );
}
