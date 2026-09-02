# 更新日志

本文件记录每个版本的实际改动。写给使用者看，不是施工日志：只写用户能感知到的变化，以及为什么这么改。

## 2.1.0

### Added / 新增

- **Thirteen workout numbers Zepp was already sending are now kept, including the heart-rate zone split.** An audit of the stored raw payloads found 198 distinct fields on a workout, of which 26 were being read. Discounting the slots Zepp reserves but never fills for these devices, 66 carried real data and were discarded on arrival. This adds back the ones a person can actually see: minimum heart rate, step count, moving time, total ascent and descent, highest and lowest altitude, aerobic and anaerobic training effect, perceived exertion, average and peak cadence, and average stride length — plus `heart_range`, which is the time spent in each heart-rate zone, already computed by the watch against the zone boundaries you set on it. All of them appear in the JSON export and the FIT files. Sentinels stay absent rather than becoming zeroes: a bike ride reporting 0 steps has no step count, it did not walk zero steps.
- **云端一直在给、而我们一直没取的十三项运动数据，现在存下来了，包括心率区间分布。** 把存下来的原始报文完整审一遍：一条运动有 198 个字段，我们只读了 26 个。剔除 Zepp 预留但在这些设备上从不填的槽位之后，仍有 66 个带真实数据的字段在入库时被丢掉。这一版把其中用户能直接感知的那些拿了回来：最低心率、步数、运动时长、累计爬升与下降、最高与最低海拔、有氧与无氧训练效果、主观疲劳度、平均与最高步频、平均步幅——以及 `heart_range`，它就是「这次运动在各心率区间待了多久」，手表早就按你在表上设定的区间边界算好了。这些值会出现在 JSON 导出和 FIT 文件里。哨兵值仍然保持缺失而不变成 0：一次骑行报回来 0 步，意思是它没有步数，不是走了 0 步。
- **Total ascent now comes from Zepp, not from our own reading of the altitude series.** Both numbers exist and they disagree — a 6.37 km walk is 59 m to Zepp and 37 m by our own count against a 1 m noise floor. What the person sees in the Zepp app is 59, so that is what the export says now; our own figure is the fallback for workouts the cloud gives no ascent for.
- **累计爬升改以云端为准，不再用我们自己从海拔序列算的那个。** 两个数字都存在，而且对不上——一次 6.37 公里的健走，Zepp 说 59 米，我们按 1 米噪声底算出来是 37 米。用户在 Zepp App 里看到的是 59，导出就跟它一致；云端没给爬升的那些运动，才回退到我们自己算的。
- **Workouts export as `.fit`, one file per workout.** [#28](https://github.com/lingcang728/ZeppBridge/issues/28) asked for this and was told it could not be done honestly, because Zepp's cloud supposedly does not return enough raw data. **That answer was wrong, and the reporter was right.** ZeppBridge has been decoding the per-second series out of Zepp's workout detail all along — GPS track, heart rate, speed, altitude, running power, ground contact time, vertical oscillation, per-kilometre splits and pause intervals — and the GPX exporter already read them. The only missing piece was a FIT writer. Pick **FIT** on the export page, choose a folder, and every workout in range with a decoded series becomes its own `.fit` file. Fields that were never measured stay absent rather than being padded with zeroes, and a workout with no series produces no file rather than an empty one. Cadence is deliberately not written: its unit cannot be reconciled against any summary value in the local database, and a wrong unit would read exactly twice too high without looking wrong.
- **运动可以导出成 `.fit` 了，一次运动一个文件。** [#28](https://github.com/lingcang728/ZeppBridge/issues/28) 提的就是这个，而当时的回复是「做不了，因为 Zepp 云端给的原始数据不够」。**那个回答是错的，提问的人是对的。** ZeppBridge 一直在解 Zepp 运动明细里的逐秒序列——GPS 轨迹、心率、速度、海拔、跑步功率、触地时间、垂直振幅、每公里分段、暂停区间——GPX 导出器读的就是它们。缺的只是一个写 FIT 的编码器。在导出页选 **FIT**、指定一个文件夹，范围内每条带明细序列的运动都会变成自己的一个 `.fit`。没测到的字段就是不写，不会补零；完全没有序列的运动不产出文件，而不是产出一个空文件。步频刻意不写：它的单位在本地库里找不到任何汇总字段可以对账，而单位错了会正好差两倍，且从结果上看不出来。

- **`zeppbridge-cli reprocess`, and a `sync` that no longer leaves headless libraries behind.** A normalizer revision — new sport codes, the sleep-stage fix, the all-day stress curve — only reaches records that get replayed, and the replay ran in exactly one place: a background thread in the desktop app's startup. Anyone running the container or the CLI alone never had that startup, so their history stayed on whatever rules were in force the day each record first synced, and every upgrade looked like it worked. Now `sync` replays before it syncs (that is the command already on a timer, so nothing has to change on your side; `--no-reprocess` opts out), `status` and `export` say the library is stale instead of quietly acting on it, and `reprocess` is there for anyone who wants it done now — `--all` replays everything rather than only what the revision bump needs. Replays never touch the network and never rewrite the "last cloud sync" time.
- **新增 `zeppbridge-cli reprocess`，并且 `sync` 不再把无头用户的历史落在后面。** 解析器每升一版——新的运动编号、睡眠阶段修正、全天压力曲线——只有被重放过的记录才跟得上，而重放此前只在一个地方发生：桌面应用启动时的一个后台线程。只跑容器或只跑命令行的人从来没有那次启动，于是他们的历史永远停在每条记录第一次同步那天的规则上，而每次升级看起来都是成功的。现在 `sync` 会先重放再同步（它本来就是挂在定时器上的那条命令，所以你什么都不用改；不想要就加 `--no-reprocess`），`status` 和 `export` 会明说库是旧的而不是默默按旧数据作答，`reprocess` 则留给想现在就做完的人——加 `--all` 是整库重放，而不只是这次修订号变更需要的那部分。重放不联网，也不会改写「上次云端同步」的时间。

### Fixes / 修复

- **A normalizer upgrade no longer deletes your GPS tracks.** The upgrade that replays workout summaries deleted each summary row before writing it back, and `workout_samples`, `route_points`, `workout_pauses` and `workout_splits` all hang off that row with `ON DELETE CASCADE`. So every per-second series, every GPS track, every lap split and pause belonging to a replayed workout went with it — and that upgrade does not replay workout detail, so nothing brought them back. On the library this was found with, 1,228,034 samples and 1,097,300 track points disappeared, and the upgrade reported success. Summaries are now updated in place instead of being deleted first, which is what the merge logic was written for all along: it is also what lets a replay correct an old sport type without discarding the type you set by hand. Only rows a payload genuinely stopped producing are removed.
- **解析器升级不再把你的 GPS 轨迹删掉。** 重放运动汇总的那条升级路径，会先删掉汇总行再写回去，而 `workout_samples`、`route_points`、`workout_pauses`、`workout_splits` 四张表都以 `ON DELETE CASCADE` 挂在那一行上。于是被重放到的每一条运动，它的逐秒序列、GPS 轨迹、每圈分段和暂停区间都跟着一起没了——而那条升级路径并不重放运动明细，所以没有任何东西会把它们找回来。在发现这个问题的那个库上，1,228,034 条采样和 1,097,300 个轨迹点就这么消失了，而升级报告的是成功。现在汇总行改成就地更新，不再先删——合并逻辑本来就是为此写的：也正是它让一次重放既能纠正旧的运动类型，又不会丢掉你手动改过的那个。只有报文确实不再产出的行才会被删掉。
- **A replay of a large library takes seconds instead of minutes.** Rebuilding derived records from stored payloads committed once per inserted row, so a library with a few hundred thousand samples spent its entire replay waiting on the disk to confirm each one — 237 seconds for a single stream on an 842 MB library, with barely a second of that spent actually parsing. Rows are now committed in batches of 64 payloads, and the payloads themselves are read one at a time instead of being loaded into memory up front, which is what made a replay a risk on a NAS or in a memory-capped container in the first place. Batch boundaries fall between payloads, so a payload's old rows and its new ones are always cleared and rewritten together.
- **大库的重放从几分钟变成几秒。** 从存下来的报文重建派生记录时，每插一行就提交一次，于是一个有几十万条采样的库，整个重放的时间几乎都花在等磁盘逐行确认上——842 MB 的库上光一条流就是 237 秒，其中真正用来解析的连一秒都不到。现在每 64 条报文提交一次，报文本身也改成一条一条读，不再在开始前整个装进内存——那正是重放在 NAS 和有内存上限的容器里显得危险的原因。批的边界落在报文之间，所以一条报文的旧行和新行永远是一起清、一起写的。
- **A `.fit` now carries average speed, top speed, total ascent and cadence.** The first export produced files that imported cleanly but landed in the app with those four fields showing zero. The data was never missing — the summary fields simply were not written, and importers read those rather than recomputing from the per-second records. Average speed is distance over time, top speed is the measured maximum of the series, and ascent is the sum of the per-kilometre gains the decoder already measures against a 1 m noise floor. Cadence was previously left out on the grounds that its unit could not be checked; it can. The workout's own cloud summary carries `max_frequency` 141 against a series whose maximum is 141.0, `avg_stride_length` 70 cm against the 0.70 m implied by reading the series as steps per minute, and `total_step` 8998 against the 9060 that reading implies. Reading it as revolutions per minute would imply a 0.35 m stride and twice the steps. So the series is steps per minute, and it is written as FIT cadence — halved for running, walking and hiking, where one revolution is a full stride, and left alone for cycling, where a revolution is a crank turn.
- **`.fit` 现在带上了平均速度、最高速度、累计爬升和步频。** 第一版导出的文件能正常导入，但这四项在应用里都显示为 0。数据从来就在，是汇总字段没写——而导入方读的正是这些字段，不会自己从逐秒记录里重算。平均速度就是距离除以时间，最高速度取自序列实测的最大值，累计爬升是解析器本来就按 1 米噪声底量出来的每公里爬升之和。步频之前以「单位无从核对」为由没写；其实核得了：这条运动自己的云端汇总里 `max_frequency` 是 141，而我们的序列最大值正好是 141.0；`avg_stride_length` 是 70 厘米，而按「步/分」读出来的步幅正好是 0.70 米；`total_step` 是 8998，按同一读法推出来是 9060。按「每分钟转数」读则步幅 0.35 米、步数翻倍。所以这个序列的单位是步/分，写进 FIT 时对跑步、健走、徒步除以二（一个周期是一整步），骑行原样保留（一个周期是曲柄转一圈）。
- **Linux: a window that opened white now opens.** WebKitGTK 2.42 turned its DMABUF renderer on by default, and on a good number of driver and compositor combinations it fails outright — the window appears, it is blank, and the terminal prints nothing at all. [#32](https://github.com/lingcang728/ZeppBridge/issues/32) reported exactly that on openSUSE, from both the AppImage and the Flatpak. The silence was not the absence of an error; that failure path is simply quiet. ZeppBridge now sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` on Linux unless you have set it yourself, so `WEBKIT_DISABLE_DMABUF_RENDERER=0` still gets the faster path back.
- **Linux：开出来是一块白板的窗口，现在能开了。** WebKitGTK 2.42 起默认启用 DMABUF 渲染器，而它在相当一批驱动与合成器的组合上会直接失败——窗口出来了，是白的，终端一个字都不打印。[#32](https://github.com/lingcang728/ZeppBridge/issues/32) 在 openSUSE 上报的正是这个，AppImage 和 Flatpak 都白。没有报错不是因为没出错，是这条失败路径本身就是静默的。现在 Linux 上默认关掉它；你自己设过这个变量就尊重你的值，想要回那条快路径就设 `WEBKIT_DISABLE_DMABUF_RENDERER=0`。
- **Linux: a missing tray library no longer stops the app from starting.** The tray icon comes from the desktop, through `libayatana-appindicator3` — a library the GNOME Flatpak runtime does not ship and some desktops do not install. When it is absent that C library does not return an error, it panics, which took the whole app down at launch ([#11](https://github.com/lingcang728/ZeppBridge/issues/11) carries the backtrace). What was actually missing was a decorative icon. ZeppBridge now catches that, keeps running, and prints the install command for your distribution. With no tray, closing the window quits instead of hiding — hiding into a tray that does not exist leaves a running process with no way back to it. The `.deb` and `.rpm` packages now declare the dependency, so there it should simply be present.
- **Linux：缺托盘库不再让应用起不来。** 托盘图标由桌面环境提供，走的是 `libayatana-appindicator3`——GNOME 的 Flatpak runtime 里没有这个库，一些发行版的桌面上也没装。它不在的时候那个 C 库不是返回错误，是直接 panic，于是整个应用在启动时就崩了（[#11](https://github.com/lingcang728/ZeppBridge/issues/11) 里有回溯）。而真正缺的只是一个装饰性的图标。现在这种情况会被接住，程序照常运行，并打印出你的发行版对应的安装命令。没有托盘时关闭窗口就是退出，不再隐藏——藏进一个不存在的托盘，等于留下一个再也叫不回来的进程。`.deb` 和 `.rpm` 现在声明了这个依赖。
- **Firmware version numbers are no longer listed as devices.** Someone reported three "unidentified data sources" in the sidebar labelled `0.91.20.5`, `0.91.17.5` and `0.91.20.5`; clicking them did nothing and there was no way to remove them. They were never devices. Zepp puts a firmware string in the `deviceId` / `sn` position in some payloads, and the extractor matched on the field name without ever looking at the value — so every firmware version became a "device", and every update added another one. A real device identity is a hex MAC, a numeric serial or a product code, none of which contain dots, so a value shaped like a version number is now rejected on the way in, and rows already stored are removed on upgrade. Only the identity rows go: the samples filed under them are real, and are re-attributed to the right device on the next sync.
- **固件版本号不再被列成设备。** 有用户报告侧边栏里多出三个点不动也删不掉的「未识别数据源」，标签是 `0.91.20.5`、`0.91.17.5`、`0.91.20.5`。它们从来就不是设备：Zepp 某些报文在 `deviceId` / `sn` 的位置上放的是固件字符串，而抽取逻辑只认字段名、从不看值，于是每一个固件版本都变成一台「设备」，固件每升一次就再多一台。真实的设备标识是十六进制 MAC、纯数字序列号或产品码——没有一个带点——所以这种形状的值现在在写入时就被挡掉，已经存进库里的那些行会在升级时删除。只删身份行；挂在它们名下的采样是真的，下次同步会重新归到正确的设备上。

- **Two more Amazfit models are recognised by number alone.** T-Rex 3 Pro gains a second device number and Helio Ring gets its first, both from two independent, undisputed reports — the same bar every other number in the catalog had to clear. Three numbers from the same batch were deliberately left out and the reasons are written down next to them: one is a 3-to-3 tie between Active MAX and Active 2, and two carry a genuine dissent that the existing "one account, two watches, picked the wrong one" ruling does not explain away.
- **又有两款 Amazfit 能只凭编号认出来。** T-Rex 3 Pro 多收了一个编号，Helio Ring 收到了它的第一个，依据都是两份互相独立、无异议的报告——和目录里其他每一个编号过的是同一道门槛。同一批里有三个刻意没收，理由就写在它们旁边：一个是 Active MAX 和 Active 2 的 3:3 平票，另外两个各有一份真实异议，而既有的「一个账号两块表、在选择器里挑错了」那条裁决理由解释不了它们。

### Changed / 变更

- **CI checks out and sets up Node with actions that run on Node 24.** `actions/checkout` and `actions/setup-node` were pinned at v4, which targets the deprecated Node 20 and was being forced onto Node 24 with a warning on every run. Both are now v5. The artifact upload and download actions are deliberately still v4: they only run in the packaging and release jobs, which are skipped on pull requests, so bumping them would put an unexercised change directly into the release path.
- **CI 的 checkout 和 setup-node 换成跑在 Node 24 上的版本。** `actions/checkout` 和 `actions/setup-node` 原本钉在 v4，它面向已废弃的 Node 20，每次运行都被强制挪到 Node 24 并打一条告警。现在都升到 v5。artifact 的上传/下载动作**刻意**还留在 v4：它们只在打包和发布 job 里跑，而那些 job 在 PR 上是跳过的，升上去等于把一个没被验证过的改动直接放进发布路径。
- **The issue templates are bilingual, and they know Linux exists.** Both forms were Chinese-only, and the "which package did you use" list offered Windows and macOS only — so the first Linux install report had to be filed against a form with no way to say it was Linux ([#32](https://github.com/lingcang728/ZeppBridge/issues/32)). Every label is now English and Chinese, the package list covers AppImage, Flatpak, `.deb`, `.rpm` and the container image, the OS list names the common distributions, and there is a field for the desktop session — the tray and the keyring both come from the desktop, so on Linux that answer is often the whole diagnosis. There is also a terminal-output field, because "nothing was printed" is itself evidence.
- **Issue 模板改成中英双语，并且知道 Linux 的存在。** 两个表单原本全是中文，「你用的是哪个安装包」也只有 Windows 和 macOS——于是第一份 Linux 安装问题只能填在一个没法说明自己是 Linux 的表单里（[#32](https://github.com/lingcang728/ZeppBridge/issues/32)）。现在每一条标签都是中英两份，安装包一项涵盖 AppImage、Flatpak、`.deb`、`.rpm` 和容器镜像，操作系统一项列出常见发行版，另外加了一项桌面环境——托盘和密钥环都由桌面提供，在 Linux 上这一项常常就是答案本身。还加了一栏终端输出，因为「什么都没打印」本身就是证据。

## 2.0.0

### Added / 新增

- **The history list is no longer capped at 500 records.** With a full history downloaded, everything past the 500th record had no way into the app at all — the query had a limit and no offset, so the rest of your library existed on disk and nowhere on screen. Workout and sleep lists now page through the whole thing with a *Load more* button and say how many of the total you are looking at.
- **历史列表不再只显示最近 500 条。** 把全部历史下载下来之后，第 501 条往后的记录在应用里根本没有入口——查询只有上限没有偏移，于是剩下的记录存在磁盘上，却在界面上不存在。运动和睡眠列表现在能一直往下翻，底部有「加载更多」，并写明当前显示了总数里的多少条。
- **A history backfill can run itself to the end.** It used to hand back control after each round, so filling in years of history meant pressing *Start backfilling* every few minutes for an hour. There is now a *Run to completion* switch (on by default): each round starts the next until the range is done. You can stop at any point, nothing already fetched is lost, and if a round moves nothing it stops on its own and says so instead of spinning until morning.
- **补拉历史可以自己跑完。** 以前每跑完一轮就把控制权交回来，于是补几年的历史意味着一个小时里每隔几分钟点一次「开始补拉」。现在有一个「自动跑完」开关（默认打开）：一轮结束自动接上下一轮，直到整个范围做完。随时可以停，已经拉回来的一条都不会丢；而一轮下来一块都没推进时，它会自己停下来说明原因，而不是转到天亮。
- **A plain *Log out*, where you would look for it.** The only way out was called *Clear credentials* and lived at the bottom of Advanced — which reads like it might delete your data, so nobody pressed it. It is now on the account card, says in as many words that only the sign-in is cleared and every synced record stays, and states plainly that switching between accounts is not supported yet.
- **一个就叫「退出账号」的按钮，而且在你会去找它的地方。** 以前唯一的出口叫「清除认证」，藏在高级设置的最底下——那听起来像是会把数据删掉，所以没人敢点。它现在在账户卡片上，明说只清除登录、已同步的记录一条不动，并且直白地写出暂不支持多账号切换。
- **Daily peak heart rate, from the raw samples.** The Zepp app filters its daily peak — one report had it showing 104 on a day whose raw readings went past 120. The heart rate page now charts the peak, average and low of the samples actually stored on this machine, day by day. Days with very few samples are drawn as hollow markers and counted out loud, because the "peak" of twelve readings is not that day's peak. Zepp's own daily figure is never sent to us, so there is nothing to place beside it; the page says that rather than implying a comparison it cannot make.
- **每日最高心率，取自原始样本。** Zepp App 显示的日最高心率是过滤过的——有一份报告里，某天 App 显示 104，而原始读数超过 120。心率页现在按天画出本机实际存着的样本的最高、平均和最低值。样本很少的那几天画成空心点并单独点出来，因为十二个读数里的「最高」不是那一天的最高。Zepp 自己的那个日数值从来没有被送到我们这里，所以没有东西可以并排放；页面把这件事说出来，而不是暗示一个它做不到的对照。
- **Sixteen more Amazfit models are recognised by number alone.** Balance 3, Active 3 Premium and T-Rex Ultra 2 join the built-in catalog, from device numbers that two or more people independently identified. Codes that are still contradicted, or that only one person has reported, are deliberately left out.
- **又有一批 Amazfit 型号能只凭编号认出来。** Balance 3、Active 3 Premium 和 T-Rex Ultra 2 进入内置目录，依据是两份以上互相独立的用户指认。仍然互相矛盾的编号，以及只有一份报告的编号，刻意不收。
- **The MCP server speaks the 2026-07-28 protocol as well as the old one.** That revision removed the `initialize` handshake entirely and added `server/discover`; a client that follows it strictly could not connect at all. Both eras now work off the same server, so nothing you have configured needs changing.
- **MCP 服务同时支持 2026-07-28 和旧版协议。** 那一版把 `initialize` 握手整个取消了，并新增 `server/discover`；严格按新协议说话的客户端此前根本连不上。现在两个时代走同一个服务，你已经配好的东西不用动。

### Fixes / 修复

- **A sync that lost a whole data stream no longer reports success.** Only heart rate, daily summary and workouts counted towards the outcome. If sleep, HRV, wellness or workout detail genuinely failed, the app still said *Updated* or *No new data* — the screen was telling you everything was fine while a stream was missing. Any real failure is now *Partial*, and names which streams failed. A stream your watch simply does not provide still counts as neutral, not a failure.
- **整条数据流丢了的同步不再报成功。** 以前只有心率、每日汇总和运动记录参与判定。睡眠、HRV、健康指标或运动明细真的失败时，界面照样显示「已更新」或「没有新数据」——屏幕上说一切正常，而事实上少了一整条流。现在任何真实失败都会显示为「部分完成」，并说明是哪几条流失败了。你的表本来就不提供的那一项仍然算中性，不算失败。
- **A sleep stage we do not recognise is no longer called *awake*.** Unknown stage codes were mapped to awake so the stage bar would have no gaps — which meant the app was telling you that you were awake during a stretch nobody had verified. Those stretches are now drawn as *Unknown*, and the raw code from the cloud is kept so the next one can actually be identified.
- **认不出来的睡眠阶段不再被写成「清醒」。** 未知的阶段编码以前一律归为清醒，好让阶段条不出现空洞——代价是应用在替你断言一段没有任何人验证过的时间里你醒着。那些片段现在画成「未知」，并保留云端给的原始编码，好让下一次真的能查出它是什么。
- **A corrupt reading in a workout no longer shifts the ones after it.** An unparseable time delta was quietly read as zero, which put that sample on the same timestamp as the previous one — the sample count still looked right while pace, power and split were wrong. Unreadable rows are now skipped.
- **运动记录里的一个坏读数不再挪动它后面的读数。** 解析不了的时间增量以前被安静地当成 0，于是这个样本和上一个落到了同一个时间戳上——采样数看着是对的，而配速、功率和分段是错的。现在读不懂的行会被跳过。
- **Syncs that failed once and worked on the second press should be rarer.** A legitimate redirect used to eat one of the three network retries, and a rate-limited or overloaded response was retried after 50 ms whatever the server asked for. Redirects and retries now have separate budgets, and a `Retry-After` from the server is honoured, with exponential backoff and jitter otherwise.
- **「有时候同步失败，再点一次又好了」应该会少很多。** 一次合法的跳转以前会吃掉三次网络重试中的一次；而被限流或服务器过载的响应，不管对方说等多久，都只等 50 毫秒就重试。现在跳转和重试各记各的预算，服务器给的 `Retry-After` 会被尊重，没给时用指数退避加抖动。
- **Cancelling a sync now takes effect immediately.** Cancel was only checked between streams, so a request already in flight ran to its own 35-second timeout — on a bad connection you could watch the app spin for a while after pressing stop.
- **取消同步现在立刻生效。** 以前只在两条数据流之间检查取消，已经发出去的请求要等满自己 35 秒的超时——网络差的时候，按下取消之后还得看着应用转一会儿。
- **When the token cannot be saved, the app now tells you what to do about it.** A blocked or disabled credential store produced a red line and nothing else. It now names the likely causes and points at entering the App Token by hand, or the HAR import — neither of which depends on that automatic save.
- **令牌存不下去的时候，应用现在会告诉你怎么办。** 凭据管理器被禁用或被挡住时，以前只有一行红字，然后没有下文。现在会说明可能的原因，并指向「手动填写 App Token」和 HAR 导入——这两条路都不依赖那次自动保存。
- **The local API no longer lets one slow client block another.** Connections were handled one at a time, so a client that connected and then said nothing held everything else up until its read timed out. There is now a small pool of workers. Separately, saving the local API on/off switch could fail silently, leaving the screen saying it was on while the setting vanished on restart; that write is now atomic and reports failure.
- **本机 API 不再让一个慢客户端堵住另一个。** 连接以前是一个一个串行处理的，于是一个连上来却不说话的客户端能把其他人挡到它自己读超时为止。现在有一个小的工作线程池。另外，本机 API 开关的保存以前可能静默失败，界面显示已开启而设置在重启后消失；那次写入现在是原子的，失败会报出来。

### Changed / 变更

- **Linux packages are published for the first time — as a preview.** `.deb`, `.rpm`, AppImage and Flatpak are all built and attached to this release, and the download page lists them. They are marked preview on purpose: CI builds and tests every one of them, but **nobody has yet completed sign-in plus keyring (Secret Service / KWallet) on a real Linux desktop.** Please open an issue when something breaks — that is exactly what it needs.
- **首次发布 Linux 安装包——标为实验性。** `.deb`、`.rpm`、AppImage 和 Flatpak 都会随这次发布一起附上，下载页也会列出它们。标成实验性是有意的：CI 会把每一种都构建出来并跑测试，但**还没有任何人在真实的 Linux 桌面上完整走通登录加密钥环（Secret Service / KWallet）。** 遇到问题请开 issue——那正是它现在最需要的。
- **The export page now says what an export contains before you press it.** One report expected per-workout `.fit` files and found summaries instead. The page and the README now list what is included and what is not. **Correction:** this entry originally said `.fit` was impossible because Zepp's cloud does not return enough data. That was wrong — the data was already being decoded, only the writer was missing. See the Unreleased entry above and [#28](https://github.com/lingcang728/ZeppBridge/issues/28).
- **导出页现在会在你按下之前说明导出包里有什么。** 有一份报告本来期待拿到每次训练的 `.fit` 文件，结果只有摘要。页面和 README 现在都列出包含什么、不包含什么。**更正：** 这条原本写的是「`.fit` 做不了，因为 Zepp 云端返回的字段不够」。那句话是错的——数据早就在解了，缺的只是一个写文件的编码器。见上面的 Unreleased 条目与 [#28](https://github.com/lingcang728/ZeppBridge/issues/28)。
- **The "syncing the last N days" line now matches what actually happens.** The incremental window moved to 30 days a while back; the interface kept saying 7. It now reads the number from the same contract value the backend uses.
- **「正在同步最近 N 天」这句话现在和实际发生的事一致了。** 增量窗口早就改成 30 天，界面却一直说 7。它现在从后端用的同一个契约值里读这个数字。
- **The feedback endpoint drops duplicate submissions and limits how fast one source can add new ones.** The risk was never disk space — it is that device and workout codes are only accepted once two independent reports agree, and repeated submissions make any code look well-attested. Submitting the same report twice now returns the first report's id instead of storing a second copy. What is stored for rate limiting is a salted, daily-rotating hash, never an address.
- **反馈接口会去掉重复提交，并限制同一个来源添加新内容的速度。** 风险从来不是磁盘空间——而是设备编号和运动编号的收录规则是「至少两份互相独立的报告」，重复提交会让任何一个编号看起来都很有依据。同一份内容提交两次现在会返回第一份的 id，而不是存第二份。为限流存下的是一个加盐、每天轮换的哈希，绝不是地址。
- **Diagnostic reports can now carry "which Zepp code you corrected, and to what".** A workout being recognised as the wrong sport looked identical to one not being recognised at all — both arrived with no code information whatsoever, which is why [#24](https://github.com/lingcang728/ZeppBridge/issues/24) has been impossible to act on. The report now carries the code, our reading of it and yours, with no workout id, time, distance or GPS attached.
- **诊断报告现在能带上「你把哪个 Zepp 编号纠正成了什么」。** 一次运动被认成了别的运动，和它压根没被认出来，在报告里长得一模一样——两者都不带任何编号信息，这正是 [#24](https://github.com/lingcang728/ZeppBridge/issues/24) 一直推不动的原因。报告现在会带上编号、我们的解释和你的解释，不含 workout id、时间、距离或 GPS。

### Added / 新增

- **Linux packaging: Flatpak, deb, rpm, AppImage — plus a headless container image for the CLI and MCP server.** Linux was previously listed as unsupported, and two things stood in the way rather than one. The data directory was resolved as `data/` next to the executable, with a fallback that only existed on macOS — so a Flatpak, whose `/app/bin` is read-only, failed on first launch; packaged Linux installs now use the XDG data directory (`~/.local/share/zeppbridge/data`), while an AppImage keeps the install-local layout because that folder really is the user's. And there was no credential store on Linux at all: the backend refused every operation, so a token could not be saved even after a successful sign-in. The token now goes into the Secret Service (GNOME Keyring / KWallet), the same role Credential Manager and Keychain play elsewhere. Please read the verification table before relying on any of this: CI builds and tests all of it, but **nobody has yet completed a sign-in-and-sync on a real Linux desktop.** See [the Linux guide](docs/guides/linux.md).
- **Linux 打包：Flatpak、deb、rpm、AppImage，另加一个只含命令行和 MCP 服务的无头容器镜像。** 之前 Linux 写在「暂不支持」里，挡路的其实是两件事而不是一件。数据目录一直按「可执行文件旁边的 `data/`」来解析，而那条回退只在 macOS 上存在——于是 Flatpak（它的 `/app/bin` 是只读的）在第一次启动就失败；现在包管理器安装的 Linux 版走 XDG 数据目录（`~/.local/share/zeppbridge/data`），AppImage 则保持安装目录旁边的布局，因为那个目录确实属于用户。另一件是 Linux 上根本没有凭据存储：后端对每个操作都直接拒绝，所以哪怕登录成功了，令牌也存不下去。现在令牌进 Secret Service（GNOME Keyring / KWallet），扮演的角色和 Windows 凭据管理器、macOS 钥匙串一样。在依赖这些之前请先看那张验证表：CI 会构建、会跑测试，但**还没有任何人在真实的 Linux 桌面上完整走过一遍登录和同步。** 见 [Linux 指南](docs/guides/linux.zh-CN.md)。
- **`ZEPPBRIDGE_DATA_DIR` names the data directory outright.** "Next to the executable" is not a meaningful idea in a container, a systemd unit or a NAS task scheduler — the person writing the unit file has no reason to care where the binary landed. A relative value is rejected rather than resolved against the working directory, because a scheduler's working directory is not something that person can see either.
- **`ZEPPBRIDGE_DATA_DIR` 可以直接指定数据目录。** 在容器、systemd 单元和 NAS 的任务计划里，「可执行文件旁边」这句话没有意义——写单元文件的人没有理由去关心那个二进制落在哪。相对路径会被拒绝而不是按工作目录展开，因为调度器的工作目录同样不是那个人能看见的东西。
- **On a Linux machine with no keyring, the token can go in a 0600 file or come from the environment.** Selected explicitly with `ZEPPBRIDGE_CREDENTIAL_STORE=file` or `=env`; a value that is not recognised is an error rather than a silent fall back to the default, because a typo should not quietly move where a token is kept. The file store is an acknowledged downgrade — file permissions are the only thing protecting it — and it exists because on a headless machine the alternative is not a safer store, it is nothing at all.
- **没有密钥环的 Linux 机器上，令牌可以放在一个 0600 的文件里，或者由环境交进来。** 用 `ZEPPBRIDGE_CREDENTIAL_STORE=file` 或 `=env` 显式选择；认不出来的值是错误，不会安静地回落到默认——一处拼写错误不该悄悄改变令牌存到哪里去。文件存储是明摆着的降级（保护它的只有文件权限），它存在的理由是：在一台无头机器上，替代品不是「更安全的存储」，而是「根本用不了」。

### Fixes / 修复

- **The Settings page no longer reports a failed update check on Linux.** Every Linux channel has its updates handled elsewhere — Flatpak by `flatpak update`, deb and rpm by the distribution — and the updater manifest has no Linux entry, so a check there could only ever come back with "the platforms object has no linux-x86_64". That arrived as a red *update failed* describing nothing the reader could act on. The page now says updates come from the package manager, and does not offer a button that has nothing to check.
- **设置页不再在 Linux 上报一次失败的更新检查。** Linux 的每条分发渠道的更新都由别处负责——Flatpak 归 `flatpak update`，deb 和 rpm 归发行版——而更新清单里没有 linux 的条目，所以那里的检查只可能拿回一句「platforms 里没有 linux-x86_64」。那句话会以红色的「更新失败」出现，而它描述的东西读者做不了任何事。现在页面直接说明更新来自包管理器，也不再摆一个没什么可查的按钮。


### Fixes / 修复

- **Signing in no longer picks the wrong Zepp region and then shows an empty library.** Once your credentials were read, ZeppBridge asked around ten regional Zepp servers in parallel which one your account belongs to, and used whichever answered successfully first. The question it asked was "does this account have heart-rate samples in the last two hours" — and a server that has never heard of your account answers that with an empty result, exactly like the right server does when you simply were not wearing the watch. Worse, the wrong server answers *faster*, because it has nothing to look up. So the wrong region could win, get saved, and every sync after that went to a place your data is not: the screen said **Connected**, the sync said it succeeded, and nothing ever appeared. ZeppBridge now asks a question a stranger cannot answer — it looks up the devices bound to your account, by your account id — and prefers the server that actually returns your watch over one that merely replies. When no server can claim the account, the sign-in still completes, but the region is now marked as a guess instead of a fact.
- **登录不再挑错 Zepp 区域，然后给你一个空库。** 读到凭据之后，ZeppBridge 会同时问十来个 Zepp 区域服务器「这个账号是不是你的」，谁先答应就用谁。可它问的问题是「这个账号最近两小时有没有心率数据」——一个从没听说过你的服务器，回答同样是「空」，跟正确的服务器在你没戴表时给的回答一模一样。更糟的是错的那个答得**更快**，因为它压根不用去查。于是错误区域可能赢下这场竞速、被保存下来，之后每一次同步都打向一个没有你数据的地方：界面写着**已连接**，同步说成功，而什么都没有出现。现在问的是一个陌生人答不上来的问题——按账号 ID 去取这个账号绑定的设备——并且优先采用真的交出了你那块表的服务器，而不是仅仅应了一声的。所有服务器都认领不了这个账号时，登录照常完成，但区域会被标成「猜的」，而不是当成事实。
- **A sync that completes and brings back nothing now says so.** When the library was empty, every screen said *Nothing on this machine yet — sync once*, including right after a sync had just finished. That sentence asks you to redo the thing that just failed to help, and it never mentions the most likely reason. There is now a separate message for "the sync succeeded and returned nothing", and when the region was only a guess it says that first, with a way back to reconnecting.
- **同步跑通却什么都没带回来，现在会说出来。** 库是空的时候，每一页显示的都是「本机还没有任何数据，先同步一次」——包括刚刚同步完的那一刻。这句话是在让你重做一件刚刚没起作用的事，而且完全不提最可能的原因。现在「同步成功但一条没有」有它自己的一句话；如果当时的区域只是猜出来的，会先说这件事，并给出重新连接的入口。
- **A third-party sign-in that has stalled now tells you there is another way in.** Google passkeys frequently stop at *verifying it's you* inside an in-app window and never continue — that is a limitation of the embedded browser, not something ZeppBridge can drive through. Previously the only thing that ever happened was *Sign-in timed out*, fifteen minutes later. After two minutes stuck on a third-party account page with nothing read, ZeppBridge now says so and points at email + password, or entering an App Token by hand in Settings. Nothing is interrupted: the window stays open in case it does go through.
- **第三方登录卡住时，现在会告诉你还有别的路。** Google 的通行密钥在应用内窗口里经常停在「正在验证是不是你本人」不再往下走——这是嵌入式浏览器的限制，不是 ZeppBridge 能推得动的。以前唯一会发生的事是十五分钟后的一句「登录超时」。现在停在第三方账号页两分钟、并且什么都没读到时，会直接说出来，并指向邮箱+密码，或者在设置里手动填写 App Token。不打断任何东西：窗口留着，万一它真的走通了呢。
- **Starting sign-in again while the sign-in window is open now reopens it.** Clicking **Re-authenticate** a second time closed the window that was already open and immediately tried to build a new one under the same name — but a window is not gone the moment it is asked to close, so the new one was refused. The outcome was the worst of both: the window you could have used was gone, the screen said *Couldn't open the sign-in window* and *Sign-in failed*, and there was no way on except restarting ZeppBridge. ZeppBridge now waits for the old window to actually be gone before opening the new one. In the rare case it has not closed within three seconds you get *wait a moment and try again* instead of a dead end. This was never specific to 1.1.5 — it had been there for as long as the window has been reopened this way.
- **登录窗口开着的时候再点一次「重新认证」，现在会重新开出一个窗口。** 之前的做法是先关掉已经开着的那个，紧接着用同一个名字去建新的——可窗口不会在收到关闭请求的那一刻就消失，于是新窗口被拒绝了。结果是最坏的一种：原本还能用的那个窗口没了，界面上只剩「无法打开登录窗口」和「登录失败」，除了重启 ZeppBridge 没有别的出路。现在会等旧窗口真的消失，再开新的；万一它三秒内还没关掉，给出的是一句「稍等一下再试」，而不是死路。这不是 1.1.5 才有的问题，这条路径一直如此。

- **Road cycling is no longer an unrecognised workout, and your old ones get fixed too.** Zepp reports road cycling as numeric type `211`, which was not in the bundled catalog, so those sessions showed up as *Unrecognized workout (code 211)* — ten people reported it, covering 199 sessions, across every release since 1.1.1. The code is now in the catalog, and because the catalog changed, upgrading replays your already-stored history: sessions recorded months ago get relabelled too, not just the ones synced from now on.
- **公路骑行不再是「未识别运动」，已经存下来的那些也会一起改过来。** Zepp 把公路骑行报成数字类型 `211`，而随包目录里没有它，于是这些记录显示成「未识别运动（编号 211）」——十个人报过，合计 199 条记录，从 1.1.1 到 1.1.5 每个版本都有。现在目录里有了；并且因为目录变了，升级时会重放本机已有的历史：几个月前记下的那些也会跟着改名，不只是往后新同步的。
- **Trail running can now be picked when correcting a workout.** One report said a trail run was shown as open water swimming *and* that trail running was not in the correction list at all. The second half is fixed: it is in the list now. The first half is not — see below.
- **纠正运动类型时可以选「越野跑」了。** 有一份反馈说越野跑被显示成公开水域游泳，**并且**纠正列表里根本找不到越野跑。后半句已经修好：现在列表里有了。前半句没有，原因见下。
- **Watches that report nothing but numbers are now recognised.** Some accounts return a device list with no product-name field at all — the only model-class fact in the payload is an integer Zepp calls `deviceSource`, and Huami publishes no lookup table for it. Twenty-one of those numbers, covering eleven models (T-Rex 3, Balance 2 / 3 / 46mm, Active 2 44mm and Square, Bip 6, Cheetah 2 Ultra, Helio Strap, T-Rex 3 Pro, GTR 4 46mm), now resolve on their own. Every one of them came from someone assigning their model by hand and choosing to share it.
- **只报数字、不报名字的表现在也认得出来了。** 有些账号返回的设备列表里一个产品名字段都没有——整份响应里唯一和型号有关的事实，是 Zepp 叫做 `deviceSource` 的一个整数，而华米不公开它的对照表。现在有 21 个这样的数字、覆盖 11 款设备（T-Rex 3、Balance 2 / 3 / 46mm、Active 2 44mm 与方屏款、Bip 6、Cheetah 2 Ultra、Helio Strap、T-Rex 3 Pro、GTR 4 46mm）可以自动识别。这些数字每一个都来自某位用户手动指认了自己的型号、并且选择把它分享出来。

### Left alone on purpose / 特意没动的

- **Zepp workout codes other than 211.** Twenty-seven other unrecognised codes show up in feedback, some with more than a hundred sessions behind them. Volume says people use them; it does not say which sport they are. They stay as `unknown:<code>`, which you can still name yourself, until there is actual evidence.
- **211 以外的运动编号。** 反馈里还有 27 个未识别编号，有的背后上百条记录。数量只说明有人在用，不说明它是什么运动。在拿到真凭实据之前，它们仍然是 `unknown:<编号>`——你依然可以自己给它起名字。
- **Which code produces a trail run.** The report that raised it carried no code information, and Gadgetbridge's Zepp OS table does list `7` as open water swimming, which is what ZeppBridge uses. Whether the cloud numbers this differently could not be confirmed from a second source, so the mapping for `7` was not touched. Changing it on a hunch would relabel real open-water swims for everyone.
- **越野跑到底是哪个编号。** 提出这个问题的那份反馈里没有编号信息，而 Gadgetbridge 的 Zepp OS 表里 `7` 确实是公开水域游泳——ZeppBridge 用的正是这个。云端是不是另一套编号，找不到第二个来源能证实，所以 `7` 的映射一个字都没改。凭感觉改它，会把所有人真正的公开水域游泳记录一起改错。
- **`deviceType` numbers, and the low `deviceSource` band.** In the feedback data, `deviceType:0` alone was assigned to twenty different models, and `deviceSource:102` to four. Writing either into the catalog as a one-to-one mapping would misidentify watches on purpose. One genuine tie (`10813699`, Active MAX vs Active 2 44mm, two reports each) was also left out — a tie is not evidence.
- **`deviceType` 这类数字，以及低位段的 `deviceSource`。** 在反馈数据里，光 `deviceType:0` 一个值就被指认成二十款不同的表，`deviceSource:102` 是四款。把它们当成一对一映射写进目录，等于主动制造误判。还有一个真正的平票也没写（`10813699`，Active MAX 与 Active 2 44mm 各两份）——平票不是证据。

### Not verified on real accounts / 未在真实账号上验证

Xiaomi-account sign-in, Google sign-in and Google passkeys could not be reproduced or re-tested here: the only account available for development is a mainland-China account, verified through email + password and the WeChat QR code. The region fix above is covered by tests that feed the selection synthetic answers, and the stalled-sign-in hint is a pure function with its own tests — but neither has been through a real Google or Xiaomi sign-in. If you reported one of these, a re-test on this build is what would close it.

小米账号登录、Google 登录和 Google 通行密钥在这里无法复现，也无法复测：开发用的只有一个中国大陆账号，验证过的路径是邮箱+密码和微信扫码。上面的区域修复由喂给选择逻辑合成结果的测试覆盖，卡住提示是一个带测试的纯函数——但两者都没有走过真实的 Google 或小米登录。如果这几条是你报的，在这一版上复测一次才能真正闭环。

## 1.1.5

Sign-in could not be completed at all on 1.1.4. This release is only about that.

1.1.4 上根本登录不进去。这一版只做这一件事。

### Fixes / 修复

- **The sign-in window no longer navigates away while you are signing in.** After 40 seconds the login window switched itself to Zepp's privacy page — the one offering *clear data* and *delete account* — no matter what you were doing. Typing an email and password, waiting for a Xiaomi one-time code to arrive by mail, or completing a Google sign-in all take longer than that, so the page was replaced mid-flow and the attempt had to be started over. The switch now happens only when the window is still on the page ZeppBridge opened and nothing has been typed or clicked in it for 90 seconds, which is the case it was written for: a primary page that never rendered.
- **登录窗口不会再在你登录到一半时自己跳走。** 之前无论你在做什么，40 秒一到，登录窗口就会跳到 Zepp 的隐私页——就是那个只有「清除数据」「注销账号」的页面。输邮箱密码、等小米发到邮箱的验证码、走完 Google 授权，本来都不止 40 秒，于是页面在流程中间被换掉，整次登录只能从头再来。现在只有当窗口还停在应用打开的那一页、并且 90 秒内没有任何输入或点击时才会跳转——那才是这条兜底当初要处理的情况：主登录页压根没渲染出来。
- **A dropped network no longer throws away the whole sign-in.** When the region check failed because the network was momentarily unreachable, ZeppBridge closed the sign-in window and gave up. Since each attempt runs in an isolated session, closing that window discarded it — the next try meant retyping the password and waiting for a fresh one-time code. A network failure now keeps the window open and retries in place; only a credential Zepp actually rejected ends the attempt.
- **网络抖一下不再让整次登录作废。** 区域确认因为一时连不上而失败时，ZeppBridge 会直接关掉登录窗口放弃。而每次连接用的是隔离会话，窗口一关这个会话就没了——重试意味着重新输密码、重新等一遍验证码。现在网络类失败会保住窗口原地重试，只有 Zepp 真正拒绝了凭据才结束这次尝试。
- **A token that cannot fit the credential store is no longer mistaken for one.** Token candidates were accepted up to 16 KB, six times more than Windows Credential Manager can hold, so an oversized value scraped from page storage was used as the App Token and only failed at save time — reported as an unexplained “could not write to Windows Credential Manager”. Oversized candidates are now rejected up front, which also lets the real bundled token be used instead. When the credential store does refuse a write, the underlying reason is now carried through instead of being discarded.
- **存不进凭据管理器的东西不再被当成令牌。** 令牌候选此前放行到 16 KB，是 Windows 凭据管理器实际容量的六倍：从页面存储里捞到的超长值会被当成 App Token 采用，一路走到保存那步才失败，报出来的却是一句指不到长度的「无法写入 Windows 凭据管理器」。现在超长候选会被提前否掉，真正打包在登录信息里的那个令牌因此有机会被采用；凭据管理器真的拒绝写入时，底层原因也会原样带出来，不再被丢掉。

## 1.1.4

### Fixes / 修复

- **Third-party sign-in no longer reuses another account's WebView session.** Each attempt now starts in an isolated session, reads only cookies that apply to the current login page, prefers the current `userid` / `apptoken` pair, and uses the region host returned by Zepp (`domains`, `cname` or `wf_baseUrl`) before trying fallbacks. This fixes the misleading “credentials were read, but no region accepted them” failure caused by stale or cross-account cookies. Region verification now distinguishes rejected credentials from a network outage, and a terminal failure closes the login window.
- **第三方登录不再复用另一个账号的 WebView 会话。** 每次连接都使用隔离会话，只读取当前登录页适用的 Cookie，优先采用当前 `userid` / `apptoken`，并先使用 Zepp 返回的 `domains`、`cname` 或 `wf_baseUrl` 区域地址，再尝试兜底区域。这修复了旧 Cookie 或跨账号 Cookie 导致的「已读取凭据，但没有区域接受」误报。区域验证也会区分凭据被拒与网络不可达，最终失败后会关闭登录窗口。
- **The native sign-in window title follows the interface language.** English now shows “Sign in to Zepp” instead of the hard-coded Chinese title; OAuth callback URLs exposed to the interface no longer contain query strings or fragments.
- **原生登录窗口标题现在跟随界面语言。** 英文界面显示 “Sign in to Zepp”，不再出现写死的「登录 Zepp」；传给界面的 OAuth 回调地址也不再包含 query 或 fragment。

## 1.1.3

Why "I picked 6 months but only see 30 days" was never a calendar bug.

「我选了 6 个月，却只看到最近 30 天」的真正原因。

### Fixes / 修复

- **A first sync no longer leaves you with 30 days and no way to know it.** Every entry point ran the incremental sync, whose window is hard-coded to 30 days; the 180-day path existed in the backend but no screen ever asked for it. So every new library held exactly one month. The first sync now still fetches 30 days — so there is something on screen in under a minute — and then continues in the background until 180 days are in, with the usual progress and cancel. Later syncs stay incremental.
- **首次同步不再只给 30 天、而且不告诉你。** 所有入口跑的都是增量同步，而它的窗口写死 30 天；后端那条 180 天的路径一直存在，却没有任何一个界面去要它。于是每个新库都正好只有一个月。现在首次同步仍先取 30 天——一分钟内屏幕上就有东西——然后在后台继续补到 180 天，进度和取消照旧。之后的同步仍是增量。
- **The screens now say how far back this machine actually goes.** Training status, body status and the export page each offer "last N days", and every one of them reads the **local** library, not the cloud. With 30 days stored, picking 6 months only stretched the axis and left five months blank — and nothing said why. A notice now states the covered range and offers to backfill, and it says the blank means *not fetched yet*, not *you recorded nothing then*. `zeppbridge status` gained the same three fields.
- **界面现在会说明本机到底有多少历史。** 训练状态、身体状态和导出页都提供「最近 N 天」，而每一个读的都是**本机**库，不是云端。库里只有 30 天时选 6 个月，只会把坐标轴拉长、留下五个月空白——却没有任何一处解释。现在有一条提示写明覆盖范围并给出补拉入口，并且明确空白的含义是**还没取回来**，不是**那段时间你没有记录**。`zeppbridge status` 也补上了同样的三个字段。
- **The history backfill dropdown is no longer blank on a fresh install.** Its options were `[7, 30, 90, 365]` while the backend default is 180 — a value not in the list, so the menu matched nothing and rendered its placeholder. Ranges now come from one shared ladder (`7 / 30 / 90 / 180 / 365`) that the export page and the charts draw from too; the export page previously offered only 7 and 30 days, so asking it for six months meant picking dates by hand.
- **全新安装时「历史补拉范围」下拉不再是空的。** 它的选项是 `[7, 30, 90, 365]`，而后端默认值是 180——不在选项里，于是匹配不到任何一项，只显示占位符。现在范围来自同一条梯子（`7 / 30 / 90 / 180 / 365`），导出页和图表页共用；导出页此前只有 7 天和 30 天，想导半年只能手点日历。

### Added / 新增

- **The Zepp food log is now probed.** Outside mainland China the Zepp app has a Food Log — meals photographed, stored as calories, protein, carbohydrate, fat and fibre. It is served as `eventType=Food` on `/v2/users/me/events`, the same surface ZeppBridge already reads, and it is addressed by event type alone. The capability overview now reports whether this account has one. Nothing is fetched or stored yet: this answers whether a stream is worth building, on real accounts, instead of guessing.
- **新增对 Zepp 饮食记录的能力探测。** 中国大陆以外的 Zepp 应用有「饮食记录」——拍照记录，存成卡路里、蛋白质、碳水、脂肪和膳食纤维。它在 `/v2/users/me/events` 上以 `eventType=Food` 提供，正是 ZeppBridge 已经在读的那个面，并且只用事件类型寻址、没有 subType。能力总览现在会报告这个账号有没有。**暂不抓取、不入库**：这一步只是在真实账号上回答「这条流值不值得做」，而不是靠猜。

### Fixed under the hood / 内部修复

- `fetch_events` 的 `subType` 改为可选，和 `fetch_user_events` 一致。此前它无条件发送 `subType`，探测不带 subType 的流时会被迫编一个 `real_data`——服务端返回空页，读起来和「这个账号真的没有」一模一样。

### Upgrade / 升级说明

- Overlay-install. Local data, backups and settings are untouched. No schema change.
- 覆盖安装即可。本地数据、备份和设置都不会动。数据库结构没有变化。
- After upgrading, the first sync on a **new** install backfills 180 days automatically. An existing library is left alone — use **Backfill more history** on any chart page, or Settings → Export and backfill defaults.
- 升级后，**全新安装**的首次同步会自动补到 180 天。已有的库不会被动：想补历史就用图表页上的「补拉更多历史」，或设置 →「导出与补拉默认值」。

## 1.1.2

Two reported bugs that blocked real use, and the reason English users kept seeing Chinese.

两个卡住真实使用的报告 bug，以及英文界面一直冒中文的根本原因。

### Fixes / 修复

- **A single failed chunk no longer stalls the whole history backfill.** Each round picked the top pending chunk, and a failed chunk stayed at the top — so it was picked again every round until the round's budget ran out, and every other stream and older month was starved. One failing heart-rate month froze the entire backfill ([#10](https://github.com/lingcang728/ZeppBridge/issues/10)). A round now takes its whole work list up front, so each (stream, month) is attempted at most once per round; failures stay retryable next round, and a chunk that keeps failing steps out of the automatic queue instead of blocking everyone.
- **一个失败的块不再卡死整个历史补拉。** 旧版每轮只取排在最前的待办块，而失败的块仍排在最前，于是每轮都再选中它，直到本轮额度耗尽——同月其余的流和所有更早的月份一块都轮不上。一个心率月份失败，整个补拉就不动了（[#10](https://github.com/lingcang728/ZeppBridge/issues/10)）。现在一轮的工作清单一次取齐，每个（数据流，月份）一轮最多尝试一次；失败的块下一轮仍可重试，反复失败的会退出自动队列，不再挡住别人。
- **The backfill ledger now says which month failed and why**, and there is a **Retry failed months** button. Previously it only said "N failed", and the only way to retry was to clear the whole ledger and refetch years of history.
- **补拉账本现在会说明哪个月失败、为什么**，并新增「重试失败项」按钮。旧版只显示「失败 N 块」，想重试就只能清空整个账本、把几年历史重拉一遍。
- **The date picker under Hand to AI → Quick range is no longer cut off by the window edge** ([#9](https://github.com/lingcang728/ZeppBridge/issues/9)). The calendar was pinned to open downwards, so it fell below the bottom of the window and could neither be seen nor scrolled to. It now flips up when there is no room below, stays inside the window horizontally, and closes on Escape or a click outside.
- **「交给 AI → 快捷范围」的日期选择器不再被窗口边缘裁掉**（[#9](https://github.com/lingcang728/ZeppBridge/issues/9)）。日历原本钉死向下展开，会落到窗口下沿之外，既看不见也滚不到。现在下方放不下就向上翻，横向也不会越界，按 Esc 或点击别处即可关闭。
- **Backend errors are no longer shown in Chinese on the English interface.** Every command returned a hard-coded Chinese string and the interface displayed it verbatim, so an English user hit Chinese at every failure. The backend now returns a stable error code and the interface renders its own wording in the current language; 82 codes are covered, and the build fails if a new one lacks either translation. The native tray menu follows the interface language too.
- **英文界面上不再出现后端的中文错误。** 旧版每个命令都返回硬编码中文，界面原样显示，于是英文用户每遇到一次失败就看到一次中文。现在后端只给稳定错误码，界面按当前语言渲染自己的文案；已覆盖 82 个错误码，新增的码缺任一语言就构建失败。原生托盘菜单同样跟随界面语言。
- **Sign-in tells you when it read your credentials and when it did not.** If you were signed in but the credentials could not be read, the app used to poll silently until a 15-minute timeout and then say only "sign-in timed out" — retrying never helped. That is now its own state that points you straight at HAR import or manual entry, and credentials stored in the page's local storage are picked up as well.
- **登录现在会区分「读到凭据」和「没读到」。** 旧版在已登录但读不到凭据时会静默轮询到 15 分钟超时，只说一句「登录超时」——重试多少次都没用。现在这是独立状态，会直接指向 HAR 导入或手动填写；页面把凭据放在 local storage 里的情况也能读到了。

### Docs / 文档

- **The macOS "damaged and can't be opened" message is documented honestly.** The build is unsigned — no Apple Developer ID, no notarisation — and right-click → Open does not fix that particular message; clearing the quarantine flag does. Both messages are now written up separately, and the build is labelled unsigned rather than presented as fixed ([#2](https://github.com/lingcang728/ZeppBridge/issues/2)). Correcting a long-standing misconception: notarisation does not require owning a Mac — CI already runs on macOS runners. What is missing is an Apple Developer Program membership.
- **macOS「已损坏，无法打开」现在写清楚了。** 这是未签名版本——没有 Apple 开发者证书、也没有公证——而「右键打开」对这条提示没用，要清掉隔离标记才行。两种提示分别写明，并标注为未签名版本，不再当作已修复（[#2](https://github.com/lingcang728/ZeppBridge/issues/2)）。顺带更正一个长期误解：公证并不需要有 Mac，CI 已经跑在 macOS runner 上；缺的是 Apple Developer Program 会员。
- **An English connection guide.** The English README linked to a Chinese-only guide at the step where people are most likely to get stuck.
- **英文连接指南。** 英文 README 原本在最容易卡住的一步链到一份纯中文文档。
- Both READMEs gained a platform verification matrix: the features are the same on Windows and Apple Silicon; what differs is who has verified what.
- 两份 README 都加了平台验证矩阵：Windows 和 Apple Silicon 功能一致，区别只在于谁验过什么。

### Upgrade / 升级说明

- Overlay-install. Local data, backups and settings are untouched. The coverage ledger gains an attempt counter (schema 16), migrated automatically with the usual pre-migration backup.
- 覆盖安装即可。本地数据、备份和设置都不会动。覆盖账本新增尝试次数字段（schema 16），升级时自动迁移，迁移前照例自动备份。
- If a previous backfill left failed months behind, open **Long-term archive and full history** and use **Retry failed months** — you do not need to clear the ledger.
- 如果之前的补拉留下了失败的月份，打开「长期归档与完整历史」点「重试失败项」即可，不需要清空账本。

## 1.1.1

Two urgent fixes for the Zepp account sign-in and the English desktop layout.

两个紧急修复：Zepp 账号登录与英文桌面布局。

### Fixes / 修复

- **Xiaomi, WeChat, Google and Facebook sign-in buttons work inside the Zepp login window.** The previous navigation policy allowed only Zepp/Huami domains, so the official page's OAuth form submissions were silently blocked. The login window now allows only the exact provider hosts used by that page, keeps popup-style OAuth in the same cookie session, and still rejects unrelated destinations.
- **小米、微信、Google、Facebook 登录按钮现在可在 Zepp 登录窗口内使用。** 旧版导航策略只允许 Zepp/Huami 域名，官方页面提交到第三方 OAuth 时会被静默拦截。新版只精确放行该页面实际使用的认证主机；即使认证改成弹窗，也会留在同一 Cookie 会话，陌生地址仍会被拒绝。
- **English text in the lower-left cloud and version area no longer runs outside the sidebar.** Long status, account and version text now shrinks and ellipsizes within the available width, including enlarged UI scale.
- **英文界面左下角不再出格。** 云端状态、账号和版本文字会在侧栏可用宽度内收缩并显示省略号，放大界面时也不会撑破容器。

### Upgrade / 升级说明

- Overlay-install from 1.1.0. Local data, backups and settings are untouched. No schema change.
- 从 1.1.0 覆盖安装即可。本地数据、备份和设置都不会动。数据库结构没有变化。

## 1.1.0

The first build an English-speaking user can actually sit down and use. The desktop UI follows the system language (Chinese or English) and has a switch in Settings.

这一版是第一次能给英文用户直接用的正式包。桌面界面跟随系统语言（中/英），设置页可以切换。

### New / 新增

- **English and Chinese UI.** Overview, workouts, sleep, devices, insights, weekly report, export, Hand to AI, settings, health check, backups and history backfill. Dates and numbers follow the interface language. Prompts handed to an AI are translated too — an English user should not get a Chinese prompt that makes the model answer in Chinese.
- **桌面界面中英双语。** 概览、运动、睡眠、设备、洞察、周报、导出、交给 AI、设置、数据健康、快照和历史补拉。日期和数字跟着界面语言走。交给 AI 的提示词也翻译了——英文用户不该拿到一段中文提示词，然后看 AI 用中文回答。
- **Public landing page is bilingual**, with a language toggle. 落地页同样中英双语，有语言开关。
- CI now fails the build if someone hard-codes Chinese into a Vue file. A leftover Chinese string is exactly the kind of bug an English-speaking user cannot report.
  CI 现在会拦住界面里的硬编码中文。漏翻一句，只有看不懂中文的用户会看到它——而他没法告诉你。

### Fixes / 修复

- **"Pending normalisation" counted already-parsed workout details.** A health-page counter that would never go down, and kept suggesting another replay. It now recognises workout-detail output sitting in the sample / route / pause tables.
- **「待归一化」把已经解析好的运动详情也算进去了。** 这个数字永远降不下来，健康页还一直劝你再重放一次。现在会把落在逐点样本 / 轨迹 / 暂停表里的运动详情认回来。
- **Re-identifying a device could show the old model after you had just assigned one.** A request that started before the write could land afterwards and overwrite the screen.
- **刚指认完型号，界面可能又闪回旧的。** 写入前发出去的请求稍后回来，会把屏幕盖回旧数据。

### Still in Chinese / 仍是中文

- CLI and MCP output stays Chinese: the four exits (GUI / CLI / MCP / export) must give the same answer to the same question, so the backend sends codes and the GUI translates. CLI/MCP still print the original Chinese string.
  CLI 和 MCP 的输出仍是中文：四个出口对同一个问题必须给同一份回答，所以后端发码、界面翻译；CLI/MCP 继续打印原来的中文。
- A few failure-path messages from the backend (some errors, disk-estimate stop reasons, snapshot blockers) still arrive as Chinese. They are on exception paths.
  少数异常路径上的后端文案（部分错误、磁盘估算的停止原因、快照拦截原因）仍是中文。

### Upgrade / 升级说明

- Overlay-install from 1.0.x. Local data, backups and settings are untouched. No schema change.
- 从 1.0.x 覆盖安装即可。本地数据、备份和设置都不会动。数据库结构没有变化。

## 1.0.1

修一个只在**从旧版本升级上来**时才会出现的问题。全新安装不受影响。

### 修复

- **升级后第一次启动会弹一行红色警告**：「另一个 ZeppBridge 写入操作正在进行（清理旧数据），请等它结束」。
  三件事叠在一起造成的：
  - 后台压缩历史报文时借用了「清理旧数据」这个名字——它一个字节都没删，这句话本身就不对；
  - 应用启动时会自动同步一次，正好和后台压缩撞上，抢不到写锁就报错。现在它会像遇到数据重建时一样让路，并在稍后自动重试；
  - 本该显示的「正在压缩历史报文」提示条从未出现过——它依赖的通知在界面开始监听之前就发出去了，所以没人收到。现在改成随时可读的状态，不再依赖时机。

  结果：升级后第一次启动看到的是一条正常的进度提示，而不是一行看不懂的红字。

### 其它

- 版本号一致性检查现在也管架构文档开头那句「本文描述 vX.Y.Z 的产品边界」——漏改之后它会变成一句假话。

## 1.0.0

第一个正式版。相比开发期的 0.10.x，这一版的主题是**把界面上说的每一句话都兑现**，并且让长期使用不再越用越沉。

### 修复

- **单条运动交给 AI 时，实际发出去的不止那一条。** 后端把「单条运动」解析成了「这条运动所在的那一天」，于是整天的心率、睡眠、步数都被一起发了出去；而摘要面板的「时间范围」始终显示页面上那两个无关日期。现在单条运动只包含这条运动本身，加上它进行期间的逐点指标；按天记录的数据流会明确标注为「不在此次范围内」，而不是悄悄少给。
- **设备识别错了改不回来。** 用户的型号指认只在「本机完全认不出这台设备」时才生效。一旦目录靠别名匹配上了（哪怕匹配错了），指认会被存进库但永远不显示。现在无论自动识别得出什么，用户的指认一律优先，并如实标注成「你指认的型号」。
- **每台设备都能重新指认。** 以前只有「未识别」的设备才显示手动指认入口，识别成功就没有退路了。现在每台设备都有独立页面，重选和撤销入口始终可用。
- **提交错误报告时没有可写的地方，也没有成功反馈。** 现在可以写一段说明（500 字上限，发送前自动去掉本机路径、邮箱和长串标识），提交成功会显示报告编号和发送了哪些字段。
- **本机没检测到问题时，错误报告根本提交不了。** 用户遇到的问题不一定是「有未识别的设备」。现在可以自己选反馈类型（设备没识别 / 运动没识别 / 数据对不上 / 其它），选了就能提交。
- **不支持洞察的运动会显示一张只会说「暂不支持」的空卡片。** 现在整块不渲染。
- **首页 24 小时心率把长时间没有采样的时段用一条直线连了起来。** 那条线是插值出来的，不是测出来的。现在断档超过 15 分钟就断开。
- **「检查更新」只告诉你有新版本，不告诉你更新了什么。** 现在会弹出完整的更新说明。

### 新增

- **历史原始报文自动压缩。** 云端原始报文是本机库里最占地方的东西（JSON 文本，压缩后通常只剩五分之一）。装上这一版后第一次启动会在后台压缩存量报文并回收磁盘空间，顶部显示进度，完成后自动消失。实测一个 211 MB 的库压缩后为 55 MB。压缩前会逐字校验能否原样还原，对不上的那条跳过不动——原始报文是本地重放的唯一依据。
- **首页四个指标都能点进去看趋势。** 心率、日常活动各有独立页面；睡眠接到已有的睡眠详情；静息心率并入心率页。
- **每台设备有独立页面**，写明型号从哪来（目录精确匹配 / 别名匹配 / 你指认的 / 没匹配到）、固件、最近数据、本机是否有它的数据。
- **首页会提醒未识别的设备**，点一下直接到那台设备的指认页面。
- **设置里新增 MCP 一节**，附一段可直接复制给 AI 的说明，让 AI 按你的机器给出配置步骤。
- **本地周报改成图表**：每个指标显示「本周 vs 你自己此前 28 天」的对比条，并说明颜色含义。证据不足的指标不画图，只报现状。

### 优化

- **切换页面不再每次重查数据库。** 主要页面会被缓存，只在首次进入和同步产生新数据时读库。
- **按天聚合的指标查询快了一个量级。** 给按本地日期过滤的采样查询补了索引可用的时间戳边界，实测心率 7 天查询从 92 ms 降到 5 ms（结果不变）。
- **全应用统一的下拉选择器**，替换了各处的系统原生下拉。
- **「数据健康检查」和「数据库快照」移入「设置 → 高级与维护」**，主导航回到三项。
- **「你的设备能提供什么」改成指示灯板**，三种状态分开显示：已获取 / 云端有但本机未收录 / 暂未获取。
- 设置页与「交给 AI」页重排，去掉了几处大面积留白。
- 二级页面统一有返回入口。
- 周报和身体状态卡片不再为没有数据的指标占位；趋势卡片右上角的数字明确标注为「最新」一次读数。

### 明确不做

- **体重与血压不支持。** 缺少可核对的真实报文样本，贸然解析只会产出没人能验证的数字。
- 不提供整库加密。健康数据以明文 SQLite 保存在程序目录，依赖系统账户与磁盘加密保护——这一点在设置里写明，不假装提供。
