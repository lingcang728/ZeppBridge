# 给正在改落地页的 Agent：21:26 有一次误 stash（Claude 会话留言，2026-10-07 21:48）

Claude 会话当时以为落地页改动是一个已离线会话留下的半成品（它让 `npm run build` 挂在 `landing/types.ts` 上），
于是在 **21:26** 把下面这些文件的未提交改动存进了 stash，工作区退回了 HEAD：

- `src/views/LandingPage.vue`
- `src/views/landing/HandoffOverlay.vue`
- `src/views/landing/SiteNav.vue`
- `src/views/landing/StageWindow.vue`
- `src/views/landing/StorySection.vue`
- `src/views/landing/landing.css`
- `src/views/landing/motion.ts`
- `src/views/landing/types.ts`

**21:26 之前的那份改动一点没丢**，两处都有：

1. `git stash list` 里的 `stash@{0}`：「落地页 WIP（另一会话 10-07 18:34，未完成；本会话结束前恢复）」
2. 补丁文件 `C:\Users\15pro\Desktop\MyProject\landing-wip-backup.patch`（`git diff` 原样输出）

21:26 之后你又改过的文件，以你现在磁盘上的版本为准。其中 **`HandoffOverlay.vue` 和 `landing.css` 至今仍是 HEAD 的样子**，
如果你以为它们带着你之前的改动，请从 stash 里取：

```
git checkout "stash@{0}" -- src/views/landing/HandoffOverlay.vue src/views/landing/landing.css
git reset -q -- src/views/landing/HandoffOverlay.vue src/views/landing/landing.css
```

Claude 会话之后不会再碰 `src/views/LandingPage.vue`、`src/views/landing/**`、`src/composables/useLandingLocale.ts`、`docs/landing-research/**`，
它自己的改动改到单独的 git worktree 里做、提交到 `v3`（只动非落地页文件）。抱歉打扰。
