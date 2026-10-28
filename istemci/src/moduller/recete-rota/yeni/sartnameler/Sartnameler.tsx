import { useState } from 'react';
import type {
  AtifGirdisi, ParametreDegeri, ParametreGirdisi, SartnameCevabi, SartnameKapsami, SartnamelerCevabi, SartnameSurumu,
} from '#paylasilan/sozlesme/rota.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { CokSatir, DurumKutusu, Dugme, Girdi, IsaretKutusu, OnayPenceresi, Pencere, Rozet, Secim, useBildirim } from '../../../../ortak/arayuz/index.ts';
import {
  anahtarUret, ATIF_ROLLERI, ATIF_ROLU_ADLARI, AZAMI_ATIF, AZAMI_BELGE, AZAMI_PARAMETRE, degerMetni, eslesir, KAPSAM_ADLARI, PARAMETRE_TURLERI,
  PARAMETRE_TURU_ADLARI, SARTNAME_KAPSAMLARI, sayiOku, SURUM_DURUMU_ADLARI,
} from './kurallar.ts';
import { useSartname, useSartnameKomutu, useStandartEkle, type SartnameKomutu } from './veri.ts';

type Sartname = SartnameCevabi['sartname'];

interface Ozellikler {
  veri: SartnamelerCevabi;
  yazabilir: boolean;
  yayinlayabilir: boolean;
  yeniAcik: boolean;
  yeniKapat: () => void;
}

