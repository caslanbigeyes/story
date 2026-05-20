可以。OpenRouter 接免费模型，本质就三步：

```text
注册 OpenRouter
→ 创建 API Key
→ 用 OpenAI 兼容接口调用 :free 模型
```

OpenRouter 官方是 **OpenAI API 兼容** 的，核心就是把 `base_url` 改成：

```text
https://openrouter.ai/api/v1
```

然后模型名填免费模型，比如：

```text
openrouter/free
deepseek/deepseek-r1:free
qwen/qwen3-coder:free
z-ai/glm-4.5-air:free
```

`openrouter/free` 是官方提供的免费模型路由器，会自动从可用免费模型里选择；`:free` 后缀一般表示该模型的免费版本。OpenRouter 官方免费模型页目前显示有 25+ 免费模型，但免费模型会变化，最好以模型列表为准。([OpenRouter][1])

---

## 一、先拿 API Key

去 OpenRouter 创建 API Key。

然后本地设置环境变量：

```bash
export OPENROUTER_API_KEY="你的_api_key"
```

Windows PowerShell：

```powershell
$env:OPENROUTER_API_KEY="你的_api_key"
```

OpenRouter 官方要求用 `Authorization: Bearer <你的 Key>` 方式鉴权。([OpenRouter][2])

---

## 二、Python 调用方式

先安装：

```bash
pip install openai
```

然后写：

```python
from openai import OpenAI
import os

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY"),
)

response = client.chat.completions.create(
    model="openrouter/free",
    messages=[
        {"role": "user", "content": "你好，介绍一下你自己"}
    ],
)

print(response.choices[0].message.content)
```

也可以指定某个免费模型：

```python
response = client.chat.completions.create(
    model="deepseek/deepseek-r1:free",
    messages=[
        {"role": "user", "content": "帮我写一个 Tauri 远程桌面应用的技术方案"}
    ],
)
```

OpenRouter 的返回格式会标准化成 OpenAI Chat API 风格，所以 `choices[0].message.content` 这种写法可以直接用。([OpenRouter][3])

---

## 三、Node.js / TypeScript 调用方式

安装：

```bash
npm install openai
```

代码：

```ts
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

async function main() {
  const completion = await client.chat.completions.create({
    model: "openrouter/free",
    messages: [
      {
        role: "user",
        content: "用中文解释一下 vibecoding 怎么变现",
      },
    ],
  });

  console.log(completion.choices[0].message.content);
}

main();
```

指定免费模型：

```ts
const completion = await client.chat.completions.create({
  model: "qwen/qwen3-coder:free",
  messages: [
    {
      role: "user",
      content: "写一个 Next.js 登录页组件",
    },
  ],
});
```

---

## 四、curl 测试

```bash
curl https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openrouter/free",
    "messages": [
      {
        "role": "user",
        "content": "你好，用一句话介绍 OpenRouter"
      }
    ]
  }'
```

---

## 五、怎么查有哪些免费模型？

你可以打开 OpenRouter 的免费模型集合页，也可以用 API 查模型列表。官方提供 `/api/v1/models` 接口。([OpenRouter][4])

```bash
curl https://openrouter.ai/api/v1/models \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

一般你重点看模型 ID 里带：

```text
:free
```

或者直接用：

```text
openrouter/free
```

---

## 六、接入到 Cursor / Cline / Cherry Studio / OpenWebUI

只要这个工具支持 OpenAI Compatible API，一般这样填：

```text
API Key:
你的 OpenRouter API Key

Base URL:
https://openrouter.ai/api/v1

Model:
openrouter/free
```

或者：

```text
deepseek/deepseek-r1:free
qwen/qwen3-coder:free
z-ai/glm-4.5-air:free
```

---

## 七、要注意

免费模型适合：

```text
测试
原型开发
个人工具
低频调用
模型对比
```

不太适合直接做高并发商业产品，因为免费模型通常会有请求频率、每日额度、排队、速度波动等限制。OpenRouter 官方也说明免费模型容量会持续扩展，但不能保证永久不变。([OpenRouter][4])

最简单的接入方式就是先用：

```text
model = "openrouter/free"
```

跑通后，再换成具体的 `:free` 模型做对比。
