import { useEffect, useState } from 'react';
import {
  Dugme, Girdi, IsaretKutusu, OnayPenceresi, Pencere, Secim, Sekmeler, Simge, Tablo, type Sekme, type Sutun,
} from '../../../../ortak/arayuz/index.ts';
import { useCncSurum } from '../depo.ts';
import { fint, fmt } from '../bicim.ts';
import { machNoDup } from '../secici.ts';
import { onbellekSil } from '../sahne/gl.ts';
import { MB_LBL, matBeh, mbStars } from '../hesap/malzeme-davranisi.ts';
import { AyarSuresiProfili } from '../cam/disari.tsx';
import type { TanimSekmesi } from '../gorunum.ts';
import { useCncYetkisi } from '../veri.ts';
import {
  BEH_ANAHTARLARI, deleteMachine, deleteMat, isCustomMachine, isCustomMat, ISO_OPTS, KONTROL_OPTS, malzemeAlanlari, malzemeler, MODEL_OPTS, saveMachine,
  saveMat, setMachineNo, TAPER_OPTS, tezgahAlanlari, tezgahlar, TIP_ADI, TIP_OPTS, YENI_TEZGAH, yeniMalzemeTaslagi,
  type Malzeme, type MalzemeAlanlari, type Tezgah, type TezgahAlanlari,
} from './tanimlar.ts';
import './tanimlar.css';

const SEKMELER: readonly Sekme<TanimSekmesi>[] = [
  { anahtar: 'mach', baslik: 'Tezgâhlar', simge: 'cpu' },
  { anahtar: 'mat', baslik: 'İş Malzemeleri', simge: 'box' },
  { anahtar: 'su', baslik: 'Hazırlık süreleri', simge: 'clock' },
];
const secenek = (l: readonly (readonly [string, string])[]) => l.map(([deger, baslik]) => ({ deger, baslik }));

type Duzen = { tur: 'mach'; mode: 'new' | 'edit'; m: Partial<Tezgah> } | { tur: 'mat'; mode: 'new' | 'edit'; m: Partial<Malzeme> };

// Tanım değişince önbellekteki dokular bırakılır; görünümler save() ile yenilenir.
function degisti(id: string | null): void { if (id) onbellekSil(id); }

function TezgahFormu({ mode, m, kaydet, vazgec }: { mode: 'new' | 'edit'; m: Partial<Tezgah>; kaydet: (f: TezgahAlanlari) => void; vazgec: () => void }) {
  const nw = mode === 'new', custom = nw || isCustomMachine(m.id ?? '');
  const [f, fYaz] = useState(() => tezgahAlanlari(m));
  const d = (k: keyof TezgahAlanlari) => ({ value: f[k] as string, onChange: (o: { target: { value: string } }) => { fYaz({ ...f, [k]: o.target.value }); } });
  return (
    <form className="tc-cl-tform" aria-label={nw ? 'Yeni tezgâh' : `Düzenle: ${m.name ?? ''}`} onSubmit={(o) => { o.preventDefault(); kaydet(f); }}>
      <div className="tc-cl-form-baslik">{nw ? 'Yeni tezgâh' : `Düzenle: ${m.name ?? ''}`}</div>
      <div className="tc-cl-tizgara">
        <Girdi etiket="Tezgâh no" placeholder="ör. T-09" {...d('no')} />
        <Girdi etiket="Ad" autoFocus {...d('name')} />
        {custom && <Secim etiket="Tip" secenekler={secenek(TIP_OPTS)} {...d('type')} />}
        {custom && <Secim etiket="3D görünüm" secenekler={secenek(MODEL_OPTS)} {...d('kind')} />}
        {custom && <Secim etiket="Kontrol" secenekler={secenek(KONTROL_OPTS)} {...d('ctrl')} />}
        {custom && <Secim etiket="Takım bağlantısı" secenekler={TAPER_OPTS.map((t) => ({ deger: t, baslik: t }))} {...d('taper')} />}
        <Girdi etiket={m.type === 'lathe' ? 'Taret istasyonu' : 'Magazin cep sayısı'} type="number" min="1" max="120" {...d('pockets')} />
        <Girdi etiket="Maks. devir (takım mili)" type="number" min="100" step="100" {...d('rpm')} />
        {(m.type !== 'mill' || custom) && <Girdi etiket="Ana iş mili devri (torna)" type="number" min="0" step="100" placeholder="—" {...d('spindle')} />}
        {custom && <IsaretKutusu etiket="Canlı takım (torna)" checked={f.live} onChange={(o) => { fYaz({ ...f, live: o.target.checked }); }} />}
      </div>
      <div className="tc-cl-dugmeler">
        <Dugme tur="birincil" type="submit" simge="check">Kaydet</Dugme>
        <Dugme onClick={vazgec}>Vazgeç</Dugme>
      </div>
    </form>
  );
}

