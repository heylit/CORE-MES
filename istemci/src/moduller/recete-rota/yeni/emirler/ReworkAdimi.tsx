import { useState } from 'react';
import type { ParametreDegeri, ParametreDegerleri, SartnameParametresiSatiri } from '#paylasilan/sozlesme/rota.ts';
import { Dugme, Girdi, IsaretKutusu, Pencere, Secim, Simge } from '../../../../ortak/arayuz/index.ts';
import { sayiOku } from '../sartnameler/kurallar.ts';
import { useSartname, useSartnameler } from '../sartnameler/veri.ts';
import type { RrDurumu } from '../veri.ts';
import { guncelSurum, type useEmirKomutu } from './komut.ts';

// Hatalı parçanın rework adımı (1034): kalite "rework" dedikten sonra planlama kolun bekleyen rework adımını doldurur. Adım Üretim
// Emirleri'ne, şartnamesi Rota'ya gider; ikinci komut ilkinin döndürdüğü emir sürümüyle. Şablon, tekrar işleme kategorisinin (TKR)
// yürürlükteki şartnameleridir; "Diğer" şartnamesiz serbest addır. Kural, yetki ve sürüm denetimi uçlardadır.
const TEKRAR_KATEGORISI = 'TKR';
const DIGER = 'diger';

interface Ozellikler {
  acik: boolean;
  kapat: () => void;
  durum: RrDurumu;
  emir: { id: string; no: string; surum: number };
  isEmriId: number;
  komut: ReturnType<typeof useEmirKomutu>;
}

interface Form {
  sablon: string;
  ad: string;
  opId: string;
  kaynak: 'ic' | 'fason';
  makineId: string;
  firmaId: string;
  ayar: string;
  birim: string;
  termin: string;
  aciklama: string;
  degerler: Record<string, string | boolean | string[]>;
}
const bosForm = (): Form => ({ sablon: '', ad: '', opId: '', kaynak: 'ic', makineId: '', firmaId: '', ayar: '', birim: '', termin: '', aciklama: '', degerler: {} });

// Ekrandaki ham alan şartname değerine çevrilir; boş alan null (sıfır uydurulmaz), okunamayan sayı undefined (gönderilmez).
export function parametreDegeri(p: Pick<SartnameParametresiSatiri, 'tur'>, ham: string | boolean | string[] | undefined): ParametreDegeri | undefined {
  if (ham === undefined) return null;
  if (p.tur === 'evet') return typeof ham === 'boolean' ? ham : null;
  if (p.tur === 'coklu') return Array.isArray(ham) && ham.length ? ham : null;
  if (typeof ham !== 'string') return undefined;
  if (p.tur === 'sayi') return sayiOku(ham);
  if (p.tur === 'aralik') {
    const [a, u] = ham.split('|').map((x) => sayiOku(x));
    if (a === null && u === null) return null;
    return a === undefined || u === undefined || a === null || u === null ? undefined : [a, u];
  }
  return ham.trim() === '' ? null : ham.trim();
}

