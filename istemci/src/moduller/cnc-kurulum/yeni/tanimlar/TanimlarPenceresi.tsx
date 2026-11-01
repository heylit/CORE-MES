import { useEffect, useState } from 'react';
import {
  Dugme, Girdi, IsaretKutusu, OnayPenceresi, Pencere, Secim, Sekmeler, Simge, Tablo, type Sekme, type Sutun,
} from '../../../../ortak/arayuz/index.ts';
import { state, useCncSurum } from '../depo.ts';
import { fint, fmt } from '../bicim.ts';
import { machNoDup, sunucuTezgahSatirlari, tezgahKaynagi, type TezgahSatiri } from '../secici.ts';
import { onbellekSil } from '../sahne/gl.ts';
import { MB_LBL, matBeh, mbStars } from '../hesap/malzeme-davranisi.ts';
import { ModellerSekmesi } from './ModellerSekmesi.tsx';
import type { TanimSekmesi } from '../gorunum.ts';
import { useCncYetkisi } from '../veri.ts';
import {
  BEH_ANAHTARLARI, deleteMat, isCustomMachine, isCustomMat, ISO_OPTS, KONTROL_OPTS, malzemeAlanlari, malzemeler, MODEL_OPTS, saveMachine,
  saveMat, setMachineNo, sunucuTezgahiKaydet, TAPER_OPTS, tezgahAlanlari, tezgahlar, TIP_ADI, TIP_OPTS, yeniMalzemeTaslagi,
  type Malzeme, type MalzemeAlanlari, type Tezgah, type TezgahAlanlari,
} from './tanimlar.ts';
import './tanimlar.css';

const SEKMELER: readonly Sekme<TanimSekmesi>[] = [
  { anahtar: 'mach', baslik: 'Tezgâhlar', simge: 'cpu' },
  { anahtar: 'mat', baslik: 'İş Malzemeleri', simge: 'box' },
  { anahtar: 'model', baslik: '3B modeller', simge: 'cube' },
];
const secenek = (l: readonly (readonly [string, string])[]) => l.map(([deger, baslik]) => ({ deger, baslik }));

type Duzen =
  | { tur: 'mach'; mode: 'new' | 'edit'; m: Partial<Tezgah> } | { tur: 'smach'; satir: TezgahSatiri } | { tur: 'mat'; mode: 'new' | 'edit'; m: Partial<Malzeme> };

// Tanım değişince önbellekteki dokular bırakılır; görünümler save() ile yenilenir.
function degisti(id: string | null): void { if (id) onbellekSil(id); }

