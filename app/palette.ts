import colorSystemMapping from "./color-system-mapping.json";

export const BRAND_OPTIONS = ["MARD", "COCO", "漫漫", "盼盼", "咪小窝"] as const;
export type Brand = (typeof BRAND_OPTIONS)[number];

export type BeadColor = {
  hex: string;
  name: string;
  codes: Record<Brand, string>;
};

const KNOWN_NAMES: Record<string, string> = {
  "#FEFFFF": "纯白", "#FDFBFF": "柔白", "#EDEDED": "雾白", "#CECDD5": "浅灰",
  "#B6B1BA": "中灰", "#89858C": "石灰", "#48464E": "炭灰", "#2F2B2F": "墨灰",
  "#000000": "黑色", "#FAF4C8": "奶油黄", "#FFFFD5": "浅黄", "#FEFF8B": "柠檬黄",
  "#FBED56": "鲜黄", "#F4D738": "向日葵", "#FEAC4C": "蜜橙", "#FE8B4C": "橙色",
  "#FD543D": "珊瑚橙", "#FD957B": "淡珊瑚", "#FC3D46": "朱红", "#E7002F": "正红",
  "#943630": "砖红", "#5A2121": "深褐红", "#FDD3CC": "贝壳粉", "#FEC0DF": "浅粉",
  "#E8649E": "樱花粉", "#F13D74": "玫红", "#C63478": "树莓", "#FFDBE9": "雾粉",
  "#E2D3FF": "浅薰衣草", "#AEB4F2": "雾蓝紫", "#858EDD": "矢车菊紫", "#AC7BDE": "薰衣草",
  "#8854B3": "葡萄紫", "#361851": "深紫", "#D5FDFF": "冰蓝", "#A0E2FB": "浅天蓝",
  "#41CCFF": "天蓝", "#01ACEB": "晴空蓝", "#3677D2": "湖蓝", "#0F54C0": "宝蓝",
  "#1C334D": "深海蓝", "#28DDDE": "青蓝", "#22C4C6": "孔雀蓝", "#C2F0CC": "薄荷绿",
  "#9EF780": "嫩绿", "#5DE035": "草绿", "#65E2A6": "清新绿", "#3DAF80": "翡翠绿",
  "#1C9C4F": "绿色", "#27523A": "森林绿", "#E8FFE7": "极浅绿", "#FFE2CE": "浅肤色",
  "#FFC4AA": "肤色", "#E1B383": "浅驼", "#EDB045": "焦糖", "#D98C39": "黄褐",
  "#9D5B3E": "橡木褐", "#753832": "深褐", "#78524B": "灰褐",
};

function generatedName(hex: string, code: string) {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta < 0.06) return `${lightness > 0.9 ? "柔白" : lightness > 0.65 ? "浅灰" : lightness > 0.32 ? "灰色" : "深灰"} ${code}`;
  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue = ((hue * 60) + 360) % 360;
  const family = hue < 15 || hue >= 345 ? "红色" : hue < 42 ? "橙色" : hue < 68 ? "黄色" : hue < 165 ? "绿色" : hue < 195 ? "青色" : hue < 255 ? "蓝色" : hue < 292 ? "紫色" : hue < 345 ? "粉色" : "红色";
  const tone = lightness > 0.83 ? "浅" : lightness < 0.28 ? "深" : "";
  return `${tone}${family} ${code}`;
}

export const BEAD_PALETTE: BeadColor[] = Object.entries(colorSystemMapping).map(([hex, codes]) => ({
  hex: hex.toUpperCase(),
  name: KNOWN_NAMES[hex.toUpperCase()] ?? generatedName(hex, codes.MARD),
  codes: codes as Record<Brand, string>,
}));

export const PALETTE_BY_HEX = new Map(BEAD_PALETTE.map((color) => [color.hex, color]));
