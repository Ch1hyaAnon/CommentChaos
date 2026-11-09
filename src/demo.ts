import type { ThreadResult } from "./types";

// 离线示例楼：明确标记为示例，非真实 AI 生成结果
export const DEMO_THREAD: ThreadResult = {
  title: "【示例楼】食堂新出的香菜奶茶，谁批准的",
  comments: [
    { stage: "resonance", role: "热评王", emoji: "🔥", name: "干饭第一名", text: "家人们谁懂啊，中午排队排了二十分钟，就为了尝一口香菜奶茶，喝完沉默了。", likes: 2341, reply_to: null, stance: "support" },
    { stage: "resonance", role: "共情党", emoji: "🥺", name: "香菜受害者", text: "沉默是对的，我上周喝完到现在嘴里都是菜味，回复楼上：你不是一个人。", likes: 1876, reply_to: 1, stance: "support" },
    { stage: "resonance", role: "乐子人", emoji: "🤣", name: "看热闹不嫌事大", text: "建议下一步出折耳根拿铁，我已经在期待评论区了哈哈哈哈。", likes: 1452, reply_to: 1, stance: "neutral" },
    { stage: "split", role: "反方", emoji: "😤", name: "香菜天菜党", text: "楼上别黑了，香菜明明是清洁剂级的芬芳，喝不懂是你的损失。", likes: 987, reply_to: 2, stance: "oppose" },
    { stage: "split", role: "理性人", emoji: "🤓", name: "数据不说谎", text: "查了下，全球约有一成的人觉得香菜有肥皂味，这是基因决定的，吵不出结果的。", likes: 863, reply_to: 4, stance: "neutral" },
    { stage: "split", role: "反方", emoji: "😤", name: "护校宝子", text: "反对楼上，我们学校食堂阿姨说卖得很好，实践是检验真理的唯一标准。", likes: 644, reply_to: 5, stance: "oppose" },
    { stage: "derail", role: "神秘知情人", emoji: "🍉", name: "刚下晚自习", text: "听说是后勤经理的亲戚承包了香菜供应，反正我是听说的（纯属演绎）。", likes: 2010, reply_to: 6, stance: "neutral" },
    { stage: "derail", role: "跑题人", emoji: "🛸", name: "路过的外星人", text: "你们地球人连奶茶都吵，我只想问食堂什么时候复刻香菜包子，认真的。", likes: 512, reply_to: 7, stance: "neutral" },
    { stage: "sublimate", role: "共情党", emoji: "🥲", name: "毕业老登", text: "吵着吵着突然想母校了，当年最难吃的东西现在都是回忆。", likes: 1755, reply_to: 8, stance: "support" },
    { stage: "sublimate", role: "总结怪", emoji: "🧾", name: "热搜观察员", text: "本楼总结：香菜奶茶是假，青春回忆是真。散会！", likes: 3021, reply_to: 9, stance: "neutral" },
  ],
  summary: "一杯香菜奶茶引发全校站队，吵到最后吵的是青春。",
  hot_search: ["香菜奶茶", "基因决定香菜党", "食堂新品争议", "青春回忆杀"],
  heat: 87,
  conflict: 72,
  absurdity: 91,
  camps: { support: 42, oppose: 35, neutral: 23 },
  fiction_notice: "以上内容均为 AI 虚构娱乐演绎",
};
