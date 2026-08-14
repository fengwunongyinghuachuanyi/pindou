export type Brand = "MARD" | "COCO" | "漫漫";

export type BeadColor = {
  hex: string;
  name: string;
  codes: Record<Brand, string>;
};

// A practical starter palette covering the most-used hue families. The mapping is
// suitable for prototyping; physical production should still be checked against
// the latest bead manufacturer's swatch card.
export const BEAD_PALETTE: BeadColor[] = [
  { hex: "#FEFFFF", name: "纯白", codes: { MARD: "H02", COCO: "A01", 漫漫: "F2" } },
  { hex: "#FDFBFF", name: "柔白", codes: { MARD: "H01", COCO: "A02", 漫漫: "F1" } },
  { hex: "#EDEDED", name: "雾白", codes: { MARD: "H09", COCO: "A08", 漫漫: "F10" } },
  { hex: "#CECDD5", name: "浅灰", codes: { MARD: "H11", COCO: "B01", 漫漫: "F11" } },
  { hex: "#B6B1BA", name: "中灰", codes: { MARD: "H03", COCO: "B03", 漫漫: "F3" } },
  { hex: "#89858C", name: "石灰", codes: { MARD: "H04", COCO: "B05", 漫漫: "F4" } },
  { hex: "#48464E", name: "炭灰", codes: { MARD: "H05", COCO: "B06", 漫漫: "F5" } },
  { hex: "#2F2B2F", name: "墨灰", codes: { MARD: "H06", COCO: "B07", 漫漫: "F6" } },
  { hex: "#000000", name: "黑色", codes: { MARD: "H07", COCO: "B09", 漫漫: "F7" } },
  { hex: "#FAF4C8", name: "奶油黄", codes: { MARD: "A01", COCO: "E02", 漫漫: "E2" } },
  { hex: "#FFFFD5", name: "浅黄", codes: { MARD: "A02", COCO: "E01", 漫漫: "B1" } },
  { hex: "#FEFF8B", name: "柠檬黄", codes: { MARD: "A03", COCO: "E05", 漫漫: "B2" } },
  { hex: "#FBED56", name: "鲜黄", codes: { MARD: "A04", COCO: "E07", 漫漫: "B3" } },
  { hex: "#F4D738", name: "向日葵", codes: { MARD: "A05", COCO: "D03", 漫漫: "B4" } },
  { hex: "#FEAC4C", name: "蜜橙", codes: { MARD: "A06", COCO: "D05", 漫漫: "B5" } },
  { hex: "#FE8B4C", name: "橙色", codes: { MARD: "A07", COCO: "D08", 漫漫: "B6" } },
  { hex: "#FD543D", name: "珊瑚橙", codes: { MARD: "A14", COCO: "C05", 漫漫: "B14" } },
  { hex: "#FD957B", name: "淡珊瑚", codes: { MARD: "F01", COCO: "K08", 漫漫: "A1" } },
  { hex: "#FC3D46", name: "朱红", codes: { MARD: "F02", COCO: "C02", 漫漫: "A2" } },
  { hex: "#E7002F", name: "正红", codes: { MARD: "F05", COCO: "C07", 漫漫: "A5" } },
  { hex: "#943630", name: "砖红", codes: { MARD: "F06", COCO: "Z21", 漫漫: "E9" } },
  { hex: "#5A2121", name: "深褐红", codes: { MARD: "F11", COCO: "Z23", 漫漫: "E16" } },
  { hex: "#FDD3CC", name: "贝壳粉", codes: { MARD: "E01", COCO: "K03", 漫漫: "E1" } },
  { hex: "#FEC0DF", name: "浅粉", codes: { MARD: "E02", COCO: "K15", 漫漫: "A7" } },
  { hex: "#E8649E", name: "樱花粉", codes: { MARD: "E04", COCO: "K21", 漫漫: "A9" } },
  { hex: "#F13D74", name: "玫红", codes: { MARD: "E06", COCO: "K22", 漫漫: "A11" } },
  { hex: "#C63478", name: "树莓", codes: { MARD: "E07", COCO: "K25", 漫漫: "A12" } },
  { hex: "#FFDBE9", name: "雾粉", codes: { MARD: "E08", COCO: "K12", 漫漫: "A13" } },
  { hex: "#E2D3FF", name: "浅薰衣草", codes: { MARD: "D08", COCO: "J03", 漫漫: "D16" } },
  { hex: "#AEB4F2", name: "雾蓝紫", codes: { MARD: "D01", COCO: "J07", 漫漫: "D5" } },
  { hex: "#858EDD", name: "矢车菊紫", codes: { MARD: "D02", COCO: "J08", 漫漫: "D6" } },
  { hex: "#AC7BDE", name: "薰衣草", codes: { MARD: "D06", COCO: "J11", 漫漫: "D14" } },
  { hex: "#8854B3", name: "葡萄紫", codes: { MARD: "D07", COCO: "J15", 漫漫: "D12" } },
  { hex: "#361851", name: "深紫", codes: { MARD: "D10", COCO: "J19", 漫漫: "D15" } },
  { hex: "#D5FDFF", name: "冰蓝", codes: { MARD: "C14", COCO: "H02", 漫漫: "D29" } },
  { hex: "#A0E2FB", name: "浅天蓝", codes: { MARD: "C03", COCO: "H04", 漫漫: "D2" } },
  { hex: "#41CCFF", name: "天蓝", codes: { MARD: "C04", COCO: "H05", 漫漫: "D3" } },
  { hex: "#01ACEB", name: "晴空蓝", codes: { MARD: "C05", COCO: "H07", 漫漫: "D7" } },
  { hex: "#3677D2", name: "湖蓝", codes: { MARD: "C07", COCO: "H13", 漫漫: "D8" } },
  { hex: "#0F54C0", name: "宝蓝", codes: { MARD: "C08", COCO: "H14", 漫漫: "D9" } },
  { hex: "#1C334D", name: "深海蓝", codes: { MARD: "C12", COCO: "H23", 漫漫: "D26" } },
  { hex: "#28DDDE", name: "青蓝", codes: { MARD: "C11", COCO: "H10", 漫漫: "D28" } },
  { hex: "#22C4C6", name: "孔雀蓝", codes: { MARD: "C15", COCO: "H11", 漫漫: "D31" } },
  { hex: "#C2F0CC", name: "薄荷绿", codes: { MARD: "B20", COCO: "G02", 漫漫: "DH10" } },
  { hex: "#9EF780", name: "嫩绿", codes: { MARD: "B03", COCO: "F04", 漫漫: "C7" } },
  { hex: "#5DE035", name: "草绿", codes: { MARD: "B04", COCO: "F09", 漫漫: "C3" } },
  { hex: "#65E2A6", name: "清新绿", codes: { MARD: "B06", COCO: "G04", 漫漫: "C9" } },
  { hex: "#3DAF80", name: "翡翠绿", codes: { MARD: "B07", COCO: "G05", 漫漫: "C10" } },
  { hex: "#1C9C4F", name: "绿色", codes: { MARD: "B08", COCO: "F11", 漫漫: "C5" } },
  { hex: "#27523A", name: "森林绿", codes: { MARD: "B09", COCO: "F16", 漫漫: "C6" } },
  { hex: "#E8FFE7", name: "极浅绿", codes: { MARD: "C01", COCO: "G01", 漫漫: "C8" } },
  { hex: "#FFE2CE", name: "浅肤色", codes: { MARD: "G01", COCO: "Z02", 漫漫: "E3" } },
  { hex: "#FFC4AA", name: "肤色", codes: { MARD: "G02", COCO: "Z05", 漫漫: "E4" } },
  { hex: "#E1B383", name: "浅驼", codes: { MARD: "G04", COCO: "Z08", 漫漫: "E6" } },
  { hex: "#EDB045", name: "焦糖", codes: { MARD: "G05", COCO: "Z10", 漫漫: "B7" } },
  { hex: "#D98C39", name: "黄褐", codes: { MARD: "G10", COCO: "Z15", 漫漫: "B9" } },
  { hex: "#9D5B3E", name: "橡木褐", codes: { MARD: "G07", COCO: "Z18", 漫漫: "E7" } },
  { hex: "#753832", name: "深褐", codes: { MARD: "G08", COCO: "Z22", 漫漫: "E8" } },
  { hex: "#78524B", name: "灰褐", codes: { MARD: "G17", COCO: "Z16", 漫漫: "E22" } },
];

export const BRAND_OPTIONS: Brand[] = ["MARD", "COCO", "漫漫"];
