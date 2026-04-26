import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outDir = join(process.cwd(), 'public', 'assets', 'cities');
mkdirSync(outDir, { recursive: true });

const cities = [
  ['pavlohrad', 'Павлоград', '#d9a322', '#244b3d', 'river'],
  ['nikopol', 'Нікополь', '#d9a322', '#375170', 'water'],
  ['kropyvnytskyi', 'Кропивницький', '#54b7d3', '#70472d', 'theatre'],
  ['cherkasy', 'Черкаси', '#54b7d3', '#2d6d7a', 'river'],
  ['zhytomyr', 'Житомир', '#54b7d3', '#4a5d31', 'forest'],
  ['sumy', 'Суми', '#a15bb8', '#314b70', 'gazebo'],
  ['poltava', 'Полтава', '#a15bb8', '#6c4a2e', 'column'],
  ['chernihiv', 'Чернігів', '#a15bb8', '#30584c', 'church'],
  ['khmelnytskyi', 'Хмельницький', '#e58335', '#314d70', 'market'],
  ['rivne', 'Рівне', '#e58335', '#34614c', 'park'],
  ['lutsk', 'Луцьк', '#e58335', '#4e3b67', 'castle'],
  ['zaporizhzhia', 'Запоріжжя', '#d4483b', '#2d5b69', 'island'],
  ['mykolaiv', 'Миколаїв', '#d4483b', '#2d6070', 'ship'],
  ['vinnytsia', 'Вінниця', '#d4483b', '#365f49', 'fountain'],
  ['dnipro', 'Дніпро', '#2b73d2', '#2d5765', 'bridge'],
  ['kharkiv', 'Харків', '#2b73d2', '#604b2f', 'tower'],
  ['odesa', 'Одеса', '#2b73d2', '#2d6070', 'sea'],
  ['ivano-frankivsk', 'Івано-Франківськ', '#299c63', '#5b4a2f', 'mountain'],
  ['uzhhorod', 'Ужгород', '#299c63', '#3f5d36', 'castle'],
  ['chernivtsi', 'Чернівці', '#299c63', '#6b3d45', 'university'],
  ['lviv', 'Львів', '#d8b335', '#653c32', 'oldtown'],
  ['kyiv', 'Київ', '#d8b335', '#2e5074', 'monument'],
];