// Şartnameler sekmesi (prototip Main): solda kategori süzgeci ve liste, sağda seçili şartnamenin sürümü, alanları, standart atıfları ve
// istenen belgeleri. Yazma ve yayın düğmeleri yalnız işlemi olana görünür (976 a: yönetici); asıl denetim uçtadır.
export function Sartnameler({ veri, yazabilir, yayinlayabilir, yeniAcik, yeniKapat }: Ozellikler) {
  const [kategori, setKategori] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [seciliId, setSeciliId] = useState<number | null>(null);
  const gorunen = veri.sartnameler.filter((s) => (kategori === null || s.kategoriId === kategori) && eslesir(q, s.kod, s.ad, s.musteriBelgeNo));
  const id = seciliId ?? gorunen[0]?.id ?? null;
  const ayrinti = useSartname(id);

  return (
    <div className="tc-st-izgara">
      <section className="tc-st-kutu" aria-label="Şartname listesi">
        <div className="tc-st-cipler" role="group" aria-label="Kategori">
          <button type="button" className="tc-st-tur" aria-pressed={kategori === null} onClick={() => { setKategori(null); }}>Tümü</button>
          {veri.kategoriler.map((k) => (
            <button key={k.id} type="button" className="tc-st-tur" aria-pressed={kategori === k.id} onClick={() => { setKategori(k.id); }}>{k.ad}</button>
          ))}
        </div>
        <Girdi etiket="Ara" type="search" placeholder="Kod, ad ya da müşteri belge no" value={q} onChange={(e) => { setQ(e.target.value); }} />
        {gorunen.length === 0 && <p className="tc-st-soluk">{veri.sartnameler.length ? 'Süzgece uyan şartname yok.' : 'Henüz şartname yok.'}</p>}
        <div className="tc-st-liste">
          {gorunen.map((s) => (
            <button key={s.id} type="button" className="tc-st-satir-sec tc-st-sartname" aria-current={s.id === id ? 'true' : undefined} onClick={() => { setSeciliId(s.id); }}>
              <span className="tc-st-kod">{s.kod}</span>
              <span className="tc-st-kalin">{s.ad}</span>
              <span className="tc-st-rozetler">
                {s.yururlukteSurumNo === null && <Rozet ton="uyari" gorunum="cizgi">taslak</Rozet>}
                {!s.aktif && <Rozet ton="pasif">pasif</Rozet>}
                <span className="tc-st-soluk">{KAPSAM_ADLARI[s.kapsam]}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="tc-st-kutu" aria-label="Şartname ayrıntısı">
        {id === null && <p className="tc-st-soluk">Soldan bir şartname seçin.</p>}
        {ayrinti.isPending && id !== null && <DurumKutusu durum="yukleniyor" />}
        {ayrinti.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(ayrinti.error, 'Şartname alınamadı.')} yenile={() => { void ayrinti.refetch(); }} />}
        {ayrinti.data && (
          <SartnameAyrintisi key={ayrinti.data.sartname.id} sartname={ayrinti.data.sartname} veri={veri} yazabilir={yazabilir} yayinlayabilir={yayinlayabilir}
            sec={setSeciliId} />
        )}
      </section>

      {yeniAcik && <YeniSartname veri={veri} kapat={yeniKapat} eklendi={(yeni) => { yeniKapat(); setKategori(null); setSeciliId(yeni); }} />}
    </div>
  );
}

function SartnameAyrintisi({ sartname, veri, yazabilir, yayinlayabilir, sec }: {
  sartname: Sartname; veri: SartnamelerCevabi; yazabilir: boolean; yayinlayabilir: boolean; sec: (id: number) => void;
}) {
  const komut = useSartnameKomutu();
  const { bildir } = useBildirim();
  const yururlukte = sartname.surumler.find((v) => v.durum === 'yururlukte') ?? null;
  const taslak = sartname.surumler.find((v) => v.durum === 'taslak') ?? null;
  const [taslakta, setTaslakta] = useState(yururlukte === null);
  const [pencere, setPencere] = useState<'kopya' | 'duzen' | 'sil' | null>(null);
  const gosterilen = (taslakta ? taslak : yururlukte) ?? yururlukte ?? taslak;
  const kategori = veri.kategoriler.find((k) => k.id === sartname.kategoriId);

  const calistir = (k: SartnameKomutu, tamam: string, sonra?: () => void) => {
    komut.mutate(k, {
      onSuccess: () => { bildir('tamam', tamam); sonra?.(); },
      onError: (h) => { bildir('hata', hataIletisi(h, 'İşlem yapılamadı.')); },
    });
  };
  const surum = { surum: sartname.surum };

  return (
    <>
      <div className="tc-st-satir tc-st-sar">
        <div className="tc-st-adim-metin">
          <span className="tc-st-kod">
            {[sartname.kod, gosterilen ? `sürüm ${String(gosterilen.surumNo)}` : null, gosterilen ? SURUM_DURUMU_ADLARI[gosterilen.durum] : null,
              KAPSAM_ADLARI[sartname.kapsam]].filter(Boolean).join(' · ')}
          </span>
          <h2 className="tc-st-baslik">{sartname.ad}</h2>
          <span className="tc-st-soluk">
            {[kategori?.ad ?? null,
              sartname.kaynak === 'varsayilan' ? 'hazır kütüphane' : sartname.kaynak === 'musteri'
                ? `müşteri: ${sartname.musteriFirma?.ad ?? '—'} ${sartname.musteriBelgeNo ?? ''}`.trim() : 'atölyenin şartnamesi',
              `${String(sartname.kullanim)} rota adımında`, sartname.aktif ? null : 'kullanımda değil'].filter(Boolean).join(' · ')}
          </span>
        </div>
        {yururlukte && taslak && (
          <div className="tc-st-cipler" role="group" aria-label="Gösterilen sürüm">
            <button type="button" className="tc-st-tur" aria-pressed={!taslakta} onClick={() => { setTaslakta(false); }}>{`Yürürlükte (s${String(yururlukte.surumNo)})`}</button>
            <button type="button" className="tc-st-tur" aria-pressed={taslakta} onClick={() => { setTaslakta(true); }}>{`Taslak (s${String(taslak.surumNo)})`}</button>
          </div>
        )}
      </div>

      {(yazabilir || yayinlayabilir) && (
        <div className="tc-st-araclar">
          {yazabilir && yururlukte && <Dugme simge="file" onClick={() => { setPencere('kopya'); }}>Kopyala</Dugme>}
          {yazabilir && yururlukte && !taslak && (
            <Dugme simge="plus" yukleniyor={komut.isPending}
              onClick={() => { calistir({ ad: 'surum-ac', id: sartname.id, govde: surum }, 'Yeni sürüm taslağı açıldı.', () => { setTaslakta(true); }); }}>
              Yeni sürüm
            </Dugme>
          )}
          {yazabilir && taslak && <Dugme simge="edit" onClick={() => { setTaslakta(true); setPencere('duzen'); }}>Taslağı düzenle</Dugme>}
          {yazabilir && taslak && yururlukte && <Dugme simge="trash" tur="tehlike" onClick={() => { setPencere('sil'); }}>Taslağı sil</Dugme>}
          {yayinlayabilir && taslak && (
            <Dugme tur="birincil" simge="check" yukleniyor={komut.isPending}
              onClick={() => { calistir({ ad: 'yayinla', id: sartname.id, govde: surum }, 'Sürüm yayınlandı; yeni emirler bu sürümü alır.', () => { setTaslakta(false); }); }}>
              {`Sürüm ${String(taslak.surumNo)} yayınla`}
            </Dugme>
          )}
          {yayinlayabilir && (
            <Dugme simge={sartname.aktif ? 'lock' : 'check'} yukleniyor={komut.isPending}
              onClick={() => {
                calistir({ ad: sartname.aktif ? 'pasife-al' : 'etkinlestir', id: sartname.id, govde: surum },
                  sartname.aktif ? 'Şartname kullanımdan kaldırıldı.' : 'Şartname kullanıma alındı.');
              }}>
              {sartname.aktif ? 'Kullanımdan kaldır' : 'Kullanıma al'}
            </Dugme>
          )}
        </div>
      )}

      {gosterilen && <SurumGorunumu surum={gosterilen} />}

      {pencere === 'kopya' && <KopyaPenceresi sartname={sartname} kapat={() => { setPencere(null); }} eklendi={(y) => { setPencere(null); sec(y); }} />}
      {pencere === 'duzen' && taslak && <TaslakDuzenleyici sartname={sartname} taslak={taslak} veri={veri} kapat={() => { setPencere(null); }} />}
      <OnayPenceresi acik={pencere === 'sil'} baslik="Taslak silinsin mi?" tehlikeli yukleniyor={komut.isPending}
        onayla={() => { calistir({ ad: 'taslak-sil', id: sartname.id, govde: surum }, 'Taslak silindi.', () => { setPencere(null); setTaslakta(false); }); }}
        vazgec={() => { setPencere(null); }}>
        Yürürlükteki sürüm değişmez; taslaktaki değişiklikler kaybolur.
      </OnayPenceresi>
    </>
  );
}

function SurumGorunumu({ surum }: { surum: SartnameSurumu }) {
  return (
    <>
      {surum.parametreler.length > 0 && (
        <div className="tc-st-alanlar">
          {surum.parametreler.map((p) => (
            <div key={p.anahtar} className="tc-st-deger">
              <span className="tc-st-soluk">{p.zorunlu ? `${p.ad} *` : p.ad}</span>
              <strong>{degerMetni(p, p.varsayilan) ?? (p.adimdaDegisir ? 'adımda girilir' : '—')}</strong>
              {p.ipucu && <span className="tc-st-soluk">{p.ipucu}</span>}
            </div>
          ))}
        </div>
      )}
      {surum.parametreler.length === 0 && <p className="tc-st-soluk">Bu sürümde alan yok.</p>}
      {surum.atiflar.length > 0 && (
        <div className="tc-st-bolum">
          <h3 className="tc-st-etiket">Standart atıfları</h3>
          <ul className="tc-st-duz-liste-yazi">
            {surum.atiflar.map((a) => (
              <li key={a.sira}><strong>{a.standart.numara}</strong>{` · ${ATIF_ROLU_ADLARI[a.rol]} · ${a.standart.kisaAciklama}${a.not ? ` (${a.not})` : ''}`}</li>
            ))}
          </ul>
        </div>
      )}
      {surum.istenenBelgeler.length > 0 && (
        <div className="tc-st-bolum">
          <h3 className="tc-st-etiket">İstenen belgeler</h3>
          <ul className="tc-st-duz-liste-yazi">{surum.istenenBelgeler.map((b) => <li key={b}>{b}</li>)}</ul>
        </div>
      )}
      {surum.terminalNotu && (
        <div className="tc-st-bolum">
          <h3 className="tc-st-etiket">Terminal notu</h3>
          <p className="tc-st-yazi">{surum.terminalNotu}</p>
        </div>
      )}
      {surum.degisiklikNotu && <p className="tc-st-soluk">{`Değişiklik: ${surum.degisiklikNotu}`}</p>}
    </>
  );
}

const KOD_KURALI = /^[A-Z0-9][A-Z0-9-]{1,29}$/;
const kodHatasi = (kod: string): string | undefined => (kod.trim() === '' || KOD_KURALI.test(kod.trim().toUpperCase()) ? undefined : 'Kod 2-30 karakter: büyük harf, rakam ve tire.');

function YeniSartname({ veri, kapat, eklendi }: { veri: SartnamelerCevabi; kapat: () => void; eklendi: (id: number) => void }) {
  const komut = useSartnameKomutu();
  const [g, setG] = useState({ kod: '', ad: '', kategoriId: String(veri.kategoriler[0]?.id ?? ''), kapsam: 'ikisi' as SartnameKapsami });
  const [hata, setHata] = useState<string | null>(null);
  const tamam = g.kod.trim() !== '' && kodHatasi(g.kod) === undefined && g.ad.trim() !== '' && g.kategoriId !== '';
  const ekle = () => {
    setHata(null);
    komut.mutate({
      ad: 'ekle',
      govde: { kod: g.kod.trim().toUpperCase(), ad: g.ad.trim(), kategoriId: Number(g.kategoriId), kapsam: g.kapsam, musteriFirmaId: null, musteriBelgeNo: null },
    }, { onSuccess: (c) => { eklendi(c.sartname.id); }, onError: (h) => { setHata(hataIletisi(h, 'Şartname eklenemedi.')); } });
  };
  return (
    <Pencere acik kapat={kapat} baslik="Yeni şartname" alt={(
      <>
        <Dugme onClick={kapat}>Vazgeç</Dugme>
        <Dugme tur="birincil" simge="check" disabled={!tamam} yukleniyor={komut.isPending} onClick={ekle}>Taslak olarak ekle</Dugme>
      </>
    )}>
      <div className="tc-st-form">
        <Girdi etiket="Kod" required maxLength={30} placeholder="KPL-..." value={g.kod} hata={kodHatasi(g.kod)} onChange={(e) => { setG({ ...g, kod: e.target.value }); }} />
        <Girdi etiket="Ad" required maxLength={120} value={g.ad} onChange={(e) => { setG({ ...g, ad: e.target.value }); }} />
        <Secim etiket="Kategori" required secenekler={veri.kategoriler.map((k) => ({ deger: String(k.id), baslik: k.ad }))} value={g.kategoriId}
          onChange={(e) => { setG({ ...g, kategoriId: e.target.value }); }} />
        <Secim etiket="Kapsam" secenekler={SARTNAME_KAPSAMLARI.map((k) => ({ deger: k, baslik: KAPSAM_ADLARI[k] }))} value={g.kapsam}
          onChange={(e) => { setG({ ...g, kapsam: e.target.value as SartnameKapsami }); }} />
        <p className="tc-st-soluk">İlk sürüm taslak açılır; alanlar ve standartlar taslakta girilir, yayınlanınca rota adımına seçilebilir.</p>
        {hata && <p className="tc-st-hata" role="alert">{hata}</p>}
      </div>
    </Pencere>
  );
}

function KopyaPenceresi({ sartname, kapat, eklendi }: { sartname: Sartname; kapat: () => void; eklendi: (id: number) => void }) {
  const komut = useSartnameKomutu();
  const [g, setG] = useState({ kod: '', ad: `${sartname.ad} (kopya)` });
  const [hata, setHata] = useState<string | null>(null);
  const tamam = g.kod.trim() !== '' && kodHatasi(g.kod) === undefined && g.ad.trim() !== '';
  const kopyala = () => {
    setHata(null);
    komut.mutate({ ad: 'kopyala', id: sartname.id, govde: { kod: g.kod.trim().toUpperCase(), ad: g.ad.trim(), musteriFirmaId: null, musteriBelgeNo: null } }, {
      onSuccess: (c) => { eklendi(c.sartname.id); }, onError: (h) => { setHata(hataIletisi(h, 'Şartname kopyalanamadı.')); },
    });
  };
  return (
    <Pencere acik kapat={kapat} baslik={`${sartname.kod} kopyası`} alt={(
      <>
        <Dugme onClick={kapat}>Vazgeç</Dugme>
        <Dugme tur="birincil" simge="file" disabled={!tamam} yukleniyor={komut.isPending} onClick={kopyala}>Kopyala</Dugme>
      </>
    )}>
      <div className="tc-st-form">
        <Girdi etiket="Yeni kod" required maxLength={30} value={g.kod} hata={kodHatasi(g.kod)} onChange={(e) => { setG({ ...g, kod: e.target.value }); }} />
        <Girdi etiket="Ad" required maxLength={120} value={g.ad} onChange={(e) => { setG({ ...g, ad: e.target.value }); }} />
        <p className="tc-st-soluk">Kopya yürürlükteki sürümün alanları ve standartlarıyla taslak olarak açılır.</p>
        {hata && <p className="tc-st-hata" role="alert">{hata}</p>}
      </div>
    </Pencere>
  );
}

type ParametreTaslagi = ParametreGirdisi & { yeni: boolean };
const SECENEKLI = new Set(['secim', 'coklu']);

function TaslakDuzenleyici({ sartname, taslak, veri, kapat }: { sartname: Sartname; taslak: SartnameSurumu; veri: SartnamelerCevabi; kapat: () => void }) {
  const komut = useSartnameKomutu();
  const standartEkle = useStandartEkle();
  const { bildir } = useBildirim();
  const [ad, setAd] = useState(sartname.ad);
  const [kategoriId, setKategoriId] = useState(String(sartname.kategoriId));
  const [parametreler, setParametreler] = useState<ParametreTaslagi[]>(
    taslak.parametreler.map(({ sira: _, ...p }) => ({ ...p, yeni: false })),
  );
  const [atiflar, setAtiflar] = useState<AtifGirdisi[]>(taslak.atiflar.map((a) => ({ standartId: a.standart.id, rol: a.rol, not: a.not })));
  const [belgeler, setBelgeler] = useState<string[]>(taslak.istenenBelgeler);
  const [terminalNotu, setTerminalNotu] = useState(taslak.terminalNotu ?? '');
  const [degisiklikNotu, setDegisiklikNotu] = useState(taslak.degisiklikNotu ?? '');
  const [yeniStandart, setYeniStandart] = useState<{ numara: string; kisaAciklama: string } | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  const pYaz = (i: number, y: Partial<ParametreTaslagi>) => { setParametreler(parametreler.map((p, j) => (j === i ? { ...p, ...y } : p))); };
  const pEkle = () => {
    setParametreler([...parametreler, {
      anahtar: '', ad: '', tur: 'sayi', birim: null, secenekler: null, varsayilan: null, ipucu: null, zorunlu: false, adimdaDegisir: false, yeni: true,
    }]);
  };
  const eksik = [
    ad.trim() === '' ? 'Şartname adı zorunlu.' : null,
    parametreler.some((p) => p.ad.trim() === '') ? 'Her alanın adı olmalı.' : null,
    parametreler.some((p) => SECENEKLI.has(p.tur) && (p.secenekler ?? []).length === 0) ? 'Seçimli alanın seçenekleri olmalı.' : null,
    atiflar.some((a) => a.standartId === 0) ? 'Her atıfta standart seçilmeli.' : null,
    belgeler.some((b) => b.trim() === '') ? 'Boş belge satırı var.' : null,
  ].filter((e): e is string => e !== null);

  const kaydet = async () => {
    setHata(null);
    setKaydediliyor(true);
    try {
      let surum = sartname.surum;
      if (ad.trim() !== sartname.ad || Number(kategoriId) !== sartname.kategoriId) {
        surum = (await komut.mutateAsync({ ad: 'kunye', id: sartname.id, govde: { surum, ad: ad.trim(), kategoriId: Number(kategoriId) } })).sartname.surum;
      }
      const anahtarlar: string[] = [];
      const ps = parametreler.map(({ yeni, ...p }) => {
        const anahtar = yeni || p.anahtar === '' ? anahtarUret(p.ad, [...anahtarlar, ...parametreler.filter((x) => !x.yeni).map((x) => x.anahtar)]) : p.anahtar;
        anahtarlar.push(anahtar);
        return { ...p, anahtar, ad: p.ad.trim(), secenekler: SECENEKLI.has(p.tur) ? p.secenekler : null };
      });
      await komut.mutateAsync({
        ad: 'taslak-kaydet', id: sartname.id,
        govde: {
          surum, parametreler: ps, atiflar, istenenBelgeler: belgeler.map((b) => b.trim()),
          terminalNotu: terminalNotu.trim() || null, degisiklikNotu: degisiklikNotu.trim() || null,
        },
      });
      bildir('tamam', 'Taslak kaydedildi.');
      kapat();
    } catch (h) {
      setHata(hataIletisi(h, 'Taslak kaydedilemedi.'));
    } finally {
      setKaydediliyor(false);
    }
  };
  const standartKaydet = () => {
    if (!yeniStandart) return;
    standartEkle.mutate({ numara: yeniStandart.numara.trim(), kisaAciklama: yeniStandart.kisaAciklama.trim() }, {
      onSuccess: (c) => { setAtiflar([...atiflar, { standartId: c.standart.id, rol: 'yontem', not: null }]); setYeniStandart(null); },
      onError: (h) => { setHata(hataIletisi(h, 'Standart eklenemedi.')); },
    });
  };
  const standartlar = veri.standartlar.map((s) => ({ deger: String(s.id), baslik: `${s.numara} · ${s.kisaAciklama}` }));

  return (
    <Pencere acik tur="yan" kapat={kapat} baslik={`${sartname.kod} · sürüm ${String(taslak.surumNo)} taslağı`} alt={(
      <>
        <Dugme onClick={kapat}>Vazgeç</Dugme>
        <Dugme tur="birincil" simge="check" disabled={eksik.length > 0} yukleniyor={kaydediliyor} onClick={() => { void kaydet(); }}>Taslağı kaydet</Dugme>
      </>
    )}>
      <div className="tc-st-form">
        <Girdi etiket="Ad" required maxLength={120} value={ad} onChange={(e) => { setAd(e.target.value); }} />
        <Secim etiket="Kategori" secenekler={veri.kategoriler.map((k) => ({ deger: String(k.id), baslik: k.ad }))} value={kategoriId}
          onChange={(e) => { setKategoriId(e.target.value); }} />

        <h3 className="tc-st-etiket">Alanlar</h3>
        {parametreler.map((p, i) => (
          <fieldset key={i} className="tc-st-alan tc-st-cerceve">
            <legend>{p.ad.trim() || `Alan ${String(i + 1)}`}</legend>
            <div className="tc-st-olcum">
              <Girdi etiket="Alan adı" required maxLength={80} value={p.ad} onChange={(e) => { pYaz(i, { ad: e.target.value }); }} />
              <Secim etiket="Tür" secenekler={PARAMETRE_TURLERI.map((t) => ({ deger: t, baslik: PARAMETRE_TURU_ADLARI[t] }))} value={p.tur}
                onChange={(e) => { pYaz(i, { tur: e.target.value as ParametreGirdisi['tur'], varsayilan: null }); }} />
              <Girdi etiket="Birim" maxLength={20} value={p.birim ?? ''} onChange={(e) => { pYaz(i, { birim: e.target.value || null }); }} />
              <VarsayilanGirdisi parametre={p} yaz={(varsayilan) => { pYaz(i, { varsayilan }); }} />
            </div>
            {SECENEKLI.has(p.tur) && (
              <Girdi etiket="Seçenekler (virgülle)" value={(p.secenekler ?? []).join(', ')}
                onChange={(e) => { pYaz(i, { secenekler: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) }); }} />
            )}
            <Girdi etiket="İpucu" maxLength={120} value={p.ipucu ?? ''} onChange={(e) => { pYaz(i, { ipucu: e.target.value || null }); }} />
            <div className="tc-st-araclar">
              <IsaretKutusu etiket="Zorunlu" checked={p.zorunlu} onChange={(e) => { pYaz(i, { zorunlu: e.target.checked }); }} />
              <IsaretKutusu etiket="Adımda değişir" checked={p.adimdaDegisir} onChange={(e) => { pYaz(i, { adimdaDegisir: e.target.checked }); }} />
              <Dugme simge="trash" tur="tehlike" onClick={() => { setParametreler(parametreler.filter((_, j) => j !== i)); }}>Alanı sil</Dugme>
            </div>
          </fieldset>
        ))}
        {parametreler.length < AZAMI_PARAMETRE && <Dugme simge="plus" onClick={pEkle}>Alan ekle</Dugme>}

        <h3 className="tc-st-etiket">Standart atıfları</h3>
        {atiflar.map((a, i) => (
          <div key={i} className="tc-st-olcum">
            <Secim etiket="Standart" bosSecenek="Seçiniz" secenekler={standartlar} value={a.standartId ? String(a.standartId) : ''}
              onChange={(e) => { setAtiflar(atiflar.map((x, j) => (j === i ? { ...x, standartId: Number(e.target.value) } : x))); }} />
            <Secim etiket="Rol" secenekler={ATIF_ROLLERI.map((r) => ({ deger: r, baslik: ATIF_ROLU_ADLARI[r] }))} value={a.rol}
              onChange={(e) => { setAtiflar(atiflar.map((x, j) => (j === i ? { ...x, rol: e.target.value as AtifGirdisi['rol'] } : x))); }} />
            <Girdi etiket="Not" maxLength={120} value={a.not ?? ''}
              onChange={(e) => { setAtiflar(atiflar.map((x, j) => (j === i ? { ...x, not: e.target.value || null } : x))); }} />
            <Dugme simge="trash" tur="tehlike" aria-label="Atfı sil" onClick={() => { setAtiflar(atiflar.filter((_, j) => j !== i)); }} />
          </div>
        ))}
        <div className="tc-st-araclar">
          {atiflar.length < AZAMI_ATIF && <Dugme simge="plus" onClick={() => { setAtiflar([...atiflar, { standartId: 0, rol: 'yontem', not: null }]); }}>Atıf ekle</Dugme>}
          {yeniStandart === null && <Dugme simge="book" onClick={() => { setYeniStandart({ numara: '', kisaAciklama: '' }); }}>Listede olmayan standart</Dugme>}
        </div>
        {yeniStandart && (
          <div className="tc-st-olcum">
            <Girdi etiket="Standart numarası" maxLength={60} value={yeniStandart.numara} onChange={(e) => { setYeniStandart({ ...yeniStandart, numara: e.target.value }); }} />
            <Girdi etiket="Kısa açıklama" maxLength={200} value={yeniStandart.kisaAciklama}
              onChange={(e) => { setYeniStandart({ ...yeniStandart, kisaAciklama: e.target.value }); }} />
            <Dugme tur="birincil" disabled={!yeniStandart.numara.trim() || !yeniStandart.kisaAciklama.trim()} yukleniyor={standartEkle.isPending} onClick={standartKaydet}>
              Standardı ekle
            </Dugme>
            <Dugme onClick={() => { setYeniStandart(null); }}>Vazgeç</Dugme>
          </div>
        )}

        <h3 className="tc-st-etiket">İstenen belgeler</h3>
        {belgeler.map((b, i) => (
          <div key={i} className="tc-st-secenek">
            <Girdi etiket={`Belge ${String(i + 1)}`} maxLength={120} value={b} onChange={(e) => { setBelgeler(belgeler.map((x, j) => (j === i ? e.target.value : x))); }} />
            <Dugme simge="x" aria-label={`Belge ${String(i + 1)} kaldır`} onClick={() => { setBelgeler(belgeler.filter((_, j) => j !== i)); }} />
          </div>
        ))}
        {belgeler.length < AZAMI_BELGE && <Dugme simge="plus" onClick={() => { setBelgeler([...belgeler, '']); }}>Belge ekle</Dugme>}

        <CokSatir etiket="Terminal notu" maxLength={1000} rows={3} value={terminalNotu} onChange={(e) => { setTerminalNotu(e.target.value); }} />
        <CokSatir etiket="Değişiklik notu" maxLength={500} rows={2} value={degisiklikNotu} onChange={(e) => { setDegisiklikNotu(e.target.value); }} />
        {eksik.length > 0 && <ul className="tc-st-eksik">{eksik.map((e) => <li key={e}>{e}</li>)}</ul>}
        {hata && <p className="tc-st-hata" role="alert">{hata}</p>}
      </div>
    </Pencere>
  );
}

// Varsayılan değer türüne göre girilir; boş bırakılan değer null'dır (adımda ya da emirde girilir).
function VarsayilanGirdisi({ parametre: p, yaz }: { parametre: ParametreGirdisi; yaz: (d: ParametreDegeri) => void }) {
  const d = p.varsayilan;
  if (p.tur === 'evet') {
    return (
      <Secim etiket="Varsayılan" bosSecenek="Boş" secenekler={[{ deger: 'evet', baslik: 'Evet' }, { deger: 'hayir', baslik: 'Hayır' }]}
        value={d === true ? 'evet' : d === false ? 'hayir' : ''} onChange={(e) => { yaz(e.target.value === '' ? null : e.target.value === 'evet'); }} />
    );
  }
  if (p.tur === 'secim') {
    return (
      <Secim etiket="Varsayılan" bosSecenek="Boş" secenekler={(p.secenekler ?? []).map((s) => ({ deger: s, baslik: s }))} value={typeof d === 'string' ? d : ''}
        onChange={(e) => { yaz(e.target.value || null); }} />
    );
  }
  if (p.tur === 'metin') return <Girdi etiket="Varsayılan" maxLength={200} value={typeof d === 'string' ? d : ''} onChange={(e) => { yaz(e.target.value || null); }} />;
  if (p.tur === 'coklu') {
    return (
      <Girdi etiket="Varsayılan (virgülle)" value={Array.isArray(d) ? d.join(', ') : ''}
        onChange={(e) => { const l = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); yaz(l.length ? l : null); }} />
    );
  }
  if (p.tur === 'aralik') return <AralikGirdisi deger={Array.isArray(d) && typeof d[0] === 'number' ? d as [number, number] : null} yaz={yaz} />;
  return <SayiGirdisi etiket="Varsayılan" deger={typeof d === 'number' ? d : null} yaz={yaz} />;
}

