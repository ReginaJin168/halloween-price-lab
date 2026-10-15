# Halloween Event Lab v2：空间模拟与教师说明

本版把课堂决策收敛为**票价 $1–$100**。学生观察一晚的游客移动，再用同一组 1,000 个可能夜晚比较平均利润与游客体验。地图、客流、价格意愿、服务时长、人员与成本全部是虚构教学假设，不是实际公园预测或场地规则。地图为示意图，不代表真实地理位置。

## 1. 固定活动规则

- 活动开始 18:00；18:00–19:30 接待抵达者；两项活动在 20:00 结束。
- **Costume House** 最多同时容纳 20 位游客；**Pumpkin House** 最多同时容纳 24 位游客。两处各有独立、先到先服务的队列。
- 每人预先随机选择先去哪个房屋，完成后再去另一个。不能重复同一项活动，也不会因看见队伍长就换路线。
- 完成两项活动后，游客走到 **Picnic Area**，随机停留，再走向出口。模型中的 Picnic Area 没有并发人数限制。
- Picnic Area 在 20:30 结束停留；游客随后离场。固定员工班次为 17:45–20:45，覆盖本模型全部游客离场时间。
- 一晚累计最多接待 400 位付费游客，按实际抵达入口的先后接待。这个限制是**整晚累计售票上限**，不是园内同时容纳人数上限。
- 入口人员固定为 2 人，Costume House 2 人，Pumpkin House 3 人，Picnic Area 1 人，共 8 人。入口登记时长被简化为零；模型的排队瓶颈发生在两座房屋。工作人员不是“一人服务一位游客”的服务台，房屋容量表示可同时参与活动的人数。

学生只改变票价；人员、活动容量、材料数量、时间和路线都固定。代码允许教师或测试覆盖参数，但课堂界面不暴露这些选项。

## 2. 空间如何实际影响结果

地图大小为 1000×600 示意单位，固定节点如下：

| 地点 | x | y |
|---|---:|---:|
| Entrance | 170 | 430 |
| Costume House | 285 | 180 |
| Pumpkin House | 755 | 180 |
| Picnic Area | 750 | 440 |
| Exit | 935 | 530 |

固定步行路径连接入口与两座房屋、两座房屋彼此、两座房屋分别与 Picnic Area，以及两座房屋和 Picnic Area 分别与出口。每次移动沿对应路径直线行走；距离为节点间欧氏距离。步行速度每人预先独立抽取，服从 Uniform(64,96) 示意单位/分钟。

`walkingMinutes(i, from, to) = distance(from, to) / walkingSpeed(i)`

这些时间进入离散事件模拟。游客离开一项活动后，需要真实经过步行时间才能到下一条队列；因此两条初始路线的时间不同，会改变到队顺序、等待、完成机会与离场时间。动画使用完全相同的时间轨迹，不是独立播放的装饰动画。没有额外模拟步行路径拥堵、碰撞或绕行。示意坐标不是米，也不应由图推算真实场地尺度。

## 3. 价格、天气与潜在游客

每一晚先抽取共同天气：Clear 65%、Warm 20%、Rain 15%，相应客流倍率为 1、0.9、0.65。独立抽取共同当日客流倍率：

`Z ~ Gamma(shape=16, scale=1/16)`

它的平均值为 1、变异系数为 0.25。候选游客总量条件于天气及 Z 为：

`N ~ Poisson(600 × weatherMultiplier × Z)`

每位候选游客的最高愿付价格独立抽取：

`W_i ~ Exponential(mean=24 dollars)`

当票价为 p 时，只有 `W_i >= p` 的候选者会抵达入口。**没有到场的人不计入 turnedAway**。因此条件期望需求为：

`E[demand(p) | weather,Z] = 600 × weatherMultiplier × Z × exp(−p/24)`

选择指数分布是为了产生平滑的价格—需求取舍，不是对真实人群数据的拟合。忽略 400 人售票上限时，期望票款与 `p × exp(−p/24)` 成正比，在 $24 附近出现内部峰值。有限样本、共同随机情境和售票上限会改变实际扫描的最大值；示例价格不代表真实活动的最优票价。

候选游客的入口抵达时间在三个 30 分钟时段内分别占 30%、42%、28%，给定时段后均匀抵达。因此生成模型的到场时段为 [0,90) 分钟。所有候选人的愿付价格、先去地点、抵达时间、两项活动时长、野餐时长和步速都预先抽取，与学生当前票价无关。

同一 seed 和夜晚 index 保留相同候选库。提高价格时，到场人群是低票价到场人群的子集，保留下来的同一人也有相同活动时长与路线。这使不同票价面对同一组外部情境。达到累计 400 人上限后，实际入场人员名单未必嵌套：涨价过滤掉较早到场者后，原本被拒的较晚者可能获得空余名额。

