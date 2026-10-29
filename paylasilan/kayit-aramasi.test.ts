import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  KAYIT_TURLERI, KAYIT_TURU_SIRASI, SADE_HEDEF, SADE_KAYNAK, aramaSade, aramaSorgusuGecerliMi, aramaSorgusunuAyir, basDeseni, eslesmePuani, icindeDeseni, kayitTuruMu,
  turBasinaSinir,
} from './kayit-aramasi.ts';

test('önekler tekil ve kısa, türler modül adlarıyla', () => {
  const onekler = KAYIT_TURU_SIRASI.map((t) => KAYIT_TURLERI[t].onek);
  assert.equal(new Set(onekler).size, onekler.length);
  for (const o of onekler) assert.match(o, /^[a-z]{1,3}$/);
  for (const t of KAYIT_TURU_SIRASI) assert.match(KAYIT_TURLERI[t].modul, /^[a-z]+(?:-[a-z]+)*$/);
});

test('bilinen önek süzgeçtir; bilinmeyen önek ve öneksiz metin bütünüyle aranır', () => {
  assert.deepEqual(aramaSorgusunuAyir('e:1234'), { tur: 'emir', q: '1234' });
  assert.deepEqual(aramaSorgusunuAyir('  P:  LOT-55 '), { tur: 'parti', q: 'LOT-55' });
  assert.deepEqual(aramaSorgusunuAyir('sp:S-1'), { tur: 'siparis', q: 'S-1' });
  assert.deepEqual(aramaSorgusunuAyir('saat:10'), { tur: null, q: 'saat:10' });
  assert.deepEqual(aramaSorgusunuAyir('flanş'), { tur: null, q: 'flanş' });
  assert.deepEqual(aramaSorgusunuAyir('e:'), { tur: 'emir', q: '' });
  assert.equal(aramaSorgusuGecerliMi(''), false);
  assert.equal(aramaSorgusuGecerliMi('ab'), true);
});

test('desen joker karakterleri kaçırır', () => {
  assert.equal(icindeDeseni('10%_a\\b'), '%10\\%\\_a\\\\b%');
  assert.equal(basDeseni('AB'), 'ab%');
  assert.equal(icindeDeseni('IŞIK'), '%isik%');
});

test('sadeleştirme dil ayarından bağımsızdır: Türkçe büyük-küçük ve şapkalı harf düz harfe iner', () => {
  assert.equal(SADE_KAYNAK.length, SADE_HEDEF.length);
  assert.equal(aramaSade('IŞIK'), aramaSade('ışık'));
  assert.equal(aramaSade('İSTASYON'), 'istasyon');
  assert.equal(aramaSade('Çek Göz Ünite Âlet'), 'cek goz unite alet');
  assert.equal(aramaSade('Été-10_%'), 'Été-10_%');
});

test('eşleşme puanı: tam, baştan, içinde, başka alanda; Türkçe harfte büyük-küçük farkı yok', () => {
  assert.equal(eslesmePuani('ue-12', 'UE-12'), 3);
  assert.equal(eslesmePuani('UE-1', 'UE-12'), 2);
  assert.equal(eslesmePuani('e-1', 'UE-12'), 1);
  assert.equal(eslesmePuani('xyz', 'UE-12'), 0);
  assert.equal(eslesmePuani('işçi', 'İŞÇİ'), 3);
  assert.equal(eslesmePuani('mil-0010', 'MIL-0010'), 3);
  assert.equal(eslesmePuani('mıl', 'MIL-0010'), 2);
});

test('tür denetimi ve sınırlar', () => {
  assert.equal(kayitTuruMu('emir'), true);
  assert.equal(kayitTuruMu('toString'), false);
  assert.equal(turBasinaSinir(false), 5);
  assert.equal(turBasinaSinir(true), 25);
});