export function ReworkAdimi({ acik, kapat, durum: d, emir, isEmriId, komut }: Ozellikler) {
  const [f, setF] = useState<Form>(bosForm);
  const [hata, setHata] = useState<string | null>(null);
  // Adım yazıldı, şartname yazılamadıysa yeniden denemede yalnız şartname gider (adım ikinci kez yazılsa eski sürümle reddedilirdi).
  const [kayitli, setKayitli] = useState<{ surum: number | null } | null>(null);
  const liste = useSartnameler();
  const tkr = liste.data?.kategoriler.find((k) => k.kod === TEKRAR_KATEGORISI) ?? null;
  const sablonlar = (liste.data?.sartnameler ?? []).filter((s) => s.kategoriId === tkr?.id && s.aktif && s.yururlukteSurumNo !== null);
  const sartnameId = f.sablon === '' || f.sablon === DIGER ? null : Number(f.sablon);
  const sartname = useSartname(sartnameId);
  const surum = sartname.data?.sartname.surumler.find((s) => s.durum === 'yururlukte') ?? null;
  const alanlar = surum?.parametreler.filter((p) => p.adimdaDegisir) ?? [];
  const secili = sablonlar.find((s) => s.id === sartnameId) ?? null;
  const kapsamUyumsuz = secili !== null && secili.kapsam !== 'ikisi' && (secili.kapsam === 'fason') !== (f.kaynak === 'fason');
  const yaz = (k: Partial<Form>) => { setF((x) => ({ ...x, ...k })); };
  const degerYaz = (anahtar: string, v: string | boolean | string[]) => { setF((x) => ({ ...x, degerler: { ...x.degerler, [anahtar]: v } })); };
  const kapatVeSifirla = () => { setF(bosForm()); setHata(null); setKayitli(null); kapat(); };

  const gonder = async () => {
    const degerler: ParametreDegerleri = {};
    for (const p of alanlar) {
      const v = parametreDegeri(p, f.degerler[p.anahtar]);
      if (v === undefined) { setHata(`${p.ad}: sayı olarak girin.`); return; }
      degerler[p.anahtar] = v;
    }
    setHata(null);
    const kaynakId = f.kaynak === 'fason' ? f.firmaId : f.makineId;
    let yeni = kayitli?.surum ?? null;
    if (kayitli === null) {
      const adim = await komut.calistir('emir-rework-adimi', {
        id: emir.id, isEmriId, ad: f.ad, operasyonTipiId: f.opId, surum: emir.surum, aciklama: f.aciklama,
        kaynak: kaynakId === '' ? null : { tur: f.kaynak === 'fason' ? 'fason' : 'makine', id: kaynakId },
        ayarSuresiDk: f.ayar, birimSureDk: f.birim, terminGun: f.termin,
      }, sartnameId === null ? 'Rework adımı kaydedildi, plana gönderildi.' : undefined);
      if (!adim.tamam) return;
      yeni = guncelSurum(adim.durum, emir.id);
      setKayitli({ surum: yeni });
    }
    if (sartnameId !== null) {
      const s = await komut.calistir('emir-rework-sartname', { id: emir.id, isEmriId, surum: yeni, sartnameler: [{ sartnameId, degerler }] },
        'Rework adımı ve şartnamesi kaydedildi, plana gönderildi.');
      if (!s.tamam) return;
    }
    kapatVeSifirla();
  };

  const makineler = (d.machines ?? []).filter((m) => m.aktif).map((m) => ({ deger: m.id, baslik: `${m.code} ${m.name}` }));
  const firmalar = (d.fasonFirms ?? []).map((x) => ({ deger: x.id, baslik: x.code ? `${x.code} ${x.name}` : x.name }));
  const operasyonlar = (d.opdefs ?? []).filter((o) => o.aktif || o.id === f.opId).map((o) => ({ deger: o.id, baslik: `${o.abbr ?? o.code} ${o.name}` }));

  return (
    <Pencere
      acik={acik} kapat={kapatVeSifirla} baslik={`${emir.no} rework adımı`} tur="yan"
      alt={(
        <>
          <Dugme onClick={kapatVeSifirla} disabled={komut.mesgul}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" yukleniyor={komut.mesgul} onClick={() => { void gonder(); }}>Adımı kaydet, plana gönder</Dugme>
        </>
      )}
    >
      <div className="tc-rr3-bolme" role="group" aria-label="Rework adımı">
        <div className="tc-rr3-secici" role="group" aria-label="Rework şablonu">
          {sablonlar.map((s) => (
            <Dugme key={s.id} aria-pressed={f.sablon === String(s.id)} onClick={() => { yaz({ sablon: String(s.id), ad: s.ad, degerler: {} }); }}>
              {s.kod} {s.ad}
            </Dugme>
          ))}
          <Dugme aria-pressed={f.sablon === DIGER} onClick={() => { yaz({ sablon: DIGER, degerler: {} }); }}>Diğer</Dugme>
        </div>
        {liste.isSuccess && sablonlar.length === 0 && (
          <p className="tc-rr3-ipucu">Tekrar işleme kategorisinde yürürlükte şartname yok; adı elle yazın.</p>
        )}
        <div className="tc-rr3-satir">
          <Girdi etiket="Adımın adı" required value={f.ad} onChange={(o) => { yaz({ ad: o.target.value }); }} />
          <Secim etiket="Operasyon" required bosSecenek="Seçin" secenekler={operasyonlar} value={f.opId} onChange={(o) => { yaz({ opId: o.target.value }); }} />
        </div>
        <div className="tc-rr3-secici" role="group" aria-label="Nerede yapılır">
          <Dugme simge="building" aria-pressed={f.kaynak === 'ic'} onClick={() => { yaz({ kaynak: 'ic' }); }}>İç</Dugme>
          <Dugme simge="truck" aria-pressed={f.kaynak === 'fason'} onClick={() => { yaz({ kaynak: 'fason' }); }}>Fason</Dugme>
        </div>
        {f.kaynak === 'ic' ? (
          <div className="tc-rr3-satir">
            <Secim etiket="Makine" bosSecenek="Seçilmedi" secenekler={makineler} value={f.makineId} onChange={(o) => { yaz({ makineId: o.target.value }); }} />
            <Girdi etiket="Hazırlık dk" inputMode="decimal" value={f.ayar} onChange={(o) => { yaz({ ayar: o.target.value }); }} />
            <Girdi etiket="Birim dk" inputMode="decimal" value={f.birim} onChange={(o) => { yaz({ birim: o.target.value }); }} />
          </div>
        ) : (
          <div className="tc-rr3-satir">
            <Secim etiket="Firma" bosSecenek="Seçilmedi" secenekler={firmalar} value={f.firmaId} onChange={(o) => { yaz({ firmaId: o.target.value }); }} />
            <Girdi etiket="Termin gün" inputMode="numeric" ipucu="Boş bırakılırsa 7 gün." value={f.termin} onChange={(o) => { yaz({ termin: o.target.value }); }} />
          </div>
        )}
        {alanlar.length > 0 && (
          <div className="tc-rr3-ek" role="group" aria-label="Şartname değerleri">
            <h4>{secili ? `${secili.kod} değerleri` : 'Şartname değerleri'}</h4>
            <div className="tc-rr3-satir">
              {alanlar.map((p) => <ParametreAlani key={p.anahtar} p={p} deger={f.degerler[p.anahtar]} yaz={(v) => { degerYaz(p.anahtar, v); }} />)}
            </div>
          </div>
        )}
        <Girdi etiket="Açıklama" ipucu="Operatör terminalde görür." value={f.aciklama} onChange={(o) => { yaz({ aciklama: o.target.value }); }} />
        {kapsamUyumsuz && (
          <p className="tc-rr3-uyari" role="status"><Simge ad="alert" boyut="k" />Bu şartname {secili.kapsam === 'fason' ? 'yalnız fason' : 'yalnız iç'} adımda kullanılır.</p>
        )}
        {hata && <p className="tc-rr3-uyari" role="alert"><Simge ad="alert" boyut="k" />{hata}</p>}
        <p className="tc-rr3-ipucu">
          Kaynak seçilmezse adım atanmamış kalır ve plana girmez. Kol, bu adım ve tekrarı bitmeden ana partiye katılmaz; ana parti katılma
          adımında kolu bekler.
        </p>
      </div>
    </Pencere>
  );
}