function MalzemeFormu({ mode, m, kaydet, vazgec }: { mode: 'new' | 'edit'; m: Partial<Malzeme>; kaydet: (f: MalzemeAlanlari) => void; vazgec: () => void }) {
  const nw = mode === 'new';
  const [f, fYaz] = useState(() => malzemeAlanlari(m));
  const d = (k: Exclude<keyof MalzemeAlanlari, 'beh'>) => ({ value: f[k], onChange: (o: { target: { value: string } }) => { fYaz({ ...f, [k]: o.target.value }); } });
  // Boş bırakılan zorluk alanının yer tutucusu ISO grubu varsayılanıdır.
  const bh = matBeh(Object.assign({ id: '', name: '', vcK: 0, fk: 0, iso: m.iso ?? 'P' }, m)) as Record<string, number>;
  return (
    <form className="tc-cl-tform" aria-label={nw ? 'Yeni iş malzemesi' : `Düzenle: ${m.name ?? ''}`} onSubmit={(o) => { o.preventDefault(); kaydet(f); }}>
      <div className="tc-cl-form-baslik">{nw ? 'Yeni iş malzemesi' : `Düzenle: ${m.name ?? ''}`}</div>
      <div className="tc-cl-tizgara">
        <Girdi etiket="Ad" autoFocus {...d('name')} />
        <Secim etiket="ISO grubu" secenekler={secenek(ISO_OPTS)} {...d('iso')} />
        <Girdi etiket="Yoğunluk (g/cm³)" type="number" step="0.01" min="0.1" {...d('rho')} />
        <Girdi etiket="Vc karbür (m/dk)" type="number" min="1" {...d('vcK')} />
        <Girdi etiket="Vc HSS (m/dk, 0 = önerilmez)" type="number" min="0" {...d('vcH')} />
        <Girdi etiket="İlerleme katsayısı (×)" type="number" step="0.05" min="0.1" {...d('fk')} />
        <Girdi etiket="Sertlik" placeholder="örn. ≈43 HRC" {...d('hard')} />
        <Girdi etiket="Açıklama" {...d('desc')} />
      </div>
      <div className="tc-cl-form-baslik tc-cl-form-alt">Zorluk — kesme verisi dışındaki farklar <small>(boş bırakılırsa ISO grubu varsayılanı)</small></div>
      <div className="tc-cl-tizgara">
        {BEH_ANAHTARLARI.map((k) => (
          <Girdi
            key={k} etiket={(MB_LBL as Record<string, string>)[k]!} type="number" step={k === 'tune' ? 1 : 0.05} min="0" placeholder={String(bh[k])}
            value={f.beh[k]} onChange={(o) => { fYaz({ ...f, beh: { ...f.beh, [k]: o.target.value } }); }}
          />
        ))}
      </div>
      <p className="tc-cl-not">
        Kaba kavrama: kaba frezede yan kesme genişliği çarpanı · Torna talaş derinliği: 2 mm referansın çarpanı · Ömür üssü: küçük değer = ömür kesme hızına daha
        duyarlı · Ek ayar: ilk kez işlenen işte talaş kırma ve kesme verisi denemesi.
      </p>
      <div className="tc-cl-dugmeler">
        <Dugme tur="birincil" type="submit" simge="check">Kaydet</Dugme>
        <Dugme onClick={vazgec}>Vazgeç</Dugme>
      </div>
    </form>
  );
}

function TezgahNo({ m, dup, yazabilir }: { m: Tezgah; dup: boolean; yazabilir: boolean }) {
  return (
    <input
      key={m.no ?? ''} className="tc-alan-kutu tc-cl-no" data-dup={dup ? '' : undefined} aria-label={`${m.baseName ?? m.name}: tezgâh no`} placeholder="—"
      defaultValue={m.no ?? ''} readOnly={!yazabilir}
      onBlur={(o) => { if (o.target.value !== (m.no ?? '')) { setMachineNo(m.id, o.target.value); degisti(m.id); } }}
      onKeyDown={(o) => { if (o.key === 'Enter') o.currentTarget.blur(); }}
    />
  );
}

