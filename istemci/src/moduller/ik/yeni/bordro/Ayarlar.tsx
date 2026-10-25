import { useRef, useState, type ReactNode } from 'react';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import {
  CokSatir, Dugme, Girdi, IsaretKutusu, OnayPenceresi, Pencere, Rozet, SayfaBasligi, Secim, Sekmeler, Simge, Tablo, useBildirim, type Sekme,
} from '../../../../ortak/arayuz/index.ts';
import { useSayfaKomutlari } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { para, paraKisa } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { ikSabitleri, type Donem, type IkMotoru } from '../motor.ts';
import type { Bordro } from '../tipler.ts';
import { useIkKomutu } from '../veri.ts';
import { HesapPenceresi, MotorBekleniyor, donemEtiketi } from './Hesaplayicilar.tsx';
import {
  AY_ADLARI, ayarlariBirlestir, dilimOzeti, donemBordroAyi, donemIceAktar, enErkenDonem, listeDegistir, listedenSil, listeyeEkle, sonrakiAyBasi,
  taslakDonemliMi, yeniDonem, type AyarTaslagi, type ListeSatiri,
} from './kurallar.ts';
import { bordroMotoru, type BordroMotoru } from './motor-yuzu.ts';
import { Aciklama, Bolum, Not, kisaTarihMetni, sayiMetni, uzunTarih } from './parcalar.tsx';
import './bordro.css';

type AyarSekmesi = 'genel' | 'ucret' | 'yanhak' | 'tesvik' | 'calisma' | 'aktarim' | 'ilan' | 'listeler' | 'veri';
const SEKMELER: readonly Sekme<AyarSekmesi>[] = [
  { anahtar: 'genel', baslik: 'Şirket ve takvim' }, { anahtar: 'ucret', baslik: 'Ücret, vergi ve SGK' }, { anahtar: 'yanhak', baslik: 'Yemek, yol ve prim' },
  { anahtar: 'tesvik', baslik: 'Teşvikler' }, { anahtar: 'calisma', baslik: 'Çalışma, izin ve ihbar' }, { anahtar: 'aktarim', baslik: 'Bordro aktarımı' },
  { anahtar: 'ilan', baslik: 'İlan ve kanallar' }, { anahtar: 'listeler', baslik: 'Listeler' }, { anahtar: 'veri', baslik: 'Veri yönetimi' },
];
// Dönem parametrelerini gösteren sekmeler: üstte dönem seçimi, kilitli dönemde alanlar yazılamaz.
const DONEMLI: readonly AyarSekmesi[] = ['ucret', 'yanhak', 'tesvik', 'calisma'];

function kimlikUret(on: string): string {
  return `${on}_${Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(36).padStart(2, '0')).join('')}`;
}

interface Alanlar {
  deger: (k: string) => unknown;
  yaz: (k: string, v: unknown) => void;
  pasif: boolean;
}
type Ciftler = readonly (readonly [string, string])[];

function SayiAlani({ a, k, etiket, ipucu, birim }: { a: Alanlar; k: string; etiket: string; ipucu?: string; birim?: string }) {
  const v = a.deger(k);
  return (
    <Girdi
      etiket={birim ? `${etiket} (${birim})` : etiket} type="number" step="any" inputMode="decimal" disabled={a.pasif} {...(ipucu ? { ipucu } : {})}
      value={v === undefined || v === null ? '' : String(v)} onChange={(o) => { a.yaz(k, o.target.value === '' ? '' : Number(o.target.value)); }}
    />
  );
}
function MetinAlani({ a, k, etiket, ipucu }: { a: Alanlar; k: string; etiket: string; ipucu?: string }) {
  const v = a.deger(k);
  return <Girdi etiket={etiket} disabled={a.pasif} {...(ipucu ? { ipucu } : {})} value={v === undefined || v === null ? '' : String(v)} onChange={(o) => { a.yaz(k, o.target.value); }} />;
}
function UzunAlan({ a, k, etiket, ipucu, satir = 6 }: { a: Alanlar; k: string; etiket: string; ipucu?: string; satir?: number }) {
  const v = a.deger(k);
  return <CokSatir etiket={etiket} rows={satir} disabled={a.pasif} {...(ipucu ? { ipucu } : {})} value={v === undefined || v === null ? '' : String(v)} onChange={(o) => { a.yaz(k, o.target.value); }} />;
}
function SecimAlani({ a, k, etiket, secenekler, ipucu }: { a: Alanlar; k: string; etiket: string; secenekler: Ciftler; ipucu?: string }) {
  return (
    <Secim
      etiket={etiket} disabled={a.pasif} {...(ipucu ? { ipucu } : {})} value={String(a.deger(k) ?? '')}
      secenekler={secenekler.map(([deger, baslik]) => ({ deger, baslik }))} onChange={(o) => { a.yaz(k, o.target.value); }}
    />
  );
}
function IsaretAlani({ a, k, etiket, ipucu, tersVarsayilan = false }: { a: Alanlar; k: string; etiket: string; ipucu?: string; tersVarsayilan?: boolean }) {
  const v = a.deger(k);
  // raporKesinti gibi alanlar boşken açıktır (motor yalnız false'u kapalı sayar).
  const acik = tersVarsayilan ? v !== false : Boolean(v);
  return (
    <div className="tc-ikb-isaret">
      <IsaretKutusu etiket={etiket} checked={acik} disabled={a.pasif} onChange={(o) => { a.yaz(k, o.target.checked); }} />
      {ipucu && <small className="tc-ikb-soluk">{ipucu}</small>}
    </div>
  );
}
const Turetilen = ({ etiket, deger, ipucu }: { etiket: string; deger: string; ipucu?: string }) => (
  <div className="tc-ikb-turetilen"><span>{etiket}</span><b>{deger}</b>{ipucu && <small className="tc-ikb-soluk">{ipucu}</small>}</div>
);

interface ListeSutunu { f: string; l: string; t?: 'secim' | 'isaret' | 'sayi'; o?: Ciftler; ph?: string }

function ListeDuzenleyici({ etiket, sutunlar, satirlar, ekleMetni, pasif, degistir, ekle, sil }: {
  etiket: string; sutunlar: readonly ListeSutunu[]; satirlar: readonly ListeSatiri[]; ekleMetni: string; pasif: boolean;
  degistir: (i: number, f: string, v: unknown) => void; ekle: () => void; sil: (i: number) => void;
}) {
  const hucre = (c: ListeSutunu, r: ListeSatiri, i: number): ReactNode => {
    const v = r[c.f];
    if (c.t === 'secim') {
      return (
        <select className="tc-ikb-girdi tc-ikb-girdi-metin" aria-label={c.l} disabled={pasif} value={String(v ?? '')} onChange={(o) => { degistir(i, c.f, o.target.value); }}>
          {(c.o ?? []).map(([d, b]) => <option key={d} value={d}>{b}</option>)}
        </select>
      );
    }
    if (c.t === 'isaret') return <input type="checkbox" aria-label={c.l} disabled={pasif} checked={Boolean(v)} onChange={(o) => { degistir(i, c.f, o.target.checked); }} />;
    return (
      <input
        className={c.t === 'sayi' ? 'tc-ikb-girdi' : 'tc-ikb-girdi tc-ikb-girdi-metin'} aria-label={c.l} disabled={pasif} placeholder={c.ph}
        type={c.t === 'sayi' ? 'number' : 'text'} {...(c.t === 'sayi' ? { step: 'any', inputMode: 'decimal' as const } : {})}
        value={v === undefined || v === null ? '' : String(v)}
        onChange={(o) => { degistir(i, c.f, c.t === 'sayi' ? (o.target.value === '' ? '' : Number(o.target.value)) : o.target.value); }}
      />
    );
  };
  return (
    <div className="tc-ikb-liste-duzen">
      <Tablo
        etiket={etiket} satirlar={satirlar.map((r, i) => ({ r, i }))} satirAnahtari={(x) => String(x.r['id'] ?? x.i)} bosMesaj="Kayıt yok."
        sutunlar={[
          ...sutunlar.map((c) => ({ anahtar: c.f, baslik: c.l, hucre: (x: { r: ListeSatiri; i: number }) => hucre(c, x.r, x.i) })),
          { anahtar: '_sil', baslik: '', hucre: (x: { r: ListeSatiri; i: number }) => (pasif ? '' : <Dugme simge="x" aria-label="Satırı sil" onClick={() => { sil(x.i); }} />) },
        ]}
      />
      {!pasif && <Dugme simge="plus" onClick={ekle}>{ekleMetni}</Dugme>}
    </div>
  );
}

