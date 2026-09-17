/**
 * 前后端共用逻辑的一致性检查。
 *
 * 标签清洗和地址校验在前端（表单校验/保存请求/列表刷新）和
 * 后端（保存接口）各有一份实现，这里用同一批输入检查两边输出一致，
 * 防止“改了一边漏掉另一边”。
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const backend = require('../utils/link-utils');

test('标签清洗：前后端对同一批输入结果一致', async () => {
  const frontend = await import('../../frontend/src/utils/link-utils.js');

  const cases = [
    [],
    ['a', 'b'],
    [' a ', '', '  ', 'b '],
    ['a', 'a', 'b', 'a'],
    ['前端', 'Vue', '教程'],
    ['a', null, undefined, 5, {}, 'b'],
    [',', '，'],
    undefined,
    null,
    'a,b',
    5,
  ];

  for (const input of cases) {
    assert.deepEqual(
      backend.normalizeTags(input),
      frontend.parseTags(input),
      `输入 ${JSON.stringify(input)} 的清洗结果两边应一致`
    );
  }
});

test('地址校验：前后端对同一批输入结果一致', async () => {
  const frontend = await import('../../frontend/src/utils/link-utils.js');

  const cases = [
    'https://example.com',
    'http://example.com/path?q=1#hash',
    ' https://example.com ',
    'https://developer.mozilla.org/zh-CN/',
    'example.com',
    'not a url',
    'ftp://example.com',
    'javascript:alert(1)',
    '',
    '   ',
    null,
    undefined,
    5,
  ];

  for (const input of cases) {
    assert.equal(
      backend.isValidUrl(input),
      frontend.isValidUrl(input),
      `输入 ${JSON.stringify(input)} 的校验结果两边应一致`
    );
  }
});
