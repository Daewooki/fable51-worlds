import * as THREE from 'three';

// Every visible letter in the world is drawn here. The two font stacks retain
// Kyoto's restrained brush/Mincho character while using installed CJK glyphs.
const MINCHO = '"Yu Mincho", "Hiragino Mincho ProN", "Noto Serif CJK JP", serif';
const GOTHIC = '"Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans CJK JP", sans-serif';
const textures = new Map();

export const SHOP_TYPES = [
  { id: 'tea', name: '京の茶', subtitle: '宇治茶・抹茶', en: 'Uji tea', color: '#526c51', item: 'A little bowl of Uji matcha. The soft bitterness lingers.', action: 'Taste Uji tea', kind: 'tea' },
  { id: 'wagashi', name: '花ごよみ', subtitle: '季節の和菓子', en: 'Seasonal sweets', color: '#a66c75', item: 'Sakura mochi, wrapped in a salted cherry leaf. Spring, in a single bite.', action: 'Try a spring sweet', kind: 'food' },
  { id: 'pottery', name: '清水焼', subtitle: '手しごとの器', en: 'Kiyomizu ceramics', color: '#687e88', item: 'A small hand-glazed tea bowl. Kiyomizu ware takes its name from this temple approach.', action: 'Inspect the tea bowls', kind: 'pottery' },
  { id: 'incense', name: '香の庭', subtitle: '京のお香', en: 'Kyoto incense', color: '#7e687e', item: 'Sandalwood and the faint scent of rain on a temple garden.', action: 'Sample the incense', kind: 'incense' },
  { id: 'fans', name: '風のいろ', subtitle: '京扇子', en: 'Kyoto folding fans', color: '#a88660', item: 'A painted folding fan, its pale blue ribs opening like a small horizon.', action: 'Open a folding fan', kind: 'fan' },
  { id: 'kimono', name: '花むすび', subtitle: '和小物・かんざし', en: 'Kimono accessories', color: '#976272', item: 'Silk cords, tiny flower hairpins, and a pouch dyed the colour of plum blossom.', action: 'Inspect the silk display', kind: 'craft' },
  { id: 'crafts', name: '手のひら', subtitle: '京の手仕事', en: 'Local handcrafts', color: '#687e79', item: 'A wooden keepsake, smoothly worn where the craftsperson held it.', action: 'Examine the handcrafts', kind: 'craft' },
  { id: 'souvenir', name: '東山だより', subtitle: '京都みやげ', en: 'Higashiyama keepsakes', color: '#9c7863', item: 'A postcard of a pagoda above a stone lane. You recognise the view.', action: 'Browse the postcards', kind: 'postcard' },
  { id: 'soba', name: '石畳そば', subtitle: '手打ち蕎麦', en: 'Handmade soba', color: '#606c79', item: 'The bowl warms your hands; buckwheat noodles and a little spring onion.', action: 'Taste the soba', kind: 'food' },
  { id: 'tofu', name: 'ゆばの里', subtitle: '豆腐と京ゆば', en: 'Tofu and yuba', color: '#a39769', item: 'A delicate ribbon of yuba, folded beside a square of fresh tofu.', action: 'Try Kyoto yuba', kind: 'food' },
  { id: 'coffee', name: '路地珈琲', subtitle: '自家焙煎', en: 'Alley coffee', color: '#7b655a', item: 'The aroma of a fresh pour-over drifts through the open wooden doorway.', action: 'Order a coffee', kind: 'tea' },
  { id: 'confectionery', name: '八つ橋', subtitle: '京銘菓', en: 'Kyoto confectionery', color: '#a26e52', item: 'Cinnamon-scented yatsuhashi, folded around sweet bean paste.', action: 'Sample yatsuhashi', kind: 'food' },
  { id: 'restaurant', name: '祇園こみち', subtitle: '京のごはん', en: 'Gion kitchen', color: '#80595a', item: 'A handwritten menu offers today’s vegetables and a pot of simmering rice.', action: 'Read today’s menu', kind: 'menu' },
  { id: 'matcha', name: '抹茶日和', subtitle: '甘味とお茶', en: 'Matcha sweets', color: '#738364', item: 'Matcha ice cream, a spoon of red bean, and the sound of a wind chime.', action: 'Try matcha sweets', kind: 'food' },
];

export function shopType(value = 'tea') {
  return typeof value === 'number' ? SHOP_TYPES[((value % SHOP_TYPES.length) + SHOP_TYPES.length) % SHOP_TYPES.length]
    : SHOP_TYPES.find(s => s.id === value) || SHOP_TYPES[0];
}