function ParametreAlani({ p, deger, yaz }: { p: SartnameParametresiSatiri; deger: string | boolean | string[] | undefined; yaz: (v: string | boolean | string[]) => void }) {
  const etiket = p.birim ? `${p.ad} (${p.birim})` : p.ad;
  const ipucu = p.ipucu ?? undefined;
  if (p.tur === 'evet') return <IsaretKutusu etiket={etiket} checked={deger === true} onChange={(o) => { yaz(o.target.checked); }} />;
  if (p.tur === 'secim') {
    return (
      <Secim etiket={etiket} ipucu={ipucu} required={p.zorunlu} bosSecenek="Seçin" secenekler={(p.secenekler ?? []).map((s) => ({ deger: s, baslik: s }))}
        value={typeof deger === 'string' ? deger : ''} onChange={(o) => { yaz(o.target.value); }} />
    );
  }
  if (p.tur === 'coklu') {
    const l = Array.isArray(deger) ? deger : [];
    return (
      <div role="group" aria-label={etiket}>
        {(p.secenekler ?? []).map((s) => (
          <IsaretKutusu key={s} etiket={s} checked={l.includes(s)} onChange={(o) => { yaz(o.target.checked ? [...l, s] : l.filter((x) => x !== s)); }} />
        ))}
      </div>
    );
  }
  if (p.tur === 'aralik') {
    const [a = '', u = ''] = typeof deger === 'string' ? deger.split('|') : [];
    return (
      <>
        <Girdi etiket={`${etiket} en az`} inputMode="decimal" required={p.zorunlu} value={a} onChange={(o) => { yaz(`${o.target.value}|${u}`); }} />
        <Girdi etiket={`${etiket} en çok`} inputMode="decimal" required={p.zorunlu} value={u} onChange={(o) => { yaz(`${a}|${o.target.value}`); }} />
      </>
    );
  }
  return (
    <Girdi etiket={etiket} ipucu={ipucu} required={p.zorunlu} inputMode={p.tur === 'sayi' ? 'decimal' : undefined}
      value={typeof deger === 'string' ? deger : ''} onChange={(o) => { yaz(o.target.value); }} />
  );
}
