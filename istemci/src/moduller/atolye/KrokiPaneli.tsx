import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Kroki } from '#paylasilan/sozlesme/atolye.ts';
import { MODEL_AZAMI_BAYT } from '#paylasilan/atolye-sabitleri.ts';
import { Dugme, DurumKutusu, IsaretKutusu, OnayPenceresi, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import type { Hizalama } from './kroki.ts';
import { dosyaAdindanAd, mbMetni } from './model-dosyasi.ts';
import { saatMetni } from './kurallar.ts';
import type { KrokiSayfasi } from './sahne/kroki-pdf.ts';
import { krokiDosyasi, krokiGonder, krokiMerkezden, krokiSil, useMerkezKrokileri } from './veri.ts';
import type { KrokiKapsami } from './veri.ts';

// Kroki paneli (düzenleyicide): PDF yükleme ve sayfa seçimi, görünüm (saydamlık, yapışma) ve hizalama adımları.
// Hizalama ve yükleme yerleşim kaydını beklemez, hemen saklanır; yerleşim yine "Kaydet" ile.

export type HizaAdimi = 'olcek' | 'yon' | 'kose' | 'salon' | 'tasi';

// Kâğıt ölçeği: 1 punto 0,3528 mm; metre/punto ölçek 1:N olarak gösterilir.
const PUNTO_METRE = 0.0254 / 72;
export const kagitOlcegi = (h: Hizalama): string => `1:${Math.round(h.olcek / PUNTO_METRE).toLocaleString('tr-TR')}`;

// Saklanan PDF bu cihazda okunur; sayfa görüntüsü ve çizgileri pdf.js ile (yalnız düzenleyicide iner).
export function useKrokiAltligi(kroki: Kroki | null | undefined): { sayfa: KrokiSayfasi | null; yukleniyor: boolean; hata: string | null } {
  const [durum, durumYaz] = useState<{ sayfa: KrokiSayfasi | null; yukleniyor: boolean; hata: string | null }>({ sayfa: null, yukleniyor: false, hata: null });
  const tamam = kroki?.tamam ? kroki : null;
  const anahtar = tamam ? `${tamam.salonId}:${tamam.ozet}:${tamam.sayfa}` : '';
  useEffect(() => {
    if (!tamam) { durumYaz({ sayfa: null, yukleniyor: false, hata: null }); return undefined; }
    let iptal = false;
    let url: string | null = null;
    durumYaz((d) => ({ ...d, yukleniyor: true, hata: null }));
    void (async () => {
      try {
        const [veri, { krokiSayfasiOku }] = await Promise.all([krokiDosyasi(tamam), import('./sahne/kroki-pdf.ts')]);
        const s = await krokiSayfasiOku(veri, tamam.sayfa);
        url = s.url;
        if (iptal) { URL.revokeObjectURL(s.url); return; }
        durumYaz({ sayfa: s, yukleniyor: false, hata: null });
      } catch (h) {
        if (!iptal) durumYaz({ sayfa: null, yukleniyor: false, hata: h instanceof Error ? h.message : 'Kroki okunamadı.' });
      }
    })();
    return () => { iptal = true; if (url) URL.revokeObjectURL(url); };
    // Anahtar krokinin dosyasını ve sayfasını söyler; nesne her sorguda yenilenir.
  }, [anahtar]);
  return durum;
}

interface Ozellikler {
  // null: fabrika krokisi (bölümler üstüne yerleşir); dolu: bölümün krokisi.
  kapsam: KrokiKapsami;
  kroki: Kroki | null | undefined;
  sayfa: KrokiSayfasi | null;
  yukleniyor: boolean;
  hata: string | null;
  hizalama: Hizalama | null;
  gorunur: boolean;
  gorunurYaz: (v: boolean) => void;
  saydamlik: number;
  saydamlikYaz: (v: number) => void;
  yapis: boolean;
  yapisYaz: (v: boolean) => void;
  adim: HizaAdimi | null;
  adimBaslat: (a: HizaAdimi | null) => void;
  dondur90: () => void;
  kapat: () => void;
}

type Secilen = { dosya: File; veri: Uint8Array; sayfaSayisi: number; sayfa: number } | null;

export function KrokiPaneli(o: Ozellikler) {
  const { kapsam, kroki, sayfa, hizalama } = o;
  const fabrika = kapsam === null;
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const girdi = useRef<HTMLInputElement>(null);
  const [secilen, secilenYaz] = useState<Secilen>(null);
  const [okunuyor, okunuyorYaz] = useState(false);
  const [ilerleme, ilerlemeYaz] = useState<number | null>(null);
  const [silOnayi, silOnayiYaz] = useState(false);
  // Çizim Merkezi seçicisi yalnız bölüm krokisinde: fabrika krokisi yerinde kalır.
  const [merkezAcik, merkezAcikYaz] = useState(false);
  const [merkezBelge, merkezBelgeYaz] = useState('');
  const [merkezIsleniyor, merkezIsleniyorYaz] = useState(false);
  const merkezSorgu = useMerkezKrokileri(merkezAcik);

  const yenile = () => void istemci.invalidateQueries({ queryKey: anahtarlar.kroki(kapsam) });

  const dosyaSecildi = async (dosya: File | undefined) => {
    if (!dosya) return;
    if (dosya.size > MODEL_AZAMI_BAYT) { bildir('hata', `Kroki ${mbMetni(dosya.size)}; sınır ${mbMetni(MODEL_AZAMI_BAYT)}.`); return; }
    okunuyorYaz(true);
    try {
      const veri = new Uint8Array(await dosya.arrayBuffer());
      const { pdfSayfaSayisi } = await import('./sahne/kroki-pdf.ts');
      const sayfaSayisi = await pdfSayfaSayisi(veri);
      secilenYaz({ dosya, veri, sayfaSayisi, sayfa: 1 });
    } catch {
      bildir('hata', 'Dosya PDF olarak okunamadı.');
    } finally {
      okunuyorYaz(false);
      if (girdi.current) girdi.current.value = '';
    }
  };

  const yukle = async () => {
    if (!secilen) return;
    ilerlemeYaz(0);
    try {
      await krokiGonder(kapsam, dosyaAdindanAd(secilen.dosya.name), secilen.sayfa, secilen.veri, ilerlemeYaz);
      bildir('tamam', 'Kroki yüklendi. Şimdi ölçeği ayarlayın.');
      secilenYaz(null);
      yenile();
      o.gorunurYaz(true);
      o.adimBaslat('olcek');
    } catch (hata) {
      bildir('hata', hataIletisi(hata, 'Kroki yüklenemedi.'));
    } finally {
      ilerlemeYaz(null);
    }
  };

  const merkezdenAl = async (belgeId: number, guncelleme: boolean) => {
    if (kapsam === null) return;
    merkezIsleniyorYaz(true);
    try {
      await krokiMerkezden(kapsam, belgeId);
      bildir('tamam', guncelleme ? 'Kroki güncellendi; hizalamayı kontrol edin.' : 'Kroki Çizim Merkezi\'nden alındı. Şimdi ölçeği ayarlayın.');
      merkezAcikYaz(false);
      merkezBelgeYaz('');
      yenile();
      o.gorunurYaz(true);
      if (!guncelleme) o.adimBaslat('olcek');
    } catch (hata) {
      bildir('hata', hataIletisi(hata, 'Kroki Çizim Merkezi\'nden alınamadı.'));
    } finally {
      merkezIsleniyorYaz(false);
    }
  };

  const kaldir = async () => {
    try {
      await krokiSil(kapsam);
      bildir('tamam', 'Kroki kaldırıldı.');
      yenile();
    } catch (hata) {
      bildir('hata', hataIletisi(hata, 'Kroki kaldırılamadı.'));
    } finally {
      silOnayiYaz(false);
    }
  };

  const tamam = kroki?.tamam ? kroki : null;
  const hizali = tamam?.hizalama !== null && tamam?.hizalama !== undefined;
  const ADIMLAR: { a: HizaAdimi; ad: string; ipucu: string }[] = [
    { a: 'olcek', ad: '1 · Ölçek', ipucu: 'Ölçüsünü bildiğiniz iki noktaya tıklayın, gerçek uzunluğu girin.' },
    { a: 'yon', ad: '2 · Yön', ipucu: 'Bir duvarın iki ucuna tıklayın; duvar eksene oturur (isteğe bağlı).' },
    ...(fabrika ? [
      { a: 'kose' as const, ad: '3 · Bölüm köşesi', ipucu: 'Bölümü seçin, krokide sol üst iç köşesine tıklayın; bölüm içindekilerle oraya taşınır (Kaydet ile).' },
      { a: 'salon' as const, ad: '4 · Bölüm ölçüsü', ipucu: 'Seçili bölümün sağ alt iç köşesine tıklayın; bölüm ölçüsü krokiden alınır (Kaydet ile).' },
    ] : [
      { a: 'kose' as const, ad: '3 · Köşe', ipucu: 'Bölümün sol üst iç köşesine tıklayın; kroki oraya oturur.' },
      { a: 'salon' as const, ad: '4 · Bölüm ölçüsü', ipucu: 'Bölümün sağ alt iç köşesine tıklayın; bölüm ölçüsü krokiden alınır (Kaydet ile).' },
    ]),
  ];

  const merkezBelgeleri = merkezSorgu.data?.belgeler ?? [];
  const merkezSecici = merkezAcik && (
    <section className="tc-atolye-palet-grup" aria-label="Çizim Merkezi'nden seç">
      {merkezSorgu.isPending ? <DurumKutusu durum="yukleniyor" mesaj="Çizimler okunuyor" />
        : merkezSorgu.isError ? <p className="tc-atolye-hata">{hataIletisi(merkezSorgu.error, 'Çizimler okunamadı.')}</p>
        : merkezBelgeleri.length === 0 ? <p className="tc-atolye-ipucu">Çizim Merkezi'nde yayında kroki yok.</p>
        : (
          <Secim
            etiket="Çizim"
            secenekler={[{ deger: '', baslik: 'Seçin' }, ...merkezBelgeleri.map((b) => ({ deger: String(b.id), baslik: `${b.ad} · Rev ${b.harf}` }))]}
            value={merkezBelge}
            onChange={(e) => merkezBelgeYaz(e.target.value)}
          />
        )}
      <div className="tc-atolye-kart-eylem">
        <Dugme tur="birincil" simge="check" disabled={merkezBelge === ''} yukleniyor={merkezIsleniyor} onClick={() => { void merkezdenAl(Number(merkezBelge), false); }}>Al</Dugme>
        <Dugme onClick={() => { merkezAcikYaz(false); merkezBelgeYaz(''); }} disabled={merkezIsleniyor}>Vazgeç</Dugme>
      </div>
      {tamam && <p className="tc-atolye-ipucu">Alınınca mevcut krokinin ve hizalamasının yerini alır.</p>}
    </section>
  );
  const merkezDugmesi = !fabrika && !merkezAcik && (
    <Dugme simge="fit" onClick={() => merkezAcikYaz(true)}>Çizim Merkezi'nden</Dugme>
  );

  return (
    <aside className="tc-atolye-palet tc-atolye-kroki-panel" aria-label="Kroki">
      <div className="tc-atolye-palet-ust">
        <strong>{fabrika ? 'Fabrika krokisi' : 'Bölüm krokisi'}</strong>
        <Dugme simge="x" aria-label="Kroki panelini kapat" onClick={o.kapat} />
      </div>

      <input
        ref={girdi}
        type="file"
        accept="application/pdf,.pdf"
        className="tc-atolye-gizli"
        aria-label="Kroki PDF dosyası"
        onChange={(e) => { void dosyaSecildi(e.target.files?.[0]); }}
      />

      {secilen ? (
        <section className="tc-atolye-palet-grup" aria-label="Seçilen dosya">
          <p className="tc-atolye-ipucu"><b>{secilen.dosya.name}</b> · {mbMetni(secilen.veri.length)} · {secilen.sayfaSayisi} sayfa</p>
          {secilen.sayfaSayisi > 1 && (
            <Secim
              etiket="Sayfa"
              secenekler={Array.from({ length: secilen.sayfaSayisi }, (_, i) => ({ deger: String(i + 1), baslik: `Sayfa ${i + 1}` }))}
              value={String(secilen.sayfa)}
              onChange={(e) => secilenYaz({ ...secilen, sayfa: Number(e.target.value) })}
            />
          )}
          {ilerleme !== null && <progress className="tc-atolye-ilerleme" value={ilerleme} max={1} aria-label="Yükleme" />}
          <div className="tc-atolye-kart-eylem">
            <Dugme tur="birincil" simge="upload" yukleniyor={ilerleme !== null} onClick={() => { void yukle(); }}>Yükle</Dugme>
            <Dugme onClick={() => secilenYaz(null)} disabled={ilerleme !== null}>Vazgeç</Dugme>
          </div>
          {tamam && <p className="tc-atolye-ipucu">Yüklenince mevcut krokinin ve hizalamasının yerini alır.</p>}
        </section>
      ) : !tamam ? (
        <section className="tc-atolye-palet-grup">
          <p className="tc-atolye-ipucu">{fabrika
            ? 'Fabrikanın vaziyet planını (PDF) yükleyin; bölümleri gerçek ölçüyle üstüne yerleştirirsiniz. Bölümün ayrıntılı krokisi bölüm düzenlenirken yüklenir.'
            : 'Bölümün mimari planını (PDF) yükleyin; yerleşimin altında gerçek ölçüyle görünür, makine ve rafları üstüne çizerek yerleştirirsiniz.'}</p>
          <Dugme tur="birincil" simge="upload" yukleniyor={okunuyor} onClick={() => girdi.current?.click()}>PDF kroki seç</Dugme>
          {merkezDugmesi}
          {merkezSecici}
          {kroki && !kroki.tamam && <p className="tc-atolye-ipucu">Önceki yükleme yarım kalmış; yeniden yükleyin.</p>}
        </section>
      ) : (
        <>
          <section className="tc-atolye-palet-grup" aria-label="Kroki dosyası">
            <p className="tc-atolye-ipucu">
              <b>{tamam.ad}</b> · sayfa {tamam.sayfa} · {mbMetni(tamam.boyutBayt)}
              <br />{tamam.kaydeden.ad ?? 'Bilinmeyen kişi'} · {saatMetni(tamam.kaydedildi) ?? ''}
            </p>
            {tamam.merkez && (
              <p className="tc-atolye-ipucu">Çizim Merkezi · {tamam.merkez.ad} · Rev {tamam.merkez.harf}</p>
            )}
            {tamam.merkez && tamam.merkez.ozet !== tamam.ozet && (
              <div className="tc-atolye-kart-eylem">
                <p className="tc-atolye-hata">Çizim Merkezi'nde yeni revizyon var.</p>
                <Dugme simge="download" yukleniyor={merkezIsleniyor} onClick={() => { if (tamam.merkez) void merkezdenAl(tamam.merkez.belgeId, true); }}>Güncelle</Dugme>
              </div>
            )}
            {o.yukleniyor && <DurumKutusu durum="yukleniyor" mesaj="Kroki okunuyor" />}
            {o.hata && <p className="tc-atolye-hata">{o.hata}</p>}
            <div className="tc-atolye-kart-eylem">
              <Dugme simge="upload" yukleniyor={okunuyor} onClick={() => girdi.current?.click()}>Değiştir</Dugme>
              {merkezDugmesi}
              <Dugme simge="trash" onClick={() => silOnayiYaz(true)}>Kaldır</Dugme>
            </div>
            {merkezSecici}
          </section>

          <section className="tc-atolye-palet-grup" aria-label="Görünüm">
            <h4>Görünüm</h4>
            <IsaretKutusu etiket="Krokiyi göster" checked={o.gorunur} onChange={(e) => o.gorunurYaz(e.target.checked)} />
            <label className="tc-atolye-kaydirac">
              <span>Saydamlık %{Math.round(o.saydamlik * 100)}</span>
              <input type="range" min={10} max={100} step={5} value={Math.round(o.saydamlik * 100)} onChange={(e) => o.saydamlikYaz(Number(e.target.value) / 100)} />
            </label>
            <IsaretKutusu etiket="Krokinin çizgilerine yapış" checked={o.yapis} onChange={(e) => o.yapisYaz(e.target.checked)} />
            {sayfa && sayfa.cizgiler.length === 0 && <p className="tc-atolye-ipucu">Bu PDF'te çizgi yok (taranmış görüntü): yapışma çalışmaz, ölçek yine iki noktayla ayarlanır.</p>}
          </section>

          <section className="tc-atolye-palet-grup" aria-label="Hizalama">
            <h4>Hizalama</h4>
            <p className="tc-atolye-ipucu">
              {hizali && hizalama
                ? <>Ölçek <b className="mono">{kagitOlcegi(hizalama)}</b> · dönüş <b className="mono">{hizalama.donus.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}°</b></>
                : `Hizalanmadı: kroki geçici olarak ${fabrika ? 'fabrikaya' : 'bölüme'} sığdırıldı. Adımları sırayla yapın.`}
            </p>
            <div className="tc-atolye-kroki-adimlar">
              {ADIMLAR.map((s) => (
                <Dugme key={s.a} aria-pressed={o.adim === s.a} disabled={!sayfa} title={s.ipucu} onClick={() => o.adimBaslat(o.adim === s.a ? null : s.a)}>{s.ad}</Dugme>
              ))}
            </div>
            <div className="tc-atolye-kart-eylem">
              <Dugme simge="rotate" disabled={!sayfa} onClick={o.dondur90}>90° döndür</Dugme>
              <Dugme simge="target" aria-pressed={o.adim === 'tasi'} disabled={!sayfa} onClick={() => o.adimBaslat(o.adim === 'tasi' ? null : 'tasi')}>Sürükle</Dugme>
            </div>
            <p className="tc-atolye-ipucu">Hizalama hemen saklanır; yerleşim değişiklikleri "Kaydet" ile.</p>
          </section>
        </>
      )}

      <OnayPenceresi
        acik={silOnayi}
        baslik="Kroki kaldırılsın mı?"
        onayMetni="Kaldır"
        tehlikeli
        onayla={() => { void kaldir(); }}
        vazgec={() => silOnayiYaz(false)}
      >
        <p>{fabrika ? 'Fabrika krokisi' : 'Bölümün krokisi'} ve hizalaması silinir; yerleşim değişmez.</p>
      </OnayPenceresi>
    </aside>
  );
}