## 4. 两座房屋的活动与队列

活动时长独立按 Gamma 分布抽样（shape–scale 参数）：

| 项目 | 平均值 | shape | scale |
|---|---:|---:|---:|
| Costume House | 8 分钟 | 9 | 8/9 |
| Pumpkin House | 10 分钟 | 9 | 10/9 |
| Picnic Area 原计划停留 | 18 分钟 | 4 | 4.5 |

房屋的每个位置在一位游客活动结束后立即释放。队列采用严格先到先服务，每次从队首开始，分配当前最低编号的空闲位置；动画中的房屋内位置编号在该次活动期间保持不变。同一时刻活动完成先于关门与新抵达事件处理。

只有当前时间加该游客已经抽样的活动时长不超过第 120 分钟时，才可以开始该活动。模拟允许运营方在安排位置时知道这次活动所需时长，是有限课堂模型的假设。

**临近关门的队首如果来不及完成，就一直等到关门；后面的短活动游客也不能越过他。** 因此最后几分钟可能出现空位与队列同时存在。第 120 分钟所有队列结束，未开始者从所在房屋走向出口，不再完成剩余活动。排队期间不提前放弃；已经开始的活动都能在关门前或恰好关门时完成。正在房屋间步行的人继续走到目标地点，如果到达时已经关门，就从该地点走向出口。

完成两项活动的人走到 Picnic Area，实际停留为 `min(原计划停留, 150 − 到达分钟)`。在默认地图与速度范围下，最迟第 120 分钟完成的人也会在第 150 分钟前到达，实际停留严格为正。之后走向出口，所有人均在固定班次结束前离开。教师若把地图放大或步速极度减小，可能出现野餐区关门后才到达的情况；代码让这类自定义情境中的游客直接走向出口。

## 5. 收入、固定成本与体验

票款只来自获准入场者，入场时收取。未完成项目不退款，野餐区不另外收费。模型没有加班费用、逐客材料成本、缺货退款或物资数量决策。

| 固定成本项 | 一晚金额 | 教学含义 |
|---|---:|---|
| Staff | $600 | 8 人 × 固定 3 小时 × 虚构 $25/小时 |
| Pumpkin materials | $800 | 预先备好最多 400 人份材料的固定预算 |
| Site setup | $400 | 场地布置与清理的固定预算 |
| **合计** | **$1,800** | 即使无人到场也支付 |

这些金额不是工资建议、报价或场地许可费用。改变票价不会改变预先购买的材料预算，不再单独统计剩余材料。

`revenue = price × admitted`

`profit = revenue − 1800`

每位入场游客的体验分为：

`experience_i = max(0, 100 − 0.8 × totalQueueMinutes_i − 25 × unfinishedActivities_i)`

其中 unfinishedActivities 是尚未完成的房屋项目数（0、1 或 2）。等待只统计两座房屋排队时间；步行、活动本身与野餐不直接扣分。未完成活动的惩罚与等待惩罚都影响低价拥挤夜晚。体验分是透明的教学代理分数，不是调查预测；它不包含票价贵贱感受、天气舒适度或被拒入场者的评价。结果另外报告到场、入场与被拒人数，不能仅靠很少游客的高分评价一个方案。

单晚 experience 和 meanWait 是该晚所有入场游客的平均值；completionRate 是完成两项活动的入场游客比例。无入场游客时三项均为 `null`，界面应显示 N/A 或破折号，不能显示 0 分钟或 100 分。没有游客时利润仍为 −$1,800。

## 6. 一晚与 1,000 晚

一晚模式展示一组完整事件和逐人移动，只是一个可能结果。1,000 晚模式使用 seed 固定、index=0…999 的 1,000 组独立情境。相同 seed 与 index 可复现同一晚；价格比较应复用同一个夜晚库。

`summarize(results)` 的汇总口径：

- `avgProfit`、`avgRevenue`、`avgAdmitted`、`avgDemand`、`avgTurnedAway`、`avgCompletedBoth`：每晚等权平均。
- `avgExperience`：合并所有入场游客后，每人等权的平均体验分。多人的夜晚权重更高。
- `meanWait`、`completionRate`：同样按入场游客人数加权。
- `meanNightExperience`：额外提供每个非空夜晚等权的平均体验，用于教师比较口径。
- `lossProbability`：利润小于零的夜晚比例；`noAdmissionProbability`：无人入场夜晚比例。
- 所有夜晚都无人入场时，体验、等待与完成率仍为 `null`。

