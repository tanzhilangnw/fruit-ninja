# 水果道场 / Fruit Dojo

水果忍者风格的原创网页版划切游戏。木质道场背景、立体水果、刀光、切半动画、果汁飞溅和连击音效。

## 游玩

电脑按住鼠标左键划切，手机用手指滑动。经典模式三次漏切或切中炸弹后结束；限时模式持续 60 秒，炸弹扣 10 分。一刀切中至少 3 个水果可获得连击奖励。空格或 Esc 暂停。最高分保存在当前浏览器。

## 本地运行

在项目目录运行 `python -m http.server 8765`，然后打开 http://localhost:8765/。也可以直接打开 index.html。

## GitHub Pages

使用仓库 Settings → Pages → Deploy from a branch，选择 `main` 和 `/ (root)`。网站无需安装依赖或构建。

## 跨电脑同步

首次在另一台电脑运行 `git clone https://github.com/tanzhilangnw/fruit-ninja.git`。后续修改前先 `git pull`；完成修改后提交并推送。游戏美术为原创生成素材，未使用原作资源。