function texture(key, w, h, draw) {
  if (textures.has(key)) return textures.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const c = canvas.getContext('2d');
  draw(c, w, h);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  map.name = key;
  textures.set(key, map);
  return map;
}

function circleSeal(c, x, y, r, color = '#a24f48') {
  c.strokeStyle = color; c.lineWidth = Math.max(2, r * .07);
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
  c.font = `${r * 1.15}px ${MINCHO}`; c.fillStyle = color;
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('京', x, y);
}

function vertical(c, text, x, y, size, spacing = 1.13, color = '#39392f') {
  c.fillStyle = color; c.font = `600 ${size}px ${MINCHO}`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  [...text].forEach((ch, i) => c.fillText(ch, x, y + i * size * spacing));
}

function paper(c, w, h, color = '#f1e8cd') {
  c.fillStyle = color; c.fillRect(0, 0, w, h);
  c.fillStyle = '#fff9e51c';
  for (let y = 3; y < h; y += 7) c.fillRect(0, y, w, 1);
}

export function makeVerticalShopSign(value = 'tea', opts = {}) {
  const type = shopType(value), name = opts.text || type.name;
  return texture(`vertical:${name}:${opts.dark || false}`, 256, 768, (c, w, h) => {
    const dark = opts.dark;
    paper(c, w, h, dark ? '#645041' : '#e6d0a4');
    c.strokeStyle = dark ? '#937759' : '#b6976e'; c.lineWidth = 3;
    c.strokeRect(12, 12, w - 24, h - 24);
    for (let x = 20; x < w; x += 23) {
      c.strokeStyle = dark ? '#80644445' : '#a9845034';
      c.beginPath(); c.moveTo(x, 18); c.bezierCurveTo(x + 12, h * .28, x - 13, h * .72, x + 3, h - 20); c.stroke();
    }
    const size = Math.min(105, 530 / name.length);
    vertical(c, name, w * .51, 94, size, 1.22, dark ? '#f3e7c8' : '#423c32');
    circleSeal(c, w * .5, h - 81, 28, dark ? '#cdaa8a' : '#9c5549');
    c.fillStyle = '#5e4c3e';
    c.beginPath(); c.arc(25, 25, 5, 0, 7); c.arc(w - 25, h - 25, 5, 0, 7); c.fill();
  });
}

export function makeWoodenSign(text = '東山', subtitle = '京都', opts = {}) {
  return texture(`wood:${text}:${subtitle}:${opts.dark}`, 768, 256, (c, w, h) => {
    const dark = opts.dark;
    paper(c, w, h, dark ? '#59483b' : '#dec49a');
    for (let y = 15; y < h; y += 22) {
      c.strokeStyle = dark ? '#b9916240' : '#96724835'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(w*.3, y+12, w*.65, y-9, w, y+3); c.stroke();
    }
    c.fillStyle = dark ? '#f2e5c6' : '#403a31';
    c.font = `600 ${Math.min(117, 630 / text.length)}px ${MINCHO}`;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w*.48, h*.48);
    c.font = `26px ${MINCHO}`; c.fillText(subtitle, w*.48, h*.81);
    circleSeal(c, w - 70, h - 59, 23, dark ? '#ba8d75' : '#9c5648');
  });
}

export function makeNorenTexture(value = 'tea') {
  const type = shopType(value);
  return texture(`noren:${type.id}`, 768, 256, (c, w, h) => {
    paper(c, w, h, type.color);
    c.strokeStyle = '#efe8d727'; c.lineWidth = 1;
    for (let y=8; y<h; y+=6) { c.beginPath(); c.moveTo(0,y); c.lineTo(w,y); c.stroke(); }
    c.fillStyle = '#faf0da'; c.textAlign='center'; c.textBaseline='middle';
    c.font = `400 ${Math.min(94, 460/type.name.length)}px ${MINCHO}`;
    c.fillText(type.name,w*.5,h*.49);
    c.font = `22px ${MINCHO}`; c.fillText(type.subtitle,w*.5,h*.79);
    c.strokeStyle='#f0ead762'; c.lineWidth=2; c.strokeRect(16,14,w-32,h-29);
  });
}

export function makeLanternTexture(text = '祇園', color = '#da7861') {
  return texture(`lantern:${text}:${color}`, 512, 512, (c,w,h) => {
    paper(c,w,h,color);
    for(let y=10;y<h;y+=24) { c.fillStyle='#6e42391c'; c.fillRect(0,y,w,3); c.fillStyle='#fff2d327';c.fillRect(0,y+3,w,2); }
    for(const x of [128,384]) { circleSeal(c,x,75,29,'#fff0dc'); vertical(c,text,x,169,Math.min(77,235/text.length),1.14,'#fdf0d8'); }
  });
}

