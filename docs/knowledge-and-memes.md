# 实时检索、梗素材与诊断

## 当前运行链路

默认模型 `deepseek-v4-pro`，明确关闭 thinking。生成评论保留直接回怼、护主、唱反调、反串、阴阳怪气等风格，角色是表达倾向，不是剧本次序；不强制和解、升华或主持人收尾。虚构声明只放在 fiction_notice，由页面统一显示；现实断言仍需资料支持。

`POST /generate` 使用 `entity-ranked-v2` 编排，整个检索阶段共享25秒截止时间，最后评论生成单独最多60秒。保留原评论协议和导演动作ID。

1. AI规划提取原文实体、候选解释、事实查询和梗关键词。候选解释仅是假设。程序保留原始实体锚点，过滤“评价、如何、热梗”等泛词；空数组不能让“如何评价bin”跳过梗查询。规划温度0，最多5秒，失败使用原文锚点降级。
2. 对需要确认身份的简称，使用“原文锚点＋中文社区语境”搜索，不加近期时间限制；同时按锚点及最多两个扩展词查询梗Wiki。普通话题按主题搜索近期资料。
3. 收集全部事实摘要和梗摘要，由AI联合确认对象、选择相关事实、排序素材；核对引用来源、实体完整词匹配与领域。Anrobino中的bin不能冒充Bin；游戏社区中的WordNet、银行卡BIN、二进制文件不能用作选手背景。身份无法确认返回409 entity_ambiguous，保留输入并提示补充全名/领域；检索服务故障返回503。
4. 确认后最多一轮补检，查询近期事实，必要时用已查证别名补查梗。放宽时间时保留对象和领域，不降级成裸简称。剩余时间不足时保留已核验排序，不重复花费大段AI时间。
5. 全部梗摘要按直接涉及对象、明确相关、仅同领域、无关排序后，才读取最多5页详情；具体实体查询不以“仅同领域”凑满名额。排除诅咒家属、人肉隐私及身份仇恨素材，不把普通黑称、讽刺或反串一概排除。
6. AI从详情或可用摘要中选最多3条，核对连续原文证据和衍生来源。老梗不再按正文年份硬淘汰；起源早、新近更新和正在流行是不同概念，不宣称没有证据的热度。
7. 去除本楼最近40条已经使用的表达，分别注入事实资料和表达素材，再生成评论。没有合适梗时不强塞，外部素材不可用时允许已审核本地库降级。

单次冷启动最多4次检索AI调用（含规划）＋1次评论生成。梗查询最多3个初始词＋2个查证别名，详情最多5页；事实最多2次Search、2页Fetch。普通话题或有缓存时调用更少。规划和判定温度为0，但不承诺模型输出逐字确定；程序校验保证必要锚点、领域及来源边界。

事实正文每页最多3秒，梗详情每页最多4秒，同时给最后筛选预留约6.5秒。获取正文失败可保留明确标注的摘要，不能用网页等待耗尽全部梗筛选预算。

## 状态、缓存和接口

响应新增可选 trace_id、retrieval，保留 thread、duplicates、knowledge、meme_context、meme_version。

- retrieval 包含实体确认状态、策略版本、阶段结果、查询/匹配/详情/排序/筛选/注入数量和 cache_hit。
- counts 中查询、详情和AI调用数代表本请求实际调用；缓存命中时为0，matched/ranked/selected保留缓存素材数量。计数只包含检索阶段，最终生成还需一次Chat调用。
- knowledge.status：ready正文可读，summary_only仅摘要，empty无相关资料，unavailable服务不可用；来源元数据区分page/summary。
- meme_context.status：ready已给模型提供相关素材，empty没有新增可用素材，unavailable检索不可用。reason区分no_query、no_match、no_relevant_candidates、detail_rejected、selection_rejected、timeout和服务错误。注入不等于一定在评论中使用。
- entity_ambiguous：409，提示用户补充对象；检索不可用/繁忙：503；生成传输中断、数据解析和截断：502；生成超时：504；未知程序异常仍为500并附追踪编号，不盲目重试掩盖问题。

策略版本、种子、社区和热点构成缓存键；正常结果30分钟，规划降级、歧义或服务失败最多1分钟。最多100条缓存及100个并发不同任务，相同请求合并。实例间不共享缓存，重启后会重新检索。

## 来源和时效

