import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { TaslakKomutu } from '#paylasilan/sozlesme/planlama.ts';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import { durusDenetle, girdiSaati, girdidenSaat, gunSirasi, gunTarihi } from '../ic/veri/kurallar.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { EtkiBolumu, useEtki } from './etki.tsx';
import { durusAdi, gunYazisi, kokpitEkMesaileri, mesaiButcesi, uygunOperatorler, vardiyaAdi, type KokpitEkMesaisi, type KokpitModeli } from './kurallar.ts';
import type { TaslakYazici } from './taslak.ts';

// Kokpit'in Duruş ve mesai bölümü (3282 2a-1, 2a-2): tezgâhın arıza ve bakım duruşları ile ek mesaisi. Elle girilen duruş kişinin taslağına komut olarak yazılır ve
// önce etkisiyle gösterilir (etki.tsx, Ayarlar paneliyle aynı akış). Arızadan ve bakım planından kendiliğinden gelen duruş burada silinmez
// (Risk 2a S3); sunucu da reddeder. Saatler planın ekseninde, çeyrek saat adımlıdır (motorun dilimi). Ek mesai vardiya dışı ek kapasitedir
// (3282-7 b): gün, vardiya ve o tezgâhı çalıştıracak operatör seçilir; listede yalnız o pencerede çalışabilen kişiler durur.

type Durus = { m: string; from: number; to: number; neden: string | null; oto: boolean; baslik?: string };
const ceyrek = (h: number): number => Math.round(h * 4) / 4;
const anahtar = (a: number, b: number, oto: boolean): string => `${String(a)}-${String(b)}-${oto ? 'o' : 'e'}`;
const MESAI_ETKISI = 'Ek mesainin etkisi';
const mesaiAnahtari = (gun: number, vardiya: string): string => `m-${String(gun)}-${vardiya}`;
const saatYazisi = (h: number): string => String(Math.round(h * 10) / 10);
// Vardiya ekranından gelen planlı duruş bir yıl boyunca tekrar tekrar gelir; yakını açık, ötesi tek düğmenin arkasında durur ki elle girilen
// ve arızadan gelen duruş aralarında kaybolmasın. Tek satır için düğme konmaz (düğme de bir satır yer tutar).
const YAKIN_SAAT = 28 * 24;

export function duruslar(c: PlanlamaCalismasi, tezgah: string, simdi: number): Durus[] {
  return c.down
    .filter((d) => String(d['m']) === tezgah && typeof d['from'] === 'number' && typeof d['to'] === 'number' && (d['to'] as number) > simdi)
    .map((d) => ({ m: tezgah, from: d['from'] as number, to: d['to'] as number, neden: typeof d['neden'] === 'string' ? d['neden'] : null, oto: Boolean(d['oto']), ...(typeof d['baslik'] === 'string' ? { baslik: d['baslik'] } : {}) }))
    .sort((a, b) => a.from - b.from);
}

export interface KapasiteOzellikleri {
  c: PlanlamaCalismasi;
  m: Pick<KokpitModeli, 'tezgahlar' | 'simdi'>;
  taslak: TaslakYazici | null;
  yazabilir: boolean;
  zaman: (t: number) => string;
  kapat: () => void;
  // Tahtada tezgâh adından "sorun bildir" ile gelinen tezgâh (3335 a); n her basışta artar, aynı tezgâha yeniden basınca da form öne gelir.
  istenen?: { tezgah: string; n: number } | null;
}

