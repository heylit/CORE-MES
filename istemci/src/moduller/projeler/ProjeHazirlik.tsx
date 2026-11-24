import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HazirlikAtaGovdesi, KademeGecmisiCevabi, KisiSecenekleriCevabi, RolSecenekleriCevabi } from '#paylasilan/sozlesme/projeler.ts';
import type {
  HazirlikDagitCevabi, HazirlikDagitGovdesi, HazirlikGerekmezCevabi, HazirlikGerekmezGovdesi, HazirlikGerekmezKaldirGovdesi, HazirlikMatrisiCevabi,
} from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { CokSatir, Dugme, DurumKutusu, KademeRozeti, Rozet, Secim, Sekmeler, Simge, useBildirim, type RozetTonu, type Sekme } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { tarihMetni, zamanMetni } from '../../ortak/veri/zaman-metni.ts';
import { anahtarlar } from './anahtarlar.ts';
import { useIstekKimligi } from './komut.ts';
import './projeler.css';

// 3396 a, 3430 a: Proje > Görevler > Emir × madde. Satır emir ve iş emri, sütun görevi olan madde. Hücrede iki hâl: görevin hâli
// ve maddenin sistemdeki hâli. Görev bitse de durduran maddenin (kilitli sütun) iş emri, madde sahibi modülde tamam olmadan başlamaz;
// "Bitti" yalnız görevi söyler, "Hazır" yalnız sistemi. Durum renkle birlikte simge ve yazıyla söylenir.
type Gorev = HazirlikMatrisiCevabi['gorevler'][number];
type Gerekmez = HazirlikMatrisiCevabi['gerekmezler'][number];
type Atanan = NonNullable<Gorev['yapan']>;
type Hal = 'atanmamis' | 'yapiliyor' | 'kontrolde' | 'hazir';
type Suzgec = 'hepsi' | Hal | 'gecikmis';

export const gorevHali = (g: Gorev): Hal => (g.durum === 'bitti' ? 'hazir' : g.durum === 'kontrolde' ? 'kontrolde' : g.yapan === null ? 'atanmamis' : 'yapiliyor');
const gecikmis = (g: Gorev) => g.durum !== 'bitti' && (g.gecikmeGun ?? 0) > 0;
const HAL: Record<Hal, { ad: string; ton: RozetTonu; simge: SimgeAdi }> = {
  atanmamis: { ad: 'Atanmamış', ton: 'pasif', simge: 'help' },
  yapiliyor: { ad: 'Yapılıyor', ton: 'bilgi', simge: 'clock' },
  kontrolde: { ad: 'Kontrolde', ton: 'uyari', simge: 'eye' },
  hazir: { ad: 'Bitti', ton: 'tamam', simge: 'check' },
};
type SistemHali = NonNullable<Gorev['sistem']>;
const SISTEM: Record<SistemHali, { ad: string; ton: RozetTonu }> = {
  tamam: { ad: 'Hazır', ton: 'tamam' }, eksik: { ad: 'Eksik', ton: 'hata' }, muaf: { ad: 'Muaf', ton: 'bilgi' },
  gerekmez: { ad: 'Gerekmez', ton: 'pasif' }, bilinmiyor: { ad: 'Bilinmiyor', ton: 'pasif' },
};
// Görev bitti ama madde sistemde eksik: kullanıcıyı yanıltan tek durum, hücre ve üstteki uyarı bunu ayrıca gösterir.
export const celiskili = (g: Gorev): boolean => g.durum === 'bitti' && g.sistem === 'eksik';
const sistemMetni = (g: Gorev) => (g.sistem === null ? 'Sistem hâli yok' : `Sistem: ${SISTEM[g.sistem].ad}`);
function SistemRozeti({ g }: { g: Gorev }) {
  if (g.sistem === null) return null;
  return <Rozet ton={SISTEM[g.sistem].ton}>{`Sistem: ${SISTEM[g.sistem].ad}`}</Rozet>;
}
const atananMetni = (a: Atanan | null) => (a === null ? 'Atanmamış' : a.tur === 'rol' ? `${a.ad} (rol · ${String(a.kisiSayisi)} kişi)` : a.ad);

