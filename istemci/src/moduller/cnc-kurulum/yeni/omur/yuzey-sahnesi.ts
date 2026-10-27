import {
  Box3, BufferAttribute, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, GridHelper, Group, Line, LineBasicMaterial,
  LineSegments, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, SphereGeometry, Vector3, type WebGLRenderer,
} from 'three';
import { clamp, disposeObj, envTex, fmtN, lifeModel, lights, Orbit, sizeSprite, textSprite } from './cekirdek.ts';
import type { AnalizSonucu } from './analiz.ts';
import { sahneRengi, type OmurPaleti } from './renk.ts';
import type { Dikdortgen } from './cark-sahnesi.ts';

// Ömür yüzeyi (prototipin LF'si): Vc ve ilerlemeye göre ortalama ömür, logaritmik yükseklik; yeşil uzun, kırmızı kısa. "Şu an" ve
// ekonomik Vc işaretlidir. Kamera yörüngedir (İzometrik, Üst, Ön, Yan).

export class OmurYuzeyi {
  readonly scene = new Scene();
  readonly cam = new PerspectiveCamera(40, 1, 0.1, 1000);
  readonly surf = new Group();
  readonly orbit: InstanceType<typeof Orbit>;
  private fitted = false;

  private palet: OmurPaleti;

  constructor(el: HTMLElement, palet: OmurPaleti) {
    this.palet = palet;
    this.scene.environment = envTex;
    lights(this.scene, 1.1);
    this.scene.add(this.surf);
    this.orbit = new Orbit(el, this.cam);
    this.orbit.th = this.orbit.tTh = -0.9; this.orbit.ph = this.orbit.tPh = 1.05;
  }

  paletDegisti(p: OmurPaleti): void { this.palet = p; }

