import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowDownToLine,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Download,
  FileText,
  Layers3,
  Menu,
  Moon,
  PanelRight,
  Printer,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { annualSamples, chartProfile, currentYear, majorLimits, parsedPalaces } from "../lib/chartData";
import { createWorker } from "tesseract.js";

type Mode = "本命" | "大限" | "流年";
type StarKind = "主星" | "輔星" | "雜耀";
type FourTransform = "祿" | "權" | "科" | "忌";

type StarItem = {
  name: string;
  kind: StarKind;
  transform?: FourTransform;
  markers?: { transform: FourTransform; source: "本命" | "自化" | "向心" }[];
  tone?: "red" | "green" | "blue" | "purple" | "neutral";
  note?: string;
  source?: "本命" | "自化" | "向心";
};

type Palace = {
  name: string;
  branch: string;
  stem: string;
  position: string;
  stars: StarItem[];
  body?: boolean;
  empty?: boolean;
  focus: string;
  theme: string;
};

const palaceNames = ["命宮", "兄弟宮", "夫妻宮", "子女宮", "財帛宮", "疾厄宮", "遷移宮", "交友宮", "官祿宮", "田宅宮", "福德宮", "父母宮"];

const mainStars = ["紫微", "天機", "太陽", "武曲", "天同", "廉貞", "天府", "太陰", "貪狼", "巨門", "天相", "天梁", "七殺", "破軍"];
const supportingStars = ["左輔", "右弼", "文昌", "文曲", "天魁", "天鉞", "火星", "鈴星", "擎羊", "陀羅", "地空", "地劫"];
const minorStars = ["祿存", "天馬", "紅鸞", "天喜", "天姚", "天刑", "咸池"];
const wordMinorWhitelist = new Set(minorStars);

const wordPalaceMeanings: Record<string, string> = {
  命宮: "看個性、外貌、人生主軸與先天格局；先看本宮主星輔星，再合看三方四正。",
  兄弟宮: "看手足、母親、合夥夥伴與扶持系統，也可觀察合作中的資源交換。",
  夫妻宮: "看伴侶特質、親密關係與婚姻互動，並參考官祿宮對待關係。",
  子女宮: "看子女、晚輩、興趣、創作與親信，也代表享受與投資回收。",
  財帛宮: "看理財、賺錢方式與現金流；財帛看能賺，田宅看能否留下。",
  疾厄宮: "看身體、疾病、壓力與意外；煞忌多時優先檢查健康與安全。",
  遷移宮: "看出外活動力、陌生環境、遠方發展與外在人際圈。",
  交友宮: "看朋友、同事、部屬、投資朋友與工作上的工具性人脈。",
  官祿宮: "看工作行業、事業形式、主管關係與公司順逆異動。",
  田宅宮: "看住家、環境、財庫、房產與家運變動；化祿或祿存有置產訊號。",
  福德宮: "看精神狀態、情緒、來財之源與晚年享受；吉祿多則較能放鬆。",
  父母宮: "看父母、長輩、政府與大機構，也影響健康、外貌與命格高低。",
};

const wordTransformMeanings: Record<string, string> = {
  化祿: "人物與資源增加、事件較容易獲利或得到；仍須檢查三方是否有忌、空劫沖破。",
  化權: "主掌控、執行、競爭與責任加重；事件常需要主動爭取、承擔權力。",
  化科: "主名聲、學習、證照、文書與被看見；常是錦上添花或由暗轉明。",
  化忌: "主阻滯、內耗、誤解與代價；依落宮判斷是哪一類生活議題需要修正。",
};

const questionCategories = ["感情婚姻", "工作事業", "財務投資", "健康安全", "家庭長輩", "人際合作", "其他"] as const;

type BirthInput = {
  date: string;
  time: string;
  gender: "男" | "女";
  longitude: string;
};

const heavenlyStems = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const earthlyBranches = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

function getYearPillar(year: number) {
  return `${heavenlyStems[((year - 4) % 10 + 10) % 10]}${earthlyBranches[((year - 4) % 12 + 12) % 12]}`;
}

function getHourBranch(time: string) {
  const hour = Number(time.split(":")[0]);
  return earthlyBranches[Math.floor(((hour + 1) % 24) / 2)];
}

const seedPalaces: Palace[] = [
  { name: "命宮", branch: "子", stem: "甲", position: "01", body: true, focus: "命主性格、核心氣質與一生主軸", theme: "本命主題：先天人格與人生主線", stars: [{ name: "紫微", kind: "主星", transform: "科", tone: "red", note: "皇帝之星，重視格局與掌控感" }, { name: "天相", kind: "主星", note: "宰相之星，受環境與兩側星曜影響" }, { name: "左輔", kind: "輔星", note: "男性貴人與協助" }, { name: "文昌", kind: "輔星", note: "文字、學習與表達" }, { name: "紅鸞", kind: "雜耀", note: "正緣與喜慶訊號" }] },
  { name: "兄弟宮", branch: "丑", stem: "乙", position: "02", focus: "手足、母親、夥伴與扶持系統", theme: "扶持系統：親族與合作夥伴", stars: [{ name: "天機", kind: "主星", transform: "權", tone: "red", note: "思考、變動、策畫" }, { name: "巨門", kind: "主星", note: "溝通、洞察與口舌" }, { name: "天魁", kind: "輔星", note: "男性長輩貴人" }, { name: "天喜", kind: "雜耀", note: "喜事與關係緩和" }] },
  { name: "夫妻宮", branch: "寅", stem: "丙", position: "03", focus: "親密關係、伴侶特質與婚姻對待", theme: "關係鏡像：選擇與相處方式", stars: [{ name: "太陰", kind: "主星", transform: "祿", tone: "red", note: "內在感受、照顧與財庫" }, { name: "貪狼", kind: "主星", transform: "忌", tone: "green", note: "桃花、慾望與人際張力" }, { name: "右弼", kind: "輔星", note: "女性貴人與協調" }, { name: "天姚", kind: "雜耀", note: "才藝、魅力與桃花" }] },
  { name: "子女宮", branch: "卯", stem: "丁", position: "04", focus: "子女、寵物、興趣與外出家庭牽動", theme: "延伸與創作：生命力的出口", stars: [{ name: "七殺", kind: "主星", note: "獨立、衝刺與強烈意志" }, { name: "天同", kind: "主星", transform: "科", tone: "blue", note: "享樂、福氣與人和" }, { name: "擎羊", kind: "輔星", note: "刀鋒、衝動與剖腹訊號" }, { name: "天馬", kind: "雜耀", note: "奔波、移動與跨域" }] },
  { name: "財帛宮", branch: "辰", stem: "戊", position: "05", focus: "現金流、理財能力與賺錢偏好", theme: "財流入口：能賺、能留、能享", stars: [{ name: "武曲", kind: "主星", transform: "祿", tone: "red", note: "財帛主，重視效率與實際回報" }, { name: "天府", kind: "主星", transform: "權", tone: "green", note: "庫府與資源整合" }, { name: "文曲", kind: "輔星", note: "藝術、內容與文件型財路" }, { name: "祿存", kind: "雜耀", note: "額外財源與守成" }] },
  { name: "疾厄宮", branch: "巳", stem: "己", position: "06", focus: "體質、身心狀態與壓力反應", theme: "肉身訊號：狀態管理與生活節奏", stars: [{ name: "廉貞", kind: "主星", transform: "忌", tone: "red", note: "規則、情緒與身體警訊" }, { name: "天梁", kind: "主星", note: "庇蔭、醫療與修復" }, { name: "陀羅", kind: "輔星", note: "拖延、慢性壓力" }, { name: "天刑", kind: "雜耀", note: "刀傷、法律與規則感" }] },
  { name: "遷移宮", branch: "午", stem: "庚", position: "07", focus: "外在表現、出外運與陌生環境", theme: "外部舞台：被看見與遠方發展", stars: [{ name: "太陽", kind: "主星", transform: "權", tone: "blue", note: "名聲、領導與公共性" }, { name: "破軍", kind: "主星", note: "改變、創新與突破" }, { name: "天鉞", kind: "輔星", note: "女性長輩與貴人" }, { name: "咸池", kind: "雜耀", note: "人際吸引與情感波動" }] },
  { name: "交友宮", branch: "未", stem: "辛", position: "08", focus: "朋友、同事、部屬與合作關係", theme: "人脈網絡：資源交換與選擇", stars: [{ name: "天同", kind: "主星", transform: "祿", tone: "blue", note: "和氣、享受與人緣" }, { name: "巨門", kind: "主星", note: "討論、爭辯與洞察" }, { name: "地空", kind: "輔星", note: "忽然斷掉、虛擬與不確定" }, { name: "紅鸞", kind: "雜耀", note: "人際喜事與正緣" }] },
  { name: "官祿宮", branch: "申", stem: "壬", position: "09", focus: "工作型態、事業變動與主管關係", theme: "職業角色：方法、權責與舞台", stars: [{ name: "天相", kind: "主星", transform: "科", tone: "blue", note: "服務、仲介與二把手位置" }, { name: "紫微", kind: "主星", note: "管理、格局與決策" }, { name: "左輔", kind: "輔星", note: "團隊協助" }, { name: "天馬", kind: "雜耀", note: "跨域、移動與工作異動" }] },
  { name: "田宅宮", branch: "酉", stem: "癸", position: "10", focus: "住家、資產、財庫與家運變動", theme: "承載容器：房產與長期安全感", stars: [{ name: "天府", kind: "主星", transform: "祿", tone: "red", note: "庫府、資產與安定" }, { name: "太陰", kind: "主星", note: "居所、夜間與內在安全感" }, { name: "右弼", kind: "輔星", note: "家庭中的協調" }, { name: "天喜", kind: "雜耀", note: "搬遷、置產與家庭喜事" }] },
  { name: "福德宮", branch: "戌", stem: "甲", position: "11", focus: "精神狀態、靈魂感受與來財方法", theme: "內在能源：能否放鬆與享福", stars: [{ name: "天梁", kind: "主星", transform: "科", tone: "red", note: "庇蔭、教育與精神信念" }, { name: "七殺", kind: "主星", note: "獨立、孤獨與突破" }, { name: "文昌", kind: "輔星", note: "思考、閱讀與文字" }, { name: "天姚", kind: "雜耀", note: "審美、情感與創作" }] },
  { name: "父母宮", branch: "亥", stem: "乙", position: "12", focus: "父母、長輩、政府與大機構", theme: "上位影響：資源、規範與庇蔭", stars: [{ name: "破軍", kind: "主星", transform: "忌", tone: "green", note: "改革、破舊與父親角色變動" }, { name: "武曲", kind: "主星", note: "實際、硬派與財務觀" }, { name: "天魁", kind: "輔星", note: "長官與考試貴人" }, { name: "天刑", kind: "雜耀", note: "規則、法律與界線" }] },
];