export function ProjeHazirlik({ projeId }: { projeId: number }) {
  const [suzgec, suzgecYaz] = useState<Suzgec>('hepsi');
  const [secili, seciliYaz] = useState<number | null>(null);
  // 3642: işaretle iptal olan görev listede yoktur; işaretli (emir, madde) hücresi kendi seçimiyle açılır.
  const [seciliGerekmez, seciliGerekmezYaz] = useState<string | null>(null);
  // Görevi henüz açılmamış (dağıtılmamış) hücre için ön işaret: hücre dokunulunca gerekçe formu açılır.
  const [onIsaret, onIsaretYaz] = useState<{ emriId: number; madde: string } | null>(null);
  const d = useHazirlikMatrisi(projeId);
  if (d.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(d.error, 'Emir görevleri alınamadı')} yenile={() => { void d.refetch(); }} />;
  const v = d.data;
  if (!v) return <DurumKutusu durum="yukleniyor" />;
  const sayi = (s: Suzgec) => v.gorevler.filter((g) => s === 'hepsi' || (s === 'gecikmis' ? gecikmis(g) : gorevHali(g) === s)).length;
  const sekmeler: Sekme<Suzgec>[] = (['hepsi', 'atanmamis', 'gecikmis', 'yapiliyor', 'kontrolde', 'hazir'] as const).map((s) => ({
    anahtar: s, baslik: s === 'hepsi' ? 'Hepsi' : s === 'gecikmis' ? 'Gecikmiş' : HAL[s].ad, sayi: sayi(s),
  }));
  const gorunur = (g: Gorev) => suzgec === 'hepsi' || (suzgec === 'gecikmis' ? gecikmis(g) : gorevHali(g) === suzgec);
  const bul = (madde: string, emriId: number, isEmriId: number | null) =>
    v.gorevler.find((g) => g.madde === madde && g.emriId === emriId && (g.isEmriId ?? null) === isEmriId) ?? null;
  const emirAdi = (emriId: number) => v.emirler.find((e) => e.id === emriId)?.emirNo ?? '';
  const opAdi = (g: Gorev) => {
    const ie = v.emirler.find((e) => e.id === g.emriId)?.isEmirleri.find((i) => i.id === g.isEmriId);
    return ie === undefined ? 'emir geneli' : `OP${String(ie.opNo)}`;
  };
  const maddeAdi = (kod: string) => v.maddeler.find((m) => m.kod === kod)?.ad ?? kod;
  const secilen = v.gorevler.find((g) => g.id === secili) ?? null;
  const gerekmezAnahtari = (x: { emriId: number; madde: string }) => `${String(x.emriId)}:${x.madde}`;
  const gerekmezBul = (emriId: number, madde: string) => v.gerekmezler.find((x) => x.emriId === emriId && x.madde === madde) ?? null;
  const secilenGerekmez = v.gerekmezler.find((x) => gerekmezAnahtari(x) === seciliGerekmez) ?? null;
  const gorevSec = (id: number) => { seciliGerekmezYaz(null); onIsaretYaz(null); seciliYaz((o) => (o === id ? null : id)); };
  const gerekmezSec = (x: Gerekmez) => { seciliYaz(null); onIsaretYaz(null); seciliGerekmezYaz((o) => (o === gerekmezAnahtari(x) ? null : gerekmezAnahtari(x))); };

  const hucre = (g: Gorev | null, etiket: string, emriId: number, madde: string) => {
    const gm = g === null ? gerekmezBul(emriId, madde) : null;
    if (gm !== null && suzgec === 'hepsi') {
      const ad = `${etiket}: bu emirde gerekmez`;
      return (
        <span className="tc-prj-hz-ikili">
          <button type="button" className="tc-prj-hz-hucre" data-hal="gerekmez" aria-pressed={seciliGerekmez === gerekmezAnahtari(gm)} aria-label={ad} title={ad} onClick={() => { gerekmezSec(gm); }}>
            <Rozet ton="pasif"><Simge ad="minus" boyut="k" />Gerekmez</Rozet>
          </button>
        </span>
      );
    }
    if (g === null && gm === null && suzgec === 'hepsi' && v.gerekmezYazar && !(v.maddeler.find((m) => m.kod === madde)?.durduran ?? true) && (v.emirler.find((e) => e.id === emriId)?.acik ?? false)) {
      const ad = `${etiket}: görev yok; bu emirde gerekmez diye işaretlenebilir`;
      return (
        <button type="button" className="tc-prj-hz-yok tc-prj-hz-on" aria-label={ad} title={ad} aria-pressed={onIsaret?.emriId === emriId && onIsaret.madde === madde}
          onClick={() => { seciliYaz(null); seciliGerekmezYaz(null); onIsaretYaz((o) => (o?.emriId === emriId && o.madde === madde ? null : { emriId, madde })); }}>–</button>
      );
    }
    if (g === null || !gorunur(g)) return <span className="tc-prj-hz-yok" aria-label={`${etiket}: görev yok`}>–</span>;
    const hal = gorevHali(g);
    const gec = gecikmis(g);
    const ad = `${etiket}: görev ${HAL[hal].ad}${g.yapan ? `, ${atananMetni(g.yapan)}` : ''}${gec ? `, ${String(g.gecikmeGun)} gün gecikti` : ''}; ${sistemMetni(g)}`;
    return (
      <span className="tc-prj-hz-ikili">
        <button
          type="button" className="tc-prj-hz-hucre" data-hal={hal} data-gecikmis={gec || undefined} aria-pressed={secili === g.id} aria-label={ad} title={ad}
          onClick={() => { gorevSec(g.id); }}
        >
          <Rozet ton={HAL[hal].ton}><Simge ad={HAL[hal].simge} boyut="k" />{`Görev: ${HAL[hal].ad}`}</Rozet>
          <SistemRozeti g={g} />
          {g.yapan !== null && <span className="tc-prj-hz-kim">{gec ? <><Simge ad="alert" boyut="k" />{`${String(g.gecikmeGun)} gün gecikti · `}</> : null}{g.yapan.ad}</span>}
        </button>
      </span>
    );
  };
  const hucreSinifi = (g: Gorev | null, ortak: boolean) =>
    [ortak ? 'tc-prj-hz-ortak' : '', g !== null && celiskili(g) ? 'tc-prj-hz-celiski' : ''].filter(Boolean).join(' ') || undefined;
  const celiskiler = v.gorevler.filter(celiskili);

  return (
      <div className="tc-prj-icerik">
        <Sekmeler etiket="Emir görevi durumu" sekmeler={sekmeler} secili={suzgec} sec={suzgecYaz} />
        {celiskiler.length > 0 && (
          <p className="tc-prj-hz-uyari" role="status">
            <Simge ad="alert" boyut="k" />
            {`${String(celiskiler.length)} hücrede görev bitti ama madde sistemde hâlâ eksik: `}
            {celiskiler.slice(0, 3).map((g) => `${emirAdi(g.emriId)} ${opAdi(g)} · ${maddeAdi(g.madde)}`).join(', ')}
            {celiskiler.length > 3 ? ' …' : ''}
          </p>
        )}
        <p className="tc-prj-soluk">
          <Simge ad="lock" boyut="k" /> Kilitli sütun durduran maddedir: görev bitse de iş emri, madde sahibi modülde tamam olmadan başlamaz. Hücrede
          &quot;Görev&quot; görevin hâli, &quot;Sistem&quot; maddenin sistemdeki hâlidir. Hücreye dokununca ayrıntı açılır.
        </p>
        {v.gorevler.length === 0 && v.gerekmezler.length === 0 ? (
          <DurumKutusu durum="bos" mesaj={v.emirler.length === 0 ? 'Projede üretim emri yok' : 'Emir görevi yok: şablondaki "Her üretim emri için" görevleri Görevleri dağıt ile açılır'} />
        ) : (
          <>
            <div className="tc-prj-hz-sarmal">
              <table className="tc-prj-hz-matris">
                <caption className="tc-gizli-etiket">Emir görevleri</caption>
                <thead>
                  <tr>
                    <th scope="col">Emir / iş emri</th>
                    {v.maddeler.map((m) => (
                      <th key={m.kod} scope="col" title={m.durduran ? `${m.ad}: durduran madde` : m.ad}>
                        <span className="tc-prj-hz-sutun">{m.kisa}{m.durduran && <Simge ad="lock" boyut="k" />}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {v.emirler.map((e) => (
                    <Fragment key={e.id}>
                      <tr className="tc-prj-hz-grup"><th scope="rowgroup" colSpan={v.maddeler.length + 1}>{`${e.emirNo} · ${e.parcaNo} · ${String(e.adet)} adet`}</th></tr>
                      {(e.isEmirleri.length === 0 ? [null] : e.isEmirleri).map((ie, i) => (
                        <tr key={ie?.id ?? 'emir'}>
                          <th scope="row">{ie === null ? 'Emir geneli' : `OP${String(ie.opNo)} ${ie.ad}`}</th>
                          {v.maddeler.map((m) => (m.isEmriDuzeyi && ie !== null
                            ? <td key={m.kod} className={hucreSinifi(bul(m.kod, e.id, ie.id), false)}>{hucre(bul(m.kod, e.id, ie.id), `${e.emirNo} OP${String(ie.opNo)} ${m.ad}`, e.id, m.kod)}</td>
                            : i === 0 ? <td key={m.kod} rowSpan={Math.max(1, e.isEmirleri.length)} className={hucreSinifi(bul(m.kod, e.id, null), true)}>{hucre(bul(m.kod, e.id, null), `${e.emirNo} ${m.ad}`, e.id, m.kod)}</td>
                              : <Fragment key={m.kod} />))}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="tc-prj-hz-liste" aria-label="Emir görevleri">
              {v.gorevler.filter(gorunur).map((g) => (
                <li key={`${String(g.id)}:${String(g.isEmriId ?? 0)}`} data-gecikmis={gecikmis(g) || undefined} data-celiski={celiskili(g) || undefined}>
                  <button type="button" className="tc-prj-hz-kart" aria-pressed={secili === g.id} onClick={() => { gorevSec(g.id); }}>
                    <b>{`${emirAdi(g.emriId)} ${opAdi(g)} · ${maddeAdi(g.madde)}`}</b>
                    <span className="tc-prj-bag">
                      <Rozet ton={HAL[gorevHali(g)].ton}><Simge ad={HAL[gorevHali(g)].simge} boyut="k" />{`Görev: ${HAL[gorevHali(g)].ad}`}</Rozet>
                      <SistemRozeti g={g} />
                      <span>{atananMetni(g.yapan)}</span>
                      {gecikmis(g) && <Rozet ton="hata">{`${String(g.gecikmeGun)} gün gecikti`}</Rozet>}
                    </span>
                  </button>
                </li>
              ))}
              {suzgec === 'hepsi' && v.gerekmezler.map((x) => (
                <li key={`gm:${gerekmezAnahtari(x)}`}>
                  <button type="button" className="tc-prj-hz-kart" aria-pressed={seciliGerekmez === gerekmezAnahtari(x)} onClick={() => { gerekmezSec(x); }}>
                    <b>{`${emirAdi(x.emriId)} · ${maddeAdi(x.madde)}`}</b>
                    <span className="tc-prj-bag"><Rozet ton="pasif"><Simge ad="minus" boyut="k" />Bu emirde gerekmez</Rozet></span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {onIsaret !== null && (
          <section className="tc-prj-hz-panel" aria-label="Ön işaret">
            <div className="tc-prj-bag">
              <b>{`${emirAdi(onIsaret.emriId)} · ${maddeAdi(onIsaret.madde)}`}</b>
              <Rozet ton="pasif">Görev henüz açılmadı</Rozet>
              <Dugme simge="x" onClick={() => { onIsaretYaz(null); }}>Kapat</Dugme>
            </div>
            <GerekmezFormu emriId={onIsaret.emriId} madde={onIsaret.madde} durum={null} projeId={projeId} bitti={() => { onIsaretYaz(null); }} />
          </section>
        )}
        {secilenGerekmez !== null && (
          <GerekmezPaneli
            kayit={secilenGerekmez} baslik={`${emirAdi(secilenGerekmez.emriId)} · ${maddeAdi(secilenGerekmez.madde)}`}
            yazar={v.gerekmezYazar} projeId={projeId} kapat={() => { seciliGerekmezYaz(null); }}
          />
        )}
        {secilen !== null && (
          <GorevPaneli
            gorev={secilen} baslik={`${emirAdi(secilen.emriId)} ${opAdi(secilen)} · ${maddeAdi(secilen.madde)}`}
            durduran={v.maddeler.find((m) => m.kod === secilen.madde)?.durduran ?? false}
            atar={v.dagitir} gerekmezYazar={v.gerekmezYazar} projeId={projeId} kapat={() => { seciliYaz(null); }}
          />
        )}
      </div>
  );
}

export function useHazirlikMatrisi(projeId: number, acik = true) {
  return useQuery({
    queryKey: anahtarlar.hazirlik(projeId),
    queryFn: () => api.get<HazirlikMatrisiCevabi>(`/hazirlik-matrisi?projeId=${String(projeId)}`),
    enabled: acik,
  });
}

// 3642: kontrolde ya da bitmiş görev işaretle değişmez; durduran madde işaretlenemez (sunucu da reddeder).
const GEREKMEZ_ACIK_DURUMLAR = new Set(['yapilacak', 'suruyor', 'bekliyor']);
function GorevPaneli({ gorev, baslik, durduran, atar, gerekmezYazar, projeId, kapat }: {
  gorev: Gorev; baslik: string; durduran: boolean; atar: boolean; gerekmezYazar: boolean; projeId: number; kapat: () => void;
}) {
  const hal = gorevHali(gorev);
  const [ata, ataYaz] = useState(false);
  const [gerekmez, gerekmezYaz] = useState(false);
  const acikDurum = GEREKMEZ_ACIK_DURUMLAR.has(gorev.durum);
  const isaretlenebilir = gerekmezYazar && !durduran && acikDurum;
  const isaretNedeni = !gerekmezYazar ? null : durduran ? 'Durduran madde (CNC, çizim, yayın) bu emirde gerekmez diye işaretlenemez.' : acikDurum ? null : 'Kontrolde ya da biten görev işaretlenemez.';
  const atanabilir = atar && (hal === 'atanmamis' || hal === 'yapiliyor');
  return (
    <section className="tc-prj-hz-panel" aria-label="Görev ayrıntısı">
      <div className="tc-prj-bag">
        <b>{baslik}</b>
        <Rozet ton={HAL[hal].ton}><Simge ad={HAL[hal].simge} boyut="k" />{`Görev: ${HAL[hal].ad}`}</Rozet>
        <SistemRozeti g={gorev} />
        {gecikmis(gorev) && <Rozet ton="hata">{`${String(gorev.gecikmeGun)} gün gecikti`}</Rozet>}
        {atanabilir && !ata && <Dugme simge="users" onClick={() => { ataYaz(true); }}>{hal === 'atanmamis' ? 'Ata' : 'Değiştir'}</Dugme>}
        {isaretlenebilir && !gerekmez && <Dugme simge="minus" onClick={() => { gerekmezYaz(true); }}>Bu emirde gerekmez</Dugme>}
        <Dugme simge="x" onClick={kapat}>Kapat</Dugme>
      </div>
      <dl className="tc-prj-hz-bilgi">
        <dt>Görev</dt><dd>{gorev.ad}</dd>
        <dt>Yapan</dt><dd>{atananMetni(gorev.yapan)}</dd>
        <dt>Kontrol eden</dt><dd>{gorev.kontrol === null ? 'Yok' : atananMetni(gorev.kontrol)}</dd>
        <dt>Son gün</dt><dd className="tc-prj-tarih">{tarihMetni(gorev.planBitis)}</dd>
      </dl>
      {durduran && <p className="tc-prj-soluk">Durduran madde: görev bitse de iş emri, madde sahibi modülde tamam olmadan başlamaz.</p>}
      {ata && <AtaFormu gorev={gorev} projeId={projeId} bitti={() => { ataYaz(false); }} />}
      {isaretNedeni !== null && <p className="tc-prj-soluk" role="note"><Simge ad="lock" boyut="k" />{` ${isaretNedeni}`}</p>}
      {gerekmez && <GerekmezFormu emriId={gorev.emriId} madde={gorev.madde} durum={gorev.durum} projeId={projeId} bitti={() => { gerekmezYaz(false); }} />}
      {gorev.kademe !== null && <KademeGecmisi gorevId={gorev.id} />}
    </section>
  );
}

// 3642: "Bu emirde gerekmez": gerekçe zorunludur; görev iptal olur (silinmez), emrin bu maddesi için dağıtım yeniden açmaz. İşaret emrin bütün
// iş emirleri için geçerlidir; kontrolde ya da bitmiş görev varsa sunucu reddeder.
function GerekmezFormu({ emriId, madde, durum, projeId, bitti }: { emriId: number; madde: string; durum: string | null; projeId: number; bitti: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const istek = useIstekKimligi();
  const [gerekce, gerekceYaz] = useState('');
  const komut = useMutation({
    mutationFn: () => api.post<HazirlikGerekmezCevabi>(
      `/adimli-emirler/${String(emriId)}/hazirlik-gerekmez`, { madde, gerekce: gerekce.trim() } satisfies HazirlikGerekmezGovdesi, { istekKimligi: istek.al() },
    ),
    onSuccess: async (c) => {
      bildir('tamam', c.iptalEdilen > 0 ? 'Bu emirde gerekmez diye işaretlendi; görev iptal edildi.' : 'Bu emirde gerekmez diye işaretlendi.');
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      bitti();
    },
    onError: istek.hataSonrasi,
  });
  return (
    <form className="tc-prj-hz-ata" onSubmit={(o) => { o.preventDefault(); if (gerekce.trim() !== '') komut.mutate(); }}>
      <p className="tc-prj-soluk" role="note">
        {durum === null ? 'Bu madde için görev henüz açılmadı; işaret konunca dağıtım bu emirde görev açmaz. ' : durum === 'yapilacak' ? 'Görev henüz başlamadı; işaretlenirse iptal olur. ' : 'Görev sürüyor; işaretlenirse iptal olur. '}
        Görev silinmez: gerekçe, işaretleyen ve zaman kayıtlı kalır. İşaret bu emrin bütün iş emirleri (operasyonları) için geçerlidir.
      </p>
      <CokSatir etiket="Gerekçe" value={gerekce} maxLength={450} required onChange={(e) => { gerekceYaz(e.target.value); }} />
      <span className="tc-prj-bag">
        <Dugme onClick={bitti} disabled={komut.isPending}>Vazgeç</Dugme>
        <Dugme tur="birincil" type="submit" yukleniyor={komut.isPending} disabled={gerekce.trim() === ''}>Gerekmez olarak işaretle</Dugme>
      </span>
      {komut.isError && <p className="tc-prj-hata" role="alert">{hataIletisi(komut.error, 'İşaret konamadı')}</p>}
    </form>
  );
}

function GerekmezPaneli({ kayit, baslik, yazar, projeId, kapat }: { kayit: Gerekmez; baslik: string; yazar: boolean; projeId: number; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const istek = useIstekKimligi();
  const komut = useMutation({
    mutationFn: () => api.post<HazirlikGerekmezCevabi>(
      `/adimli-emirler/${String(kayit.emriId)}/hazirlik-gerekmez-kaldir`, { madde: kayit.madde } satisfies HazirlikGerekmezKaldirGovdesi, { istekKimligi: istek.al() },
    ),
    onSuccess: async () => {
      bildir('tamam', 'İşaret kaldırıldı. İptal edilen görev geri gelmez; "Görevleri dağıt" bu emir için yeni görev açar.');
      await istemci.invalidateQueries({ queryKey: anahtarlar.hazirlik(projeId) });
      kapat();
    },
    onError: istek.hataSonrasi,
  });
  return (
    <section className="tc-prj-hz-panel" aria-label="Gerekmez ayrıntısı">
      <div className="tc-prj-bag">
        <b>{baslik}</b>
        <Rozet ton="pasif"><Simge ad="minus" boyut="k" />Bu emirde gerekmez</Rozet>
        {yazar && <Dugme simge="rotate" yukleniyor={komut.isPending} onClick={() => { komut.mutate(); }}>İşareti kaldır</Dugme>}
        <Dugme simge="x" onClick={kapat}>Kapat</Dugme>
      </div>
      <dl className="tc-prj-hz-bilgi">
        <dt>Gerekçe</dt><dd>{kayit.gerekce}</dd>
        <dt>İşaretleyen</dt><dd>{kayit.kisiAdi ?? 'Bilinmiyor'}</dd>
        <dt>Zaman</dt><dd className="tc-prj-tarih">{zamanMetni(kayit.an)}</dd>
      </dl>
      <p className="tc-prj-soluk">İşaret bu emrin bütün iş emirleri (operasyonları) için geçerlidir. Görev iptal edildi (silinmedi) ve işaret sürdükçe yeniden açılmaz; emrin hazırlık görünümünde madde &quot;Gerekmez&quot; sayılır. İşareti kaldırırsanız iptal edilen görev geri gelmez: &quot;Görevleri dağıt&quot; bu emir için yeni görev açar.</p>
      {komut.isError && <p className="tc-prj-hata" role="alert">{hataIletisi(komut.error, 'İşaret kaldırılamadı')}</p>}
    </section>
  );
}

// 3396 a: hücre panelinde görevin kademe geçmişi; atlanan kademe "bildirilmedi" diye görünür.
function KademeGecmisi({ gorevId }: { gorevId: number }) {
  const d = useQuery({ queryKey: anahtarlar.kademeler(gorevId), queryFn: () => api.get<KademeGecmisiCevabi>(`/projeler/gorevler/${String(gorevId)}/kademeler`) });
  if (d.isError) return <p className="tc-prj-hata" role="alert">{hataIletisi(d.error, 'Kademe geçmişi alınamadı')}</p>;
  if (!d.data) return null;
  return (
    <ol className="tc-prj-hz-kademe" aria-label="Kademe geçmişi">
      {d.data.kademeler.map((k) => (
        <li key={k.kademe}>
          <KademeRozeti kademe={k.kademe} />
          <span className="tc-prj-tarih">{zamanMetni(k.an)}</span>
          <span className="tc-prj-soluk">{k.bildirildi ? `${String(k.aliciSayisi)} kişiye bildirildi` : 'Atlandı, üst kademe bildirildi'}</span>
        </li>
      ))}
    </ol>
  );
}

function AtaFormu({ gorev, projeId, bitti }: { gorev: Gorev; projeId: number; bitti: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const kisiler = useQuery({ queryKey: anahtarlar.sorumlular, queryFn: () => api.get<KisiSecenekleriCevabi>('/projeler/sorumlu-secenekleri') });
  const roller = useQuery({ queryKey: anahtarlar.roller, queryFn: () => api.get<RolSecenekleriCevabi>('/projeler/rol-secenekleri') });
  const ilk = gorev.yapan === null ? '' : `${gorev.yapan.tur}:${String(gorev.yapan.id)}`;
  const [secim, secimYaz] = useState(ilk);
  const komut = useMutation({
    mutationFn: () => {
      const [tur, id] = secim.split(':');
      const govde: HazirlikAtaGovdesi = { sorumluKisiId: tur === 'kisi' ? Number(id) : null, yapanRolId: tur === 'rol' ? Number(id) : null, surum: gorev.surum };
      return api.post(`/projeler/gorevler/${String(gorev.id)}/hazirlik-ata`, govde);
    },
    onSuccess: async () => {
      bildir('tamam', 'Görev atandı; yeni yapana bildirim gitti.');
      await istemci.invalidateQueries({ queryKey: anahtarlar.hazirlik(projeId) });
      bitti();
    },
  });
  const secenekler = [
    ...(kisiler.data?.kisiler ?? []).map((k) => ({ deger: `kisi:${String(k.id)}`, baslik: `Kişi: ${k.ad}` })),
    ...(roller.data?.roller ?? []).map((r) => ({ deger: `rol:${String(r.id)}`, baslik: `Rol: ${r.ad}` })),
  ];
  return (
    <form className="tc-prj-hz-ata" onSubmit={(o) => { o.preventDefault(); if (secim !== '') komut.mutate(); }}>
      <Secim etiket="Yapan" value={secim} bosSecenek="Rol ya da kişi seçin" secenekler={secenekler} onChange={(e) => { secimYaz(e.target.value); }} />
      <span className="tc-prj-bag">
        <Dugme onClick={bitti} disabled={komut.isPending}>Vazgeç</Dugme>
        <Dugme tur="birincil" type="submit" yukleniyor={komut.isPending} disabled={secim === '' || secim === ilk}>Ata</Dugme>
      </span>
      {komut.isError && <p className="tc-prj-hata" role="alert">{hataIletisi(komut.error, 'Görev atanamadı')}</p>}
    </form>
  );
}

// Dağıtılmış şablonda sonradan açılan madde, şablona sonradan eklenen emir başına satır ya da emir açılırken kapalı olan madde
// projedeki emirlerde görev doğurmaz; bunlar Görevleri dağıt ekranından toplu açılır. Önce deneme, eksik yoksa görünmez.
export function EksikEmirGorevleri({ projeId, sablonId }: { projeId: number; sablonId: number }) {
  const istemci = useQueryClient();
  const istek = useIstekKimligi();
  const { bildir } = useBildirim();
  const matris = useHazirlikMatrisi(projeId).data;
  const acabilir = matris !== undefined && matris.dagitir && matris.emirler.some((e) => e.acik);
  const govde = (deneme: boolean): HazirlikDagitGovdesi => ({ projeId, sablonId, deneme });
  const deneme = useQuery({
    queryKey: ['projeler', 'hazirlik-deneme', projeId, sablonId],
    queryFn: () => api.post<HazirlikDagitCevabi>('/hazirlik-matrisi/dagit', govde(true), { istekKimligi: yeniIstekKimligi() }),
    enabled: acabilir,
  });
  const komut = useMutation({
    mutationFn: () => api.post<HazirlikDagitCevabi>('/hazirlik-matrisi/dagit', govde(false), { istekKimligi: istek.al() }),
    onSuccess: async (c) => {
      bildir('tamam', `${String(c.eklenen)} emir görevi açıldı.`);
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
    },
    onError: istek.hataSonrasi,
  });
  const d = deneme.data;
  if (!acabilir || d === undefined || d.gorevSayisi === 0) return null;
  return (
    <div className="tc-prj-dagit-serit" role="note">
      <span>{`Projedeki emirlerde açılmamış ${String(d.gorevSayisi)} emir görevi var (sonradan açılan madde ya da şablona sonradan eklenen satır). Açınca atananlara bildirim gider.`}</span>
      <Dugme simge="users" yukleniyor={komut.isPending} onClick={() => { komut.mutate(); }}>Eksik emir görevlerini aç</Dugme>
      {komut.isError && <p className="tc-prj-hata" role="alert">{hataIletisi(komut.error, 'Görevler açılamadı')}</p>}
    </div>
  );
}