  kur(r: AnalizSonucu | null): void {
    disposeObj(this.surf);
    while (this.surf.children.length) this.surf.remove(this.surf.children[0]!);
    if (!r || r.M.err !== undefined) return;
    const pl = this.palet, t = r.t, mat = r.mat, p = r.p, N = 44, SX = 12, SZ = 12, HH = 6;
    const v0 = p.vc * 0.5, v1 = p.vc * 1.6, f0 = p.f * 0.5, f1 = p.f * 1.6;
    const omur = (vc: number, f: number): number => { const M = lifeModel(t, mat, Object.assign({}, p, { vc, f })); return M.err !== undefined ? 0.05 : M.Tm; };
    const lt: number[] = [];
    let lmin = 1e9, lmax = -1e9;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const vc = v0 + (v1 - v0) * i / (N - 1), f = f0 + (f1 - f0) * j / (N - 1), lg = Math.log10(Math.max(0.05, omur(vc, f)));
        lt.push(lg);
        if (lg < lmin) lmin = lg;
        if (lg > lmax) lmax = lg;
      }
    }
    lmin = Math.min(lmin, 0); lmax = Math.max(lmax, Math.log10(120));
    const H = (lg: number): number => (lg - lmin) / (lmax - lmin) * HH;
    const pos = new Float32Array(N * N * 3), col = new Float32Array(N * N * 3), idx: number[] = [], c = new Color();
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i, lg2 = lt[k]!, tl = clamp((lg2 - Math.log10(5)) / (Math.log10(90) - Math.log10(5)), 0, 1);
        pos[k * 3] = i / (N - 1) * SX - SX / 2; pos[k * 3 + 1] = H(lg2); pos[k * 3 + 2] = SZ / 2 - j / (N - 1) * SZ;
        // Ömür ölçeği kırmızıdan yeşile ton geçişidir (veri rengi, tema rengi değil).
        c.setHSL(tl * 0.33, 0.75, 0.48); col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
        if (i < N - 1 && j < N - 1) idx.push(k, k + 1, k + N + 1, k, k + N + 1, k + N);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3)); g.setAttribute('color', new BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    this.surf.add(new Mesh(g, new MeshStandardMaterial({ vertexColors: true, metalness: 0.1, roughness: 0.55, side: DoubleSide, transparent: true, opacity: 0.93 })));
    const wl: number[] = [];
    for (let j = 0; j < N; j += 4) {
      for (let i = 0; i < N - 1; i++) {
        const a = j * N + i;
        wl.push(pos[a * 3]!, pos[a * 3 + 1]! + 0.01, pos[a * 3 + 2]!, pos[(a + 1) * 3]!, pos[(a + 1) * 3 + 1]! + 0.01, pos[(a + 1) * 3 + 2]!);
      }
    }
    for (let i = 0; i < N; i += 4) {
      for (let j = 0; j < N - 1; j++) {
        const b = j * N + i;
        wl.push(pos[b * 3]!, pos[b * 3 + 1]! + 0.01, pos[b * 3 + 2]!, pos[(b + N) * 3]!, pos[(b + N) * 3 + 1]! + 0.01, pos[(b + N) * 3 + 2]!);
      }
    }
    const wg = new BufferGeometry();
    wg.setAttribute('position', new Float32BufferAttribute(wl, 3));
    this.surf.add(new LineSegments(wg, new LineBasicMaterial({ color: sahneRengi(pl.arka), transparent: true, opacity: 0.35 })));
    this.surf.add(new GridHelper(SX, 6, sahneRengi(pl.cizgi), sahneRengi(pl.silik)));
    const pt = (vc: number, f: number): Vector3 => new Vector3((vc - v0) / (v1 - v0) * SX - SX / 2, H(Math.log10(Math.max(0.05, omur(vc, f)))), SZ / 2 - (f - f0) / (f1 - f0) * SZ);
    const marker = (v: Vector3, renk: string, label: string, rad?: number): void => {
      const colr = sahneRengi(renk);
      const mm = new Mesh(new SphereGeometry(rad || 0.22, 20, 14), new MeshStandardMaterial({ color: colr, emissive: colr, emissiveIntensity: 0.5 }));
      mm.position.copy(v); this.surf.add(mm);
      this.surf.add(new Line(new BufferGeometry().setFromPoints([new Vector3(v.x, 0, v.z), v]), new LineBasicMaterial({ color: colr })));
      const s = textSprite(label, renk); sizeSprite(s, 0.5); s.position.set(v.x, v.y + 0.75, v.z); this.surf.add(s);
    };
    marker(pt(p.vc, p.f), pl.yazi, 'Şu an · ' + fmtN(r.M.Tm, 0) + ' dk', 0.26);
    if (r.vOpt && r.vOpt > v0 && r.vOpt < v1) marker(pt(r.vOpt, p.f), pl.ok, 'Ekonomik Vc ' + fmtN(r.vOpt, 0));
    const unitF = r.M.R.fz ? 'fz (mm/diş)' : 'f (mm/dev)';
    const yazilar: [string, string, number, number, number][] = [
      ['Kesme hızı Vc (m/dk) →', pl.yazi, 0, -0.3, SZ / 2 + 1.0], [fmtN(v0, 0), pl.soluk, -SX / 2, -0.3, SZ / 2 + 0.5], [fmtN(v1, 0), pl.soluk, SX / 2, -0.3, SZ / 2 + 0.5],
      ['İlerleme ' + unitF + ' →', pl.yazi, -SX / 2 - 2.0, -0.3, 0], [fmtN(f0, 3), pl.soluk, -SX / 2 - 0.9, -0.3, SZ / 2], [fmtN(f1, 3), pl.soluk, -SX / 2 - 0.9, -0.3, -SZ / 2],
      ['Ömür (dk)', pl.yazi, -SX / 2 - 0.6, HH + 0.8, -SZ / 2],
    ];
    yazilar.forEach(([metin, renk, x, y, z]) => { const s = textSprite(metin, renk); sizeSprite(s, 0.45); s.position.set(x, y, z); this.surf.add(s); });
    [1, 5, 15, 60, 240].forEach((tv) => {
      const lg = Math.log10(tv);
      if (lg < lmin || lg > lmax) return;
      const y = H(lg), s = textSprite(tv + ' dk', pl.soluk);
      sizeSprite(s, 0.36); s.position.set(-SX / 2 - 0.4, y, -SZ / 2); this.surf.add(s);
      this.surf.add(new Line(new BufferGeometry().setFromPoints([new Vector3(-SX / 2, y, -SZ / 2), new Vector3(SX / 2, y, -SZ / 2)]), new LineBasicMaterial({ color: sahneRengi(pl.cizgi) })));
    });
    if (!this.fitted) {
      this.fitted = true;
      this.orbit.fit(new Box3(new Vector3(-SX / 2, 0, -SZ / 2), new Vector3(SX / 2, HH, SZ / 2)), null);
      this.orbit.tDist *= 0.82; this.orbit.snap();
    }
  }

  gorunus(v: string): void {
    this.orbit.fit(new Box3(new Vector3(-6, 0, -6), new Vector3(6, 6, 6)), v);
    this.orbit.tDist *= 0.82;
  }

  frame(renderer: WebGLRenderer, r: Dikdortgen, kk: number): void {
    this.orbit.update(Math.min(1, kk * 1.4), r.width / r.height);
    renderer.setClearColor(sahneRengi(this.palet.arka), 1);
    renderer.clear();
    renderer.render(this.scene, this.cam);
  }

  dispose(): void { disposeObj(this.surf); }
}
