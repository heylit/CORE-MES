import { useState } from 'react';
import { Dugme, OnayPenceresi, Simge } from '../../../../../ortak/arayuz/index.ts';
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
  const { taslak: d, b, degistir, bildir, git } = useSihirbaz();
  const [ara, araYaz] = useState('');
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

  return (
    <>
      <div className="tc-my-ops">
        <aside className="tc-my-ops-sec" aria-label="Operasyon seçimi">
          <div className="tc-my-ops-ust"><b>Operasyon ekle</b><small>Dokun, rotanın sonuna eklensin</small></div>
          <span className="tc-my-girdi">
            <input type="search" aria-label="Operasyon ara" value={ara} autoComplete="off" placeholder="Ara: TRN, freze, boya, BM…" onChange={(e) => { araYaz(e.target.value); }} />
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
          <RotaSablonu />
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
// Kullanımdan kalkan şablon listelenmez.
const sozcukler = (m: string): Set<string> => new Set(m.toLocaleUpperCase('tr-TR').split(/[^0-9A-ZÇĞİÖŞÜ]+/).filter((x) => x.length >= 3));
function RotaSablonu() {
  const { taslak: d, b, yetki, kartlar, degistir, bildir, git } = useSihirbaz();
  const sablonlar = useRotaSablonlari();
  const uygun = yetki.yaz && (d.tur === 'mamul' || d.tur === 'yarimamul');
  const urunler = useRotaliUrunler(uygun);
  const [secili, seciliYaz] = useState('');
  const [bak, bakYaz] = useState<number | null>(null);
  const [soru, soruYaz] = useState<SecilebilirSablon | null>(null);
  if (!yetki.yaz) return null;
  const duzenle = <BagDugmesi tikla={() => { git.disari('rota-sablonlari'); }}>Şablonları düzenle</BagDugmesi>;
  const bosBasla = (
    <Dugme simge="plus" onClick={() => { document.querySelector<HTMLInputElement>('input[aria-label="Operasyon ara"]')?.focus(); }}>Boş başla</Dugme>
  );
  const l = sablonlar.data ?? [];
  // Ad kaydedilirken üretilen addır (elle yazılmadıysa parça adı ve tipinden).
  const kartAdi = String(K.finalAd(d, b));
  const oneri = sablonOnerisi(l, kartAdi);
  const sec = l.some((s) => String(s.id) === secili) ? secili : String((oneri[0]?.sablon ?? l[0])?.id ?? '');
  const sablon = l.find((s) => String(s.id) === sec);
  const dolu = (d.ops ?? []).length > 0;
  const doldur = (s: SecilebilirSablon) => {
    degistir((t) => { t.ops = s.adimlar.map((a, i) => ({ no: (i + 1) * 10, kod: a.kod, ad: a.ad })); });
    bildir(`${s.ad}: ${String(s.adimlar.length)} operasyon rotaya yazıldı.`);
    soruYaz(null);
  };
  const uygula = (s: SecilebilirSablon | undefined) => { if (!s) return; if (dolu) soruYaz(s); else doldur(s); };
  // Benzer ürün: rotası olan ürünlerden adı kartın adıyla en çok ortak sözcük taşıyan (3 harften kısa sözcük sayılmaz).
  const kendi = d.id ? kartlar.find((k) => k.kimlik === d.id)?.no : undefined;
  const ad = sozcukler(kartAdi);
  const benzer = uygun && !receteKaynagi(d) ? (urunler.data ?? []).filter((u) => u.no !== kendi)
    .map((u) => ({ u, n: [...sozcukler(u.ad)].filter((x) => ad.has(x)).length })).filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || (a.u.kod ?? '').localeCompare(b.u.kod ?? '', 'tr'))[0]?.u ?? null : null;
  const benzerAdi = benzer ? (benzer.kod ? `${benzer.kod} · ${benzer.ad}` : benzer.ad) : '';
  return (
    <div className="tc-my-oneri" role="group" aria-label="Rota şablonları">
      {sablonlar.isPending && <span className="tc-my-kucuk">Rota şablonları yükleniyor…</span>}
      {sablonlar.isError && (
        <span className="tc-my-kucuk" role="status">Rota şablonları okunamadı. Benzer ürün ve boş başlama yine kullanılabilir.{' '}
          <Dugme simge="rotate" onClick={() => { void sablonlar.refetch(); }}>Yeniden dene</Dugme>
        </span>
      )}
      {sablonlar.isSuccess && !l.length && <span className="tc-my-kucuk">Kayıtlı rota şablonu yok. {duzenle}</span>}
      <div className="tc-my-ops-sablon">
        {oneri.map((o) => (
          <div key={o.sablon.id} className="tc-my-kutu" role="group" aria-label={`${o.sablon.ad} şablonu`}>
            <b>{o.sablon.ad}{o.sablon.varsayilan ? ' (varsayılan)' : ''}</b>
            <span className="tc-my-kucuk">{`${o.neden} · ${String(o.sablon.adimlar.length)} adım`}</span>
            <span className="tc-my-kucuk">{o.sablon.adimlar.map((a) => a.kod).join(' › ')}</span>
            {bak === o.sablon.id && <ol className="tc-my-kucuk">{o.sablon.adimlar.map((a, i) => <li key={`${String(i)}-${a.kod}`}>{a.ad}</li>)}</ol>}
            <span className="tc-my-ops-sablon">
              <Dugme tur="birincil" simge="play" onClick={() => { uygula(o.sablon); }}>Başla</Dugme>
              <Dugme simge="eye" aria-expanded={bak === o.sablon.id} onClick={() => { bakYaz(bak === o.sablon.id ? null : o.sablon.id); }}>İçine bak</Dugme>
            </span>
          </div>
        ))}
        {benzer && (
          <div className="tc-my-kutu" role="group" aria-label="Benzer ürün">
            <b>Benzer ürün: {benzer.kod ?? benzer.ad}</b>
            <span className="tc-my-kucuk">{benzer.ad} · yürürlükteki rota; kart kaydedilince Reçete ve Rota'da taslak açılır</span>
            <span className="tc-my-ops-sablon">
              <Dugme tur="birincil" simge="layers" onClick={() => {
                degistir((t) => { t[RECETE_KAYNAGI] = { no: benzer.no, ad: benzerAdi }; });
                bildir(`${benzerAdi}: reçete ve rota kart kaydedilince Reçete ve Rota'da taslak olarak açılacak.`);
              }}
              >Kopyala
              </Dugme>
            </span>
          </div>
        )}
      </div>
      <div className="tc-my-ops-sablon">
        {l.length > 0 && (
          <>
            <select aria-label={`Bütün şablonlar (${String(l.length)})`} value={sec} onChange={(e) => { seciliYaz(e.target.value); }}>
              {l.map((s) => <option key={String(s.id)} value={String(s.id)}>{s.ad}{s.varsayilan ? ' (varsayılan)' : ''} · {s.adimlar.length} op.</option>)}
            </select>
            <Dugme onClick={() => { uygula(sablon); }}>{dolu ? 'Şablonla değiştir' : 'Şablondan doldur'}</Dugme>
          </>
        )}
        {!dolu && bosBasla}
        {l.length > 0 && duzenle}
      </div>
      <OnayPenceresi acik={soru !== null} baslik="Rota değişsin mi?" onayMetni="Şablonla değiştir" tehlikeli onayla={() => { if (soru) doldur(soru); }} vazgec={() => { soruYaz(null); }}>
        <p>Karttaki {(d.ops ?? []).length} operasyon silinir, yerine "{soru?.ad}" şablonunun adımları yazılır.</p>
      </OnayPenceresi>
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
      <select aria-label="Reçete ve rotası alınacak ürün" value={sec ? String(sec.no) : ''} onChange={(e) => { seciliYaz(e.target.value); }}>
        {l.map((u) => <option key={u.no} value={String(u.no)}>{ad(u)}</option>)}
      </select>
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
