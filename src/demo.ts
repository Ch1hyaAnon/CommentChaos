import type { ThreadResult } from "./types";

// 离线示例楼：明确标记为示例，非真实 AI 生成结果
export const DEMO_THREAD: ThreadResult = {
  title: "【示例楼】食堂新出的香菜奶茶，谁批准的",
  comments: [
    { stage: "resonance", role: "路人", emoji: "🍵", name: "干饭第一名", text: "食堂出了香菜奶茶，喝完我沉默了。到底谁会回购啊😅", likes: 2341, reply_to: null, stance: "oppose" },
    { stage: "split", role: "孝子", emoji: "🌿", name: "香菜天菜党", text: "我会，香菜党终于等到这一天了。", likes: 987, reply_to: 1, stance: "support" },
    { stage: "derail", role: "乐子人", emoji: "🤣", name: "看热闹不嫌事大", text: "建议下一杯折耳根拿铁[doge]", likes: 1452, reply_to: 1, stance: "neutral" },
    { stage: "split", role: "阴阳人", emoji: "🙃", name: "杯底观察员", text: "那这新品至少锁定一个销量了", likes: 863, reply_to: 2, stance: "oppose" },
    { stage: "resonance", role: "路人", emoji: "🧋", name: "路过二食堂", text: "先不说香菜，为什么新品都得卖这么贵。", likes: 644, reply_to: null, stance: "oppose" },
    { stage: "split", role: "杠精", emoji: "🧐", name: "钱包很清醒", text: "你买的可能不是奶茶，是给新品试错交学费。", likes: 512, reply_to: 5, stance: "oppose" },
    { stage: "split", role: "黑子", emoji: "😒", name: "空杯不许走", text: "别建议新品了，先把普通珍珠煮熟行吗😭", likes: 2010, reply_to: 1, stance: "oppose" },
    { stage: "derail", role: "吃瓜群众", emoji: "🍿", name: "今天不排队", text: "3楼的研发提案已经递上去了是吧", likes: 388, reply_to: 3, stance: "neutral" },
    { stage: "resonance", role: "路人", emoji: "🥤", name: "只喝白开水", text: "幸好我只买了矿泉水。", likes: 1755, reply_to: null, stance: "neutral" },
    { stage: "derail", role: "乐子人", emoji: "🐱", name: "食堂编外人员", text: "有无测评食堂冰块的，感觉更稳一点。", likes: 302, reply_to: null, stance: "neutral" },
  ],
  summary: "香菜党护新品，另一拨吐槽味道和价格，楼里已经开始提案折耳根拿铁。",
  hot_search: ["香菜奶茶", "折耳根拿铁", "食堂新品争议", "钱包先沉默"],
  heat: 87,
  conflict: 72,
  absurdity: 91,
  camps: { support: 42, oppose: 35, neutral: 23 },
  fiction_notice: "以上内容均为 AI 虚构娱乐演绎",
};