export function makeMenuBoard(value = 'tea') {
  const type=shopType(value);
  return texture(`menu:${type.id}`, 384, 576, (c,w,h) => {
    paper(c,w,h,'#f2e9ce'); c.strokeStyle='#b59a76';c.lineWidth=5;c.strokeRect(15,15,w-30,h-30);
    c.textAlign='center';c.textBaseline='middle';c.fillStyle='#4f4c3e';c.font=`600 42px ${MINCHO}`;c.fillText(type.name,w*.5,74);
    c.strokeStyle=type.color;c.lineWidth=3;c.beginPath();c.moveTo(48,117);c.lineTo(w-48,117);c.stroke();
    const menus=[type.subtitle,'本日のおすすめ','季節のひとしな','お持ち帰りできます'];
    menus.forEach((t,i)=>{c.font=`${i===0?29:24}px ${MINCHO}`;c.fillText(t,w*.5,168+i*69);});
    c.font=`25px ${GOTHIC}`;c.fillText('¥ 600 〜',w*.5,h-112);circleSeal(c,w*.5,h-52,21);
  });
}

export function makeTemplePlaque(text='清水寺', subtitle='静かにお参りください') {
  return texture(`temple:${text}:${subtitle}`,512,768,(c,w,h)=>{
    paper(c,w,h,'#e1cca5');c.strokeStyle='#7f6344';c.lineWidth=14;c.strokeRect(15,15,w-30,h-30);
    vertical(c,text,w*.6,130,Math.min(115,390/text.length),1.16);
    vertical(c,subtitle,w*.23,135,28,1.29,'#6c6050');circleSeal(c,w*.61,h-110,34);
  });
}

export function makePriceStrip(value='pottery') {
  const type=shopType(value);
  return texture(`prices:${type.id}`,512,128,(c,w,h)=>{
    paper(c,w,h,'#f4eddb');c.fillStyle='#5f5548';c.font=`24px ${MINCHO}`;c.textAlign='center';c.textBaseline='middle';
    c.fillText(type.subtitle,w*.5,37);c.font=`30px ${GOTHIC}`;c.fillText('¥ 600     ¥ 1,200     ¥ 1,800',w*.5,86);
  });
}

export function makeOmikujiNotice() {
  return texture('omikuji',384,512,(c,w,h)=>{
    paper(c,w,h);c.strokeStyle='#b45748';c.lineWidth=8;c.strokeRect(14,14,w-28,h-28);
    vertical(c,'おみくじ',w*.5,86,66,1.15,'#4d473c');c.font=`24px ${MINCHO}`;c.fillStyle='#aa5344';c.textAlign='center';c.fillText('初穂料 百円',w*.5,h-45);
  });
}

export function makeVendingTexture() {
  return texture('vending',384,640,(c,w,h)=>{
    paper(c,w,h,'#e9e2c9');c.fillStyle='#657c6e';c.fillRect(0,0,w,83);
    c.fillStyle='#fbf2d8';c.textAlign='center';c.font=`41px ${MINCHO}`;c.fillText('お茶と水',w*.5,57);
    c.fillStyle='#829997';c.fillRect(20,101,w-40,320);
    const colors=['#8a9d58','#faf0cc','#6f91a6','#b59274'];
    for(let row=0;row<3;row++)for(let col=0;col<4;col++){
      const x=47+col*94,y=124+row*103;c.fillStyle=colors[(col+row)%4];c.fillRect(x-16,y,34,61);
      c.fillStyle='#e9eed9';c.fillRect(x-12,y-8,26,11);c.fillRect(x-16,y+22,34,17);
      c.fillStyle='#4c6755';c.font=`14px ${GOTHIC}`;c.fillText('茶',x+1,y+36);
      c.fillStyle='#fff2a0';c.fillRect(x-17,y+72,36,8);
    }
    c.fillStyle='#46565b';c.fillRect(w-106,452,61,93);c.fillStyle='#cfb776';c.fillRect(w-96,465,41,18);
    c.font=`20px ${GOTHIC}`;c.fillStyle='#615d50';c.fillText('ひと息、どうぞ。',143,485);
  });
}

export function textureStats() {
  let bytes=0;for(const map of textures.values())bytes+=map.image.width*map.image.height*4*4/3;
  return { count:textures.size, estimatedBytes:Math.round(bytes) };
}
