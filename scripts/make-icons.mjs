// 纯 Node 生成应用图标 PNG（无第三方依赖）
// 设计：斜向渐变底（靛蓝→紫）+ 白色定位针（归处）+ 针内收纳箱（物）+ 落地光圈
// 4x 超采样抗锯齿
import zlib from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RES = 'android/app/src/main/res';

// ---------- 颜色 ----------
const C_TOP = [99, 102, 241];   // indigo-500 #6366f1
const C_BOT = [124, 58, 237];   // violet-600 #7c3aed
const C_BOX = [91, 70, 200];    // 箱子实色（介于渐变中段）
const WHITE = [255, 255, 255];
const SHADOW = [49, 46, 129];   // indigo-900

const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

// ---------- 最小 PNG 编码器 ----------
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const u32 = (n) => Buffer.from([n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255]);
const chunk = (type, data) =>
  Buffer.concat([u32(data.length), Buffer.from(type), data, u32(crc32(Buffer.concat([Buffer.from(type), data])))]);

function encodePng(size, px) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.concat([u32(size), u32(size), Buffer.from([8, 6, 0, 0, 0])]);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- 几何 ----------
function insideRoundRect(x, y, w, h, r, px_, py_) {
  const cx = Math.max(x + r, Math.min(px_, x + w - r));
  const cy = Math.max(y + r, Math.min(py_, y + h - r));
  if (px_ >= x + r && px_ <= x + w - r) return py_ >= y && py_ <= y + h;
  if (py_ >= y + r && py_ <= y + h - r) return px_ >= x && px_ <= x + w;
  return (px_ - cx) ** 2 + (py_ - cy) ** 2 <= r * r;
}
const inEllipse = (cx, cy, rx, ry, x, y) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const inCircle = (cx, cy, r, x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
function inTriangle(ax, ay, bx, by, cx, cy, x, y) {
  const s1 = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
  const s2 = (cx - bx) * (y - by) - (cy - by) * (x - bx);
  const s3 = (ax - cx) * (y - cy) - (ay - cy) * (x - cx);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}
const inQuad = (ax, ay, bx, by, cx, cy, dx, dy, x, y) =>
  inTriangle(ax, ay, bx, by, cx, cy, x, y) || inTriangle(ax, ay, cx, cy, dx, dy, x, y);

// ---------- 图层绘制 ----------
/** 渐变底 + 左上微光 + 底部暗角 */
function bgColor(x, y, s) {
  const t = (x + y) / (2 * s);
  let c = mix3(C_TOP, C_BOT, t);
  // 左上径向微光
  const g = Math.hypot(x - 0.32 * s, y - 0.28 * s) / s;
  const glow = Math.max(0, 1 - g / 0.85) ** 2 * 0.16;
  c = mix3(c, WHITE, glow);
  // 底部暗角
  const v = 1 - 0.10 * (y / s);
  return [c[0] * v, c[1] * v, c[2] * v];
}

/** 单个像素渲染，返回 [r,g,b,a]（a 0-255） */
function pixel(x, y, s, shape) {
  const cx = s / 2;
  // 背景形状
  let inBg = false;
  if (shape === 'square') inBg = insideRoundRect(0, 0, s, s, s * 0.24, x, y);
  else if (shape === 'circle') inBg = inCircle(cx, cx, s / 2, x, y);
  else if (shape === 'none') inBg = true; // 前景层全出血，交给系统 mask 裁

  let r = 0, g = 0, b = 0, a = 0;
  const put = (c, alpha = 1) => {
    // src-over
    const sa = alpha * (c[3] ?? 1);
    r = c[0] * sa + r * a * (1 - sa) / 255;
    g = c[1] * sa + g * a * (1 - sa) / 255;
    b = c[2] * sa + b * a * (1 - sa) / 255;
    a = a + sa * 255 - a * sa;
  };

  if (inBg) put([...bgColor(x, y, s), 1]);
  if (a === 0 && shape !== 'none') return [0, 0, 0, 0];

  // ---- 定位针几何 ----
  const cy = s * 0.375;          // 针头圆心
  const R = s * 0.185;           // 针头半径
  const tipY = s * 0.735;        // 针尖
  const d = tipY - cy;
  const beta = Math.acos(R / d); // 切线半角
  const t1a = Math.PI / 2 - beta, t2a = Math.PI / 2 + beta;
  const t1 = [cx + R * Math.cos(t1a), cy + R * Math.sin(t1a)];
  const t2 = [cx + R * Math.cos(t2a), cy + R * Math.sin(t2a)];

  // 落地光圈（针尖周围一圈椭圆环 + 淡阴影）
  const ringRx = s * 0.15, ringRy = s * 0.038, ringC = tipY - s * 0.012;
  const inRingOuter = inEllipse(cx, ringC, ringRx, ringRy, x, y);
  const inRingInner = inEllipse(cx, ringC, ringRx - s * 0.028, ringRy - s * 0.012, x, y);
  if (inRingOuter && !inRingInner) put([255, 255, 255, 0.55]);
  // 针下软阴影
  if (inEllipse(cx, ringC, s * 0.075, s * 0.017, x, y)) put([...SHADOW, 0.35]);

  // ---- 定位针本体 ----
  const inPin =
    inCircle(cx, cy, R, x, y) ||
    inTriangle(t1[0], t1[1], t2[0], t2[1], cx, tipY, x, y);
  if (inPin) {
    // 白色针身带极轻微的纵向明暗（顶部稍亮）
    const k = Math.min(1, Math.max(0, (y - cy + R) / (R * 2)));
    put([...mix3(WHITE, [224, 220, 250], k * 0.55), 1]);
  }

  // ---- 针头内等距立方体箱子（呼应「物」），三面明暗 ----
  const cr = s * 0.088;                 // 立方体半径
  const ccy = cy + s * 0.002;
  const V = {
    top: [cx, ccy - cr],
    ur: [cx + cr * 0.866, ccy - cr * 0.5],
    lr: [cx + cr * 0.866, ccy + cr * 0.5],
    bot: [cx, ccy + cr],
    ll: [cx - cr * 0.866, ccy + cr * 0.5],
    ul: [cx - cr * 0.866, ccy - cr * 0.5],
  };
  // 顶面（最亮）/ 左面（中）/ 右面（最深）
  if (inQuad(V.top[0], V.top[1], V.ur[0], V.ur[1], cx, ccy, V.ul[0], V.ul[1], x, y)) {
    put([154, 137, 244, 1]);
  } else if (inQuad(V.ul[0], V.ul[1], cx, ccy, V.bot[0], V.bot[1], V.ll[0], V.ll[1], x, y)) {
    put([107, 88, 226, 1]);
  } else if (inQuad(cx, ccy, V.ur[0], V.ur[1], V.lr[0], V.lr[1], V.bot[0], V.bot[1], x, y)) {
    put([79, 60, 190, 1]);
  }
  return [r, g, b, a];
}

/** shape: 'square' | 'circle' | 'none'(全出血前景层) */
function render(size, shape) {
  const SS = 4; // 超采样
  const big = size * SS;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = pixel((x + (sx + 0.5) / SS), (y + (sy + 0.5) / SS), size, shape);
          r += c[0]; g += c[1]; b += c[2]; a += c[3];
        }
      }
      const n = SS * SS, i = (y * size + x) * 4;
      px[i] = r / n; px[i + 1] = g / n; px[i + 2] = b / n; px[i + 3] = a / n;
    }
  }
  return encodePng(size, px);
}

const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const FG_SCALE = 108 / 48; // 前景画布 108dp（自适应图标标准）

// 预览大图
if (process.argv.includes('--preview')) {
  writeFileSync('icon-preview.png', render(512, 'square'));
  console.log('icon-preview.png');
  process.exit(0);
}

for (const [d, s] of Object.entries(DENSITIES)) {
  const dir = join(RES, `mipmap-${d}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'ic_launcher.png'), render(s, 'square'));
  writeFileSync(join(dir, 'ic_launcher_round.png'), render(s, 'circle'));
  writeFileSync(join(dir, 'ic_launcher_foreground.png'), render(Math.round(s * FG_SCALE), 'none'));
  console.log(`mipmap-${d}: ${s}px`);
}
console.log('图标生成完成');