function DonemSeridi({ m, d, yazabilir, sec, yeni, yonet, dene }: {
  m: BordroMotoru; d: Donem; yazabilir: boolean; sec: (id: string) => void; yeni: () => void; yonet: () => void; dene: () => void;
}) {
  const st = m.periodStatus(d);
  return (
    <div className="tc-ikb-donem" data-kilitli={st.lock ? '' : undefined}>
      <div className="tc-ikb-donem-satir">
        <Secim etiket="Parametre dönemi" value={d.id} secenekler={m.periods().map((p) => ({ deger: p.id, baslik: donemEtiketi(m, p) }))} onChange={(o) => { sec(o.target.value); }} />
        <Rozet ton={st.k === 'active' ? 'tamam' : st.k === 'future' ? 'bilgi' : 'pasif'}>{st.l}</Rozet>
        <span className="tc-ikb-bosluk" />
        {yazabilir && <Dugme simge="plus" onClick={yeni}>Yeni dönem</Dugme>}
        <Dugme simge="list" onClick={yonet}>Dönemleri yönet</Dugme>
        <Dugme simge="ruler" onClick={dene}>Bu dönemle hesap dene</Dugme>
      </div>
      {st.lock && <p className="tc-ikb-kilit"><Simge ad="lock" /><span>{st.lock}</span></p>}
      {d.not && <p className="tc-ikb-soluk">{d.not}</p>}
    </div>
  );
}

function YeniDonemPenceresi({ m, enErken, olustur, kapat, calisiyor, kaynak }: {
  m: BordroMotoru; enErken: string; kaynak: string; calisiyor: boolean; kapat: () => void;
  olustur: (g: { ad: string; baslangic: string; kaynak: string; not: string }) => void;
}) {
  const bugun = tesisGunu(Date.now());
  const ilk = sonrakiAyBasi(bugun) < enErken ? enErken : sonrakiAyBasi(bugun);
  const [g, gYaz] = useState({ ad: `${AY_ADLARI[Number(ilk.slice(5, 7)) - 1] ?? ''} ${ilk.slice(0, 4)} sonrası`, baslangic: ilk, kaynak, not: '' });
  return (
    <Pencere
      acik baslik="Yeni parametre dönemi" kapat={kapat}
      alt={(<><Dugme onClick={kapat} disabled={calisiyor}>Vazgeç</Dugme><Dugme tur="birincil" yukleniyor={calisiyor} onClick={() => { olustur(g); }}>Dönemi oluştur</Dugme></>)}
    >
      <div className="tc-ikb-alanlar">
        <Girdi etiket="Dönem adı" required value={g.ad} onChange={(o) => { gYaz({ ...g, ad: o.target.value }); }} />
        <Girdi etiket="Geçerlilik başlangıcı" type="date" min={enErken} value={g.baslangic} ipucu={`Ayın ilk günü olmalı. En erken ${uzunTarih(enErken)}.`} onChange={(o) => { gYaz({ ...g, baslangic: o.target.value }); }} />
        <Secim etiket="Değerleri kopyala" value={g.kaynak} secenekler={m.periods().map((p) => ({ deger: p.id, baslik: donemEtiketi(m, p) }))} ipucu="Yeni dönem bu dönemin değerleriyle başlar; sonra yalnızca değişenleri güncellersiniz." onChange={(o) => { gYaz({ ...g, kaynak: o.target.value }); }} />
        <Girdi etiket="Not" placeholder="Ör. Temmuz asgari ücret artışı, yeni kıdem tavanı" value={g.not} onChange={(o) => { gYaz({ ...g, not: o.target.value }); }} />
      </div>
      <Not>Değişiklikler yalnızca bu tarihten sonraki aylara uygulanır. Önceki dönemlerin parametreleri ve kesinleşmiş bordrolar olduğu gibi kalır.</Not>
    </Pencere>
  );
}