export function Kapasite({ c, m, taslak, yazabilir, zaman, kapat, istenen = null }: KapasiteOzellikleri) {
  const tezgahlar = m.tezgahlar.filter((t) => !t.fason);
  const [tezgah, setTezgah] = useState(() => (istenen && tezgahlar.some((t) => t.id === istenen.tezgah) ? istenen.tezgah : tezgahlar[0]?.id ?? ''));
  const [neden, setNeden] = useState<'arıza' | 'bakım'>('arıza');
  const ilk = Math.ceil(m.simdi);
  const [bas, setBas] = useState(() => girdiSaati(c.D, ilk));
  const [bit, setBit] = useState(() => girdiSaati(c.D, ilk + 8));
  const [hata, setHata] = useState<string | null>(null);
  const { durum, dene, uygula, vazgec } = useEtki({ c, taslak, sonuc: () => undefined });
  const [etkiAdi, setEtkiAdi] = useState('Duruşun etkisi');
  const kilitli = !yazabilir || taslak === null || taslak.mesgul || durum.tur === 'hesap' || durum.tur === 'etki';
  const kod = (id: string) => tezgahlar.find((t) => t.id === id)?.kod ?? id;
  const l = duruslar(c, tezgah, m.simdi);
  const sonrakiMi = (d: Durus): boolean => d.oto && d.neden === 'planlı duruş' && d.from >= m.simdi + YAKIN_SAAT;
  const sonraki = l.filter(sonrakiMi).length > 1 ? l.filter(sonrakiMi) : [];
  const yakin = sonraki.length === 0 ? l : l.filter((d) => !sonrakiMi(d));
  const [sonrakiAcik, setSonrakiAcik] = useState<string | null>(null);
  const bugun = Math.floor(m.simdi / 24);
  const vardiyaListesi = (c.D.vardiyalar ?? []).flatMap((v) => (v['id'] === undefined || v['id'] === null ? [] : [{ id: String(v['id']), ad: vardiyaAdi(c, String(v['id'])) }]));
  const kisiAdi = (id: string): string => (c.D.personel ?? []).find((p) => String(p.id) === id)?.ad ?? id;
  const mesailer = kokpitEkMesaileri(c).filter((x) => x.m === tezgah && x.gun >= bugun).sort((a, b) => a.gun - b.gun || a.vardiya.localeCompare(b.vardiya));
  const [mGun, setMGun] = useState(() => gunTarihi(c.D, bugun + 1));
  const [mVardiya, setMVardiya] = useState(vardiyaListesi[0]?.id ?? '');
  const [mKisi, setMKisi] = useState('');
  const gunNo = mGun ? gunSirasi(c.D, mGun) : null;
  const uygun = gunNo === null || mVardiya === '' ? { kisiler: [], neden: 'Gün ve vardiyayı seçin.' } : uygunOperatorler(c, { tezgah, gun: gunNo, vardiya: mVardiya });
  const butce = gunNo === null ? null : mesaiButcesi(c, gunNo);
  const kisi = uygun.kisiler.some((k) => k.id === mKisi) ? mKisi : uygun.kisiler[0]?.id ?? '';
  const mesaiEngeli = gunNo === null || mVardiya === '' ? 'Gün ve vardiyayı seçin.'
    : gunNo < bugun ? 'Geçmiş güne ek mesai eklenemez.'
    : kokpitEkMesaileri(c).some((x) => x.m === tezgah && x.gun === gunNo && x.vardiya === mVardiya) ? 'Bu tezgâhta o gün ve vardiyada ek mesai zaten var.'
    : butce !== null && butce.sinir !== null && butce.kullanilan + butce.vardiyaSaati(mVardiya) > butce.sinir + 1e-9 ? `Haftalık ek mesai bütçesi doldu (${saatYazisi(butce.kullanilan)} / ${saatYazisi(butce.sinir)} saat).`
    : uygun.neden;
  // Uygula'dan sonra odak ve kaydırma eklenen satıra gider (dar ekranda form listenin altındadır).
  const kok = useRef<HTMLElement>(null);
  const [odak, setOdak] = useState<string | null>(null);
  useEffect(() => {
    if (odak === null || durum.tur !== 'duzen') return;
    const li = kok.current?.querySelector<HTMLElement>(`[data-anahtar="${odak}"]`);
    if (!li) return;
    li.focus();
    li.scrollIntoView?.({ block: 'nearest' });
    setOdak(null);
  }, [odak, durum.tur, l]);

  // Etki gösterilirken tezgâh değişmez (bekleyen deneme o tezgâhındır); form açıkken tür alanı odağa gelir, bölümün başı (hangi tezgâh) görünür kalır. Yalnız yeni istekte çalışır:
  // bekleme durumu ve tezgâh listesi o andaki değeriyle okunur.
  const bekliyor = durum.tur === 'hesap' || durum.tur === 'etki';
  useEffect(() => {
    if (!istenen) return;
    if (!bekliyor && tezgahlar.some((t) => t.id === istenen.tezgah)) setTezgah(istenen.tezgah);
    kok.current?.querySelector<HTMLElement>('#tc-pyq-kap-neden')?.focus({ preventScroll: true });
    kok.current?.scrollIntoView?.({ block: 'start' });
  }, [istenen]);

  const ekle = (e: FormEvent) => {
    e.preventDefault();
    const a = girdidenSaat(c.D, bas), b = girdidenSaat(c.D, bit);
    const h = durusDenetle(a, b) ?? (b !== null && b <= m.simdi ? 'Bitiş şimdiden sonra olmalı.' : null);
    setHata(h);
    if (h !== null || a === null || b === null) return;
    setOdak(anahtar(ceyrek(a), ceyrek(b), false));
    setEtkiAdi('Duruşun etkisi');
    void dene({ tur: 'durus', tezgah, bas: ceyrek(a), bit: ceyrek(b), neden } satisfies TaslakKomutu);
  };
  const sil = (d: Durus) => { setOdak(null); setEtkiAdi('Duruşun etkisi'); void dene({ tur: 'durus-sil', tezgah: d.m, bas: d.from, bit: d.to } satisfies TaslakKomutu); };
  const mesaiEkle = (e: FormEvent) => {
    e.preventDefault();
    if (mesaiEngeli !== null || gunNo === null || kisi === '') return;
    setOdak(mesaiAnahtari(gunNo, mVardiya));
    setEtkiAdi(MESAI_ETKISI);
    void dene({ tur: 'ek-mesai', tezgah, gun: gunNo, vardiya: mVardiya, personel: kisi } satisfies TaslakKomutu);
  };
  const mesaiSil = (x: KokpitEkMesaisi) => { setOdak(null); setEtkiAdi(MESAI_ETKISI); void dene({ tur: 'ek-mesai-sil', tezgah: x.m, gun: x.gun, vardiya: x.vardiya } satisfies TaslakKomutu); };

  const mesaiEtkisi = etkiAdi === MESAI_ETKISI;
  const etkiBolumu = (e: Parameters<typeof uygula>[0]) => <EtkiBolumu ad={etkiAdi} e={e} uygula={() => { void uygula(e); }} vazgec={() => { setOdak(null); void vazgec(); }} />;

  const durusSatiri = (d: Durus) => (
    <li key={anahtar(d.from, d.to, d.oto)} data-anahtar={anahtar(d.from, d.to, d.oto)} tabIndex={-1} data-oto={d.oto ? '' : undefined}>
      <span><b>{durusAdi(d.neden, d.baslik)}</b> {zaman(d.from)} → {zaman(d.to)}{d.oto && <small>{d.neden === 'planlı duruş' ? ' · Vardiya ekranından geldi; orada değişir' : ' · kendiliğinden geldi'}</small>}</span>
      {!d.oto && yazabilir && (
        <button type="button" className="tc-pyq-simge-dugme" disabled={kilitli} aria-label={`${kod(d.m)} ${zaman(d.from)} → ${zaman(d.to)} duruşunu sil`} title="Duruşu sil" onClick={() => { sil(d); }}>
          <Simge ad="trash" boyut="k" />
        </button>
      )}
    </li>
  );

  return (
    <aside ref={kok} className="tc-pyq-ayrinti tc-pyq-ayarlar tc-pyq-kapasite" aria-label="Duruş ve mesai">
      <header>
        <div><b>Duruş ve mesai</b><small>Tezgâhın arıza, bakım ve vardiya duruşları, ek mesaisi.</small></div>
        <button type="button" className="tc-pyq-simge-dugme" aria-label="Duruş ve mesaiyi kapat" onClick={kapat}><Simge ad="x" boyut="k" /></button>
      </header>
      {!yazabilir && <p className="tc-pyq-not">Duruşu ve ek mesaiyi yalnız planı yazabilen kişi ekler ya da siler.</p>}
      <div className="tc-pyq-ayar-alan">
        <label htmlFor="tc-pyq-kap-tezgah">Tezgâh</label>
        <select id="tc-pyq-kap-tezgah" className="tc-alan-kutu" value={tezgah} disabled={durum.tur === 'hesap' || durum.tur === 'etki'} onChange={(ev) => { setTezgah(ev.target.value); }}>
          {tezgahlar.map((t) => <option key={t.id} value={t.id}>{t.ad ? `${t.kod} · ${t.ad}` : t.kod}</option>)}
        </select>
      </div>
      <h3>Duruşlar</h3>
      {l.length === 0 ? <p className="tc-pyq-not">{`${kod(tezgah)} için önümüzdeki duruş yok.`}</p> : (
        <ul className="tc-pyq-kap-liste">
          {yakin.length === 0 && <li className="tc-pyq-not">Önümüzdeki 4 haftada duruş yok.</li>}
          {yakin.map(durusSatiri)}
          {sonraki.length > 0 && (
            <li>
              <button type="button" className="tc-pyq-kucuk" aria-expanded={sonrakiAcik === tezgah} onClick={() => { setSonrakiAcik(sonrakiAcik === tezgah ? null : tezgah); }}>
                {`Daha sonraki ${String(sonraki.length)} duruşu ${sonrakiAcik === tezgah ? 'gizle' : 'göster'}`}
              </button>
            </li>
          )}
          {sonrakiAcik === tezgah && sonraki.map(durusSatiri)}
        </ul>
      )}
      {l.some((d) => d.oto) && <p className="tc-pyq-not">Arıza bildiriminden ya da bakım planından gelen duruş burada silinmez; kaynağında kapanınca kalkar.</p>}
      {durum.tur === 'etki' ? (!mesaiEtkisi && etkiBolumu(durum.e)) : yazabilir && (
        <form className="tc-pyq-ayar-etki" noValidate aria-label="Arıza ya da bakım ekle" onSubmit={ekle}>
          <div className="tc-pyq-ayar-alan">
            <label htmlFor="tc-pyq-kap-neden">Tür</label>
            <select id="tc-pyq-kap-neden" className="tc-alan-kutu" value={neden} disabled={kilitli} onChange={(ev) => { setNeden(ev.target.value === 'bakım' ? 'bakım' : 'arıza'); }}>
              <option value="arıza">Arıza</option><option value="bakım">Bakım</option>
            </select>
          </div>
          <div className="tc-pyq-ayar-alan">
            <label htmlFor="tc-pyq-kap-bas">Başlangıç</label>
            <input id="tc-pyq-kap-bas" className="tc-alan-kutu" type="datetime-local" step={900} value={bas} disabled={kilitli} onChange={(ev) => { setBas(ev.target.value); }} />
          </div>
          <div className="tc-pyq-ayar-alan">
            <label htmlFor="tc-pyq-kap-bit">Bitiş</label>
            <input id="tc-pyq-kap-bit" className="tc-alan-kutu" type="datetime-local" step={900} value={bit} disabled={kilitli} onChange={(ev) => { setBit(ev.target.value); }} />
          </div>
          {(hata ?? (durum.tur === 'hata' ? durum.ileti : null)) !== null && <p className="tc-pyq-ayar-hata" role="alert">{hata ?? (durum.tur === 'hata' ? durum.ileti : '')}</p>}
          <div className="tc-pyq-ayar-dugmeler">
            <Dugme type="submit" tur="ikincil" simge="plus" disabled={kilitli}>{durum.tur === 'hesap' ? 'Hesaplanıyor' : 'Duruş ekle, etkisini gör'}</Dugme>
          </div>
        </form>
      )}
      <h3>Ek mesai</h3>
      {mesailer.length === 0 ? <p className="tc-pyq-not">{`${kod(tezgah)} için önümüzdeki ek mesai yok.`}</p> : (
        <ul className="tc-pyq-kap-liste">
          {mesailer.map((x) => (
            <li key={mesaiAnahtari(x.gun, x.vardiya)} data-anahtar={mesaiAnahtari(x.gun, x.vardiya)} tabIndex={-1}>
              <span><b>{gunYazisi(x.gun, zaman)}</b> {vardiyaAdi(c, x.vardiya)}<small>{x.personel === null ? ' · operatör seçilmedi' : ` · ${kisiAdi(x.personel)}`}</small></span>
              {yazabilir && (
                <button type="button" className="tc-pyq-simge-dugme" disabled={kilitli} aria-label={`${kod(x.m)} ${gunYazisi(x.gun, zaman)} ${vardiyaAdi(c, x.vardiya)} ek mesaisini sil`} title="Ek mesaiyi sil" onClick={() => { mesaiSil(x); }}>
                  <Simge ad="trash" boyut="k" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {durum.tur === 'etki' ? (mesaiEtkisi && etkiBolumu(durum.e)) : yazabilir && (
        <form className="tc-pyq-ayar-etki" noValidate aria-label="Ek mesai ekle" onSubmit={mesaiEkle}>
          <div className="tc-pyq-ayar-alan">
            <label htmlFor="tc-pyq-mesai-gun">Gün</label>
            <input id="tc-pyq-mesai-gun" className="tc-alan-kutu" type="date" value={mGun} disabled={kilitli} onChange={(ev) => { setMGun(ev.target.value); }} />
          </div>
          <div className="tc-pyq-ayar-alan">
            <label htmlFor="tc-pyq-mesai-vardiya">Vardiya</label>
            <select id="tc-pyq-mesai-vardiya" className="tc-alan-kutu" value={mVardiya} disabled={kilitli} onChange={(ev) => { setMVardiya(ev.target.value); }}>
              {vardiyaListesi.map((v) => <option key={v.id} value={v.id}>{v.ad}</option>)}
            </select>
          </div>
          <div className="tc-pyq-ayar-alan">
            <label htmlFor="tc-pyq-mesai-kisi">Operatör</label>
            <select id="tc-pyq-mesai-kisi" className="tc-alan-kutu" value={kisi} disabled={kilitli || uygun.kisiler.length === 0} onChange={(ev) => { setMKisi(ev.target.value); }}>
              {uygun.kisiler.length === 0 ? <option value="">Uygun operatör yok</option> : uygun.kisiler.map((k) => <option key={k.id} value={k.id}>{k.ad}</option>)}
            </select>
          </div>
          {butce !== null && (
            <p className="tc-pyq-not">{butce.sinir === null ? `Bu hafta ek mesai: ${saatYazisi(butce.kullanilan)} saat (bütçe sınırsız).` : `Bu hafta ek mesai: ${saatYazisi(butce.kullanilan)} / ${saatYazisi(butce.sinir)} saat.`}</p>
          )}
          {mesaiEngeli !== null && <p className="tc-pyq-not" id="tc-pyq-mesai-neden">{mesaiEngeli}</p>}
          <div className="tc-pyq-ayar-dugmeler">
            <Dugme type="submit" tur="ikincil" simge="plus" disabled={kilitli || mesaiEngeli !== null} aria-describedby={mesaiEngeli !== null ? 'tc-pyq-mesai-neden' : undefined}>{durum.tur === 'hesap' ? 'Hesaplanıyor' : 'Ek mesai ekle, etkisini gör'}</Dugme>
          </div>
        </form>
      )}
    </aside>
  );
}

