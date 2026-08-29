import { defineConfig } from 'vitest/config';

/*
 * 只跑纯函数层：`src/lib/` 里的格式化、序列整形、运动可见性和导出范围。
 *
 * 刻意不去做组件快照。快照对这个项目的价值很低——它会在每次调样式时红掉，
 * 于是被习惯性 `-u` 掉，最后既挡不住回归也没人再看。真正值得钉住的是
 * 「缺失值不能变成 0」「时长为负要拒绝」这类会直接骗到用户的规则。
 */
export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
    // 时间格式化用 Intl 且带时区语义，固定时区才谈得上可重复。
    env: { TZ: 'Asia/Shanghai' },
  },
});