// sunucu: makine İstasyonlar'dadır; no ve ad orada değişir, burada motorun bütün alanları girilir (1091 a).
function TezgahFormu({ mode, m, sunucu = false, kaydet, vazgec }: {
  mode: 'new' | 'edit'; m: Partial<Tezgah>; sunucu?: boolean; kaydet: (f: TezgahAlanlari) => void | Promise<void>; vazgec: () => void;
}) {
  const nw = mode === 'new', custom = nw || sunucu || isCustomMachine(m.id ?? '');
  const [f, fYaz] = useState(() => tezgahAlanlari(m));
  const [hata, hataYaz] = useState<string | null>(null);
  const [mesgul, mesgulYaz] = useState(false);
  const d = (k: keyof TezgahAlanlari) => ({ value: f[k] as string, onChange: (o: { target: { value: string } }) => { fYaz({ ...f, [k]: o.target.value }); } });
  const gonder = async (): Promise<void> => {
    hataYaz(null); mesgulYaz(true);
    try { await kaydet(f); } catch (e) { hataYaz(e instanceof Error ? e.message : 'Kaydedilemedi.'); } finally { mesgulYaz(false); }
  };
  const ad = m.baseName ?? m.name ?? '';
  return (
    <form className="tc-cl-tform" aria-label={nw ? 'Yeni tezgâh' : `Düzenle: ${ad}`} onSubmit={(o) => { o.preventDefault(); void gonder(); }}>
      <div className="tc-cl-form-baslik">{nw ? 'Yeni tezgâh' : `Düzenle: ${sunucu && m.no ? `${m.no} · ${ad}` : ad}`}</div>
      <div className="tc-cl-tizgara">
        {!sunucu && <Girdi etiket="Tezgâh no" placeholder="ör. T-09" {...d('no')} />}
        {!sunucu && <Girdi etiket="Ad" autoFocus {...d('name')} />}
        {custom && <Secim etiket="Tip" secenekler={secenek(TIP_OPTS)} {...d('type')} />}
        {custom && <Secim etiket="3D görünüm" secenekler={secenek(MODEL_OPTS)} {...d('kind')} />}
        {custom && <Secim etiket="Kontrol" secenekler={secenek(KONTROL_OPTS)} {...d('ctrl')} />}
        {custom && <Secim etiket="Takım bağlantısı" secenekler={TAPER_OPTS.map((t) => ({ deger: t, baslik: t }))} {...d('taper')} />}
        <Girdi etiket={m.type === 'lathe' ? 'Taret istasyonu' : 'Magazin cep sayısı'} type="number" min="1" max="120" {...d('pockets')} />
        <Girdi etiket="Maks. devir (takım mili)" type="number" min="100" step="100" {...d('rpm')} />
        {(m.type !== 'mill' || custom) && <Girdi etiket="Ana iş mili devri (torna)" type="number" min="0" step="100" placeholder="—" {...d('spindle')} />}
        {custom && <IsaretKutusu etiket="Canlı takım (torna)" checked={f.live} onChange={(o) => { fYaz({ ...f, live: o.target.checked }); }} />}
      </div>
      {sunucu && <p className="tc-cl-not">Tezgâh no ve ad İstasyonlar'daki makine kaydındadır; orada değişir.</p>}
      {hata !== null && <div className="tc-cl-uyari" role="alert"><Simge ad="alert" boyut="k" /> {hata}</div>}
      <div className="tc-cl-dugmeler">
        <Dugme tur="birincil" type="submit" simge="check" yukleniyor={mesgul} disabled={mesgul}>Kaydet</Dugme>
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
  const sunucuSatirlari = sunucuTezgahSatirlari();
  const kaynak = tezgahKaynagi();
  const ozelTezgahlar = state.customMachines;
  const bilinmez = (v: string | number | undefined): string | number => v ?? '—';
  const sunucuSutunlari: Sutun<TezgahSatiri>[] = [
    { anahtar: 'no', baslik: 'No', hucre: (x) => x.sunucu.kod },
    {
      anahtar: 'ad', baslik: 'Tezgâh',
      hucre: (x) => (
        <><b>{x.sunucu.ad}</b>{!x.tam && <span className="tc-cl-ozel">ayarı eksik</span>}{!x.sunucu.aktif && <span className="tc-cl-ozel">pasif</span>}</>
      ),
    },
    { anahtar: 'tip', baslik: 'Tip', hucre: (x) => (x.tezgah.manual ? 'Üniversal torna' : x.tezgah.type ? TIP_ADI[x.tezgah.type] ?? '' : '—') },
    { anahtar: 'kontrol', baslik: 'Kontrol', hucre: (x) => (x.tezgah.manual ? 'Elle' : x.tezgah.ctrl === 'heid' ? 'Heidenhain' : x.tezgah.ctrl ? 'ISO / G-kod' : '—') },
    { anahtar: 'baglanti', baslik: 'Bağlantı', hucre: (x) => bilinmez(x.tezgah.taper) },
    { anahtar: 'cep', baslik: 'Cep', hizala: 'sag', hucre: (x) => bilinmez(x.tezgah.pockets) },
    { anahtar: 'devir', baslik: 'Maks. devir', hizala: 'sag', hucre: (x) => (x.tezgah.rpm ? fint(x.tezgah.rpm) : '—') },
    {
      anahtar: 'eylem', baslik: '', csv: false,
      hucre: (x) => (yaz && x.sunucu.aktif ? (
        <div className="tc-cl-satir-eylem">
          <Dugme simge="edit" onClick={() => { duzenYaz({ tur: 'smach', satir: x }); }}>Düzenle</Dugme>
        </div>
      ) : null),
    },
  ];
  const tezgahSutunlari: Sutun<Tezgah>[] = [
    { anahtar: 'no', baslik: 'No', hucre: (m) => <TezgahNo m={m} dup={!!(m.no && dup[m.no])} yazabilir={yaz} /> },
    { anahtar: 'ad', baslik: 'Tezgâh', hucre: (m) => <><b>{m.baseName ?? m.name}</b>{isCustomMachine(m.id) && <span className="tc-cl-ozel">özel</span>}</> },
    { anahtar: 'tip', baslik: 'Tip', hucre: (m) => (m.manual ? 'Üniversal torna' : TIP_ADI[m.type] ?? '') },
    { anahtar: 'kontrol', baslik: 'Kontrol', hucre: (m) => (m.manual ? 'Elle' : m.ctrl === 'heid' ? 'Heidenhain' : 'ISO / G-kod') },
    { anahtar: 'baglanti', baslik: 'Bağlantı', hucre: (m) => m.taper },
    { anahtar: 'cep', baslik: 'Cep', hizala: 'sag', hucre: (m) => m.pockets },
    { anahtar: 'devir', baslik: 'Maks. devir', hizala: 'sag', hucre: (m) => fint(m.rpm) },
    {
      // 1137 a: özel tezgâh salt okunurdur.
      anahtar: 'eylem', baslik: '', csv: false,
      hucre: (m) => (yaz && !isCustomMachine(m.id) ? (
        <div className="tc-cl-satir-eylem">
          <Dugme simge="edit" onClick={() => { duzenYaz({ tur: 'mach', mode: 'edit', m }); }}>Düzenle</Dugme>
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
    deleteMat(silinecek.id);
    silinecekYaz(null);
  };

  return (
    <Pencere acik kapat={kapat} baslik="Tanımlar" tur="yan">
      <Sekmeler etiket="Tanımlar" sekmeler={SEKMELER} secili={tab} sec={(t) => { tabYaz(t); duzenYaz(null); }} />
      <div className="tc-cl-tanim-govde">
        {tab === 'mach' && (
          <>
            <p className="tc-cl-not">
              {sunucuSatirlari !== null
                ? 'Atölyedeki tezgâhlar İstasyonlar\'daki makine kayıtlarıdır; yeni tezgâh orada makine olarak açılır. Burada motorun ayarı girilir; ayarı tamamlanan tezgâh Kurulum çarkına, Kütüphanedeki tezgâh atamalarına, G-kod ve Takım Ömrü sayfalarına otomatik eklenir.'
                : 'Atölyedeki tezgâhlar. Yeni tezgâh İstasyonlar\'da makine olarak açılır.'}
            </p>
            {kaynak === 'gomulu' && (
              <div className="tc-cl-uyari" role="status">
                <Simge ad="alert" boyut="k" />
                {sunucuSatirlari === null
                  ? ' İstasyonlar\'da makine kaydı yok ya da liste alınamadı; ekran gömülü tezgâh listesini kullanıyor.'
                  : ' Ayarı tamamlanmış makine yok; ekran gömülü tezgâh listesini kullanıyor. Makinenin ayarını girin.'}
              </div>
            )}
            {duzen?.tur === 'mach' && (
              <TezgahFormu
                key={duzen.m.id ?? 'yeni'} mode={duzen.mode} m={duzen.m} vazgec={() => { duzenYaz(null); }}
                kaydet={(f) => { degisti(saveMachine(duzen.mode, duzen.m, f)); duzenYaz(null); }}
              />
            )}
            {duzen?.tur === 'smach' && (
              <TezgahFormu
                key={duzen.satir.tezgah.id} mode="edit" sunucu m={duzen.satir.tezgah} vazgec={() => { duzenYaz(null); }}
                kaydet={async (f) => { degisti(await sunucuTezgahiKaydet(duzen.satir, f)); duzenYaz(null); }}
              />
            )}
            {sunucuSatirlari !== null
              ? <Tablo etiket="Tezgâhlar" sutunlar={sunucuSutunlari} satirlar={sunucuSatirlari} satirAnahtari={(x) => x.tezgah.id} />
              : (
                <>
                  {Object.keys(dup).length > 0 && (
                    <div className="tc-cl-uyari"><Simge ad="alert" boyut="k" /> Aynı tezgâh numarası birden fazla tezgâhta: {Object.keys(dup).join(', ')}</div>
                  )}
                  <Tablo etiket="Tezgâhlar" sutunlar={tezgahSutunlari} satirlar={tezgahlar()} satirAnahtari={(m) => m.id} />
                </>
              )}
            {sunucuSatirlari !== null && ozelTezgahlar.length > 0 && (
              <p className="tc-cl-not" role="note">
                <Simge ad="cpu" boyut="k" /> Kayıtta özel tezgâh var: {ozelTezgahlar.map((m) => (m.no ? `${m.no} · ${m.name}` : m.name)).join(', ')}. Bunlar artık listede değil ve salt okunur;
                kullanılacaksa İstasyonlar'da makine olarak açılır.
              </p>
            )}
          </>
        )}
        {tab === 'model' && <ModellerSekmesi yazabilir={yaz} />}
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