const knowledge: Record<string, { category: string; summary: string; detail: string }> = {
  紫微: { category: "主星・北斗", summary: "皇帝之星，主格局與領導", detail: "重視身份、秩序與掌控全局的能力。入命偏向建立自己的系統；入官祿常與管理、品牌或決策位置相關。" },
  貪狼: { category: "主星・北斗", summary: "桃花、才藝、交際與慾望", detail: "事件常連結娛樂、藝術、人際與多元嗜好。落夫妻、交友或財帛時，要和紅鸞、天姚、咸池及四化一起看。" },
  巨門: { category: "主星・北斗", summary: "暗曜、口舌、洞察與吸納", detail: "擅長研究、辯論、記憶與看見事物暗面。化祿可轉為說話與知識收入，化忌則優先檢查誤解、合約與溝通成本。" },
  廉貞: { category: "主星・北斗", summary: "規則、邊界、外交與精神桃花", detail: "重視原則、界線與體面，亦可表現為藝術、建築、法律或外交。凶化時留意官非、情緒壓力與身心警訊。" },
  武曲: { category: "主星・北斗", summary: "財帛主，主執行與現金", detail: "重視效率、結果與可量化回報。吉化偏向財流增強，凶化則留意財務壓力、過度硬撐與關係中的實際衝突。" },
  破軍: { category: "主星・北斗", summary: "破舊、開創、改變與消耗", detail: "擅長在變動中重建系統，不喜歡長期受同一套規則限制。化祿可成為創新動能，化忌時要管理風險與資源耗損。" },
  天府: { category: "主星・南斗", summary: "庫府、資源、安定與承載", detail: "重視可累積的資產、資源與管理能力。與天相同時出現時，啟用逢府看相規則，將兩側星曜納入天相判讀。" },
  天梁: { category: "主星・南斗", summary: "庇蔭、教育、醫療與修復", detail: "常表現為照顧、解厄、教育、法律、醫療或宗教信念。落福德可支持精神修復；落疾厄要看身心保養與壓力承擔。" },
  天機: { category: "主星・南斗", summary: "思考、變化、策畫與交通", detail: "反應快、善於拆解問題與規劃路線。化祿偏向知識與解決方案，化忌要留意反覆、交通與決策焦慮。" },
  天同: { category: "主星・南斗", summary: "享樂、福氣、人和與舒適", detail: "尋找舒服、和諧與被照顧的環境。吉化可增添人緣與享受，凶化時留意拖延、過度安逸與身體代謝。" },
  天相: { category: "主星・南斗", summary: "宰相之星，主服務與承接", detail: "容易受周遭環境與兩側星曜影響。遇到天相時，依逢府看相／天相吸兩邊規則，把左右兩宮的主星、輔星、雜耀複製納入，再按四化優先排序。" },
  七殺: { category: "主星・南斗", summary: "將星、衝刺、獨立與孤剋", detail: "直來直往、重效率與突破，適合在明確目標下獨立完成任務。落夫妻、兄弟或疾厄時，留意距離感與過度硬撐。" },
  太陽: { category: "中天主星", summary: "名聲、領導、公共性與父夫子", detail: "與被看見、領導、外國及公共舞台有關。亮度與四化需分開看，化權更強調責任、權力與曝光。" },
  太陰: { category: "中天主星", summary: "內在、照顧、財庫與夜間", detail: "與情緒、安全感、女性長輩、居所及資產有關。落財帛、田宅或夫妻時，需連動內在需求與實際承載。" },
  文昌: { category: "輔星・六吉", summary: "文字、學習與文件能力", detail: "與文書、考試、表達、知識整理及理性溝通有關；與文曲同宮時，內容、藝術與文件能力更明顯。" },
  文曲: { category: "輔星・六吉", summary: "藝術、審美與柔性表達", detail: "補充音樂、藝術、審美、社交與內容創作。遇化忌時，檢查情緒化表達、合約文字及玩樂支出。" },
  天魁: { category: "輔星・六吉", summary: "男性長輩與明顯貴人", detail: "代表男性長輩、主管、制度內的提攜與明顯助力。要和父母、官祿及三方四正一起判斷貴人是否能落地。" },
  天鉞: { category: "輔星・六吉", summary: "女性長輩與暗中提攜", detail: "代表女性長輩、柔性資源與關鍵時刻的協助。可補足魁鉞在工作、考試與人際中的貴人路徑。" },
  左輔: { category: "輔星・六吉", summary: "男性貴人、團隊協助與加成", detail: "偏向可被看見的支援、同事與男性夥伴。與官祿、交友或福德連動時，常表現為有人一起完成事情。" },
  右弼: { category: "輔星・六吉", summary: "女性貴人、協調與補位", detail: "偏向柔性協調、女性夥伴與關係中的補位。和天相、夫妻、父母同看可了解受環境影響的程度。" },
  火星: { category: "輔星・四煞", summary: "瞬間爆炸、快速啟動", detail: "增加事件速度、衝動與突發性。遇財帛、疾厄或田宅時，需把快速進出、火氣與意外風險列入參看。" },
  鈴星: { category: "輔星・四煞", summary: "壓抑後爆炸、內在緊繃", detail: "常把壓力收在內部，累積後一次釋放。宜和命宮、福德及流年四化合看，不單獨判定吉凶。" },
  擎羊: { category: "輔星・四煞", summary: "刀鋒、衝動與切割", detail: "補充割傷、手術、衝突、切割與直接行動。遇疾厄或天刑時，建議把安全、醫療與規則風險列為提醒。" },
  陀羅: { category: "輔星・四煞", summary: "拖延、折磨與慢性阻力", detail: "代表事情卡住、慢性壓力與反覆處理。搭配化忌時應檢查拖款、慢性健康與關係中未解決的問題。" },
  地空: { category: "輔星・空星", summary: "忽然斷掉、虛擬與落空", detail: "事件可能忽然停止、消失或轉成虛擬形式。與財帛、官祿或疾厄同看，注意計畫備援與資源落空。" },
  地劫: { category: "輔星・空星", summary: "忽然被搶走、耗損與失去", detail: "補充資源被挪用、損耗與無法保留。遇田宅、財帛或父母時，宜留意財產、制度與長輩資源。" },
  祿存: { category: "雜耀・本命／大限／流年", summary: "額外資源與守成", detail: "你指定保留的雜耀。落財帛常象徵額外理財方式，落田宅常象徵多一個財庫或房產議題；需與化祿區分。" },
  天馬: { category: "雜耀・移動", summary: "奔波、異動與跨域", detail: "補充移動、出差、轉換跑道、遠行或跨境議題。與四化同時出現時，將移動性和該四化主題疊加。" },
  紅鸞: { category: "雜耀・桃花", summary: "正緣與喜慶訊號", detail: "適合與夫妻宮、子女宮及流年訊號一起參看，不單獨作為婚姻定論。" },
  天喜: { category: "雜耀・喜慶", summary: "喜事、關係緩和與好消息", detail: "補充宴會、喜慶、家庭事件與人際緩和。落流年時可作為事件氛圍的加分訊號。" },
  天姚: { category: "雜耀・桃花", summary: "風流、魅力與才藝桃花", detail: "補充審美、表演、魅力與關係中的曖昧感。與貪狼、紅鸞、咸池同現時，桃花題材更需要分層判斷。" },
  天刑: { category: "雜耀・規則", summary: "官非、刀傷與界線", detail: "補充法律、規範、手術、刀傷與界線議題。遇疾厄、父母或流年化忌時，應列為實務提醒。" },
  咸池: { category: "雜耀・桃花", summary: "人際吸引與情感波動", detail: "補充社交吸引力、情感波動與娛樂性桃花。需和夫妻、交友及四化疊加，不單獨推論事件結果。" },
};

const transformClass: Record<string, string> = {
  red: "text-rose-600 bg-rose-50 border-rose-200",
  purple: "text-violet-700 bg-violet-50 border-violet-200",
  green: "text-emerald-700 bg-emerald-50 border-emerald-200",
  blue: "text-sky-700 bg-sky-50 border-sky-200",
  neutral: "text-slate-600 bg-slate-50 border-slate-200",
};

function getTransformColor(tone?: string) {
  return tone && transformClass[tone] ? transformClass[tone] : transformClass.neutral;
}

function getRelatedPalaces(index: number) {
  const branches = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
  const hiddenPair: Record<string, string> = { 子: "丑", 丑: "子", 寅: "亥", 亥: "寅", 卯: "戌", 戌: "卯", 辰: "酉", 酉: "辰", 巳: "申", 申: "巳", 午: "未", 未: "午" };
  const hiddenBranch = hiddenPair[branches[index]];
  return {
    trine: [(index + 4) % 12, (index + 8) % 12],
    opposite: (index + 6) % 12,
    adjacent: [(index + 11) % 12, (index + 1) % 12],
    hidden: branches.indexOf(hiddenBranch),
  };
}

