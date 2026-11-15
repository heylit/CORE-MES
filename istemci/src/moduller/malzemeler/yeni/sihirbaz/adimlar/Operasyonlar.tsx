import { useEffect, useRef, useState } from 'react';
import { Dugme, OnayPenceresi, Pencere, Rozet, Secim, Simge } from '../../../../../ortak/arayuz/index.ts';
import * as K from '../../kurallar/index.ts';
import * as S from '../../sabitler/index.ts';
import { sablonOnerisi, useKartRotasi, useRotaliUrunler, useRotaSablonlari, type SecilebilirSablon } from '../../veri.ts';
import { useSihirbaz } from '../baglam.ts';
import { RECETE_KAYNAGI, receteKaynagi } from '../durum.ts';
import { KatalogSimgesi } from '../../ortak/KatalogSimgesi.tsx';
import { BagDugmesi, Uyari } from '../parcalar.tsx';
import type { RotaAdimi } from '../../kurallar/index.ts';
import { RotaOzeti } from './TicariAdimi.tsx';

// Prototipte `opsHTML` + rotalı kart eki (233 a): rotası olan kartın operasyonları salt okunur; düzenleme Reçete ve Rota'dadır.
export function Operasyonlar() {
  const { taslak: d } = useSihirbaz();
  const rotali = useKartRotasi(d.id ?? null);
  if (rotali === true) return <RotaliKart />;
  return <RotaDuzenleyici />;
}

function RotaliKart() {
  const { taslak: d, git } = useSihirbaz();
  const ops = d.ops ?? [];
  return (
    <>
      <Uyari>
        <b>Bu kartın rotası var.</b> Operasyonlar Reçete ve Rota'da düzenlenir; burada yalnız görünür.{' '}
        <Dugme simge="expand" onClick={() => { git.disari('urun-rotalari'); }}>Reçete ve Rota'da düzenle</Dugme>
      </Uyari>
      {ops.length ? (
        <div className="tc-my-tablo">
          <table>
            <thead><tr><th>No</th><th>Kod</th><th>Operasyon</th></tr></thead>
            <tbody>{ops.map((o) => <tr key={`${String(o.no)}-${o.kod}`}><td>{o.no}</td><td>{o.kod}</td><td>{o.ad}</td></tr>)}</tbody>
          </table>
        </div>
      ) : <p className="tc-my-bos">Kartta operasyon yok.</p>}
    </>
  );
}