function DonemYonetimi({ m, bordrolar, yazabilir, calisiyor, kaydet, kapat, iceAktar }: {
  m: BordroMotoru; bordrolar: readonly Bordro[]; yazabilir: boolean; calisiyor: boolean; kapat: () => void;
  kaydet: (donemler: Donem[], ileti: string) => void; iceAktar: (dosya: File) => void;
}) {
  const donemler = m.periods();
  const [adlar, adYaz] = useState<Record<string, string>>({});
  const dosya = useRef<HTMLInputElement>(null);
  const disaAktar = () => {
    const blob = new Blob([JSON.stringify({ app: 'ik-modulu', tur: 'parametre-donemleri', surum: 1, donemler }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `parametre-donemleri-${tesisGunu(Date.now())}.json`;
    a.click();
    const birak = URL.revokeObjectURL.bind(URL);
    setTimeout(() => birak(a.href), 1000);
  };
  return (
    <Pencere
      acik tur="yan" baslik="Parametre dönemleri" kapat={kapat}
      alt={(<>
        {yazabilir && <Dugme simge="upload" onClick={() => { dosya.current?.click(); }}>Dönem içe aktar</Dugme>}
        <Dugme simge="download" onClick={disaAktar}>Dönemleri dışa aktar</Dugme>
        <Dugme onClick={kapat}>Kapat</Dugme>
        {yazabilir && <Dugme tur="birincil" yukleniyor={calisiyor} onClick={() => { kaydet(donemler.map((p) => ({ ...structuredClone(p), ad: adlar[p.id]?.trim() || p.ad })), 'Dönem adları kaydedildi.'); }}>Adları kaydet</Dugme>}
      </>)}
    >
      <Tablo
        etiket="Parametre dönemleri" satirlar={donemler} satirAnahtari={(p) => p.id}
        sutunlar={[
          { anahtar: 'ad', baslik: 'Dönem', hucre: (p) => <input className="tc-ikb-girdi tc-ikb-girdi-metin" aria-label="Dönem adı" disabled={!yazabilir} value={adlar[p.id] ?? p.ad} onChange={(o) => { adYaz({ ...adlar, [p.id]: o.target.value }); }} /> },
          { anahtar: 'bas', baslik: 'Başlangıç', hucre: (p) => kisaTarihMetni(p.baslangic) },
          { anahtar: 'bit', baslik: 'Bitiş', hucre: (p) => { const b = m.periodEnd(p); return b ? kisaTarihMetni(b) : '—'; } },
          { anahtar: 'durum', baslik: 'Durum', hucre: (p) => { const st = m.periodStatus(p); return <>{<Rozet ton={st.k === 'active' ? 'tamam' : st.k === 'future' ? 'bilgi' : 'pasif'}>{st.l}</Rozet>}{st.lock && <Simge ad="lock" />}</>; } },
          { anahtar: 'kesin', baslik: 'Kesin bordro', hizala: 'sag', hucre: (p) => { const n = donemBordroAyi(p, m.periodEnd(p), bordrolar); return n ? `${n} ay` : '—'; } },
          {
            anahtar: 'sil', baslik: '', hucre: (p) => {
              const st = m.periodStatus(p);
              const silinir = yazabilir && st.k === 'future' && !st.lock && donemler.length > 1;
              return silinir ? <Dugme tur="tehlike" simge="trash" onClick={() => { kaydet(donemler.filter((x) => x.id !== p.id).map((x) => structuredClone(x)), 'Dönem silindi.'); }}>Sil</Dugme> : '';
            },
          },
        ]}
      />
      <Not>Yalnızca henüz başlamamış ve kesinleşmiş bordrosu olmayan dönemler silinebilir. Dönem adlarını değiştirip “Adları kaydet”e basın.</Not>
      <Aciklama baslik="İnternete kapalı kurulumlar için">
        <p>Yeni yılın parametrelerini başka bir kurulumda hazırlayıp <b>Dönemleri dışa aktar</b> ile JSON dosyası alabilir, bu kurulumda <b>Dönem içe aktar</b> ile yükleyebilirsiniz. Geçmişe dönük veya aynı tarihte başlayan dönemler atlanır; mevcut dönemler değişmez.</p>
      </Aciklama>
      <input ref={dosya} type="file" accept=".json,application/json" hidden onChange={(o) => { const f = o.target.files?.[0]; o.target.value = ''; if (f) iceAktar(f); }} />
    </Pencere>
  );
}

export function Ayarlar(o: IkEkranOzellikleri) {
  if (o.motor === null) return <MotorBekleniyor />;
  return <AyarEkrani {...o} motor={o.motor} />;
}

function AyarEkrani({ depo, yetki, motor, kimlik, git }: IkEkranOzellikleri & { motor: IkMotoru }) {
  const m = bordroMotoru(motor);
  const sabit = ikSabitleri();
  const komut = useIkKomutu();
  const { bildir } = useBildirim();
  const bugun = tesisGunu(Date.now());
  const donemler = m.periods();
  const [sekme, sekmeYaz] = useState<AyarSekmesi>(kimlik && donemler.some((d) => d.id === kimlik) ? 'ucret' : 'genel');
  const [donemId, donemIdYaz] = useState<string>(kimlik ?? '');
  const [taslak, taslakYaz] = useState<AyarTaslagi>({});
  const [pencere, pencereYaz] = useState<null | 'yeni' | 'yonet' | 'hesap' | { soru: 'donem'; hedef: string } | { soru: 'yeni' }>(null);

  const sp = donemler.find((d) => d.id === donemId) ?? m.periodAt(bugun);
  const donemli = DONEMLI.includes(sekme);
  const kilit = donemli ? m.periodStatus(sp).lock : '';
  const yazabilir = yetki.ayarYaz;
  const pasif = !yazabilir || Boolean(kilit);
  const DONEM_ANAHTARLARI = sabit?.PERIOD_KEYS ?? [];
  const varsayilan = sabit?.DEFAULT_SETTINGS ?? {};
  const kayitli = (k: string): unknown => (DONEM_ANAHTARLARI.includes(k) ? m.settingsFor(sp)[k] : depo.ayarlar[k] ?? varsayilan[k]);
  const deger = (k: string): unknown => (Object.hasOwn(taslak, k) ? taslak[k] : kayitli(k));
  const a: Alanlar = { deger, yaz: (k, v) => { taslakYaz((t) => ({ ...t, [k]: v })); }, pasif };
  const kirli = Object.keys(taslak).length;
  const bordrolar = depo.tur('pay');
  const enErken = enErkenDonem(bugun, bordrolar);

  const ayarYaz = async (ayarlar: Record<string, unknown>, ileti: string): Promise<boolean> => {
    try { await komut.ayarKaydet(ayarlar); bildir('tamam', ileti); return true; } catch (h) { bildir('hata', hataIletisi(h, 'Ayarlar kaydedilemedi.')); return false; }
  };
  const kaydet = async () => {
    const donemDegisti = taslakDonemliMi(taslak, DONEM_ANAHTARLARI);
    if (donemDegisti && m.periodStatus(sp).lock) { bildir('hata', 'Bu parametre dönemi kilitli. Değişikliği ileri tarihli yeni bir dönemle yapın.'); return; }
    if (await ayarYaz(ayarlariBirlestir(depo.ayarlar, taslak, DONEM_ANAHTARLARI, donemler, sp.id), donemDegisti ? `Ayarlar kaydedildi: ${sp.ad} dönemi.` : 'Ayarlar kaydedildi.')) taslakYaz({});
  };
  const donemleriYaz = async (yeni: Donem[], ileti: string) => ayarYaz({ ...depo.ayarlar, donemler: yeni }, ileti);
  const donemSec = (id: string) => { if (kirli) pencereYaz({ soru: 'donem', hedef: id }); else donemIdYaz(id); };
  const yeniAc = () => { if (kirli) pencereYaz({ soru: 'yeni' }); else pencereYaz('yeni'); };
  const olustur = async (g: { ad: string; baslangic: string; kaynak: string; not: string }) => {
    const s = yeniDonem(donemler, g, enErken, kimlikUret('d'));
    if (!s.tamam) { bildir('hata', s.hata); return; }
    if (await donemleriYaz(s.donemler, `${s.donem.ad} oluşturuldu. ${uzunTarih(s.donem.baslangic)} ve sonrası bu değerlerle hesaplanır.${s.ayBasinaCekildi ? ' Başlangıç ayın ilk gününe çekildi.' : ''}`)) {
      pencereYaz(null); donemIdYaz(s.donem.id); taslakYaz({});
      if (!DONEMLI.includes(sekme)) sekmeYaz('ucret');
    }
  };
  const iceAktar = async (f: File) => {
    let veri: unknown;
    try { veri = JSON.parse(await f.text()); } catch { bildir('hata', 'Dosya okunamadı; geçerli bir JSON dosyası seçin.'); return; }
    const s = donemIceAktar(veri, donemler, enErken, (p) => m.pickParams(p), () => kimlikUret('d'));
    if (!s) { bildir('hata', 'Dosyada parametre dönemi bulunamadı.'); return; }
    if (s.eklenen.length && !(await donemleriYaz(s.donemler, `${s.eklenen.length} dönem eklendi.`))) return;
    if (s.atlanan.length) bildir(s.eklenen.length ? 'bilgi' : 'hata', `${s.eklenen.length} dönem eklendi; ${s.atlanan.length} atlandı (${s.atlanan.slice(0, 3).join(', ')}${s.atlanan.length > 3 ? '…' : ''}).`);
  };

  const liste = (k: string): ListeSatiri[] => (Array.isArray(deger(k)) ? (deger(k) as ListeSatiri[]) : []);
  const listeAlani = (k: string, etiket: string, sutunlar: readonly ListeSutunu[], ekleMetni: string, yeni: () => ListeSatiri) => (
    <ListeDuzenleyici
      etiket={etiket} sutunlar={sutunlar} satirlar={liste(k)} ekleMetni={ekleMetni} pasif={!yazabilir || (Boolean(kilit) && DONEM_ANAHTARLARI.includes(k))}
      degistir={(i, f, v) => { a.yaz(k, listeDegistir(liste(k), i, f, v)); }}
      ekle={() => { a.yaz(k, listeyeEkle(liste(k), yeni())); }}
      sil={(i) => {
        const satir = liste(k)[i];
        a.yaz(k, listedenSil(liste(k), i));
        if (k === 'tesvikler' && satir && deger('varsayilanTesvik') === satir['id']) a.yaz('varsayilanTesvik', liste(k).filter((_, j) => j !== i)[0]?.['id'] ?? '');
      }}
    />
  );

  const govde = (): ReactNode => {
    if (sekme === 'genel') return (<>
      <Bolum baslik="Şirket">
        <div className="tc-ikb-alanlar">
          <MetinAlani a={a} k="sirket" etiket="Şirket adı" />
          <IsaretAlani a={a} k="cumartesiIsGunu" etiket="Cumartesi iş günü sayılsın" ipucu="Yıllık izin gün sayımını etkiler." />
        </div>
      </Bolum>
      <Bolum baslik="Resmî tatiller">
        <div className="tc-ikb-iki">
          <UzunAlan a={a} k="tatiller" etiket="Tatil listesi" satir={14} ipucu="Her satıra bir tarih. Her yıl tekrar eden ulusal bayramlar için AA-GG, dinî bayramlar gibi yıla göre değişenler için YYYY-AA-GG yazın; tarihten sonra açıklama ekleyebilirsiniz." />
          <Aciklama baslik="Tatiller neyi etkiler?" dayanak="Dayanak: 2429 sayılı Ulusal Bayram ve Genel Tatiller Hakkında Kanun; 4857 sayılı İş Kanunu md. 44, 47.">
            <p>Yıllık ve mazeret izinleri iş günü olarak sayılırken buradaki tarihler düşülür. İzin takviminde bu günler gri gösterilir.</p>
            <p>Ulusal bayram ve genel tatiller (29 Ekim, 23 Nisan, 1 Mayıs, 19 Mayıs, 15 Temmuz, 30 Ağustos, 1 Ocak, Ramazan ve Kurban bayramları) 2429 sayılı Kanun’la belirlenir. Bu günlerde çalışan işçiye ayrıca bir günlük ücret ödenir.</p>
            <p>Dinî bayram tarihleri her yıl değişir; yeni yılın tarihlerini Diyanet takviminden ekleyin. Arife günleri yarım gündür, yarım günleri listeye eklemeyin.</p>
          </Aciklama>
        </div>
      </Bolum>
    </>);
    if (sekme === 'ucret') {
      const am = m.calcMonth({ brut: m.P('asgariBrut') }, 0, 1);
      const dilim = dilimOzeti(m.brackets());
      return (<>
        <Bolum baslik="Asgari ücret">
          <div className="tc-ikb-iki">
            <div className="tc-ikb-alanlar">
              <SayiAlani a={a} k="asgariBrut" etiket="Brüt asgari ücret" birim="₺/ay" ipucu="Asgari Ücret Tespit Komisyonu kararıyla belirlenir." />
              <Turetilen etiket="Hesaplanan net asgari ücret" deger={para(am.net)} ipucu="Kayıtlı parametrelerle Ocak ayı için." />
              <Turetilen etiket="Asgari ücretin işverene maliyeti" deger={para(am.maliyet)} ipucu="SGK ve işsizlik işveren payları dahil." />
            </div>
            <Aciklama baslik="Asgari ücret istisnası" dayanak="Dayanak: 4857 sayılı İş Kanunu md. 39; GVK md. 23/18; Damga Vergisi Kanunu’na ekli (2) sayılı tablo.">
              <p>Asgari ücrete isabet eden gelir vergisi ve damga vergisi, ücreti ne olursa olsun tüm çalışanlar için istisnadır. Asgari ücretli çalışanın brüt ücretinden yalnızca SGK ve işsizlik sigortası işçi payları kesilir.</p>
              <p>Asgari ücret ayrıca SGK prim tabanı, prim tavanı ve bazı yardımların hesabında esas alınır.</p>
            </Aciklama>
          </div>
        </Bolum>
        <Bolum baslik="SGK ve işsizlik sigortası">
          <div className="tc-ikb-iki">
            <div className="tc-ikb-alanlar">
              <SayiAlani a={a} k="sgkTavan" etiket="SGK prim tavanı" birim="₺/ay" ipucu="Prime esas kazancın üst sınırı; aşan kısımdan prim kesilmez." />
              <SayiAlani a={a} k="sgkIsciOran" etiket="SGK işçi payı" birim="%" ipucu="%9 malullük, yaşlılık ve ölüm + %5 genel sağlık sigortası." />
              <SayiAlani a={a} k="issizlikIsciOran" etiket="İşsizlik sigortası işçi payı" birim="%" />
              <SayiAlani a={a} k="sgkIsverenOran" etiket="SGK işveren payı (teşviksiz)" birim="%" ipucu="Malullük, yaşlılık ve ölüm, genel sağlık ve kısa vadeli sigorta kollarının toplamı." />
              <Turetilen etiket="Varsayılan teşvik" deger={m.tesvikById(deger('varsayilanTesvik'))?.ad || 'Teşvik yok'} ipucu="Teşvikleri Ayarlar > Teşvikler bölümünden yönetin; kişiye özel teşvik personel kartından seçilir." />
              <SayiAlani a={a} k="issizlikIsverenOran" etiket="İşsizlik sigortası işveren payı" birim="%" />
            </div>
            <Aciklama baslik="Primler nasıl hesaplanır?" dayanak="Dayanak: 5510 sayılı Kanun md. 80–82; 4447 sayılı Kanun md. 49.">
              <p>Primler, brüt ücret ve prime tabi ödemelerin toplamı (prime esas kazanç) üzerinden hesaplanır. Prime esas kazanç asgari ücretten az, prim tavanından fazla olamaz.</p>
              <p>İşçi payları ücretten kesilir; işveren payları ücrete ek maliyettir. Kısa vadeli sigorta kolu oranı işyerinin tehlike sınıfına göre değişebilir.</p>
              <p>Borcu olmayan işverenler, 5510 sayılı Kanun md. 81/ı kapsamında işveren hissesinden puan indirimi alabilir. Hangi teşvikten yararlandığınızı ve güncel puanı mali müşavirinizle doğrulayın.</p>
              <p>Kıdem ve ihbar tazminatından prim kesilmez; kullanılmayan izin ücreti, prim, ikramiye ve fazla mesai prime tabidir.</p>
            </Aciklama>
          </div>
        </Bolum>
        <Bolum baslik="Diğer kesinti ve indirimler">
          <div className="tc-ikb-iki">
            <div className="tc-ikb-alanlar">
              <SayiAlani a={a} k="besOran" etiket="Otomatik BES katkı oranı" birim="%" ipucu="Prime esas kazanç üzerinden; personel kartında BES işaretli olanlara uygulanır." />
              <IsaretAlani a={a} k="raporKesinti" tersVarsayilan etiket="Rapor günleri bordroda eksik gün sayılsın" ipucu="İşveren rapor günlerinin ücretini ödüyorsa işareti kaldırın." />
              <SayiAlani a={a} k="engelliInd1" etiket="Engellilik indirimi, 1. derece" birim="₺" ipucu="Aylık tutar; Gelir İdaresi’nin yıllık ilan ettiği tutarı girin." />
              <SayiAlani a={a} k="engelliInd2" etiket="Engellilik indirimi, 2. derece" birim="₺" />
              <SayiAlani a={a} k="engelliInd3" etiket="Engellilik indirimi, 3. derece" birim="₺" />
            </div>
            <Aciklama baslik="Bu kalemler nasıl uygulanır?" dayanak="Dayanak: 4632 sayılı Kanun ek md. 2; 5510 sayılı Kanun md. 18; GVK md. 31.">
              <p><b>Otomatik katılım BES:</b> 45 yaşını doldurmamış çalışanlar işverence bireysel emeklilik sistemine dahil edilir; prime esas kazancın %3’ü ücretten kesilip şirkete aktarılır. Çalışan iki ay içinde cayabilir. Yeni personelde doğum tarihine göre işaret otomatik konur.</p>
              <p><b>Raporlu günler:</b> Hastalık raporunun üçüncü gününden itibaren SGK geçici iş göremezlik ödeneği öder; işveren bu günler için ücret ödemekle yükümlü değildir ve bu günler eksik gün olarak bildirilir. Bordro sayfasında prim günü bu ayara göre otomatik hesaplanır.</p>
              <p><b>Engellilik indirimi:</b> Engellilik derecesini belgeleyen çalışanın gelir vergisi matrahından her ay sabit bir tutar indirilir. Tutarlar her yıl yeniden belirlenir; girilmemişse indirim uygulanmaz.</p>
            </Aciklama>
          </div>
        </Bolum>
        <Bolum baslik="Gelir vergisi ve damga vergisi">
          <div className="tc-ikb-iki">
            <div className="tc-ikb-alanlar">
              <UzunAlan a={a} k="dilimler" etiket="Ücret gelirleri için gelir vergisi dilimleri" ipucu="Her satırda “üst sınır:oran”. Son dilimin üst sınırını boş bırakın (ör. “:40”)." />
              <SayiAlani a={a} k="damgaOran" etiket="Damga vergisi oranı" birim="%" ipucu="Ücret ödemelerinde binde 7,59." />
              <div className="tc-ikb-kaydir">
                <table className="tc-ikb-tablo" aria-label="Kayıtlı tarifenin özeti">
                  <thead><tr><th scope="col">Yıllık kümülatif matrah</th><th scope="col">Oran</th><th scope="col">Dilim sonuna kadar toplam vergi</th></tr></thead>
                  <tbody>{dilim.map((d, i) => <tr key={i}><th scope="row">{d.ust === null ? `${paraKisa(d.alt)} üzeri` : `${paraKisa(d.alt)} – ${paraKisa(d.ust)}`}</th><td>%{sayiMetni(d.oran)}</td><td>{d.birikmis === null ? '—' : paraKisa(d.birikmis)}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
            <Aciklama baslik="Gelir vergisi nasıl hesaplanır?" dayanak="Dayanak: 193 sayılı Gelir Vergisi Kanunu md. 61, 63, 94, 103; 488 sayılı Damga Vergisi Kanunu.">
              <p>Gelir vergisi matrahı, brüt ücretten SGK ve işsizlik işçi paylarının düşülmesiyle bulunur. Ücretlerde vergi, yılbaşından itibaren biriken (kümülatif) matraha artan oranlı tarife uygulanarak hesaplanır: bu ayın vergisi = kümülatif matrahın vergisi − önceki ayların kümülatif matrahının vergisi.</p>
              <p>Kümülatif matrah bir dilim sınırını geçtiğinde, sınırı aşan kısım bir üst oranla vergilendirilir. Bu nedenle net ücret genellikle yılın ikinci yarısında düşer.</p>
              <p>Asgari ücretin vergisi kadar tutar her ay istisna olarak düşülür. Damga vergisi brüt ücretin binde 7,59’udur; asgari ücrete isabet eden kısım istisnadır.</p>
              <p>Tarife her yıl yeniden değerleme oranına göre güncellenir; Ocak ayında Gelir İdaresi’nin yayımladığı tebliğden kontrol edin.</p>
            </Aciklama>
          </div>
        </Bolum>
      </>);
    }
    if (sekme === 'yanhak') return (<>
      <Bolum baslik="Yemek yardımı">
        <div className="tc-ikb-iki">
          <div className="tc-ikb-alanlar">
            <SecimAlani a={a} k="yemekYontem" etiket="Varsayılan yöntem" secenekler={(sabit?.YEMEK_YONTEM ?? []).map((x) => [x, x] as const)} ipucu="Personel kartında kişiye özel yöntem seçilebilir." />
            <SecimAlani a={a} k="yemekHesap" etiket="Hesap şekli" secenekler={(sabit?.HESAP_OPTS ?? []).map((x) => [x, x] as const)} />
            <SayiAlani a={a} k="yemekDeger" etiket="Tutar veya oran" ipucu="Günlük veya aylık ₺, ya da brüt ücretin yüzdesi." />
            <SayiAlani a={a} k="yemekGvKart" etiket="GV istisnası, kart / çek" birim="₺/gün" ipucu="Fiili çalışılan gün başına, KDV dahil." />
            <SayiAlani a={a} k="yemekGvNakit" etiket="GV istisnası, nakit" birim="₺/gün" ipucu="Fiili çalışılan gün başına." />
            <SecimAlani a={a} k="yemekSgkKart" etiket="SGK istisnası, kart / çek" secenekler={[['tamami', 'Tamamı (kart yalnız yemek hizmetinde geçerliyse)'], ['limit', 'Günlük limit kadar']]} />
            <SayiAlani a={a} k="yemekSgkLimit" etiket="SGK istisna limiti, kart / çek" birim="₺/gün" ipucu="Kart market alışverişine açıksa uygulanır." />
            <SayiAlani a={a} k="yemekSgkNakit" etiket="SGK istisna limiti, nakit" birim="₺/gün" />
          </div>
          <Aciklama baslik="Yemek yardımı nasıl vergilendirilir?" dayanak="Dayanak: GVK md. 23/8; 5510 sayılı Kanun md. 80. Tutarları her yıl Ocak’ta ve yıl içi değişikliklerde güncelleyin.">
            <p>İşyerinde yemek verilmesi (ayni) gelir vergisi, damga vergisi ve SGK priminden tamamen istisnadır ve bordroya girmez.</p>
            <p>Yemek kartı, çeki veya nakit yemek bedelinde istisna, <b>fiilen çalışılan her gün</b> için günlük tutara kadar uygulanır. İzin, rapor ve hafta tatili günlerinde istisna yoktur. Limiti aşan kısım ücrete eklenir ve tüm kesintilere tabidir.</p>
            <p>2026 için gelir vergisi istisnası günlük 300 TL’dir (KDV hariç); kart ödemelerinde KDV dahil 330 TL dikkate alınır. SGK tarafında yalnız yemek hizmetinde geçerli kartlar tutardan bağımsız istisnadır; nakit ve markete açık kartlarda günlük sınır uygulanır.</p>
            <p>Modül, hesap şekli “günlük tutar” ise ay içindeki fiili çalışma gününü izin kayıtlarından otomatik bulur.</p>
          </Aciklama>
        </div>
      </Bolum>
      <Bolum baslik="Yol yardımı">
        <div className="tc-ikb-iki">
          <div className="tc-ikb-alanlar">
            <SecimAlani a={a} k="yolYontem" etiket="Varsayılan yöntem" secenekler={(sabit?.YOL_YONTEM ?? []).map((x) => [x, x] as const)} ipucu="Personel kartında kişiye özel yöntem seçilebilir." />
            <SecimAlani a={a} k="yolHesap" etiket="Hesap şekli" secenekler={(sabit?.HESAP_OPTS ?? []).map((x) => [x, x] as const)} />
            <SayiAlani a={a} k="yolDeger" etiket="Tutar veya oran" ipucu="Günlük veya aylık ₺, ya da brüt ücretin yüzdesi." />
            <SayiAlani a={a} k="yolGvKart" etiket="GV istisnası, toplu taşıma kartı / bilet" birim="₺/gün" ipucu="Fiili çalışılan gün başına." />
            <SecimAlani a={a} k="yolSgkKart" etiket="SGK, toplu taşıma kartı / bilet" secenekler={[['tabi', 'Prime tabi'], ['limit', 'Günlük GV limiti kadar istisna'], ['tamami', 'Tamamı istisna']]} />
          </div>
          <Aciklama baslik="Yol yardımı nasıl vergilendirilir?" dayanak="Dayanak: GVK md. 23/8; 5510 sayılı Kanun md. 80.">
            <p><b>Servis:</b> İşverenin sağladığı veya satın aldığı servis hizmeti tamamen istisnadır; bordroya girmez.</p>
            <p><b>Toplu taşıma kartı veya bilet:</b> İşveren servis sağlamıyorsa, fiilen çalışılan her gün için günlük tutara kadar gelir ve damga vergisinden istisnadır (2026 için günlük 158 TL). Aşan kısım ücret sayılır.</p>
            <p><b>Nakit yol parası:</b> İstisna yoktur; tamamı ücret gibi vergilendirilir ve prime tabidir.</p>
            <p>SGK açısından servis dışındaki yol yardımlarının prime tabi olduğu görüşü yaygındır; farklı yorumlar bulunduğu için varsayılan “prime tabi” seçildi. Uygulamanızı mali müşavirinizle doğrulayın.</p>
          </Aciklama>
        </div>
      </Bolum>
      <Bolum baslik="Prim ve ikramiye düzeni">
        {listeAlani('primler', 'Prim ve ikramiye düzeni', [
          { f: 'ad', l: 'Prim adı' }, { f: 'tur', l: 'Tür', t: 'secim', o: sabit?.PRIM_TUR ?? [] }, { f: 'deger', l: 'Değer', t: 'sayi' },
          { f: 'siklik', l: 'Ödeme sıklığı', t: 'secim', o: sabit?.SIKLIK ?? [] }, { f: 'aylar', l: 'Aylar', ph: 'ör. 6 veya 3,9' },
          { f: 'atama', l: 'Varsayılan', t: 'secim', o: sabit?.ATAMA ?? [] }, { f: 'kidem', l: 'Kıdeme dahil', t: 'isaret' },
        ], 'Prim ekle', () => ({ id: kimlikUret('p'), ad: 'Yeni prim', tur: 'sabit', deger: 0, siklik: 'her', aylar: '', atama: 'yok', kidem: false }))}
        <Aciklama baslik="Primler nasıl işler?" dayanak="Dayanak: 4857 sayılı İş Kanunu md. 32; 1475 sayılı İş Kanunu md. 14/13.">
          <p>Her prim; sabit tutar, brüt ücretin yüzdesi veya brüt ücretin katı (ör. 1 maaş ikramiye) olarak tanımlanır. Ödeme ayında bordrodaki “Ek ödeme” sütununa otomatik eklenir; tutarı bordroda değiştirebilirsiniz. “Aylar” sütunu “Yılda bir” için ödeme ayını, “Belirli aylar” için virgülle ayrılmış ayları alır.</p>
          <p>“Varsayılan” sütunu primin kime otomatik verileceğini belirler. Personel kartının Ücret bölümünden kişiye özel açıp kapatabilir, değerini değiştirebilirsiniz.</p>
          <p>Prim ve ikramiyeler SGK primine, gelir ve damga vergisine tabidir. Düzenli ödenen prim ve ikramiyeler kıdem ve ihbar tazminatına esas giydirilmiş ücrete aylık karşılığıyla eklenir (ör. yılda 2 maaş ikramiye, aylık 2/12 maaş).</p>
        </Aciklama>
      </Bolum>
    </>);
    if (sekme === 'tesvik') return (
      <Bolum baslik="SGK teşvikleri">
        <div className="tc-ikb-alanlar">
          <SecimAlani a={a} k="varsayilanTesvik" etiket="Varsayılan teşvik" secenekler={liste('tesvikler').map((t) => [String(t['id'] ?? ''), String(t['ad'] ?? '')] as const)} ipucu="Kişiye özel teşvik seçilmemiş tüm çalışanlara uygulanır." />
        </div>
        {listeAlani('tesvikler', 'SGK teşvikleri', [
          { f: 'ad', l: 'Teşvik adı' }, { f: 'tur', l: 'Hesap türü', t: 'secim', o: sabit?.TESVIK_TUR ?? [] }, { f: 'deger', l: 'Puan / tutar', t: 'sayi' },
          { f: 'kanunNo', l: 'Kanun no', ph: 'ör. 05510' },
        ], 'Teşvik ekle', () => ({ id: kimlikUret('t'), ad: 'Yeni teşvik', tur: 'puan', deger: 0, kanunNo: '' }))}
        <div className="tc-ikb-iki">
          <Aciklama baslik="Hesap türleri" dayanak="Teşvikler genellikle aynı çalışan için birlikte uygulanmaz; her çalışana en avantajlı tek teşvik seçilir.">
            <p><b>İşveren payından puan indirimi:</b> İşveren SGK payı, prime esas kazancın girilen puan kadar düşürülmüş oranıyla hesaplanır (ör. 5510 md. 81/ı hazine desteği).</p>
            <p><b>Asgari ücret üzerinden işveren payının tamamı:</b> İşveren SGK payının, prime esas kazanç alt sınırına (asgari ücret, gün orantılı) isabet eden kısmı hazinece karşılanır. 6111, ilave istihdam ve engelli istihdamı teşvikleri bu şekilde hesaplanır.</p>
            <p><b>Aylık sabit tutar:</b> İşveren payından her ay sabit bir tutar düşülür (ör. asgari ücret desteği).</p>
          </Aciklama>
          <Aciklama baslik="Sık kullanılan teşvikler" dayanak="Teşvik şartları sık değişir; her teşviki uygulamadan önce SGK teşvik sorgulama ekranından ve mali müşavirinizle doğrulayın.">
            <p><b>5510 md. 81/ı:</b> Prim borcu bulunmayan özel sektör işverenlerine işveren hissesinden puan indirimi. Uygulanan puan sektöre ve döneme göre değişebilir.</p>
            <p><b>4447 geçici md. 10 (6111):</b> Kadın, 18–29 yaş arası genç ve mesleki belgesi olan işsizlerin ilave istihdamında işveren hissesinin karşılanması.</p>
            <p><b>4857 md. 30 / 5510 md. 81/c:</b> Engelli çalışanların asgari ücret üzerinden işveren hissesinin tamamı hazineden karşılanır.</p>
            <p>Kanun numaraları SGK’ya bildirimde (MUHSGK) kullanılır ve hazırlık listesine aktarılır.</p>
          </Aciklama>
        </div>
      </Bolum>
    );
    if (sekme === 'calisma') return (<>
      <Bolum baslik="Çalışma süreleri ve fazla mesai">
        <div className="tc-ikb-iki">
          <div className="tc-ikb-alanlar">
            <SayiAlani a={a} k="haftalikSaat" etiket="Haftalık çalışma süresi" birim="saat" ipucu="Kanuni üst sınır 45 saat." />
            <SayiAlani a={a} k="aylikSaat" etiket="Aylık ücrete esas saat" birim="saat" ipucu="Saatlik ücret = aylık brüt / bu değer. 30 gün × 7,5 saat = 225." />
            <SayiAlani a={a} k="mesaiCarpan" etiket="Fazla çalışma katsayısı" ipucu="45 saati aşan her saat %50 zamlı: 1,5." />
            <SayiAlani a={a} k="fazlaSurelerCarpan" etiket="Fazla sürelerle çalışma katsayısı" ipucu="Sözleşmede 45 saatten az belirlenen sürenin 45 saate kadar aşılması: 1,25." />
            <SayiAlani a={a} k="haftaTatiliCarpan" etiket="Hafta tatili çalışması katsayısı" ipucu="Uygulamada %50 zamlı: 1,5." />
            <SayiAlani a={a} k="ubgtCarpan" etiket="Resmî tatil çalışması ek gün" ipucu="Çalışılan her gün için ayrıca ödenen günlük ücret: 1." />
            <SayiAlani a={a} k="yillikMesaiLimit" etiket="Yıllık fazla çalışma sınırı" birim="saat" ipucu="Kanuni üst sınır 270 saat." />
          </div>
          <Aciklama baslik="Çalışma süresi kuralları" dayanak="Dayanak: 4857 sayılı İş Kanunu md. 41, 46, 47, 63, 69.">
            <p>Haftalık çalışma süresi en çok 45 saattir; günlük çalışma 11 saati, gece çalışması 7,5 saati aşamaz. Haftalık 45 saati aşan çalışmalar fazla çalışmadır ve yılda 270 saati geçemez. Fazla çalışma için işçinin yazılı onayı gerekir.</p>
            <p>Fazla çalışmanın her saati için ücret %50 artırılarak ödenir. İşçi isterse bunun yerine her saat için 1,5 saat serbest zaman kullanabilir.</p>
            <p>Ulusal bayram ve genel tatilde çalışan işçiye o günün ücretine ek olarak bir günlük ücret daha ödenir.</p>
          </Aciklama>
        </div>
      </Bolum>
      <Bolum baslik="Yıllık ücretli izin">
        <div className="tc-ikb-iki">
          <div className="tc-ikb-alanlar">
            <SayiAlani a={a} k="izin1" etiket="1–5 yıl (5 dahil)" birim="gün" />
            <SayiAlani a={a} k="izin2" etiket="5 yıldan fazla, 15 yıldan az" birim="gün" />
            <SayiAlani a={a} k="izin3" etiket="15 yıl ve üzeri" birim="gün" />
            <SayiAlani a={a} k="izinYasMin" etiket="18 yaş ve altı, 50 yaş ve üstü için en az" birim="gün" />
            <SayiAlani a={a} k="denemeAy" etiket="Varsayılan deneme süresi" birim="ay" ipucu="Kanuni üst sınır 2 ay; toplu sözleşmeyle 4 aya kadar." />
          </div>
          <Aciklama baslik="Yıllık izin kuralları" dayanak="Dayanak: 4857 sayılı İş Kanunu md. 15, 53–59.">
            <p>İşçi, deneme süresi dahil en az 1 yıl çalıştıktan sonra yıllık ücretli izne hak kazanır. Kanundaki süreler en azdır; sözleşmeyle artırılabilir, azaltılamaz. Yıllık izin, işçinin isteği olmadan bölünemez; bölünürse bir parçası 10 günden az olamaz.</p>
            <p>İzin süresine rastlayan ulusal bayram, hafta tatili ve genel tatil günleri izin süresinden sayılmaz. İş sözleşmesi sona erdiğinde kullanılmayan izinlerin ücreti son ücret üzerinden ödenir.</p>
            <p>Deneme süresi içinde taraflar sözleşmeyi bildirim süresi olmadan ve tazminatsız feshedebilir.</p>
          </Aciklama>
        </div>
      </Bolum>
      <Bolum baslik="İhbar (bildirim) süreleri ve kıdem">
        <div className="tc-ikb-iki">
          <div className="tc-ikb-alanlar">
            <SayiAlani a={a} k="ihbar1" etiket="Hizmeti 6 aydan az" birim="hafta" />
            <SayiAlani a={a} k="ihbar2" etiket="6 ay – 1,5 yıl" birim="hafta" />
            <SayiAlani a={a} k="ihbar3" etiket="1,5 yıl – 3 yıl" birim="hafta" />
            <SayiAlani a={a} k="ihbar4" etiket="3 yıldan fazla" birim="hafta" />
            <SayiAlani a={a} k="kidemTavan" etiket="Kıdem tazminatı tavanı" birim="₺" ipucu="Ocak ve Temmuz aylarında güncellenir." />
            <div className="tc-ikb-kaydir">
              <table className="tc-ikb-tablo" aria-label="Örnek ihbar süreleri">
                <thead><tr><th scope="col">Hizmet süresi</th><th scope="col">Bildirim süresi</th><th scope="col">50.000 ₺ brüt ücrette ihbar tazminatı</th></tr></thead>
                <tbody>{([[3, '3 ay'], [12, '1 yıl'], [24, '2 yıl'], [60, '5 yıl']] as const).map(([ay, ad]) => { const w = m.noticeWeeks(ay); return <tr key={ay}><th scope="row">{ad}</th><td>{w} hafta</td><td>{paraKisa(50000 / 30 * w * 7)}</td></tr>; })}</tbody>
              </table>
            </div>
          </div>
          <Aciklama baslik="İhbar ve kıdem kuralları" dayanak="Dayanak: 4857 sayılı İş Kanunu md. 17, 27; 1475 sayılı İş Kanunu md. 14.">
            <p><b>İhbar:</b> Belirsiz süreli iş sözleşmesini feshetmek isteyen taraf, karşı tarafa hizmet süresine göre 2, 4, 6 veya 8 hafta önceden yazılı bildirimde bulunur. Bu süreler en azdır, sözleşmeyle artırılabilir. Bildirim süresine uymayan taraf, bu sürenin ücreti tutarında ihbar tazminatı öder. İşveren, bildirim süresinin ücretini peşin ödeyerek sözleşmeyi hemen feshedebilir. Bildirim süresi içinde işçiye günde en az 2 saat iş arama izni verilir.</p>
            <p><b>Kıdem:</b> En az 1 yıl çalışmış işçiye her tam yıl için 30 günlük giydirilmiş brüt ücret ödenir. Bir hizmet yılı için ödenecek tutar kıdem tavanını aşamaz. Kıdem tazminatından yalnızca damga vergisi kesilir.</p>
          </Aciklama>
        </div>
      </Bolum>
      <Bolum baslik="Engelli çalışan istihdamı">
        <div className="tc-ikb-iki">
          <div className="tc-ikb-alanlar">
            <SayiAlani a={a} k="engelliEsik" etiket="Yükümlülüğün başladığı çalışan sayısı" birim="kişi" />
            <SayiAlani a={a} k="engelliOran" etiket="İstihdam oranı" birim="%" />
          </div>
          <Aciklama baslik="Engelli istihdam yükümlülüğü" dayanak="Dayanak: 4857 sayılı İş Kanunu md. 30, 101.">
            <p>Elli veya daha fazla işçi çalıştırılan özel sektör işyerlerinde işçi sayısının %3’ü oranında engelli işçi çalıştırılması zorunludur. Aynı il sınırları içindeki işyerlerinin işçi sayısı birlikte değerlendirilir. Yükümlülüğe uyulmazsa her eksik kişi ve ay için idari para cezası uygulanır.</p>
          </Aciklama>
        </div>
      </Bolum>
    </>);
    if (sekme === 'aktarim') return (<>
      <Bolum baslik="Muhasebe hesap kodları">
        <div className="tc-ikb-iki">
          <div className="tc-ikb-alanlar">
            <MetinAlani a={a} k="hesapGider" etiket="Ücret gider hesabı (varsayılan)" ipucu="Departman kartında departmana özel gider hesabı girilebilir: 720 direkt işçilik, 730 genel üretim, 760 pazarlama, 770 genel yönetim." />
            <MetinAlani a={a} k="hesapPersonel" etiket="Personele borçlar" ipucu="Net ücretler, Tek Düzen Hesap Planı’nda 335." />
            <MetinAlani a={a} k="hesapVergi" etiket="Ödenecek vergi ve fonlar" ipucu="Gelir ve damga vergisi kesintileri, 360." />
            <MetinAlani a={a} k="hesapSgk" etiket="Ödenecek sosyal güvenlik kesintileri" ipucu="SGK ve işsizlik işçi ve işveren payları, 361." />
            <MetinAlani a={a} k="hesapDiger" etiket="Ödenecek diğer yükümlülükler" ipucu="BES, icra, avans ve diğer kesintiler, 369." />
          </div>
          <Aciklama baslik="Muhasebe aktarımı nedir?">
            <p>Her ay bordro kesinleştiğinde, ücret giderinin ve oluşan borçların muhasebe kayıtlarına işlenmesi gerekir. Muhasebe fişi; brüt ücret ve işveren primlerini gider hesabına borç, net ücreti personele, vergileri vergi dairesine, primleri SGK’ya borç olarak alacak tarafına yazar. Fiş her zaman borç = alacak olacak şekilde dengelidir.</p>
            <p>Bordro sayfasındaki “Dışa aktar” menüsünden alınan fiş CSV dosyası; Logo, Mikro, Luca, Zirve gibi programların Excel/CSV içe aktarma ekranlarında sütun eşleştirilerek kullanılabilir.</p>
          </Aciklama>
        </div>
      </Bolum>
      <Bolum baslik="SGK ve vergi bildirimleri">
        <Aciklama baslik="e-Bildirge ve MUHSGK nedir?" dayanak="Eksik gün kodları: 01 istirahat (rapor), 13 diğer (ücretsiz izin), 12 birden fazla neden. Kodları beyanname öncesi kontrol edin.">
          <p><b>e-Bildirge / e-Sigorta:</b> SGK’nın işverenler için çevrim içi bildirim sistemidir. İşe giriş bildirgesi (işe başlamadan önce), işten ayrılış bildirgesi (10 gün içinde), eksik gün belgeleri ve iş kazası bildirimleri buradan yapılır.</p>
          <p><b>MUHSGK (Muhtasar ve Prim Hizmet Beyannamesi):</b> Aylık prim ve hizmet bilgileri ile gelir ve damga vergisi kesintileri, Gelir İdaresi’nin e-Beyanname sistemi üzerinden tek beyannameyle bildirilir. Her çalışan için prim günü, prime esas kazanç, eksik gün ve nedeni, teşvik kanun numarası, vergi matrahı ve kesintiler yer alır. Beyanname ertesi ayın 26’sına kadar verilir.</p>
          <p>Bu bildirimler işveren veya mali müşavirin e-imza / şifresiyle resmî sistemlerden yapılır; bu modül doğrudan gönderim yapmaz. Bordro sayfasındaki <b>MUHSGK hazırlık listesi</b>, beyannamede girilecek bilgileri çalışan bazında hazırlar; mali müşavirinize iletebilir veya kontrol için kullanabilirsiniz.</p>
        </Aciklama>
      </Bolum>
    </>);
    if (sekme === 'ilan') return (<>
      <Bolum baslik="İlan bilgileri">
        <div className="tc-ikb-iki">
          <div className="tc-ikb-alanlar">
            <UzunAlan a={a} k="sirketTanitim" etiket="Şirket tanıtım metni" satir={5} ipucu="Her ilanın başına eklenir. 2–4 cümlede ne yaptığınızı ve çalışma kültürünüzü anlatın." />
            <MetinAlani a={a} k="kariyerEposta" etiket="Başvuru e-postası" ipucu="Pozisyonda ayrıca girilmezse kullanılır." />
            <MetinAlani a={a} k="kariyerSayfasi" etiket="Kariyer sayfası / başvuru bağlantısı" ipucu="Kanal bazlı izleme eki otomatik eklenir." />
            <MetinAlani a={a} k="ilanLokasyon" etiket="Varsayılan lokasyon" ipucu="Ör. ilçe, il" />
            <MetinAlani a={a} k="kvkkLink" etiket="Aday aydınlatma metni bağlantısı" ipucu="İlan sonuna KVKK bilgilendirmesi olarak eklenir." />
            <UzunAlan a={a} k="ilanYanHaklar" etiket="Sunduklarımız (varsayılan)" satir={5} ipucu="Her satıra bir yan hak. Boşsa yemek, yol ve prim ayarlarından otomatik oluşturulur." />
          </div>
          <Aciklama baslik="Bu bilgiler nerede kullanılır?" dayanak="Adaylardan özgeçmiş alırken kişisel veri işlediğiniz için ilanlarda aydınlatma metnine bağlantı vermeniz önerilir (6698 sayılı KVKK md. 10).">
            <p>Pozisyon açarken yalnızca pozisyona özgü alanları (sorumluluklar, nitelikler) doldurursunuz; şirket tanıtımı, başvuru yolu, lokasyon ve yan haklar buradan otomatik gelir. Pozisyonda girilen değer her zaman önceliklidir.</p>
          </Aciklama>
        </div>
      </Bolum>
      <Bolum baslik="İlan kanalları">
        {listeAlani('ilanKanallari', 'İlan kanalları', [
          { f: 'ad', l: 'Kanal' }, { f: 'url', l: 'İşveren paneli adresi' }, { f: 'kod', l: 'Kod eki', ph: 'KN' }, { f: 'aktif', l: 'Kullan', t: 'isaret' },
        ], 'Kanal ekle', () => ({ id: kimlikUret('k'), ad: 'Yeni kanal', url: 'https://', kod: '', aktif: true }))}
        <Not>Adresleri kendi işveren hesaplarınızın giriş sayfalarıyla değiştirebilirsiniz. Kod eki ilan koduna eklenir (IK-2026-001-KN) ve adaylar başvururken bu kodu yazdığında kaynak kolayca anlaşılır.</Not>
      </Bolum>
    </>);
    if (sekme === 'listeler') return (
      <Bolum baslik="Listeler">
        <div className="tc-ikb-alanlar">
          <UzunAlan a={a} k="belgeler" etiket="Özlük dosyası belge listesi" satir={10} ipucu="Her satıra bir belge." />
          <UzunAlan a={a} k="perfKriterler" etiket="Performans değerlendirme kriterleri" satir={8} ipucu="Her satıra bir kriter." />
          <UzunAlan a={a} k="mulakatKriterler" etiket="Mülakat değerlendirme kriterleri" satir={8} ipucu="Her satıra bir kriter. Aday karşılaştırma tablosunun sütunlarını oluşturur." />
        </div>
      </Bolum>
    );
    return (
      <Bolum baslik="Veri yönetimi">
        <p className="tc-ikb-soluk">Kayıtlar TMI sunucusunda tutulur; kim neyi görür ve değiştirir, TMI yetkileriyle belirlenir. Yedekleme TMI sunucusunda yapılır. Şu an {depo.kayitlar.size} kayıt var.</p>
        {yetki.personelYaz && <Dugme simge="upload" onClick={() => { git('personel'); }}>Personel aktar (Excel / CSV)</Dugme>}
        <Aciklama baslik="KVKK hatırlatması" dayanak="Dayanak: 6698 sayılı Kişisel Verilerin Korunması Kanunu md. 4–10.">
          <p>Bu modülde tutulan kimlik, sağlık raporu, engellilik ve aday bilgileri kişisel veridir; bir kısmı özel nitelikli kişisel veridir. Çalışanlara ve adaylara aydınlatma metni verin, verileri yalnızca gerekli kişilerle paylaşın ve saklama süresi dolan kayıtları silin.</p>
        </Aciklama>
      </Bolum>
    );
  };

  useSayfaKomutlari('ik-ayarlar', [
    ...SEKMELER.map((s) => ({ anahtar: `sekme-${s.anahtar}`, baslik: `Ayarlar: ${s.baslik}`, simge: 'gear' as const, aciklama: null, sozcukler: ['ayar', s.baslik], calistir: () => { sekmeYaz(s.anahtar); } })),
    ...(yazabilir ? [{ anahtar: 'yeni-donem', baslik: 'Yeni parametre dönemi', simge: 'plus' as const, aciklama: null, sozcukler: ['dönem', 'parametre', 'asgari ücret'], calistir: yeniAc }] : []),
  ]);

  const kaydetCubugu = pasif || sekme === 'veri' ? null : (
    <div className="tc-ikb-kaydet">
      {kirli ? (<><Rozet ton="uyari">{kirli} kaydedilmemiş değişiklik</Rozet><Dugme onClick={() => { taslakYaz({}); bildir('bilgi', 'Değişiklikler geri alındı.'); }}>Vazgeç</Dugme></>)
        : <span className="tc-ikb-soluk">Değişiklikler sekmeler arasında korunur; kaydedene kadar hesaplamalara yansımaz.</span>}
      <span className="tc-ikb-bosluk" />
      <Dugme tur="birincil" yukleniyor={komut.calisiyor} onClick={() => { void kaydet(); }}>Ayarları kaydet</Dugme>
    </div>
  );

  return (
    <div className="tc-ikb">
      <SayfaBasligi
        baslik="Ayarlar" simge="gear"
        alt="Şirket bilgileri, resmî tatiller, dönemlere göre ücret ve vergi parametreleri, çalışma ve izin kuralları."
        eylemler={[{ anahtar: 'hesap', baslik: 'Hesaplamalar', simge: 'ruler', sec: () => { git('hesap'); } }]}
      />
      <Sekmeler etiket="Ayar bölümü" sekmeler={SEKMELER} secili={sekme} sec={sekmeYaz} />
      {donemli && <DonemSeridi m={m} d={sp} yazabilir={yazabilir} sec={donemSec} yeni={yeniAc} yonet={() => { pencereYaz('yonet'); }} dene={() => { pencereYaz('hesap'); }} />}
      {kaydetCubugu}
      <div className="tc-ikb-yigin">{donemli ? m.withPeriod(sp.baslangic, govde) : govde()}</div>

      {pencere === 'yeni' && <YeniDonemPenceresi m={m} enErken={enErken} kaynak={sp.id} calisiyor={komut.calisiyor} kapat={() => { pencereYaz(null); }} olustur={(g) => { void olustur(g); }} />}
      {pencere === 'yonet' && <DonemYonetimi m={m} bordrolar={bordrolar} yazabilir={yazabilir} calisiyor={komut.calisiyor} kapat={() => { pencereYaz(null); }} kaydet={(d, i) => { void donemleriYaz(d, i).then((t) => { if (t && !d.some((x) => x.id === donemId)) donemIdYaz(''); }); }} iceAktar={(f) => { void iceAktar(f); }} />}
      {pencere === 'hesap' && <HesapPenceresi motor={motor} onAyar={{ sekme: 'brutnet', donem: sp.id }} kapat={() => { pencereYaz(null); }} sayfayaGit={() => { pencereYaz(null); git('hesap'); }} />}
      <OnayPenceresi
        acik={typeof pencere === 'object' && pencere !== null} baslik="Kaydedilmemiş değişiklikler kaybolsun mu?" onayMetni="Devam et" tehlikeli
        vazgec={() => { pencereYaz(null); }}
        onayla={() => {
          const p = pencere;
          taslakYaz({});
          if (typeof p === 'object' && p !== null && p.soru === 'donem') { donemIdYaz(p.hedef); pencereYaz(null); } else pencereYaz('yeni');
        }}
      >
        <p>Bu sekmede kaydetmediğiniz değişiklikler var. Devam ederseniz geri alınır.</p>
      </OnayPenceresi>
    </div>
  );
}
