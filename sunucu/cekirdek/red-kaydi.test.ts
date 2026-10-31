import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RetTamponu, YOL_EN_COK, yoluTemizle } from './red-kaydi.ts';
import type { RetOlayi } from './red-kaydi.ts';

const olay = (yol: string): RetOlayi => ({ zaman: new Date(0), neden: 'yetki', kisiId: 1, yontem: 'GET', yol, ip: '10.0.0.1' });

test('tampon doluyken en eski olay düşer ve düşen sayı boşaltmada bildirilir', () => {
  const tampon = new RetTamponu(2);
  tampon.ekle(olay('/a'));
  tampon.ekle(olay('/b'));
  tampon.ekle(olay('/c'));
  const ilk = tampon.bosalt();
  assert.deepEqual(ilk.olaylar.map((o) => o.yol), ['/b', '/c']);
  assert.equal(ilk.dusen, 1);
  assert.deepEqual(tampon.bosalt(), { olaylar: [], dusen: 0 });
});

test('istenen yol sorgu dizgesinden ve denetim karakterlerinden arınır, uzunluğu sınırlanır', () => {
  assert.equal(yoluTemizle('/api/yok?parola=gizli'), '/api/yok');
  assert.equal(yoluTemizle('/api/a\r\nb\u0000'), '/api/ab');
  assert.equal(yoluTemizle(`/${'x'.repeat(500)}`).length, YOL_EN_COK);
});