function RotaDuzenleyici() {
  const { taslak: d, b, yetki, degistir, bildir, git } = useSihirbaz();
  const [ara, araYaz] = useState('');
  // 3273 a (D): rotası boş kartta önce tam genişlikte seçici; "Boş başla" bugünkü iki sütunu (katalog ve rota) açar.
  const [bos, bosYaz] = useState(false);
  const araKutusu = useRef<HTMLInputElement>(null);
  useEffect(() => { if (bos) araKutusu.current?.focus(); }, [bos]);
  const [grupSec, grupSecYaz] = useState<string | null>(null);
  const [yeni, yeniYaz] = useState(-1);
  const liste = K.opListe(b);
  const gruplar = K.opGruplar(b).filter((g) => liste.some((o) => o.grup === g.kod));
  const grup = grupSec && gruplar.some((g) => g.kod === grupSec) ? grupSec : gruplar[0]?.kod ?? null;
  const q = K.nm(ara, b);
  const secilebilir = q ? liste.filter((o) => K.nm(`${o.kod} ${o.ad}`, b).includes(q)) : liste.filter((o) => o.grup === grup);
  const sayac: Record<string, number> = {};
  (d.ops ?? []).forEach((o) => { const k = K.opKod(o, b); sayac[k] = (sayac[k] ?? 0) + 1; });
  const rt = K.rota(d, b);
  const noSay: Record<string, number> = {};
  rt.forEach((r) => { noSay[String(r.no)] = (noSay[String(r.no)] ?? 0) + 1; });

  const ekle = (kod: string) => {
    const od = K.opBul(kod, b);
    if (!od) return;
    const t0 = { ...d, ops: [...(d.ops ?? [])].map((o) => ({ ...o })) };
    K.opNoDuzenle(t0, b);
    const no = K.opSonrakiNo(t0, b) as number;
    yeniYaz(t0.ops.length);
    degistir((t) => {
      t.ops = t.ops ?? [];
      K.opNoDuzenle(t, b);
      t.ops.push({ no: K.opSonrakiNo(t, b) as number, kod: od.kod, ad: od.ad });
    });
    bildir(`${String(no)} ${od.kod} ${od.ad} rotaya eklendi.`);
  };
  const tasi = (i: number, j: number) => {
    if (j < 0 || j >= (d.ops ?? []).length) return;
    degistir((t) => {
      K.opNoDuzenle(t, b);
      const a = t.ops[i];
      const c = t.ops[j];
      if (!a || !c) return;
      [a.no, c.no] = [c.no, a.no];
      K.opSirala(t, b);
    });
    yeniYaz(j);
  };
  const kodSecenekleri = (r: RotaAdimi) => (
    <>
      {!r.tanimli && <option value={r.kod}>{r.kod || 'Seç'}</option>}
      {gruplar.map((g) => (
        <optgroup key={g.kod} label={g.ad}>
          {liste.filter((o) => o.grup === g.kod).map((o) => <option key={o.kod} value={o.kod}>{o.kod}</option>)}
        </optgroup>
      ))}
    </>
  );

  if (yetki.yaz && !(d.ops ?? []).length && !bos && !receteKaynagi(d)) {
    return (
      <>
        <SablonSecici bosBasla={() => { bosYaz(true); }} />
        <RotaOzeti />
      </>
    );
  }
  return (
    <>
      <div className="tc-my-ops">
        <aside className="tc-my-ops-sec" aria-label="Operasyon seçimi">
          <div className="tc-my-ops-ust"><b>Operasyon ekle</b><small>Dokun, rotanın sonuna eklensin</small></div>
          <span className="tc-my-girdi">
            <input ref={araKutusu} type="search" aria-label="Operasyon ara" value={ara} autoComplete="off" placeholder="Ara: TRN, freze, boya, BM…" onChange={(e) => { araYaz(e.target.value); }} />
          </span>
          <div className="tc-my-ops-govde">
            <div className="tc-my-ops-turler">
              {gruplar.map((g) => (
                <button key={g.kod} type="button" className="tc-my-ops-tur" aria-pressed={!ara && g.kod === grup} onClick={() => { grupSecYaz(g.kod); araYaz(''); }}>
                  <KatalogSimgesi yol={S.OPT_ICON[S.OP_TUR_IKON[g.kod] ?? 'wrench'] ?? S.OPT_ICON.wrench} />
                  <span>{g.ad}</span>
                  <small>{liste.filter((o) => o.grup === g.kod).length}</small>
                </button>
              ))}
            </div>
            <div className="tc-my-ops-liste">
              {secilebilir.length ? secilebilir.map((o) => (
                <button key={o.kod} type="button" className="tc-my-ops-oge" title={o.aciklama || (q ? K.opGrupAd(o.grup, b) : '')} onClick={() => { ekle(o.kod); }}>
                  <b>{o.kod}</b><span>{o.ad}</span>
                  {sayac[o.kod] ? <em title={`Rotada ${String(sayac[o.kod])} kez`}>×{sayac[o.kod]}</em> : <Simge ad="plus" />}
                </button>
              )) : <p className="tc-my-kucuk">Eşleşen operasyon yok.</p>}
            </div>
          </div>
          <p className="tc-my-kucuk">
            Kısaltma, ad ve türleri <BagDugmesi tikla={() => { git.disari('operasyon-tipleri'); }}>İstasyonlar &gt; Operasyon tipleri</BagDugmesi> sayfasında belirlenir.
          </p>
        </aside>
        <section className="tc-my-ops-rota" aria-label="Rota">
          <div className="tc-my-ops-ust"><b>Rota</b><small>{(d.ops ?? []).length ? `${String((d.ops ?? []).length)} operasyon` : 'henüz operasyon yok'}</small></div>
          <UrundenAl />
          <SablonDegistir />
          {(d.ops ?? []).length ? (
            <>
              <div className="tc-my-tablo">
                <table>
                  <thead><tr><th className="tc-my-sayi">No</th><th>Kod</th><th>Operasyon</th><th><span className="tc-my-gizli">Sıra</span></th></tr></thead>
                  <tbody>
                    {rt.map((r, i) => (
                      <tr key={`${String(i)}-${r.kod}`} className={i === yeni ? 'tc-my-yeni' : undefined}>
                        <td className="tc-my-sayi">
                          <OpNo deger={r.no} cift={(noSay[String(r.no)] ?? 0) > 1} yaz={(n) => {
                            degistir((t) => { const o = t.ops[i]; if (o) { o.no = n; K.opSirala(t, b); } });
                          }}
                          />
                        </td>
                        <td>
                          <select
                            className={r.tanimli ? 'tc-my-opkod' : 'tc-my-opkod tc-my-bilinmez'} aria-label="Operasyon kodu" value={r.kod}
                            onChange={(e) => {
                              const v = e.target.value;
                              degistir((t) => { const o = t.ops[i]; if (!o) return; o.kod = v; const td = K.opBul(v, b); if (td) o.ad = td.ad; });
                            }}
                          >{kodSecenekleri(r)}
                          </select>
                        </td>
                        <td><span className="tc-my-opad">{r.ad}</span>{r.grupAdi && <small className="tc-my-soluk">{r.grupAdi}</small>}</td>
                        <td className="tc-my-sira">
                          <button type="button" className="tc-my-sifirla" aria-label="Yukarı taşı" disabled={!i} onClick={() => { tasi(i, i - 1); }}>↑</button>
                          <button type="button" className="tc-my-sifirla" aria-label="Aşağı taşı" disabled={i >= rt.length - 1} onClick={() => { tasi(i, i + 1); }}>↓</button>
                          <button type="button" className="tc-my-sifirla" aria-label="Sil" onClick={() => { degistir((t) => { t.ops.splice(i, 1); }); }}><Simge ad="x" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="tc-my-ops-numara">
                <span className="tc-my-kucuk">Numara 10'ar artar; aradaki bir operasyon için ör. 15 yazabilirsin, satırlar numaraya göre sıralanır.</span>
                <Dugme onClick={() => {
                  degistir((t) => { K.opSirala(t, b); t.ops.forEach((o, k) => { o.no = (k + 1) * 10; }); });
                  bildir('Operasyonlar 10, 20, 30 … diye yeniden numaralandı.');
                }}
                >10'ar yeniden numarala
                </Dugme>
              </div>
            </>
          ) : (
            <div className="tc-my-ops-bos"><b>Rota boş</b><span>Operasyon listesinden sırasıyla seç ya da şablondan doldur. Numaralar 10, 20, 30 diye verilir.</span></div>
          )}
        </section>
      </div>
      <RotaOzeti />
    </>
  );
}

// Numara alanı değişince (odak çıkınca) uygulanır; 0 ve harf yok sayılır.
function OpNo({ deger, cift, yaz }: { deger: number | string; cift: boolean; yaz: (n: number) => void }) {
  const [metin, metinYaz] = useState<string | null>(null);
  const uygula = () => {
    if (metin === null) return;
    const n = parseInt(metin.replace(/\D/g, ''), 10);
    if (n > 0) yaz(n);
    metinYaz(null);
  };
  return (
    <input
      className={cift ? 'tc-my-opno tc-my-bilinmez' : 'tc-my-opno'} inputMode="numeric" aria-label="Operasyon numarası"
      title={cift ? 'Bu numara birden fazla kez kullanılıyor' : undefined} value={metin ?? String(deger)}
      onChange={(e) => { metinYaz(e.target.value); }} onBlur={uygula} onKeyDown={(e) => { if (e.key === 'Enter') uygula(); }}
    />
  );
}

// Rota şablonları Rota modülündedir; kart yalnız kopyasını alır. Dolu rotayı değiştirmeden önce sorulur. 3273 a (D): Reçete ve Rota'daki
// seçicinin aynısı: kartın adıyla eşleşen iki şablon kartı ("Başla", "İçine bak"), benzer ürün, bütün şablonlar ve boş başlama.
// Kullanımdan kalkan şablon listelenmez. Çipin rengi operasyon grubundandır (kartta istasyon yoktur); kod her zaman yazılır.
const sozcukler = (m: string): Set<string> => new Set(m.toLocaleUpperCase('tr-TR').split(/[^0-9A-ZÇĞİÖŞÜ]+/).filter((x) => x.length >= 3));
const grupRengi = (grup: string | undefined): string => {
  if (!grup) return 'tc-my-opcip-yok';
  let n = 0;
  for (const c of grup) n = (n * 31 + c.charCodeAt(0)) % 6;
  return `tc-my-opcip-${String(n)}`;
};
function OpSeridi({ s, etiket }: { s: SecilebilirSablon; etiket: string }) {
  const { b } = useSihirbaz();
  return (
    <span className="tc-my-opseridi" role="list" aria-label={etiket}>
      {s.adimlar.map((a, i) => <span key={`${String(i)}-${a.kod}`} role="listitem"><span className={`tc-my-opcip ${grupRengi(K.opBul(a.kod, b)?.grup)}`}>{a.kod}</span></span>)}
    </span>
  );
}
const kullanimMetni = (s: SecilebilirSablon): string => (s.kullanim > 0 ? `${String(s.kullanim)} kez kullanıldı` : 'henüz kullanılmadı');

function useSablonUygula() {
  const { taslak: d, degistir, bildir } = useSihirbaz();
  const [soru, soruYaz] = useState<SecilebilirSablon | null>(null);
  const dolu = (d.ops ?? []).length > 0;
  const doldur = (s: SecilebilirSablon) => {
    degistir((t) => { t.ops = s.adimlar.map((a, i) => ({ no: (i + 1) * 10, kod: a.kod, ad: a.ad })); });
    bildir(`${s.ad}: ${String(s.adimlar.length)} operasyon rotaya yazıldı.`);
    soruYaz(null);
  };
  const uygula = (s: SecilebilirSablon | undefined) => { if (!s) return; if (dolu) soruYaz(s); else doldur(s); };
  const onay = (
    <OnayPenceresi acik={soru !== null} baslik="Rota değişsin mi?" onayMetni="Şablonla değiştir" tehlikeli onayla={() => { if (soru) doldur(soru); }} vazgec={() => { soruYaz(null); }}>
      <p>Karttaki {(d.ops ?? []).length} operasyon silinir, yerine "{soru?.ad}" şablonunun adımları yazılır.</p>
    </OnayPenceresi>
  );
  return { dolu, uygula, onay };
}

function AdimOnizlemesi({ s }: { s: SecilebilirSablon }) {
  const { b } = useSihirbaz();
  return (
    <ol className="tc-my-sb-adimlar" aria-label={`${s.ad} adımları`}>
      {s.adimlar.map((a, i) => {
        const od = K.opBul(a.kod, b);
        return (
          <li key={`${String(i)}-${a.kod}`}>
            <span className="tc-my-opno">{`OP ${String((i + 1) * 10)}`}</span>
            <span className={`tc-my-opcip ${grupRengi(od?.grup)}`}>{a.kod}</span>
            <span className="tc-my-opad">{a.ad}<small className="tc-my-soluk">{od ? K.opGrupAd(od.grup, b) : 'katalogda yok'}</small></span>
          </li>
        );
      })}
    </ol>
  );
}

function SablonGalerisi({ acik, kapat }: { acik: boolean; kapat: () => void }) {
  const { taslak: d, b } = useSihirbaz();
  const sablonlar = useRotaSablonlari();
  const { dolu, uygula, onay } = useSablonUygula();
  const [secili, seciliYaz] = useState<number | null>(null);
  const liste = sablonOnerisi(sablonlar.data ?? [], String(K.finalAd(d, b)), Number.MAX_SAFE_INTEGER);
  const s = liste.find((x) => x.sablon.id === secili)?.sablon ?? liste[0]?.sablon;
  return (
    <>
      <Pencere acik={acik} kapat={kapat} baslik="Bütün şablonlar" alt={(
        <>
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="play" disabled={!s} onClick={() => { uygula(s); if (!dolu) kapat(); }}>{dolu ? 'Şablonla değiştir' : 'Başla'}</Dugme>
        </>
      )}
      >
        <div className="tc-my-sb-liste" role="radiogroup" aria-label="Şablonlar">
          {liste.map((x) => (
            <button key={x.sablon.id} type="button" role="radio" aria-checked={s?.id === x.sablon.id} className="tc-my-sb-satir" onClick={() => { seciliYaz(x.sablon.id); }}>
              <b>{x.sablon.ad}</b>
              <OpSeridi s={x.sablon} etiket={`${x.sablon.ad} operasyonları`} />
              <small className="tc-my-soluk">{`${x.neden} · ${String(x.sablon.adimlar.length)} adım`}</small>
            </button>
          ))}
        </div>
        {s && <AdimOnizlemesi s={s} />}
      </Pencere>
      {onay}
    </>
  );
}

function SablonSecici({ bosBasla }: { bosBasla: () => void }) {
  const { taslak: d, b, kartlar, degistir, bildir, git } = useSihirbaz();
  const sablonlar = useRotaSablonlari();
  const uygun = d.tur === 'mamul' || d.tur === 'yarimamul';
  const urunler = useRotaliUrunler(uygun);
  const { uygula, onay } = useSablonUygula();
  const [bak, bakYaz] = useState<number | null>(null);
  const [galeri, galeriYaz] = useState(false);
  const [baska, baskaYaz] = useState(false);
  const [kaynak, kaynakYaz] = useState<string | null>(null);
  const l = sablonlar.data ?? [];
  // Ad kaydedilirken üretilen addır (elle yazılmadıysa parça adı ve tipinden).
  const kartAdi = String(K.finalAd(d, b));
  const oneri = sablonOnerisi(l, kartAdi);
  // Benzer ürün: rotası olan ürünlerden adı kartın adıyla en çok ortak sözcük taşıyan (3 harften kısa sözcük sayılmaz).
  const kendi = d.id ? kartlar.find((k) => k.kimlik === d.id)?.no : undefined;
  const ad = sozcukler(kartAdi);
  const rotalilar = uygun ? (urunler.data ?? []).filter((u) => u.no !== kendi) : [];
  const benzer = rotalilar.map((u) => ({ u, n: [...sozcukler(u.ad)].filter((x) => ad.has(x)).length })).filter((x) => x.n > 0)
    .sort((a, c) => c.n - a.n || (a.u.kod ?? '').localeCompare(c.u.kod ?? '', 'tr'))[0]?.u ?? null;
  const secilen = rotalilar.find((u) => String(u.no) === kaynak) ?? benzer ?? rotalilar[0] ?? null;
  const urunAdi = (u: { kod: string | null; ad: string }) => (u.kod ? `${u.kod} · ${u.ad}` : u.ad);
  const bakilan = oneri.find((o) => o.sablon.id === bak)?.sablon ?? null;
  return (
    <div className="tc-my-sb" role="group" aria-label="Rota şablonları">
      <div className="tc-my-kutu tc-my-sb-kutu">
        <div className="tc-my-sb-baslik">
          <h4>Bu ürünün rotası yok. Nasıl başlayalım?</h4>
          {oneri.length > 0 && <small className="tc-my-soluk">Ürün adına göre önerildi</small>}
        </div>
        {sablonlar.isPending && <span className="tc-my-kucuk">Rota şablonları yükleniyor…</span>}
        {sablonlar.isError && (
          <span className="tc-my-kucuk" role="status">Rota şablonları okunamadı. Benzer ürün ve boş başlama yine kullanılabilir.{' '}
            <Dugme simge="rotate" onClick={() => { void sablonlar.refetch(); }}>Yeniden dene</Dugme>
          </span>
        )}
        {sablonlar.isSuccess && !l.length && (
          <span className="tc-my-kucuk">Kayıtlı rota şablonu yok. <BagDugmesi tikla={() => { git.disari('rota-sablonlari'); }}>Rota şablonları</BagDugmesi></span>
        )}
        <div className="tc-my-sb-kartlar">
          {oneri.map((o) => (
            <div key={o.sablon.id} className={`tc-my-sb-kart${bak === o.sablon.id ? ' tc-my-sb-secili' : ''}`} role="group" aria-label={`${o.sablon.ad} şablonu`}>
              <span className="tc-my-sb-ad">
                <b>{o.sablon.ad}</b>
                <span title={o.neden}><Rozet ton="tamam">önerilen</Rozet></span>
                {o.sablon.varsayilan && <Rozet ton="pasif" gorunum="cizgi">varsayılan</Rozet>}
              </span>
              <OpSeridi s={o.sablon} etiket={`${o.sablon.ad} operasyonları`} />
              <span className="tc-my-kucuk">{`${String(o.sablon.adimlar.length)} adım · ${kullanimMetni(o.sablon)}`}</span>
              <span className="tc-my-ops-sablon">
                <Dugme tur="birincil" simge="play" onClick={() => { uygula(o.sablon); }}>Başla</Dugme>
                <Dugme simge="eye" aria-pressed={bak === o.sablon.id} onClick={() => { bakYaz(bak === o.sablon.id ? null : o.sablon.id); }}>İçine bak</Dugme>
              </span>
            </div>
          ))}
          {secilen && (
            <div className="tc-my-sb-kart" role="group" aria-label="Benzer ürün">
              <span className="tc-my-sb-ad">
                <Simge ad="layers" /> <b className="tc-my-opno">{secilen.kod ?? secilen.ad}</b>
                {benzer && secilen.no === benzer.no && <Rozet ton="pasif" gorunum="cizgi">benzer ürün</Rozet>}
              </span>
              <span className="tc-my-kucuk">{secilen.ad} · yürürlükteki rota; kart kaydedilince Reçete ve Rota'da taslak açılır</span>
              {baska && (
                <Secim etiket="Başka ürün" value={String(secilen.no)} onChange={(e) => { kaynakYaz(e.target.value); }}
                  secenekler={rotalilar.map((u) => ({ deger: String(u.no), baslik: urunAdi(u) }))} />
              )}
              <span className="tc-my-ops-sablon">
                <Dugme tur="birincil" simge="layers" onClick={() => {
                  degistir((t) => { t[RECETE_KAYNAGI] = { no: secilen.no, ad: urunAdi(secilen) }; });
                  bildir(`${urunAdi(secilen)}: reçete ve rota kart kaydedilince Reçete ve Rota'da taslak olarak açılacak.`);
                }}
                >Kopyala
                </Dugme>
                <Dugme simge="down" aria-expanded={baska} onClick={() => { baskaYaz(!baska); }}>Başka ürün</Dugme>
              </span>
            </div>
          )}
        </div>
        <span className="tc-my-ops-sablon">
          {l.length > 0 && <Dugme simge="grid" onClick={() => { galeriYaz(true); }}>{`Bütün şablonlar (${String(l.length)})`}</Dugme>}
          <Dugme simge="plus" onClick={bosBasla}>Boş başla</Dugme>
        </span>
      </div>
      {bakilan && (
        <section className="tc-my-kutu tc-my-sb-icine" aria-label={`İçine bak: ${bakilan.ad}`}>
          <div className="tc-my-sb-baslik">
            <h4>{`İçine bak: ${bakilan.ad}`}</h4>
            <small className="tc-my-soluk">{`${String(bakilan.adimlar.length)} adım · ${kullanimMetni(bakilan)}`}</small>
          </div>
          <p className="tc-my-kucuk">"Başla" adımları kartın operasyonlarına yazar; kart kaydedilince Reçete ve Rota'da taslak rota bunlarla açılır.</p>
          <AdimOnizlemesi s={bakilan} />
        </section>
      )}
      <SablonGalerisi acik={galeri} kapat={() => { galeriYaz(false); }} />
      {onay}
    </div>
  );
}

// Dolu ya da boş başlanmış rotada şablon yalnız bütün şablonlar penceresinden gelir; dolu rota değişmeden önce sorulur.
function SablonDegistir() {
  const { taslak: d, yetki } = useSihirbaz();
  const sablonlar = useRotaSablonlari();
  const [galeri, galeriYaz] = useState(false);
  const l = sablonlar.data ?? [];
  if (!yetki.yaz || !l.length) return null;
  const dolu = (d.ops ?? []).length > 0;
  return (
    <div className="tc-my-ops-sablon">
      <Dugme simge="grid" onClick={() => { galeriYaz(true); }}>{dolu ? `Şablonla değiştir (${String(l.length)})` : `Bütün şablonlar (${String(l.length)})`}</Dugme>
      <SablonGalerisi acik={galeri} kapat={() => { galeriYaz(false); }} />
    </div>
  );
}

// Var olan ürünün reçete ve rotası (306 a, 307 b): kopya kartta değil Reçete ve Rota'da taslak olarak açılır; seçilince karttaki
// operasyonlar rotaya aktarılmaz (Rota önce kaynaktan açar).
function UrundenAl() {
  const { taslak: d, yetki, kartlar, degistir, bildir } = useSihirbaz();
  const uygun = yetki.yaz && (d.tur === 'mamul' || d.tur === 'yarimamul');
  const urunler = useRotaliUrunler(uygun);
  const [secili, seciliYaz] = useState('');
  if (!uygun) return null;
  const kaynak = receteKaynagi(d);
  if (kaynak) {
    return (
      <Uyari>
        <b>Reçete ve rota {kaynak.ad} ürününden alınacak.</b> Kart kaydedilince Reçete ve Rota'da taslak olarak açılır; kart onaydaysa onaylanınca açılır.
        Karttaki operasyonlar rotaya aktarılmaz.{' '}
        <Dugme onClick={() => { degistir((t) => { delete t[RECETE_KAYNAGI]; }); }}>Vazgeç</Dugme>
      </Uyari>
    );
  }
  if (urunler.isPending) return <div className="tc-my-ops-sablon"><span className="tc-my-kucuk">Rotalı ürünler yükleniyor…</span></div>;
  const kendi = d.id ? kartlar.find((k) => k.kimlik === d.id)?.no : undefined;
  const l = (urunler.data ?? []).filter((u) => u.no !== kendi);
  if (!l.length) return <div className="tc-my-ops-sablon"><span className="tc-my-kucuk">{urunler.isError ? 'Rotalı ürünler okunamadı.' : 'Reçete ve rotası alınabilecek ürün yok.'}</span></div>;
  const sec = l.find((u) => String(u.no) === secili) ?? l[0];
  const ad = (u: typeof sec) => (u ? (u.kod ? `${u.kod} · ${u.ad}` : u.ad) : '');
  return (
    <div className="tc-my-ops-sablon">
      <Secim etiket="Reçete ve rotası alınacak ürün" value={sec ? String(sec.no) : ''} onChange={(e) => { seciliYaz(e.target.value); }}
        secenekler={l.map((u) => ({ deger: String(u.no), baslik: ad(u) }))} />
      <Dugme onClick={() => {
        if (!sec) return;
        degistir((t) => { t[RECETE_KAYNAGI] = { no: sec.no, ad: ad(sec) }; });
        bildir(`${ad(sec)}: reçete ve rota kart kaydedilince Reçete ve Rota'da taslak olarak açılacak.`);
      }}
      >Reçete ve rotayı bu üründen al
      </Dugme>
    </div>
  );
}
