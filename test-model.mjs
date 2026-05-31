
import { getModel } from './server/src/models.ts';

const model = getModel('deepseek-v4-pro-260425');
if (!model) {
  console.log('❌ 模型配置不存在');
  process.exit(1);
}

console.log('✅ 模型配置加载成功');

try {
  const res = await fetch(`${model.baseURL}${model.apiPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${model.apiKey}`
    },
    body: JSON.stringify({
      model: model.modelName,
      messages: [{role: 'user', content: '你好，请只返回"测试成功"三个字'}],
      max_tokens: 10,
      temperature: 0
    })
  });

  if (res.ok) {
    const data = await res.json();
    console.log(`✅ 请求成功，返回内容：${data.choices[0].message.content.trim()}`);
  } else {
    const err = await res.text();
    console.log(`❌ 请求失败，状态码：${res.status}\n错误信息：${err.slice(0, 500)}`);
  }
} catch (e) {
  console.log(`❌ 请求异常：${e.message}`);
}