function SayiGirdisi({ etiket, deger, yaz }: { etiket: string; deger: number | null; yaz: (n: number | null) => void }) {
  const [yerel, setYerel] = useState<string | null>(null);
  const metin = deger === null ? '' : String(deger).replace('.', ',');
  return (
    <Girdi etiket={etiket} inputMode="decimal" placeholder="boş" value={yerel ?? metin}
      hata={yerel !== null && sayiOku(yerel) === undefined ? 'Sayı girin.' : undefined}
      onChange={(e) => { setYerel(e.target.value); }}
      onBlur={() => { if (yerel !== null) { const n = sayiOku(yerel); if (n !== undefined) yaz(n); } setYerel(null); }} />
  );
}

// Aralık iki uçla birlikte girilir; biri boşsa değer boştur.
function AralikGirdisi({ deger, yaz }: { deger: [number, number] | null; yaz: (d: ParametreDegeri) => void }) {
  const [alt, setAlt] = useState<number | null>(deger?.[0] ?? null);
  const [ust, setUst] = useState<number | null>(deger?.[1] ?? null);
  const bildir = (a: number | null, u: number | null) => { yaz(a !== null && u !== null ? [a, u] : null); };
  return (
    <>
      <SayiGirdisi etiket="Varsayılan alt" deger={alt} yaz={(n) => { setAlt(n); bildir(n, ust); }} />
      <SayiGirdisi etiket="Varsayılan üst" deger={ust} yaz={(n) => { setUst(n); bildir(alt, n); }} />
    </>
  );
}