事实使用DeepSeek独立Search / Fetch；梗使用[梗Wiki公开只读API](https://cnmeme.wiki/developers/api/reference)：每个短词独立调用 `GET /api/v1/public/memes?q=...&limit=5`，按返回的实际slug读取详情，HTML转纯文本，不向该站发送DeepSeek密钥或投稿。

词条updated_at只是维护时间，视频published_at只是视频时间；都不能证明近期流行。前端分别显示事实来源和表达素材，不将接口请求成功等同于素材已采用。

## 本地开发、验证与诊断

服务端配置DEEPSEEK_API_KEY，禁止使用VITE_前缀。开发可以放入被git忽略的.env.local。

- `npm run dev:function`：Deno，允许外网及该环境变量；无Deno时 `node dev/node-local.mjs`。
- `npm run dev`：前端及本地服务代理。
- `npm test`：协议、原始Bin记录回放、相关性、旧梗、降级、缓存、异常注入等回归。
- `npm run build`：前端类型检查及构建。
- `npm run check:function`：Deno检查；无Deno时 `npm run check:function:node` 只做TypeScript兼容检查，不能替代目标Deno环境实测。
- `node --env-file=.env.local dev/trace-generation.mjs '如何评价bin' game`：显式开启本地完整HTTP诊断，保存请求、提示词、响应、阶段事件、异常类型/堆栈/根异常和finish_reason到artifacts/traces。
- `node dev/audit-bin.mjs`：五个独立进程进行真实冷启动验证，会产生API费用，汇总写入artifacts/traces/bin-fixed-cold-audit.json。
- `node dev/replay-original-bin.mjs`：离线回放首次生成响应，对照同步/异步响应复制，并注入日志异常；不产生网络请求。

完整请求只用于显式启用的本地公开测试种子，不能默认记录私人输入。生产日志只记录追踪编号、阶段、状态和错误类别；前端错误展示追踪编号。诊断回调和日志异常均被隔离，不能使已生成的结果返回500。诊断文件被git忽略，不进入发布包；密钥及认证头已脱敏。

首次历史500在原始响应离线回放、同步/异步复制对照中未复现，不能宣称已定位根因。新增诊断用于下一次异常直接定位；网络、JSON、结构和输出截断不再统称generation_failed。

## 人工补充梗库与周更

`functions/data/memes.json`是独立、版本化、已审核的降级库。当前初始库为空，正常开楼主要使用梗Wiki，不依赖人工库非空。

`.github/workflows/weekly-memes.yml`默认周一北京时间09:15运行，支持手动触发；合入默认分支后需配置GitHub Actions Secret DEEPSEEK_API_KEY。调度可能延迟。`npm run memes:update`生成artifacts/memes/candidates.json和review.md，不改正式库、不自动发布。

人工核验来源、含义、语境及是否真的适用；仅将通过审核的条目合入正式库，填写reviewed_at、设置enabled=true并更新version。执行 `npm run memes:check`、回归、服务端检查及构建后人工发布。失败或未审继续使用旧版；回滚恢复上一已审核版本并重新发布。

## 已确认的 JSON 输出异常

真实复测中曾收到HTTP200、finish_reason=stop，但评论字符串包含未转义换行的返回，旧解析会报bad_json。现在仅将JSON字符串内部的裸控制字符规范化为合法转义，再重新解析并运行原有结构、去重及引用校验；不补引号、不补括号、不发明字段、不盲目重试。成功规范化记录validation/normalized/unescaped_json_control事件。原始损坏响应已保存为回归夹具。

这是一项新确认并修复的502原因，不能倒推为之前那次未复现500的原因。生成事实仍可能出错：核验背景来源及材料相关性不等于已经对每一句生成评论作过独立事实核查。

## 评论阅读布局与表情

评论区默认按讨论串组织，主评论独立展示，回复集中到该主评论下的同一层楼中楼；深层互怼通过“回复@昵称／原楼号”保留关系，避免无限缩进。默认预览3条回复，支持展开/收起，并可切回按原始楼号排列。所有楼号、localId、点赞和回复引用保持原值，不修改后端协议。

reply_to是每条回复的直接对象，不限制一条评论能收到的回复数量。提示词要求多个独立主评论、多人回复同一楼、对更早楼层的分叉接话，避免只按上一楼接龙。正文支持原生Unicode emoji、颜文字和[doge]等文字表情；头像emoji字段仍独立，括号表情不是外部贴图。

结构参考：微博评论功能分析（https://www.woshipm.com/pd/693555.html）、B站评论区截图讨论（https://github.com/the1812/Bilibili-Evolved/discussions/4804），以及Reddit对折叠/展开评论的交互说明（https://support.reddithelp.com/hc/en-us/articles/38744650091412-How-to-use-keyboard-shortcuts-hotkeys）。这些是结构参考，不代表上述平台当前所有版本的布局一致。

表情展示兜底：模型只填emoji字段、正文没有表情时，界面按稳定楼号少量复用模型自选的情绪表情；原文已有Unicode表情、括号表情或颜文字时不叠加。不会把工具/食物等头像图标硬塞进正文，不改存储的text，不新增AI请求。头像字段与正文原生表情仍分别支持。
