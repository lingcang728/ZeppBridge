To all my friends using ZeppBridge,

Hello, it's Lingcang.

This is a big release. Before anything else, I want to thank three contributors: felipepmdias, Jax Tsai and andrejd1.

Thanks to felipepmdias's work decoding Zepp's strength training data, the new version finally shows set-by-set details and a body muscle map, and strength training in ZeppBridge has become genuinely useful. Jax Tsai and andrejd1 helped me improve performance on Linux. I don't have a Linux machine myself, so every one of these improvements was tested bit by bit on their own computers. Without them, there's a lot I simply couldn't have done on my own. Thank you, and thank you as well to every Linux user who kept patiently sending feedback.

In the two weeks without a new release, I received more letters than ever before. Thank you to everyone who wrote to encourage me, to warm my heart, or to share all kinds of wonderful ideas. I have never had so many pen pals.

Some of you said you couldn't find the letter box, so I added a letter button in the top-right corner: tap it to write, press and hold to open the letter box, and a small red dot lights up when there's a new reply. Whenever anything in the app feels off to you, please write and tell me. Don't worry about bothering me. Getting your letters is something that makes me genuinely happy.

Next, I'd like to talk about the three things in this update I care about most. They took up most of my past two weeks, and some of them I thought about for a long time and hesitated over again and again.

**About cloud Personal Agents**

Lately I've been using cloud personal assistants like Muse and Hark. The more I use them, the more I feel they could change the way we live, just as coding agents are changing software development.

Let me share what my past two weeks looked like.

I connected ZeppBridge to my own personal website so that Hark can keep receiving my health data. Every morning after I get up, all I do is open Zepp to sync last night's sleep. By the time I've brushed my teeth and washed my face, Hark has already summed up my sleep quality and recovery and suggested what to train that day.

It's the same on the way home from a run. I sync my data, and I get an analysis of the long run I just finished: whether my heart rate ran too high, whether I slowed down in the second half, whether my cadence changed noticeably. If I want to adjust my training plan further, I can sit down at my computer and talk it through in detail with GPT or Claude using ZeppBridge's "Send to AI".

I could do all of this before, but it always meant remembering to do it, gathering the data myself, and starting a conversation myself. A Personal Agent takes care of the step that's easiest to skip: getting started.

That experience convinced me to bring it to ZeppBridge users. After all, if I love a feature this much myself, why not let everyone try it?

But I also hesitated for a long time. From the very beginning, ZeppBridge has promised to keep local data storage at its core, and letting a cloud assistant read your health data continuously clearly calls for extra care.

So this feature is off by default. Unless you turn it on yourself, ZeppBridge will never use it to push your data to any outside service, and the way you use the app today won't change at all.

Even if you do turn it on, you'll need your own site, an access key you can rotate, and to pair it with your personal assistant. It may not be for everyone, but if you're willing to give it a try, I highly recommend it.

I'm more and more convinced that personal assistants like these, ones that look out for you, understand you, and help at the right moment, will become part of our everyday lives.

**Bringing "Stage Manager" to workout details**

This has bothered me ever since 3.0.0.

I redesigned the cards on almost every screen, yet the workout detail page kept waiting. Long-time users may remember that it had barely changed since 1.0.0: the cards sat in fixed positions at fixed sizes, with no freedom to adjust or combine them.

Then, over these past two weeks, I happened to open Stage Manager while trying out iPadOS 27, and an idea struck me.

To me, the most interesting thing about Stage Manager is that it gives every window a space of its own. You can move it, resize it, and rearrange how it relates to the other windows. So I wondered: why can't ZeppBridge's cards have that same freedom?

Following that idea, I redesigned the whole workout detail page and tried to bring Stage Manager's way of working into it.

Now you can put heart rate, pace and your running route side by side on one screen and analyze your performance moment by moment. You can also pick a moment on a chart and see where you were on the map at that time, to understand how your body's performance relates to your surroundings. For strength training, you can even place the muscle map next to your sets and see at a glance which muscle groups each set worked.

I hope everyone can arrange the data they truly care about in whatever way suits them.

As for all the other fun combinations, I'll leave those for you to discover.

**Polishing the ZeppBridge CLI**

Besides the "Send to AI" you already know, ZeppBridge also has MCP and a CLI built in, so AI tools can access your local data directly, with nothing extra to download or install.

To be honest, this part used to be fairly rough. It was only after the author of SparkyFitness reached out to me recently that I took a serious second look at what it could do.

This time I did two main things.

First, AI can now go from "only looking" to "helping you keep records".

You can now ask an AI connected to ZeppBridge to log injuries, races, shoes and how a workout felt, or to correct a workout type that was recognized wrong. For example, just tell it "my left knee hurt a bit after my run yesterday", and it will write that down for you.

Since letting an AI change your own data might feel a little unsettling, every record the AI writes shows up under "Recent AI changes" in Settings, and you can undo any of them at any time. The AI has no permission to delete data. If you'd rather it only read the data you've picked out, you can turn on "Only shared tasks", which limits it to what you've shared and turns off writing entirely.

On top of that, you can ask the AI to sync your data or export files directly. OpenCode, Grok Build and Factory have also joined the tools you can connect with one click. If a tool you like still isn't supported, please write and let me know.

Second, ZeppBridge can now share data with other self-hosted apps.

SparkyFitness is an open-source, self-hosted health tracking app. Working with them made me realize that ZeppBridge could become a bridge between your Zepp data and other health apps.

For this, I added an always-on mode to the CLI. You can run it on a NAS or a small server at home, and other apps can read your sleep, heart rate, workouts, weight and more from it.

This service is read-only and needs a key to connect, and you can revoke the key at any time. By default it only accepts connections from the same machine, and workout routes are not shared by default. It never starts on its own, so if you don't need it, you can simply ignore it.

The work on the ZeppBridge side is done, but SparkyFitness still needs some time to adapt, so the integration between the two isn't usable yet. Thank you for your patience.

Writing this far, I started wondering again: what will ZeppBridge's future look like?

Maybe what I'm best at is still answering your needs, solving small but real problems, and now and then adding some new animation to make the app a little more fun to use.

But could we go further, and build things we can't even imagine today?

I don't know. For now, at least, I've built many ideas that once only lived in my head into this app. The rest may take some time, and I'd like to keep hearing your stories.

This is ZeppBridge 3.2.0.

Winter is different all over the world. Maybe by the time you read this letter, snow is already falling outside your window.

I grew up in southern China and have hardly ever seen snow. I once saw a photographer's pictures of Aomori in Japan: thick snow covering the houses, and tall walls of snow lining both sides of the road. Winters like that feel very far away to me.

I've never seen a real fireplace either. Sometimes I imagine that one day I'll sit by a warm fireplace, snow swirling outside the window, with all your letters at hand, reading them slowly while watching an agent turn the things I could once only dream about into reality, bit by bit.

Perhaps that is the life I long for.

Wishing you all good health and a happy winter!

— Lingcang