模拟次数减少的是蒙特卡洛抽样误差，不会验证教学假设。平均利润较高的票价未必有最高体验，也没有自动规定利润与体验孰轻孰重。

## 7. 代码接口与动画

`engine.js` 不依赖第三方库；浏览器导出 `window.HalloweenSim`，Node.js 导出 CommonJS。核心接口：

```javascript
const H = require('./engine.js');
const night = H.simulateNight(20, {
  seed: 'classroom-2026', index: 0, trace: true
});
const state = H.stateAt(night, 60);
const results = Array.from({ length: 1000 }, (_, index) =>
  H.simulateNight(20, { seed: 'classroom-2026', index, trace: false }));
const summary = H.summarize(results);
```

`validatePrice(price)` 返回 `{valid, errors}`；`simulateNight` 对非法票价抛出错误。引擎接受范围内有限数字（包括小数），课堂界面可以限制整美元。`defaultPlan` 仅为 `{price:20}`；`config` 是 `defaultConfig` 的别名。

单晚结果含 `price, seed, index, weather, demand, admitted, turnedAway, revenue, fixedCost, profit, experience, completedBoth, completionRate, meanWait, endTime, exited`。`potentialDemand` 为 demand 的兼容别名。`endTime` 是最后一位游客实际到达出口的分钟数；无人时为 0，不是活动的规定关门时间。

`trace:true` 时额外返回 admitted 游客数组 `visitors`，含原始抽样字段、`completed`（是否完成两项）、`completedActivities`、`waitMinutes`、`experience`、`departure` 及 segments。每段为 walk、queue、activity 或 picnic，带 start/end 和位置；walk 的 from/to 是地图节点名，走向出口也使用 walk。房屋 activity 的 slot 是固定占位编号；Picnic Area slot 使用游客 ID。`trace:false` 省略轨迹数组，数字结果保持一致。

`stateAt(night,t)` 返回时间 t 的移动游客、地点内人数、排队人数以及累计 arrived/exited。时间区间按 `[start,end)` 判断，活动结束瞬间便释放位置；离场瞬间便移除。queue 的 slot 转换为当时队列顺序，便于展示队首和队尾。arrived 仅计已入场并抵达入口者，不包括被累计售票上限拒绝的人。到达 `endTime` 时所有游客均已离场。入口没有独立登记延迟，因此入口 inside/queue 均为 0。

教师与测试可使用 `generateScenario(seed,index,config)` 和 `simulateScenario(price,scenario,{trace,config})`，构造确定性情境检验容量、顺序与关门行为。每位候选者需提供 `id, arrival, willingnessToPay, firstLocation, hauntedMinutes, pumpkinMinutes, picnicMinutes, walkingSpeed`。walkingSpeed 是**绝对示意单位/分钟**，不是相对倍率。`resolveConfig` 合并教师参数，并始终以成本分项之和计算 totalFixedCost，防止页面总成本与计算脱节。

## 8. 维护时的检查重点

检查相同 seed 的复现、高价到场人群嵌套、两座房屋容量、严格 FIFO、活动完成不晚于关门、未完成者不进 Picnic Area、所有完整游客先完成两个不同项目再野餐、无游客时 N/A、人数与现金流守恒、逐段时间连续以及最后所有游客离场。应检查不同票价确实产生拥挤与体验差异，同时平均利润峰值处于允许区间内部。空间版本替代了旧版物资/员工/分时名额决策，不再沿用旧模型结果作为当前示例。

## 9. 实时表情（v2.0.1）

动画中每张脸代表一位游客；颜色继续区分行走、排队、参与活动与野餐。
当前个人体验分 **≥90 是笑脸，<90 是哭脸**，不按全体平均分决定表情。
`visitorExperienceAt(visitor, t)` 只扣除截至 t 已发生的排队时间；仍在队列中时，
只统计当前已经等待的那一段。未完成项目的每项 25 分惩罚在活动关门的第 120 分钟
计入，不能因为游客刚入场、尚未玩完就提前扣分。恰好在第 120 分钟完成的项目计为完成。
函数不会读取未来等待时间来决定当下表情，也不会修改游客的最终体验分。
向后拖动播放时间会恢复当时的分数和表情；在离场时实时分数与最终分数一致。

`stateAt(night,t).guests` 的每位游客新增 `experience` 和 `expression`（smile/cry）。
每位有轨迹的游客携带 `experienceRules`，确保教师修改等待扣分或关门时间时仍能正确重播。
地图的笑脸/哭脸计数仅包含当前仍在场内的游客，不包含尚未到达或已经离开的游客。
这些表情是原有评分模型的实时呈现，不改变利润、客流、完成率或 1,000 晚的汇总口径。
