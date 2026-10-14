/** English P4 copy. Same shape as zh in ../p4Copy.ts; only the strings differ. */
import type { P4Copy } from '../p4Copy';

const pack: P4Copy = {
  chapters: [
    { id: 'motion', name: 'Design', title: 'Love at first sight.', lead: 'Navigation made of glass, cards that morph into pages, and days you deal like playing cards.', points: [
      { id: 'glass', title: 'Glass', text: 'Press and drag slowly across the navigation, then tap to switch. The edges refract and follow your finger.', scene: 'glass' },
      { id: 'morph', title: 'Morph', text: 'A card opens into a page and returns to its place when you go back. One thing in focus, everything else recedes.', scene: 'morph' },
      { id: 'poker', title: 'Card table', text: 'Flip through day cards, then fan out a whole month and week. Keep the good ones in the collection box.', scene: 'poker' },
      { id: 'theme', title: 'Day and night', text: 'Dark and light themes. One tap and it is night.', scene: 'theme' },
    ] },
    { id: 'connection', name: 'Connect', title: 'Your records, back from the cloud.', lead: 'Connect your Zepp account and your records sync to this computer. Pick a frequency, then let automatic sync take over.', points: [
      { id: 'account', title: 'Official sign-in', text: 'Sign in to Zepp in your system browser. Third-party accounts work too. Check the authorization status any time.', scene: 'account' },
      { id: 'sync', title: 'Automatic sync', text: 'Off, 15, 30 or 60 minutes. You sleep, it syncs.', scene: 'sync' },
      { id: 'devices', title: 'Knows your watch', text: 'Models are recognized automatically. If one is wrong, point out the right one.', scene: 'devices' },
      { id: 'local', title: 'Stays on this computer', text: 'Health records synced from Zepp are stored on this computer and never pass through our servers. You choose what goes to AI.', scene: 'local' },
    ] },
    { id: 'records', name: 'Understand', title: 'Dozens of metrics at a glance.', lead: 'Every trend on one page, so you can see how your body is doing. Open a metric to read the full record.', points: [
      { id: 'overview', title: 'Your order', text: 'Sleep or training first: the home page follows what you care about. Scroll, then open the details.', scene: 'overview' },
      { id: 'hourly', title: 'Hour by hour', text: 'Steps, distance and calories for every hour of the day.', scene: 'hourly' },
      { id: 'workouts', title: 'Every run has an echo', text: 'Compare with your own workouts of a similar distance, then look at heart rate, pace and the route.', scene: 'workouts' },
      { id: 'gaps', title: 'Nothing made up', text: 'If it was not measured, it stays blank. No zeros, no previous values, no estimates.', scene: 'gaps' },
    ] },
    { id: 'ai', name: 'Send to AI', title: 'Use the subscription you already have.', lead: 'Pick the days and your records become one file. Hand it to the AI you already use, keep talking, then bring the draft back.', points: [
      { id: 'providers', title: 'Seven to choose from', text: 'ChatGPT, Claude, Gemini, Kimi, DeepSeek, Doubao and Grok. Your existing account and quota.', scene: 'ai' },
      { id: 'prompt', title: 'Ask what you want', text: 'Edit the preset question or write your own.', scene: 'prompt' },
      { id: 'events', title: 'Context matters', text: 'Note a cold, a trip or a business week so the AI knows a little more about the ups and downs.', scene: 'events' },
      { id: 'autopaste', title: 'Fully automatic · Windows', text: 'When on, it pastes and sends for you, checking the page before each step. Off by default.', scene: 'autopaste' },
    ] },
    { id: 'ai-plan', name: 'Training plan', title: 'Finish it on the computer. Train with it on your wrist.', lead: 'Tell the AI how you feel and it plans the week. Paste it back, adjust until it fits, then send it to your watch.', points: [
      { id: 'receive', title: 'Paste it back', text: 'From conversation to draft: copy it back and you have a week plan.', scene: 'receive' },
      { id: 'edit', title: 'Your plan', text: 'Drag to swap two days, open any day and change each step’s duration and intensity. Hover for details.', scene: 'plan-edit' },
      { id: 'templates', title: 'Templates and import', text: 'Save it as a template for next time. Import .zwo and workout .fit files too.', scene: 'templates' },
      { id: 'easy', title: 'Tired today', text: 'When intervals are planned and readiness is below your usual, swap to an easy session in one tap. You confirm before it is sent.', scene: 'easy' },
    ] },
  ],
  records: {
    sleep: { title: 'Sleep', text: 'From one night’s stages to the last seven days. Open it and scroll down.' },
    workouts: { title: 'Workouts', text: 'See the whole session, and how it differs from the ones before.' },
  },
  settings: {
    title: 'Settings',
    lead: 'Flip through the large cards one by one; the small ones stack into a wallet. Account, sync, display and data are a tap away.',
    summaryTitle: 'The details live in Settings.',
    summaryLead: 'Fourteen everyday settings, kept in one card stack.',
    items: [
      { id: 'sync', title: 'Automatic sync', text: 'Off, 15, 30 or 60 minutes. Pick one.', icon: 'auto-sync' },
      { id: 'retention', title: 'How long to keep', text: 'History available in the cloud comes to this computer. You decide how long it stays.', icon: 'database' },
      { id: 'data', title: 'Data coverage', text: 'What can be synced and what cannot, at a glance.', icon: 'overview' },
      { id: 'mcp', title: 'MCP', text: 'Local tools such as Claude Code and Codex can ask directly. Sending plans needs separate permission.', icon: 'structured-data' },
      { id: 'formats', title: 'Four formats', text: 'JSON · CSV · GPX, plus FIT on the workout page.', icon: 'document' },
      { id: 'units', title: 'Units', text: 'Kilometers or miles. Distance and pace switch together.', icon: 'settings' },
      { id: 'time', title: 'Time', text: 'Follow your region, or pick 12 or 24 hours.', icon: 'auto-sync' },
      { id: 'date', title: 'Date format', text: 'Day, month and year in the order you are used to.', icon: 'document' },
      { id: 'scale', title: 'Interface scale', text: 'Make the whole window larger or smaller.', icon: 'overview' },
      { id: 'backup', title: 'Snapshots and restore', text: 'Save database snapshots and restore one when needed.', icon: 'database' },
      { id: 'api', title: 'Local API', text: 'Bound to 127.0.0.1. Read only, token required.', icon: 'structured-data' },
      { id: 'privacy', title: 'Privacy and security', text: 'Credentials are protected by the system. Tokens never go into logs.', icon: 'browser-login' },
      { id: 'filename', title: 'File names', text: 'You decide what the files for AI are called.', icon: 'document' },
      { id: 'folder', title: 'Data folder', text: 'See where data is stored on this computer, then back it up or move it.', icon: 'database' },
    ],
  },
  nav: [
    { label: 'Meet ZeppBridge', links: [{ id: 'motion', label: 'Design' }, { id: 'connection', label: 'Connect' }, { id: 'records', label: 'Understand' }] },
    { label: 'From records to action', links: [{ id: 'ai', label: 'Send to AI' }, { id: 'ai-plan', label: 'Training plan' }, { id: 'record-sleep', label: 'Sleep and workouts' }] },
    { label: 'Your way', links: [{ id: 'connect', label: 'Settings' }, { id: 'set-mcp', label: 'MCP' }, { id: 'set-api', label: 'Local API' }] },
  ],
  demoPrompt: 'I’m busy next Wednesday. Keep one interval session and make the rest easy.',
};

export default pack;