function StarBadge({ star, compact = false }: { star: StarItem; compact?: boolean }) {
  const style = getTransformColor(star.tone);

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium ${compact ? "text-[10px]" : "text-[11px]"} ${style}`}>
      {star.name}
      {star.markers?.map((marker) => <b key={`${marker.source}-${marker.transform}`} className="font-serif">{marker.source}化{marker.transform}</b>)}
      {!star.markers?.length && star.transform && <b className="font-serif">化{star.transform}</b>}
    </span>
  );
}

const branchGridArea: Record<string, string> = {
  子: "4 / 3", 丑: "4 / 2", 寅: "4 / 1", 卯: "3 / 1", 辰: "2 / 1", 巳: "1 / 1",
  午: "1 / 2", 未: "1 / 3", 申: "1 / 4", 酉: "2 / 4", 戌: "3 / 4", 亥: "4 / 4",
};

function PalaceCell({ palace, index, selected, onClick, activeMode, majorTransforms, annualTransforms, majorPalaceLabel, annualPalaceLabel, majorOverlayStars, annualOverlayStars }: { palace: Palace; index: number; selected: boolean; onClick: () => void; activeMode: Mode; majorTransforms?: Record<string, FourTransform>; annualTransforms?: Record<string, FourTransform>; majorPalaceLabel?: string; annualPalaceLabel?: string; majorOverlayStars?: string[]; annualOverlayStars?: string[] }) {
  const modeStar = palace.stars.find((s) => (activeMode === "本命" ? s.tone === "red" : activeMode === "大限" ? s.tone === "green" : s.tone === "blue"));

  return (
    <button onClick={onClick} style={{ gridArea: branchGridArea[palace.branch] }} className={`palace-cell group text-left ${selected ? "is-selected" : ""}`} aria-label={`選擇${palace.name}`}>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-slate-400">
        <span>{palace.position}</span>
        {palace.body ? <span className="rounded bg-[#f4e5bf] px-1.5 py-0.5 font-semibold text-[#8b631e]">身宮</span> : <span>{palace.branch}・{palace.stem}</span>}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-serif text-lg font-bold tracking-wide text-[#241b3d]">{palace.name}</span>
        {modeStar && <span className={`h-2 w-2 rounded-full ${activeMode === "本命" ? "bg-rose-500" : activeMode === "大限" ? "bg-emerald-500" : "bg-sky-500"}`} />}
      </div>
      <div className="mt-2 space-y-1.5">
        {palace.stars.filter((star, starIndex) => starIndex < 3 || Boolean(majorTransforms?.[star.name]) || Boolean(annualTransforms?.[star.name]) || Boolean(star.markers?.length)).slice(0, 5).map((star) => <div key={star.name} className="flex items-center justify-between gap-1 text-xs text-slate-600"><span>{star.name}</span><span className="flex flex-wrap justify-end gap-1">{star.markers?.map((marker) => <b key={`${marker.source}-${marker.transform}`} className="font-bold text-rose-600">本命化{marker.transform}</b>)}{!star.markers?.length && star.transform && <b className="font-bold text-rose-600">本命化{star.transform}</b>}{majorTransforms?.[star.name] && <b className="font-bold text-emerald-600">大限化{majorTransforms[star.name]}</b>}{annualTransforms?.[star.name] && <b className="font-bold text-sky-600">流年化{annualTransforms[star.name]}</b>}</span></div>)}
        {activeMode !== "本命" && majorPalaceLabel && <div className="text-[10px] font-bold text-emerald-600">大限・{majorPalaceLabel}</div>}
        {activeMode === "流年" && annualPalaceLabel && <div className="text-[10px] font-bold text-sky-600">流年・{annualPalaceLabel}</div>}
        {activeMode !== "本命" && majorOverlayStars?.map((name) => <div key={`major-${name}`} className="text-xs font-semibold text-emerald-600">大限・{name}</div>)}
        {activeMode === "流年" && annualOverlayStars?.map((name) => <div key={`annual-${name}`} className="text-xs font-semibold text-sky-600">流年・{name}</div>)}
        {palace.stars.length > 3 && <div className="pt-0.5 text-[10px] text-slate-400">＋{palace.stars.length - 3} 顆輔星／雜耀</div>}
      </div>
      <div className="absolute bottom-3 right-3 h-1.5 w-1.5 rounded-full bg-[#cfa95b] opacity-0 transition group-hover:opacity-100" />
    </button>
  );
}

function parseParsedStars(raw: string, kind: StarKind): StarItem[] {
  if (!raw || raw === "無") return [];
  return raw.split(",").filter(Boolean).map((token) => {
    const name = token.replace(/\[[^\]]+\]/g, "");
    const natal = token.match(/\[生年([祿權科忌])\]/)?.[1] as FourTransform | undefined;
    const markers = natal ? [{ transform: natal, source: "本命" as const }] : [];
    return { name, kind, transform: natal, markers, tone: natal ? "red" : "neutral", note: token };
  });
}

function parseTransformMap(raw: string) {
  const map: Record<string, FourTransform> = {};
  const pattern = /([^、，,\s]+?)(祿|權|科|忌)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) map[match[1]] = match[2] as FourTransform;
  return map;
}


function palaceStars(palace: Palace) { return palace.stars; }
function hasStar(palaces: Palace[], names: string[]) { return palaces.some((palace) => palace.stars.some((star) => names.includes(star.name))); }
function hasFourTransform(palaces: Palace[], transform: FourTransform, majorMap: Record<string, FourTransform>, annualMap: Record<string, FourTransform>) {
  return palaces.some((palace) => palace.stars.some((star) => star.transform === transform || majorMap[star.name] === transform || annualMap[star.name] === transform));
}

const branchOrder = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const locunByStem: Record<string, string> = { 甲: "寅", 乙: "卯", 丙: "巳", 戊: "巳", 丁: "午", 己: "午", 庚: "申", 辛: "酉", 壬: "亥", 癸: "子" };
const changQuByStem: Record<string, [string, string]> = { 甲: ["巳", "酉"], 乙: ["午", "申"], 丙: ["申", "子"], 丁: ["酉", "亥"], 戊: ["申", "子"], 己: ["酉", "亥"], 庚: ["亥", "巳"], 辛: ["子", "卯"], 壬: ["寅", "午"], 癸: ["卯", "丑"] };
const annualChangQuByStem: Record<string, [string, string]> = { 甲: ["巳", "酉"], 乙: ["午", "申"], 丙: ["未", "未"], 丁: ["申", "午"], 戊: ["酉", "巳"], 己: ["戌", "辰"], 庚: ["亥", "卯"], 辛: ["子", "寅"], 壬: ["丑", "丑"], 癸: ["寅", "子"] };
const kuiYueByStem: Record<string, [string, string]> = { 甲: ["丑", "未"], 戊: ["丑", "未"], 庚: ["丑", "未"], 乙: ["子", "申"], 己: ["子", "申"], 丙: ["亥", "酉"], 丁: ["亥", "酉"], 壬: ["卯", "巳"], 癸: ["卯", "巳"], 辛: ["午", "寅"] };
const sanHeHorse: Record<string, string> = { 申: "寅", 子: "寅", 辰: "寅", 寅: "申", 午: "申", 戌: "申", 巳: "亥", 酉: "亥", 丑: "亥", 亥: "巳", 卯: "巳", 未: "巳" };

function luanPosition(yearBranch: string) {
  const yearIndex = branchOrder.indexOf(yearBranch);
  return branchOrder[(3 - yearIndex + 12) % 12]; // 卯上起子，逆數
}

function flowStarsForPalace(palace: Palace, mode: "大限" | "流年", stem: string, branch: string) {
  const names: string[] = [];
  const locun = locunByStem[stem];
  const locunIndex = branchOrder.indexOf(locun);
  if (locunIndex >= 0) {
    if (palace.branch === locun) names.push(mode === "大限" ? "大祿存" : "流祿存");
    if (palace.branch === branchOrder[(locunIndex + 1) % 12]) names.push(mode === "大限" ? "大擎羊" : "流擎羊");
    if (palace.branch === branchOrder[(locunIndex + 11) % 12]) names.push(mode === "大限" ? "大陀羅" : "流陀羅");
  }
  const luan = luanPosition(branch);
  if (palace.branch === luan) names.push(mode === "大限" ? "大紅鸞" : "流紅鸞");
  if (palace.branch === branchOrder[(branchOrder.indexOf(luan) + 6) % 12]) names.push(mode === "大限" ? "大天喜" : "流天喜");
  return names;
}

function overlayStarsForPalace(palace: Palace, mode: Mode, major: typeof majorLimits[number], annual: (typeof annualSamples)[number]) {
  if (mode === "本命") return [];
  const source = mode === "大限" ? major.palace : annual.branch;
  const stem = source.slice(0, 1);
  const branch = source.slice(-1);
  return flowStarsForPalace(palace, mode, stem, branch);
}
function overlayPalaceLabel(palace: Palace, source: string, layer: "大限" | "流年") {
  const sourceBranch = source.slice(-1);
  const baseIndex = branchOrder.indexOf(palace.branch);
  const sourceIndex = branchOrder.indexOf(sourceBranch);
  if (baseIndex < 0 || sourceIndex < 0) return undefined;
  const distance = (sourceIndex - baseIndex + 12) % 12;
  const labels = ["命宮", "兄弟宮", "夫妻宮", "子女宮", "財帛宮", "疾厄宮", "遷移宮", "交友宮", "官祿宮", "田宅宮", "福德宮", "父母宮"];
  return `${labels[distance]}（${source}）`;
}
function displayDoubleStarRules(palace: Palace) {
  const main = palace.stars.filter((star) => star.kind === "主星").map((star) => star.name);
  if (main.length < 2) return [];
  const notes = [`${main.join("＋")}：Word 雙主星規則成立，需把兩顆主星共同判讀。`];
  if (main.includes("太陽") && main.includes("太陰")) notes.push("太陽太陰：白天／晚上、兼職或與國外相關題材。");
  if (palace.name === "財帛宮") notes.push("財帛宮雙星：可能對應兩種投資或兩種賺錢方式。");
  if (palace.name === "官祿宮") notes.push("官祿宮雙主星：可能對應兩種工作型態。");
  return notes;
}

function displayStar(star: StarItem, majorMap: Record<string, FourTransform>, annualMap: Record<string, FourTransform>) {
  const labels = [...(star.markers || []).map((marker) => `本命化${marker.transform}`)];
  if (majorMap[star.name]) labels.push(`大限化${majorMap[star.name]}`);
  if (annualMap[star.name]) labels.push(`流年化${annualMap[star.name]}`);
  return `${star.name}${labels.length ? `（${labels.join("、")}）` : ""}`;
}

const wordClampPairs = [["紫微", "天府"], ["太陽", "太陰"], ["文昌", "文曲"], ["左輔", "右弼"], ["火星", "鈴星"], ["地空", "地劫"], ["擎羊", "陀羅"]];
function isFourTransformed(star: StarItem, majorMap: Record<string, FourTransform>, annualMap: Record<string, FourTransform>) {
  return Boolean(star.markers?.length || star.transform || majorMap[star.name] || annualMap[star.name]);
}
function getBorrowedStars(selected: Palace, opposite: Palace, majorMap: Record<string, FourTransform>, annualMap: Record<string, FourTransform>) {
  const hasMainStars = selected.stars.some((star) => star.kind === "主星");
  return hasMainStars ? selected.stars : opposite.stars.map((star) => ({ ...star, note: `借對宮・${star.note || ""}` }));
}
function getClampStars(left: Palace, right: Palace, majorMap: Record<string, FourTransform>, annualMap: Record<string, FourTransform>) {
  const leftNames = new Set(left.stars.map((star) => star.name));
  const rightNames = new Set(right.stars.map((star) => star.name));
  const activePairNames = new Set(wordClampPairs.flatMap(([a, b]) => ((leftNames.has(a) && rightNames.has(b)) || (leftNames.has(b) && rightNames.has(a))) ? [a, b] : []));
  const leftTransforms = left.stars.filter((star) => isFourTransformed(star, majorMap, annualMap));
  const rightTransforms = right.stars.filter((star) => isFourTransformed(star, majorMap, annualMap));
  const pairActive = activePairNames.size > 0;
  const leftTransformKinds = new Set<string>(leftTransforms.flatMap((star) => [star.transform, majorMap[star.name], annualMap[star.name]].filter(Boolean) as string[]));
  const rightTransformKinds = new Set<string>(rightTransforms.flatMap((star) => [star.transform, majorMap[star.name], annualMap[star.name]].filter(Boolean) as string[]));
  const transformActive = ["祿", "權", "科", "忌"].some((transform) => leftTransformKinds.has(transform) && rightTransformKinds.has(transform));
  if (!pairActive && !transformActive) return [];
  return [
    ...left.stars.filter((star) => (pairActive && activePairNames.has(star.name)) || (transformActive && isFourTransformed(star, majorMap, annualMap))).map((star) => ({ ...star, palaceName: left.name })),
    ...right.stars.filter((star) => (pairActive && activePairNames.has(star.name)) || (transformActive && isFourTransformed(star, majorMap, annualMap))).map((star) => ({ ...star, palaceName: right.name })),
  ];
}

function buildBreakPatterns(selected: Palace, related: { trine: number[]; opposite: number; adjacent: number[]; hidden: number }, palaces: Palace[], majorMap: Record<string, FourTransform>, annualMap: Record<string, FourTransform>) {
  const trinePalaces = [...related.trine, related.opposite].map((index) => palaces[index]);
  const adjacentPalaces = related.adjacent.map((index) => palaces[index]);
  const all = [selected, ...trinePalaces, ...adjacentPalaces, palaces[related.hidden]];
  const names = (list = all) => list.flatMap((palace) => palace.stars.map((star) => star.name));
  const hasT = (t: FourTransform, list = all) => hasFourTransform(list, t, majorMap, annualMap);
  const n = names();
  const results: { name: string; meaning: string }[] = [];
  const add = (condition: boolean, name: string, meaning: string) => { if (condition) results.push({ name, meaning }); };
  add((hasT("祿") || n.includes("祿存")) && (hasT("忌") || hasStar(all, ["地空", "地劫"])), "祿逢沖破", "化祿／祿存遇化忌或空劫，吉中藏兇，容易白忙一場。");
  add((hasT("祿") || n.includes("祿存")) && (hasT("忌") || (hasStar(all, ["地空", "地劫"]) && n.includes("天馬"))), "祿空馬倒", "化祿／祿存遇化忌，或空劫加天馬，表示走投無路。");
  add(n.includes("天馬") && hasStar(all, ["擎羊", "陀羅"]) && hasStar(all, ["地空", "地劫"]), "馬落空亡", "天馬遇羊陀與空劫，表示滯礙重重。");
  add(hasStar([selected], ["廉貞", "天相", "擎羊"]) && hasT("忌", [selected]), "廉相羊", "廉貞、天相、擎羊與化忌同宮，需留意法律問題與官非。");
  add(hasStar([selected], ["廉貞", "七殺", "擎羊"]) && hasT("忌", [selected]), "廉殺羊", "廉貞、七殺、擎羊與化忌同宮，需留意官非、凶傷與挫折。");
  add(selected.name === "天相" && hasStar(adjacentPalaces, ["天梁", "天刑"]) && (hasT("忌", adjacentPalaces) || hasStar(adjacentPalaces, ["陀羅"])), "刑忌夾印", "天相前後有刑忌，表示壓力極大或容易被人連累。");
  add(selected.name === "天相" && (hasT("祿", adjacentPalaces) || hasStar(adjacentPalaces, ["祿存"])) && hasStar(adjacentPalaces, ["天梁"]), "財蔭夾印", "天相前後有財蔭，表示有人分擔壓力、貴人多。");
  add(hasStar(adjacentPalaces, ["擎羊"]) && hasStar(adjacentPalaces, ["陀羅"]) && hasT("忌", [selected, ...adjacentPalaces]), "羊陀夾忌", "化忌前後有羊陀，表示破財或因財惹禍。");
  add(hasStar(adjacentPalaces, ["火星"]) && hasStar(adjacentPalaces, ["鈴星"]) && hasT("忌", [selected, ...adjacentPalaces]), "火鈴夾忌", "化忌前後有火鈴，需留意災厄與傷病。");
  add(hasT("忌", [selected, ...adjacentPalaces]) && adjacentPalaces.filter((palace) => palace.stars.some((star) => star.transform === "忌" || majorMap[star.name] === "忌" || annualMap[star.name] === "忌")).length >= 2, "雙忌夾", "雙化忌形成夾制，表示四面楚歌、孤立無援。");
  add(hasStar(trinePalaces, ["火星", "鈴星"]) && hasStar(trinePalaces, ["貪狼"]), "火貪／鈴貪", "三方四正有火鈴與貪狼，表示橫財來的機遇。");
  add(hasStar(trinePalaces, ["文昌", "文曲"]) && hasStar(trinePalaces, ["貪狼"]), "昌貪／曲貪", "三方四正有昌曲與貪狼，表示做事可能顛倒、不按常理出牌。");
  add(selected.name === "巨門" && hasStar(trinePalaces, ["火星", "擎羊"]), "巨火羊", "巨門三方四正有火羊，表示口舌之災。");
  add(selected.name === "巨門" && hasStar(trinePalaces, ["火星", "鈴星", "擎羊", "陀羅"]), "巨逢四煞", "巨門三方四正有四煞，表示一說話就容易倒楣。");
  add(selected.name === "貪狼" && hasStar([selected], ["擎羊", "陀羅"]), "風流彩杖", "貪狼與羊陀同宮，表示可能因桃花而破財或招災。");
  add(["子", "亥"].includes(selected.branch) && n.includes("貪狼"), "泛水桃花", "貪狼在子亥位，逢煞時容易有桃花災。");
  add(n.includes("紫微") && n.includes("貪狼") && hasStar(all, ["紅鸞", "天喜", "天姚", "咸池"]), "桃花犯主", "紫貪同見且三方四正有桃花星，表示桃花過重、思想較開放。");
  add(["子", "亥"].includes(selected.branch) && n.includes("破軍") && hasStar(all, ["文曲"]) && hasT("忌"), "水中作塚", "破軍在子亥位遇文曲化忌，需留意水象、反覆與言語詐騙。");
  add(n.includes("太陰") && hasStar(all, ["火星", "鈴星"]), "十惡格", "太陰遇火鈴，表示脾氣怪異、暴躁反覆，需留意招災與水象問題。");
  return results;
}

const realPalaces: Palace[] = parsedPalaces.map((p, index) => ({
  name: p.name, branch: p.branch.slice(-1), stem: p.branch.slice(0, -1), position: String(index + 1).padStart(2, "0"), body: p.isBody, focus: `${p.extra ? `${p.extra}・` : ""}${p.limit}｜流年 ${p.yearly}`, theme: p.extra || "文墨天機實盤",
  stars: [...parseParsedStars(p.main, "主星"), ...parseParsedStars(p.support, "輔星"), ...parseParsedStars(p.minor, "雜耀")].filter((star) => star.kind !== "雜耀" || wordMinorWhitelist.has(star.name)),
}));

export default function Home() {
  const [activeTab, setActiveTab] = useState("命盤總覽");
  const [activeMode, setActiveMode] = useState<Mode>("本命");
  const [showBirthForm, setShowBirthForm] = useState(false);
  const [birthInput, setBirthInput] = useState<BirthInput>({ date: "1981-04-06", time: "18:00", gender: "男", longitude: "121.300" });
  const [appliedBirth, setAppliedBirth] = useState<BirthInput>({ date: "1981-04-06", time: "18:00", gender: "男", longitude: "121.300" });
  const [selectedMajorIndex, setSelectedMajorIndex] = useState(Math.max(0, majorLimits.findIndex((x) => x.current)));
  const [selectedAnnualYear, setSelectedAnnualYear] = useState<number>(currentYear.year);
  const [selectedIndex, setSelectedIndex] = useState(Math.max(0, realPalaces.findIndex((p) => p.name === "命宮")));
  const [expandedStar, setExpandedStar] = useState<string | null>("天相");
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [ocrStatus, setOcrStatus] = useState("");
  const [compareStatus, setCompareStatus] = useState("");
  const [verified, setVerified] = useState<number[]>([]);
  const [showAllStars, setShowAllStars] = useState(false);
  const [question, setQuestion] = useState("");
  const [questionCategory, setQuestionCategory] = useState<(typeof questionCategories)[number]>("其他");
  const [questionResult, setQuestionResult] = useState<{ palace: Palace; steps: string[]; focus: { label: string; value: string; detail: string }[] } | null>(null);
  const selected = realPalaces[selectedIndex];
  const related = getRelatedPalaces(selectedIndex);
  const selectedMajor = majorLimits[selectedMajorIndex] || majorLimits[0];
  const selectedAnnual = annualSamples.find((x) => x.year === selectedAnnualYear) || currentYear;
  const activeTransformText = activeMode === "大限" ? selectedMajor.transforms : activeMode === "流年" ? selectedAnnual.transforms : "";
  const majorTransformMap = parseTransformMap(selectedMajor.transforms);
  const annualTransformMap = parseTransformMap(selectedAnnual.transforms);
  const appliedYear = Number(appliedBirth.date.slice(0, 4));
  const appliedYearPillar = getYearPillar(appliedYear);
  const appliedHourBranch = getHourBranch(appliedBirth.time);

  function applyBirthInput(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedBirth(birthInput);
    setShowBirthForm(false);
    setActiveMode("本命");
    setActiveTab("命盤總覽");
    setVerified([]);
  }

  function analyzeQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const keywordPalace: Record<string, string> = { 感情婚姻: "夫妻宮", 工作事業: "官祿宮", 財務投資: "財帛宮", 健康安全: "疾厄宮", 家庭長輩: "父母宮", 人際合作: "交友宮", 其他: "命宮" };
    const palace = realPalaces.find((item) => item.name === keywordPalace[questionCategory]) || realPalaces[0];
    setSelectedIndex(realPalaces.findIndex((item) => item.name === palace.name));
    const focus = questionCategory === "財務投資" ? [
      { label: "能不能賺", value: "財帛宮", detail: "看財帛宮主星、四化與三方四正，判斷收入來源、理財方式與現金流。" },
      { label: "能不能留", value: "田宅宮", detail: "Word 規則指出：財帛看能賺，田宅看能否留下，並檢查化祿、祿存、空劫與搬動訊號。" },
      { label: "先看風險", value: "化忌／空劫／羊陀", detail: "化祿遇化忌、空劫或天馬時，需核對祿逢沖破、祿空馬倒與馬落空亡。" },
    ] : [{ label: "核心宮位", value: palace.name, detail: wordPalaceMeanings[palace.name] }];
    setQuestionResult({ palace, focus, steps: ["先想清楚問題，限定一個主題與時間範圍。", "先看本宮主星、輔星與指定雜耀；空宮則複製對宮所有星星。", "檢查對宮與三合三方，只列有四化的主星及三方輔星。", "檢查鄰宮：前後宮必須形成 Word 指定成對夾星或四化夾才成立。", "依該宮地支找暗合宮，列出暗合宮有四化的主星與所有輔星。", "最後核對逢府看相、天相吸兩邊與 Word 斷事格局，再形成結論。"] });
  }

  const allStars = useMemo(() => {
    const indices = [selectedIndex, ...related.trine, related.opposite, ...related.adjacent, related.hidden];
    return Array.from(new Set(indices)).map((i) => realPalaces[i]);
  }, [selectedIndex, related.hidden, related.opposite, related.trine, related.adjacent]);

  const breakPatterns = buildBreakPatterns(selected, related, realPalaces, majorTransformMap, annualTransformMap);
  const doubleStarNotes = displayDoubleStarRules(selected);
  const oppositePalace = realPalaces[related.opposite];
  const trinePalaces = [...related.trine, related.opposite].map((index) => realPalaces[index]);
  const adjacentPalaces = related.adjacent.map((index) => realPalaces[index]);
  const hiddenPalace = realPalaces[related.hidden];
  const baseAnalysisStars = getBorrowedStars(selected, oppositePalace, majorTransformMap, annualTransformMap);
  const selectedOverlayNames = overlayStarsForPalace(selected, activeMode, selectedMajor, selectedAnnual);
  const analysisStars = [...baseAnalysisStars, ...selectedOverlayNames.map((name) => ({ name, kind: "雜耀" as StarKind, note: `${activeMode}盤流曜疊加` }))];
  const clampStars = getClampStars(adjacentPalaces[0], adjacentPalaces[1], majorTransformMap, annualTransformMap);
  const analysisSections = [
    { title: "本宮所有星星", items: analysisStars.map((star) => `${selected.stars.some((item) => item.kind === "主星") ? "" : `${oppositePalace.name}借入・`}${displayStar(star, majorTransformMap, annualTransformMap)}`) },
    { title: "三方四正有四化的主星", items: trinePalaces.flatMap((palace) => palace.stars.filter((star) => star.kind === "主星" && isFourTransformed(star, majorTransformMap, annualTransformMap)).map((star) => `${palace.name}・${displayStar(star, majorTransformMap, annualTransformMap)}`)) },
    { title: "三方四正的輔星", items: trinePalaces.flatMap((palace) => palace.stars.filter((star) => star.kind === "輔星").map((star) => `${palace.name}・${displayStar(star, majorTransformMap, annualTransformMap)}`)) },
    { title: "鄰宮成對夾的星星，或四化", items: clampStars.map((star) => `${star.palaceName}・${displayStar(star, majorTransformMap, annualTransformMap)}`) },
    { title: "暗合宮主星與輔星", items: hiddenPalace.stars.filter((star) => star.kind === "輔星" || (star.kind === "主星" && isFourTransformed(star, majorTransformMap, annualTransformMap))).map((star) => `${hiddenPalace.name}・${displayStar(star, majorTransformMap, annualTransformMap)}`) },
  ];
  const wordInterpretations = selected.stars.map((star) => {
    const transform = star.transform ? `化${star.transform}` : "本宮星曜";
    return { star, transform, text: star.transform ? wordTransformMeanings[`化${star.transform}`] : `${wordPalaceMeanings[selected.name]} ${knowledge[star.name]?.summary || "依星曜性質與旺弱參看。"}` };
  });
  const explainStar = (star: StarItem) => {
    const transforms = [...(star.markers || []).map((marker) => `本命化${marker.transform}`), majorTransformMap[star.name] ? `大限化${majorTransformMap[star.name]}` : "", annualTransformMap[star.name] ? `流年化${annualTransformMap[star.name]}` : ""].filter(Boolean);
    const starMeaning = knowledge[star.name]?.detail || star.note || "依星曜所在宮位、旺弱與會照條件參看。";
    const transformMeaning = transforms.length ? transforms.map((label) => `${label}：${wordTransformMeanings[`化${label.slice(-1)}`]}`).join(" ") : "本身沒有目前可見的四化標記，先以星曜本質與所在宮位判讀。";
    return { star, transforms, text: `${starMeaning} ${transformMeaning}` };
  };
  const analysisExplanations = Array.from(new Map(analysisStars.map((star) => [star.name, explainStar(star)])).values());
  const reportText = `紫微觀星｜${selected.name}分析報告\n\n宮位意義：${wordPalaceMeanings[selected.name]}\n\n星曜與四化：\n${wordInterpretations.map(({ star, transform, text }) => `${star.name}（${star.kind}・${transform}）：${text}`).join("\n")}\n\n${analysisSections.map((section, index) => `${index + 1}. ${section.title}：${section.items.join("、") || "無符合資料"}`).join("\n")}\n\n斷事格局：${breakPatterns.map((pattern) => `${pattern.name}：${pattern.meaning}`).join("\n") || "目前未觸發 Word 規則庫中的格局"}\n\n註：資料來源：使用者提供的紫微斗數 Word 規則文件。`;

  function exportReport() {
    const blob = new Blob([reportText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `紫微分析-${selected.name}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function markVerified() {
    setVerified((current) => current.includes(selectedIndex) ? current : [...current, selectedIndex]);
  }

  async function handleImageOCR(file?: File) {
    if (!file) return;
    setOcrStatus("正在辨識命盤圖片…");
    try {
      const worker = await createWorker("chi_tra+eng");
      const result = await worker.recognize(file);
      await worker.terminate();
      setImportText(result.data.text);
      setOcrStatus(`OCR 完成：${result.data.text.length} 個字元，請按「開始欄位核對」`);
    } catch (error) {
      setOcrStatus("OCR 失敗，請改用文字貼上或較清晰的命盤圖片。");
    }
  }

  function compareImportedText() {
    const found = realPalaces.reduce<number[]>((acc, palace, index) => {
      const hasPalace = importText.includes(palace.name);
      const mainNames = palace.stars.filter((star) => star.kind === "主星").map((star) => star.name);
      const hasMain = mainNames.length === 0 || mainNames.every((name) => importText.includes(name));
      return hasPalace && hasMain ? [...acc, index] : acc;
    }, []);
    setVerified(found);
    setCompareStatus(`已比對 ${found.length}/${realPalaces.length} 宮：宮位名稱與主星欄位相符者已標記。`);
    setActiveTab("十二宮核對");
  }

  return (
    <div className="min-h-screen bg-[#f6f4f0] text-[#241b3d]">
      <header className="sticky top-0 z-20 border-b border-[#e7e0d5] bg-[#f6f4f0]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[1600px] items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-4">
            <div className="brand-mark"><Sparkles size={17} strokeWidth={1.8} /></div>
            <div><div className="font-serif text-[17px] font-bold tracking-[0.16em]">紫微觀星</div><div className="mt-0.5 text-[10px] uppercase tracking-[0.26em] text-slate-400">Zi Wei Atlas · 命盤分析工作台</div></div>
          </div>
          <div className="hidden items-center gap-8 md:flex"><div className="flex items-center gap-2 text-xs text-slate-500"><span className="h-2 w-2 rounded-full bg-emerald-500" />規則引擎已就緒</div><button className="icon-button" title="重新整理"><RotateCcw size={16} /></button><button className="icon-button" title="說明"><CircleHelp size={17} /></button><div className="avatar">紫</div></div>
          <button className="icon-button md:hidden"><Menu size={18} /></button>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-5 py-7 lg:px-8">
        <div className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#a47b2f]"><span className="h-px w-8 bg-[#cfa95b]" />個人命盤分析</div><h1 className="font-serif text-4xl font-bold tracking-tight text-[#241b3d] md:text-5xl">自訂命盤 · {appliedYear} {appliedHourBranch}時</h1><p className="mt-2 text-sm text-slate-500">{appliedBirth.date} {appliedBirth.time}　｜　{appliedBirth.gender}命　｜　經度 {appliedBirth.longitude}　｜　{chartProfile.fiveElements}・{chartProfile.chartType}</p></div>
          <div className="flex flex-wrap items-center gap-2"><button className="primary-button" onClick={() => setShowBirthForm((v) => !v)}><Sparkles size={15} />自訂出生資料</button><button className="secondary-button" onClick={() => setShowImport((v) => !v)}><Upload size={15} />匯入盤面</button><button className="secondary-button" onClick={() => window.print()}><Printer size={15} />列印／另存 PDF</button><button className="primary-button" onClick={exportReport}><Download size={15} />匯出分析</button></div>
        </div>

        {showBirthForm && <section className="mb-6 rounded-2xl border border-[#d8c6a5] bg-[#fffdf9] p-5 shadow-[0_12px_35px_rgba(36,27,61,0.07)]"><div className="mb-4 flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 font-semibold text-[#241b3d]"><Sparkles size={16} className="text-[#a47b2f]" />自訂出生年月日時</div><p className="mt-1 text-xs leading-5 text-slate-500">輸入出生資料後套用到目前命盤工作區；時區以台灣 UTC+8、地點經度用於真太陽時校正。</p></div><button className="icon-button" onClick={() => setShowBirthForm(false)}><X size={16} /></button></div><form onSubmit={applyBirthInput} className="grid gap-3 md:grid-cols-4"><label className="grid gap-1 text-xs font-semibold text-slate-600">出生日期<input required type="date" value={birthInput.date} onChange={(event) => setBirthInput({ ...birthInput, date: event.target.value })} className="rounded-lg border border-[#e4ded4] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#cfa95b]" /></label><label className="grid gap-1 text-xs font-semibold text-slate-600">出生時間<input required type="time" value={birthInput.time} onChange={(event) => setBirthInput({ ...birthInput, time: event.target.value })} className="rounded-lg border border-[#e4ded4] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#cfa95b]" /></label><label className="grid gap-1 text-xs font-semibold text-slate-600">性別<select value={birthInput.gender} onChange={(event) => setBirthInput({ ...birthInput, gender: event.target.value as BirthInput["gender"] })} className="rounded-lg border border-[#e4ded4] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#cfa95b]"><option value="男">男</option><option value="女">女</option></select></label><label className="grid gap-1 text-xs font-semibold text-slate-600">出生地經度<input required type="number" step="0.001" min="-180" max="180" value={birthInput.longitude} onChange={(event) => setBirthInput({ ...birthInput, longitude: event.target.value })} className="rounded-lg border border-[#e4ded4] bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#cfa95b]" /></label><div className="flex flex-wrap items-center gap-3 md:col-span-4"><button type="submit" className="primary-button"><Check size={15} />套用出生資料</button><span className="text-xs text-slate-500">目前：{appliedBirth.date} {appliedBirth.time}・{appliedBirth.gender}・{appliedYearPillar}年・{appliedHourBranch}時・經度 {appliedBirth.longitude}</span></div></form></section>}

        {showImport && <section className="mb-6 rounded-2xl border border-[#ded5c7] bg-[#fffdf9] p-5 shadow-[0_8px_30px_rgba(36,27,61,0.04)]"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex items-center gap-2 font-semibold"><FileText size={16} className="text-[#a47b2f]" />文墨天機文字／命盤截圖核對</div><p className="mt-1 text-xs leading-5 text-slate-500">可貼入文字匯出內容，或選擇圖片。原型會保留解析入口，完成格式樣本後即可接上逐宮 OCR 與欄位核對。</p></div><button className="icon-button" onClick={() => setShowImport(false)}><X size={16} /></button></div><textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="例如：命宮：紫微、天相、左輔、文昌……" className="mt-4 min-h-24 w-full rounded-xl border border-[#e6ded2] bg-[#faf8f3] p-3 text-sm outline-none transition focus:border-[#cfa95b]" /><div className="mt-3 flex flex-wrap gap-2"><button className="primary-button" onClick={compareImportedText}><ClipboardCheck size={15} />開始欄位核對</button><label className="secondary-button"><Upload size={15} />選擇命盤圖片<input type="file" accept="image/*" className="hidden" onChange={(event) => handleImageOCR(event.target.files?.[0])} /></label><div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">{ocrStatus && <span>{ocrStatus}</span>}{compareStatus && <span className="font-semibold text-emerald-700">{compareStatus}</span>}</div></div></section>}

        <div className="workspace-grid">
          <aside className="sidebar-panel">
            <div className="mb-4 flex items-center justify-between"><span className="section-label">分析模組</span><PanelRight size={15} className="text-slate-400" /></div>
            <nav className="space-y-1">{["命盤總覽", "問事分析", "十二宮核對", "星曜知識", "分析報告"].map((tab) => <button key={tab} onClick={() => setActiveTab(tab)} className={`nav-item ${activeTab === tab ? "active" : ""}`}>{tab === "命盤總覽" ? <Layers3 size={16} /> : tab === "問事分析" ? <Search size={16} /> : tab === "十二宮核對" ? <ClipboardCheck size={16} /> : tab === "星曜知識" ? <BookOpen size={16} /> : <FileText size={16} />}<span>{tab}</span>{activeTab === tab && <ChevronRight className="ml-auto" size={15} />}</button>)}</nav>
            <div className="my-6 border-t border-[#e9e2d9]" />
            <div className="mb-3 flex items-center justify-between"><span className="section-label">盤面層次</span><span className="text-[10px] text-slate-400">疊加顯示</span></div>
            <div className="space-y-2">{(["本命", "大限", "流年"] as Mode[]).map((mode) => <button key={mode} onClick={() => setActiveMode(mode)} className={`mode-row ${activeMode === mode ? "selected" : ""}`}><span className={`legend-dot ${mode === "本命" ? "red" : mode === "大限" ? "green" : "blue"}`} /><span>{mode}四化</span><span className="ml-auto text-[10px] text-slate-400">{mode === "本命" ? "辛酉年" : mode === "大限" ? selectedMajor.years : String(selectedAnnual.year)}</span></button>)}</div>
            <div className="mt-4 grid gap-2">
              <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">大限年份</label>
              <select value={selectedMajorIndex} onChange={(event) => setSelectedMajorIndex(Number(event.target.value))} className="rounded-lg border border-[#e4ded4] bg-white px-2 py-2 text-xs text-slate-600">{majorLimits.map((limit, index) => <option key={limit.years} value={index}>{limit.years} · {limit.transforms}</option>)}</select>
              <label className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">流年年份</label>
              <select value={selectedAnnualYear} onChange={(event) => setSelectedAnnualYear(Number(event.target.value))} className="rounded-lg border border-[#e4ded4] bg-white px-2 py-2 text-xs text-slate-600">{annualSamples.map((annual) => <option key={annual.year} value={annual.year}>{annual.year} · {annual.transforms}</option>)}</select>
            </div>
            <div className="mt-6 rounded-xl border border-[#eadfca] bg-[#fbf5e7] p-3.5"><div className="flex items-center gap-2 text-xs font-semibold text-[#78591c]"><ShieldCheck size={15} />核對進度</div><div className="mt-2 flex items-end justify-between"><span className="text-2xl font-bold text-[#241b3d]">{verified.length}<span className="text-sm font-normal text-slate-400"> / 12</span></span><span className="text-[10px] text-slate-500">逐宮核對</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eadfca]"><div className="h-full rounded-full bg-[#cfa95b] transition-all" style={{ width: `${(verified.length / 12) * 100}%` }} /></div></div>
            <div className="mt-8 text-[10px] leading-5 text-slate-400">資料版本<br /><span className="font-medium text-slate-500">紫微斗數規則庫 v0.9</span><br />依據使用者 Word 文件整理</div>
          </aside>

          <section className="min-w-0">
            {activeTab === "命盤總覽" && <>
              <div className="mb-4 rounded-xl border border-[#eadfca] bg-[#fbf5e7] px-4 py-3 text-xs text-[#78591c]"><b>目前排盤輸入：</b>{appliedBirth.date} {appliedBirth.time} · {appliedBirth.gender}命 · {appliedYearPillar}年{appliedHourBranch}時 · 命主 {chartProfile.lifeMaster} · 身主 {chartProfile.bodyMaster} · 大限 {selectedMajor.years} · 流年 {selectedAnnual.year} 四化：{selectedAnnual.transforms}</div><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><span className="section-label">本命盤・十二宮</span><p className="mt-1 text-xs text-slate-500">點選宮位查看主星、輔星、雜耀與完整參看路徑</p></div><div className="flex items-center gap-2 rounded-full border border-[#ded5c7] bg-white px-3 py-2 text-[11px] text-slate-500"><span className={`legend-dot ${activeMode === "本命" ? "red" : activeMode === "大限" ? "green" : "blue"}`} />目前聚焦：{activeMode}四化</div></div>
              <div className="chart-shell"><div className="chart-grid">{realPalaces.map((palace, index) => <PalaceCell key={palace.name} palace={palace} index={index} selected={index === selectedIndex} onClick={() => setSelectedIndex(index)} activeMode={activeMode} majorTransforms={activeMode === "本命" ? {} : majorTransformMap} annualTransforms={activeMode === "流年" ? annualTransformMap : {}} majorPalaceLabel={activeMode === "本命" ? undefined : overlayPalaceLabel(palace, selectedMajor.palace, "大限")} annualPalaceLabel={activeMode === "流年" ? overlayPalaceLabel(palace, selectedAnnual.branch, "流年") : undefined} majorOverlayStars={activeMode === "本命" ? [] : overlayStarsForPalace(palace, "大限", selectedMajor, selectedAnnual)} annualOverlayStars={activeMode === "流年" ? overlayStarsForPalace(palace, "流年", selectedMajor, selectedAnnual) : []} />)}<div className="chart-center"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="direction-label direction-n">正南方</div><div className="direction-label direction-s">正北方</div><Moon size={18} className="text-[#cfa95b]" /><div className="mt-2 font-serif text-2xl font-bold">文墨天機</div><div className="mt-2 text-sm text-slate-600">{chartProfile.gender}命　{chartProfile.fiveElements}</div><div className="mt-1 text-sm text-slate-600">命主：{chartProfile.lifeMaster}　身主：{chartProfile.bodyMaster}　子年斗君：{chartProfile.yearRuler}</div><div className="mt-5 text-xs text-slate-500">流年：{selectedAnnual.year}　虛歲{selectedAnnual.age}歲</div><div className="mt-2 text-xs font-medium text-slate-600">{activeMode}聚焦：{activeTransformText || "本命生年四化"}</div><div className="mt-4 flex items-center justify-center gap-2"><span className="legend-dot red" /><span className="legend-dot green" /><span className="legend-dot blue" /></div></div></div></div>
              <div className="mt-4 grid gap-3 md:grid-cols-3"><div className="stat-card"><div className="stat-icon rose"><Zap size={15} /></div><div><div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">本命四化</div><div className="mt-1 font-semibold">依原始生年標記</div></div></div><div className="stat-card"><div className="stat-icon green"><Layers3 size={15} /></div><div><div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">大限切換</div><div className="mt-1 font-semibold">{selectedMajor.years} 歲運限</div></div></div><div className="stat-card"><div className="stat-icon blue"><Sparkles size={15} /></div><div><div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">流年切換</div><div className="mt-1 font-semibold">{selectedAnnual.year} {selectedAnnual.branch}年</div></div></div></div>
            </>}

            {activeTab === "十二宮核對" && <div className="rounded-2xl border border-[#e3dbd0] bg-[#fffdf9] p-5"><div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><span className="section-label">十二宮逐宮核對</span><h2 className="mt-2 font-serif text-2xl font-bold">宮位與主星是否符合命盤圖</h2><p className="mt-1 text-sm text-slate-500">已匯入目前文墨天機實盤；可用文字貼上或圖片 OCR 重新比對欄位。</p></div><button className="secondary-button" onClick={() => setVerified([])}><RotateCcw size={14} />重設核對</button></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{realPalaces.map((p, i) => <button key={p.name} onClick={() => { setSelectedIndex(i); setVerified((v) => v.includes(i) ? v : [...v, i]); }} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition hover:-translate-y-0.5 ${verified.includes(i) ? "border-emerald-200 bg-emerald-50/60" : "border-[#e9e2d9] bg-[#faf8f3]"}`}><span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${verified.includes(i) ? "bg-emerald-500 text-white" : "bg-white text-slate-400"}`}>{verified.includes(i) ? <Check size={14} /> : i + 1}</span><span className="min-w-0 flex-1"><span className="block font-semibold">{p.name}</span><span className="mt-1 block truncate text-xs text-slate-500">{p.stars.filter((s) => s.kind === "主星").map((s) => s.name).join("、")}</span></span><ChevronRight size={14} className="text-slate-300" /></button>)}</div><div className="mt-6 rounded-xl bg-[#241b3d] p-4 text-white"><div className="flex items-center gap-2 text-sm font-semibold"><Search size={15} className="text-[#f0ca77]" />目前選取：{selected.name}</div><p className="mt-2 text-xs leading-5 text-white/65">主星：{selected.stars.filter((s) => s.kind === "主星").map((s) => s.name).join("、")}。輔星／雜耀：{selected.stars.filter((s) => s.kind !== "主星").map((s) => s.name).join("、")}。</p></div></div>}

            {activeTab === "星曜知識" && <div className="rounded-2xl border border-[#e3dbd0] bg-[#fffdf9] p-5"><div className="mb-5"><span className="section-label">星曜知識卡</span><h2 className="mt-2 font-serif text-2xl font-bold">主星・輔星・指定雜耀</h2><p className="mt-1 text-sm text-slate-500">點擊展開個別星曜說明；本版本保留祿存、天馬、紅鸞、天喜、天姚、天刑、咸池。</p></div><div className="mb-4 flex flex-wrap gap-2">{[...mainStars, ...supportingStars, ...minorStars].map((name) => <button key={name} onClick={() => setExpandedStar(name)} className={`rounded-full border px-3 py-1.5 text-xs transition ${expandedStar === name ? "border-[#cfa95b] bg-[#fbf5e7] text-[#78591c]" : "border-[#e7e0d5] bg-white text-slate-500 hover:border-[#cfa95b]"}`}>{name}</button>)}</div>{expandedStar && <div className="rounded-2xl border border-[#eadfca] bg-[#fbf5e7] p-5"><div className="flex items-start justify-between gap-4"><div><div className="text-[10px] uppercase tracking-[0.2em] text-[#a47b2f]">{knowledge[expandedStar]?.category || "星曜知識卡"}</div><h3 className="mt-2 font-serif text-2xl font-bold">{expandedStar}</h3><p className="mt-1 text-sm text-slate-600">{knowledge[expandedStar]?.summary || "此星曜已納入命盤資料，可依宮位與四化疊加解讀。"}</p></div><Star size={25} className="text-[#cfa95b]" /></div><div className="mt-4 border-t border-[#e8dcc2] pt-4 text-sm leading-7 text-slate-600">{knowledge[expandedStar]?.detail || "此知識卡等待補充完整文字規則。"}</div></div>}<div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="mini-note"><b>主星</b><span>核心性格與事件主軸</span></div><div className="mini-note"><b>輔星</b><span>加減分與表現方式</span></div><div className="mini-note"><b>雜耀</b><span>補充情境與細節</span></div></div></div>}

            {activeTab === "問事分析" && <div className="rounded-2xl border border-[#e3dbd0] bg-[#fffdf9] p-5"><div className="mb-5"><span className="section-label">紫占・問事分析</span><h2 className="mt-2 font-serif text-2xl font-bold">把問題放進 Word 的解盤步驟</h2><p className="mt-1 text-sm leading-6 text-slate-500">依 Word「紫占」與「三方四正與斷事觀念」：先定義問題，再找對應宮位，最後依本宮、三方、夾宮、暗合與斷事格局判讀。</p></div><form onSubmit={analyzeQuestion} className="grid gap-3 md:grid-cols-[180px_1fr_auto]"><select value={questionCategory} onChange={(event) => setQuestionCategory(event.target.value as (typeof questionCategories)[number])} className="rounded-xl border border-[#e4ded4] bg-white px-3 py-3 text-sm">{questionCategories.map((category) => <option key={category}>{category}</option>)}</select><input required value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：今年工作是否適合轉換跑道？" className="rounded-xl border border-[#e4ded4] bg-white px-3 py-3 text-sm outline-none focus:border-[#cfa95b]" /><button type="submit" className="primary-button"><Search size={15} />開始問事</button></form>{questionResult && <div className="mt-6 space-y-5"><div className="rounded-2xl bg-[#241b3d] p-5 text-white"><div className="text-[10px] uppercase tracking-[0.2em] text-[#f0ca77]">問題對應宮位</div><div className="mt-2 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><h3 className="font-serif text-2xl font-bold">{questionResult.palace.name}</h3><span className="rounded-full bg-white/10 px-3 py-1 text-xs text-[#f0ca77]">{questionCategory}</span></div><p className="mt-3 text-sm leading-6 text-white/75">「{question}」</p><p className="mt-4 border-t border-white/15 pt-4 text-xs leading-5 text-white/65">{wordPalaceMeanings[questionResult.palace.name]}</p></div><div><div className="mb-3 flex items-center justify-between"><div className="text-sm font-semibold text-[#241b3d]">財運三個判讀焦點</div><span className="text-[10px] text-slate-400">Word 宮位邏輯</span></div><div className="grid gap-3 md:grid-cols-3">{questionResult.focus.map((item) => <div key={item.label} className="rounded-xl border border-[#eadfca] bg-[#fbf5e7] p-4"><div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a47b2f]">{item.label}</div><div className="mt-2 font-serif text-lg font-bold text-[#241b3d]">{item.value}</div><p className="mt-2 text-xs leading-5 text-slate-600">{item.detail}</p></div>)}</div></div><div className="rounded-2xl border border-[#eadfca] bg-[#fbf5e7] p-4"><div className="mb-3 flex items-center justify-between"><div className="text-sm font-semibold text-[#241b3d]">本次問事涉及的星曜與四化解釋</div><span className="text-[10px] text-[#a47b2f]">同步目前選取宮位</span></div><div className="grid gap-2 md:grid-cols-2">{analysisExplanations.map(({ star, transforms, text }) => <div key={star.name} className="rounded-xl border border-[#eadfca] bg-white p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-[#241b3d]">{star.name} <span className="font-normal text-slate-400">{star.kind}</span></span><span className="text-[10px] text-[#a47b2f]">{transforms.length ? transforms.join("／") : "本宮星曜"}</span></div><p className="mt-1 text-[11px] leading-5 text-slate-600">{text}</p></div>)}</div></div><div className="rounded-2xl border border-[#e3dbd0] bg-white p-4"><div className="mb-3 flex items-center justify-between"><div className="text-sm font-semibold text-[#241b3d]">Word 參看步驟</div><span className="text-[10px] text-emerald-600">6 步完成</span></div><ol className="grid gap-2 md:grid-cols-2">{questionResult.steps.map((step, index) => <li key={step} className="flex gap-3 rounded-xl border border-[#eee6db] bg-[#faf8f3] p-3 text-xs leading-5 text-slate-600"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#cfa95b] text-[10px] font-bold text-white">{index + 1}</span>{step}</li>)}</ol></div></div>}</div>}

            {activeTab === "分析報告" && <div className="rounded-2xl border border-[#e3dbd0] bg-[#fffdf9] p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><span className="section-label">可列印分析報告</span><h2 className="mt-2 font-serif text-2xl font-bold">{selected.name}・Word 規則完整報告</h2><p className="mt-1 text-sm text-slate-500">已套用 Word：宮位意義、四化象義、五段參看順序、夾宮、暗合與斷事格局。</p></div><div className="flex gap-2"><button className="secondary-button" onClick={() => window.print()}><Printer size={14} />列印／PDF</button><button className="primary-button" onClick={exportReport}><ArrowDownToLine size={14} />下載 TXT</button></div></div><div className="mt-6 rounded-2xl border border-[#eadfca] bg-[#fbf5e7] p-5"><div className="text-[10px] uppercase tracking-[0.2em] text-[#a47b2f]">宮位解釋</div><h3 className="mt-2 font-serif text-xl font-bold">{selected.name}</h3><p className="mt-2 text-sm leading-7 text-slate-600">{wordPalaceMeanings[selected.name]}</p></div><div className="mt-5"><div className="mb-3 text-sm font-semibold">星曜與四化解釋</div><div className="grid gap-3 md:grid-cols-2">{wordInterpretations.map(({ star, transform, text }) => <div key={`${star.name}-${transform}`} className="rounded-xl border border-[#eee6db] bg-[#faf8f3] p-4"><div className="flex items-center justify-between"><span className="font-semibold">{star.name}</span><span className="text-[10px] text-[#a47b2f]">{star.kind}・{transform}</span></div><p className="mt-2 text-xs leading-6 text-slate-600">{text}</p></div>)}</div></div><div className="mt-5"><div className="mb-3 text-sm font-semibold">Word 五段參看結果</div><ol className="space-y-2">{analysisSections.map((section, index) => <li key={section.title} className="rounded-xl border border-[#eee6db] bg-white p-3 text-xs leading-5"><b>{index + 1}. {section.title}</b><div className="mt-1 text-slate-500">{section.items.join("、") || "無符合資料"}</div></li>)}</ol></div>{breakPatterns.length > 0 && <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4"><div className="font-semibold text-rose-900">符合的 Word 斷事格局</div><div className="mt-2 space-y-1 text-xs leading-5 text-rose-800">{breakPatterns.map((pattern) => <div key={pattern.name}>【{pattern.name}】{pattern.meaning}</div>)}</div></div>}</div>}
          </section>

          <aside className="detail-panel">
            <div className="flex items-start justify-between"><div><span className="section-label">選取宮位</span><h2 className="mt-2 font-serif text-2xl font-bold">{selected.name}</h2><p className="mt-1 text-xs text-slate-500">{selected.branch}・{selected.stem}　{selected.body ? "身宮同位" : ""}</p></div><div className="rounded-xl bg-[#fbf5e7] p-2.5 text-[#a47b2f]"><Star size={18} /></div></div><div className="mt-5 rounded-xl border border-[#e7e0d5] bg-[#faf8f3] p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">宮位主題</div><div className="mt-2 text-sm font-medium leading-6 text-[#4c405f]">{selected.focus}</div></div>
            <div className="mt-6"><div className="mb-3 flex items-center justify-between"><span className="section-label">宮內星曜</span><button className="text-[11px] font-semibold text-[#a47b2f]" onClick={() => setShowAllStars((v) => !v)}>{showAllStars ? "收起" : "展開全部"}</button></div><div className="space-y-2">{selected.stars.slice(0, showAllStars ? 10 : 4).map((star) => <button key={star.name} onClick={() => { setExpandedStar(star.name); setActiveTab("星曜知識"); }} className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#ece6de] bg-white p-3 text-left transition hover:border-[#cfa95b]"><span className="flex min-w-0 items-center gap-2"><span className={`h-2 w-2 shrink-0 rounded-full ${star.kind === "主星" ? "bg-[#241b3d]" : star.kind === "輔星" ? "bg-[#cfa95b]" : "bg-[#bd8b7c]"}`} /><span className="truncate text-sm font-medium">{star.name}</span><span className="text-[10px] text-slate-400">{star.kind}</span></span>{star.transform && <StarBadge star={star} compact />}</button>)}</div></div>
            <div className="mt-6 border-t border-[#e9e2d9] pt-5"><div className="mb-3 flex items-center justify-between"><span className="section-label">星曜與四化解釋</span><span className="text-[10px] text-[#a47b2f]">依目前疊加層</span></div><div className="space-y-2">{analysisExplanations.map(({ star, transforms, text }) => <div key={star.name} className="rounded-xl border border-[#eadfca] bg-[#fbf5e7] p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-[#241b3d]">{star.name} <span className="font-normal text-slate-400">{star.kind}</span></span><span className="text-[10px] text-[#a47b2f]">{transforms.length ? transforms.join("／") : "本宮星曜"}</span></div><p className="mt-1 text-[11px] leading-5 text-slate-600">{text}</p></div>)}</div></div><div className="mt-6 border-t border-[#e9e2d9] pt-5"><div className="mb-3 flex items-center justify-between"><span className="section-label">參看順序</span><span className="text-[10px] text-emerald-600">已啟用・動態列出</span></div><ol className="space-y-3">{analysisSections.map((section, i) => <li key={section.title} className="text-xs leading-5"><div className="flex gap-3"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#efe8df] text-[10px] font-bold text-[#8c6b32]">{i + 1}</span><span className="font-semibold text-slate-700">{section.title}</span></div><div className="ml-8 mt-1 text-slate-500">{section.items.join("、") || "無符合資料"}</div></li>)}</ol></div>
            {doubleStarNotes.length > 0 && <div className="mt-6 rounded-2xl border border-[#ded5c7] bg-white p-4"><div className="section-label">Word 雙主星判讀</div><div className="mt-3 space-y-2">{doubleStarNotes.map((note) => <div key={note} className="text-xs leading-5 text-slate-600">{note}</div>)}</div></div>}
            <div className="mt-6 rounded-2xl border border-[#eadfca] bg-[#fbf5e7] p-4"><div className="flex items-center justify-between"><span className="section-label">Word 斷事格局</span><span className="text-[10px] text-slate-400">{breakPatterns.length} 個符合</span></div>{breakPatterns.length ? <div className="mt-3 space-y-2">{breakPatterns.map((pattern) => <div key={pattern.name} className="rounded-lg border border-[#eadfca] bg-white/70 p-2.5"><div className="text-xs font-bold text-[#78591c]">【{pattern.name}】</div><div className="mt-1 text-xs leading-5 text-slate-600">{pattern.meaning}</div></div>)}</div> : <p className="mt-3 text-xs leading-5 text-slate-500">目前未觸發 Word 規則庫中的斷事格局。</p>}</div>
            <div className="mt-6 rounded-xl bg-[#241b3d] p-4 text-white"><div className="flex items-center gap-2 text-xs font-semibold text-[#f0ca77]"><Sparkles size={14} />逢府看相規則</div><p className="mt-2 text-xs leading-5 text-white/70">遇到天相星，將天相兩側宮位的主星、輔星、雜耀複製到天相格子，並依四化 → 輔星 → 夾宮 → 暗合的順序參看。</p></div>
          </aside>
        </div>
      </main>
      <footer className="mx-auto max-w-[1600px] px-5 pb-8 pt-2 text-[11px] text-slate-400 lg:px-8"><div className="flex flex-col justify-between gap-2 border-t border-[#e7e0d5] pt-5 sm:flex-row"><span>紫微觀星 · 個人研究工具，不取代專業命理諮詢</span><span>本命紅色 · 大限綠色 · 流年藍色</span></div></footer>
    </div>
  );
}

export { seedPalaces, mainStars, supportingStars, minorStars };