const motif = (kind, accent) => {
  const common = `
    <rect x="36" y="154" width="248" height="16" rx="8" fill="#15352e" opacity=".28"/>
    <rect x="42" y="118" width="38" height="50" rx="4" fill="#fff4d4" opacity=".92"/>
    <rect x="92" y="96" width="42" height="72" rx="4" fill="#f4deaa" opacity=".94"/>
    <rect x="146" y="108" width="50" height="60" rx="4" fill="#fff8e7" opacity=".9"/>
    <rect x="210" y="86" width="44" height="82" rx="4" fill="#f0cf85" opacity=".96"/>
  `;
  const extras = {
    river: `<path d="M0 188 C70 166 108 210 178 184 C226 166 270 176 320 154 L320 240 L0 240Z" fill="#7bd1e8" opacity=".82"/>`,
    water: `<path d="M0 184 C80 160 122 194 198 174 C252 160 286 166 320 150 L320 240 L0 240Z" fill="#72c6e4" opacity=".86"/><circle cx="72" cy="72" r="18" fill="${accent}" opacity=".55"/>`,
    theatre: `<path d="M104 72 L216 72 L242 168 L78 168Z" fill="#fff0c1" opacity=".88"/><path d="M128 88 L192 88 L204 168 L116 168Z" fill="${accent}" opacity=".5"/>`,
    forest: `<path d="M52 170 L84 104 L116 170Z" fill="#226546"/><path d="M220 170 L250 100 L282 170Z" fill="#1f704b"/>`,
    gazebo: `<path d="M98 112 L160 68 L222 112Z" fill="#fff0c4"/><rect x="114" y="112" width="92" height="58" fill="${accent}" opacity=".45"/>`,
    column: `<rect x="128" y="78" width="64" height="90" rx="30" fill="#fff2c7"/><rect x="106" y="150" width="108" height="20" rx="6" fill="${accent}" opacity=".7"/>`,
    church: `<path d="M150 78 C150 56 170 56 170 78 L170 168 L150 168Z" fill="#fff4d4"/><circle cx="160" cy="62" r="14" fill="${accent}"/>`,
    market: `<path d="M70 118 H250 L232 168 H88Z" fill="#fff4d4"/><path d="M70 118 H250 L228 96 H92Z" fill="${accent}" opacity=".65"/>`,
    park: `<circle cx="78" cy="128" r="34" fill="#2c7a50"/><circle cx="246" cy="124" r="38" fill="#276d49"/>`,
    castle: `<rect x="78" y="92" width="164" height="78" rx="4" fill="#f6dfaa"/><path d="M78 92 V70 H112 V92 M208 92 V70 H242 V92" fill="#f6dfaa"/>`,
    island: `<path d="M74 170 C104 112 220 112 252 170Z" fill="#2f8b5e"/><path d="M0 186 C88 172 122 202 196 184 C248 172 286 176 320 162 L320 240 L0 240Z" fill="#80cee6"/>`,
    ship: `<path d="M74 152 H246 L222 186 H98Z" fill="#f6dfaa"/><path d="M154 68 V150 H208Z" fill="${accent}" opacity=".75"/>`,
    fountain: `<path d="M96 166 H224 C212 194 108 194 96 166Z" fill="#f6dfaa"/><path d="M160 78 C120 112 208 112 160 146" stroke="#8ed6e8" stroke-width="10" fill="none"/>`,
    bridge: `<path d="M42 166 C96 108 224 108 278 166" stroke="#fff0c4" stroke-width="18" fill="none"/><path d="M60 166 H260" stroke="${accent}" stroke-width="10"/>`,
    tower: `<path d="M128 168 L150 70 H174 L196 168Z" fill="#fff0c4"/><circle cx="162" cy="70" r="20" fill="${accent}" opacity=".7"/>`,
    sea: `<path d="M0 180 C58 156 116 202 176 176 C222 156 276 172 320 150 L320 240 L0 240Z" fill="#6fcce6"/><circle cx="246" cy="68" r="22" fill="#fff0c4"/>`,
    mountain: `<path d="M34 170 L112 78 L176 170Z" fill="#dde6d2"/><path d="M130 170 L212 66 L292 170Z" fill="#cbd9c6"/><path d="M78 170 H290 V240 H78Z" fill="#2c7a50"/>`,
    university: `<path d="M62 116 L160 62 L258 116Z" fill="#fff0c4"/><rect x="82" y="116" width="156" height="54" fill="${accent}" opacity=".48"/>`,
    oldtown: `<path d="M78 168 V106 L112 78 L148 106 V168Z" fill="#fff0c4"/><path d="M168 168 V92 L218 66 L250 102 V168Z" fill="${accent}" opacity=".6"/>`,
    monument: `<path d="M154 76 L170 76 L184 168 H140Z" fill="#fff4d4"/><circle cx="162" cy="58" r="18" fill="${accent}" opacity=".7"/>`,
  };
  return `${common}${extras[kind] ?? ''}`;
};

for (const [slug, name, accent, dark, kind] of cities) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 320 240" role="img" aria-label="${name}">
  <defs>
    <linearGradient id="sky" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#fff7dc"/>
      <stop offset=".58" stop-color="${accent}" stop-opacity=".34"/>
      <stop offset="1" stop-color="${dark}"/>
    </linearGradient>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="table" tableValues="0 .08"/></feComponentTransfer>
    </filter>
  </defs>
  <rect width="320" height="240" rx="24" fill="url(#sky)"/>
  <circle cx="260" cy="52" r="30" fill="#fff0b8" opacity=".72"/>
  <path d="M0 160 C42 132 72 150 112 128 C164 100 206 124 252 96 C284 76 304 78 320 68 L320 240 L0 240Z" fill="${dark}" opacity=".32"/>
  ${motif(kind, accent)}
  <rect width="320" height="240" rx="24" fill="#000" filter="url(#grain)" opacity=".3"/>
  <rect x="16" y="18" width="288" height="204" rx="18" fill="none" stroke="#fff8e8" stroke-opacity=".48" stroke-width="3"/>
  <text x="24" y="42" fill="#fff8e8" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="800">${name}</text>
</svg>`;
  writeFileSync(join(outDir, `${slug}.svg`), svg, 'utf8');
}