// Yıldızlar C45'e göre kaba işleme süresidir (prototipin mbStars'ı).
function Zorluk({ m }: { m: Malzeme }) {
  const { yildiz, oran } = mbStars(m) as { yildiz: number; oran: number };
  return (
    <span className="tc-cl-yildiz" title={`Kaba işleme C45'e göre ×${fmt(oran, 1)} süre`} aria-label={`Zorluk ${String(yildiz)} / 5`}>
      {'●●●●●'.slice(0, yildiz)}<i>{'●●●●●'.slice(yildiz)}</i>
    </span>
  );
}

interface Ozellikler {
  sekme: TanimSekmesi;
  kapat: () => void;
}

// Prototipin Tanımlar penceresi: Tezgâhlar, İş Malzemeleri, Hazırlık süreleri (P4'ün AyarSuresiProfili).
// Kabuk pencereyi yalnız açıkken çizer; sekme değişirse (openDefs) seçili sekme ona döner.
export function TanimlarPenceresi({ sekme, kapat }: Ozellikler) {
  useCncSurum();
  const yetki = useCncYetkisi();
  const [tab, tabYaz] = useState<TanimSekmesi>(sekme);
  const [duzen, duzenYaz] = useState<Duzen | null>(null);
  const [silinecek, silinecekYaz] = useState<{ tur: 'mach' | 'mat'; id: string; ad: string } | null>(null);
  useEffect(() => { tabYaz(sekme); duzenYaz(null); }, [sekme]);

  const dup = machNoDup() as Record<string, 1>;
  const yaz = yetki.yazabilir;
  const tezgahSutunlari: Sutun<Tezgah>[] = [
    { anahtar: 'no', baslik: 'No', hucre: (m) => <TezgahNo m={m} dup={!!(m.no && dup[m.no])} yazabilir={yaz} /> },
    { anahtar: 'ad', baslik: 'Tezgâh', hucre: (m) => <><b>{m.baseName ?? m.name}</b>{isCustomMachine(m.id) && <span className="tc-cl-ozel">özel</span>}</> },
    { anahtar: 'tip', baslik: 'Tip', hucre: (m) => (m.manual ? 'Üniversal torna' : TIP_ADI[m.type] ?? '') },
    { anahtar: 'kontrol', baslik: 'Kontrol', hucre: (m) => (m.manual ? 'Elle' : m.ctrl === 'heid' ? 'Heidenhain' : 'ISO / G-kod') },
    { anahtar: 'baglanti', baslik: 'Bağlantı', hucre: (m) => m.taper },
    { anahtar: 'cep', baslik: 'Cep', hizala: 'sag', hucre: (m) => m.pockets },
    { anahtar: 'devir', baslik: 'Maks. devir', hizala: 'sag', hucre: (m) => fint(m.rpm) },
    {
      anahtar: 'eylem', baslik: '', csv: false,
      hucre: (m) => (yaz ? (
        <div className="tc-cl-satir-eylem">
          <Dugme simge="edit" onClick={() => { duzenYaz({ tur: 'mach', mode: 'edit', m }); }}>Düzenle</Dugme>
          {isCustomMachine(m.id) && <Dugme tur="tehlike" simge="trash" onClick={() => { silinecekYaz({ tur: 'mach', id: m.id, ad: m.name }); }}>Sil</Dugme>}
        </div>
      ) : null),
    },
  ];
  const malzemeSutunlari: Sutun<Malzeme>[] = [
    { anahtar: 'ad', baslik: 'Malzeme', hucre: (m) => <><b>{m.name}</b>{isCustomMat(m.id) && <span className="tc-cl-ozel">özel</span>}</> },
    { anahtar: 'iso', baslik: 'ISO', hucre: (m) => <span className={`tc-cl-iso tc-cl-iso-${m.iso}`}>{m.iso}</span> },
    { anahtar: 'rho', baslik: 'Yoğunluk', hizala: 'sag', hucre: (m) => `${fmt(m.rho)} g/cm³` },
    { anahtar: 'vck', baslik: 'Vc karbür', hizala: 'sag', hucre: (m) => m.vcK },
    { anahtar: 'vch', baslik: 'Vc HSS', hizala: 'sag', hucre: (m) => m.vcH || '—' },
    { anahtar: 'fk', baslik: 'İlerleme ×', hizala: 'sag', hucre: (m) => fmt(m.fk) },
    { anahtar: 'sertlik', baslik: 'Sertlik', hucre: (m) => m.hard || '—' },
    { anahtar: 'zorluk', baslik: 'Zorluk', hucre: (m) => <Zorluk m={m} /> },
    {
      anahtar: 'eylem', baslik: '', csv: false,
      hucre: (m) => (yaz ? (
        <div className="tc-cl-satir-eylem">
          <Dugme simge="edit" onClick={() => { duzenYaz({ tur: 'mat', mode: 'edit', m }); }}>Düzenle</Dugme>
          {isCustomMat(m.id) && <Dugme tur="tehlike" simge="trash" onClick={() => { silinecekYaz({ tur: 'mat', id: m.id, ad: m.name }); }}>Sil</Dugme>}
        </div>
      ) : null),
    },
  ];

  const sil = (): void => {
    if (!silinecek) return;
    if (silinecek.tur === 'mach') deleteMachine(silinecek.id); else deleteMat(silinecek.id);
    silinecekYaz(null);
  };

  return (
    <Pencere acik kapat={kapat} baslik="Tanımlar" tur="yan">
      <Sekmeler etiket="Tanımlar" sekmeler={SEKMELER} secili={tab} sec={(t) => { tabYaz(t); duzenYaz(null); }} />
      <div className="tc-cl-tanim-govde">
        {tab === 'mach' && (
          <>
            <p className="tc-cl-not">Atölyedeki tezgâhlar. Yeni tezgâh Kurulum çarkına, Kütüphanedeki tezgâh atamalarına, G-kod ve Takım Ömrü sayfalarına otomatik eklenir.</p>
            {duzen?.tur === 'mach' && (
              <TezgahFormu
                key={duzen.m.id ?? 'yeni'} mode={duzen.mode} m={duzen.m} vazgec={() => { duzenYaz(null); }}
                kaydet={(f) => { degisti(saveMachine(duzen.mode, duzen.m, f)); duzenYaz(null); }}
              />
            )}
            {Object.keys(dup).length > 0 && (
              <div className="tc-cl-uyari"><Simge ad="alert" boyut="k" /> Aynı tezgâh numarası birden fazla tezgâhta: {Object.keys(dup).join(', ')}</div>
            )}
            <Tablo etiket="Tezgâhlar" sutunlar={tezgahSutunlari} satirlar={tezgahlar()} satirAnahtari={(m) => m.id} />
            {yaz && (
              <div className="tc-cl-dugmeler">
                <Dugme tur="birincil" simge="plus" onClick={() => { duzenYaz({ tur: 'mach', mode: 'new', m: { ...YENI_TEZGAH } }); }}>Yeni tezgâh</Dugme>
              </div>
            )}
          </>
        )}
        {tab === 'su' && <AyarSuresiProfili />}
        {tab === 'mat' && (
          <>
            <p className="tc-cl-not">İş parçası malzemeleri. Yoğunluk Ham Malzeme sayfasındaki ağırlık hesabında, Vc ve ilerleme katsayısı kesme verisi ve takım ömrü hesabında kullanılır.</p>
            {duzen?.tur === 'mat' && (
              <MalzemeFormu
                key={duzen.m.id ?? 'yeni'} mode={duzen.mode} m={duzen.m} vazgec={() => { duzenYaz(null); }}
                kaydet={(f) => { degisti(saveMat(duzen.mode, duzen.m, f)); duzenYaz(null); }}
              />
            )}
            <Tablo etiket="İş malzemeleri" sutunlar={malzemeSutunlari} satirlar={malzemeler()} satirAnahtari={(m) => m.id} />
            {yaz && (
              <div className="tc-cl-dugmeler">
                <Dugme tur="birincil" simge="plus" onClick={() => { duzenYaz({ tur: 'mat', mode: 'new', m: yeniMalzemeTaslagi() }); }}>Yeni malzeme</Dugme>
              </div>
            )}
          </>
        )}
      </div>
      <OnayPenceresi
        acik={silinecek !== null} baslik={silinecek?.tur === 'mach' ? 'Tezgâhı sil' : 'Malzemeyi sil'} tehlikeli onayMetni="Sil" onayla={sil}
        vazgec={() => { silinecekYaz(null); }}
      >
        <p>
          {silinecek?.tur === 'mach'
            ? `“${silinecek.ad}” silinsin mi? Bu tezgâhın kurulum ve atama kayıtları da silinir.`
            : `“${silinecek?.ad ?? ''}” silinsin mi?`}
        </p>
      </OnayPenceresi>
    </Pencere>
  );
}

